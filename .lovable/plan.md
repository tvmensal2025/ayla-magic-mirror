# Separação total: Leads × Clientes iGreen × Rede

## Problema
Hoje há vazamento entre 3 universos que precisam ser estanques:

1. **Leads WhatsApp** — chegam pelo anúncio / link da LP, conversam com o bot. (`customers.customer_origin = 'whatsapp_lead' | 'manual'`)
2. **Clientes iGreen** — vêm da sincronização diária do portal/escritório virtual. Já são clientes, não leads. (`customer_origin = 'igreen_sync'`)
3. **Rede / Licenciados** — vêm da sincronização da rede (`network_members`). São clientes da rede, não leads.

Pontos onde ainda misturam:
- **Kanban CRM** — só filtra `igreen_sync` fora; manuais e qualquer cliente sem origem viram card de funil de lead.
- **Dashboard / Performance / Analytics charts** — contam `customers` totais como se fossem leads.
- **Envio em massa** — abas existem mas filtros de status e "Aprovado + Devolutiva" continuam misturando carteira com leads.
- **Coluna Aprovado** do Kanban — mistura lead aprovado com cliente vindo da sincronização que entrou ali por upsert antigo.
- **Rede** — alguns KPIs de "novos clientes" estão somando licenciados da rede.

## Decisão (validada com você)
- Cliente `igreen_sync` → **isolado completo**. Some do Kanban, do envio em massa de leads, de toda métrica de lead.
- Sincronizados e Rede → **novo funil "Pós-venda / Carteira"**, separado do funil de leads.
- Coluna "Aprovado" do Kanban de leads → **só** leads WhatsApp que avançaram pelo bot.
- Anúncios = só `lead_source ∈ ads`. WhatsApp = só `whatsapp_lead`. Sem cruzamento.

## Escopo da implementação

### 1. Banco (migration)
- Garantir coluna `customers.customer_origin` com default `'whatsapp_lead'` e backfill:
  - Quem tem `igreen_code` ou veio do sync diário → `igreen_sync`.
  - Quem tem `network_member_id` (ou veio da rede) → `network`.
  - Restante mantém `whatsapp_lead` / `manual`.
- Adicionar valor `'network'` ao tipo lógico (`customer_origin text` já permite).
- Apagar do `crm_deals` todo deal cujo customer tem `customer_origin in ('igreen_sync','network')` (limpeza única).
- Trigger `prevent_non_lead_deals`: bloqueia INSERT em `crm_deals` se o customer for `igreen_sync`/`network`.
- Nova tabela leve `pos_venda_deals` (ou view) para o funil de pós-venda de carteira.

### 2. Frontend — Kanban
- `useKanbanDeals`: filtro endurecido `customer_origin === 'whatsapp_lead' || 'manual'` (já existe parcial — completar e remover deals órfãos que escapam).
- Coluna "Aprovado" passa a aceitar **apenas** deals com `deal_origin = 'aprovado'` originados de lead.
- Novo board "Pós-venda" para `igreen_sync + network` com colunas: Onboarding · Ativo · Devolutiva · Inativo.

### 3. Frontend — Envio em massa
- `BulkSendPanel`: na aba **Leads WhatsApp**, esconder filtros que envolvem `andamento_igreen`, `devolutiva`, `cashback`, `nível licenciado` (são campos de carteira).
- Na aba **Clientes iGreen**, esconder filtros de funil de lead (etapa do bot, `conversation_step`).
- Aba nova **Rede** (network_members) com filtros próprios.

### 4. Frontend — Dashboard / Charts
- `PerformanceCharts`, `AnalyticsCharts`, `CustomerCharts`, `LeadSourceCard`, `HeroKpis`: toda query de "leads" passa a filtrar `customer_origin in ('whatsapp_lead','manual')`.
- KPIs de "Clientes ativos" e "Carteira" filtram `igreen_sync`.
- KPIs de "Rede" só usam `network_members` (já isolado).

### 5. Página Clientes WhatsApp
- Já tem abas — ao clicar num cliente da aba "Clientes iGreen", esconder campos/badges de funil de lead (status do bot, `conversation_step`, etapa Kanban). Mostrar só dados de carteira (andamento, devolutiva, assinaturas, cashback, link).

### 6. Anúncios
- `ResultsDashboard` e `LeadSourceCard`: contar como conversão **só** customers com `customer_origin='whatsapp_lead'` E `lead_source` de origem ads. Nunca somar sincronizados.

## Fora do escopo
- Não mexer em WhatsApp connection / Whapi / Evolution.
- Não alterar fluxos do bot.
- Não mudar layout de LP.

## Detalhes técnicos
- Migrations + RLS: trigger usa `SECURITY DEFINER` e `search_path=public`.
- Tipos TS regenerados automaticamente pelo Supabase após migration.
- Memory atualizado: estender `mem://features/customer-origin-separation` cobrindo Dashboard/Charts/Pós-venda board.

Quer que eu implemente nessa ordem (banco → Kanban → Dashboards → BulkSend → Anúncios → Pós-venda board)? Ou prefere começar pelo Kanban + Dashboards (impacto visual imediato) e deixar o board de Pós-venda numa segunda leva?