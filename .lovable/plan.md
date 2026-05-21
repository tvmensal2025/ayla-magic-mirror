# Plano: envio passo-a-passo respeitando A/B/C (parar de "atirar tudo de uma vez")

## Diagnóstico

Hoje, ao clicar em "Disparar tudo" (`SendSequenceDialog`) ou nos botões do `FlowQuickBar` / `ManualStepDialog`, o sistema:

1. Pega TODOS os passos pendentes do fluxo do consultor.
2. Faz um `for` enviando passo 1 → delay 2-5s → passo 2 → delay → passo 3… sem esperar o lead responder.
3. O resultado no print é o áudio "Olá, qual seu nome?" sendo enviado mesmo o Rafael já tendo respondido — porque o disparador joga vários passos em fila local, sem ler `customer.conversation_step` atualizado nem aguardar inbound.
4. Variante (A/B/C) é só lida do `customer.flow_variant`, sem opção de o consultor escolher manualmente.

O usuário quer: **um passo de cada vez, do fluxo escolhido (A, B ou C), e só avança quando o lead respondeu**.

## O que muda

### 1. `SendSequenceDialog` vira `SendNextStepDialog` (single-step mode)

- Em vez de loop, mostra **só o próximo passo pendente** do fluxo selecionado.
- Botão principal vira **"Enviar próximo passo"** (não mais "Disparar tudo").
- Depois de enviar:
  - Marca o passo como enviado.
  - Fica em estado **"Aguardando resposta do lead…"** com um spinner e o texto do passo enviado.
  - Botão "Enviar próximo" fica **desabilitado** até detectar inbound novo (subscription Realtime em `whatsapp_messages` filtrando `customer_id` + `direction='inbound'` posterior ao último send).
  - Quando o lead responder, libera o botão "Enviar próximo passo" novamente (com o título do próximo passo da variante).
- Remove o `for` que enfileira todos os passos.

### 2. Seletor A/B/C ativo em todos os disparadores

Em `FlowQuickBar.tsx`, `ManualStepDialog.tsx` e `CaptureSheet.tsx`:

- Chips `A | B | C` no topo, default = `customer.flow_variant`.
- A lista de passos pendentes passa a vir de `bot_flow_steps WHERE flow_id = (bot_flows WHERE consultant_id=X AND variant=<selecionada>)`.
- Trocar de variante recarrega a lista — sem misturar passos de A com B.
- A variante selecionada é passada como `variant: 'A'|'B'|'C'` no payload de `manual-step-send`.

### 3. Backend: travas anti-disparo-em-massa em `manual-step-send`

Mantém o que já existe (`name_not_captured_yet`, `phone_invalid_format`) e adiciona:

- **`awaiting_inbound`**: se o último `whatsapp_messages.direction='outbound'` desse customer foi nos últimos N segundos (configurável, default 30s) e NÃO há inbound posterior, rejeita com `code: 'awaiting_inbound'` e mensagem "Aguarde o lead responder antes de enviar o próximo passo". Frontend já normaliza via `normalizeSendStepError`.
- **`step_already_sent`**: se o passo solicitado já foi enviado e o `customer.conversation_step` ainda está nele esperando resposta, exige `force=true` para reenviar.
- Validação da `variant` recebida: se o consultor mandar variante diferente da `customer.flow_variant`, persiste a troca em `customers.flow_variant` antes de disparar (evita misturar variantes na mesma conversa).

### 4. `CaptureStepsList.tsx`

- Filtra `bot_flow_steps` pela variante escolhida no chip A/B/C.
- Marca visualmente "PRÓXIMO" no card do passo que será disparado (`customer.conversation_step + 1` da variante atual).
- Remove botão "Disparar todos os pendentes". Substitui por "Enviar este passo" individual no card destacado.

### 5. `FlowQuickBar.tsx`

- Botão verde "Enviar próximo passo do Fluxo {A/B/C}" — manda só 1.
- Estado "aguardando resposta" visual no botão (cinza + spinner) entre disparo e próximo inbound.

## Comportamento esperado depois

```
Consultor abre conversa do Rafael (variant=A, step=welcome)
→ vê chip [A] selecionado, botão "Enviar próximo: ask_name"
→ clica → áudio + texto de welcome saem
→ botão vira "Aguardando Rafael responder…" (disabled)
→ Rafael manda "Lucas"
→ botão libera: "Enviar próximo: ask_bill_value"
→ consultor clica → manda → aguarda → …
```

Nunca mais vai mandar áudio + texto + foto + áudio de novo em rajada.

## Arquivos alterados

- `src/components/captacao/SendSequenceDialog.tsx` — converter em single-step + subscription Realtime de inbound
- `src/components/captacao/CaptureStepsList.tsx` — filtro por variant + destacar próximo
- `src/components/captacao/CaptureSheet.tsx` — chips A/B/C + abre dialog single-step
- `src/components/whatsapp/FlowQuickBar.tsx` — chips A/B/C + botão único "enviar próximo" + estado aguardando
- `src/components/admin/AIAgentTab/ManualStepDialog.tsx` — chips A/B/C + filtro de variant
- `src/lib/whatsapp/send.ts` — adicionar `variant` no payload + tratar `awaiting_inbound` / `step_already_sent` no normalizador de erro
- `supabase/functions/manual-step-send/index.ts` — travas `awaiting_inbound`, `step_already_sent`, persistir troca de variant

## Fora de escopo

- Bot automático (`whapi-webhook`) continua igual — já é passo-a-passo nativo.
- Round-robin A/B/C na criação do lead (`assign_flow_variant`) — não muda.
- Não mexer em Portal Worker / OTP.
