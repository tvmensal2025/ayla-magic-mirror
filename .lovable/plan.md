# Auditoria — WhatsApp Flow + Captação + Performance

Escopo: chat WhatsApp (engine de fluxo), captação (funil/IA) e performance (edge functions + DB). Investigação feita em dados ao vivo (últimas 24 h) e código atual.

---

## 1. Chat WhatsApp — Fluxo (CRÍTICO)

### 1.1 Loop "Quero simular" persiste no lead `a3a60b6b` (11971254913)
Mesmo após o guard de re-welcome para botões, o lead segue em loop:

```text
16:10:59  inbound "Quero simular"   step=NULL → transition welcome → flow:aee7b26c
16:11:10  inbound "Quero simular"   step=NULL → transition welcome → flow:aee7b26c
16:11:22  inbound "Quero simular"   step=NULL → transition welcome → flow:aee7b26c
16:16:25  inbound "490"             step=NULL → transition welcome → flow:aee7b26c
16:16:33  inbound "Quero simular"   step=NULL → transition welcome → flow:aee7b26c
```

Causa raiz real (diferente do diagnóstico anterior):
- `customers.conversation_step` está em `flow:aee7b26c-...` (canônico, prefixado).
- Cada `bot_step_transitions.from_step` chega como `welcome` — algo entre o load e o handler está resetando o step para `welcome` antes do flow rodar.
- O guard atual (`!isButton && !buttonId`) não cobre esse caminho: a mensagem é texto plano "Quero simular" e cai no branch de short-message/re-welcome porque `hoursSinceBot ≥ 4` (último bot reply real foi às 11:00, embora `last_bot_reply_at` esteja sendo atualizado em 16:16 sem outbound real).
- Resultado: a cada inbound, fluxo é zerado → engine reentra no `welcome` → "envia" o passo de início → não loga em `conversations` (ver 1.2) → próxima inbound repete tudo.

### 1.2 Outbound não logado em `conversations`
Período 11:00 → 16:16: **5 inbounds e 0 outbounds** no `conversations`, mas `last_bot_reply_at` atualiza a cada interação. Sintomas:
- O log de outbound só registra `message_type IN ('text','image')`. Áudio/vídeo/documento/botão silenciosamente falham no insert (constraint).
- Sem registro de outbound, o cálculo `hoursSinceBot` baseia-se em `last_outbound_at` desatualizado → dispara re-welcome eterno.

### 1.3 Steps "legacy bare-UUID" voltando a aparecer
Em `bot_step_transitions` das últimas 24 h o `to_step` aparece como UUID puro (sem `flow:` prefix) em 80% dos casos:
- `aee7b26c-...` (40 transições), `33be68c1-...` (23), `passo_mpagqq3g` (3), etc.
- O `flowStepResolver` aceita ambos por compatibilidade, mas o `bot-audit-runner` marca isso como "UUID-bare(legacy)". Mistura canônico/bare gera ping-pong de engines (sys ↔ flow) e dificulta métricas.

### 1.4 1 870 / 1 946 customers com `conversation_step = NULL` (96%)
Maioria desses não são leads ativos, mas inclui clientes que receberam onboarding e nunca foram migrados. Sem step, nenhum cron (ocr-review, bot-stuck-recovery, followup) age sobre eles.

### 1.5 Handoff: 22 leads em `aguardando_humano` + 99 com `bot_paused=true`
Nenhuma notificação em `last_handoff_notified_at` recente — verificar se `notifyHandoff` está disparando.

---

## 2. Captação

### 2.1 Funil quebrado: `page_views=13` x `customers=187` em 7 d
Mais leads do que page views → o pixel/`useTrackView` não está rodando na maior parte das visitas (provável bloqueio CSP em iframe, falta de SW em preview, ou rota da LP não disparando o hook). Sem PV, o `captacao-intel` calcula CTR/CR errados.

### 2.2 Captação Intel não atualizou hoje
`last_diag = 2026-05-24 19:57` — cron diário "captacao-intel-daily" 08:00 UTC não rodou hoje (deveria ser ~3 execuções na janela). Verificar agendamento `pg_cron` e last_run.

### 2.3 Sem `ad_spend_daily` recente
Sem custo do Meta sincronizado → diagnóstico IA fica "cego" para CAC e ROAS, caindo no fallback heurístico.

---

## 3. Performance

### 3.1 Edge functions saudáveis (boot médio)
- `whapi-webhook` boot ~51 ms; `evolution-webhook` ~55-70 ms; `bot-stuck-recovery` ~43 ms.
- `bot-stuck-recovery` última run: scanned 2, rescued 0, skipped_offline 2 — instâncias offline bloqueando rescue.

### 3.2 PDF base64 inteiro armazenado em `customers.last_inbound_media_url`
Lead `a3a60b6b` tem 754 KB de base64 PDF em coluna texto. Multiplicado por leads ativos = inchaço gigante no `customers` (consultas SELECT * pesadas, replica lag, backups crescendo). Deveria estar só no MinIO/Supabase Storage com URL curta.

### 3.3 Mistura de step formats causa overhead
Cada `routeEngine()` precisa testar regex UUID + prefixo `passo_` + `flow:` em todo inbound. Normalizar para sempre `flow:<uuid>` na escrita reduz custo e elimina ambiguidade.

### 3.4 Conversations sem índice composto observado
Queries de `hoursSinceBot` filtram por `customer_id + direction + created_at DESC`. Confirmar índice; sem ele, scan custa O(n) por inbound.

---

## Plano de correção (ordem de impacto)

### Bloco A — Parar o loop do WhatsApp (URGENTE)
1. **Aliviar constraint `conversations.message_type`** para aceitar `audio|video|document|button` (migração) OU normalizar todo log para `text/image` no handler. Sem isso, `last_outbound_at` nunca atualiza → re-welcome eterno.
2. **Reescrever guard de re-welcome** em `whapi-webhook/index.ts (~L510-L584)`:
   - Não resetar se `conversation_step` já estiver em flow custom (`startsWith("flow:") || passo_ || uuid`).
   - Não resetar se houve transição nas últimas 30 min (consultar `bot_step_transitions`).
   - Manter reset só quando lead realmente sumiu (≥24 h E `conversation_step IN sys-welcome`).
3. **Atualizar `last_outbound_at` no `sendMessage`** independente do log em `conversations` falhar.
4. **Backfill**: normalizar `to_step` bare-UUID → `flow:<uuid>` em update único.

### Bloco B — Captação
5. Investigar `useTrackView` na LP: garantir que dispara em todas as rotas `/lp/:slug` e funciona em iframe da Lovable.
6. Verificar `pg_cron` jobs `captacao-intel-daily` e `ad-spend-sync` — reativar se desabilitados; adicionar log/alerta.
7. Painel "Saúde do Funil" com ratio `page_views/customers` para detectar tracking quebrado.

### Bloco C — Performance
8. **Migração**: mover `last_inbound_media_url` base64 → Supabase Storage; nullar coluna se >100 KB.
9. **Índice**: `CREATE INDEX IF NOT EXISTS conversations_customer_dir_created ON conversations(customer_id, message_direction, created_at DESC);` (validar antes via `\d`).
10. **Normalização step**: enforcement de `flow:<uuid>` em todo writer (UPDATE customers + INSERT transitions) via trigger ou helper único `writeStep()`.

### Bloco D — Observabilidade
11. Endpoint `/admin/saude-bot` já existe — adicionar card "Loops detectados" (mesma transição ≥3× em 10 min).
12. Acionar `bot-audit-runner?mode=real` em cron 6 h e alertar quando `UUID-bare(legacy) > 0`.

---

## Resumo executivo

| Área | Status | Severidade |
|---|---|---|
| Flow do bot (lead 11971254913) | Loop persistente, outbound não logado | 🔴 Crítica |
| Constraint message_type | Bloqueia logs reais | 🔴 Crítica |
| Steps bare-UUID | Mistura legacy/canônico | 🟡 Média |
| 96% customers sem step | Maioria inativos, mas crons cegos | 🟡 Média |
| Page views 13 vs Leads 187 | Tracking LP quebrado | 🟠 Alta |
| Captação Intel sem run hoje | Cron silencioso | 🟠 Alta |
| Base64 PDF em `customers` | Inchaço de DB | 🟠 Alta |
| Edge functions boot/exec | Saudáveis | 🟢 OK |

Aprove para eu executar os Blocos A→C nessa ordem.
