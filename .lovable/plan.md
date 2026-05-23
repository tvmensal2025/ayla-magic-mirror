## Objetivo

Hoje o editor `/admin/fluxos` mostra todas as variantes que existem como abas e a distribuição entre clientes é fixa. Você quer:

1. Escolher quais variantes ficam **ativas** (recebendo clientes), independente de quais existem para edição.
2. **Adicionar** novas variantes (criar fluxo C, D, E… vazio para editar).
3. Definir a **regra de rotação** entre as variantes ativas.

## Decisão da regra (a "melhor")

**Round-robin 1 cliente por variante ativa** (não 2 a 2).

Por quê:
- Já é exatamente o que a função SQL `pick_next_flow_variant` faz hoje, baseada em `consultants.active_variants` — não precisa migrar nada no backend.
- Distribui mais rápido = você vê resultado de cada variante com metade do volume vs. 2-a-2.
- Para teste A/B/C/D/E significa amostra balanceada mais cedo (importante para o `bot-health-intel`).
- 2-a-2 só faria sentido se houvesse risco de viés temporal forte (horário) — não é o caso aqui.

Exemplo com A, B e D ativas: cliente 1→A, 2→B, 3→D, 4→A, 5→B, 6→D…

## Mudanças (somente UI no `FluxoBuilder`)

Backend (`active_variants`, `pick_next_flow_variant`, `bot_flows.variant`) já existe — só plumbing no editor.

### 1. Header — bloco "Distribuição de clientes"
Substitui o atual toggle único "Fluxo ativo" por um painel compacto à direita do título:

```
Distribuição (round-robin 1 a 1)
[A ✓ ativa]  [B ✓ ativa]  [C – inativa]  [D ✓ ativa]  [E – inativa]   [+ Adicionar variante]
```

- Cada chip mostra a letra + label ("A com áudio", "B sem áudio"…) + Switch on/off.
- Toggle on/off → `UPDATE consultants SET active_variants = …` (array com as letras ligadas).
- "Adicionar variante" → cria `bot_flows` na próxima letra livre (ex.: já existem A,B,D → cria C) com nome editável e `is_active=true`, depois abre essa aba para edição.
- Chip também tem menu (⋯): "Renomear", "Duplicar de outra variante", "Excluir variante".

### 2. Abas de edição (logo abaixo)
- Mostram **todas as variantes existentes** (A, B, D, …) para edição livre.
- Letra com bolinha verde quando está em `active_variants`, cinza quando só existe para edição mas não recebe clientes.
- Aba selecionada = qual fluxo você está editando agora (já funciona; mantém).

### 3. Texto explicativo
Tooltip no header: "Clientes novos são distribuídos 1 a 1 entre as variantes ativas. Variantes inativas continuam editáveis, mas não recebem leads."

### 4. Remoção do toggle global "Fluxo ativo"
Vira redundante: ativar/desativar variantes individuais já cobre. Mantém `consultants.conversational_flow_enabled` ligado se houver pelo menos 1 variante ativa; desliga se nenhuma.

## Arquivos tocados

- `src/pages/FluxoBuilder.tsx` — novo painel de distribuição no header, lógica de toggle, criar/excluir variante, recarregar `active_variants`.
- `src/components/admin/flow-builder/VariantDistributionBar.tsx` (novo) — componente dos chips + Switch + "Adicionar".
- `src/components/admin/flow-builder/flowTypes.ts` — apenas exports usados pelo novo componente (se necessário).

Sem migrations, sem mexer em edge functions, sem mudar nada no router/whapi.

## Validações

- Não permitir desativar a **última** variante ativa (toast: "Pelo menos 1 variante precisa estar ativa, ou desligue o bot inteiro").
- Não permitir excluir variante que tem `bot_conversations` recentes — usa soft delete (`is_active=false` + remove de `active_variants`).
- Após criar nova variante, scroll/foca a aba dela e abre Templates para acelerar setup.
