## Problema

O botão "Zerar" chama `reset_lead_conversation` (RPC) que **funciona** — apaga `conversations`, `bot_step_transitions`, memória, OCR, agendados e zera o customer. Mas a UI continua mostrando tudo porque:

1. As **bolhas do chat** vêm direto do Whapi/Evolution (servidor do WhatsApp), não da nossa tabela. O servidor do WhatsApp não nos deixa apagar histórico do destinatário — só dá pra **esconder localmente**.
2. Após o reset, **nada é recarregado** na UI: card do lead, lista de chats, deals do CRM e mensagens continuam com os dados velhos em cache (React state + polling de 20s).

## Solução

### 1. Marcar um "ponto de corte" para esconder bolhas antigas
- Nova coluna `customers.chat_cleared_at timestamptz` (migration).
- `reset_lead_conversation` passa a setar `chat_cleared_at = now()` no UPDATE final.
- `useMessages.fetchMessages`: depois de buscar do Whapi/Evolution, filtra mensagens com `timestamp < chat_cleared_at` do customer atual. Carrega esse valor uma vez (e em cada refetch) via `customers.select('chat_cleared_at').eq('phone_whatsapp', phone)`.
- Efeito: bolhas antigas somem do painel imediatamente. Novas mensagens (inbound/outbound após o reset) aparecem normalmente.

### 2. Forçar refresh completo após reset
No `handleReset` do `ChatView.tsx`:
- Após sucesso, disparar em paralelo:
  - `refetch()` do `useMessages` (já existe, só não está exposto no destructuring — adicionar).
  - Invalidar/recarregar a lista de chats (`useChats`) — expor um `refetch` e chamar.
  - Recarregar dados do customer no painel lateral (componente que mostra nome/valor/step).
  - Recarregar `crm_deals` do lead.
- Trocar o toast por algo tipo "Conversa zerada — histórico oculto e dados do lead resetados".

### 3. Pequenos ajustes
- `useMessages.ts`: adicionar realtime listener em `customers` (UPDATE no `chat_cleared_at`) para reagir caso o reset venha de outra aba.
- Garantir que o filtro de `chat_cleared_at` também se aplique ao `MessagesList` agrupado (para não mostrar "data separator" de dia antigo vazio).

## Arquivos afetados

- `supabase/migrations/*` — adicionar coluna `chat_cleared_at` em `customers` + atualizar função `reset_lead_conversation` para preencher esse campo.
- `src/hooks/useMessages.ts` — buscar `chat_cleared_at`, filtrar mensagens, expor `refetch`.
- `src/components/whatsapp/ChatView.tsx` — destructurar `refetch`, disparar refresh do card/chats/deals após reset, ajustar copy do toast.
- `src/hooks/useChats.ts` — expor `refetch` (se ainda não expõe).
- Componente do card lateral do lead (identificar no ChatView) — expor callback de refresh ou usar realtime.

## Observação importante (a comunicar ao usuário)

Não dá para apagar o histórico do **WhatsApp do cliente** — o servidor da Meta/Whapi não permite. O cliente continua vendo as mensagens antigas no app dele. O que conseguimos é: limpar tudo do nosso lado e esconder as bolhas no nosso painel, fazendo o bot recomeçar do zero. Se quiser, também posso adicionar um botão "Apagar conversa do meu lado" no Whapi (`DELETE /chats/{id}`) que limpa o chat **só na sua conta WhatsApp conectada** (não no celular do cliente) — me avisa se faz sentido incluir.
