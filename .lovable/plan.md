# Auditoria Profunda — Plataforma iGreen

## Sinais coletados

- **Postgres logs (últimas 24h)**: apenas erros recorrentes de `duplicate key value violates unique constraint "webhook_message_dedup_pkey"` (ruído, não quebra fluxo).
- **Edge functions**: webhook respondendo, bot-loop-watchdog/bot-stuck-recovery rodando saudáveis, fluxo da Camila ativo. Sem erros 5xx recentes.
- **Suppressed rules / bot_flow_rule_fires**: nenhuma referência restante no código ou em funções. Limpeza do Sprint 6 foi 100%.
- **Cron jobs**: todos os 20+ jobs apontam para edge functions existentes. Sem cron órfão.
- **Linter Supabase**: 105 warnings (2 ERROR + 103 WARN). Detalhe por categoria abaixo.
- **Bug funcional encontrado**: `[self-intro]` está capturando "Ainda N" como nome do cliente (extraído de "Ainda não" enviado pelo lead). Bug real de qualidade de dados.
- **Inconsistência de schema**: código usa duas tabelas — `webhook_message_dedup` (audit.ts) e `webhook_message_dedupe` (bot/dedupe.ts). Mantém dois universos de deduplicação.

---

## Camada 1 — CRÍTICO (corrigir já)

### 1.1 Unificar tabela de dedup do webhook
- `supabase/functions/_shared/audit.ts` insere em `webhook_message_dedup` **sem** `onConflict`. Cada retry do Whapi gera ERROR no Postgres log.
- `supabase/functions/_shared/bot/dedupe.ts` usa `webhook_message_dedupe` (nome diferente).
- **Risco**: poluição de log mascara erros reais; dois caminhos de dedup desconectados deixam brechas para mensagem duplicada ser processada.
- **Fix**:
  1. Migration: dropar a tabela órfã (a que tiver menos uso) e padronizar em `webhook_message_dedup`.
  2. Editar `audit.ts` para usar `.upsert({...}, { onConflict: 'message_id', ignoreDuplicates: true })`.
  3. Editar `bot/dedupe.ts` para apontar para a mesma tabela.

### 1.2 Bug do nome "Ainda N" / "Sim"/"Não"
- `whapi-webhook` `[self-intro]` está extraindo a primeira palavra de mensagens curtas como nome. Vimos `name="Ainda N"` no log de produção.
- **Risco**: nomes lixo poluem CRM, mensagens dinâmicas viram "Oi Ainda N!" — péssimo para conversão.
- **Fix**: blacklist de tokens comuns (`sim`, `não`, `ainda`, `oi`, `olá`, `bom dia`, `não sei`, etc.) e exigir ≥2 palavras OU regex de nome próprio antes de gravar `name_source=self_intro`.

---

## Camada 2 — ALTO (corrigir nesta sprint)

### 2.1 Security Definer Views (2 ERRORs do linter)
- Duas views com `SECURITY DEFINER` ignoram RLS do consultante.
- **Fix**: identificar quais views são (rodar `SELECT viewname FROM pg_views WHERE schemaname='public'` + pg_class.relkind) e recriar como `SECURITY INVOKER` ou substituir por function com checagem de role.

### 2.2 RLS Policy Always True (9 WARNs)
- Policies com `USING (true)` ou `WITH CHECK (true)` em INSERT/UPDATE/DELETE.
- **Risco**: tabela pode estar permitindo escrita por qualquer autenticado.
- **Fix**: mapear as 9 policies, classificar (algumas podem ser legítimas: tabelas públicas de leitura — mas WARN exclui SELECT, então são de escrita). Reescrever com checagem de owner via `consultant_id = auth.uid()` ou `has_role`.

### 2.3 Confirmar que `reset_all_consultant_conversations` está corrigida em prod
- Validar com `pg_get_functiondef` que a versão sem `bot_flow_rule_fires` está ativa.

---

## Camada 3 — MÉDIO

### 3.1 SECURITY DEFINER functions executáveis por anon (43 WARNs) + por authenticated (38 WARNs)
- A maioria valida `auth.uid()` internamente. Mas funções como `repair_bot_flow`, `clone_bot_flow_as_b`, `cleanup_bot_test_data`, `seed_default_camila_flow` não deveriam ser chamáveis por anon.
- **Fix**: `REVOKE EXECUTE ... FROM anon` em todas funções administrativas; manter EXECUTE só para `authenticated` quando a função tem validação interna; remover EXECUTE de `authenticated` em funções puramente admin (`admin_unpause_global_bot`, `log_admin_action`, `cleanup_bot_test_data`).

### 3.2 Public Bucket Allows Listing (5 WARNs)
- Buckets públicos com SELECT amplo em `storage.objects` permitem listar todo conteúdo.
- **Risco**: vazamento de nomes de arquivo (URLs preditivas → enumeração de mídias de outros consultores).
- **Fix**: restringir SELECT a `bucket_id=X AND (storage.foldername(name))[1] = auth.uid()::text` para buckets dinâmicos; manter listing aberto só em buckets de assets estáticos (MinIO já é o canônico para isso, então buckets Supabase públicos devem ser auditados).

### 3.3 Limpeza de edge functions obsoletas
- 75+ functions. Pela memory: `evolution-*` é "espelho futuro" não usado. Confirmar e desativar/remover (`evolution-proxy`, `evolution-webhook`) ou marcar como reservadas para evitar superfície de ataque/custo.

---

## Camada 4 — BAIXO (higiene)

- **RLS Enabled No Policy (1 INFO)**: 1 tabela com RLS ligado e zero policy → ninguém acessa nada. Provavelmente intencional (tabela só acessada por edge function via service role). Documentar.
- **Métricas A/B**: validar que `flow_variant` está sendo atribuído uniformemente (round-robin A/B/C). Query rápida pós-fix.
- **DOCUMENTATION.md**: atualizar com sprints recentes (suppressed_rules removida, whitelist de feedback, dedup unificado).

---

## Entrega proposta

Uma migration única (Camadas 1.1 + 2.1 + 2.2 + 3.1 + 3.2) + dois edits de edge function (Camadas 1.1 código + 1.2). Antes de codar, eu:

1. Leio as 2 views SECURITY DEFINER e as 9 policies "always true" para validar caso a caso.
2. Mapeio quais SECURITY DEFINER functions devem perder EXECUTE de anon.
3. Confirmo via `pg_get_functiondef` o estado real em produção.

Aprovado eu inicio pela **Camada 1** (crítico, baixo risco, alto impacto), depois sequencialmente 2 → 3 → 4. Cada camada vira uma migration revisável separada para você poder pausar/aprovar entre etapas.

### Validação pós-deploy

Por camada: roda linter, confere contagem de warnings, query de sanidade em prod, e tail dos edge function logs por 10min para garantir zero regressão.
