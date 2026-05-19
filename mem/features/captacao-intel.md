---
name: Captação Intel
description: SuperAdmin > aba Captação. IA cruza funil + criativos + concorrentes e gera diagnóstico acionável (gargalos, vencedores, ações). Tabela capture_diagnostics. Edge function captacao-intel roda manual ou cron diário 08:00 UTC. Tráfego (Horários/Dispositivos/Origem) foi removido do /admin do consultor.
type: feature
---

- Aba "Captação" no SuperAdmin (`src/components/superadmin/CaptacaoTab/`) com KpisRow + IntelDiagnostic + CompetitorsPanel.
- Tabelas novas: `capture_diagnostics` (RLS super-admin only) e `ad_spend_daily` (cache Facebook por consultor).
- Edge function `captacao-intel`: coleta funil (page_views→customers→deals), variantes A/B/C, handoffs, ad_creative_performance e competitor_creatives; chama OpenAI gpt-5-mini com fallback heurístico; salva em capture_diagnostics.
- Cron: `captacao-intel-daily` 08:00 UTC.
- DashboardTab do /admin: removido Collapsible "Tráfego detalhado" (gráficos foram para Captação).
