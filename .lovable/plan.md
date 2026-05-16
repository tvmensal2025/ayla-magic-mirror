## O que fazer

Adicionar um botão na página **Admin → Fluxo da Camila** (`/admin/fluxos`) que apaga **todos os leads e todas as conversas** do seu consultor. Depois disso, qualquer número que mandar mensagem entra como lead novo e começa do **Passo 1 (Boas-vindas)**, sem o sistema lembrar dele.

## Como vai funcionar

1. Botão vermelho no topo da página, ao lado de "Limpar testes" / "Testar com 1 número":  
   **"🗑️ Apagar TUDO e começar do zero"**
2. Ao clicar, abre uma confirmação dupla (tem que digitar `APAGAR` para liberar) — porque a ação é destrutiva e não tem volta.
3. Chama a função `reset_all_consultant_conversations` do banco, que apaga **apenas** os dados do consultor logado:
   - `customers` (todos os leads dele)
   - `conversations` (mensagens trocadas)
   - `crm_deals` (cards do CRM)
   - `bot_step_transitions`, `bot_flow_rule_fires`, `bot_handoff_alerts`
   - `ai_decisions`, `ai_agent_logs`, `ai_slot_dispatch_log`
   - `customer_memory`, `whatsapp_message_buffer`, `worker_phase_logs`
   - `scheduled_messages` e `crm_auto_message_log` dos números dele
4. Mostra um toast com o resumo: "X leads, Y conversas, Z deals apagados".
5. Não toca em **nenhum outro consultor**, nem nos **passos do fluxo**, nem nas **mídias** — só nos contatos e no histórico.

## Detalhes técnicos

- **Banco**: função `reset_all_consultant_conversations(_consultant_id uuid)` já enviada como migration (segura, valida `auth.uid()` contra `_consultant_id` ou exige `admin`/`super_admin`).
- **Frontend**: nova função `clearAllConversations()` em `src/pages/FluxoCamila.tsx`, novo botão `variant="destructive"` no header dos atalhos, modal de confirmação reutilizando os componentes shadcn já existentes (`AlertDialog`).
- Após sucesso, zera `testCount` e recarrega a página para refletir o estado limpo.

## Por que assim

Você queria testar o fluxo com vários números sem o sistema "lembrar" deles. Apagar o `customer` é o jeito definitivo: na próxima mensagem, o webhook cria um lead novo do zero e o `firstActive` do fluxo começa no Passo 1 (Boas Vindas e Nome).
