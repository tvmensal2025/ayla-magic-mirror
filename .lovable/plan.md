## O que muda

Hoje, no painel **Agente IA → Atendimentos** (`LiveConversationsPanel`), quando o lead sai do fluxo ele aparece em "👤 Você está atendendo" com apenas um botão **Devolver para IA**. Isso devolve ele no passo onde travou — e ele cai de novo no mesmo erro.

A proposta é trocar o botão único por um **menu "Devolver para o passo…"** que mostra a lista de passos do fluxo ativo do consultor + passos legacy mais usados, e devolve o lead já posicionado no passo certo.

## Fluxo do usuário

1. Lead trava (ex.: não entendeu uma pergunta) → bot pausa e cai na lista "Você está atendendo".
2. Consultor abre o menu **▾ Devolver para…** no card do lead.
3. Vê os passos do fluxo agrupados:
   - **Pular para:** lista dos passos do `bot_flows` ativo (ícone + título, ex.: "1. Saudação", "2. Pedir valor da conta", "3. Pedir documento"…)
   - **Passos clássicos:** Aguardando valor da conta · Aguardando conta · Aguardando documento · Confirmar dados · Finalizando
   - **Reiniciar do zero** (mantém o reset existente)
4. Clica num passo → `conversation_step` é atualizado, `bot_paused=false`, `assigned_human_id=null`, e o card volta para "🤖 IA atendendo".

## Onde mexer (frontend, sem mudança de schema)

- **`LiveConversationsPanel.tsx`**
  - Trocar o `<Button>Devolver para IA</Button>` por um `DropdownMenu` (já existe no shadcn) com as opções acima.
  - Carregar uma vez (no mount) os passos do fluxo ativo: `bot_flows` (consultant_id=userId, is_active=true) → `bot_flow_steps` (order by position) selecionando `id, step_key, step_type, title, position, icon`.
  - Função `returnToStep(customerId, stepValue)` faz:
    ```
    update customers
      set conversation_step = stepValue,
          bot_paused = false,
          bot_paused_reason = null,
          bot_paused_at = null,
          assigned_human_id = null,
          last_custom_prompt_at = null,        -- libera redispatch imediato
          updated_at = now()
      where id = customerId
    ```
    Para passos do fluxo custom, `stepValue` é o UUID do step (resolver já existente em `whapi-webhook/handlers/bot-flow.ts` aceita UUID). Para passos legacy, é o nome textual (`aguardando_valor_conta`, etc.).
  - Toast: "↩️ Lead devolvido para: {título do passo}".
  - Manter o botão **Assumir** como está.

- **Texto/UX**
  - Label muda para "Devolver para…" (com seta ▾).
  - Item destacado no topo: **"Continuar de onde parou"** (= comportamento atual, mantém `conversation_step` intacto).
  - Item secundário no rodapé do menu: **"🔄 Reiniciar conversa"** chamando o `resetLeadConversation` já existente, com confirm.

## Fora de escopo

- Webhook/edge functions: nenhuma alteração — o resolver de step já avança a partir do `conversation_step` setado (memória: *Custom Flow Step Engine*).
- Schema: nenhuma migration.
- Outras telas (CRM, WhatsApp clients): inalteradas.

## Resultado

O consultor vê numa lista clara todos os passos do fluxo da Camila e devolve o lead exatamente no ponto onde quer — sem o lead "errar de novo" na mesma pergunta.