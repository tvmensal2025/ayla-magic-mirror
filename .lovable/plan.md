## Diagnóstico

Comparei o último turno do simulador com o motor de produção:

1. **Sem botões.** `bot_test_outbound` do último run só tem 1 linha `kind:text` — nenhum `kind:buttons`. Causa: o `runConversationalFlow` (`supabase/functions/whapi-webhook/handlers/conversational/index.ts`) é o engine que roda os passos do `/admin/fluxos`. Ele já extrai os botões do step (`extractStepButtons` → `captures._buttons`) **só para fazer match de intent**, mas o `emitStep`/`goToStep` envia apenas `sender.sendText(...)` ou devolve `reply` string para o `whapi-webhook/index.ts`, que também chama `sender.sendText`. **Nenhum `sender.sendButtons` é chamado nesse caminho** — por isso o botão configurado no passo "Boas-vindas com botões" some no WhatsApp real e, por consequência, no simulador.

2. **Negrito/espaços não renderizam.** O bubble do `FlowSimulator.tsx` (linha 207) imprime `{ev.text}` cru. Os `*…*`, `_…_`, `~…~` do WhatsApp aparecem como caracteres literais ("`*Bem-Vindo(a)*`", "`* *`"). O usuário quer ver exatamente como o WhatsApp renderiza.

3. **Nome do representante "vazio".** O webhook real lê `consultants.name` do `settings.superadmin_consultant_id` e usa só o primeiro nome (fallback `"iGreen Energy"`). Na tela 2 já apareceu "Rafael" corretamente — o que o usuário viu como `*  *` é o efeito colateral de (2): quando uma variável fica vazia, sobram dois asteriscos seguidos sem nada entre eles. Corrigindo (1) e (2) o sintoma some, mas também vou garantir que o renderer colapse `* *` órfão (variável vazia) para nada, pra nunca aparecer asterisco solto.

## Mudanças

### 1. `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- Em `emitStep`, depois de resolver `text`/`mediaResult`, se o step tiver `extractStepButtons(st).length > 0` **e** o texto for o último envio do turno (`asReply=true`), chamar `ctx.sender.sendButtons(ctx.remoteJid, text, buttons)` em vez de devolver `replyText`. Registrar em `conversations` como `message_type:"buttons"`. Retornar `{ replyText: "", inlineSent: true }`.
- No caminho cascade (`asReply=false`) manter `sendText` (botão só faz sentido no passo final que aguarda resposta).
- Limpar `__inline_sent: true` no `goToStep` quando os botões saírem inline para o `whapi-webhook/index.ts` não tentar reenviar o texto.

### 2. `supabase/functions/_shared/render-vars.ts` (e `whapi-webhook/handlers/conversational/templates.ts`)
- Após substituir variáveis, rodar uma limpeza extra: regex `\*\s*\*` → "" e `\b__\b` → "" para nunca sobrar negrito vazio quando a variável vier `""`.

### 3. `src/components/admin/flow-builder/FlowSimulator.tsx`
- Criar helper `renderWhatsAppText(text: string)` que mantém `whitespace-pre-wrap` e converte:
  - `*texto*` → `<strong>texto</strong>`
  - `_texto_` → `<em>texto</em>`
  - `~texto~` → `<del>texto</del>`
  - ` ```bloco``` ` e `` `inline` `` → `<code>`
- Substituir `{ev.text}` (e o texto dentro do bloco `buttons`) por `renderWhatsAppText(ev.text)`.
- Manter parsing seguro (escape de HTML antes da substituição) para evitar XSS no sandbox.

### 4. Deploy + verificação
- Deploy de `whapi-webhook`.
- Curl no `flow-simulate-run` com `oi`+`fresh:true`+`variant:"D"` e checar `bot_test_outbound` → esperar 1 linha `kind:buttons` com `{text, buttons:[…3 ids…]}` no JSON.
- No preview: clicar "Zerar" → confirmar bolinha de "Boas-vindas" com **negrito** real e 3 botões clicáveis.

## Fora de escopo
- `bot-flow.ts` (já manda botões corretamente).
- Edição dos templates/textos do `/admin/fluxos`.
- Mudanças no Evolution (mesmo motor, mas envia numérico 1/2/3 — já tratado).
- Migrações de schema.