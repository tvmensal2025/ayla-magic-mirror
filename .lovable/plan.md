## Princípio: aditivo e reversível

Não vamos tocar no que já funciona (state machine, templates, OCR, cadastro, FAQ atual). Vamos só **adicionar duas guardas pequenas**, cada uma protegida por uma flag, para que se algo der errado a gente desligue sem deploy.

Cobre exatamente os dois cenários que você levantou:
1. Cliente fala o nome (ou outro dado) antes da hora.
2. Cliente faz pergunta no meio do cadastro.

---

## O que vai ser feito

### Mudança 1 — Não pedir de novo o que já temos (`shouldSkipAsk`)

**Onde:** `_shared/conversation-helpers.ts` (novo helper) e os steps `ask_*` em `bot-flow.ts` (whapi + evolution).

**O que faz:** antes de cada pergunta `ask_name / ask_cpf / ask_email / ask_phone_confirm / ask_cep / ask_bill_value / ask_birth_date / ask_rg`, chama:

```ts
if (shouldSkipAsk(field, customer)) {
  const next = getNextMissingStep(customer);   // já existe
  return dispatchStep(next);                   // pula adiante
}
```

`shouldSkipAsk` retorna `true` quando:
- `customer[field]` está preenchido e válido (reaproveita os validadores que já temos: `validarCPFDigitos`, `validarDataNascimento`, etc.), **e**
- `name_source`/origem do dado é confiável (`ocr_conta`, `ocr_doc`, `user_confirmed`, `self_introduced`, `manual`).

Não inventa nada novo — só evita repergunta.

### Mudança 2 — Captura de nome também no welcome (sem mexer no resto)

**Onde:** `conversational/index.ts`, único ponto, dentro do bloco `extractCaptures` que já existe (~linha 651).

**Hoje:** o extractor de nome só grava se o step atual tiver `capture: name` configurado OU se `!customer.name`.

**Mudança mínima:** quando `currentStep.step_key === "welcome"` e `!customer.name`, permitir gravar `name = extracted.name` + `name_source = "self_introduced"`. Mantém todas as travas existentes (`TRUSTED_LOCK` para OCR continua intacto).

Resultado: "Oi, sou João" no welcome → nome salvo → quando chegar em `ask_name`, a Mudança 1 pula.

### Mudança 3 — Dúvida no meio do cadastro (detour leve, sem RAG novo)

**Onde:** topo do `bot-flow.ts` (whapi + evolution), antes do `switch` que decide o que fazer com a mensagem.

**O que faz:** se o lead está em algum step `aguardando_*` / `ask_*` e a mensagem é uma pergunta (heurística: tem `?`, ou casa regex curta tipo `/(quanto|como|seguro|golpe|funciona|fatura|conta|garant)/i`), faz:

1. Chama o `matchQA` **que já existe** no `conversational/index.ts` (vamos exportá-lo). Reutiliza a FAQ que o consultor já cadastrou.
2. Se encontrou FAQ → envia resposta da FAQ + uma frase fixa de gancho do step atual ("✅ Voltando — me envia agora a foto da conta de luz 📸"). Não muda `conversation_step`.
3. Se NÃO encontrou FAQ → comportamento atual (responde como sempre fez). Nada quebra.
4. Conta dúvidas seguidas no mesmo step em `customer.detour_count` (coluna nova, default 0). Ao receber qualquer dado válido, zera. Se chegar a 3 sem resolver → marca `bot_paused = true` com motivo "muitas dúvidas" (handoff que já existe).

Tudo protegido por `customer.tenant_settings.midflow_qa_enabled` (default `true`, mas pode desligar instantaneamente por consultor se der ruim).

---

## Como vai ser feito (passos)

1. **Migração mínima** (`supabase/migrations/...`):
   ```sql
   alter table customers add column if not exists detour_count int default 0;
   ```
   Só isso. Sem RLS nova, sem tabela nova.

2. **`_shared/conversation-helpers.ts`**: adicionar `shouldSkipAsk(field, customer)` (≈30 linhas). Não altera funções existentes.

3. **`conversational/index.ts`**:
   - Exportar `matchQA` (já existe, só não está exportado).
   - Adicionar 4 linhas no bloco capture para permitir nome no `welcome`.

4. **`whapi-webhook/handlers/bot-flow.ts`**:
   - Importar `shouldSkipAsk` e `matchQA`.
   - Função helper local `tryMidFlowQA(ctx)` (≈40 linhas) chamada no início do tratamento de mensagem de texto durante steps de cadastro.
   - Em cada `case "ask_*"`, prefixar com `if (shouldSkipAsk(...)) return goNext();`. São ~8 casos, edição de 2 linhas cada.

5. **`evolution-webhook/handlers/bot-flow.ts`**: mesma mudança, paridade.

6. **Feature flag**: ler `process.env.MIDFLOW_QA_ENABLED` (ou coluna na tabela de tenants se preferir) — se `false`, `tryMidFlowQA` retorna `null` e o bot age como hoje.

7. **Deploy faseado**:
   - Deploy só do whapi-webhook primeiro.
   - Testar com 1 número (o seu) por 24h.
   - Depois deploy do evolution-webhook.
   - Se algo estranho: setar `MIDFLOW_QA_ENABLED=false` e voltamos ao comportamento atual sem rollback de código.

---

## Como garantimos que não vai quebrar

- **Zero mudança em state machine, OCR, templates, fluxo de envio de mídia, RLS, schemas de mensagens.** Tudo continua igual.
- **Toda mudança é "adicionar antes de", não "trocar".** Se o helper novo falhar (try/catch), cai no caminho atual.
- **Feature flag de kill switch** sem precisar redeploy.
- **Testes Deno** novos para `shouldSkipAsk` e `tryMidFlowQA` rodam antes do deploy.
- **Logs**: cada decisão nova loga `[skip-ask] field=...` e `[midflow-qa] hit=true/false` — fácil de auditar.

---

## Resultado esperado

| Situação | Hoje | Depois |
|---|---|---|
| "Oi, sou João" no welcome | Salva nome mas depois pergunta de novo | Salva nome e **pula** `ask_name` |
| "Sou João" depois do OCR já ter pego "MARIA" | OCR vence (TRUSTED_LOCK) | Igual (não muda) |
| "Quanto custa?" durante `aguardando_conta`, com FAQ cadastrada | Bot ignora a pergunta e repete pedido da conta | Responde a FAQ + repete pedido na mesma mensagem |
| "Quanto custa?" sem FAQ cadastrada | Bot ignora | **Igual ao hoje** (não inventa) |
| Cliente faz 3 perguntas seguidas sem resolver | Loop sem fim | Pausa bot e marca para humano |
| Qualquer outro fluxo (vídeo, club, OCR, cadastro) | Igual | **Igual, sem diferença** |

---

## O que NÃO vai mudar

- State machine conversational (`state-machine.ts`)
- Lógica de OCR de conta/documento
- Templates do consultor / builder de fluxo
- Envio de mídia (áudio/vídeo/imagem) e ordem
- RLS, schemas, autenticação
- Captura de telefone, CPF, valor (continua só onde já configurado)

---

## Critério de sucesso

1. Os 6 cenários da tabela acima passam manualmente no seu número.
2. Nenhum lead atualmente em cadastro recebe mensagem diferente do que receberia hoje (verificado por log comparativo de 24h).
3. Conseguimos desligar tudo com 1 env var sem deploy.

Se você aprovar, eu sigo nessa ordem: migração → helper → exportar matchQA → edits no bot-flow do whapi → testes → deploy whapi → 24h observando → evolution.
