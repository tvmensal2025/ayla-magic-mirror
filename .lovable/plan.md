## Objetivo

Auditar o sistema em 3 frentes antes de abrir o produto para 100 novos consultores trabalhando em paralelo, gerando um relatório acionável (sem alterar código nesta fase) e, em seguida, executando as correções priorizadas.

---

## Frente 1 — Auditoria de Botões (UI/UX)

Varredura sistemática de cada CTA crítico em:

1. **Captação** (`CaptacaoPanel`, `CaptureStepsGrid`, `CaptureSheet`, `SendSequenceDialog`)
  - Botão "Devolver", "Gerar texto (IA)", "Enviar sequência", troca de passos custom/legacy
  - Estados: loading, disabled, erro, sucesso, double-click protection
2. **WhatsApp CRM** (`FlowQuickBar`, `ChatView`, `MessageComposer`, `KanbanBoard`, `BulkSendPanel`)
  - Pré-visualização, envio individual, envio em massa, takeover humano, pausar bot
  - Verificar se o footer dos dialogs nunca sai da tela em 360px–1920px
3. **Modo Game** (`GameModeToggle`, `PlayerHud`, `QuestsBar`)
  - Toggle persiste? XP soma corretamente em produção? Som mutado por padrão?
4. **Admin / Super Admin** (templates, fluxos, captação intel, saúde do bot)
  - Botões de salvar/duplicar/forçar reset, RLS em UPDATE de templates

Checklist por botão: aria-label, contraste, tamanho mínimo (44x44 mobile), feedback visual, idempotência, tratamento de erro com toast, telemetria.

---

## Frente 2 — Auditoria do Fluxo (Bot WhatsApp)

1. **Resolver de passos** (`flowStepResolver`, `whapi-webhook/handlers/bot-flow.ts`, `manual-step-send`)
  - Passo certo na ordem certa (1→2→3…) em fluxos custom A/B/C
  - Garantir que "Devolver" para passo manual não pula nem repete
2. **Variantes A/B/C** — multi-variant lookup com filter por variant (regressão conhecida)
3. **Takeover humano** — `bot_paused` + `assigned_human_id` silenciam TODOS os crons
4. **Captação OCR → Portal Worker → OTP → Assinatura** — caminho feliz + 5 erros comuns
5. **Notificações de novo lead e handoff** — `notification_phone`, re-entrada sem inbound 24h
6. **Crons** (`bot-stuck-recovery`, `ai-followup-cron`, `bot-loop-watchdog`, `send-scheduled-messages`) — sem loops, sem envio duplicado, sem mensagem em lead pausado

Validação por simulação (`flowSimulator`) cobrindo todos os 38 steps Evolution.

---

## Frente 3 — Prontidão para Lançamento (100 consultores)

1. **Infra & escala**
  - Tamanho da instância Supabase (ver "Cloud → Overview → Advanced settings")
  - Capacidade do worker-portal (fila, paralelismo, retry)
  - Compress-worker (vídeos) — fila + ffmpeg
  - MinIO (espaço, buckets, política de retenção)
2. **Secrets obrigatórios** — `EVOLUTION_API_URL/KEY`, `GEMINI_API_KEY`, `MINIO_*`, `WORKER_SECRET`, `FALLBACK_EMAIL/PHONE`
3. **RLS multi-tenant** — `linter` + revisão manual de `customers`, `bot_flows`, `whatsapp_instances`, `templates`, `user_roles`
4. **Onboarding de 100 consultores**
  - Importação em massa (CSV/Excel) de consultores + instâncias Evolution deterministicamente nomeadas (`igreen-{slug}`)
  - QR Code em batelada e monitoramento de conexão (`whatsapp-bot` health, 60s polling)
  - Fluxo default A/B/C atribuído automaticamente
5. **Observabilidade**
  - Painel SuperAdmin (Captação Intel, Bot Health Intel, Stuck Leads, Worker Phase Timeline)
  - Alertas: bot loop, OTP timeout, worker offline, instância desconectada
6. **Legal / compliance** — LGPD na LP, política de privacidade, opt-out WhatsApp, termos do consultor
7. **SEO + Pixels** — meta tags por consultor, GA4, Meta Pixel, CAPI server-side
8. **Plano de rollback** — feature flag para desligar bot global, takeover em massa, backup do schema

---

## Entregáveis desta auditoria

```text
1. Relatório AUDITORIA_LANCAMENTO.md com 3 seções (botões, fluxo, lançamento)
   - Cada item classificado: CRÍTICO / ALTO / MÉDIO / BAIXO
   - Para cada CRÍTICO: arquivo + linha + correção sugerida
2. Checklist GO/NO-GO (bloqueadores vs. nice-to-have)
3. Script de seed para os 100 consultores (consultores + instâncias)
4. Painel "Launch Readiness" no SuperAdmin com semáforo por área
```

## Execução proposta (após aprovação)

Fase A (1 passo): rodar a auditoria e gerar o relatório + checklist.
Fase B: você revisa o relatório e me diz quais CRÍTICOS atacar primeiro.
Fase C: implemento correções em lotes pequenos com verificação.

### Pergunta antes de executar

Quer que eu já gere também o **script de onboarding em massa dos 100 consultores** (importação + criação de instâncias Evolution + atribuição A/B/C) na Fase A, ou prefere só o relatório nesta primeira rodada? Sim