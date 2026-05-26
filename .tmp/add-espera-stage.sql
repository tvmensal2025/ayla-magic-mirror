-- ═══════════════════════════════════════════════════════════════════════
-- Adiciona coluna "Em Espera" no Kanban CRM, entre "Finalizando" e "Aprovado"
-- + Backfill: cria deals para todos os clientes iGreen que ainda não têm.
-- 
-- SEGURO: 
--  - Coluna "espera" NÃO está em ACTIVE_FUNNEL_STAGES (crm-stage-sync.ts) 
--    → bot nunca move automaticamente para/de "espera"
--  - Cron crm-auto-progress só processa aprovado/30/60/90/120/reprovado 
--    → não toca em "espera"
--  - Ação totalmente manual (drag-and-drop pelo consultor)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Empurrar posições das colunas pós-finalizando para abrir espaço (position 6)
UPDATE kanban_stages
SET position = position + 1
WHERE stage_key IN ('aprovado', 'reprovado', '30_dias', '60_dias', '90_dias', '120_dias')
  AND position >= 6;

-- 2. Inserir coluna "Em Espera" (position 6) para TODOS os consultores que já têm "finalizando"
INSERT INTO kanban_stages (consultant_id, stage_key, label, color, position, auto_message_enabled, auto_message_type)
SELECT 
  consultant_id,
  'espera',
  'Em Espera',
  'bg-slate-500/20 text-slate-400',
  6,
  false,
  'text'
FROM kanban_stages
WHERE stage_key = 'finalizando'
ON CONFLICT (consultant_id, stage_key) DO NOTHING;

-- 3. Backfill: criar crm_deals em "espera" para todos os clientes igreen_sync 
--    que tenham consultant_id e ainda não tenham deal no consultor.
--    (pula clientes sem consultant_id pois NOT NULL na tabela crm_deals)
INSERT INTO crm_deals (consultant_id, customer_id, remote_jid, stage, deal_origin, notes)
SELECT 
  c.consultant_id,
  c.id,
  c.phone_whatsapp,
  'espera',
  'igreen_sync',
  'Cliente importado do iGreen - movimentação manual'
FROM customers c
WHERE c.customer_origin = 'igreen_sync'
  AND c.consultant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM crm_deals d 
    WHERE d.customer_id = c.id 
      AND d.consultant_id = c.consultant_id
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- Verificação pós-migração:
-- ═══════════════════════════════════════════════════════════════════════
SELECT 
  c.name as consultor,
  count(*) FILTER (WHERE d.stage = 'espera') as em_espera,
  count(*) FILTER (WHERE d.stage = 'novo_lead') as novo_lead,
  count(*) FILTER (WHERE d.stage = 'aprovado') as aprovado,
  count(*) as total
FROM crm_deals d
JOIN consultants c ON c.id = d.consultant_id
GROUP BY c.id, c.name
ORDER BY total DESC;
