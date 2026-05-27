# Auditoria da Plataforma — Estado Real (27/mai)

Rodei os scanners (`supabase--linter` + `security--get_scan_results`) agora. **Nada do que estava pendente foi corrigido no banco.** Pior: o scanner detectou novas falhas críticas que não estavam na lista anterior.

## Resumo numérico

- 397 migrations, 104 edge functions, 11 arquivos de teste (cobertura ainda baixíssima).
- **119 issues** no linter Supabase.
- **9 findings** no scanner Lovable (3 ERROR, 6 WARN).
- Build/TS verdes ✅.

---

## 🔴 CRÍTICO — vazamento de dados (corrigir antes de qualquer go-live)

1. `**consultants.igreen_portal_password` exposto em plaintext para anônimos** (ERROR)
  - Policy `Public read approved consultants minimal` faz `SELECT *` para `anon` + `authenticated` quando `approved IS TRUE`.
  - Qualquer visitante anônimo lê senha, e-mail, telefone de todos os consultores aprovados.
  - **Fix:** substituir por view security-definer ou policy com lista de colunas (`id, name, photo_url, cadastro_url, slug`).
2. **Bucket `whatsapp-media` público** (ERROR)
  - Documentos, RG, conta de luz, selfies dos clientes acessíveis por URL.
  - **Fix:** bucket → privado; SELECT só pelo dono ou service_role; signed URLs no app.
3. **Bucket `video igreen` permite INSERT/UPDATE/DELETE para `anon**` (ERROR)
  - Qualquer um na internet sobrescreve ou apaga os vídeos da LP.
  - **Fix:** remover policies `public/anon` de mutação; manter só `service_role` + admin autenticado por path.
4. `**whatsapp_instances` — `anon` lista todos os números conectados** (ERROR)
  - Policy `Anon read connected phone only` vaza WhatsApp de todos os consultores ativos.
  - **Fix:** dropar a policy anon; manter só leitura do dono.
5. **Realtime sem RLS em `realtime.messages**` (ERROR)
  - Qualquer autenticado se inscreve em qualquer canal e recebe eventos de `capture_field_suggestions` de outros consultores (nome do cliente + campos inferidos).
  - **Fix:** RLS em `realtime.messages` filtrando por topic = `consultant:{auth.uid()}`.

---

## 🟠 ALTO

6. `**app_settings` expõe `super_admin_phone` e `super_admin_instance_name**` para qualquer autenticado.
  - **Fix:** policy por allowlist de `key` (mesmo padrão da tabela `settings`).
7. **Bucket `consultant-photos**` — UPDATE/DELETE sem checagem de owner. Qualquer autenticado sobrescreve foto de qualquer consultor.
  - **Fix:** policy com `(storage.foldername(name))[1] = auth.uid()::text` (padrão já usado em `ai-agent-media`).
8. `**message_templates**` — autenticados leem templates de outros consultores (qualquer `origin_template_id IS NULL`).
  - **Fix:** restringir a `consultant_id IS NULL` (globais reais) OU `consultant_id = auth.uid()`.
9. **Bucket `simulator-uploads` público** — contas de luz e documentos acessíveis sem auth.
  - **Fix:** SELECT autenticado + path do owner; ou signed URLs.

---

## 🟡 IMPORTANTES (linter Supabase)

- **10 tabelas com RLS habilitado e ZERO policy** → bloqueia até `service_role` em queries via PostgREST. (Fase 1 que ficou esperando aprovação nunca foi aplicada.)
  - `ai_cooldown_state`, `customer_processing_lock`, `gemini_quota_bucket`, `inbound_media_failures`, `inbound_media_retry`, `outbound_message_log`, `pending_outbound_media`, `webhook_message_dedup`, `webhook_rate_limit`, `customer_flow_state`.
- **~30 funções SECURITY DEFINER executáveis por `anon`/`authenticated**` (clone_bot_flow_as, seed_flow_d, credit/debit/refund_consultant_wallet, fb_emit_capi, consume_gemini_token, etc.) — risco de escalada de privilégio direto.
- **Função `Function Search Path Mutable**` — pelo menos 1 função sem `SET search_path`.
- **2 policies `WITH CHECK (true)**` (UPDATE/DELETE/INSERT permissivas demais).
- **Leaked Password Protection** desligado no Supabase Auth.

---

## 🔵 PERFORMANCE / QUALIDADE (não bloqueante)

- Cobertura de testes ridícula (11 arquivos para 104 edge functions + 397 migrations). Sem teste de wallet, RLS, OCR, takeover.
- Índices duplicados e FKs sem cobertura ainda não tratados.
- `auth.uid()` direto em policies hot (sem `(select auth.uid())`).

---

## Plano de execução proposto (4 fases, todas via `supabase--migration` + aprovação sua)

### Fase A — Vazamentos de dado (BLOQUEANTE — ~1 migration)

- Reescrever policy `Public read approved consultants minimal` para colunas seguras.
- Tornar `whatsapp-media` e `simulator-uploads` privados + nova policy por owner.
- Remover policies `anon/public` de mutação em `video igreen`.
- Dropar policy `Anon read connected phone only` em `whatsapp_instances`.
- Restringir `app_settings` por allowlist de keys.
- Corrigir owner-check em `consultant-photos`.
- Restringir `message_templates` library leak.
- RLS em `realtime.messages` por topic do consultor.

### Fase B — RLS interno + REVOKE de funções (Fase 1 antiga, finalmente aplicada)

- GRANT/REVOKE + policy `service_role_full_access` nas 10 tabelas internas.
- `REVOKE EXECUTE` em ~30 funções DEFINER sensíveis (manter só `service_role`).
- `SET search_path` na função que falta.
- Trocar `USING (true)` por condições corretas nas 2 policies permissivas.

### Fase C — Hardening Auth

- Ativar **Leaked Password Protection** no painel Supabase (sua ação manual, fora de migration).
- Confirmar protected routes do `/admin` no front (já existe `is_super_admin`, validar).

### Fase D — Performance + Testes (não bloqueia produção)

- Remover índices duplicados (9), criar índices em 15 FKs.
- Wrap `auth.uid()` → `(select auth.uid())` nas policies quentes.
- Suíte de regressão de RLS + wallet (crédito/débito/refund/idempotência Stripe).

---

## Verificação após cada fase

- Re-rodar `supabase--linter` + `security--get_scan_results`.
- Smoke-test fluxo principal: LP → lead WhatsApp → bot → OCR → cadastro portal → wallet topup.
- Conferir `/admin` e `/admin/saude-bot` continuam carregando.

---

## Pergunta para você antes de eu codar

Quer que eu rode **as 4 fases em sequência (com aprovação a cada migration)**, ou só a **Fase A (vazamentos)** primeiro e depois decidimos?

 **"tudo"**