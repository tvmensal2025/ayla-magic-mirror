
# Auditoria Completa — Estado Atual do Projeto

## Veredito: **SIM, pode iniciar os trabalhos** ✅

O sistema está estável e seguro nas camadas críticas. Existem 3 áreas de organização que valem ser tratadas em ticket separado (não bloqueantes).

---

## 1. Inventário do que existe

| Camada | Quantidade | Estado |
|---|---|---|
| Páginas (rotas) | 16 | Organizadas em `src/pages/` |
| Componentes | ~80 (admin, superadmin, whatsapp, licenciada, ui, support) | OK, separados por domínio |
| Hooks | 27 | OK |
| Edge functions | **72** | ⚠️ Algumas legacy (ver §3) |
| Tabelas no banco | **66** | OK, com RLS |
| Migrações | **291** | Histórico íntegro |
| Buckets Storage | 5 públicos | 2 com listagem bloqueada (camada 4 ok) |
| Docs `.md` na raiz | **68 arquivos** | ⚠️ Bagunça, ver §3 |

---

## 2. O que está 100% e pronto para uso

| Área | Status |
|---|---|
| Toggle de IA (settings) | ✅ Sem erro de ON CONFLICT |
| Fluxo Camila Step 1 (áudio 10s) | ✅ Dispara para novos leads |
| Router multi-variant A/B/C | ✅ Webhook filtra por variant |
| Anônimo executa funções administrativas | ✅ Zero (era 45) |
| Listagem pública de PII (whatsapp-media, consultant-photos) | ✅ Bloqueada |
| Linter Supabase | 55 issues (todos pré-existentes, nenhum novo) |
| RLS em todas as tabelas | ✅ |
| Webhook ativo | ✅ `whapi-webhook` (Whapi Cloud) |

---

## 3. Dívida técnica organizacional (não bloqueia trabalho)

### 3.1 — Edge functions legacy (`evolution-*`)
- `evolution-webhook` e `evolution-proxy` ainda existem mas **não recebem tráfego de produção**.
- Ainda referenciadas por: `src/services/evolutionApi.ts`, `ai-agent-router`, `whapi-webhook/_helpers.ts`.
- **Risco:** zero hoje. **Custo:** confusão futura.
- **Quando limpar:** sprint dedicado de ~1h, depois de confirmar que `ai-agent-router` não roteia mais nada para Evolution.

### 3.2 — 68 arquivos `.md` soltos na raiz
Há documentos de sessões antigas, deploys já feitos, troubleshootings resolvidos:
`CHANGELOG_EVOLUTION.md`, `RESUMO_SESSAO_COMPLETA.md`, `STATUS_FINAL.md`, `URGENTE_CONFIGURAR_AGORA.md`, `INICIO_AQUI_PORTAL_WORKER.md`, `SESSAO_ATUAL_RESUMO.md`, etc.

A regra do projeto é **não criar arquivos de reminder/resumo** — manter apenas `DOCUMENTATION.md` e `README.md` vivos.

**Proposta:** mover ~60 desses arquivos para `.archive/` (ou apagar). Sobra:
- `README.md` — onboarding
- `DOCUMENTATION.md` — schemas, fluxos, specs
- `MAPA_FLUXO.md` ou `MAPA_VISUAL_PROJETO.md` — referência viva (escolher um)

### 3.3 — 55 alertas de linter pré-existentes
- 1 ERROR: SECURITY DEFINER View (precisa identificar qual view e trocar para SECURITY INVOKER).
- ~10 INFO: RLS habilitado sem policy (tabelas internas que nunca são lidas via API — risco baixo).
- ~44 WARN: funções SECURITY DEFINER chamáveis por authenticated (esperado, mas vale revisar caso a caso).

Não bloqueia, mas é o próximo passo natural de hardening.

---

## 4. Diagrama da arquitetura atual

<lov-artifact url="/__l5e/documents/Arquitetura_iGreen.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

```text
        FRONTEND (React + Vite)
        ┌───────────────────────────────────┐
        │ LP públicas │ Admin │ SuperAdmin  │
        │ WhatsApp+CRM │ Editor de Fluxos   │
        └───────────────┬───────────────────┘
                        │
        ┌───────────────▼───────────────────────────┐
        │       EDGE FUNCTIONS (72 ativas)          │
        │  whapi-webhook  ◀── ATIVO (Whapi Cloud)   │
        │  whapi-proxy                              │
        │  ai-sales-agent + ai-agent-router         │
        │  facebook-* (20 funcs CAPI/Ads)           │
        │  bot-* (watchdog, e2e, audit, recovery)   │
        │  sync-igreen-customers (cron 07h BRT)     │
        │  evolution-* ····► legacy / espelho       │
        └───────────────┬───────────────────────────┘
                        │
        ┌───────────────▼───────────────────────────┐
        │   SUPABASE DB (66 tabelas + RLS)          │
        │ customers (flow_variant A/B/C)            │
        │ bot_flows + bot_flow_steps (multi-variant)│
        │ conversations + ai_decisions              │
        │ crm_deals + stages                        │
        │ settings (key UNIQUE ✅)                  │
        │ consultant_wallet + wallet_transactions   │
        └────────────────────────┬──────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                ▼                                 ▼
        ┌──────────────┐                  ┌───────────────┐
        │  MinIO       │                  │ Supabase      │
        │ vídeos/LP    │                  │ Buckets (5)   │
        │ estáticos    │                  │ 2 com list 🔒 │
        └──────────────┘                  └───────────────┘

SEGURANÇA APLICADA:
✅ anon EXECUTE em funções = 0 (era 45)
✅ whatsapp-media listagem bloqueada
✅ consultant-photos listagem bloqueada
✅ settings.key com UNIQUE constraint
```

---

## 5. Plano de organização (opcional, recomendado)

Quando quiser arrumar a casa antes de começar features novas, sugiro **um único PR** com:

1. **Cleanup docs**: mover 65 `.md` antigos para `.archive/docs-legacy/`, manter só README + DOCUMENTATION + 1 mapa visual.
2. **Remover `evolution-*`**: refatorar `evolutionApi.ts`, deletar 2 edge functions, limpar `config.toml`.
3. **Fix 1 ERROR do linter**: identificar a View `SECURITY DEFINER` e trocar para `SECURITY INVOKER`.

Tempo estimado: 1h–1h30. Sem risco operacional.

---

## Recomendação final

**Pode começar os trabalhos novos agora.** O código está separado por domínio (admin, superadmin, whatsapp, licenciada), os hooks isolam lógica do React, as edge functions estão modularizadas, e os bloqueios críticos foram resolvidos. Os 3 pontos acima são qualidade de vida, não urgência.

Quer que eu execute o **Plano de organização (§5)** agora, ou prefere já partir para uma feature nova?
