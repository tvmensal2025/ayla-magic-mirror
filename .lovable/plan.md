# Por que tanto erro no fluxo do bot

## TL;DR

Sim, **existem 3 motores rodando em paralelo** + um roteador que tenta decidir entre eles a cada turno. Isso é a causa raiz do "inventa", "duplica", "fora de ordem". **Não dá pra simplesmente apagar** porque 13 de 13 consultores ainda dependem de 2 desses motores. O caminho seguro é **aposentar 1 motor morto (V3) agora** e depois **fundir os outros 2 em um só** num próximo passo.

---

## 1) Os motores que existem hoje

| # | Motor | Arquivo | Linhas | Em uso? |
|---|---|---|---|---|
| A | **Legacy cadastro** (bot-flow.ts) | `whapi-webhook/handlers/bot-flow.ts` | 5.264 | Sim — todo passo de OCR/conta/doc/CPF/portal |
| B | **Conversational** (custom flow) | `whapi-webhook/handlers/conversational/index.ts` | 2.552 | Sim — `bot_flow_steps` do /admin/fluxos |
| C | **Engine V3** (reescrita) | `_shared/flow-engine/v3-*.ts` | ~2.500 | **Não. 0 consultores com `flow_engine_v3='on'`** |
| R | **Router** | `_shared/flow-router.ts` + `routeEngine` no webhook | 349 | Decide A vs B a cada mensagem |

E ainda há um **espelho quase idêntico** em `evolution-webhook/handlers/` (bot-flow.ts + conversational/index.ts duplicados — ~7.500 linhas espelhadas que sempre dessincronizam).

## 2) Por que isso causa os erros que você está vendo

1. **Router decide por turno**, não por conversa. A cada mensagem ele relê `conversation_step`, tenta inferir o motor pelo formato (`flow:`, UUID, `passo_`) e pode trocar de A↔B no meio do funil. Foi exatamente o bug do "Quero simular" virar "me manda a conta" (caiu no legacy).
2. **CADASTRO_STEPS é uma lista hardcoded de 50+ steps** que força volta pro motor A. Qualquer step novo que você criar no /admin que esbarre em cadastro precisa ser adicionado nessa lista à mão. Se esquecer → bug.
3. **Ordem de mídia (texto/áudio/vídeo/imagem) tem 3 implementações diferentes**: uma em `bot-flow.ts`, uma em `conversational/index.ts` (whapi), e outra em `conversational/index.ts` (evolution). Cada fix precisa ser feito 3x — e historicamente sempre escapou um.
4. **Webhooks duplicados** (whapi + evolution): toda regra de negócio existe 2x. Dessincroniza constantemente.
5. **V3 nunca foi ativado** mas o código continua importado (`isEngineV3Enabled`, `runEngineV3WebhookEntry`) em vários pontos, gera ruído de leitura e risco de alguém ativar por engano.
6. **Gemini/IA livre** pode sobrescrever transitions em alguns ramos do conversational — fonte clássica do "inventou resposta".

## 3) O que dá pra apagar SEM quebrar (seguro hoje)

- **Toda a pasta `_shared/flow-engine/v3-*.ts`** (v3-runner, v3-dispatcher, v3-loader, v3-types, v3-webhook-entry) → ~2.500 linhas mortas.
- **`flow-engine-v3-rollout-cron`** (edge function de promoção V3) e o `flow-engine-rollout-cron` se também só promovem V3.
- **Painel "Rollout V3" no SuperAdmin** + colunas `consultants.use_engine_v3` e `consultants.flow_engine_v3` (após confirmar via query que estão zeradas).
- **Imports condicionais de V3** em `whapi-webhook/index.ts` e `evolution-webhook/index.ts` (linhas 952, 1270, 1466).

Impacto: **zero em runtime** (ninguém usa). Tira ~3.000 linhas de confusão e elimina o caminho "alguém ativa V3 sem querer".

## 4) O que NÃO dá pra apagar sem migração

- **`bot-flow.ts` (motor A)**: contém todo o pipeline OCR → confirma conta → doc → CPF → portal → OTP → facial. Apagar = perder cadastro. Caminho correto: **portar esses passos pro motor B como steps custom** (já existe `ask_quero_cadastrar`, `aguardando_conta` etc. parcialmente) e só então remover.
- **`conversational/index.ts` (motor B)**: é o que roda os fluxos do /admin/fluxos. Esse é o que **deveria ficar como único motor** no futuro.
- **Espelho `evolution-webhook/`**: enquanto Evolution API existir como canal alternativo, precisa ficar. Mas pode virar um arquivo fino que importa de `_shared/` (eliminar duplicação real).

## 5) Plano em 3 fases (recomendado)

**Fase 1 — limpar morto (esta semana, baixo risco):**
- Deletar `flow-engine/v3-*.ts`, crons V3, painel Rollout V3, colunas de flag V3.
- Remover imports condicionais V3 dos dois webhooks.
- Resultado: -3.000 linhas, 0 mudança de comportamento.

**Fase 2 — unificar webhooks (médio risco):**
- Extrair `conversational/index.ts` e `bot-flow.ts` pra `_shared/` (uma cópia só).
- `whapi-webhook` e `evolution-webhook` viram entrypoints finos (parse payload → chama shared).
- Resultado: fixes valem pros 2 canais ao mesmo tempo.

**Fase 3 — fundir A em B (maior risco, faseado por consultor):**
- Recriar os steps de cadastro (OCR, doc, CPF, portal) como `bot_flow_steps` reais ou como "step types" especiais dentro do motor B.
- Remover `CADASTRO_STEPS` + `routeEngine`. Motor único, determinístico, sem troca.
- Migrar 1 consultor por vez, com kill-switch de rollback.

## 6) Resposta direta às suas perguntas

- **"Tem muitos motores antigos?"** → 3 motores + 2 espelhos. Sim, demais.
- **"Duplicação?"** → ~7.500 linhas duplicadas entre whapi e evolution. Sim.
- **"Confusão?"** → o router troca de motor a cada turno, daí "inventa". Sim.
- **"Seria melhor apagar?"** → V3 sim (hoje). Os outros 2, só depois de migrar.
- **"Não iria quebrar?"** → Fase 1 não quebra nada (V3 está em 0 consultores). Fase 2/3 quebram se feitos de uma vez — precisa ser faseado.

## Próximo passo sugerido

Aprovar **Fase 1** (apagar V3 morto). Em 1 sessão eu removo os arquivos, os imports, os crons e as colunas, e você reduz a superfície de bug em ~30% sem qualquer impacto pro cliente final.
