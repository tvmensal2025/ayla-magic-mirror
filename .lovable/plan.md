## Diagnóstico

Encontrei dois pontos reais de mistura:

1. **Importação Excel em `CustomerImportExport`**
   - Hoje a planilha grava `customers` sem definir `customer_origin`.
   - Como o banco tem default `whatsapp_lead`, qualquer cliente importado por Excel vira lead.
   - Além disso, após importar, o código cria `crm_deals` em `novo_lead`, o que confirma a mistura.

2. **Deals antigos por telefone/remoto**
   - Já existe trava para impedir `crm_deals.customer_id` apontando para `igreen_sync`.
   - Mas há deals antigos/órfãos com `customer_id` nulo ou inconsistente e `remote_jid` batendo com clientes `igreen_sync`.
   - Consulta encontrou **125 deals** no funil que batem por telefone com clientes iGreen sincronizados.

## Plano de correção

### 1. Importação Excel nunca criar lead
- Alterar a importação de Excel para salvar registros como `customer_origin: 'igreen_sync'` quando for importação de carteira/clientes.
- Remover a criação automática de `crm_deals` em `novo_lead` dentro da importação Excel.
- Ajustar textos da UI para deixar claro que Excel é importação de clientes/carteira, não entrada de lead WhatsApp.

### 2. CRM/Kanban só mostra leads reais
- Manter o Kanban lendo apenas:
  - `customer_origin = 'whatsapp_lead'`
  - `customer_origin = 'manual'`
- Reforçar o hook auxiliar `useCustomerDeals` para não associar estágio de CRM a cliente `igreen_sync` por telefone.
- Assim a tela de clientes iGreen não herdará status/bolinhas de lead por causa de `remote_jid` antigo.

### 3. Banco: trava por telefone, não só por `customer_id`
Criar/ajustar função trigger em `crm_deals` para bloquear também quando:
- `customer_id` aponta para `igreen_sync`; ou
- `remote_jid` bate com `customers.phone_whatsapp` de cliente `igreen_sync` no mesmo consultor.

Isso fecha a brecha dos deals órfãos ou criados só com telefone.

### 4. Limpeza dos dados já misturados
- Remover do funil os `crm_deals` que correspondem por telefone a clientes `igreen_sync`.
- Não deletar os clientes da carteira; só retirar os cards/negócios indevidos do funil de leads.
- Rede (`network_members`) permanece separada e não será convertida em customer/lead.

### 5. Validar depois da correção
- Conferir contagens por origem:
  - clientes iGreen continuam em `customers.customer_origin = 'igreen_sync'`;
  - leads WhatsApp continuam em `whatsapp_lead/manual`;
  - `crm_deals` não tem mais correspondência com `igreen_sync`.
- Verificar que a importação Excel não cria cards em “Novo Lead”.

## Arquivos/tabelas envolvidos

- `src/components/whatsapp/CustomerImportExport.tsx`
- `src/hooks/useCustomerDeals.ts`
- `public.crm_deals`
- `public.customers`
- trigger/função `prevent_non_lead_deals`

## Resultado esperado

Clientes do Excel/iGreen ficam somente como **clientes de carteira/pós-venda**. Leads do WhatsApp ficam no **funil de leads**. Rede sincronizada fica em **network_members**. Nada dessas três origens se mistura.