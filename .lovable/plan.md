## Diagnóstico

O Fluxo D existe no banco com 8 passos, mas o editor mostra "cascata morta" porque a função `seed_flow_d` gravou todos os passos com `fallback = {mode:"repeat"}` e usou `trigger_intent='default'` para indicar a próxima etapa.

O parser do editor (`parseTransitions` / `parseFallback` em `FluxoCamila.tsx`) descarta a regra `default` e prioriza o `fallback` da coluna — resultado: passos de captura ficam sem regra, sem captura visível e sem Plano B útil. O diagnóstico flagra "O lead trava aqui".

## O que vou ajustar

**1. Reescrever `seed_flow_d` (migration) com `fallback` correto por passo:**

| # | Passo | Tipo | Fallback (Plano B) |
|---|---|---|---|
| 1 | Boas-vindas (3 botões) | message | repeat (botões guiam) |
| 2 | Pedir conta | capture_conta | goto → Resultado |
| 3 | Como funciona | message | goto → Pedir conta |
| 4 | Resultado (3 botões) | message | repeat (botões guiam) |
| 5 | Pedir documento | capture_documento | goto → Finalizar |
| 6 | Esclarecer dúvidas | message | goto → Resultado |
| 7 | Handoff humano | message | repeat (inativo, usado via goto_special) |
| 8 | Finalizar cadastro | finalizar_cadastro | repeat (terminal) |

**2. Remover as transições `default` redundantes** — quem manda agora é a coluna `fallback` (o parser já entende).

**3. Recriar automaticamente** o Fluxo D do Rafael (`0c2711ad…`) dentro da mesma migration, então ao abrir `/admin/fluxos > Fluxo D` os 8 passos aparecem com conexões válidas e zero alerta.

## Resultado esperado

- Editor exibe os 8 passos do Fluxo D com setas/regras certinhas.
- Diagnóstico "1 problema(s) detectado(s)" some para o Fluxo D.
- A conversa real segue o caminho desenhado: boas-vindas → simular → resultado → cadastrar → portal (OTP + selfie).

## Arquivos tocados

- Nova migration SQL: substitui `public.seed_flow_d` e roda `seed_flow_d('0c2711ad-4836-41e6-afba-edd94f698ae3')` no final.
- Nenhuma mudança em frontend/edge functions.