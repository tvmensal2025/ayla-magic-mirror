Diagnóstico: o erro `step_not_found` acontece porque algumas telas ainda chamam `manual-step-send` com um `stepId` que pode ser um `step_key`/valor antigo, ou sem amarrar corretamente ao fluxo/variante ativa. Além disso, o fluxo atual tem posições `2..11`, mas a UI mostra como `1..10`; a navegação precisa ser por `position`, não por IDs fixos.

Plano de correção:

1. Fortalecer o `manual-step-send`
- Se receber `stepId`, tentar primeiro por `id` real.
- Se não achar, tratar o valor recebido como `step_key` também.
- Se ainda não achar, resolver pelo fluxo ativo do consultor + variante do lead e pelo `position`/ordem disponível, em vez de retornar `step_not_found`.
- Garantir que `continueFlow=true` sempre usa o próximo registro ativo por `position` no mesmo `flow_id`.

2. Corrigir os botões que enviam passo
- `LiveConversationsPanel`: no menu “Devolver para…”, enviar o passo como ID real quando existir, mas sem gravar `conversation_step` com valor inválido antes da edge validar.
- `FlowQuickBar`: o botão “Daqui em diante / Seguir” deve chamar `manual-step-send` com `continueFlow: true`, não apenas disparar um passo isolado.
- `ManualStepDialog`: manter “1 a 1” como envio isolado, mas incluir opção clara de “Seguir fluxo” quando o usuário quiser continuar 1→2→3.
- `CaptureDataConfirmCard`: ao confirmar conta/documento, não usar `stepKey: capture_documento/finalizar_cadastro` se esses keys não existem; buscar o próximo passo real por `position` ou por `step_type` no fluxo ativo.

3. Ajustar avanço automático do cliente no webhook
- Quando o cliente responder a um passo custom `message`, o webhook deve avançar para o próximo `bot_flow_steps.position` ativo.
- Para passos com `captures` inline, parar no passo correto e gravar `conversation_step` no ID/key atual até a resposta ser capturada.
- Para `capture_conta`, `capture_documento` e `finalizar_cadastro`, continuar usando os estados legados necessários (`aguardando_conta`, `aguardando_doc_auto`, `finalizando`) para OCR/portal funcionarem.

4. Validar com o fluxo real do Lucas
- Fluxo ativo A do consultor tem 10 passos em posições `2..11`.
- Após clicar “Seguir fluxo” no passo 1, o sistema deve enviar o passo 1, posicionar no próximo passo de captura/resposta e, quando o cliente responder, seguir para o próximo por ordem.
- O erro 404 `step_not_found` deve virar fallback seguro: se o passo escolhido foi removido/trocado, a edge procura o equivalente no fluxo ativo antes de falhar.

Arquivos previstos:
- `supabase/functions/manual-step-send/index.ts`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `src/components/whatsapp/FlowQuickBar.tsx`
- `src/components/admin/AIAgentTab/LiveConversationsPanel.tsx`
- `src/components/admin/AIAgentTab/ManualStepDialog.tsx`
- `src/components/captacao/CaptureDataConfirmCard.tsx`

Sem migração de banco.