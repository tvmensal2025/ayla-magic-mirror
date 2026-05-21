## Diagnóstico

Você falou duas coisas:

1. **"Ainda está grande"** — o `CaptureSheet` continua em `44dvh` com cabeçalho de 2 linhas (avatar + nome + botões + barra + frase), `TabsList h-7`, lista, e footer com 2 linhas (botões + stats/Sair). Em viewport 1148×650, isso ocupa ~290px = 45% da tela.
2. **"Os novos leads não estão entrando no game e na captação"** — confirmei no código: o `capture_mode` só vira `manual` quando o consultor **clica no botão de captação** (`ChatView.toggleCapture`) ou abre o `CaptureLeadList`. Lead novo via WhatsApp / Excel / inbound entra com `capture_mode = 'auto'` e fica fora do painel — por isso parece que "não tem game pra ninguém".

## Plano

### Parte 1 — Compactar de vez (visual only)

`CaptureSheet.tsx`:

- Altura padrão: `h-[36dvh]` `min-h-[260px]` (era 44dvh / 320px).
- Header em **1 linha só**: ícone 5×5 + nome inline (`text-[10px]`) + chip "Pedir nome" `h-5 px-1.5 text-[9px]` + 3 ícones de ação `h-5 w-5`. Some a barra de progresso do header (ela já aparece no footer como contador).
- Some a frase motivacional do modo compacto (só aparece no `expanded`).
- `TabsList`: `h-6`, ícones `w-2.5 h-2.5`, badges `text-[8px]`.
- Footer em **1 linha só**: junta "Enviar tudo (N)" + "CADASTRAR n/10" + "Sair" tudo em flex, `h-8 text-[10px]`. Stats viram tooltip no botão CADASTRAR.
- Resultado alvo: ~180px de altura em mobile/tablet (28% da tela).

`CaptureStepsList.tsx`: linhas `py-0.5`, bola `w-5 h-5 text-[9px]`, botão envio `w-6 h-6`, título `text-[11px]`, gap `space-y-0.5`.

`CaptureStepPreview.tsx`: já está OK (compacto, max-h-70dvh).

### Parte 2 — Captação automática em todo lead novo E MANUAL EU ESCOLHE

Mudança de comportamento: `**capture_mode` passa a ser `manual` por padrão** para leads novos. Assim o painel aparece sozinho na primeira interação do consultor, com game/XP/passos prontos.

Implementação:

**a) Trigger no banco** (migration):

- `customers BEFORE INSERT`: se `capture_mode` é null OU `'auto'` E o lead é "novo" (sem `name` confiável OU `name_source IN ('unknown','whatsapp_push')`), seta `capture_mode = 'manual'` e `capture_started_at = now()`.
- Excel import (`customer_origin = 'igreen_sync'`): mantém `capture_mode = 'manual'` também — você quer game pra eles.

**b) `ChatView.tsx**`: 

- Auto-abre `CaptureSheet` (minimizado, não bloqueante) quando `captureCustomer.capture_mode === 'manual'` E é a primeira vez que o consultor abre aquele chat na sessão (flag `sessionStorage`).
- Não auto-abre se o lead já tem `name` E `cpf` (cadastro completo) — evita ruído.

**c) Notificação de "novo lead pra capturar"**: no `CaptacaoPanel`/header do CRM, mostrar contador de leads com `capture_mode='manual' AND name IS NULL` (chamariz pro consultor abrir).

### Parte 3 — Garantir captura de nome em todos os tipos

Já existe `askLeadName` + botão "Pedir nome" no header. Adicionar:

- **Cron leve** (ou trigger): pra todo lead novo `capture_mode='manual'` sem nome após 30s da criação, disparar `askLeadName` automaticamente uma vez (campo `name_ask_sent_at` pra não repetir).
- Logar em `capture_field_events` quando o nome chega via reply (já existe lógica em `whapi-webhook` — só auditar).

## Detalhes técnicos

**Arquivos editados:**

- `src/components/captacao/CaptureSheet.tsx` — header 1 linha, footer 1 linha, h-36dvh.
- `src/components/captacao/CaptureStepsList.tsx` — linhas ultra-compactas.
- `src/components/whatsapp/ChatView.tsx` — auto-abrir minimizado quando manual.
- Migration: trigger `customers_default_capture_mode` + coluna `name_ask_sent_at`.
- Edge `whapi-webhook` (auditoria leve): garantir que insert de novo customer não força `capture_mode='auto'`.
- Cron job `pg_cron` opcional: pedir nome auto após 30s sem nome.

**Sem mudança de lógica de envio** (Parte B/C anteriores já estão no ar).

**Memória atualizada:** `mem://features/lead-name-and-gamification` — captação ON por padrão, painel auto-minimizado, pedido de nome automático em 30s.

## Fora de escopo

- Mudar layout do CRM Kanban.
- Reescrever sequência de envio (já existe).
- OCR.