-- IA = só lookup determinístico, nunca gera texto livre.
--
-- Esta migration aplica 3 mudanças idempotentes:
--   1. Setting global `ai_kb_only_mode = 'true'` — ativa o gate
--      KB-only no `ai-agent-router` e no `v3-webhook-entry`.
--   2. `ai_agent_config` global com `enabled = false` (defesa em
--      profundidade — mesmo se alguém desligar o setting, o agente LLM
--      legacy não dispara automaticamente para consultores que herdam
--      a config global).
--   3. Despausa leads de teste do consultor V3 (Rodrigo Horácio) para
--      validar o fluxo end-to-end. NÃO mexe nos leads reais — esses
--      precisam ser despausados manualmente após confirmação.

-- 1) Ativa modo KB-only.
INSERT INTO settings (key, value)
VALUES ('ai_kb_only_mode', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2) Defesa em profundidade: agente LLM global desligado.
UPDATE ai_agent_config
SET enabled = false
WHERE consultant_id IS NULL;

-- 3) Despausa apenas leads de TESTE do consultor V3.
UPDATE customers
SET
  bot_paused = false,
  bot_paused_reason = null,
  bot_paused_at = null,
  bot_paused_until = null
WHERE consultant_id = '0c2711ad-4836-41e6-afba-edd94f698ae3'
  AND bot_paused = true
  AND (
    phone_whatsapp LIKE '5500000%'
    OR is_sandbox = true
    OR name LIKE '%Test%' OR name LIKE '%test%'
    OR name LIKE '%Audit%'
    OR name LIKE '%Trace%'
    OR name LIKE '%Sandbox%'
    OR name LIKE '%Jornada%'
    OR name LIKE '%Final%'
    OR name LIKE '%Lead Real Simulado%'
  );
