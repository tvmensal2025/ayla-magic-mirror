## Objetivo

Garantir que, no fluxo da Camila, o **nome do titular** capturado pelo OCR (conta de luz e RG) **nunca seja sobrescrito por mensagens livres do lead** e que, na hora de finalizar, os dados da **conta de luz** e do **RG** estejam **iguais** — quando divergirem, o bot avisa o cliente e pede confirmação, **sem travar o fluxo**.

---

## Diagnóstico do que está errado hoje

1. `safeAssignName` (bot-flow.ts:200) já tem proteção, mas:
  - Só compara com `user_confirmed`. **Não trava** quando o nome veio de `ocr_conta` ou `ocr_doc` — então uma mensagem posterior do lead (ex.: "Lucas") ou um segundo OCR pior **pode sobrescrever** o nome da fatura.
  - Não é chamado em `extractCaptures` (conversational/index.ts:602) — lá o nome do passo "perguntar nome" sobrescreve **sem nenhuma checagem** de origem confiável.
2. Não existe nenhum ponto que **compare** `ocr_conta.nome` × `ocr_doc.nome` (RG). Se forem pessoas diferentes (ex.: conta no nome do pai, RG do filho), o sistema fecha o cadastro com inconsistência silenciosa.
3. Não há campos dedicados para guardar os dois nomes brutos — só sobra `customers.name`. Sem isso, é impossível verificar conflito depois.

---

## Plano

### A. Travar nome após OCR da conta

1. Adicionar `ocr_conta` e `ocr_doc` à lista de "nomes confiáveis que não podem ser sobrescritos sem confirmação explícita" em:
  - `safeAssignName` (bot-flow.ts:200): se `currentSource ∈ {ocr_conta, ocr_doc, user_confirmed}` e `currentName` válido, **só** aceita novo nome se vier de `user_confirmed`.
  - `extractCaptures` callsite (conversational/index.ts:602): não gravar `name` em `captureUpdates` quando `customer.name_source ∈ {ocr_conta, ocr_doc, user_confirmed}`, **a menos que** o passo seja explicitamente "editar nome" (`editing_conta_nome` / `editing_doc_nome`).
2. Em `editing_conta_nome` / `editing_doc_nome` (já existem), continuar marcando `name_source = 'user_confirmed'` (já é o caso em 2348/2459/2512).

### B. Guardar nomes brutos do OCR para auditoria e conferência

1. Migration: adicionar em `customers`:
  - `bill_holder_name text` — nome bruto da conta de luz (preenchido no OCR da conta).
  - `doc_holder_name text` — nome bruto do RG (preenchido no OCR do documento).
  - `name_mismatch_flag boolean default false`
  - `name_mismatch_reason text`
  - `name_mismatch_acknowledged_at timestamptz`
2. Onde gravar:
  - OCR conta (bot-flow.ts:~1808): além de `safeAssignName`, sempre setar `updates.bill_holder_name = ocrName`.
  - OCR doc frente/verso (bot-flow.ts:2047/2143/2221): sempre setar `updates.doc_holder_name = d.nome`.

### C. Verificação cruzada conta × RG (sem travar fluxo)

1. Criar helper `checkHolderMatch(billName, docName)` em `_shared/captureExtractors.ts`:
  - Normaliza (lowercase, remove acentos, colapsa espaços, remove sufixos comuns "JR", "FILHO").
  - Usa similaridade Levenshtein (`_levSim` já existente em bot-flow.ts — extrair para shared).
  - Retorna `{ match: boolean, similarity: number, reason?: string }`.
  - Considera match se similaridade ≥ 0.85 **ou** primeiro+último nome coincidirem.
2. Ponto de checagem: **logo após o OCR do RG** (quando os dois OCRs existem). Em bot-flow.ts no handler de doc, depois de gravar `doc_holder_name`:
  - Se `customer.bill_holder_name` existe e `!checkHolderMatch(bill, doc).match` → setar `updates.name_mismatch_flag = true`, `name_mismatch_reason = "bill=X doc=Y sim=0.42"`, e **anexar ao reply** uma mensagem do tipo:
    > "⚠️ Notei que o nome no seu RG (*João Silva*) é diferente do nome na conta de luz (*Maria Silva*). Sem problema, vamos seguir — mas na hora da finalização vou precisar confirmar com você se é a mesma pessoa ou se a conta vem em nome de outro titular (cônjuge, pai, mãe). Posso continuar?"
  - **Não interromper** o `goToStep` — só concatena o aviso ao texto do passo. Se o passo já encaminhava o lead, ele continua.
3. Antes do passo de **finalização/cadastro** (achar pelo `step_key` que envia para o portal):
  - Se `name_mismatch_flag = true` e `name_mismatch_acknowledged_at` é null → inserir um passo intermediário "confirmar titularidade" pedindo escolha:
  1. "É a mesma pessoa, só está escrito diferente" → grava `acknowledged_at`, mantém `customers.name` atual.
  2. "A conta está em nome de outra pessoa (cônjuge/pai/mãe)" → grava `bill_owner_relationship` em `customers` (nova coluna text) e segue.
  3. "Quero corrigir" → vai para `editing_conta_nome` ou `editing_doc_nome`.
    depois libera a finalização.

### D. Validação final antes de enviar ao portal

1. No ponto onde o bot dispara o cadastro no portal-worker (procurar `worker-portal` call ou ai-sales-agent), adicionar **pré-flight check**:
  - Se `bill_holder_name` ou `doc_holder_name` vazios → não bloqueia, mas loga `name_data_incomplete` em `ai_decisions`.
  - Se `name_mismatch_flag && !acknowledged` → **abortar** o envio, jogar o lead em `confirmar_titularidade` e disparar `bot_handoff_alerts` para o consultor.

### E. Telemetria

- Inserir em `ai_decisions` (ou nova `ocr_name_audit`): `consultant_id, customer_id, bill_name, doc_name, similarity, decision (auto_match|user_confirmed|relationship|edit)`.
- Painel super-admin: contagem de mismatches por consultor para identificar OCR ruim.

---

## Arquivos a tocar

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — `safeAssignName`, handler do OCR conta (1808), handler do OCR doc (2047/2143/2221), inserir passo `confirmar_titularidade` antes da finalização.
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` — guarda em `extractCaptures` callsite (~602).
- `supabase/functions/_shared/captureExtractors.ts` — `checkHolderMatch` + `_levSim` movido para shared.
- `supabase/functions/_shared/ocr.ts` — sem mudança (continua retornando `nome`).
- Migration nova: colunas `bill_holder_name`, `doc_holder_name`, `name_mismatch_flag`, `name_mismatch_reason`, `name_mismatch_acknowledged_at`, `bill_owner_relationship` em `customers`.

## Regras invioláveis (resumo)

```text
1. name_source ∈ {ocr_conta, ocr_doc, user_confirmed} ⇒ nome NUNCA é
   sobrescrito por captura de texto livre. Só editing_* explícito troca.
2. OCR sempre grava bill_holder_name / doc_holder_name brutos,
   independente de quem ganha o customers.name.
3. Mismatch conta×RG NÃO interrompe o fluxo — apenas marca a flag
   e avisa o cliente em linguagem natural na próxima resposta.
4. Finalização só dispara com name_mismatch_flag=false OU
   name_mismatch_acknowledged_at preenchido.
```

## Validação pós-deploy

- Cliente A: conta e RG no mesmo nome → sem aviso, finaliza normal.
- Cliente B: conta em nome do pai, RG do filho → aviso aparece após o RG, fluxo continua, na finalização aparece o passo "é a mesma pessoa?" com 3 opções.
- Cliente C: já tem `name_source='ocr_conta'` e manda "meu nome é Lucas" no meio da conversa → `customers.name` **não muda**, bot pode responder "Anotado! Mas pra finalizar preciso usar o nome da conta de luz, ok?".

Pode seguir e implementar