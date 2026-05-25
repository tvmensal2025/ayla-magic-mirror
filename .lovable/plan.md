Diagnóstico encontrado:

- O número analisado é `5511971254913`.
- O lead de teste real está em `flow_variant = D` e `conversation_step = flow:aee7b26c...`.
- Ao clicar em `Quero simular`, os logs mostram que o webhook recebe `ButtonsV3:simular`, mas em seguida envia novamente o passo `d_welcome`.
- A causa provável é a regra de re-welcome por inatividade: como o último outbound registrado para esse customer era antigo, o clique curto `Quero simular` entra na regra `shortMsg` e zera `conversation_step` antes do roteamento do botão.
- Além disso, os envios com botões não estão aparecendo no histórico `conversations`, porque a tabela ainda aceita apenas `message_type` `text` ou `image`, enquanto o código tenta inserir `buttons`. Isso deixa o cálculo de “último outbound” desatualizado e faz o re-welcome disparar de novo.

Plano de correção:

1. Ajustar o re-welcome no `whapi-webhook`
   - Não aplicar re-welcome quando a entrada for clique de botão (`isButton/buttonId`).
   - Preservar a lógica para mensagens reais de saudação após inatividade, como `oi`, `olá`, `começar`.
   - Opcionalmente endurecer `shortMsg` para não tratar qualquer resposta curta como saudação quando o lead já está em um passo de fluxo com botões.

2. Corrigir o log de mensagens com botões
   - Alterar o insert de `sendButtons` para gravar `message_type = text`, ou criar migração para permitir `buttons`.
   - Para menor risco, prefiro gravar como `text`, porque a constraint atual só aceita `text` e `image` e isso mantém compatibilidade com anti-duplicação/re-welcome.
   - Aplicar nos pontos do `whapi-webhook/handlers/conversational/index.ts` onde `message_type: "buttons"` é inserido.

3. Adicionar regressão nos testes
   - Criar/ajustar teste para garantir que clique de botão não dispara re-welcome.
   - Criar/ajustar teste para garantir que botão `simular` no primeiro passo resolve para `d_pedir_conta`.

4. Validar
   - Rodar testes Deno focados em `whapi-webhook` e `_shared/flow-router`.
   - Verificar novamente o customer `5511971254913` e os logs do `whapi-webhook`.
   - Após correção, o esperado é: clicar `Quero simular` deve avançar para `d_pedir_conta` e pedir a conta de luz, sem repetir o welcome.