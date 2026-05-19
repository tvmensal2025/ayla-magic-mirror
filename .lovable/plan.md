# Plano: dropdown "Devolver para…" 100% baseado no fluxo do consultor

## O que muda

O dropdown deve mostrar **só** os passos do fluxo do consultor, respeitando a variante (A/B/C) em que o lead está. Sem "Passos clássicos". Sem fallback para passos legados.

Os 10 passos esperados (já existem hoje nos fluxos A e B do consultor Erasmo) são:

1. Nome do cliente
2. Boas Vindas
3. Qual o valor da conta de luz
4. Valor da conta
5. Perguntando se pode explicar
6. Deu para entender?
7. Como funciona
8. Conta de energia
9. Cadastro
10. Confirmação

Se variante C ainda não existir para aquele consultor, o lead da variante C cai para os passos de A (mesma lógica já usada pelos dispatchers).

## Mudanças (apenas frontend)

`src/components/admin/AIAgentTab/LiveConversationsPanel.tsx`:

1. **Query de customers**: incluir `flow_variant`.
2. **Estado**: trocar `flowSteps` por `flowStepsByVariant: { A: FlowStep[]; B: FlowStep[]; C: FlowStep[] }` + `flowNameByVariant`.
3. **loadFlowSteps**: buscar **todos** os `bot_flows` ativos do consultor (variantes A, B, C) e os respectivos `bot_flow_steps` ordenados por `position`. Indexar por variante.
4. **renderReturnMenu**:
   - Determinar `variant = row.flow_variant ?? 'A'`.
   - `stepsForLead = flowStepsByVariant[variant] || flowStepsByVariant.A`.
   - Chip no topo: `Variante {variant} · {flowNameByVariant[variant]}`.
   - Listar `stepsForLead` numerados 1..N, com title (fallback: step_key/`Passo N`).
   - **Remover** completamente a seção `LEGACY_STEPS` e a constante.
   - Manter "Continuar de onde parou" e "Reiniciar conversa do zero".
5. **returnToStep**: já usa `stepId` (UUID) → continua disparando `manual-step-send` com o passo correto da variante. Sem mudanças.

## Fora do escopo

- Não mexer em `bot-flow.ts` nem em `manual-step-send` (já operam por UUID).
- Não alterar leads existentes.
- Não tocar no fluxo A/B/C dos dispatchers.

## Validação

1. Lead variante A do Erasmo → dropdown lista os 10 passos do fluxo A.
2. Lead variante B → lista os 10 passos do fluxo B.
3. Lead variante C sem fluxo C → cai para os passos do A (mesmo comportamento do bot).
4. Não aparece mais a seção "Passos clássicos".
5. Chip "Variante X · {nome do fluxo}" visível no topo do dropdown.
