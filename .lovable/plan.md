## Diagnóstico do caso Josinete

Pelo histórico do lead `5511971254913`, os dados principais chegaram ao banco, mas o fluxo ficou com cursor incorreto em vários momentos:

- As respostas de texto do lead (`Luciana`, `500`, `Pode sim`, `Vamos`) foram registradas com `conversation_step = finalizando`, não no passo que tinha acabado de ser enviado.
- Isso acontece porque a correção anterior desligou o `continueFlow`, mas o backend `manual-step-send` só atualiza o `conversation_step` quando `continueFlow=true`. Resultado: o clique manual envia a mensagem certa, mas não posiciona o lead naquele passo para a próxima resposta ser capturada.
- O estado `confirmando_dados_doc` também não está na lista de etapas ativas quando a IA global está em modo manual. Por isso o log mostra: `global-off-silent ... step="confirmando_dados_doc"`, salvando a resposta `SIM` sem processar a confirmação do documento.
- A ficha lateral hoje esconde cartões já confirmados (`CaptureDataConfirmCard` retorna `null` quando `confirmedAt` existe), então alguns dados parecem “sumir” mesmo estando salvos.
- Os passos enviados (`sentSteps`) ficam só em estado local do React. Ao trocar/recarregar lead, a UI perde o histórico e não reconstrói os passos já enviados a partir da tabela `conversations`.

## Plano de correção

### 1. Corrigir o cursor no envio manual
Arquivo: `supabase/functions/manual-step-send/index.ts`

- Quando `part: "all"` e `continueFlow: false`, após enviar o conteúdo do tile, atualizar o customer para o passo clicado.
- Para passos `message`, gravar `conversation_step = step.id`.
- Para passos de captura, gravar a chave legacy correta:
  - `capture_conta` → `aguardando_conta`
  - `capture_documento` → `aguardando_doc_auto`
  - `capture_email` → `ask_email`
  - `confirm_phone` → `ask_phone_confirm`
  - `finalizar_cadastro` → `finalizando`
- Não encadear próximos passos. Apenas posicionar o lead para que a próxima resposta entre no lugar certo.
- Retornar no JSON algo como `next_step: <passo_gravado>` para a UI exibir/depurar corretamente.

### 2. Liberar processamento de confirmação de documento no modo manual
Arquivo: `supabase/functions/whapi-webhook/index.ts`

- Incluir `confirmando_dados_doc` em `ACTIVE_CAPTURE_STEPS`.
- Incluir também estados irmãos de documento/titularidade que não devem ser silenciados:
  - `aguardando_doc_frente`
  - `aguardando_doc_verso`
  - `ask_tipo_documento`
  - `confirmar_titularidade`
- Assim, quando o cliente responder `SIM` para documento, o handler de confirmação roda antes de cair no silêncio do modo manual.

### 3. Permitir passos customizados ativos no modo captação manual
Arquivo: `supabase/functions/whapi-webhook/index.ts`

- Se `capture_mode = manual` e o `conversation_step` atual for um UUID/step_key do fluxo customizado, não bloquear em `global-off-silent`.
- Deixar o motor do fluxo processar capturas configuradas no passo, como nome e valor da conta.
- Isso evita que respostas de texto a tiles manuais sejam apenas logadas sem preencher a ficha.

### 4. Manter dados confirmados visíveis na ficha lateral
Arquivo: `src/components/captacao/CaptureDataConfirmCard.tsx`

- Não esconder o cartão quando `confirmedAt` existir.
- Mostrar o cartão em modo somente leitura com badge “Confirmado”.
- Esconder apenas os botões de confirmação quando já estiver confirmado.
- Assim a lateral continua mostrando os dados lidos da conta/documento mesmo depois de confirmados.

### 5. Reconstituir passos enviados ao selecionar o lead
Arquivos: `src/components/captacao/CaptacaoPanel.tsx` e, se necessário, `src/components/captacao/CaptureStepsGrid.tsx`

- Ao selecionar um lead, carregar os outbounds de `conversations` e marcar como enviados os steps que batem com `bot_flow_steps.id` ou `step_key`.
- Atualizar o estado também por Realtime em novos inserts de `conversations` outbound.
- Isso faz os checks dos tiles persistirem depois de troca de lead/reload, em vez de depender só do estado local.

### 6. Verificação

- Reproduzir o fluxo em um lead de teste:
  1. Enviar tile de nome.
  2. Responder com nome.
  3. Confirmar que `customers.name` atualiza e `conversation_step` não fica em `finalizando`.
  4. Enviar tile de valor.
  5. Responder valor.
  6. Confirmar que `electricity_bill_value` aparece na ficha lateral.
  7. Enviar/confirmar documento com `SIM`.
  8. Confirmar que `doc_data_confirmed_at` é preenchido e o cartão permanece visível como confirmado.

## Resultado esperado

- Cada clique manual envia somente um tile, mas deixa o lead posicionado corretamente para a resposta seguinte.
- A ficha lateral passa a preencher e permanecer visível conforme o cliente responde.
- O modo manual não silencia respostas importantes de confirmação.
- O progresso dos passos enviados não se perde ao trocar de lead ou recarregar a tela.