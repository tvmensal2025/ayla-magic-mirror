
# Refactor do Bot — Máquina de Estado (sem afetar cadastro)

## Princípio

Hoje `bot-flow.ts` (2.408 linhas) mistura tudo em um único `switch`. A parte de **cadastro** (do `aguardando_conta` até `complete` — OCR, docs, ask_*, portal) **já é determinística e funciona**. Os bugs estão na **fase conversacional pré-cadastro**, onde a IA decide passos e escreve regras.

**Regra de ouro deste plano:** não tocar em nenhum `case` de cadastro. Só refatorar a camada conversacional.

## Escopo

### ✅ Refatorado (fase conversacional)
- `welcome`, `menu_inicial`, `qualificacao`, `pos_video`, `checkin_pos_video`, `pitch_conexao_club`, `duvidas_pos_club`, `aguardando_humano`

### 🔒 Intocado (cadastro — já estável)
- `aguardando_conta`, `processando_ocr_conta`, `confirmando_dados_conta`, `editing_conta_*`
- `ask_tipo_documento`, `aguardando_doc_frente/verso`, `confirmando_dados_doc`, `editing_doc_*`
- `ask_name/cpf/rg/birth_date/phone/email/cep/number/complement/installation_number/bill_value/doc_*`
- `ask_finalizar`, `portal_submitting`, `aguardando_otp`, `validando_otp`, `aguardando_facial/assinatura`, `complete`

A "ponte" entre as duas camadas é uma única transição: conversacional → `aguardando_conta`. Nada além disso muda no cadastro.

## Arquitetura nova

```text
runBotFlow(ctx)
  │
  ├─ é step de cadastro? ──► sim ──► código antigo (intocado)
  │
  └─ é step conversacional?
        │
        ├─ 1. classifyIntent(message, step)   ← LLM com json_schema
        │       retorna: { intent, entities }
        │
        ├─ 2. decideTransition(step, intent)  ← função pura, switch
        │       retorna: { nextStep, action }
        │
        ├─ 3. action handler (envia vídeo/áudio/texto)
        │
        └─ 4. logTransition(from, to, intent) ← bot_transitions
```

A IA **só classifica**. O código **só decide**. Templates **vêm do banco**.

## Arquivos novos

```text
supabase/functions/whapi-webhook/handlers/conversational/
  ├── index.ts              # entrypoint: runConversationalFlow(ctx, step)
  ├── intent-classifier.ts  # classifyIntent() — Gemini com json_schema
  ├── state-machine.ts      # decideTransition() — função pura, testável
  ├── actions.ts            # sendVideo/sendAudio/sendTemplate
  └── templates.ts          # getTemplate(step_key, variant) lendo bot_messages
```

## Contrato do classificador

```ts
type Intent =
  | "saudacao"           // "oi", "bom dia"
  | "quer_cadastrar"     // "cadastro", "bora", "quero participar"
  | "quer_humano"        // "atendente", "pessoa real"
  | "tem_duvida"         // qualquer pergunta
  | "ja_assistiu_video"  // "vi", "assisti", "terminei"
  | "nao_quer"           // "não", "depois"
  | "afirmacao"          // "sim", "ok", "1"
  | "negacao"            // "não", "2"
  | "outro";             // fallback

classifyIntent(text, currentStep) → { intent: Intent, confidence: number }
```

Sem prompt criativo, sem regras de negócio no prompt. Só JSON schema.

## Contrato da máquina de estado

```ts
// state-machine.ts — pura, sem I/O, 100% testável
function decideTransition(
  currentStep: ConversationalStep,
  intent: Intent,
  customer: Customer
): { nextStep: string; action: Action }
```

Exemplo:

```ts
case "checkin_pos_video":
  if (intent === "quer_cadastrar") return { nextStep: "aguardando_conta", action: { type: "send_template", key: "pedir_conta" } };
  if (intent === "tem_duvida")     return { nextStep: "duvidas_pos_club",  action: { type: "send_template", key: "pode_perguntar" } };
  if (intent === "afirmacao")      return { nextStep: "pitch_conexao_club", action: { type: "send_video", key: "club" } };
  return { nextStep: "checkin_pos_video", action: { type: "send_template", key: "reforco_checkin" } };
```

## Banco de dados

### Tabela `bot_messages` (templates editáveis sem deploy)

```text
step_key      text   -- "checkin_pos_video"
template_key  text   -- "reforco_checkin"
variant       text   -- "default" | "v2" (A/B opcional)
text          text   -- corpo, com {{nome}} {{representante}}
active        bool
```

### Tabela `bot_transitions` (observabilidade — já existe `bot_step_transitions`)

Adicionar coluna `intent text` e `confidence numeric` ao `bot_step_transitions` existente. Continuar usando `logStepTransition` do `_shared/audit.ts`.

## Testes

- `state-machine.test.ts`: 100% das transições conversacionais como tabela `(step, intent) → nextStep`. Roda em ~50 ms, sem LLM, sem rede.
- `intent-classifier.test.ts`: 30-50 mensagens reais rotuladas → `intent` esperado. Roda só localmente (custa tokens).

## Plano de migração (3 passos, deploys separados)

**Passo 1 — Construir em paralelo (sem ligar)**
- Criar pasta `conversational/` com os 5 arquivos.
- Criar tabela `bot_messages` + popular com os textos atuais extraídos do `bot-flow.ts`.
- Adicionar colunas `intent`/`confidence` em `bot_step_transitions`.
- Escrever testes da state machine.
- ✅ Cadastro segue 100% no código antigo.

**Passo 2 — Ligar atrás de feature flag**
- Em `runBotFlow`, no topo: `if (CONVERSATIONAL_STEPS.has(step) && FLAG_NEW_FLOW) return runConversationalFlow(ctx, step)`.
- Flag por consultor (coluna `consultants.use_new_bot_flow bool default false`).
- Testar com 1 consultor de teste. Comparar `bot_step_transitions` antes/depois.
- ✅ Cadastro intocado.

**Passo 3 — Remover código antigo**
- Quando flag estiver verde para todos, deletar os `case`s conversacionais do `bot-flow.ts` (linhas 1032–1493 aprox).
- `bot-flow.ts` cai de 2.408 → ~1.500 linhas, todas de cadastro.

## O que isso resolve

| Bug atual | Causa | Solução |
|---|---|---|
| "Cadastro" não responde | IA decidiu não responder | classifier → `quer_cadastrar` → state machine força `aguardando_conta` |
| Vídeo do Club sem follow-up | lógica solta no meio do `switch` | action `send_video` tem `onComplete: nextStep` declarado |
| Mensagens duplicadas/contraditórias | dois caminhos enviam texto | só `actions.ts` envia, e só uma vez por turno |
| Difícil mudar texto | hardcoded em 2.400 linhas | edita linha em `bot_messages`, sem deploy |
| Não sabe onde quebrou | sem log estruturado | toda transição grava `(from, to, intent, confidence)` |

## Estimativa

- Passo 1: ~4 h (criar arquivos + tabela + testes)
- Passo 2: ~1 h (flag + 1 consultor de teste)
- Passo 3: ~30 min (deletar código morto)

## Riscos

- **Classificador erra intent** → mitigado: fallback `outro` reusa o template do step atual (não quebra, só repete).
- **Template faltando no banco** → mitigado: `getTemplate` retorna fallback hardcoded mínimo.
- **Cadastro afetado por engano** → mitigado: passo 1 não pluga nada, passo 2 tem flag, passo 3 só remove código já substituído.

---

Posso seguir para o **Passo 1** (criar estrutura + tabela + testes, sem ativar nada)?
