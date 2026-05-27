# Plano: Go-Live Hardening — CTWA + QR + Variantes A/B/D

## Contexto confirmado

- **Variantes ativas em produção:** A (áudio), B (texto), D (botões/auto). C fica desligada até ter vídeo.
- **Entrada de leads:** Facebook/Instagram Ads (CTWA) + QR code físico. Excel é só sync de clientes iGreen, não cria lead.
- **Objetivo:** auditar os 7 pontos críticos do fluxo, fechar gaps, e criar um dashboard de monitoramento pros primeiros dias.

---

## Fase 1 — Round-robin A/B/D (remover C da rotação)

**Onde mexer:** lógica de atribuição de `flow_variant` no `whapi-webhook` e em `lead-attribution`.

- Trocar round-robin atual (A/B/C ou A/B/C/D) por **A → B → D → A …** baseado em `count(customers) % 3` por consultor.
- Garantir que o router (`bot_flows` lookup com filtro `variant`) caia em A como fallback se a variante sorteada não tiver fluxo ativo pro consultor.
- Atualizar `dev-fire-all-steps` e `ai-generate-step-text` pra aceitar D (já aceita) e remover sugestões de C nos seletores do `/admin/fluxos`.
- Atualizar `ManualStepDialog` e `StepMediaPanel` pra esconder C quando o consultor não tem `bot_flows` com `variant='C'`.

---

## Fase 2 — Hardening dos 7 pontos críticos

### 2.1 Atribuição de campanha Facebook (CTWA)

- Auditar `facebook_campaigns`: toda campanha ativa precisa ter `initial_message` preenchido com a frase exata do anúncio.
- Expandir `ADS_REGEX` em `_shared/lead-attribution.ts` e `_shared/captation/lead-source.ts` com as frases reais que o time roda hoje (pedir lista pro time de tráfego).
- Adicionar fallback: se vier `ctwa_clid` no payload do Whapi → marcar `lead_source='facebook_ad'` mesmo sem match de regex.

### 2.2 Pixel + CAPI por consultor

- Validar que cada consultor com ads ativos tem:
  - `consultants.facebook_pixel_id` preenchido
  - `facebook_connections` com `access_token` válido (não expirado)
- Adicionar widget no `/admin` mostrando status do Pixel + última chamada CAPI bem-sucedida.

### 2.3 Instância WhatsApp connected

- Cron novo `instance-health-cron` (a cada 10 min) verifica todas as instâncias `is_active=true`:
  - Se `connection_status != 'connected'` por > 15 min → notificar `consultants.notification_phone` + Super Admin.
- Badge no `/admin` em vermelho pulsante quando a instância do consultor logado está desconectada.

### 2.4 Variante D — bot_flows obrigatório

- Migration de validação: trigger em `consultants` que bloqueia `is_active=true` se não existir `bot_flows` com `variant in ('A','B','D')` e `is_active=true` pra cada uma.
- Seed script: pra cada consultor sem fluxo D, clonar o fluxo A e marcar `variant='D'` + adicionar nós de botão padrão (sim/não na captura de conta).

### 2.5 Cron `flow-d-health-cron`

- Confirmar agendamento no `pg_cron` (rodar a cada 30 min).
- Adicionar métrica: nº de leads destravados por execução → grava em nova tabela `flow_d_health_runs`.

### 2.6 QR code rastreável

- Cada material físico do consultor deve apontar pra `/c/:slug?src=qr&utm_campaign={local}` (ex: `?src=qr&utm_campaign=feira-sp-jan`).
- LP já passa `utm_*` pro WhatsApp via wa.me `text=` → garantir que `lead-attribution.ts` lê `utm_campaign` da primeira mensagem e grava em `customers.lead_source_detail`.

### 2.7 LP `/c/:slug` com `?src=ads`

- Já funciona. Adicionar teste E2E (Deno test) que valida: GET `/c/:slug?src=ads` retorna HTML com Pixel injetado + WhatsApp button com `ctwa_clid` placeholder.

---

## Fase 3 — Dashboards de monitoramento (`/admin/saude-producao`)

Nova página acessível só pro Super Admin com 4 painéis em tempo real (refresh 30s):

1. **Funil últimas 24h por variante**
  - Tabela: A / B / D × etapas (lead_recebido → conta_enviada → ocr_ok → pitch → club → aprovado).
  - Conversão % por etapa.
2. **Origem do lead**
  - Pizza: Facebook Ad / Instagram Ad / QR code / Orgânico / WhatsApp direto.
  - Top 5 campanhas (`facebook_campaigns.name`) por leads recebidos hoje.
3. **Saúde técnica**
  - Instâncias `connected` vs `disconnected` por consultor.
  - Última execução de cada cron (`flow-d-health-cron`, `pos-venda-cron`, `ocr-fallback`, `instance-health-cron`).
  - Erros de CAPI nas últimas 6h.
4. **Leads travados (alerta)**
  - Leads sem resposta do bot > 2h em qualquer `capture_*`.
  - Leads em D com `custom_step_retries > 2`.
  - Botão "Devolver pro humano" inline.

---

## Fase 4 — Smoke test guiado de go-live

Checklist na própria UI do `/admin/saude-producao`:

1. ✅ Pixel ID configurado
2. ✅ CAPI token válido
3. ✅ Instância WhatsApp connected
4. ✅ Fluxos A, B, D ativos
5. ✅ Crons agendados
6. ✅ `facebook_campaigns.initial_message` populado (≥ 1 campanha)
7. ✅ Notification phone configurado
8. ✅ Teste manual: enviar mensagem do número do consultor → confirmar que recebe saudação em < 30s

Só libera "🚀 Modo Produção ON" quando todos os 8 estiverem verdes.

---

## Detalhes técnicos

**Tabelas novas:**

- `flow_d_health_runs (id, ran_at, leads_unstuck, errors)`
- `production_health_snapshot (consultant_id, captured_at, instance_status, pixel_ok, capi_ok, flows_ok, last_lead_at)` — populada por cron a cada 5 min, base dos dashboards.

**Edge functions novas/alteradas:**

- `instance-health-cron` (nova)
- `production-health-snapshot` (nova, roda a cada 5 min)
- `whapi-webhook` (round-robin A/B/D + leitura de `utm_campaign`)
- `lead-attribution` (`ctwa_clid` fallback + regex expandida)

**RLS:**

- `flow_d_health_runs` e `production_health_snapshot`: select apenas via `is_super_admin(auth.uid())`, insert/update apenas `service_role`.

**Migrations:**

- Trigger em `consultants.is_active` bloqueando ativação sem fluxos A/B/D.
- Seed de Fluxo D pra consultores existentes.

**Dependências externas:**

- Lista das frases reais dos anúncios atuais (precisamos pedir pro time de tráfego antes de mexer no regex).

---

## Ordem de execução sugerida

1. Round-robin A/B/D + seed Fluxo D (Fase 1 + 2.4) OU APENAS D ( DEACORDO COM A VARIAVEL SELECIONADA ) 
2. Crons + snapshot table (Fase 2.5 + infra do dashboard)
3. Atribuição CTWA + UTM QR (Fase 2.1 + 2.6)
4. Dashboard `/admin/saude-producao` (Fase 3)
5. Checklist de go-live + smoke test guiado (Fase 4)

Estimativa: cada fase 1 sessão. Total ~5 sessões pra estar 100% pronto pra abrir produção com confiança.