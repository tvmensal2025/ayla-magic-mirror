# Atalhos ⚡ disponíveis para TODOS os clientes

## Diagnóstico

Hoje o `FlowQuickBar` em `MessageComposer` só aparece quando existe `customerId`:

```ts
// FlowQuickBar.tsx (linha 143)
if (!consultantId || !customerId) return null;
```

E em `ChatView.tsx` o `customerId` só é preenchido se o telefone do chat já existir na tabela `customers` (linhas 134-147). Resultado: ao trocar para um contato WhatsApp que ainda não foi salvo como cliente, o botão ⚡ desaparece — exatamente o que o usuário relatou.

O backend `manual-step-send` **exige** `customerId` (linha 45), porque precisa gravar conversations, variant A/B/C, etc.

## Solução

Deixar o ⚡ sempre visível enquanto houver um chat aberto. Quando o usuário disparar um passo, garantir um cliente — criando automaticamente se ainda não existir.

### 1. Auto-criar cliente quando o chat é aberto (ChatView)

No `useEffect` que faz lookup do customer (linhas 134-147):
- Buscar por `phone_whatsapp` **escopado ao `consultant_id`** (multi-tenant correto).
- Se não encontrar, fazer `insert` mínimo:
  ```ts
  { consultant_id, phone_whatsapp: phone, name: chat.pushName || phone,
    customer_origin: 'whatsapp_lead', conversation_step: 'novo_lead' }
  ```
  Pegar o `id` retornado e setar em `customerId`.
- Aplicar memória [Customer Origin Separation] usando `customer_origin: 'whatsapp_lead'` para não poluir a aba "Clientes iGreen".

Assim, qualquer chat aberto passa a ter `customerId` válido e o ⚡ aparece — sem mudar o backend.

### 2. Guarda contra race (FlowQuickBar)

Manter o gate `if (!consultantId) return null;` mas remover `!customerId`. Enquanto o auto-create está em andamento (≈300 ms), desabilitar o botão com `disabled={!customerId}` no `PopoverTrigger`, mostrando tooltip "Carregando cliente…". Isso evita disparo sem ID.

### 3. Sem mudanças no backend

`manual-step-send` continua igual. Os hooks de captação (`useCaptureSession`), CRM e a aba "Adicionar Cliente" já funcionam com a row criada.

## Arquivos a editar

- `src/components/whatsapp/ChatView.tsx` — auto-create de customer no lookup (linhas 134-147), com filtro por `consultant_id`.
- `src/components/whatsapp/FlowQuickBar.tsx` — trocar `if (!consultantId || !customerId) return null;` por `if (!consultantId) return null;` e desabilitar o trigger enquanto `!customerId`.

## Fora do escopo

- Mudar regra de origem dos leads (continua entrando como `whatsapp_lead`).
- Mexer em `manual-step-send` ou no fluxo automático do bot.
- Renomear/mover o botão ⚡.
