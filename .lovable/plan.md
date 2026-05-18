## Verificação em staging

Conferi os logs do `whapi-webhook` no caso mais recente (customer `75f6bd78`, consultor `0c2711ad`, 03:50 UTC):

- Transição gravada: `from_step=3e7fb4cd` (pos 4 — "qual o valor médio…") → `to_step=a71ba814` (alvo do "afirmacao" do pos 6).
- Logs mostram `[conversational] auto-advance por captura` direto pra pos 5, e dali em diante a cascade levou ao pos 7.
- **Nenhum log `[chain-stop]` / `[chain-emit]` aparece**, porque o fluxo na prática NÃO passa pelo resolver custom de `bot-flow.ts` (que recebeu a heurística do "?"). Ele passa por `runConversationalFlow` em `supabase/functions/whapi-webhook/handlers/conversational/index.ts`.
- Resultado: **o passo 5 continua sendo pulado**. A correção anterior só protegeu um caminho do código.

### Por que pula

`goToStep()` (linhas 1297–1430) tem uma "cascade engine" controlada por `wait_for === "none"` em cada passo. A função `cursorCascades(st)` só olha:

```ts
return !caps && st.wait_for === "none";
```

Ou seja: passo `message` sem captura e marcado `wait_for=none` cascateia automaticamente, **independente do texto ser uma pergunta**. O passo 5 do consultor (`message_text=""`, sem mídia visível) cascateia silenciosamente para o passo 6; e o passo 6 (`"posso estar explicando abaixo como funciona?"`) também cascateia se estiver com `wait_for=none`, terminando direto no passo 7.

Além disso, `auto-advance por captura` (linhas 1610–1639) chama `goToStep(nextByConfig, …)` no passo 5 sem checar se o próximo passo é pergunta antes de cascatear.

## Plano

Aplicar a mesma heurística do `?` no `runConversationalFlow`, em três pontos:

### 1. `cursorCascades` (linha ~1360) — parar cascade em perguntas

```ts
const _looksLikeQuestion = (st: DbStep) =>
  String(st?.message_text || "")
    .trim().replace(/[\s\u200B-\u200D\uFEFF]+$/g, "")
    .endsWith("?");

const cursorCascades = (st: DbStep): boolean => {
  const caps = Array.isArray(st.captures) && st.captures.some(c => c?.enabled !== false && c?.field);
  if (caps) return false;
  if (st.wait_for !== "none") return false;
  if (_looksLikeQuestion(st)) return false;
  return true;
};
```

E também checar a heurística no **próximo step** logo após `findCascadeNext` (linhas 1365–1377): se `_looksLikeQuestion(nextStep)`, ainda emite uma vez e para o loop.

### 2. `auto-advance por captura` (linhas 1610–1639) — pré-check

Antes de `goToStep(nextByConfig, …)`, se `_looksLikeQuestion(nextByConfig)`, emite o passo (sem cascade) e para. Garante que se o consultor pôs uma pergunta logo após a captura, ela seja feita e o bot espere resposta.

### 3. Skip silencioso de step vazio sem mídia

Se um step `message` tem `message_text` vazio E `emitStep` retorna `inlineSent=false` (não tem áudio/imagem/vídeo associado), logar `[skip-empty-step]` e marcar o passo como "consumido" sem cascatear adiante — para o lead nunca ficar sem percepção de mensagem.

Implementação: em `goToStep`, se `first.inlineSent === false && !replyText && !cadastroStep`, fixar `cursor=null` para não entrar na cascade — o lead já foi persistido no passo, e a próxima mensagem dele dispara `repeatCurrent`, que vai emitir o conteúdo do passo (incluindo mídia anexada nos slots).

### 4. Telemetria

- `console.log("[cascade-stop] pos=… motivo=pergunta")` quando bloqueado por "?"
- `console.log("[cascade-stop] pos=… motivo=step-vazio")` quando o step não tem nada visível
- Manter o `bot_step_transitions` insert com `intent="cascade-stop"` para auditoria.

### 5. Verificação pós-deploy

1. Deploy do `whapi-webhook`.
2. Resetar lead de teste (customer `75f6bd78` ou criar novo) para o passo 4.
3. Enviar resposta com valor.
4. Conferir em `bot_step_transitions` que aparecem 4→5 e 5→6 separados, e o lead para no passo 6 aguardando resposta.
5. Conferir log `[cascade-stop] pos=6 motivo=pergunta`.
6. Enviar "sim" e confirmar que avança para o passo 7.

### Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (cascade + auto-advance por captura + skip vazio)

### Fora de escopo

- Mudar manualmente `wait_for` do passo 5/6 no banco (decisão do consultor via UI).
- A heurística do bot-flow.ts já está aplicada e não precisa ser revertida.
