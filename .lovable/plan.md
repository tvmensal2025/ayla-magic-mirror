# Fluxo D — botões + redesign do card de início

## Diagnóstico

Analisando o Fluxo D (variant `D` — flow `Fluxo Whapi (botões)`, 8 passos), encontrei **2 problemas**:

### 1. Bug crítico: botões não são enviados no disparo manual

O passo `d_welcome` tem botões configurados em `captures._buttons`:

- ▶ Quero simular
- ❓ Como funciona
- 👤 Falar com Rafael

Mas a edge `manual-step-send` (linha 656) envia o texto via `sender.sendText(...)` — **ignora completamente** o array `_buttons` do passo. O handler automático `whapi-webhook/handlers/bot-flow.ts` (linha 1086) já lê `_buttons` e usa `sender.sendButtons()`; o manual nunca recebeu essa lógica. Por isso o cliente recebeu só a frase "Escolha uma das opções abaixo 👇" sem botão nenhum.

### 2. UX feia no popover de Fluxo D

A view atual (`FlowQuickBar.tsx` linhas 279-303 e `ManualStepDialog.tsx` equivalente) é um bloco genérico: parágrafo cinza + botão + linha "Primeiro passo: …". Não mostra prévia da mensagem, não mostra os botões que serão enviados, nem dá sensação de "automático guiado por botões".

## Mudanças

### A. Backend — `supabase/functions/manual-step-send/index.ts`

No loop de envio (linhas 651-741), quando o item for **`text`** e for o **último item** (`isLast`) **de um passo `message`** que tenha `captures._buttons` válidos, trocar `sender.sendText()` por `sender.sendButtons()` com os botões renderizados (mesma normalização usada em `bot-flow.ts`: `{ id, title }`, máx. 3, fallback texto numerado já tratado dentro do sender).

Aplica para **qualquer variant** (não só D) — corrige também passos com botões em A/B/C/E. Sem mudança de schema, sem mudança no fluxo automático.

### B. UI — `src/components/whatsapp/FlowQuickBar.tsx` e `src/components/admin/AIAgentTab/ManualStepDialog.tsx`

Redesenhar o bloco do Fluxo D usando tokens do design system (verde primary, glassmorphism leve já existente no projeto):

```text
┌─ Fluxo D — Automático por botões ─────────┐
│ ⚡ ícone + título destacado                │
│                                           │
│ ┌─ Prévia da 1ª mensagem ────────────┐    │
│ │ "Olá, seja muito bem-vindo(a) 😊…" │    │
│ │ (texto cinza, max 3 linhas, fade)  │    │
│ └────────────────────────────────────┘    │
│                                           │
│ Botões que o cliente vai ver:             │
│ [▶ Quero simular] [❓ Como funciona]      │
│ [👤 Falar com Rafael]                     │
│ (chips verdes outline, lidos do step)     │
│                                           │
│ ╔══════════════════════════════════════╗  │
│ ║  ▶ Iniciar Fluxo D                   ║  │
│ ╚══════════════════════════════════════╝  │
│ depois disso o bot conduz sozinho ✨      │
└───────────────────────────────────────────┘
```

- Lê `steps[0].message_text` e `steps[0].captures` para preview real e chips de botões.
- Mantém o mesmo `invokeStep(first.id)` já em uso (sem mudar lógica de envio do front).
- Toast verde após sucesso. Sem alterar A/B/C/E.

## Arquivos

- `supabase/functions/manual-step-send/index.ts` — usar `sendButtons` no último texto quando `captures._buttons` existir
- `src/components/whatsapp/FlowQuickBar.tsx` — redesign do bloco D
- `src/components/admin/AIAgentTab/ManualStepDialog.tsx` — redesign do bloco D (mesmo layout)

Sem migrations. Sem mudar passos do Fluxo D no banco — eles já estão corretos.
