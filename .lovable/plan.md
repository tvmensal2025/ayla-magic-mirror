
# Por que o fluxo não está perfeito — diagnóstico

Olhando o webhook real (cliente respondeu "trezentos reais" no passo `qualificacao` e o bot **repetiu o vídeo "Como funciona"** em vez de avançar):

1. **Captura de valor não dispara transição.**
   Hoje, em `conversational/index.ts`, quando `extractValor` retorna 300, salvamos `electricity_bill_value=300` no customer, mas a transição só olha intents do classifier (`ja_assistiu_video`) e `trigger_phrases`. Como o passo `qualificacao` semeado pela Camila só tem rota para `ja_assistiu_video`, o lead que informa o valor cai em **REPEAT** → recebe o mesmo vídeo de novo. É o sintoma que aparece no log.

2. **Rules-engine roda ANTES das capturas e ANTES das transições.**
   Se o consultor cadastrar uma regra global tipo `keywords=["valor","conta"]`, ela vai **sequestrar respostas legítimas** do lead. O motor precisa rodar só depois de tentar capturar + transição normal — só intercepta quando seria fallback.

3. **`return_behavior='stay'` sem `response_text` retorna `reply: ""`.**
   O orchestrator pode acabar enviando string vazia. Falta guard: se não há texto nem mídia, marca como já enviado para não disparar mensagem fantasma.

4. **`previous_conversation_step` nunca é restaurado.**
   Salvamos quando a regra faz `goto_step`, mas nenhum lugar volta o lead para o passo original depois da resposta. Hoje o lead fica preso no detour.

# O que muda

### Backend — `supabase/functions/whapi-webhook/handlers/conversational/index.ts`

**A. Auto-transição quando uma captura ocorre (corrige o sintoma real do log).**
Depois da fase de captures, antes de chamar `matchTransition`:
- Se `captureUpdates.electricity_bill_value` foi setado → injeta intent virtual `informou_valor` e `valor_brl` no `candidateIntents`.
- Se `captureUpdates.name` → injeta `informou_nome`.
- Se `captureUpdates.phone_whatsapp` → injeta `informou_telefone`.
- Se nenhuma transição do passo casar com esses intents virtuais E `currentStep.captures` indicava esse campo como esperado, fazer **auto-advance pelo `position`** para o próximo passo ativo (em vez de repetir).

Isso resolve o caso `qualificacao` → `checkin_pos_video` sem precisar reconfigurar o seed.

**B. Reordenar a rules-engine para rodar como fallback inteligente, não como primeiro filtro.**
Mover o bloco `evaluateRules` (linhas 453–554) para **depois** do `matchTransition` e **antes** do fallback `fb`. Ordem nova:
1. Capturas
2. Overrides globais hardcoded (`quer_cadastrar`, `quer_humano`)
3. `matchTransition` do passo atual ← se casar, segue o fluxo, regra global **não** intercepta
4. **`evaluateRules`** ← só atua quando o passo normal não soube responder
5. QA (mantém)
6. Fallback (`repeat`/`goto`/`ai`)

Assim a regra "como funciona?" responde a dúvida solta, mas nunca atropela uma resposta esperada.

**C. Guard de reply vazio na rules-engine.**
No bloco do `ruleHit`:
```ts
const hasReply = (reply && reply.trim().length > 0);
const inlineSent = hasReply || !!rule.media_id;
return { reply: hasReply ? reply : "", updates: { ..., __inline_sent: inlineSent || undefined } };
```

**D. Restaurar `previous_conversation_step` após detour.**
No início do handler, antes de tudo: se `ctx.customer.previous_conversation_step` está setado E o passo atual é o destino de uma regra `goto_step` recente (checa `last_rule_id` + a regra teve `return_behavior='goto_step'`), no **próximo turno** restaura `conversation_step = previous_conversation_step` e zera ambos `previous_conversation_step` e `last_rule_id`. Mantém o lead no lugar que estava antes da pergunta solta.

### Engine — `supabase/functions/whapi-webhook/handlers/conversational/rules-engine.ts`

**E. Comprimento mínimo de keyword.**
Hoje uma keyword de 1 caractere (ex.: "a") casaria em qualquer mensagem. Adicionar `if (kw.length < 2) continue;` no loop de keywords.

**F. Não casar regra quando a mensagem é claramente uma captura.**
Recebe `hasCapture: boolean` em `EvaluateArgs`. Se `true`, pula regras com `scope='global'` (mantém só as `scope='step'` explicitamente escopadas no passo). Evita que "300 reais" dispare uma regra com keyword "reais".

# Validação

- Rebobinar o cenário do log: cliente em `qualificacao`, manda áudio "trezentos reais" → `extractValor=300` → injeta `valor_brl` → como o passo não tem essa transição mas teve captura, **auto-advance para `checkin_pos_video`** (s3). Bot manda "Que ótimo {nome}! 🙌 Com uma conta de R$ 300..." — comportamento certo.
- Lead em `welcome` manda "como funciona?" com regra global de FAQ cadastrada → `matchTransition` não casa, `evaluateRules` casa, responde, fica em `welcome`.
- Lead em `qualificacao` manda "300 reais" com uma regra global ruim de keyword "reais" → `hasCapture=true`, regra global é pulada, captura processa, auto-advance funciona.

# Riscos / não-objetivos

- Não mexe na tabela `bot_flow_rules` nem nas migrations (estrutura está OK).
- Não mexe no legacy `runLegacyConversational`.
- Não toca em mídia/áudio/whapi-proxy (problema separado: `whapi:sendMedia` está retornando 500 — fora do escopo desse fix).

# Ordem de entrega

1. Editar `rules-engine.ts` (itens E, F).
2. Editar `conversational/index.ts` (itens A, B, C, D).
3. Deploy `whapi-webhook` e validar com `supabase--edge_function_logs`.
