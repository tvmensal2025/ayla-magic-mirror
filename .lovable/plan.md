## Problema

Você quer apertar **Zerar** na conversa do lead e o sistema voltar ao estado de "número nunca atendido" — para testar o fluxo do zero quantas vezes precisar.

Hoje o RPC `reset_lead_conversation` limpa parte das tabelas, mas **deixa lixo** em várias outras que travam o fluxo no segundo teste:

- `customer_memory` / `customer_memory_active` — a IA "lembra" do lead antigo
- `ai_decisions`, `ai_agent_logs` — histórico de decisões da IA
- `whatsapp_message_buffer` — buffer pendente
- `worker_phase_logs`, `bot_flow_rule_fires`, `bot_handoff_alerts`
- `crm_deals` — o deal continua no estágio antigo (não volta para `novo_lead`)
- `facebook_capi_events` — eventos de conversão já disparados

E o comentário do `resetConversation.ts` promete que tudo isso é limpo, mas o RPC não cumpre.

## Solução

### 1. Reescrever `reset_lead_conversation` (migration)

Limpar TUDO ligado ao `customer_id` e ao telefone:

```text
DELETE em:
  conversations
  ai_slot_dispatch_log
  ai_decisions
  ai_agent_logs
  bot_step_transitions
  bot_flow_rule_fires
  bot_handoff_alerts
  customer_memory
  whatsapp_message_buffer
  worker_phase_logs
  facebook_capi_events
  scheduled_messages         (por remote_jid)
  crm_auto_message_log       (por remote_jid)

UPDATE crm_deals:
  stage = 'novo_lead', status = 'open', valor = NULL,
  closed_at = NULL, lost_reason = NULL
  WHERE customer_id = v_customer_id

UPDATE customers:
  chat_cleared_at = now()
  + reset de todos os campos coletados (já existente no RPC atual)
```

A view `customer_memory_active` é uma view sobre `customer_memory`, então limpa junto.

### 2. Botão "Zerar" no `ChatView.tsx`

Já chama `resetLeadConversation` + `refetch()`. Não muda nada na UI.

### 3. Resultado esperado

Depois de clicar **Zerar**:
- Painel some todas as bolhas antigas (cut-point `chat_cleared_at` já implementado)
- Customer volta a `conversation_step = NULL`, nome/CPF/conta zerados
- Deal volta para `novo_lead`
- IA não lembra de nada (`customer_memory` vazio)
- Buffer e agendamentos limpos
- Próxima mensagem do mesmo número entra como lead 100% novo

⚠️ **No celular do cliente** as mensagens antigas continuam visíveis — Meta não permite apagar histórico do destinatário. Só o seu painel zera.

## Arquivos alterados

- `supabase/migrations/<novo>.sql` — substitui função `reset_lead_conversation`
- Nada no frontend (já está pronto)
