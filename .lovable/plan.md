
Validado: estamos no `whapi-webhook` (o `evolution-webhook` fica para depois). O diagnóstico abaixo é o mesmo, só muda o alvo dos arquivos.

## Diagnóstico (3 bugs reais)

### 1) Aviso de novo lead não chegou
`supabase/functions/whapi-webhook/index.ts` (~linha 286) só dispara `notifyNewLead(...)` dentro do branch que executa **somente quando o INSERT em `customers` deu certo** (linha 322). Se o lead já existia (importação Excel, teste anterior, registro reaproveitado pelo fallback nas linhas 299‑313, ou reset/finalizado virando "welcome"), a notificação **nunca** é enviada — foi exatamente o caso.

Além disso, mesmo quando dispara, depende de:
- `consultants.notification_phone || consultants.phone`
- `whatsapp_instances.instance_name` conectada

### 2) Passos customizados (1, 2, 3, 4, 5, 6, 7) são pulados pela Camila
Em `whapi-webhook/handlers/bot-flow.ts` linha **2234**, após o lead confirmar os dados da conta, o código chama:

```ts
findNextActiveFlowStep(supabase, consultantId, {
  stepTypeIn: ["capture_documento","capture_doc","finalizar_cadastro"]
})
```

Esse filtro **ignora** todos os outros `step_type` que o editor permite (`message`, `capture_conta`, `capture_email`, `confirm_phone`). Quando o consultor cria passos intermediários (pitch, FAQ, vídeo extra, confirmar telefone, captar e-mail) eles são **saltados**: a Camila pula direto do "SIM dados corretos" para o documento ou para a finalização.

### 3) Qualquer resposta no meio do fluxo custom reseta o bot
Quando o `step_type` não é `capture_documento`/`finalizar_cadastro`, a linha 2263 grava `conversation_step = nextCustom.id` (um **UUID**). Na próxima mensagem do lead, o `switch (step)` da linha 1845 não tem `case` para UUID → cai no `default:` (linha 3340) que loga `"Step desconhecido"` e **reseta para `aguardando_conta`**, mandando "envie a foto da conta de luz" do zero.

Os três somados explicam exatamente: aviso não veio, passos novos não rodam, e qualquer pergunta derruba o lead pro Passo 1.

---

## O que vou implementar (tudo no whapi)

### A. Notificar novo lead também em reaproveitamento
`supabase/functions/whapi-webhook/index.ts`:
- Detectar "primeira mensagem real" = customer recém-criado **OU** customer sem inbound nas últimas 24h **OU** customer vindo de status/step finalizado e reaberto agora.
- Disparar `notifyNewLead` nesses casos (dedup de 60 s do helper continua válido).
- Sem alterar a criação — só ampliar quando notifica.

### B. Engine genérico para passos customizados do FluxoCamila
`supabase/functions/whapi-webhook/handlers/bot-flow.ts`:

1. **Pós-`confirmando_dados_conta`** (~linha 2234): remover o filtro `stepTypeIn`. Pegar simplesmente o próximo passo ativo por `position`, qualquer `step_type`. Aplicar pipeline especial só quando o tipo for `capture_*` ou `finalizar_cadastro`.
2. **Início do `switch (step)`** (~linha 1845): antes do switch, resolver step custom. Se `conversation_step` for UUID ou bater com algum `bot_flow_steps.step_key` ativo do consultor:
   - Carregar `step_type` e `position`.
   - Se for `capture_conta` → roteia para `aguardando_conta`.
   - Se for `capture_documento` → roteia para `aguardando_doc_auto`.
   - Se for `capture_email` → roteia para `ask_email`.
   - Se for `confirm_phone` → roteia para `ask_phone_confirm`.
   - Se for `finalizar_cadastro` → roteia para `finalizando`.
   - Se for `message` → trata como passo informativo: qualquer resposta avança para o próximo passo ativo por `position` via `dispatchStepFromFlow` + atualiza `conversation_step` (UUID do próximo, ou step legado se for capture). Se não houver próximo, cai em `finalizando`.
3. **`default:` (~linha 3340)**: nunca resetar para `aguardando_conta` se o consultor tem fluxo custom ativo — re-disparar o passo atual (idempotente, anti-rep de 10 min já existe) e logar.

### C. Anti-trava
- Se `dispatchStepFromFlow` voltar `false` (sem texto/mídia configurado), avança automaticamente para o próximo passo em vez de ficar parado.
- Mantém anti-repetição de 10 min.

---

## Arquivos alterados

- `supabase/functions/whapi-webhook/index.ts` — ampliar gatilho de `notifyNewLead`.
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — engine de passos custom + `default` seguro.

Sem mudança de schema. `evolution-webhook` fica intocado nessa rodada (espelhamos depois).

## Validação

1. Reler o trecho editado e confirmar que nenhum caminho cai em `aguardando_conta` quando há fluxo custom.
2. Rodar `bot-flow_test.ts` + adicionar caso "lead em step UUID responde texto → avança pro próximo, não reseta".
3. Conferir no log do `whapi-webhook` que `notifyNewLead` foi chamado mesmo com customer pré-existente.
