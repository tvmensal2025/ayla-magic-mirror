# Auditoria — Lead 5511971254913 (Josinete/Paulo/Leoncio)

Investiguei o cliente `d4cd54bf-7c34-47d5-aa00-7595922fbe39` (ligado ao consultor `0c2711ad…`) cruzando `customers`, `conversations` e os edge logs. Aqui está o que aconteceu e o que precisa ser corrigido.

## O que aconteceu de verdade

```text
15:04  inbound  "Oi"
15:05  outbound "{Rafael}, qual o valor médio da sua conta de luz?"   ← variável não substituída
15:05  inbound  "leoncio"                                              ← lead respondeu o NOME no slot de VALOR
15:05  outbound "{Leoncio}, qual o valor médio…"                        ← bot capturou como nome só pra montar saudação
15:06  inbound  "399"
15:06  outbound "{Leoncio}, qual o valor…"                              ← REPETIU mesma pergunta
15:08  inbound  "sim"
15:08-10  outbound  passo a71ba814 (texto "É simples…" + imagem fazenda_solar) DUPLICADO 2x
15:10  outbound passo 559b8f1b ("Deu para entender…") DUPLICADO 3x
15:10  outbound aguardando_conta
15:11  inbound  foto conta            → OCR: JOSINETE NUNES DA SILVA (bill_holder_name)
15:11  inbound  "✅ SIM"               → confirmou conta
15:11  outbound aguardando_doc_auto
15:12  inbound  foto doc              → OCR: PAULO ROBERTO FIGUEIREDO (doc_holder_name)
                                       mismatch_flag=TRUE (sim=0.04)
15:12  inbound  "✅ SIM" doc
        →  step pulou direto pra `finalizando` (esperado: `confirmar_titularidade`)
        →  NUNCA pediu email, NUNCA confirmou WhatsApp, NUNCA fechou o resumo do game
```

Estado final em `customers`:

- `name = "JOSINETE NUNES DA SILVA"` (sobrescrito pelo OCR da conta)
- `doc_holder_name = "PAULO ROBERTO FIGUEIREDO"` (RG)
- `name_mismatch_flag = true`, `name_mismatch_acknowledged_at = null`
- `email = null`, `phone_contact_confirmed = false`
- `conversation_step = "finalizando"`
- `flow_variant = "A"` fixo (sem chip A/B/C no painel)

## Causas-raiz identificadas

1. **Variável `{name}` não substituída** — o passo do FluxoCamila usa `{Rafael}` / `{Leoncio}` literais em vez do token `{{nome}}` esperado pelo replacer (ver mem `whatsapp-message-variables`). Por isso o bot tratou a primeira resposta ("leoncio") como nome e não como valor da conta.
2. **Resolver de fluxo custom ignora `confirmar_titularidade**` — em `whapi-webhook/handlers/bot-flow.ts` o branch `confirmando_dados_doc → SIM` (linha ~3324) checa `name_mismatch_flag` e roteia para `confirmar_titularidade`. Mas quando há fluxo custom ativo, o resolver pós-switch (mem `custom-flow-step-engine`, ~linha 2347) usa `findNextActiveFlowStep` sem respeitar `updates.conversation_step = "confirmar_titularidade"`, sobrescrevendo para o próximo passo custom (`finalizando`). Resultado: pula confirmação de titularidade + email + confirmação de telefone.
3. **Steps duplicados (audio/texto/imagem 2-3x)** — o passo `559b8f1b` foi disparado pelo cron de re-engajamento porque o lead respondeu "sim" enquanto o passo anterior ainda estava no buffer de envio. O anti-rep de 10min só cobre `last_custom_prompt_at` para `aguardando_conta/doc_auto`, não para passos `message` do fluxo custom.
4. **Lock de nome funcionou tarde demais** — `safeAssignName` bloqueou o OCR do RG (mantendo JOSINETE), mas o lock deveria ter funcionado ao contrário aqui: o consultor deveria ter visto que o nome digitado pelo lead ("leoncio") foi descartado porque a variável veio errada. Nenhum aviso na UI.
5. **MessageComposer no Modo Game não tem chip A/B/C** — variant fica fixo no que está em `customers.flow_variant` (round-robin), sem o consultor poder forçar B (sem áudio) ou C (vídeo).
6. **Game não fechou cadastro** — os 10 quadrados marcaram só até "Documento com foto"; faltam os tiles "Email" e "Confirmar WhatsApp" porque o fluxo custom não tem passos `capture_email` nem `confirm_phone` ativos para essa variante.

## Plano de correção

### A. Backend — `supabase/functions/whapi-webhook/handlers/bot-flow.ts`

1. **Honrar `confirmar_titularidade` mesmo com fluxo custom ativo.**
  No bloco pós-switch (~2347 e equivalente do confirm doc), antes de chamar `findNextActiveFlowStep`, checar:
2. **Anti-rep também para passos custom tipo `message`.** No `dispatchStepFromFlow`, gravar `last_custom_prompt_at` + `last_custom_prompt_step_id` e, antes de disparar, bloquear se < 30 s e mesmo step_id.
3. **Fallback de titularidade quando custom flow não tem `capture_email`/`confirm_phone`.** Após `confirmar_titularidade` resolver "Mesma pessoa", mandar para `ask_email` (legacy) → `ask_phone_confirm` antes de `finalizando`, mesmo com flow custom ativo.

### B. Backend — `supabase/functions/_shared/whatsapp-vars.ts` (ou equivalente do replacer)

4. **Aceitar tanto `{nome}` / `{{nome}}` / `{name}**` (regex `\{\{?\s*(nome|name)\s*\}?\}`). Hoje os admins gravam `{Rafael}` achando que é variável e vira literal.

### C. Frontend — Modo Game (`src/components/captacao/CaptacaoPanel.tsx` + `MessageComposer`)

5. **Chip A/B/C visível no header do Game** — botão segmentado (`ToggleGroup`) que faz `update customers.flow_variant` + recarrega passos. Já existe lógica em `manual-step-send` (`variant`), só faltava a UI.
6. **Aviso "nome divergente"** — banner amarelo quando `name_mismatch_flag=true` mostrando `bill_holder_name` × `doc_holder_name` e dois CTAs: "Mesma pessoa", "Outro titular (digitar relação)". Dispara o passo `confirmar_titularidade` via `manual-step-send`.
7. **Sempre exibir os 10 tiles canônicos** (welcome→nome→valor→explicação→conta→confirma conta→doc→confirma doc→**email**→**confirma whatsapp**→finalizar) mesmo se o fluxo custom não tiver esses passos — os 2 últimos chamam `ask_email` e `ask_phone_confirm` legacy.

### D. Limpeza do lead atual

8. Reabrir o lead `d4cd54bf…`:
  ```sql
   UPDATE customers SET
     name = NULL, name_source = 'unknown',
     conversation_step = 'ask_email',
     name_mismatch_acknowledged_at = now(),
     bill_owner_relationship = 'titular'  -- a confirmar com o consultor
   WHERE id = 'd4cd54bf-7c34-47d5-aa00-7595922fbe39';
  ```
   (faço só depois da sua aprovação — quero confirmar se o titular real é Josinete ou Paulo)

## Fora de escopo

- Não vou mexer no compress-worker, no portal-worker, nem no Evolution webhook.
- Não vou refazer FluxoCamila no admin — só ajusto o engine pra tolerar passos faltando.

## Pergunta para você antes de eu implementar

Quem é o titular real desse cadastro: **Josinete** (nome da conta) ou **Paulo Roberto** (nome do RG)? IREMOS LIMPAR ESSE LEAD COLOQUEI PARA MAPEAR E ENTENDER O ERRO.