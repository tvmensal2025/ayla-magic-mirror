alter table public.message_templates add column if not exists shortcut text;
create unique index if not exists message_templates_consultant_shortcut_uniq
  on public.message_templates (consultant_id, lower(shortcut))
  where shortcut is not null;