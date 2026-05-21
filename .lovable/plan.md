## Diagnóstico

1. **Tamanho:** `CaptureSheet` abre em 52dvh com header gordo (logo+título+barra+frase+botão "Pedir nome"), `TabsList h-10`, padding `p-3`, footer com botão `h-11` + linha de stats. `CaptureStepsList` já é compacto mas o `CaptureStepPreview` (modal de prévia) ocupa muita tela. Combinado: o painel come metade do dispositivo antes mesmo de ver o primeiro passo.

2. **Lead 5511916827893 não existe** no banco hoje (busquei por `phone_whatsapp ilike '%91682%'` e por `name ilike '%marc%'` — a Marcia Aparecida Alvares está com `phone_whatsapp=5514998582013`, e a Marcia Regina Dias está como `sem_celular_*`). A migration anterior tentou “resetar” esse número mas ele não corresponde a nenhum registro — daí o erro: ao tentar enviar o fluxo o front chama `manual-step-send` com um `customerId` que não bate / ou o lead tem `phone_whatsapp` que começa com `sem_celular_` e cai em `lead_sem_whatsapp` silenciosamente.

3. **Falhas silenciosas:**
   - `manual-step-send` retorna JSON com `code` mas a `supabase.functions.invoke` só popula `error` quando o HTTP status é ≥400; quando devolvo `ok:false` com **200** (caso `partial_send`/`nothing_to_send`) o wrapper trata, mas alguns paths retornam **400/409/502** e o `error.context.json()` nem sempre é lido (race no body já consumido).
   - O modal `CaptureStepPreview` chama `doSend` que só lê `res.ok` e fecha — toast some no `finally` antes do usuário entender o que aconteceu.
   - Botão fica girando quando a edge demora >10s sem timeout no client.
   - Whapi pode responder 200 mas com `sent:false` (não tratamos esse caso).

4. **Sequência inteira:** hoje só existe envio 1-a-1 por passo. Não há botão para disparar os 10 passos com delays humanos (cliente quer também). O botão “CADASTRAR TUDO” é outro fluxo (submit pro portal) — tá ok, mas precisa desabilitar/avisar quando `bot_paused=true`.

---

## Plano

### Parte A — Compactar Modo Captação (visual)

**`CaptureSheet.tsx`:**
- Altura padrão: `h-[44dvh]` (era 52dvh), `min-h-[320px]`.
- Header: agrupar em **1 linha só**: ícone 6×6, nome + telefone inline (`text-[11px]`), botões de ação `h-7 w-7`. Remover `mb-1.5` extra e o `CaptureProgressBar` vira `h-1` (em vez de 2). Frase motivacional vira `text-[10px] mt-0.5`.
- Botão “Pedir nome do lead”: passa pra **chip inline** ao lado da frase motivacional, `h-6 px-2 text-[10px]` (em vez de bloco centrado com `mt-1.5`).
- `TabsList`: `h-7`, ícones `w-3 h-3`, badges `text-[9px]`.
- Footer: botão principal `h-9 text-xs` (era h-11), stats line ganha `text-[9px]` e perde 1 linha.
- Modo expandido mantém os tamanhos atuais — só o modo padrão fica compacto.

**`CaptureStepsList.tsx`:**
- Cada linha `py-1` (era 1.5), bola do número `w-6 h-6 text-[10px]`, botão de envio `w-7 h-7` (era 9). Título `text-[12px]` (era 13).
- Espaçamento da lista `space-y-1` (era 1.5).

**`CaptureStepPreview.tsx`:** abrir como **popover compacto** (max-w-sm, max-h-[60dvh] com scroll interno) em vez de dialog full-screen no mobile; preview de mídia em thumbs 64×64; botões de variante viram pílulas pequenas.

### Parte B — Destravar envio (1-a-1)

**`src/lib/whatsapp/send.ts` (sendStepWithFeedback):**
- Adicionar `AbortController` com timeout de **20s** → toast “Servidor não respondeu, tente de novo”.
- Ler `error.context` de forma defensiva: clonar antes de chamar `.json()`, fallback pra `.text()`.
- Detectar `data.sent.length === 0 && data.ok === true` → mostrar warning (“Edge respondeu OK mas não enviou nada”).

**`manual-step-send` (edge):**
- Quando `phone_whatsapp` começa com `sem_celular_` OU não passa no regex BR, **logar com `console.warn`** já está, mas adicionar resposta `409` com `code:"lead_sem_whatsapp"` consistente (hoje é 400 — front trata ambos, só padronizar).
- Antes de qualquer envio, checar `consultants.whapi_instance_status`: se ≠ `connected`, retornar `instance_disconnected` cedo (evita 502 silencioso da Whapi).
- Quando `whapi.sendText/sendMedia` lança erro de rede, classificar como `whapi_network` (hoje cai em `whapi_send_failed` genérico) e expor `whapi_error` no toast.
- Após enviar com sucesso, fazer `select` pra confirmar que `conversations.insert` gravou (defensive — alguns leads sem RLS adequado falham silenciosos).

**`CaptureStepsList.tsx` / `CaptureStepPreview.tsx`:**
- `doSend` agora não fecha o modal automaticamente em erro — mantém aberto mostrando o toast.
- Botão de envio mostra **3 estados**: idle/sending/error (X vermelho por 3s) em vez de só voltar pro Send.

### Parte C — Enviar sequência inteira (novo botão)

**Novo botão “Enviar todos os passos” no `CaptureSheet` footer (esq. do CADASTRAR):**
- Abre confirm dialog compacto: “Vou disparar os {N} passos pendentes pro {nome}. Delays humanos entre cada um (2–5s). Continuar?”
- Cliente itera por `groups` (em ordem), chamando `sendStepWithFeedback` com `part:"all", continueFlow:false` pra cada passo não enviado.
- Entre passos: delay aleatório 2500–4500ms (parecido com humano).
- Mostra progress “3 de 10 enviados” no toast persistente; cancelável.
- Se algum passo retornar `name_not_captured_yet`, pausa a fila e força clicar em “Pedir nome”.
- Respeita guard: se `bot_paused=true` E `assigned_human_id != consultor logado`, avisa.

### Parte D — Caso da Marcia 5511916827893

- Adicionar **busca por telefone** no header do CaptureSheet: input “Buscar lead por número” → se não achar, oferecer “Criar lead novo com este número” (chama `customers insert` com `name=null, name_source=unknown, customer_origin='manual'`).
- Migration auxiliar: garantir que o nome `5511916827893` seja procurado em variantes (com/sem 9º dígito) e logar quando o phone não existe (pra parar de tentar reset em leads-fantasma).

---

## Detalhes técnicos

**Arquivos editados:**
- `src/components/captacao/CaptureSheet.tsx` — compactar header/footer + botão “Enviar todos” + busca por telefone.
- `src/components/captacao/CaptureStepsList.tsx` — linhas e botões menores; estado de erro.
- `src/components/captacao/CaptureStepPreview.tsx` — popover compacto.
- `src/lib/whatsapp/send.ts` — timeout 20s, parsing robusto de erro, detect “0 enviados”.
- `supabase/functions/manual-step-send/index.ts` — pré-flight `whapi_instance_status`, classificação de `whapi_network`, status codes consistentes.
- Novo `src/components/captacao/SendSequenceDialog.tsx` — confirma + barra de progresso + cancel.

**Sem mudança de DB.** (a checagem de `whapi_instance_status` já tem coluna em `consultants`).

**Memória nova:** `mem://features/capture-sheet-compact-and-sequence` — modo padrão compacto (h-44dvh), botão “Enviar todos” com delays humanos, timeout 20s no wrapper, busca por número para destravar leads-fantasma.

---

## Fora de escopo

- Reescrever OCR.
- Mudar copy dos passos.
- ConfirmSendDialog global (fica adiado — o novo botão de sequência já cobre o caso crítico).
