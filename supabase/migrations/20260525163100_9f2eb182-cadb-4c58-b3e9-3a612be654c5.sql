-- Relax conversations.message_type check to accept all media kinds and failure markers.
-- Prior constraint blocked audio/video/document/button inserts silently, leaving
-- last_outbound_at stale and causing the re-welcome loop.
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_message_type_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_message_type_check
  CHECK (message_type IN (
    'text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact',
    'buttons', 'button', 'list', 'interactive', 'template', 'reaction',
    'text_failed', 'image_failed', 'audio_failed', 'video_failed', 'document_failed',
    'system'
  ));

-- Add composite index used by hoursSinceBot lookup
CREATE INDEX IF NOT EXISTS conversations_customer_dir_created_idx
  ON public.conversations (customer_id, message_direction, created_at DESC);

-- Backfill: normalize bare-UUID conversation_step to canonical "flow:<uuid>"
-- so the engine routes consistently and bot-audit-runner shows zero legacy.
UPDATE public.customers
SET conversation_step = 'flow:' || conversation_step
WHERE conversation_step ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.bot_step_transitions
SET to_step = 'flow:' || to_step
WHERE to_step ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.bot_step_transitions
SET from_step = 'flow:' || from_step
WHERE from_step ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';