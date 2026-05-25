## Objetivo

Reaproveitar a aba **Clientes iGreen** (em `/admin/clientes` → `WhatsAppClientsPage.tsx`) como **CRM Pós-Venda em formato Kanban**, com 6 colunas fixas:

```
Aprovado | Reprovado | 30 dias | 60 dias | 90 dias | 120 dias
```

Sem mexer no funil de Leads WhatsApp (continua igual). Os dados de cliente nunca são apagados — o sync iGreen só faz UPSERT.

---

## 1. Estrutura de colunas

- **Aprovado** — `portal_submitted_at` definido E status não-reprovado, e ainda <30 dias desde aprovação (ou recém-aprovado sem tempo de bucket).
- **30 / 60 / 90 / 120 dias** — buckets calculados a partir de `portal_submitted_at`:
  - 30d: 30 ≤ dias < 60
  - 60d: 60 ≤ dias < 90
  - 90d: 90 ≤ dias < 120
  - 120d: ≥ 120
- **Reprovado** — entra por dois caminhos:
  1. Automático: status iGreen vier como `rejected` / `cancelado` / andamento "reprovado".
  2. Manual: botão "Marcar como reprovado" no card (com motivo opcional).

Botão global no topo: **Auto / Manual** — quando "Auto" estiver ligado (default), o cron recalcula bucket a cada dia; quando "Manual", o card fica fixo na coluna onde o consultor arrastou.

## 2. Movimentação automática

- Novo campo em `customers`:
  - `pos_venda_stage` (text) — coluna atual no Kanban (`aprovado | reprovado | d30 | d60 | d90 | d120`).
  - `pos_venda_manual` (boolean default false) — se true, cron não mexe.
  - `pos_venda_reason` (text null) — motivo da reprovação manual.
- **Edge function + pg_cron diário (03:00 BRT)** `pos-venda-bucket-cron`:
  - Para cada customer com `customer_origin='igreen_sync'`, `portal_submitted_at IS NOT NULL`, `pos_venda_manual = false`:
    - Calcula `dias = now() - portal_submitted_at`.
    - Atualiza `pos_venda_stage` conforme tabela acima.
    - Se status iGreen indicar reprovação, força `pos_venda_stage = 'reprovado'`.
- Arrastar manualmente no Kanban faz UPDATE e marca `pos_venda_manual = true`. Botão "Voltar ao automático" reseta.

## 3. Regra de propriedade (consultor)

- Cliente sempre pertence ao `consultant_id` original (principal) — esse é o único que aparece no Kanban dele por padrão.
- Novo campo: `customers.assigned_consultant_id` (uuid null, FK consultants).
- Se `assigned_consultant_id` estiver setado, o cliente também aparece no Kanban Pós-Venda **daquele** consultor (além do principal). Permite "compartilhar" cliente com outro consultor sem perder o original.
- Botão no card "Atribuir a consultor…" abre select dos consultores e salva `assigned_consultant_id`. Só o principal ou super-admin pode atribuir/remover.
- RLS atualizada: SELECT/UPDATE no Pós-Venda permitido se `consultant_id = auth.uid()` **OU** `assigned_consultant_id = auth.uid()` **OU** super_admin. Mas mudar status para Aprovado/Reprovado só pelo principal ou pelo `assigned_consultant_id` corrente.

## 4. Persistência (nada some)

- Sync `igreen-sync` continua usando **UPSERT por (consultant_id, igreen_code)** — nunca DELETE.
- Adicionar guard no edge function de sync: se cliente sumiu do payload iGreen, não apaga — apenas marca `andamento_igreen='Removido do portal'` e mantém histórico.
- Coluna Reprovado mantém o card visível para sempre; não é "lixeira".

## 5. UI (frontend, em `WhatsAppClientsPage.tsx`)

Quando a aba ativa é **Clientes iGreen**:

```
┌─ Toggle Auto/Manual ──────────────────── + Atribuir consultor ─┐
├─Aprovado─┬─Reprovado─┬─30d─┬─60d─┬─90d─┬─120d─┤
│  card    │  card     │card │card │card │card  │
│  card    │           │card │     │     │card  │
└──────────┴───────────┴─────┴─────┴─────┴──────┘
```

- Reaproveita componentes `KanbanBoard`/`KanbanColumn`/`KanbanDealCard` já existentes (usados no funil de Leads), passando colunas customizadas.
- Card mostra: nome, telefone, valor da conta, dias desde aprovação, badge do andamento iGreen, botão "Reprovar / Aprovar / Voltar a auto / Atribuir".
- Drag & drop com `DropConfirmDialog` (já existe) para confirmar virada manual.
- Mantém Tabs Leads WhatsApp ↔ Clientes iGreen no topo.

## 6. Detalhes técnicos

**Migration:**
```sql
ALTER TABLE public.customers
  ADD COLUMN pos_venda_stage text,
  ADD COLUMN pos_venda_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN pos_venda_reason text,
  ADD COLUMN assigned_consultant_id uuid REFERENCES public.consultants(id);

CREATE INDEX idx_customers_pos_venda
  ON public.customers (consultant_id, pos_venda_stage)
  WHERE customer_origin = 'igreen_sync';

CREATE INDEX idx_customers_assigned
  ON public.customers (assigned_consultant_id)
  WHERE assigned_consultant_id IS NOT NULL;
```

**RLS extra (UPDATE/SELECT):** policy adicional permitindo `assigned_consultant_id = auth.uid()` ler/editar campos `pos_venda_*`.

**Edge function:** `supabase/functions/pos-venda-bucket-cron/index.ts` agendada via `pg_cron` (03:00 BRT).

**Sync iGreen:** ajustar `api-voffice` (ou função de sync) para nunca deletar, apenas marcar removidos.

**Frontend:** 
- Novo componente `src/components/whatsapp/PosVendaKanban.tsx`.
- Hook `usePosVendaCustomers(consultantId)` que retorna lista + agrupamento por `pos_venda_stage`.
- Substitui a view de lista quando `originTab === "igreen_sync"`.

## 7. Memórias a salvar

- `mem://crm/pos-venda-kanban` — colunas fixas, cron de bucket, regra `pos_venda_manual`, propriedade por `assigned_consultant_id`, sync nunca apaga.

## Fora do escopo

- Não cria nova rota — vive dentro de `/admin/clientes` na tab existente.
- Não muda o funil de Leads WhatsApp.
- Não muda formato/origem do sync iGreen além da regra "nunca deletar".
