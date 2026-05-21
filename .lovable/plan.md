# Análise: o manual "1 a 1" / "seguir o fluxo" leva o lead até o portal?

Resposta curta: **quase tudo está pronto, MAS há 2 pontos que ainda quebram o cadastro automático no portal quando a IA está em modo manual (globalAiDisabled = true).**

---

## 1. O que JÁ funciona hoje

Quando você clica **"Devolver para o passo"** em qualquer passo de captura, o `manual-step-send` faz o seguinte (`supabase/functions/manual-step-send/index.ts`):

- Mapeia o passo custom para a chave legada (`mapCaptureStepToLegacy`):
  - `capture_conta` → `aguardando_conta`
  - `capture_documento` / `capture_doc` → `aguardando_doc_auto`
  - `capture_email` → `ask_email`
  - `confirm_phone` → `ask_phone_confirm`
  - `finalizar_cadastro` → `finalizando`
- Envia o prompt do passo (texto do passo → retry_text → fallback padrão).
- Atualiza `customers.conversation_step` para a chave legada e despausa o bot.
- A próxima resposta do cliente cai no `whapi-webhook`, que roteia pelo `bot-flow.ts` exatamente como no fluxo da Camila — captura **nome, email, CPF/RG, CEP, número, complemento, valor da conta, conta de luz (com OCR), documento frente/verso**.

Depois que o cliente conclui o último campo, o fluxo chega a `finalizando` (linhas 4080–4290 de `bot-flow.ts`):

1. Auto-confirma o telefone do WhatsApp se faltar.
2. Roda `validateCustomerForPortal()` — se faltar algo, redireciona pro passo certo (anti-loop de 1 tentativa).
3. Se passou na validação: marca `status = portal_submitting`, regenera `igreen_link` com o `cadastro_url` do consultor dono, envia a mensagem "✅ Todos os dados coletados…" e dispara `POST {portal_worker_url}/submit-lead` (com health-check + 3 retries).
4. O worker da VPS abre o portal iGreen, recebe o OTP que volta via `submit-otp` (passo `aguardando_otp` → `validando_otp`) e finaliza com a validação facial.

Ou seja: **o pipeline existe inteiro até o portal.**

---

## 2. Pontos que QUEBRAM no modo manual atual

### 2.1 `globalAiDisabled` + qualquer mensagem que NÃO seja arquivo

O patch que apliquei agora libera o pipeline **somente quando `isFile = true**` (foto da conta, documento). Para:

- texto do **nome** (passo `ask_name`),
- texto do **email** (`ask_email`),
- texto do **CPF / RG / CEP / número / valor** (`ask_cpf`, `ask_rg`, `ask_cep`, `ask_number`, `ask_bill_value`),
- botão de **confirmar telefone**,
- botão de **finalizar** (`ask_finalizar`),

o webhook ainda retorna no early-gate do `globalAiDisabled` e **só salva o inbound sem rodar `runBotFlow**`. Resultado: o cliente responde, mas `conversation_step` não avança e os campos não são preenchidos.

**Correção necessária:** ampliar o bypass do `globalAiDisabled` para qualquer cliente cujo `conversation_step` esteja em uma "lista de passos de captura ativa" — não só arquivos:

```
CAPTURE_STEPS = [
  "ask_name", "ask_email", "ask_cpf", "ask_rg", "ask_cep",
  "ask_number", "ask_complement", "ask_bill_value",
  "ask_phone_confirm", "aguardando_conta", "confirmando_dados_conta",
  "aguardando_doc_auto", "ask_doc_frente_manual", "ask_doc_verso_manual",
  "ask_finalizar", "finalizando", "portal_submitting", "aguardando_otp"
]
```

Quando `globalAiDisabled = true` E `conversation_step ∈ CAPTURE_STEPS` → segue para `runBotFlow`. O `silentMode` continua valendo **só para mídia inicial sem prompt** — quando você já mandou o lead para `ask_xxx`, o bot precisa responder normalmente, senão o cliente não sabe o que digitar a seguir.

### 2.2 `finalizando` no modo manual precisa enviar de verdade

Hoje o bloco `finalizando` faz `sendText(remoteJid, "✅ Todos os dados coletados…")` e chama `/submit-lead`. Com `silentMode` ativo, esse `sendText` vira no-op e o `/submit-lead` também precisa ser disparado.

**Correção necessária:** no `finalizando` (e em `portal_submitting`, `aguardando_otp`, `validando_otp`), **desligar o silentMode** — independente do `globalAiDisabled`. São passos terminais críticos; precisam falar com o cliente e com o worker.

---

## 3. Plano de implementação

### Arquivo: `supabase/functions/whapi-webhook/index.ts`

1. Definir `const ACTIVE_CAPTURE_STEPS = new Set([...lista acima])`.
2. No gate `globalAiDisabled` (~linha 476), trocar a condição:

```ts
const inActiveCapture = ACTIVE_CAPTURE_STEPS.has(customer?.conversation_step || "");
const isTerminalPortalStep = ["finalizando","portal_submitting","aguardando_otp","validando_otp"]
  .includes(customer?.conversation_step || "");

if (globalAiDisabled && !isFile && !inActiveCapture) {
  // mantém comportamento atual: salva inbound silencioso e retorna
}
// senão: segue para runBotFlow
const silentMode = globalAiDisabled && isFile && !inActiveCapture && !isTerminalPortalStep;
```

3. Manter o wrapper `silentMode` no `sender` apenas quando `silentMode === true`. Para passos de captura ativa e terminais, usar `sender` real (`sendText`, `sendButtons`, `sendMedia`, `sendPresence`).
4. Não suprimir mais `finalReply` quando o passo é de captura ativa ou terminal.

### Arquivo: `supabase/functions/whapi-webhook/handlers/bot-flow.ts`

Sem mudanças. Toda a lógica de validação, envio ao portal e tratamento de OTP já está correta.

### Arquivo: `supabase/functions/manual-step-send/index.ts`

Sem mudanças. Já mapeia corretamente e despausa o bot.

---

## 4. Validação após o fix

1. Simular um lead novo com `ai_agent_config.enabled = false`.
2. No `/admin`, clicar "Devolver para o passo: Captura do nome" → cliente recebe o prompt.
3. Cliente responde nome → `ask_name` salva, avança para `ask_email`, bot envia prompt automaticamente.
4. Continua até `ask_finalizar` → bot dispara `/submit-lead` no portal worker.
5. Conferir nos logs: `lead_complete`, `worker-portal resposta 200`, e depois `aguardando_otp` recebendo o código.

---

## 5. Resumo objetivo


| Etapa                                          | Status hoje            | Após o fix |
| ---------------------------------------------- | ---------------------- | ---------- |
| Devolver pro passo manualmente                 | ✅ funciona             | ✅          |
| Cliente envia foto da conta (OCR + URL salvos) | ✅ (acabei de corrigir) | ✅          |
| Cliente digita nome, email, CPF, CEP, etc.     | ❌ trava no gate        | ✅          |
| Cliente envia documento (frente/verso)         | ⚠️ depende do passo    | ✅          |
| Botão "Finalizar" → portal worker              | ❌ não chega lá         | ✅          |
| OTP volta do worker e completa cadastro        | ✅ código já existe     | ✅          |


Pra ficar **exatamente igual ao fluxo da Camila**, falta só o ajuste no gate do `globalAiDisabled` descrito no item 3 acima.  
  
TEM QUE FUNCIONAR NO INDIVIDUAL E NO MODO GAME DE IR PASSANDO PASSO A PASSO