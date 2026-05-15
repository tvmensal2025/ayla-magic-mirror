## Causa raiz descoberta (não estava no plano anterior)

Confirmei consultando o banco do consultor do PAULO (`0c2711ad-...`):

```
position | step_key                                     | step_type
1        | 6226f6f3-e655-4cc9-af20-d8c28c998160         | message      ← UUID, não "welcome"
2        | 3e7fb4cd-33a7-4854-aec7-4570b04456e9         | message      ← UUID, não "qualificacao"
3        | 80188e5f-...                                 | message
4        | a71ba814-...                                 | message
6        | 559b8f1b-...                                 | message
11       | passo_mp70jl99                               | message      ← UI gera "passo_<ts>"
12       | passo_mp74oztd                               | capture_documento
13       | passo_mp74wfm5                               | capture_conta
14       | passo_mp74xnmn                               | finalizar_cadastro
```

Enquanto isso, `bot-flow.ts` (cadastro determinístico) escreve nomes canônicos: `qualificacao`, `duvidas_pos_club`, `pitch_conexao_club`, `aguardando_conta`, etc.

E `FluxoCamila.tsx:258` cria steps novos com `step_key = "passo_" + Date.now()`.

**Resultado:** quando o cadastro termina ou volta pro loop conversacional, `customer.conversation_step = "duvidas_pos_club"` é gravado, o handler conversacional carrega o flow do DB, **não acha esse step_key**, loga `unknown step → restart at firstActive` e dispara áudio do step inicial **a cada mensagem**. O usuário fica em loop infinito mesmo dizendo "pode seguir".

Isso **anula** todos os 7 itens do plano anterior — eles nem chegam a executar porque o estado está dessincronizado entre os dois motores.

---

## Os dois motores que precisam conversar

```text
┌──────────────────────────┐         ┌─────────────────────────────┐
│ runBotFlow (bot-flow.ts) │         │ runConversationalFlow       │
│ Determinístico           │ ←────→  │ DB-driven (bot_flow_steps)  │
│ Step keys hardcoded:     │         │ Step keys arbitrários:      │
│  welcome, qualificacao,  │         │  6226f6f3-..., passo_xxx    │
│  aguardando_conta,       │         │                             │
│  ask_*, editing_*,       │         │ step_type: capture_conta,   │
│  confirmando_dados_*     │         │  capture_documento,         │
│                          │         │  finalizar_cadastro          │
└──────────────────────────┘         └─────────────────────────────┘
            ▲                                      ▲
            └─────── customer.conversation_step ───┘
                     (string única, sem namespace)
```

O orchestrator (`index.ts:333-352`) usa `CADASTRO_OR_SYSTEM` para decidir qual motor rodar — mas a lista é fechada e **só reconhece os nomes canônicos**. Qualquer step_key novo vinda do FlowBuilder cai no conversational handler, que por sua vez não acha quando o nome canônico volta.

---

## Plano da auditoria (5 fases)

### Fase 1 — Mapeamento completo (read-only, ~20 min)
Levantar tudo de uma vez para evitar surpresas:

1. Listar **todos** os literais `conversation_step = "..."` em `bot-flow.ts` (já vi 50+) e classificar por categoria: `welcome|menu|cadastro|edição|sistema`.
2. Listar todos os `step.step_type → conversation_step` mapeados em `conversational/index.ts:485-491` (`stepTypeToCadastro`).
3. Auditar **toda** transição de `bot_flow_steps.transitions` no DB para ver `goto_special` e `goto_step_id`.
4. Confirmar quais consultores têm `conversational_flow_enabled=true` e qual é o estado real dos step_keys de cada um.
5. Resultado: matriz "step canônico ↔ step_key dinâmico" mostrando todos os pontos de quebra.

### Fase 2 — Contrato unificado de step_key (1 migration + bot-flow)

Decisão arquitetural: **`conversation_step` passa a ter um namespace explícito**.

```text
sys:welcome           ← motor determinístico (bot-flow.ts)
sys:qualificacao
sys:aguardando_conta
sys:editing_conta_valor
sys:confirmando_dados_doc
...
flow:6226f6f3-...     ← motor dinâmico (DB step.id, NUNCA step_key)
flow:passo_mp70jl99
```

Isso:
- Remove ambiguidade (toda string do tipo `flow:xxx` vai pro conversational handler; `sys:xxx` vai pro bot-flow).
- Permite múltiplos consultores com step_keys diferentes sem colisão.
- O `CADASTRO_OR_SYSTEM` set deixa de ser hardcoded — passa a ser "tudo que começa com `sys:`".

**Migration**:
- Backfill: `UPDATE customers SET conversation_step = 'sys:' || conversation_step WHERE conversation_step IN (<lista canônica>) AND conversation_step NOT LIKE 'sys:%' AND conversation_step NOT LIKE 'flow:%';`
- Para os customers atualmente em loop (UUIDs/`passo_xxx`): `UPDATE customers SET conversation_step = 'flow:' || conversation_step WHERE conversation_step ~ '^[0-9a-f]{8}-' OR conversation_step LIKE 'passo_%';`
- Sem mudança de schema (continua TEXT).

### Fase 3 — Refatoração coordenada de bot-flow.ts + conversational/index.ts

1. Em `bot-flow.ts` envolver toda atribuição `updates.conversation_step = "X"` numa helper `setSysStep(updates, "X")` que prefixa `sys:`.
2. Em `conversational/index.ts:603` e `:412`: salvar como `flow:${step.id}` (não step_key), porque o id é estável; step_key pode ser editado pelo usuário.
3. Quando `stepTypeToCadastro` mapear `capture_conta → aguardando_conta`, gravar `sys:aguardando_conta` para a próxima mensagem cair no bot-flow.
4. Lookup do conversational handler: `if (stepKey.startsWith("flow:")) findById(stepKey.slice(5))` — não mais por step_key.
5. Manter compatibilidade temporária (3 dias): se vier sem prefixo, deduzir e prefixar antes de processar.

### Fase 4 — Validação e telemetria
1. Função SQL nova `lint_bot_flow_consistency(consultant_id)` que retorna:
   - Steps com `step_type ∈ (capture_conta, capture_documento, finalizar_cadastro)` mas sem transições para os nomes canônicos esperados.
   - Customers em loop (mesmo `conversation_step` há >5 mensagens sem mudança).
2. Painel super-admin (`/admin/super`): alerta visual quando há mismatch.
3. Tabela `bot_step_transitions` já tem `from_step/to_step` — adicionar índice e dashboard "loops detectados".

### Fase 5 — Replay do PAULO + 2 customers reais
1. Resetar PAULO (`reset_lead_conversation`) e refazer todo o fluxo do zero.
2. Validar a sequência **completa** dos 7 itens anteriores (até 20%, safeAssignName, NO_QA_STEPS, ordem texto→áudio→vídeo, off-topic intercept, menus de edição, anti-alucinação OCR) — agora que o estado para de embaralhar, eles vão de fato rodar.
3. Caso de teste explícito: durante `sys:editing_conta_valor`, mandar "isso é seguro?" → IA responde + reentry prompt + step continua `sys:editing_conta_valor`.

---

## Arquivos tocados

- **Backend** (alterações coordenadas):
  - `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (50+ atribuições + 7 fixes do plano anterior)
  - `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (lookup por id, escrita prefixada)
  - `supabase/functions/whapi-webhook/index.ts` (CADASTRO_OR_SYSTEM vira `step.startsWith("sys:")`)
- **Migration**:
  - 1 nova migration: backfill `conversation_step` + função `lint_bot_flow_consistency`
- **Painel** (opcional, fase 4):
  - `src/components/superadmin/SystemHealthPanel.tsx` (adicionar widget de loops)

Sem mudança em `bot_flow_steps` schema, sem mexer em `FluxoCamila.tsx` (UI continua gerando `passo_xxx` livremente — agora é seguro).

---

## Por que isso "cura de verdade"

1. Acaba o `[conversational] unknown step → restart` que está fazendo o bot reiniciar e mandar áudio em loop.
2. Os 7 fixes do plano anterior **passam a executar** (hoje eles estão no código mas o handler conversacional intercepta antes).
3. Próximos consultores que customizarem o flow no FlowBuilder não quebram nada — o namespace garante isolamento.
4. Tem telemetria pra detectar regressão antes do cliente reclamar.

---

## Riscos e mitigação

- **Risco**: customers em meio de cadastro podem perder step durante o backfill.
  - **Mitigação**: a migration de backfill é idempotente e cobre todos os 30+ valores possíveis. Em caso de falha, fallback para `sys:welcome` (refaz cadastro).
- **Risco**: edge functions deployam separado da migration.
  - **Mitigação**: a fase 3 mantém **compatibilidade reversa** por 3 dias (lê com ou sem prefixo). Migration roda primeiro, deploy do código depois.

Tempo estimado total: **~2h** (Fase 1: 20min, Fase 2: 15min migration, Fase 3: 60min refactor, Fase 4: 20min telemetria, Fase 5: 15min replay).
