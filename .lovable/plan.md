## Problema

O botão "Zerar conversa" funcionou (recriou o customer, disparou re-welcome), mas o bot ficou mudo porque `ai_agent_config.enabled=false` para o consultor. O webhook bloqueia tudo em `global-off-silent`, exceto leads em passo de captura ativo — e o reset zera `conversation_step` para `NULL`.

Confirmado no log do whapi-webhook (13:04, customer `ffe8d965...`): `🛑 [global-off-silent] IA manual — inbound texto/áudio salvo sem resposta`.

## Solução: bypass por lead

Adicionar uma flag no customer que força o bot a responder mesmo com a IA global desligada, ativada automaticamente pelo botão Zerar.  
  
E COLOCAR UM BOTAO DE IA LIGADA PARA LEAD UNICO LIGADA E DESLIGADA, ASSIM FICA ALGUNS NO INDIVIDUAL NAO APENAS GLOBAL, TODOS OS LEAD QUANDO ENTRAR NA MSG TEM UM BOTAO NO TOPO DE LIGAR E DESLIGAR IA QUE SERIA BOT AUTOMATICO

&nbsp;

### Mudanças

1. **Migration** — adicionar coluna em `customers`:
  - `force_bot_active boolean default false`
  - Sem índice (uso pontual).
2. `**reset_lead_conversation` (RPC)** — ao final do reset, setar `force_bot_active=true` no customer recriado/atualizado. Assim qualquer lead zerado volta a receber resposta do bot.
3. `**supabase/functions/whapi-webhook/index.ts**` — no gate `global-off-silent` (linha ~737):
  - Carregar `force_bot_active` no SELECT do customer.
  - Tratar `force_bot_active === true` como bypass: pula o `return` silencioso e segue o fluxo normal.
  - Log: `✅ [force-bot-active] lead zerado recentemente — bot responde mesmo com IA global off`.
4. `**supabase/functions/evolution-webhook/index.ts**` — espelhar o mesmo bypass na checagem equivalente (linha ~176 e ~694) para manter paridade.
5. **Toast no frontend (`resetConversation.ts` consumidor)** — quando reset tem sucesso e `ai_agent_config.enabled=false`, mostrar info: *"Lead zerado. Bot vai responder só para este número (IA global continua desligada)."* Não-bloqueante.

### Quando a flag é limpa

`force_bot_active` volta a `false` automaticamente quando:

- O lead é assumido por humano (`assigned_human_id` setado) — trigger ou no `customer-takeover` edge.
- O lead converte (`conversation_step` entra em `finalizando`/`portal_submitting` com sucesso).

Para a primeira entrega, basta limpar no `customer-takeover` (uma linha). Conversão pode ficar para depois — não causa problema.

## Arquivos tocados

- `supabase/migrations/<novo>.sql` — coluna + atualização da função `reset_lead_conversation`.
- `supabase/functions/whapi-webhook/index.ts` — select + bypass.
- `supabase/functions/evolution-webhook/index.ts` — mesmo bypass.
- `supabase/functions/customer-takeover/index.ts` — limpar flag ao assumir.
- `src/services/resetConversation.ts` consumidores (Kanban/Chat) — toast informativo (vou identificar os call sites no build).
- `mem/whatsapp/human-takeover-silence.md` — nota sobre a exceção `force_bot_active`.

## Não toca

- `ai_agent_config.enabled` global continua off (sua decisão de produto).
- Outros leads silenciosos continuam silenciosos.
- Engine v3, A/B/C, OCR, re-welcome — sem alteração.