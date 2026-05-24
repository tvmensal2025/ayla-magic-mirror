# 🛠️ Plano de Execução — Baseado na Auditoria

Plano acionável derivado do relatório em `.lovable/plan.md`. Cada fase é independente e pode ser aprovada/executada isoladamente.

---

## Fase 0 — Operacional (rápido, 1 sessão)

**Objetivo**: destravar alertas e organizar a casa antes de mexer em código crítico.

1. **Arquivar documentação solta** (P3)
  - Criar `docs/archive/` e mover ~65 `.md` históricos da raiz (ANALISE_*, CORRECAO_*, DEPLOY_*, RESUMO_*, STATUS_*, TESTE_*, IMPLEMENTACAO_*, MIGRACAO_*, PASSO_*, COMANDOS_*, GUIA_*, INDICE_*, INICIO_*, INSTALAR_*, SIMULADO_*, SOLUCAO_*, SUPABASE_CLI_*, TROUBLESHOOTING_*, URGENTE_*, VERIFICAR_*, VISUAL_*, WEBHOOK_*, EXEMPLOS_*, EXECUTANDO_*, FLUXO_*, CHANGELOG_*, ATUALIZACOES_*, ACESSO_*, CORRIGIR_*, ESTRUTURA_*, KIRO_AUDIT, MAPA_*, NOMENCLATURA_*, PLANO_*, PORTAL_*, PROXIMOS_*, RESUMO_*).
  - Manter na raiz: `README.md`, `DOCUMENTATION.md`, `LAUNCH_OPS.md`, `ANALISE_COMPLETA_CODIGO.md` (mais recente).
  - Criar `docs/README.md` com índice por tema.
2. **Criar `.env.example**` (P7)
  - `supabase/functions/.env.example` documentando os ~25 secrets (MINIO_*, EVOLUTION_*, WHAPI_*, GEMINI_*, LOVABLE_API_KEY, PORTAL_WORKER_URL, WORKER_SECRET, FACEBOOK_*, SENTRY_DSN).
  - Sem valores reais — só nomes + descrição + "obrigatório/opcional".
3. **Padronizar nome de variável duplicada** (P7)
  - Buscar `WORKER_PORTAL_URL` vs `PORTAL_WORKER_URL` em edge functions; criar issue/comentário marcando para unificar (sem renomear ainda — risco em prod).
4. **Documentar pendências de cron** (P12)
  - Adicionar nota no topo do `LAUNCH_OPS.md` lembrando de rodar `cron_setup.sql` e preencher `super_admin_phone`. (não dá pra rodar pg_cron via migration sem chaves; fica como instrução manual).

**Critério de pronto**: raiz limpa (≤10 `.md`), `.env.example` versionado, `LAUNCH_OPS.md` com aviso no topo.

---

## Fase 1 — Segurança SQL (alto valor, médio risco)

**Objetivo**: zerar findings críticos do Supabase Linter (112 atualmente).

1. **Inventário** (read-only)
  - Listar via `supabase--read_query` todas as funções `SECURITY DEFINER` no schema `public` com seus `EXECUTE` grantees.
  - Listar 10 tabelas com RLS sem policy.
  - Listar buckets públicos com policy de SELECT aberta.
  - Listar 3 policies `USING (true)` / `WITH CHECK (true)`.
2. **Migration 1 — Revoke SECURITY DEFINER públicos** (P2)
  - Para cada função não destinada a ser chamada via PostgREST: `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated`.
  - Para helpers internos: marcar como `SECURITY INVOKER` se não dependem de bypass RLS.
3. **Migration 2 — Tabelas órfãs de policy** (P2)
  - Para as 10 tabelas: adicionar policy "deny by default" explícita ou policy real baseada em `tenant_id`/`consultant_id`.
4. **Migration 3 — Buckets públicos** (P2)
  - Trocar `USING (true)` por filtro de prefixo de pasta por consultor (`(storage.foldername(name))[1] = consultant_slug`).
  - Manter público só `igreen` (assets de LP).
5. **Migration 4 — Policies permissivas** (P2)
  - Substituir `WITH CHECK (true)` em UPDATE/DELETE/INSERT por filtros reais (`auth.uid() = user_id` ou `has_role`).
6. **Validação**: rodar `supabase--linter` antes e depois; meta: < 20 findings.

**Risco**: migration pode quebrar features se função for chamada de algum hook RPC do front. **Mitigação**: rodar `rg "\.rpc\(['\"]<fn_name>" src/` antes de cada `REVOKE`.

**Critério de pronto**: linter abaixo de 20 issues; nenhum erro 403 novo em logs.

---

## Fase 2 — Deduplicação do Bot Engine (refactor grande)

**Objetivo**: matar a duplicação Whapi/Evolution (P1, P8).

1. **Decisão prévia** (precisa do usuário): manter Whapi vivo ou cutover total para Evolution?
  - Memória atual diz Whapi = ativo, Evolution = espelho futuro. Vou assumir **manter ambos**
2. **Extração do engine** (não-quebra)
  - Criar `supabase/functions/_shared/bot-engine/` com:
    - `runBotFlow.ts` (lógica copiada do Whapi como fonte da verdade)
    - `dispatchStep.ts`, `resolveStep.ts`, `captureHandler.ts`, `aiHandler.ts`
    - `types.ts` (ParsedMessage, BotContext, ChannelAdapter)
  - Mover `_shared/channels/` para usar o novo engine.
3. **Adapter pattern**
  - `WhapiAdapter` e `EvolutionAdapter` implementam `ChannelAdapter` (já existe base).
  - Cada `index.ts` de webhook vira ~200 linhas: parse payload → seleciona adapter → `runBotFlow(ctx, adapter)`.
4. **Migração progressiva**
  - Whapi-webhook passa a delegar para `_shared/bot-engine/` (mantém shim de compatibilidade).
  - Evolution-webhook passa a delegar também.
  - Deletar handlers duplicados quando paridade comprovada por 1 semana de logs.
5. **Testes**
  - Suite Deno em `_shared/bot-engine/__tests__/` cobrindo: welcome, capture flow, OCR review, handoff, A/B/C variants.
  - Smoke test no FlowSimulator (sandbox) com 4 variants.

**Critério de pronto**: ambos webhooks com <500 linhas; logs idênticos para mesmo input; testes verdes.

**Risco**: 🔴 alto. Requer flag de rollback (`use_shared_engine`) em `app_settings`.

---

## Fase 3 — God Functions & Componentes Grandes

**Objetivo**: P6 + P10.

1. **Edge functions >1k linhas**
  - `evolution-webhook/index.ts` (1 640) → dispatcher + handlers por tipo de evento.
  - `ai-sales-agent` (1 239) → separar prompts, retrieval, post-processing.
  - `manual-step-send` (1 138) → engine de step + sender + capture trigger.
  - `whapi-webhook/index.ts` (1 305) → idem ao evolution.
2. **Componentes React >700 linhas**
  - `CreateCampaignWizard.tsx` → um arquivo por step do wizard.
  - `NetworkPanel.tsx`, `BulkSendPanel.tsx`, `ContactImporter.tsx`, `useWhatsApp.ts` → splitar por preocupação.
3. **Padrão**: cada extração vem com teste mínimo (Vitest snapshot) para não regredir.

**Critério de pronto**: nenhum arquivo `.ts`/`.tsx` > 800 linhas (exceto `types.ts` autogen).

---

## Fase 4 — Qualidade & DX

1. **Migrations baseline** (P5)
  - Gerar snapshot `0000_baseline_2026_05.sql` via `pg_dump --schema-only`.
  - Mover 367 migrations antigas para `supabase/migrations/_archive/`.
  - Manter só `0000_baseline_*` + novas migrations a partir dali.
2. **Helper `admin-client.ts**` (P9)
  - Wrapper único em `_shared/admin-client.ts` que cria client service_role + loga origem.
  - Substituir uso direto de `createClient(...SERVICE_ROLE_KEY)` por `getAdminClient(functionName)`.
3. **Lint hygiene** (P11)
  - Rodar `eslint --fix` global.
  - Trocar 37 `console.log` por `logger.ts`.
  - Regra ESLint: `@typescript-eslint/no-explicit-any: warn`.
4. **Deprecação de duplicatas** (P13, P15)
  - Apagar `supabase/functions/flow-simulate/` (mantido só `flow-simulate-run`).
  - Consolidar `worker-portal/teste-*.mjs` (9 scripts) em 1 só com flags.
5. `**.kiro/specs` cleanup** (P14)
  - Mover specs concluídas para `.kiro/specs/_done/`.

**Critério de pronto**: ESLint sem warnings novos; migration count < 50; nenhum `console.log` em src/.

---

## Fase 5 — Polimento Final

- SEO: aplicar `<SEOHead>` em todas as páginas públicas (P17).
- `robots.txt` por tenant ou `noindex` em `/licenca/preview` (P18).
- `bun audit` + atualizar `pdfjs-dist` (P16, P20).
- Cobertura Playwright E2E do fluxo de captação completo (lead → OCR → aprovação).
- Rate limit persistente em DB (substituir Map em memória).

---

## Sequência sugerida

```text
Semana 1: Fase 0 + Fase 1 (operacional + segurança)
Semana 2-4: Fase 2 (deduplicação engine) — requer flag de rollback
Semana 5: Fase 3 (god functions)
Semana 6: Fase 4 (qualidade/DX)
Contínuo: Fase 5 (polimento)
```

---

## O que eu preciso de você antes de começar

1. **Confirmar a Fase 0** (movimentação de docs + `.env.example`) — é segura, posso fazer agora.
2. **Política para Whapi/Evolution na Fase 2**: continua ambos rodando 100% igual apenas evolution n tem botao e whapi sim
3. **Janela de manutenção** para Fase 1 (migrations de segurança podem causar 403 transitório).

Faça tudo com segurança e cuidado para não quebrar nada