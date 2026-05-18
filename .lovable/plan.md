## Diagnóstico

Olhando as `bot_step_transitions` do lead 92433086 (consultor 0c2711ad), o bot registrou:

- pos 2 → pos 4 (pulou 3)
- pos 4 → pos 7 (pulou 5 e 6)

### Por que o passo 5 foi pulado

O passo 5 ("Valor da conta") está configurado assim no fluxo:

- `step_type: message`
- `message_text: ""` (vazio — só envia mídia/áudio anexado)
- `transitions: [{ trigger_intent: "default", trigger_phrases: [] }]` apontando direto para o passo 6

O resolver custom em `bot-flow.ts` (linhas 2171-2198) tem um loop de **chain automático** que diz: "se o próximo passo é `message` e tem uma transição `default` sem `trigger_phrases`, dispara ele e avança de novo, até 8 hops, com 1.5s de delay entre cada".

Resultado: quando o cliente responde no passo 4, o bot:
1. Dispara o passo 5 (que não tem texto, só áudio/mídia anexada — e se o slot estiver vazio, o cliente nem percebe que algo foi enviado)
2. Como o passo 5 é `message` + default-only, **chain continua** sem esperar resposta
3. Dispara o passo 6 ("posso estar explicando?")
4. O passo 6 tem transição `afirmacao` (com phrases), não `default` → chain para aqui

A transição gravada (4→7) sugere que em algum caso o passo 6 também avança via fallback `findNextActiveFlowStep`. Mas o problema central é: **o chain trata todo passo `message` com default-only como "auto-avança"**, mesmo quando ele é uma pergunta esperando resposta humana.

### Por que isso vai acontecer com muitos leads

Hoje o motor só "para e espera resposta" quando o passo tem:
- `trigger_phrases` não-vazias (ex.: `afirmacao` com `["sim","ok","pode"]`), OU
- `step_type` ≠ `message` (question / capture_*)

Qualquer passo `message` que o usuário criou com transição `default` simples é considerado mensagem informativa de chain. Isso quebra fluxos onde o consultor quer só uma confirmação livre ("manda a conta de luz", "qual seu valor?", etc.) sem listar todas as variações possíveis.

## Plano

### 1. Mudar a heurística do chain em `bot-flow.ts` (linhas 2171-2198)

O loop só deve fazer auto-advance quando o passo for **claramente informativo**. Critérios para parar o chain (passar a esperar resposta):

- `message_text` (depois de trim) termina com `?` → é uma pergunta
- `message_text` é vazio mas o passo tem **mídia anexada** com kind=`audio` e o áudio é uma pergunta (heurística: `transcript` termina com `?`) — opcional, fase 2
- O passo tem `wait_for_reply: true` (nova flag, fase 2)
- **Default seguro**: `message` com `message_text` vazio E sem mídia que pareça pergunta → continua o chain (caso da mídia decorativa)

Implementação mínima (fase 1): no loop de chain, antes do `break` por falta de default, adicionar:

```ts
const txt = String(current.message_text || "").trim();
if (txt.endsWith("?")) break;  // espera resposta
```

E também aplicar a mesma checagem no **passo recém-resolvido** antes de entrar no loop: se o `nextCustom` já termina em `?`, dispara e para (não chain).

### 2. Tratar passo `message` com `message_text` vazio + sem mídia

Hoje pos 5 dispara "nada visível" e ainda assim avança. Mudar `dispatchStepFromFlow`:
- se o passo não tem texto E não tem nenhuma mídia válida vinculada → loga warn e **não conta como dispatch**, mas chain continua (não regride). Isso evita silêncio percebido pelo lead.

### 3. Sanity-check na UI `/admin/fluxos`

Quando o consultor salva um passo `message` cujo texto termina em `?` e a única transição é `default` sem phrases, mostrar aviso:

> "Este passo parece ser uma pergunta. Sem `trigger_phrases`, o bot vai continuar sozinho. Adicione frases-gatilho (sim/não/etc.) ou marque 'Aguardar resposta'."

### 4. Telemetria

Adicionar log estruturado em `bot-flow.ts` quando o chain pula um passo:
```ts
console.log("[chain-skip]", { from: prev.position, to: current.position, reason: "default-no-phrases" });
```
Para conseguir auditar em prod via `edge_function_logs`.

### Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (chain loop + pre-loop check ~linhas 2165-2198)
- `supabase/functions/whapi-webhook/handlers/_shared/dispatch-step-from-flow.ts` (skip vazio sem mídia)
- `src/pages/admin/fluxos/...` componente do editor de passo (aviso na UI)

### Fora de escopo desta correção

- Mudar manualmente o passo 5 do consultor no banco (decisão dele via UI).
- Re-classificação por IA do que é "pergunta vs mensagem" — heurística do `?` resolve 95%.
