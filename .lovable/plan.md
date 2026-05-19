## Diagnóstico

- O switch `IA ativa para meus leads` já gravou `ai_agent_config.enabled=false` para o consultor atual.
- A maioria dos leads existentes foi pausada, mas ainda apareceu lead novo com `bot_paused=false` e mensagens automáticas enviadas depois do desligamento.
- Causa principal: o webhook `whapi-webhook` não consulta `ai_agent_config.enabled` antes de criar/processar lead novo e antes de rodar o motor de fluxo (`runConversationalFlow`/`runBotFlow`). Então leads futuros ainda entram no fluxo mesmo com a IA desligada.
- Também existem outros disparadores automáticos que precisam respeitar a trava global: `ai-sales-agent`, `ai-agent-router`, `evolution-webhook`, `manual-step-send` quando usado para “devolver/continuar fluxo”, e `crm-auto-progress` para auto-mensagens de Kanban.

## Plano de implementação

1. **Criar uma checagem única de “automação desligada”**
   - Expandir o helper compartilhado de pausa para consultar `ai_agent_config.enabled` por `consultant_id`.
   - Regra: se `enabled=false`, nenhum motor automático envia mensagem, mesmo se o lead ainda estiver com `bot_paused=false`.
   - Manter `bot_paused=true`, `assigned_human_id` e `bot_paused_until` como bloqueios absolutos.

2. **Blindar o `whapi-webhook` para leads atuais e futuros**
   - Após identificar/criar o customer e antes de handoff, transcrição, lock e fluxo, consultar a trava global.
   - Se a IA estiver desligada:
     - registrar apenas a mensagem inbound;
     - marcar o customer como `bot_paused=true`, `bot_paused_reason='manual_global_pause'`, `assigned_human_id=consultant_id`;
     - retornar sem enviar texto, áudio, vídeo, botão ou passo de fluxo.
   - Isso cobre leads novos que chegarem depois do desligamento.

3. **Blindar os outros motores automáticos**
   - `evolution-webhook`: aplicar a mesma regra antes de `ai-agent-router` e antes de `runBotFlow/runConversationalFlow`.
   - `ai-sales-agent`: incluir `enabled` na config carregada e abortar se estiver desativada.
   - `ai-agent-router`: além de `bot_paused`, também bloquear se `assigned_human_id` existir ou se `ai_agent_config.enabled=false`.
   - `crm-auto-progress`: continuar movendo estágio se necessário, mas não enviar auto-mensagem quando a IA global do consultor estiver desligada ou o customer estiver pausado.

4. **Ajustar botões de pausa para todos os leads**
   - No switch e no botão “Parar IA de todos os meus leads”, atualizar todos os leads do consultor, não só os que estão com `bot_paused=false/null`.
   - Garantir que a tela recarregue após pausar/religar e que o texto deixe claro: desligado bloqueia leads atuais e futuros.

5. **Executar backfill imediato no banco**
   - Aplicar update nos leads do consultor atual que ainda estejam sem pausa (`bot_paused=false/null`) para `manual_global_pause`.
   - Confirmar por consulta que não restou nenhum lead ativo sem pausa enquanto `enabled=false`.

6. **Validação**
   - Consultar o banco para confirmar `ai_agent_config.enabled=false` e zero leads ativos para o consultor atual.
   - Revisar logs/fluxo dos webhooks para confirmar que chamadas futuras retornam “global disabled” sem envio.
   - Garantir que “Devolver para…” e “Enviar passo” continuem funcionando apenas como ação manual explícita; automação contínua só volta quando o switch for religado.