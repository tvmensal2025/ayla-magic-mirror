## Dois bugs reais identificados (com evidência no banco)

Lead de teste `Lucas` (`1eac682c-...`) está com:
- `name = "Lucas"` (digitado), `name_source = "user_confirmed"`
- `bill_holder_name = "BENEDITA DE JESUS GALVAO"` (OCR da conta)
- `conversation_step = "duvidas_pos_club"` ← step legado, **não existe no fluxo customizado dele**

### Bug 1 — "Sim" não avança depois de confirmar a conta

Depois do "✅ SIM" na confirmação dos dados da conta, o `bot-flow.ts` (linha 2020) faz:

```ts
updates.conversation_step = "duvidas_pos_club";
```

Mas o consultor desse lead tem fluxo **customizado** no `/admin/fluxos` (positions 1-10, sem nenhum step chamado `duvidas_pos_club`). Resultado:
- Conversational engine recebe `stepKey="duvidas_pos_club"` → não acha → cai no branch "unknown step → restart at firstActive"
- A próxima mensagem do lead ("sim") faz o bot **reiniciar do Passo 1** (boas-vindas) em vez de ir pro próximo passo.

### Bug 2 — Nome digitado venceu o nome do OCR

`safeAssignName` (linha 226 do `bot-flow.ts`) tem uma guarda de similaridade Levenshtein: se o nome atual e o OCR forem muito diferentes (<0.7), **mantém o atual**. Como "Lucas" foi salvo primeiro (capture do step de nome), o OCR "BENEDITA" foi descartado e o cadastro virou um Frankenstein (nome do lead Lucas + titular da conta Benedita).

Você quer o oposto: **o nome real vem da conta de luz ou do documento**. O que o lead digita é só para a saudação inicial, nunca para o cadastro.

---

## Solução proposta (cirúrgica, sem reescrever fluxo)

### Fix 1 — Avanço pós-confirmação respeita o fluxo customizado

No `confirmando_dados_conta` case (linha 1994 de `bot-flow.ts`), em vez de hardcodar `conversation_step = "duvidas_pos_club"`:

1. Tentar pegar o **próximo step ativo por position** no fluxo do consultor a partir do step `capture_conta` (ou do step com `step_type='capture_documento'` se existir).
2. Se achar → `conversation_step = <id_do_próximo>`, dispatcha o conteúdo dele pelo `dispatchStepFromFlow`.
3. Se NÃO achar (consultor não tem fluxo configurado) → mantém comportamento atual (legado `duvidas_pos_club`).

Mesmo padrão já é usado em outros pontos (`stepTypeToCadastro`, `findActiveByType`).

Faz a mesma proteção no `pitch_conexao_club` e no `duvidas_pos_club` cases — quando o fluxo customizado tem step seguinte por position, usa ele.

### Fix 2 — OCR sempre vence sobre nome digitado

Mudanças mínimas em `safeAssignName` + sites que gravam nome:

1. **`safeAssignName`**: remover a guarda de similaridade quando `currentSource ∈ {self_introduced, user_typed, unknown}`. Só mantém a guarda quando o nome atual veio de outro OCR (`ocr_conta`/`ocr_doc`) ou `user_confirmed` via passo de edição explícito (`editing_*`). Assim, OCR sempre sobrescreve nome digitado.

2. **Capture de nome em texto livre**: marca como `name_source = "self_introduced"` (já é, em vários sites) — não como `user_confirmed`. O `user_confirmed` deve ser reservado para confirmação **explícita** dos dados do OCR (botão SIM no `confirmando_dados_conta` / `confirmando_dados_doc`). Hoje o SIM no `confirmando_dados_conta` faz `name_source = "user_confirmed"` (linha 1998) — isso continua certo porque o usuário viu os dados do OCR e confirmou. Mas se nesse momento `customer.name` ainda for o nome digitado (e não o do OCR), o SIM "trava" o nome errado.

3. **Antes de salvar `name_source = "user_confirmed"` no SIM da conta**: se `bill_holder_name` existe e `customer.name` não veio de OCR (`name_source !∈ {ocr_conta, ocr_doc}`), **sobrescreve** `name = bill_holder_name` + `name_source = "ocr_conta"` antes do `user_confirmed`. Garante que o SIM esteja confirmando o titular real.

4. **Removendo captura de nome do welcome/early text** (opcional, conservador): a captura de nome no welcome (que adicionei antes) fica, mas só serve pra saudar o lead em texto — não bloqueia OCR. O Fix 1 do safeAssignName já garante isso.

### O que NÃO muda

- Estrutura do fluxo, transitions, captures configuradas pelo consultor
- Lógica de OCR, edge functions de processamento de imagem
- RLS, schemas, autenticação
- Steps de edição manual (`editing_conta_nome`, etc.) continuam podendo trocar nome

---

## Arquivos editados

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`:
  - `safeAssignName` — afrouxa guarda quando fonte atual é não-OCR
  - `case "confirmando_dados_conta"` — antes do SIM, força `name = bill_holder_name` se OCR existe; depois, próximo passo = primeiro step do fluxo customizado com `step_type='capture_documento'` (fallback: legado `duvidas_pos_club`)
  - `case "pitch_conexao_club"` e `case "duvidas_pos_club"` — quando há fluxo customizado com próximo step por position, vai pra ele; senão mantém legado
- `supabase/functions/_shared/conversation-helpers.ts`:
  - Pequeno helper `findNextFlowStepByType(supabase, flowId, fromPosition, stepType)` para evitar duplicar SQL nos 3 cases

## Resultado esperado

| Situação | Hoje | Depois |
|---|---|---|
| Lead digita nome "Lucas", OCR da conta lê "BENEDITA" | name=Lucas, bill_holder=BENEDITA (conflito) | name=BENEDITA (OCR vence), Lucas vira só saudação |
| Lead clica SIM no confirmando_dados_conta | Vai pra `duvidas_pos_club` (step inexistente no fluxo custom) → reseta no Passo 1 | Vai pro próximo `capture_documento` configurado |
| Consultor sem fluxo customizado | Comportamento legado | **Igual** (mantém legado) |
| Lead em fluxo customizado responde "sim" no step do consultor | OK | **Igual** (não muda nada nos steps do fluxo) |

## Critério de sucesso

1. Lead `1eac682c` (Lucas/Benedita) — depois do fix, próximo SIM avança para `capture_documento` do fluxo customizado e o nome vira "BENEDITA".
2. Lead em fluxo padrão Camila — comportamento legado preservado.
3. Logs `[post-confirm-conta] next=<step_id> reason=customflow` ou `legacy`.

Se aprovar, faço só no whapi-webhook primeiro, testo no seu número, depois replico no evolution-webhook.
