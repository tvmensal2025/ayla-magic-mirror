## Objetivo
Resetar os leads dos números `11971254913` e `11989000650` para limpar histórico, memória, logs e estado do bot, permitindo testar o fluxo da Camila do zero.

## O que encontrei
- `11971254913` existe como `5511971254913`, customer `b2fcd7ca-0c82-4644-be9e-3abe3cf5d308`.
- `11989000650` existe como `5511989000650`, customer `06a07311-6a57-4c2b-8e53-85a4daf9b1a8`.
- Ambos pertencem ao consultor `0c2711ad-4836-41e6-afba-edd94f698ae3`.
- Os dois ainda têm `conversation_step` em passos de fluxo, então realmente não estão zerados.

## Plano de execução
1. Executar o reset usando a RPC existente `reset_lead_conversation` para cada customer encontrado.
2. Confirmar no banco que os campos de estado foram limpos, principalmente:
   - `conversation_step`
   - `bot_paused`
   - `last_bot_interaction_at`
   - memória/logs relacionados ao fluxo
3. Consultar as conversas recentes dos dois leads para confirmar que o histórico anterior foi removido.
4. Após o reset, testar o início do fluxo enviando uma mensagem simulada ou orientar o teste real no WhatsApp.

## Observação
Como estamos em modo de planejamento, ainda não executei nenhuma alteração de dados. Ao aprovar este plano, faço o reset imediatamente.