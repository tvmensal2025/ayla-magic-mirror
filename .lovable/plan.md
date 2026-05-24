
# 🔍 Auditoria Completa — Sistema iGreen (somente leitura)

> Nenhum arquivo, código, banco, variável ou configuração foi alterado.
> Este documento é só diagnóstico + plano de melhoria.

---

## 1. Visão geral do sistema

- **Stack**: Vite + React 18 + TS + Tailwind + shadcn, Supabase (Postgres + Edge Functions Deno), MinIO, Evolution API (WhatsApp), Whapi (legado), Gemini/Lovable AI Gateway, Meta Ads, Stripe, Sentry.
- **Tamanho**: ~127k linhas TS/TSX, **20 páginas**, **45 hooks**, **99 edge functions**, **367 migrations**, **32 entradas em `config.toml`**.
- **Domínio**: plataforma multi-tenant para consultores iGreen (landing pages + CRM WhatsApp + Meta Ads + captação por OCR de conta de luz).

---

## 2. Saúde geral

| Área | Status |
|---|---|
| Funcionalidade núcleo (WhatsApp bot, OCR, CRM) | 🟢 funcionando, com muitas camadas |
| Arquitetura backend (edge functions) | 🟠 madura, mas inchada e duplicada |
| Banco / RLS | 🟠 RLS habilitado, mas com 112 issues no linter |
| Segurança | 🟠 vários SECURITY DEFINER expostos, buckets públicos |
| Documentação interna | 🔴 ~70 arquivos `.md` soltos na raiz, sem hierarquia |
| Frontend / UX | 🟢 design system consistente (Tailwind tokens) |
| Performance | 🟠 arquivos enormes (>4k linhas) sem split |
| Testes | 🟠 cobertura pontual (Vitest + Playwright), sem suite E2E real |
| Mobile / responsivo | 🟢 layout responsivo declarado (viewport user em 781px) |
| Escalabilidade | 🟠 documentada (LAUNCH_OPS.md), mas com gargalos identificados |

---

## 3. Problemas encontrados (no formato pedido)

### 🔴 CRÍTICO

#### P1 — Duplicação massiva do motor do bot WhatsApp
1. **Local**: `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (4 788 linhas) e `supabase/functions/evolution-webhook/handlers/bot-flow.ts` (4 442 linhas). Idem para `conversational/index.ts` (2 178 vs 2 067 linhas).
2. **O que acontece**: dois engines quase idênticos, um para cada provedor (Whapi e Evolution). Mudanças precisam ser feitas em dois lugares.
3. **Risco**: divergência silenciosa de comportamento entre canais; bugs corrigidos em um lado e não no outro.
4. **Impacto**: dobra o custo de manutenção, multiplica risco de regressão a cada release.
5. **Gravidade**: **CRÍTICO**.
6. **Como corrigir (futuro)**: extrair `runBotFlow` para `_shared/bot-engine/` com adapter pattern (já existe a base em `_shared/channels/`); deprecar progressivamente Whapi e manter Evolution como canal único.

#### P2 — 112 findings no Supabase Linter
1. **Local**: schema `public` (banco).
2. **O que acontece**:
   - 10× RLS habilitado **sem nenhuma policy** (tabela exposta como “bloqueada”, mas sem rota de acesso definida — leitura via service_role só, e qualquer release que aliviar isso explode).
   - 3× policy `USING (true)` / `WITH CHECK (true)` em UPDATE/DELETE/INSERT.
   - 6× buckets de Storage públicos com listing aberto.
   - ~90× funções `SECURITY DEFINER` executáveis por `anon` ou `authenticated` (escalada de privilégio potencial).
3. **Risco**: superfície de ataque grande; um single bug em função `SECURITY DEFINER` pode dar acesso a dados de outros tenants.
4. **Impacto**: vazamento multi-tenant, manipulação de leads/CRM, escalada para admin.
5. **Gravidade**: **CRÍTICO**.
6. **Como corrigir (futuro)**: auditar cada função (`REVOKE EXECUTE FROM anon, authenticated` onde aplicável), trocar para `SECURITY INVOKER` quando possível, fechar buckets públicos com policy de pasta por consultor, criar policies explícitas nas 10 tabelas órfãs.

#### P3 — Documentação interna fora de controle
1. **Local**: raiz do projeto.
2. **O que acontece**: **70+ arquivos `.md`** soltos (ANALISE_*, CORRECAO_*, DEPLOY_*, RESUMO_*, STATUS_*, TESTE_*…). Muitos descrevem o mesmo assunto em fases diferentes (ex.: `ANALISE_ERROS_SISTEMA_COMPLETA.md` já lista 9 problemas conhecidos não tratados).
3. **Risco**: ninguém sabe qual documento é a verdade atual; onboarding impossível; decisões contraditórias.
4. **Impacto**: lentidão de desenvolvimento, perda de conhecimento, retrabalho.
5. **Gravidade**: **CRÍTICO** para escalar o time.
6. **Como corrigir (futuro)**: mover histórico para `/docs/archive/`, manter só `README.md`, `DOCUMENTATION.md`, `LAUNCH_OPS.md`, `CHANGELOG.md` na raiz; consolidar em `docs/` por tema.

---

### 🟠 ALTO

#### P4 — `src/integrations/supabase/types.ts` com 5 242 linhas
1. Arquivo auto-gerado já bate teto de hot reload, pesa em TS server.
2. **Risco**: lentidão crescente do tsserver / IDE.
3. **Impacto**: DX ruim, build lento.
4. **Gravidade**: alto.
5. **Como corrigir**: dividir o schema em domínios (campaigns/, crm/, whatsapp/) via geração custom; ou aceitar como custo do Supabase e isolar (já é o caso).

#### P5 — 367 migrations e crescendo
1. **Local**: `supabase/migrations/`.
2. **O que acontece**: muitas migrations corrigem migrations anteriores (`*flag*`, `*canonical*`, `*v2*`, `*v3*`).
3. **Risco**: aplicar do zero (DR) leva muito tempo; risco de migration órfã quebrar.
4. **Impacto**: disaster recovery lento; novos ambientes (staging) custosos.
5. **Gravidade**: alto.
6. **Como corrigir**: gerar snapshot consolidado (`pg_dump --schema-only`) periódico como "baseline" e arquivar migrations antigas.

#### P6 — Edge functions com >1 000 linhas (god functions)
1. **Local**: `evolution-webhook/index.ts` (1 640), `ai-sales-agent` (1 239), `manual-step-send` (1 138), `ai-agent-router` (999), `whapi-webhook/index.ts` (1 305).
2. **O que acontece**: lógica de roteamento, validação, IA, persistência tudo num arquivo.
3. **Risco**: cold start maior, difícil testar, qualquer alteração tem efeito colateral.
4. **Impacto**: bugs sutis no fluxo crítico de captação.
5. **Gravidade**: alto.
6. **Como corrigir**: extrair handlers por intent/etapa para `_shared/` e manter `index.ts` só como dispatcher.

#### P7 — Estrutura de variáveis de ambiente confusa
1. **Local**: `.env` (root) + `ANALISE_ERROS_SISTEMA_COMPLETA.md` lista lacunas históricas.
2. **O que acontece**: `.env` do front contém só chaves públicas; o lado backend (edge) depende de 25+ secrets (`MINIO_*`, `EVOLUTION_*`, `WHAPI_*`, `WORKER_*`, `PORTAL_WORKER_URL` vs `WORKER_PORTAL_URL` — variações redundantes), sem `.env.example` para conferência.
3. **Risco**: deploy esquecer secret ⇒ função quebra silenciosamente.
4. **Impacto**: outages em features (OCR, MinIO upload, notificações).
5. **Gravidade**: alto.
6. **Como corrigir**: criar `supabase/functions/.env.example` documentando todas as secrets; padronizar nome único `PORTAL_WORKER_URL`; adicionar guard `assertEnv()` no boot de cada função.

---

### 🟡 MÉDIO

#### P8 — Bot flow com dois webhooks ativos
- Memória do projeto diz “whapi-webhook é o ativo, evolution-webhook é espelho futuro”. Mas ambos estão deployados com `verify_jwt = false`. Risco de tráfego duplicado e race condition em `customers`. **Correção futura**: marcar Evolution como dark/shadow até cutover; gate via feature flag em `app_settings`.

#### P9 — `service_role_key` usado em muitas edge functions
- 60+ funções usam `SUPABASE_SERVICE_ROLE_KEY`. Está correto (server-side), mas sem helper centralizado para auditoria. **Correção futura**: criar `_shared/admin-client.ts` que loga origem da chamada e sirva de ponto único.

#### P10 — Arquivos React grandes (>700 linhas)
- `CreateCampaignWizard.tsx` (1 355), `NetworkPanel.tsx` (878), `ContactImporter.tsx` (794), `useWhatsApp.ts` (781), `AdminFaq.tsx` (673), `BulkSendPanel.tsx` (727). Difíceis de testar. **Correção futura**: dividir em subcomponents + hooks por seção.

#### P11 — `console.log` espalhados (37 ocorrências) e 104 usos de `any`
- Reduz qualidade dos tipos e polui prod. **Correção futura**: rodar `eslint --fix`, trocar por `logger.ts` (já existe), banir `any` com regra ESLint.

#### P12 — Bot Global Kill Switch e cron jobs ainda **pendentes** (LAUNCH_OPS.md)
- `super_admin_phone` não preenchido ⇒ alertas SuperAdmin não disparam.
- `cron_setup.sql` ainda não rodado ⇒ `minio-quota-check`, `super-admin-alerts` não estão agendados.
- **Correção futura**: rodar SQL manualmente (instruções já no `LAUNCH_OPS.md`).

#### P13 — `flow-simulate` (legado) coexiste com `flow-simulate-run` (novo)
- Mantém duas implementações de simulador. **Correção futura**: deprecar `flow-simulate` após validar `flow-simulate-run` por 1 semana.

---

### 🔵 BAIXO

- P14 — `.kiro/specs/` contém 8 specs paralelas (algumas obsoletas); limpar.
- P15 — `worker-portal/` tem 9 scripts `teste-*.mjs` redundantes; consolidar.
- P16 — `dependabot/npm audit` não rodado nesta auditoria; recomenda-se rodar.
- P17 — SEO/Meta tags por página: `SEOHead.tsx` existe mas só algumas páginas usam.
- P18 — Sem `robots.txt` por tenant (todos os `/licenca` indexáveis).
- P19 — PWA service worker corretamente bypassado em iframe; ok, só monitorar.
- P20 — `pdfjs-dist@4.4.168` desatualizado vs últimas patches.

---

## 4. O que está bem construído

- **Design system tokenizado** (Tailwind + HSL semantic tokens) — consistência visual.
- **Memory system** (`mem://`) — rastreia decisões de produto, evita re-trabalho.
- **A/B/C/D test flow variants** com round-robin no `customers.flow_variant`.
- **Sandbox simulator** (recente) — isola corretamente lado de produção via `is_sandbox` + triggers.
- **Auto-takeover humano** (`bot_paused` + `assigned_human_id`) silencia todos os crons — bem desenhado.
- **MinIO + compress-worker** — pipeline de mídia organizada (vídeo 720p) com fallback Supabase.
- **Sentry** + `logger.ts` + `useTrackEvent` — observabilidade básica funcionando.
- **PWA installer** com guards de preview/iframe — evita poluir builds de dev.

---

## 5. Riscos principais antes de escalar (top 5)

1. **Duplicação Whapi/Evolution** quebrando em produção pós-release (P1).
2. **Privilégio escalado** via SECURITY DEFINER + bucket público (P2).
3. **Secrets faltando** em deploy novo (P7).
4. **Alertas SuperAdmin não disparam** porque cron + telefone não configurados (P12).
5. **DR custoso** por 367 migrations + types.ts gigante (P4, P5).

---

## 6. Ordem recomendada de correção

```text
Fase 0 — Operacional (1 dia)
  1. Preencher super_admin_phone e rodar cron_setup.sql (P12)
  2. Criar .env.example documentando todas as secrets (P7)
  3. Mover docs antigos para docs/archive/ (P3)

Fase 1 — Segurança (3-5 dias)
  4. Auditar funções SECURITY DEFINER (P2)
  5. Fechar buckets públicos / adicionar policies (P2)
  6. Adicionar policies nas 10 tabelas RLS sem policy (P2)
  7. Substituir USING(true)/WITH CHECK(true) por filtros reais (P2)

Fase 2 — Arquitetura backend (2-3 semanas)
  8. Definir Evolution como canal único; congelar Whapi (P1, P8)
  9. Extrair bot-engine para _shared/ com adapter (P1)
 10. Quebrar god functions (>1k linhas) em handlers menores (P6)
 11. Helper centralizado de admin-client (P9)

Fase 3 — Qualidade & DX (1-2 semanas)
 12. Snapshot baseline + arquivar migrations antigas (P5)
 13. Refatorar componentes React >700 linhas (P10)
 14. Limpar console.log + banir any no ESLint (P11)
 15. Deprecar flow-simulate antigo (P13)

Fase 4 — Polimento (contínuo)
 16. Resolver itens 🔵 baixos (P14–P20)
 17. Subir cobertura de testes Playwright para fluxo de captação E2E
```

---

## 7. Checklist antes de **publicar** (release)

- [ ] Bot Global kill switch ATIVO e testado
- [ ] `super_admin_phone` preenchido
- [ ] Crons agendados (`minio-quota-check`, `super-admin-alerts`)
- [ ] `.env.example` atualizado e todos secrets validados no Supabase
- [ ] Migrations linter sem erros novos (`supabase db lint`)
- [ ] Sentry recebendo eventos do front e edge
- [ ] Cookie banner e Política de Privacidade publicados
- [ ] Backup do banco confirmado (último < 24h)
- [ ] Build do front sem warnings novos
- [ ] Edge functions com `verify_jwt` revisado por função

## 8. Checklist antes de **escalar** (100+ consultores)

- [ ] Whapi descontinuado, Evolution como único canal
- [ ] Bot-engine deduplicado em `_shared/`
- [ ] God functions quebradas
- [ ] SECURITY DEFINER auditadas, buckets fechados, RLS sem buracos
- [ ] Pool de instâncias Evolution dimensionado (16 GB RAM / 6 vCPU, ver LAUNCH_OPS)
- [ ] MinIO com 500 GB livres + alerta < 85%
- [ ] Worker-portal com 3 réplicas
- [ ] Rate limit persistente (Redis ou DB) em vez de Map em memória
- [ ] Snapshot baseline das migrations
- [ ] Runbook de incidentes treinado com o time
- [ ] Custos Gemini/Lovable AI monitorados (alerta de saldo)

---

## 9. Sugestão de arquitetura ideal (alvo de 12 meses)

```text
┌────────────────────────────────────────────────────────────────┐
│                       FRONT (Vite + React)                     │
│  /licenca (LP)  /admin (CRM)  /super-admin (ops)  /assistente  │
│  Tokens HSL · TanStack Query · Suspense · PWA (prod-only)      │
└──────────────────────┬────────────────────────────────────────┘
                       │ supabase-js (anon)
┌──────────────────────▼────────────────────────────────────────┐
│                       SUPABASE (Postgres + Edge)               │
│  • Schema por domínio: crm, captacao, ads, infra, ai           │
│  • RLS estrito · funções SECURITY INVOKER por padrão           │
│  • pg_cron orquestra jobs                                      │
│  • Storage: só metadados; binários em MinIO                    │
└──────┬───────────────────────────────────┬────────────────────┘
       │                                   │
┌──────▼──────────┐               ┌────────▼────────┐
│ Bot-engine v1   │               │ Meta Ads engine │
│ (_shared, único)│               │ (edge functions)│
│  ↕ Adapter      │               └─────────────────┘
│  Evolution API  │
│  (canal único)  │
└──────┬──────────┘
       │
┌──────▼─────────┐   ┌──────────┐   ┌────────────┐
│ Worker Portal  │   │ MinIO    │   │ AI Gateway │
│ (Playwright)   │   │ (mídia)  │   │ (Gemini)   │
└────────────────┘   └──────────┘   └────────────┘
```

Princípios:
- **Um único canal WhatsApp** (Evolution) com adapter pluggable.
- **Bot-engine único** em `_shared/bot-engine/`, consumido por qualquer adapter (Evolution / Simulator / futuro WABA oficial).
- **Schemas por domínio** no Postgres, RLS estrita, `SECURITY INVOKER` padrão.
- **Docs** consolidados em `/docs` com índice; histórico em `/docs/archive`.
- **Migrations** com baseline anual + diffs.
- **Observabilidade**: Sentry (front+edge) + tabela `bot_flow_logs` + dashboards no SuperAdmin.
- **Feature flags** em `app_settings` para qualquer rollout (já parcialmente em uso com `flow_engine_v3_flag`).

---

## 10. Resumo executivo

O sistema é **funcional e ambicioso**, com boas escolhas (Tailwind tokens, sandbox simulator, feature flags, memory). Mas carrega **dívida técnica significativa** acumulada de migrações de canal (Whapi → Evolution), proliferação de documentação solta e uma camada de segurança SQL que precisa de auditoria séria antes de escalar para 100+ consultores.

**Veredito**: 🟠 pode publicar para piloto controlado, **não recomendo escalar agressivamente sem cumprir a Fase 0 + Fase 1**.

Nenhuma alteração foi feita. Quando quiser executar qualquer item, me peça e eu trabalho um por vez.
