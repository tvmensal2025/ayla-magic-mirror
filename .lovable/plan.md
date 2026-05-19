## Objetivo

Adicionar **Fluxo C** ao teste A/B existente, transformando em **A/B/C** com distribuição round-robin (1=A, 2=B, 3=C, 4=A…). Fluxo C é uma cópia independente de A onde o consultor poderá colocar um **vídeo no início** (e qualquer outro ajuste). Admin (`/admin/fluxos`) ganha aba/seletor para editar A, B e C.

## Mudanças no banco

1. `assign_flow_variant(_consultant_id)` — alterar `CASE` para 3 valores:
   ```
   v_new_counter % 3 = 1 → 'A'
   v_new_counter % 3 = 2 → 'B'
   v_new_counter % 3 = 0 → 'C'
   ```
2. Nova função `clone_bot_flow_as_c(_consultant_id)` — idêntica a `clone_bot_flow_as_b`, mas insere `variant='C'` (clona steps + media_order de A). Idempotente: se já existe C ativo, retorna o id atual.
3. `customers.flow_variant` continua `text` — agora aceita `'A' | 'B' | 'C'`. Nada a alterar no schema.

## Mudanças nos dispatchers (Edge Functions)

Os filtros `.eq("variant", (customer as any)?.flow_variant || "A")` já são genéricos — passam `'C'` naturalmente. Mas o tratamento especial de áudio (filtrar/transcrever) só roda quando `variant === 'B'`. Para C, basta:

| Arquivo | Ajuste |
|---|---|
| `whapi-webhook/handlers/bot-flow.ts` | Nenhum. Já lê `customer.flow_variant` e busca `bot_flows` correspondente. C é tratado como A (envia tudo configurado). |
| `evolution-webhook/handlers/bot-flow.ts` | Idem. |
| `manual-step-send/index.ts` | Idem — `variant === 'B'` segue exclusivo para transcript de áudio. |
| `_shared/audio-transcript.ts` | Sem mudança. |

O "vídeo no início" do C não exige código novo: o consultor adiciona um step com mídia tipo `video` na posição 1 do fluxo C pelo próprio admin.

## Mudanças no Admin (`src/pages/FluxoCamila.tsx`)

1. State: trocar `editingVariant: "A" | "B"` por `"A" | "B" | "C"`.
2. `reload()` — passar a contar e buscar também `variant="C"`. `variantCounts` vira `{ A, B, C }`.
3. Seletor de edição: trocar Tabs/botões A/B por A/B/C (3 abas).
4. Botão **"Clonar A → C"** (espelha o atual "Clonar A → B"), chamando RPC `clone_bot_flow_as_c`.
5. Label do switch: "Teste A/B/C (A: original · B: só texto · C: com vídeo inicial)".
6. Toast: "Teste A/B/C ligado — novos leads alternam A/B/C".
7. Badges: `A: x | B: y | C: z`.
8. `StepMediaPanel` recebe `variant="C"` — mesma UI de A (sem editor de transcript que é exclusivo de B).

## Observabilidade

Logs já incluem `variant` quando relevante. Sem mudanças adicionais.

## Arquivos alterados

- **Migration nova** (banco): atualiza `assign_flow_variant` + cria `clone_bot_flow_as_c`.
- `src/pages/FluxoCamila.tsx` — UI A/B/C.
- Memória `mem/features/ab-test-audio-vs-text.md` — atualizar para A/B/C.

Sem alterações nas Edge Functions.

## Pergunta antes de implementar

Quer que o **Fluxo C seja criado vazio** (você monta do zero com o vídeo) ou **clonado de A** (já vem com todos os steps de A, você só adiciona o vídeo no início)? Recomendo clonar de A — é mais rápido e segue o padrão do B.
