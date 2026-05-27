# Plano de Hardening Pré-Produção

Confirmei via linter + queries diretas no Postgres: todos os achados do diagnóstico estão corretos (10 tabelas RLS sem policy, 28 funções SECURITY DEFINER executáveis por `anon`, 6 buckets públicos, 100+ policies com `auth.uid()` não-cacheado). O plano abaixo separa o que é **bloqueador de go-live** do que é **dívida pra semana 1**.

---

## FASE 1 — Bloqueadores de go-live (uma migration por bloco)

### 1.1 RLS sem policy → fechar acesso autenticado, manter service_role

Tabelas: `ai_cooldown_state`, `customer_flow_state`, `customer_processing_lock`, `gemini_quota_bucket`, `inbound_media_failures`, `inbound_media_retry`, `outbound_message_log`, `pending_outbound_media`, `webhook_message_dedup`, `webhook_rate_limit`.

Padrão por tabela (todas são internas, usadas por edge functions):

```sql
REVOKE ALL ON public.<t> FROM anon, authenticated;
GRANT ALL ON public.<t> TO service_role;
CREATE POLICY "service_role_only" ON public.<t> FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Exceção: `customer_flow_state` deve permitir SELECT ao dono via join em `customers.consultant_id = auth.uid()` (já lido pelo painel).

### 1.2 Policies "Always True" em INSERT — `crm_page_events`, `page_events`, `page_views`

- Manter INSERT aberto (são telemetria pública), mas:
  - Adicionar `WITH CHECK (consultant_id IS NOT NULL AND length(coalesce(path,'')) < 2048 AND pg_column_size(payload) < 8192)` para limitar lixo.
  - Adicionar rate-limit por IP via edge function (`track-event`) no lugar de PostgREST direto; revogar INSERT de `anon` para forçar passar pela função.

### 1.3 REVOKE EXECUTE em funções SECURITY DEFINER sensíveis

```sql
REVOKE EXECUTE ON FUNCTION
  public.clone_bot_flow_as(uuid,text),
  public.consume_gemini_token(uuid,integer),
  public.try_acquire_rate_limit(text,integer,integer),
  public.seed_flow_d(uuid),
  public.reserve_media_send(uuid,uuid,uuid,text,text),
  public.confirm_media_send(uuid,boolean),
  public.ai_cooldown_check_and_set(text,integer,text),
  public.try_acquire_customer_lock(uuid,integer),
  public.release_customer_lock(uuid,uuid),
  public.sweep_orphan_media_reservations(integer)
FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION ... TO service_role;
```

Wallet (`credit/debit/refund_consultant_wallet`) e `admin_unpause_global_bot`:

- `REVOKE EXECUTE FROM anon, authenticated;` (já existem; só edge functions com service_role chamam).
- `fb_emit_capi` / `fb_trigger_*`: revogar de authenticated; são triggers + edge.

### 1.4 Buckets públicos — bloquear LIST, manter GET por URL

Para cada bucket (`ai-agent-media`, `consultant-photos`, `IMAGE`, `simulator-uploads`, `video igreen`, `whatsapp-media`):

- Manter `public=true` (URL direta funciona sem policy).
- Dropar policies `SELECT` abertas em `storage.objects` e substituir por policy que só responde com `bucket_id = '<bucket>' AND auth.role() = 'service_role'` para LIST; `anon` continua acessando via URL pública diretamente (não passa por policy).

### 1.5 Auth — Leaked Password Protection

Habilitar no painel: Authentication → Providers → Email → "Prevent use of leaked passwords". Não é migration; instrução manual no runbook + link.

### 1.6 Validação dos callers de wallet

- Auditar `src/**` e `supabase/functions/**`: confirmar que nenhum caller frontend chama `supabase.rpc('credit/debit/refund_consultant_wallet')` direto.
- Único caller permitido: `wallet-stripe-webhook` (já usa service_role).
- Adicionar comentário SQL `COMMENT ON FUNCTION ... IS 'INTERNAL: service_role only';` para futuras revisões.

---

## FASE 2 — Hardening de semana 1

### 2.1 Performance Postgres

- Migration que reescreve policies críticas em `customers`, `bot_flows`, `crm_deals`, `conversations`, `messages`, `ai_decisions`, `ai_agent_logs` substituindo `auth.uid()` por `(select auth.uid())`.
- Migration consolidando policies múltiplas (FOR ALL vs FOR SELECT redundantes) — reduzir de 5 para 2 por tabela quando possível.
- Migration: drop dos 9 índices duplicados; criar índice nas 15 FKs sem cobertura; remover 30+ índices nunca usados (validar via `pg_stat_user_indexes`).
- Adicionar PK em `webhook_message_dedup (message_id)`.

### 2.2 Testes regressão (Vitest + Deno test)

Mínimos para destravar deploy seguro:

- `supabase/functions/wallet-stripe-webhook/*_test.ts`: crédito idempotente, refund, débito sem saldo (gera debt).
- `src/lib/whatsapp/__tests__/`: roteamento whapi vs evolution.
- `supabase/functions/__tests__/rls_regression_test.ts`: cliente anon NÃO consegue `select * from customers`, NÃO consegue `rpc credit_consultant_wallet`, NÃO consegue listar `storage.objects` em buckets sensíveis.
- OCR happy-path com fixture (`fixtures/conta-energia.pdf`).

---

## FASE 3 — Runbook de execução

1. Backup snapshot (Supabase → Database → Backups).
2. Aplicar migrations 1.1 → 1.4 em ordem; rodar smoke-test do bot em sandbox (1 lead novo end-to-end).
3. Habilitar 1.5 no painel.
4. Deploy + monitorar `edge_function_logs` por 24h (whapi-webhook, wallet-stripe-webhook).
5. Fase 2 aplicada gradualmente, uma migration por dia, validando query plan com `EXPLAIN`.

---

## Detalhes técnicos

- Engine do flow, edge functions e Deno NÃO serão tocados — apenas grants/policies/funções.
- Nenhuma migration altera dados; só DDL + REVOKE/GRANT.
- Rollback: cada bloco vem com migration reversa (pre-existente em git history).
- Estimativa total: Fase 1 ≈ 4-6h de implementação + 2h smoke; Fase 2 ≈ 2-3 dias com testes.

## Confirmação necessária antes de implementar

1. Posso considerar `customer_flow_state` como **leitura pelo dono via consultant_id**? (afeta painel /admin) FLOW PODE SER COMPARTILHADO EM PUBLICO OU PRIVADO
2. Algum frontend chama `rpc('clone_bot_flow_as'|'seed_flow_d')` direto? Se sim, mover para edge function antes do REVOKE. AINDA NAO PODE SER FUTURAMENTE
3. Buckets `IMAGE` e `simulator-uploads` — posso assumir que servem só por URL pública (sem LIST no app)? SIM IMAGENS MUITAS SERAO PUBLICAS E OUTRAS PRIVADAS, ENTAO IMAGEM VIDEO AUDIO, SEMPRE DEIXE UM BOTAO PARA DEICAR PUBLICO OU PRIVADO  
  
CUIDADO BLOQUEAR ALGO E NAO FUCNIOAR 
4. &nbsp;