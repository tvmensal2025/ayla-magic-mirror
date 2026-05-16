Diagnóstico encontrado:

- O botão **Zerar** hoje chama `reset_lead_conversation`, mas a função **não exclui o lead/customer**: ela apaga alguns rastros e depois mantém o registro em `customers` resetado.
- Depois do último teste, o número `5511989000650` já voltou a ter dados novos: `conversation_step`, mensagens, transições e 1 log de mídia. Ou seja: o reset anterior não é “sumir tudo”; ele reinicia e o bot recria rastros na próxima mensagem.
- A trava de mídia está incompleta: atualmente bloqueia principalmente **áudio/vídeo**, não cobre **imagem** em todos os caminhos, e quando a mídia falha o código remove o dedupe, permitindo tentativa/retry de mídia de novo.
- O erro continua vindo do envio de mídia no webhook: áudio `audio/webm` falha na Whapi com 500, e logo depois o fluxo ainda tenta vídeo/imagem no mesmo número.

Plano de correção:

1. Transformar o botão **Zerar** em reset destrutivo real
   - Alterar a função `reset_lead_conversation` para modo “hard reset”.
   - Ao clicar em **Zerar**, apagar todos os rastros ligados ao número/customer:
     - `conversations`
     - `ai_slot_dispatch_log`
     - `customer_memory`
     - `bot_step_transitions`
     - `bot_flow_rule_fires`
     - `whatsapp_message_buffer`
     - `worker_phase_logs`
     - `ai_decisions`
     - `ai_agent_logs`
     - `bot_handoff_alerts`
     - `facebook_capi_events`
     - `scheduled_messages`
     - `crm_auto_message_log`
     - `crm_deals`
     - e por fim o próprio registro em `customers`
   - Resultado esperado: depois de zerar, a busca por esse número não retorna customer nem histórico interno. Se ele mandar mensagem de novo, entra como lead totalmente novo.

2. Corrigir a busca por número no reset
   - Normalizar telefone sempre por dígitos.
   - Aceitar tanto `11989000650` quanto `5511989000650` quanto `5511989000650@s.whatsapp.net`.
   - Evitar que um reset falhe por formato diferente do telefone.

3. Bloquear áudio, vídeo e imagem para o mesmo número
   - Ajustar o dedupe de mídia para incluir `image`, além de `audio` e `video`.
   - Aplicar a trava nos três caminhos existentes:
     - mídia de etapa do fluxo
     - mídia de FAQ/Q&A
     - mídia de regra automática
   - Mudar a regra de falha: se tentou enviar mídia para o número, **não remover o dedupe em caso de erro**, para não ficar tentando novamente e causando loops/500 repetido.

4. Resetar agora os dois números informados
   - Apagar todos os dados internos dos números:
     - `5511989000650`
     - `5511971254913`
   - Confirmar com consulta no banco que os contadores ficaram zerados e que não há mais registros em `customers` para esses números.

5. Validar
   - Conferir logs recentes do `whapi-webhook` depois do reset.
   - Confirmar que, no próximo teste, o bot não dispara novamente áudio/vídeo/imagem repetidos para o mesmo número.

Observação importante:
- O histórico que aparece dentro da lista da Whapi/WhatsApp pode continuar existindo na conta WhatsApp externa, porque isso vem da Whapi. O que será apagado é todo o estado interno do sistema: lead, CRM, memória, logs, mensagens internas e dedupe.