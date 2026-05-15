## Status atual

Os 20 testes unitários de namespace **foram rodados e passaram** (`step-namespace_test.ts`, 20/20 ok). E o lint no DB real mostrou:

- 7236 customers `NULL` (nunca interagiram)
- 5 customers em nomes canônicos crus (`welcome`, `complete`, `menu_inicial`) — **correto** pela nova estratégia
- 1 customer com `flow:` prefixado (PAULO) — **correto**
- **0 UUIDs bare legacy** (a migration anterior limpou tudo)

A "bagunça" que você está vendo é o **linter da DB desatualizado**: a função `lint_bot_flow_consistency()` ainda marca nomes canônicos crus como `missing_prefix` (severidade `high`), mas pela nova estratégia isso é o esperado. Vou consertar isso junto da página.

## O que vou construir

### 1. Edge function `bot-audit-runner`
Endpoint único com `?mode=fake` ou `?mode=real`:

- **`mode=fake`** — roda 20 cenários sintéticos **sem tocar o DB**:
  1. Cliente novo (null → welcome)
  2. Welcome → qualificação
  3. UUID legacy bare → flow
  4. `passo_<ts>` legacy → flow
  5. `flow:<uuid>` idempotente
  6. Conversational devolve nome canônico → volta sys
  7. Jornada completa PAULO (welcome→flow→cadastro→complete)
  8. Ping-pong flow→sys→flow
  9. Reset → null → welcome
  10. UUID maiúsculo
  11-15. Variações de cadastro (`aguardando_conta`, `editing_conta_valor`, `editing_doc_menu`, OCR retry, fallback)
  16-18. Edge cases (string vazia, hífens não-UUID, `flow:` sem id)
  19. Injeção maliciosa (`welcome; DROP TABLE`)
  20. Fluxo conversacional com 3 transições flow→flow

- **`mode=real`** — consulta o DB real (read-only):
  - Roda `lint_bot_flow_consistency()` corrigida
  - Conta `customers` por tipo de step (NULL/canônico/flow:/UUID-legacy)
  - Últimas 20 transições do `bot_step_transitions`
  - Customers com `bot_paused = true` nas últimas 24h

### 2. Migração: corrigir `lint_bot_flow_consistency()`
Substituir a regra atual (que flaga canônicos crus como erro) por:
- `unprefixed_flow_id` — UUID/`passo_<ts>` sem prefixo `flow:` (real risco)
- `orphan_flow_step` — `flow:<id>` que não existe em `bot_flow_steps`
- `possible_loop` — >5 mensagens no mesmo step em 24h

### 3. Página `/admin/bot-audit`
- Header: "Auditoria do Bot-Flow"
- 2 botões grandes lado a lado:
  - **"Testar com dados fictícios"** (verde) → chama `bot-audit-runner?mode=fake`
  - **"Testar com dados reais"** (azul) → chama `bot-audit-runner?mode=real`
- Resultado em cards: cada cenário com badge ✅/❌, nome, esperado vs obtido
- Resumo no topo: "20/20 passaram" + "0 problemas no DB"
- Detalhes expandíveis (Accordion) para cenários que falharem

### 4. Rota
Adicionar em `App.tsx`:
```tsx
<Route path="/admin/bot-audit" element={<BotAudit />} />
```
E link no menu do `/admin`.

## Arquivos

```text
NOVO  supabase/functions/bot-audit-runner/index.ts
EDIT  supabase/migrations/<ts>_fix_lint.sql      (corrige lint_bot_flow_consistency)
NOVO  src/pages/BotAudit.tsx
EDIT  src/App.tsx                                 (rota)
EDIT  src/pages/Admin.tsx                         (botão de acesso)
```

## Observações
- A edge function é `verify_jwt = false` mas valida internamente (super_admin only para `mode=real`).
- `mode=fake` é puramente determinístico; pode ser chamado sem auth.
- Não persiste nada no DB em nenhum modo.
