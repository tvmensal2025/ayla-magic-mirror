---
name: CRM Pós-Venda Kanban
description: Aba "Clientes iGreen" vira Kanban com colunas Aprovado/Reprovado/30/60/90/120d via pos_venda_stage; cron diário recalcula; assigned_consultant_id compartilha cliente; sync nunca apaga
type: feature
---

- Tabela `customers`:
  - `pos_venda_stage` ∈ {aprovado, reprovado, d30, d60, d90, d120}
  - `pos_venda_manual` (default false) — quando true, cron não recalcula
  - `pos_venda_reason` — motivo opcional ao reprovar
  - `assigned_consultant_id` — consultor secundário que também enxerga/edita
- Função `compute_pos_venda_stage(portal_submitted_at, status, andamento_igreen)` define bucket. Reprovado vem de status `rejected|cancelled|canceled` OU andamento contendo "reprov|cancel".
- RPC `recompute_pos_venda_stages()` (SECURITY DEFINER) atualiza todos `customer_origin='igreen_sync'` sem manual override.
- Edge function `pos-venda-bucket-cron` chama a RPC. Agendada via pg_cron `pos-venda-bucket-cron-daily` (06:00 UTC = 03:00 BRT).
- Frontend: `src/components/whatsapp/PosVendaKanban.tsx` renderizado em `WhatsAppClientsPage` quando `originTab === 'igreen_sync'`. Drag&drop fixa manual; menu permite Aprovar/Reprovar/Voltar ao auto/Atribuir consultor; botão "Recalcular colunas" invoca a edge.
- RLS: 2 policies extras em customers (`Assigned consultant select/update customers`) permitem que `assigned_consultant_id = auth.uid()` veja/edite.
- Persistência: sync iGreen segue UPSERT; nada é deletado. Reprovado fica permanente na coluna.
