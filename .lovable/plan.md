## Objetivo

1. Acabar com as falhas silenciosas de envio (template rápido / passo de fluxo) que afetam alguns clientes.
2. Garantir que TODO lead novo tenha o nome capturado — não importa se entrou por WhatsApp, foi importado por Excel ou criado no Modo Captação.
3. Garantir que a gamificação (XP + missões da Captação) comece automática para todo lead novo.
4. Dar controle ao consultor: confirmar/editar/cancelar cada envio 1-a-1 antes de disparar.

---

## Diagnóstico (o que descobri investigando o caso da Marcia 5511916827893 e o código)

- Lead criado às 00:03, `name="(11) 91682-7893"` (placeholder do telefone), `name_source="unknown"`.
- Primeiro outbound foi o passo **position=4** ("qual o valor médio da sua conta?") — **pulou os passos 2 e 3** que pedem o nome e dão boas-vindas. Por isso o `{{nome}}` renderizou como `"(11)"` (primeiro token do placeholder).
- O `manual-step-send` hoje retorna 6 tipos de erro (`lead_sem_whatsapp`, `customer_no_phone`, `whapi_token_missing`, `no_active_flow`, `step_not_found`, `nothing_to_send`) — mas o front nem sempre mostra o toast com a mensagem amigável. Em outros casos a chamada parece OK mas a Whapi rejeita silenciosamente (instância desconectada / número inválido na operadora).
- Não existe pré-flight do status da instância Whapi nem confirmação antes do disparo.
- Quando o consultor abre o chat e dispara um passo pelo meio do fluxo, o nome do lead nunca é pedido → quebra todos os `{{nome}}` seguintes e a gamificação fica zerada.

---

## Plano

### Parte 1 — Envio 1-a-1 robusto (resolve "não dá pra enviar pra alguns")

**A. Pré-flight no `manual-step-send**` (e mesma checagem reutilizada em `whatsapp-bulk-send` e `manual-flow-send`):

- Normalizar telefone BR (9º dígito, DDI 55, validar 10–13 dígitos).
- Checar `consultants.whapi_instance_status` — se ≠ `connected`, retornar `instance_disconnected` com mensagem "WhatsApp do consultor desconectado, reconecte em /admin/conexao".
- Checar se a Whapi reconhece o número (chamada `check_phones` antes do primeiro envio para esse lead, cache 7 dias em `customers.whapi_phone_valid_at` + `whapi_phone_valid` boolean) — se inválido, retornar `phone_not_on_whatsapp`.
- Se passo não tem mídia nem texto (já tratado), mas melhorar mensagem.

**B. Diálogo de confirmação antes do disparo (novo)**

- Novo componente `ConfirmSendDialog` aberto pelo `CaptureSheet` / `QuickTemplateButton` / botões de passo, mostrando:
  - Nome + número formatado do lead.
  - Preview do conteúdo (texto renderizado, miniaturas das mídias).
  - Botões: **Confirmar envio** / **Editar texto** (abre textarea inline) / **Cancelar**.
- Preferência por consultor em `localStorage` ("não perguntar de novo nesta sessão") — default ligado.

**C. Toasts unificados**

- Wrapper `sendStepWithFeedback(payload)` em `src/lib/whatsapp/send.ts` que chama as 3 edges, lê `error.code`, e mostra toast amigável (mapa de códigos → mensagens em PT-BR). Substituir chamadas diretas em `CaptureSheet.tsx`, `QuickTemplates.tsx`, `BulkSend*`.

### Parte 2 — Captura de nome universal

**A. Inbound novo (WhatsApp)**

- No `whapi-webhook`, ao criar customer pela primeira mensagem, garantir que o **primeiro outbound seja sempre o passo `step_type=message` com `captures: [{field:name}]**` (procurar por captura de `name` no fluxo da variante; se não encontrar, usar welcome legacy com "Qual seu nome?").
- Auditar o resolver custom-flow para não pular esse passo quando a variante não tem áudio.

**B. Lead criado pelo Modo Captação / chat aberto manualmente**

- No `manual-step-send` e `manual-flow-send`: se `customer.name_source === 'unknown'` E o passo solicitado NÃO é de captura de nome, **bloquear** com erro `name_not_captured_yet` + mensagem "Antes de avançar peça o nome do lead — clique em 'Pedir nome'". 
- Adicionar botão **"Pedir nome"** no header do `CaptureSheet` que dispara um capture_nome rápido (texto: "Antes de continuar, qual é o seu nome? 😊") e marca `conversation_step='aguardando_nome'`.
- Quando o lead responder, o webhook salva em `customers.name` + `name_source='whatsapp_reply'` (lógica já existente, só validar).

**C. Excel import (`igreen_sync` / `sem_celular_`)**

- No upsert do importer, marcar `name_source='excel'` se nome veio preenchido — assim a regra B não bloqueia envio.

### Parte 3 — Gamificação automática para todo lead novo

- Trigger Postgres `on_customer_insert_gamify`:
  - Garante `capture_mode='auto'` (já é default, só consolidar).
  - Insere linha em `capture_xp_events` com `event='lead_in'` (+5 XP) se ainda não houver.
  - Inicializa `capture_missions` (ou tabela equivalente) com missões padrão pendentes (capturar nome, conta, documento, finalizar cadastro).
- No `whapi-webhook`, no primeiro inbound de cada lead, disparar `capture_xp_events` com `event='first_inbound'` (+5 XP) se ainda não existir.
- Quando `name_source` muda de `unknown` → válido, disparar `event='name_captured'` (+10 XP). Idem para `bill_uploaded`, `doc_uploaded`, `cadastro_finalizado`.
- `CaptureMissionsPanel` já lê dessas tabelas — só precisa que o trigger popule.

### Parte 4 — Destravar a Marcia agora

- Migration única para o lead `5511916827893`: zerar `conversation_step`, marcar pra perguntar o nome, disparar manual "Antes de continuar, qual é o seu nome?".

---

## Detalhes técnicos

**Edges alteradas:** `manual-step-send`, `manual-flow-send`, `whatsapp-bulk-send`, `whapi-webhook` (apenas welcome path + first-inbound XP), novo helper `_shared/whapi/preflight.ts` e `_shared/captacao/xp.ts`.

**Frontend alterado:** novo `src/components/whatsapp/ConfirmSendDialog.tsx`, novo `src/lib/whatsapp/send.ts` (wrapper + toast map), `src/components/captacao/CaptureSheet.tsx` (botão "Pedir nome" + usar wrapper), `src/components/whatsapp/QuickTemplates.tsx` (usar wrapper), `BulkSend*.tsx` (usar wrapper).

**DB:** colunas novas `customers.whapi_phone_valid` (bool), `customers.whapi_phone_valid_at` (timestamp), trigger `on_customer_insert_gamify`, eventos novos em `capture_xp_events` enum.

**Memórias atualizadas:** `mem://features/manual-step-capture-prompt` (acrescentar bloqueio name_source=unknown), `mem://features/captacao-intel` (XP automático por lifecycle), nova `mem://whatsapp/preflight-and-confirm` documentando confirmação antes do disparo.

---

## Fora de escopo

- Mudar copy dos passos de fluxo configurados pelos consultores (cada um edita o seu) MAS TEM O PRICIPAL DO SUPER ADMIN  NAO PODE SER APAGADO. .
- Reescrever o OCR / `extract-energy-bill` (já tratado em fix anterior).
- A/B/C variant rebalance.