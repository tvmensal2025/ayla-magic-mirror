
## Objetivo

Criar um "Modo Captação" gamificado: o consultor conversa via WhatsApp usando os 10 passos como templates clicáveis, vê os dados do cliente sendo preenchidos em tempo real numa lateral estilo "ficha de personagem", e ao chegar 10/10 aperta um botão que dispara o cadastro completo (mesmo caminho do Portal Worker que o fluxo automático usa).

## Onde fica

- Nova aba **"Captação"** dentro do CRM (`WhatsAppTab` → ao lado de Chats / Kanban / Envio em massa).
- Layout 3 colunas:
  - **Esquerda (280px):** lista de leads "em captação" (customers com `capture_mode='manual'`), com mini-barra 0/10 e tempo desde o início.
  - **Centro (flex):** chat enxuto do lead selecionado + abaixo um **grid 2x5 dos 10 passos** (cards clicáveis).
  - **Direita (360px):** "Ficha do Lead" — campos preenchidos animados + barra XP + miniaturas dos documentos.

## Os 10 passos como templates

Cada passo do fluxo padrão do consultor (já existem em `bot_flow_steps`) vira um **card de ação**:

```text
┌─────────────────────────┐
│ 1. Boas-vindas    ✓     │  ← já enviado
│ 🎤 áudio + 💬 texto      │
└─────────────────────────┘
```

Comportamento (modo **Híbrido** confirmado):
- **Clique curto:** envia direto (texto + mídia + delays do step) pelo `manual-step-send` que já existe.
- **Clique longo / menu "..."**: abre o composer pré-preenchido com `message_text` para edição.
- Cada card mostra status: `pendente` / `enviado ✓` / `respondido 💬`.
- Reordenável manualmente caso o consultor pule (não bloqueia).

## Captura híbrida dos dados

A "Ficha do Lead" mostra os campos do `customers` que importam pro cadastro:
`name, cpf, rg, data_nascimento, phone_landline, email, cep, address_number, address_complement, electricity_bill_value, document_front_url, document_back_url, electricity_bill_photo_url`.

Para cada resposta nova do cliente:
1. Edge `capture-extract` (Gemini Flash) lê a última msg + contexto e devolve `{ campo, valor, confiança }`.
2. Campo pisca verde na ficha com badge **"IA sugere → ✓ aceitar / ✏ editar"**.
3. Consultor confirma com 1 clique. OCR de conta e documento continuam usando o pipeline existente (`whapi-webhook` já popula automaticamente).
4. Campos preenchidos manualmente são editáveis inline (input pequeno + Enter salva).

Cada campo confirmado conta **+1 XP** (10 campos críticos = 100%).

## Gamificação (4 estilos confirmados)

**Barra XP + confete**
- Barra horizontal verde no topo da ficha (`0/10 → 10/10`).
- A cada passo confirmado: animação `scale-in` + partículas (`canvas-confetti`).
- Em 10/10: confete grande + som suave (`audio` opcional, configurável).

**Frases motivacionais**
- Toast curto a cada milestone:
  - 1/10: "Boa! Primeiro dado capturado 🔥"
  - 3/10: "Tá fluindo, segue o jogo!"
  - 5/10: "Metade! Foco que tá saindo 💪"
  - 8/10: "Faltam só 2, não solta agora!"
  - 10/10: "CADASTRO COMPLETO ⚡ Aperta o botão!"
- Frases ficam num array configurável; modo "silencioso" no topo da aba.

**Placar diário/semanal**
- Card fixo no canto sup. direito da aba: `Hoje: 3 ✅ • Semana: 12 ✅ • Streak: 4 dias`.
- Tabela `capture_scoreboard` (consultant_id, date, registros, tempo_medio_min, streak).
- View ranking entre consultores do mesmo gerente (reaproveita `can_view_consultant`).

**Badges/conquistas**
- Tabela `capture_achievements` (consultant_id, badge_key, earned_at).
- Badges iniciais: `primeiro_do_dia`, `5_seguidos`, `relampago` (<10min), `noturno` (após 20h), `combo_3` (3 cadastros no mesmo dia), `mvp_semana`.
- Notificação tipo "achievement unlocked" com glow verde + ícone.

## Botão "CADASTRAR TUDO"

- Aparece habilitado só quando `getNextMissingStep(c) === 'ask_finalizar'` (reaproveita helper de `conversation-helpers.ts`).
- Clique → seta `conversation_step='finalizando'` e chama edge `submit-lead-manual` que:
  1. Valida campos (mesmo conjunto de validações do helper).
  2. Dispara `portal-worker` (mesma rota do fluxo automático).
  3. Em sucesso: anima a ficha "completando" → confete grande → registra na `capture_scoreboard` → checa badges.

## Mudanças técnicas resumidas

### Banco (migrations)
- `customers`: adicionar coluna `capture_mode text default 'auto'` (`auto` | `manual`) e `capture_started_at timestamptz`.
- Nova `capture_scoreboard` (consultant_id, date, registrations, avg_minutes, streak).
- Nova `capture_achievements` (consultant_id, badge_key, earned_at, metadata).
- Nova `capture_field_events` (consultant_id, customer_id, field, source `ai`|`manual`|`ocr`, confirmed_at) — usado para XP e analytics.
- RLS: owner-only via `consultant_id = auth.uid()`, gestores via `can_view_consultant`.

### Edge functions novas
- `capture-extract` — Gemini Flash: input = últimas N mensagens + ficha atual; output = sugestões por campo.
- `submit-lead-manual` — espelho de `submit-lead` do bot, mas disparado pelo botão.
- `capture-award-badges` — chamada após cada cadastro para checar badges.

### Frontend
- `src/pages/CaptacaoPage.tsx` (rota `/admin/captacao`) + aba dentro do CRM.
- Componentes:
  - `CaptureLeadList.tsx` (esquerda)
  - `CaptureChatMini.tsx` (centro topo)
  - `CaptureStepsGrid.tsx` (centro inferior) — 10 cards com status
  - `CaptureLeadCard.tsx` (direita) — ficha + barra XP
  - `CaptureProgressBar.tsx`, `CaptureScoreboard.tsx`, `CaptureBadgeToast.tsx`
- Hook `useCaptureSession(customerId)` — orquestra sugestões IA, salvamento, XP.
- Lib `confetti` (já leve, ~2KB) + `framer-motion` (verificar se existe; senão usar animações Tailwind já presentes em `tailwind.config.ts`).

## O que **não** muda

- Webhook `whapi-webhook`, fluxos automáticos, OCR, portal-worker — tudo continua igual.
- Templates atuais (`bot_flow_steps`) são lidos como estão; nenhuma renomeação adicional.
- Bot pausa automaticamente quando `capture_mode='manual'` via helper `bot/paused.ts` existente (basta setar `bot_paused=true` ao entrar no modo).

## Entrega em fases

1. **Migração** + criar aba/rota vazia + setar `capture_mode='manual'` ao abrir um lead na aba.
2. **Ficha lateral** lendo `customers` em realtime + edição inline.
3. **Grid dos 10 passos** reaproveitando `manual-step-send`.
4. **Captura IA** (`capture-extract`) + sugestões + XP/confete.
5. **Botão CADASTRAR TUDO** (`submit-lead-manual`).
6. **Placar + badges** (scoreboard, conquistas, frases motivacionais).
