-- Camada 1.1 — Unificar dedup do webhook
-- A tabela webhook_message_dedupe (com "e") era um espelho órfão usado só por bot/dedupe.ts.
-- A tabela canônica é webhook_message_dedup (sem "e"), usada por audit.ts e com cleanup via pg_cron.
DROP TABLE IF EXISTS public.webhook_message_dedupe;