# Bug: clicar em A reverte para B automaticamente

## Causa raiz

Em `FlowQuickBar.tsx` (linha 60-105) e `ManualStepDialog.tsx` (linha 47-89), o `useEffect` que carrega as variantes tem `variant` no array de dependências **e** chama `setVariant(selected)` dentro dele, onde `selected = byVariant.has(custVariant) ? custVariant : available[0]`.

Fluxo do bug:
1. Usuário clica em **A** → `setVariant("A")`
2. Effect re-roda porque `variant` mudou
3. Dentro do effect, lê `customer.flow_variant = "B"` e força `setVariant("B")`
4. UI pisca em A e volta pra B

A variante do cliente deveria ser só **default inicial**, não um valor que sobrescreve a escolha manual.

## Correção

Separar em dois efeitos nos dois arquivos:

**Efeito 1 — inicialização (deps: `open`, `consultantId`, `customerId`):**
- Carrega `bot_flows` ativos, monta `byVariant`, popula `variantsAvailable`.
- Define `variant` inicial = `customer.flow_variant` se existir nas disponíveis, senão `available[0]`.
- Carrega `bot_flow_steps` dessa variante.

**Efeito 2 — troca manual de variante (deps: `variant`, `consultantId`):**
- Só recarrega `bot_flow_steps` do `flow_id` correspondente à `variant` escolhida.
- **Não** chama `setVariant` e **não** lê `customer.flow_variant`.
- Usa um `ref` (ex.: `byVariantRef`) populado pelo Efeito 1 para evitar refazer query em `bot_flows`.

Em `FlowQuickBar.tsx` também resetar `previewStep`, `previewParts`, `oneByOneStepId` quando a variante muda, pra não exibir passo de outra variante.

## Arquivos alterados

- `src/components/whatsapp/FlowQuickBar.tsx`
- `src/components/admin/AIAgentTab/ManualStepDialog.tsx`

## Fora de escopo

- Lógica de envio (`manual-step-send`) — já recebe a variante correta no payload.
- Round-robin A/B/C na criação do lead.
- Não muda `customers.flow_variant` quando o consultor escolhe outra variante no chip (envio pontual não vira a variante padrão do lead).
