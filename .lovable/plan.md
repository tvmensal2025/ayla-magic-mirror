## Objetivo

Pular o passo `ask_finalizar` quando o cliente já clicou em um dos botões do complemento (Adicionar / Pular / Não tem). Em vez de pedir "digite 1 para finalizar", já dispara a finalização automaticamente — menos atrito, mais rápido.

## Mudança

Arquivo: `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — case `ask_complement` (linhas ~3695–3732).

Hoje, depois de salvar `address_complement`, o código chama `autoResolveCepIfNeeded` que retorna `ask_finalizar` quando todos os outros campos já estão preenchidos. Então o bot manda "Todos os dados foram preenchidos! Digite 1 ou Finalizar…" e fica esperando.

Vamos fazer: se `next === "ask_finalizar"`, pular direto para `finalizando`. O bloco de auto-finalização logo abaixo no mesmo arquivo (linha ~3971, `if (updates.conversation_step === "finalizando")`) já roda na mesma execução, então o cadastro é submetido sem precisar de input extra do cliente.

Texto enviado ao cliente quando o pulo acontece: algo curto como `✅ Tudo certo! Processando seu cadastro...` (mesma vibe do reply de `finalizando`). Caso `next` seja qualquer outro step (ainda falta CPF, RG, etc.), o comportamento atual é mantido.

## Validação

- Testar no preview: enviar complemento → confirmar que o bot pula `ask_finalizar` e cai direto em `finalizando` / `portal_submitting`.
- Confere que o caso de cliente que digita o complemento (texto) também aproveita o atalho — não só o clique do botão.
- Deploy: `whapi-webhook`.

## Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (apenas o case `ask_complement`)
