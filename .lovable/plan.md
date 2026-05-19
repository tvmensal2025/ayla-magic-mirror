# Auditoria de segurança — status atual

## Camadas 1 e 2 (concluídas e validadas) ✅

- `settings.key` agora tem `UNIQUE` → upsert do toggle de IA volta a funcionar (fim do erro `ON CONFLICT`).
- `whapi-webhook` filtra `bot_flows` por `variant` do customer → leads não caem mais no welcome legacy do Gemini.
- Leads do super admin presos em `conversation_step='welcome'` foram resetados.
- Linter Supabase: nenhum erro novo introduzido pelas migrações.

## Camada 3 — Revogar EXECUTE de anon em funções administrativas

**Diagnóstico:** 45 funções no schema `public` (todas `SECURITY DEFINER`) têm `EXECUTE` concedido para `anon`. Várias são perigosas se chamadas sem login, mesmo com checagem interna:


| Risco                            | Funções                                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crítico (mexe em dinheiro/dados) | `debit_consultant_wallet`, `credit_consultant_wallet`, `refund_consultant_wallet`, `reset_all_consultant_conversations`, `reset_consultant_analytics`, `cleanup_bot_test_data`, `repair_bot_flow`, `clone_bot_flow_as_b/c`, `seed_default_camila_flow`, `log_admin_action` |
| Médio (escrita auxiliar)         | `enqueue_pending_inbound`, `clear_pending_inbound`, `release_customer_processing_lock`, `try_lock_customer_processing`, `fork_*`, `increment_ab_metric`, `fb_emit_capi`, `bump_ad_template_usage_count`                                                                    |
| Baixo (leitura/utilitário)       | `has_role`, `is_super_admin`, `get_coverage_summary`, `get_platform_pnl`, `lint_bot_flow_consistency`, `assign_flow_variant`, `set_updated_at`, triggers `fb_trigger_*`, `set_*`, `prevent_non_lead_deals`, `create_postsale_deal_on_approval`                             |


**Plano:**

1. Migração única que faz `REVOKE EXECUTE … FROM anon, public` em todas as 45 funções de `public`.
2. Re-conceder `EXECUTE` para `authenticated` (e `service_role` quando necessário) — sem isso o app quebra para usuário logado.
3. Triggers (`set_updated_at`, `fb_trigger_*`, `create_postsale_deal_on_approval`, `prevent_non_lead_deals`, `seed_camila_flow_on_consultant_insert`, `bump_ad_template_usage_count`, `set_bot_messages_updated_at`, `set_customer_flow_variant`, `auto_feedback_on_handoff`, `fb_sync_pixel_to_consultant`) → REVOKE de todos (rodam pelo postgres internamente, ninguém precisa chamar).
4. Verificação: re-rodar a query do auditor e confirmar `anon_exec_fns = 0`.

**Risco:** Se alguma chamada do frontend usar a chave `anon` sem sessão para uma RPC (improvável aqui), ela quebra. Risco baixo — todo o app é autenticado.

## Camada 4 — Buckets públicos com listagem aberta

**Diagnóstico:** 5 buckets `public=true` com policy SELECT ampla em `storage.objects`:


| Bucket              | Conteúdo                     | Listagem deve ser pública?                                                                           |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `consultant-photos` | Fotos de perfil de consultor | Não (URL direta basta)                                                                               |
| `whatsapp-media`    | Mídia dinâmica do WhatsApp   | **Não** (PII de leads)                                                                               |
| `ai-agent-media`    | Áudios/vídeos do agente      | SIM DO super-ADMIN [rafael.ids@icloud.com](mailto:rafael.ids@icloud.com) tem opcao de deixar publico |
| `IMAGE`             | Genérico (auditar conteúdo)  | SIM DO SUPER-ADMIN ELE TEM A OPCAO DE DEIXAR PUBLICA                                                 |
| `video igreen`      | Vídeos institucionais da LP  | Pode (são marketing)                                                                                 |


**Plano:** trocar a policy `SELECT` de `bucket_id = X` por `bucket_id = X AND (storage.foldername(name))[1] IS NOT NULL` **e** restringir o operador de listagem para `authenticated`/owner. Mantém URLs públicas funcionando (download direto continua liberado), mas bloqueia `storage.list()` anônimo.

> **Atenção:** o nome `IMAGE` (maiúsculo) e `video igreen` (com espaço) devem ser confirmados antes da migração — vou usar exatamente o `id` retornado pelo banco.



&nbsp;

---

# Resumo do que está 100% agora

- ✅ Toggle de IA salva sem erro
- ✅ Fluxo da Camila dispara Step 1 com áudio de 10s para novos leads
- ✅ Router respeita variant A/B/C
- ✅ Migrações sem erros de linter

# O que recomendo executar a seguir, na ordem

1. **Camada 3** (REVOKE anon em 45 funções) — migração simples, alto ganho de segurança.
2. **Camada 4** (restringir listagem dos 4 buckets sensíveis) — migração de policy do `storage.objects`.  
  
FACA AS CAMADAS 

&nbsp;