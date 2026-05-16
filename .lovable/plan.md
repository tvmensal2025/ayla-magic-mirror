
# Plano: Um único fluxo ativo — Fluxo da Camila (Flow Builder)

Objetivo: parar de misturar os dois engines. Daqui pra frente **todo lead** roda 100% no `bot_flow_steps` editável na tela "Fluxo da Camila". O `bot-flow.ts` legado fica desligado por bloqueio em código (não apaga, só não executa).

## 1. Bloqueio total do fluxo legado

Em `supabase/functions/whapi-webhook/handlers/bot-flow.ts`:

- Adicionar guard no topo do `runBotFlow()`:
  ```ts
  // HARD KILL: fluxo legado desativado. Só Fluxo da Camila (DB) roda.
  console.warn("[bot-flow] LEGACY DISABLED — redirect to conversational");
  return { handled: false, redirectToConversational: true };
  ```
- No `index.ts` do webhook, quando receber `redirectToConversational`, garantir reset do `conversation_step` para o primeiro step ativo do flow do consultor e invocar `runConversationalFlow`.
- Em `step-namespace.ts`, `routeEngine()` passa a retornar sempre `"flow"` (exceto quando consultor não tem nenhum flow ativo — aí responde mensagem de erro humano "estou em manutenção, já te chamo").

## 2. Garantir cobertura ponta-a-ponta no Flow Builder

Hoje `seed_default_camila_flow` cria 6 steps e para em `cadastro`. Os passos pós-conta (email, cep, número, complemento, doc, confirmar dados, finalização) estavam hardcoded no legado.

Migration nova:
- Estender `seed_default_camila_flow` para incluir os steps faltantes como `step_type=message` + `captures`:
  - `aguardando_conta` (foto/PDF → OCR)
  - `confirmando_dados_conta` (botões SIM/NÃO/EDITAR — único lugar com botão)
  - `aguardando_doc_auto` (detecção automática CNH/RG)
  - `aguardando_doc_verso` (condicional: só se RG)
  - `confirmando_dados_doc` (botões SIM/NÃO/EDITAR)
  - `ask_email`, `ask_cep`, `ask_number`, `ask_complement`
  - `pitch_conexao_club`, `duvidas_pos_club`, `ask_finalizar`
  - `finalizado` (dispara portal-worker)
- Rodar `seed` em todos consultores ativos (`UPDATE` idempotente: só adiciona steps que não existem).

## 3. Reset de todos os leads em andamento

Migration:
```sql
SELECT public.reset_lead_conversation(c.consultant_id, c.id, null)
FROM customers c
WHERE c.status NOT IN ('active','approved','cancelled')
  AND c.conversation_step IS NOT NULL;
```
Todos voltam pro `welcome` do Fluxo da Camila. Próxima mensagem do cliente entra no fluxo único.

## 4. Smoke test obrigatório antes de fechar

- Simular Viviane (5511971073983) e Paulo (5511989000650) com `bot_test_runs`:
  - welcome → qualificação → conta → OCR → confirmação → doc auto-detect → confirmação → email → cep → número → complemento → club → dúvidas → finalização.
- Validar via `bot_step_transitions` que **nenhum** step com nome cru do legado (`ask_email`, `aguardando_conta` sem prefixo `flow:`) aparece.
- Validar `lint_bot_flow_consistency()` retorna 0 linhas `high`.

## Detalhes técnicos

- Não apagamos `bot-flow.ts` (4 outras edge functions ainda importam helpers dele). Só travamos a entrada.
- `confirmando_dados_*` mantém botões nativos Whapi (única exceção ao "sem botão" pedido antes — confirmação de OCR precisa).
- `auto_detect_doc_type=true` já existe no schema de `bot_flow_steps` — usar no step `aguardando_doc_auto`.
- Migration adiciona coluna `is_doc_auto boolean default false` se necessário pra marcar o step que dispara `detectDocumentType`.

## Riscos

- Leads em `approved/active` **não** são resetados (já completaram).
- Workers (`portal-worker`, `ai-followup-cron`, etc) leem `conversation_step` cru — depois do reset todos ficam com `flow:<uuid>`. Validar que esses workers ignoram steps `flow:*` (já fazem via `routeEngine`).
- Se algum consultor tiver flow customizado faltando steps, fica capenga. Migration força seed completo em todos.

## Ordem

1. Migration (estender seed + reset leads) — pedir aprovação
2. Bloqueio do `bot-flow.ts` + ajuste do `step-namespace.ts` e `index.ts`
3. Deploy `whapi-webhook`
4. Smoke test com `bot_test_runs`
5. Monitorar logs por 10min e validar com Viviane/Paulo

Posso seguir?
