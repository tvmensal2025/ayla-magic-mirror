# Bot sempre 100% no fluxo do admin

## Problema

Hoje, no `whapi-webhook/handlers/bot-flow.ts`, o resolver de passos customizados (linha 2005) só roda quando o `conversation_step` do cliente **não** está na lista `LEGACY_STEPS` (welcome, qualificacao, pitch_conexao_club, duvidas_pos_club, ask_*, editing_*, etc.). Quando o step é legacy, a execução cai num `switch` hardcoded (linha 2268+) com textos fixos — ignorando completamente o fluxo que o consultor montou no `/admin/fluxos`.

Resultado: leads novos (que começam em `"welcome"`) e leads que voltaram pra qualquer step legacy via "Devolver para…" rodam o roteiro antigo da Camila/sistema, e não o fluxo do Erasmo, da Camila, etc.

## Objetivo

Quando o consultor tem um `bot_flow` ativo, **toda** decisão de próximo passo deve vir desse fluxo. O switch legacy fica como fallback **só** para consultores que não têm fluxo ativo.

## Mudanças

### 1. Entrada de novos leads — começar no Passo 1 do fluxo, não em `welcome`

Em `bot-flow.ts` linha 1265 (`let step = customer.conversation_step || "welcome"`):
- Se `conversation_step` está vazio E o consultor tem fluxo ativo, buscar o primeiro `bot_flow_steps` ativo (menor `position`) e usar o `id`/`step_key` dele como `step` inicial.
- Mesma mudança aplicada onde quer que um novo customer seja inserido com `conversation_step: 'welcome'` — varrer para garantir consistência.

### 2. Mapeamento legacy → custom antes do switch

Logo antes do bloco em linha 2007, adicionar um passo: se o consultor tem fluxo ativo E o `step` atual é legacy, tentar mapear pra um passo do fluxo custom:

- `welcome`, `menu_inicial`, `qualificacao`, `pos_video`, `pitch_conexao_club`, `duvidas_pos_club` → primeiro passo `message` do fluxo (por position) ou um passo com `step_key` igual.
- `ask_bill_value` → primeiro passo com `captures` de `electricity_bill_value`.
- `aguardando_conta` / `aguardando_doc_auto` / `ask_email` / `ask_phone_confirm` / `finalizando` → continuam mapeando para o `step_type` correspondente (capture_conta, capture_documento, capture_email, confirm_phone, finalizar_cadastro) **buscando o passo do fluxo custom** com aquele type, em vez de cair no handler legacy.

Se um mapeamento é encontrado, sobrescreve `step` com o `id` do passo custom e segue pelo resolver normal (linha 2007). Se não há match, mantém legacy como fallback final.

### 3. Lock global: fluxo ativo bloqueia switch legacy

No início do `switch (step)` legacy (linha 2268), se o consultor tem fluxo ativo E o `step` ainda é legacy (não conseguiu mapear), logar um warning e **redirecionar** para o primeiro passo do fluxo via `dispatchStepFromFlow`, em vez de executar o case hardcoded. Garante "nunca mais cair no roteiro antigo" mesmo se aparecer um step legacy novo no futuro.

Exceções que **continuam** rodando o legacy (precisam de lógica do sistema, não conteúdo de mensagem):
- `processando_ocr_conta`, `confirmando_dados_conta`, `editing_conta_*`, `editing_doc_*` (telas de edição), `confirmar_titularidade`, `validacao_facial`, `cadastro_em_analise`, `aguardando_facial`, `otp_falhou`, `aguardando_humano`, `complete`, `valor_baixo`.

Esses são "estados de máquina" do cadastro, não conteúdo conversacional, então ficam.

### 4. UI — refletir a mudança na tela "Devolver para…"

Em `src/components/admin/AIAgentTab/LiveConversationsPanel.tsx`:
- Remover do `LEGACY_STEPS` os 5 itens conversacionais (`welcome`, `qualificacao`, `checkin_pos_video`, `pitch_conexao_club`, `duvidas_pos_club`) — agora esses passos **vivem no fluxo do consultor** e já aparecem na seção "Pular para passo do fluxo".
- Manter apenas os passos de cadastro/estado (`aguardando_valor_conta`, `aguardando_conta`, `aguardando_doc_auto`, `confirmando_dados_conta`, `ask_email`, `ask_phone_confirm`, `finalizando`) que não têm equivalente no fluxo do admin.

### 5. Migration (opcional, segurança)

Atualizar customers existentes que estão "presos" em steps legacy conversacionais com fluxo ativo:
- `UPDATE customers SET conversation_step = NULL WHERE conversation_step IN ('welcome','qualificacao','pitch_conexao_club','duvidas_pos_club','pos_video') AND consultant_id IN (SELECT consultant_id FROM bot_flows WHERE is_active = true);`

Na próxima mensagem deles, o item 1 leva pro Passo 1 do fluxo custom.

## Fora do escopo

- Reescrever o `switch` legacy (continua existindo pra consultores sem fluxo).
- Mudar A/B/C variant logic — segue como está.
- Mudar Plano B (`branch_intent`/`branch_keywords`/IA) dos passos do fluxo custom — usuário não pediu, e Plano B já é configurável passo-a-passo.

## Validação

1. Lead novo do Erasmo manda "oi" → recebe Passo 1 do fluxo do Erasmo (não o "👋 Olá!" da Camila).
2. Lead existente da Camila com `conversation_step='welcome'` manda mensagem → recebe Passo 1 do fluxo da Camila.
3. Logs `[custom-step-resolver]` aparecem em vez do switch legacy.
4. Cadastro (foto da conta, OCR, doc, e-mail) continua funcionando — esses estados não foram tocados.
