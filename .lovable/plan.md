# Plano: Slots de Áudio da Camila

## Objetivo

Resolver o problema de consultores não gravarem áudios. Cada momento-chave da conversa tem um **slot fixo** com áudio padrão pronto. O consultor pode usar o padrão ou gravar o dele em 1 toque. A IA decide qual slot disparar via tool calling (sem alucinação).

---

## 1. Banco de dados (1 migração)

### Nova tabela `ai_agent_slots`

| coluna | tipo | nota |
|---|---|---|
| `slot_key` | text PK | identificador estável (`objecao_preco`) |
| `label` | text | nome amigável |
| `description` | text | mostrado no card |
| `trigger_hint` | text | injetado no prompt da IA |
| `fallback_text` | text | enviado se não houver áudio (#2 melhoria) |
| `min_interval_minutes` | int default 60 | cooldown por conversa (#3) |
| `position` | int | ordem |
| `active` | bool default true | |
| `version` | int default 1 | para revert do Super Admin (#11) |

RLS: `SELECT` para `authenticated`; `ALL` apenas para `super_admin`.

### Alterações em `ai_media_library`

- Adicionar `slot_key text` (nullable, indexada).
- Adicionar `is_draft bool default false` — gravação salva mas não ativa (#10).
- Adicionar `sent_count int default 0` e `reply_count int default 0` (#6).
- Constraint parcial: `unique (consultant_id, slot_key) where slot_key is not null and is_public = false`.
- Constraint parcial: `unique (slot_key) where is_public = true and slot_key is not null`.

### Seed inicial — 8 slots (adicionei `confirma_recebimento` #1)

`boas_vindas`, `confirma_recebimento`, `como_funciona`, `fazenda_solar`, `objecao_preco`, `objecao_distribuidora`, `prova_social`, `chamada_cadastro`.

### Nova tabela `ai_slot_dispatch_log`

Registra cada envio de áudio por conversa. Usada para cooldown (#3) e métrica (#6).
Colunas: `consultant_id`, `customer_id`, `slot_key`, `media_id`, `variant` (`default`/`personal`), `sent_at`, `reply_within_min` (preenchido por trigger ou cron).

---

## 2. Storage

Bucket `ai-agent-media` (já existe). Padronizar formato `.opus` ou `.m4a` em vez de `.webm` — Evolution recodifica `.webm` com perda (#9).

- Personal: `{consultant_id}/slots/{slot_key}.opus`
- Padrão público: `public/slots/{slot_key}.opus`

Upload faz upsert (sobrescreve anterior, economiza quota).

---

## 3. Frontend — Aba "Áudios da Camila"

### Reestruturar `AIAgentTab/index.tsx`

3 sub-abas internas:
1. **Áudios** (default) — novo `SlotsPanel`
2. **Mídias livres** — `MediaColumn` atual (PDFs/imagens avulsas)
3. **Roteiro** — `RoteiroColumn` atual (mantém split desktop só aqui)

### Componentes novos

**`SlotsPanel.tsx`** — lista vertical de cards. Topo:
- Resumo: "5 de 8 slots no padrão · 3 personalizados"
- Se `super_admin`: botão "Editar slots padrão" abre modal de gerenciamento.

**`SlotCard.tsx`** — 1 por slot:
```
🎙️ Objeção: "tá caro"             [Em uso: Meu áudio]
Quando o lead reclama do preço...

[ Padrão (Camila) ] [ Meu áudio ]   ← toggle

▶️ ━━━━━━━━━━━━ 0:32

📊 Padrão: 38% resposta · Seu: 52% resposta   (#6)

⚪ Gravar  📎 Enviar arquivo  💾 Salvar rascunho  🗑️ Remover
```

Comportamento:
- Toggle desabilitado em "Meu áudio" se não houver gravação ativa (tooltip).
- Após gravar: preview → "Ativar agora" ou "Salvar rascunho" (#10). Rascunho fica como `is_draft=true`, não substitui o padrão.
- Validação no upload: 3s ≤ duração ≤ 90s, normalização de pico (#5).
- Após salvar, edge function de transcrição roda em background (#4) e preenche `transcript`.

**`AudioRecorderInline.tsx`** — captura via `useAudioRecorder` (hook já existe). Encode para `.opus` via `MediaRecorder` com `audio/webm;codecs=opus` e converte container no edge function se necessário.

**`SuperAdminSlotsModal.tsx`** — só visível para `super_admin`:
- Editar `label`, `description`, `trigger_hint`, `fallback_text`, `min_interval_minutes`.
- Subir áudio padrão.
- Ao salvar: incrementa `version`, mantém histórico para revert (#11).
- Reordenar (drag), desativar, criar.

---

## 4. Backend — `ai-agent-router`

### Tool calling em vez de campo livre (#8)

No início, carregar slots ativos. Expor cada slot como **tool** OpenAI/Gemini:

```json
{
  "name": "send_audio_objecao_preco",
  "description": "Use quando o lead reclama de preço ou diz 'depois eu vejo'. Trigger: <trigger_hint>"
}
```

A IA chama a tool em vez de devolver string livre — elimina alucinação de slot.

### Resolução do áudio (ordem)

1. Verificar cooldown via `ai_slot_dispatch_log` (último envio do mesmo slot para esse `customer_id` < `min_interval_minutes`?). Se sim, pular áudio e seguir só com texto.
2. Buscar áudio personal: `ai_media_library` onde `consultant_id=X`, `slot_key=Y`, `active=true`, `is_draft=false`.
3. Se não houver, buscar público: `slot_key=Y`, `is_public=true`, `active=true`.
4. Se não houver áudio, enviar `fallback_text` do slot (#2).
5. A/B leve (#7): se consultor tem áudio próprio há < 14 dias, alternar 50/50 com padrão.
6. Registrar em `ai_slot_dispatch_log` e incrementar `sent_count`.

### Métrica de resposta

Cron (ou trigger em `conversations` inbound) marca `reply_within_min` no log e incrementa `reply_count` na mídia. Alimenta o card (#6).

---

## 5. Edge functions auxiliares

- **`transcribe-slot-audio`** — após upload, gera `transcript` via Whisper/Gemini.
- **`validate-slot-audio`** — duração + normalização (rejeita áudio cortado).
- **Cron diário** — atualiza estatísticas `reply_rate` por slot/consultor.

---

## 6. Tema

Tokens semânticos: `bg-card`, `text-foreground`, `text-primary`. Botão de gravação: `text-destructive` quando ativo. Glassmorphism dark coerente com a identidade.

---

## Fora de escopo (próximo passo se pedir)

- Tela do WhatsApp / cards do CRM
- Mídias livres (PDF/imagem) — fica como está
- Mudanças de RLS em outras tabelas

---

## Ordem de execução

1. Migração (tabelas + colunas + seed dos 8 slots + RLS)
2. `SlotsPanel` + `SlotCard` + `AudioRecorderInline` (consultor)
3. `SuperAdminSlotsModal`
4. Refator do `ai-agent-router` para tool calling + resolução com cooldown/fallback/A·B
5. Edge functions de transcrição e validação
6. Cron de métricas
7. QA: gravar, ativar, conversar com bot, validar log
