# Fix: passos do fluxo não aparecem na primeira abertura do FlowQuickBar

## Causa raiz
Em `src/components/whatsapp/FlowQuickBar.tsx` o estado `byVariant` (mapa variant → flowId) vive em um `useRef`. Existem dois efeitos:

- Efeito 1 (`[open, consultantId, customerId]`): faz `await` no Supabase, preenche `byVariantRef.current` e chama `setVariant(selected)`.
- Efeito 2 (`[open, consultantId, variant]`): lê `byVariantRef.current` para carregar `bot_flow_steps`.

Na primeira abertura, os dois efeitos disparam no mesmo render. O Efeito 2 executa antes do `await` do Efeito 1 resolver → `byVariantRef.current` está vazio → `setSteps([])` e o popover mostra "Nenhum passo configurado". Quando o Efeito 1 termina e chama `setVariant("A")`, como o valor já era `"A"`, o Efeito 2 não re-dispara. Só ao trocar para B/C e voltar para A é que o Efeito 2 acha o flowId e carrega os passos.

## Correção
Trocar o `useRef` por estado React para o mapa de variantes, fazendo o Efeito 2 reagir quando o mapa for preenchido.

1. Substituir `byVariantRef` por `const [byVariant, setByVariant] = useState<Map<...>>(new Map())`.
2. No Efeito 1, em vez de `byVariantRef.current = byVariant`, chamar `setByVariant(byVariant)`.
3. Adicionar `byVariant` na dependência do Efeito 2 e ler do estado em vez do ref.
4. Manter a lógica restante (variante default vinda de `customers.flow_variant`, fallback para primeira disponível, limpeza de previews ao trocar variant).

Resultado: na primeira abertura, assim que o fetch dos fluxos terminar, o Efeito 2 re-dispara com o mapa preenchido e carrega os passos da variante A — sem precisar trocar de aba.

## Arquivos
- `src/components/whatsapp/FlowQuickBar.tsx` — única mudança.

Sem alterações de comportamento em backend, banco ou no envio manual (`manual-step-send`).
