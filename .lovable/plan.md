## Diagnóstico

Os logs do `whapi-webhook` durante o teste mostram que o simulador travou por **dois bugs de schema do banco**, não por lógica de fluxo:

### Bug 1 — Coluna `document_uploaded` inexistente
```
[customer-flow-state] loadFlowState erro: 
column customers_1.document_uploaded does not exist
```
Acontece em **toda** mensagem. O loader de estado quebra silenciosamente e o motor segue sem saber o que o lead já fez → repete passos, escolhe rota errada.

### Bug 2 — `ai_decisions.suppressed` NOT NULL sem default
```
[ai-decisions] insert failed: null value in column "suppressed" 
of relation "ai_decisions" violates not-null constraint
```
Toda decisão da IA falha ao gravar → perda de telemetria + possível retry em loop.

### Sintoma observado
Depois de clicar "📸 Quero simular", o bot disparou `d_como_funciona` em vez de `d_pedir_conta`. Isso confirma que o estado do lead foi carregado errado por causa do Bug 1.

---

## Plano

### 1. Migration: corrigir schema

- Adicionar coluna `customers.document_uploaded boolean default false` (ou ajustar o código de `customer-flow-state` para deixar de ler essa coluna — vou checar qual é mais seguro antes de escrever a SQL).
- Alterar `ai_decisions.suppressed` para ter `default false` (e backfill dos nulls existentes se houver).

### 2. Validar no simulador

Após a migration:
- Zerar o sandbox.
- Mandar "oi" → conferir que entra em `d_welcome`.
- Clicar "Quero simular" → conferir que vai para `d_pedir_conta` (e não `d_como_funciona`).
- Mandar a foto da conta → conferir OCR + avanço para `d_resultado`.
- Conferir nos logs que **não aparecem mais** os dois erros acima.

### 3. E2E automático (Deno test do `whapi-webhook`)

Criar `supabase/functions/whapi-webhook/e2e_test.ts` cobrindo a variante D:

1. Reset do sandbox
2. "oi" → espera welcome + botões
3. Botão `simular` → espera `d_pedir_conta`
4. Foto da conta → espera `d_resultado` com valor
5. Botão "cadastrar" → espera `d_pedir_documento`
6. Foto do documento → espera `d_finalizar`
7. Validação de campos obrigatórios
8. OTP mock → validação
9. Facial mock → finalização
10. Lead em `cadastro_em_analise`

Cada passo falha o teste se: repetir mensagem, pular etapa, ou se logs mostrarem erro de schema/null.

Executável via `supabase--test_edge_functions` para regressão futura.

---

## Critério de sucesso

- Sem nenhuma ocorrência de `document_uploaded does not exist` nos logs.
- Sem nenhuma ocorrência de `ai_decisions ... suppressed`.
- Fluxo D no simulador vai de "oi" até `cadastro_em_analise` sem repetir nenhum passo.
- Teste E2E passando.

---

## Detalhe técnico (para referência)

Arquivos envolvidos:
- `supabase/functions/whapi-webhook/handlers/customer-flow-state.ts` (origem do erro 1)
- `supabase/functions/whapi-webhook/handlers/ai-decisions.ts` (origem do erro 2)
- Migration nova em `supabase/migrations/`
- Teste novo em `supabase/functions/whapi-webhook/e2e_test.ts`
