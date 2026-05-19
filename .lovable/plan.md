# Auditoria do Fluxo Conversacional — caso Carson Muniz

## Reconstrução do incidente (lead `ea5f32cf…`, Carson, variant A, fluxo `66a19db4…`)

Timeline real (tabela `conversations` + logs `whapi-webhook`):

```text
12:10:26  IN   "Olá, bom dia"            step=33be68c1 (pos 2 - boas vindas)
12:10:31  IN   "Sim, pode continuar"     step=33be68c1
12:10:36  OUT  "Bom dia! Tô aqui 👀..."  ← reentry vazio (errado)
12:10:41  OUT  "Tô aqui 👀..."           ← reentry vazio (errado)
12:16:09  IN   "Imaginei que fosse IA..."
12:16:19  OUT  "Carson, qual o valor médio da sua conta de luz?" (pos 4)
```

Carson **confirmou** ("Sim, pode continuar") e a IA respondeu duas vezes a muleta genérica de reentry, em vez de avançar do passo 2 (boas vindas) → 3 → 4 (pergunta da conta).

## Mapa dos bugs encontrados (em ordem de impacto)

### BUG #1 — Classificador OpenAI sempre falha (`temperature` inválido)
- **Log**: `[classifier] openai failed: Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.`
- **Causa**: `supabase/functions/_shared/openai.ts` linha 36 aplica `temperature: opts.temperature ?? 0.2` sempre. O classificador em `whapi-webhook/handlers/conversational/intent-classifier.ts` chama `openaiChat({ model: "gpt-5-mini", ... })` sem passar `temperature`, e o comentário (linha 89) já reconhece: *"gpt-5-mini rejeita temperature != 1; usar default"*. Default não é aplicado porque o helper força 0.2.
- **Efeito**: 100% das classificações OpenAI falham → cai sempre no Gemini ou em `outro`. Reduz precisão de intenção (`afirmacao` de "Sim, pode continuar" muitas vezes vira `outro`).

### BUG #2 — Cascata para em passos só-mídia já entregues → reentry vazio
- **Logs**: `⏭️ pulando audio já reservado/entregue (media_id=683c…)` → `[cascade-stop] pos=2 step=passo_mp8yc0bp motivo=step-vazio-sem-midia` → `⚠️ reply vazio → reentry em step=…`
- **Causa**: Em `whapi-webhook/handlers/conversational/index.ts` (linhas ~1405-1414) quando o passo atual é `message` sem texto e a mídia já foi reservada (dedup por `media_id`), `emitStep` devolve `replyText=""` e `inlineSent=false`. O guard `firstIsSilentEmpty` desativa a cascata (`cursor = null`) e o `_finalize` cai no reentry "Tô aqui 👀…".
- **Efeito**: Lead trava no passo 2/3 toda vez que reenvia algo (a mídia inicial só sai uma vez por sessão; em qualquer mensagem subsequente o passo é "vazio" e a IA muleta em loop).

### BUG #3 — `fallback goto bloqueado` impede avanço entre passos `message`
- **Log**: `fallback goto bloqueado: step=33be68c1 exige captura antes de 6226f6f3`
- **Causa**: Linhas 1823-1828: o guard `currentStep.captures?.some(enabled) && !hasCapture && nextIsMediaOnly` dispara mesmo quando os captures do passo atual são `kind="text"` opcionais e o próximo passo é mídia. Para passos `message → message` (boas vindas → vídeo) **não** deveria exigir captura.
- **Efeito**: Junto com #2, mata qualquer fallback que tente saltar para o próximo passo `message`.

### BUG #4 — Reentry "Tô aqui 👀..." aplicado em passos sem pergunta
- **Causa**: `_finalize` (linhas 648-672): se o passo atual não tem texto (`_extractTail` retorna vazio), usa a muleta genérica. Faz sentido para perguntas; **não** faz sentido para passos boas-vindas que já cumpriram sua função.
- **Efeito**: Mensagem fora de contexto (Carson cumprimentou + confirmou e recebeu "me conta um pouquinho mais pra eu te ajudar?").

### BUG #5 — Cascata silenciosa não dispara avanço quando intent=`afirmacao`
- **Causa**: O passo 2 só tem transition `default → 6226f6f3`. Não há transição por intent. Quando o classificador devolve `afirmacao` (caso "Sim, pode continuar"), o código procura por `trigger_phrases` primeiro; sem match, deveria usar `default`, mas o caminho de "captura exigida" (#3) bloqueia antes.

## Correções propostas (cirúrgicas, escopo backend do bot)

Arquivo: `supabase/functions/_shared/openai.ts`
1. Quando `model` começar com `gpt-5` (ou contiver `mini`/`-5`), **omitir** `temperature` do payload (default da OpenAI = 1, único valor aceito).

Arquivo: `supabase/functions/whapi-webhook/handlers/conversational/intent-classifier.ts`
2. (Defensivo) passar `temperature: 1` explícito + tratar 400 sem cair em warn ruidoso.

Arquivo: `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
3. **Cascata em passo `message` sem conteúdo emitível**: se `firstIsSilentEmpty` E o passo tem `default goto_step_id`, NÃO setar `cursor=null` — seguir cascateando para o próximo (já que o passo "vazio" foi um marcador / mídia já entregue, não uma pausa real). Hop não conta como envio se nada saiu, mas o lead avança.
4. **Guard `fallback goto bloqueado`**: limitar a `captures` com `field` (campo a ser preenchido) ou `kind !== "optional"`. Passos `message → message` puro nunca devem ser bloqueados por essa heurística.
5. **Reentry contextual**: quando `_extractTail` ficar vazio E o passo atual não exige resposta (`wait_for === "none"` e não tem captura), **não enviar a muleta** — devolver `reply:""` silencioso e deixar o watchdog/próxima inbound seguir. Evita "Tô aqui 👀" após boas-vindas.

Espelhar 3-5 em `supabase/functions/evolution-webhook/handlers/conversational/index.ts` (paridade já documentada em `mem://whatsapp/evolution-parity`).

## Fora de escopo desta correção
- Mudar a estrutura dos 10 passos do fluxo (passos do admin permanecem intocados).
- Mecânica A/B/C de variant.
- LiveConversationsPanel / "Devolver para…" (já refatorado em loops anteriores).

## Validação
- Replay manual via `supabase--curl_edge_functions whapi-webhook` simulando "Sim, pode continuar" no passo 2 → esperar avanço para passo 4 com mensagem `"{nome}, qual o valor médio da sua conta de luz?"`.
- Conferir logs: zero ocorrências de `openai failed: Unsupported value: 'temperature'` e zero `reply vazio → reentry` após confirmação.
- Smoke nos outros leads ativos (apenas 3 candidatos no watchdog) para garantir nenhuma regressão.
