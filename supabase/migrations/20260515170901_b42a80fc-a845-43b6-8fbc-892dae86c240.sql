
-- 1.b) Limpa override antigo gravado em leads
UPDATE customers
   SET conversational_flow_enabled = NULL
 WHERE conversational_flow_enabled IS NOT NULL
   AND consultant_id IN (SELECT id FROM consultants WHERE conversational_flow_enabled = true);

-- 1.c) Backfill step_key para passos antigos do editor
UPDATE bot_flow_steps
   SET step_key = id::text
 WHERE step_key IS NULL OR step_key = '';
