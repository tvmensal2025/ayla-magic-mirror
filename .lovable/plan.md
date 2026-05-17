## Objetivo

Nunca misturar **Clientes iGreen** (sincronizados do portal — já cadastrados, com status real: ativo, inativo, devolutiva, em análise…) com **Leads WhatsApp** (gente que chegou pelo anúncio e ainda está conversando com a Camila/bot).

---

## 1. Banco de dados

Nova coluna em `customers`:

- `customer_origin text NOT NULL DEFAULT 'whatsapp_lead'`
  - Valores: `igreen_sync` | `whatsapp_lead` | `manual`
- Índice em `(consultant_id, customer_origin)` para filtros rápidos.

**Backfill (uma vez):**
- `customer_origin = 'igreen_sync'` para todo registro com `igreen_code IS NOT NULL` ou `andamento_igreen IS NOT NULL`.
- Restante permanece `whatsapp_lead`.

**Preenchimento automático futuro:**
- Edge `sync-igreen-customers`: força `customer_origin = 'igreen_sync'` no upsert.
- Webhooks `whapi-webhook` e `evolution-webhook` (criação de customer via WhatsApp): `customer_origin = 'whatsapp_lead'`.
- Import Excel da tela de Clientes: `customer_origin = 'manual'` (ou `igreen_sync` se planilha contém `igreen_code`).

---

## 2. UI — `WhatsAppClientsPage` vira duas abas

Tabs no topo:

```text
[ Leads WhatsApp ]  [ Clientes iGreen ]
```

- **Leads WhatsApp** (`customer_origin = 'whatsapp_lead'`)
  - KPIs: Novos hoje, Em conversa, Qualificados, Pausados (handoff)
  - Filtros: status do bot (pending, qualificado, complete, automation_failed…)
  - Ações: abrir conversa, enviar template, pausar/despausar bot
- **Clientes iGreen** (`customer_origin = 'igreen_sync'`)
  - KPIs: Ativos, Inativos, Devolutiva, Em análise, Total
  - Filtros: `andamento_igreen`, distribuidora, devolutiva sim/não
  - Ações: enviar mensagem por devolutiva, exportar CSV, abrir no portal iGreen

Cada aba tem sua própria busca, contagem e export — nada se mistura.

---

## 3. CRM Kanban (`SalesFunnelCard`)

Adicionar coluna fixa **"Carteira iGreen"** ao final do Kanban, alimentada por `customer_origin = 'igreen_sync' AND status IN ('active','inactive')`.

- Cards nesta coluna são **read-only** (não arrastáveis para outras colunas).
- Métricas de conversão (novo_lead → aprovado) **ignoram** essa coluna.
- Badge visual diferente (cinza/verde-escuro) para deixar claro que é carteira, não funil.

---

## 4. Envio em Massa (`Bulk Send`)

Adicionar seletor no topo:

```text
Público: ( ) Leads WhatsApp  ( ) Clientes iGreen
```

Filtros existentes (status, licenciado, etc.) ficam contextuais ao público escolhido. Contador de "contatos válidos" sempre filtra por `customer_origin`.

---

## 5. Notificações de novo lead

Já existe `notifyNewLead`. Restringir para disparar **apenas** quando `customer_origin = 'whatsapp_lead'`, evitando notificações para cada cliente importado do sync diário.

---

## 6. Arquivos a alterar

- `supabase/migrations/...` — coluna, backfill, índice
- `supabase/functions/sync-igreen-customers/index.ts` — força origem
- `supabase/functions/whapi-webhook/index.ts` + `evolution-webhook/index.ts` — origem lead
- `supabase/functions/_shared/notify-consultant.ts` — guard por origem
- `src/pages/WhatsAppClientsPage.tsx` — tabs + KPIs por aba
- `src/components/whatsapp/customerUtils.ts` — helpers `isIgreenCustomer(c)` / `isWhatsappLead(c)`
- `src/components/whatsapp/CustomerListItem.tsx` — badge de origem
- `src/components/whatsapp/SalesFunnelCard.tsx` + `src/hooks/useSalesFunnel.ts` — coluna "Carteira iGreen" read-only
- Tela de Envio em Massa — toggle de público

---

## 7. Critérios de aceite

- Sync diário às 07:00 BRT não cria notificações nem mexe em leads em conversa.
- Aba "Clientes iGreen" mostra apenas ativos/inativos/devolutiva — zero leads do bot.
- Kanban "novo_lead" nunca exibe cliente já ativo na iGreen.
- Contagens (Novos hoje, Qualificados…) nunca somam clientes da carteira.
- Import Excel + sync continuam funcionando sem duplicar registros (upsert por CPF/telefone mantém origem original; se já é `igreen_sync`, não rebaixa).
