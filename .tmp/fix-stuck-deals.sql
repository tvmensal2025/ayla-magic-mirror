-- Fix 2 deals stuck due to engine v3 not calling syncDealStageFromStep.
-- SILENT fix: only updates stage column. No auto-messages will be triggered.
-- Leads will NOT be contacted - they just move to the correct Kanban column.

-- Deal 22a99c2a: customer "Aline" at "aguardando_doc_auto" → stage "conta_enviada"
UPDATE crm_deals 
SET stage = 'conta_enviada', updated_at = now()
WHERE id = '22a99c2a-2921-49a1-a64c-9ccd4f0038f6'
  AND stage = 'qualificando';

-- Deal 73234757: customer "Erasmo Aqui" at "aguardando_conta" → stage "valor_conta"
UPDATE crm_deals 
SET stage = 'valor_conta', updated_at = now()
WHERE id = '73234757-d203-46ea-a60f-b4c479435ba8'
  AND stage = 'novo_lead';
