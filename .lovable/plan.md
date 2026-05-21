## Resumo das correções pedidas

1. **Botão CADASTRAR** apagado/cinza por padrão → vira **verde pulsante** só quando 100% dos campos preenchidos + confirmados. Clicar dispara cadastro na VPS (OTP).
2. `**{{valor_conta}}` aparecendo vazio** no passo "pedir conta" — bug de variável (o preview manual só substitui `{{valor}}`, não `{{valor_conta}}`).
3. **Confirmação de DADOS DA CONTA** (não o valor) — quando cliente manda foto/PDF da conta, OCR extrai **titular, nº instalação, CEP, rua, número, cidade/UF, distribuidora** e mostra card de confirmação igual o fluxo automático já faz, com opção: enviar pro **Cliente confirmar** OU **Consultor confirmar** + Sim/Não/Editar.
4. **Confirmação de DADOS DO DOCUMENTO** (RG/CNH) — OCR extrai **nome completo, CPF, RG, data nascimento, órgão emissor** → mesmo card de confirmação Cliente/Consultor.
5. **Auto-mode** respeita variant A/B/C e o `delay_seconds` configurado por passo no fluxo.

## Mudanças

### 1. Fix `{{valor_conta}}` vazio

`src/components/captacao/CaptureStepPreview.tsx` (mapa de variáveis) e `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linhas 2106 e 2736) — adicionar:

```ts
"{{valor_conta}}": fmt(bill), "{valor_conta}": fmt(bill),
"{{conta}}": fmt(bill), "{conta}": fmt(bill),
"{{representante}}": consultantName,
```

### 2. Botão CADASTRAR cinza → verde

`CaptureSheet.tsx` + `CaptureLeadCard.tsx`:

- `canSubmit = filledCount === 9 && pendingConfirmations.length === 0` (ou seja, sem cards de confirmação pendentes).
- Estado cinza/disabled: `bg-muted text-muted-foreground opacity-50 cursor-not-allowed`.
- Estado pronto: gradient verde-emerald + `animate-pulse` + tooltip "Enviar pra VPS".
- Tooltip dinâmico quando incompleto: "Faltam: nome, CEP, confirmar conta…".
- Click → seta `conversation_step='finalizando'` (já dispara o `portal-worker` existente que envia pra VPS com OTP).

### 3. Card de confirmação de DADOS DA CONTA (igual o fluxo)

Novo: `src/components/captacao/CaptureBillDataCard.tsx`

Dispara automaticamente quando OCR da conta extrai os dados. Mostra card amarelo pulsante no topo da Ficha:

```
📄 Dados lidos da CONTA — confirme
─────────────────────────────────
Titular:        RAFAEL FERREIRA DIAS
Instalação:     1234567890
Distribuidora:  ENEL SP
CEP:            01310-100
Endereço:       Av Paulista, 1578
Cidade/UF:      São Paulo / SP
─────────────────────────────────
[ Pedir ao Cliente ]  [ Eu confirmo ]  [ Editar ]
```

Mesmo para DOCUMENTO (CaptureDocDataCard):

```
🪪 Dados lidos do DOCUMENTO — confirme
────────────────────────────────
Nome:           RAFAEL FERREIRA DIAS
CPF:            437.288.028-67
RG:             12.345.678-9
Nascimento:     20/07/1993
Órgão:          SSP/SP
────────────────────────────────
[ Pedir ao Cliente ]  [ Eu confirmo ]  [ Editar ]
```

**Pedir ao Cliente** → manda no WhatsApp:CO

**Eu confirmo** → aplica todos os campos no `customers` de uma vez, marca `accepted`.

**Editar** → expande inputs inline (já existe na ficha) pra cada linha.

Quando cliente responde SIM/OK/CORRETO → cron `whapi-webhook` aceita todos; quando corrige (manda texto livre) → reabre card com sugestão IA do texto novo.

### 4. Backend — extração e fila

- `capture-extract/index.ts`: ampliar prompt pra extrair **address_street, address_number, address_city, address_state, cep, distribuidora, installation_number, rg_orgao_emissor** quando a fonte é OCR de conta/documento (já existe `worker-callback` que sobe extração). Quando vier OCR de conta, agrupar inserts com `field_group='bill_data'`; quando documento, `field_group='doc_data'`.
- Migration: adicionar `capture_field_suggestions.field_group text` + `capture_field_suggestions.status` aceitar `awaiting_client`.
- Novo handler em `whapi-webhook/index.ts`: antes do bot-flow, se houver `field_group` com `status='awaiting_client'` para o customer, processar resposta (sim → aplica grupo; texto → reabre).

### 5. Hook + UI

- `src/hooks/useCaptureSuggestions.ts`: expor `groupedByField` (bill_data / doc_data / individual) e função `acceptGroup(group)` / `requestClientConfirm(group)`.
- `CaptureLeadCard.tsx` e `CaptureSheet.tsx`: renderizar `CaptureBillDataCard` e `CaptureDocDataCard` no topo da Ficha quando houver grupo pendente.

### 6. Auto-mode (variant A/B/C + delay por passo)

- `CaptureStepsList.tsx`: carregar `delay_seconds` no select de `bot_flow_steps` e propagar via `onStepsLoaded`.
- `SendSequenceDialog.tsx`: trocar `setTimeout(1500 + Math.random()*1000)` por `step.delay_seconds * 1000` (com mínimo 800ms).
- `dispatchStepFromFlow` no `bot-flow.ts` já respeita variant — sem mudança.

## Arquivos

- `src/components/captacao/CaptureStepPreview.tsx` (vars)
- `src/components/captacao/CaptureSheet.tsx` (botão cinza/verde + cards de confirmação)
- `src/components/captacao/CaptureLeadCard.tsx` (idem)
- `src/components/captacao/CaptureBillDataCard.tsx` (novo)
- `src/components/captacao/CaptureDocDataCard.tsx` (novo)
- `src/components/captacao/CaptureStepsList.tsx` (delay_seconds)
- `src/components/captacao/SendSequenceDialog.tsx` (timing real)
- `src/hooks/useCaptureSuggestions.ts` (grupos)
- `supabase/functions/capture-extract/index.ts` (extrair dados conta+doc agrupados)
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (vars + handler client confirm)
- `supabase/functions/whapi-webhook/index.ts` (intercept resposta de confirmação)
- Migration: `capture_field_suggestions.field_group` + status `awaiting_client`

## Fora de escopo

- Refazer Portal Worker / OTP (já funciona via `conversation_step='finalizando'`).
- Trocar engine de OCR.

nao mecher no portal e nem no otp, apenas ajustandoofluxo para captar os dados para chegar no portal