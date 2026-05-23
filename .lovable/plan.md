# Fluxo D — mapeamento das respostas livres do cliente

## O que está errado nas últimas conversas

### Lead `11989000650` (Oque Éisso) — **bot mudo total**

- 14:00:41 — welcome enviado **com botões** ✓ (confirmado nos logs whapi: `sendButtons botões entregues`)
- 14:05:23 — cliente digitou `?`
- 14:05:42 — cliente digitou `oque éisso?`
- **bot não respondeu nada.**

Step atual: `flow:aee7b26c-...` (welcome do D). As `transitions` desse welcome só casam com `simular|como|humano|1|2|3`. Qualquer texto fora disso cai num caminho que retorna `false` silenciosamente — **não dispara smart-repeat, nem re-dispatch, nem AI fallback.** É o pior caso: cliente sem resposta.

### Lead `11971254913` (Oque) — mapeamento confuso

- Clicou/digitou "Como funciona" → step `d_como_funciona` cujo `message_text` é **só** `"Vou te explicar rapidinho como funciona 👇"`. Não tem nada depois do 👇. O bot já pula direto para `d_pedir_conta`.
- Cliente respondeu `"eu nao quero cadastrar ainda"` → bot ignorou intent negativa e repetiu o pedido de foto.
- Cliente disse `"nao irei mandar"` → bot enviou welcome de novo, sem reconhecer recusa.
- 3 welcomes em 2 minutos (14:00:41, 14:00:58, 14:02:08) — sem dedupe entre disparos manuais.

## Causa raiz

`handlers/bot-flow.ts`, no bloco que processa resposta do cliente quando step atual é `message` com `_buttons`:

1. Faz match nas `trigger_phrases` exatas/keywords.
2. Se não casa, retorna sem mandar nada (silêncio).
3. Não chama smart-repeat porque smart-repeat só roda em `capture_*`.
4. Não tem AI intent-matching para mapear texto livre → botão.

E para `capture_*`, qualquer texto que não seja foto vira "Pode me responder" — sem detectar recusa explícita.

## Mudanças

### 1. AI Intent Match para steps com botões — `handlers/bot-flow.ts`

Quando step atual é `message` com `_buttons` e cliente manda texto livre que não casa nas `trigger_phrases`:

- Chama Lovable AI Gateway (Gemini Flash) com prompt curto:
  > "Cliente respondeu '{msg}'. Opções: 1) {btn1}, 2) {btn2}, 3) {btn3}. Qual número ele quis? Se confuso, responda 0. Se quer sair/parar, 9. Só o número."
- Resposta 1/2/3 → executa a `transition` daquele botão direto (como se tivesse clicado).
- Resposta 0 → re-dispatch do mesmo step (manda welcome+botões de novo) com prefixo: "Sem problema! Toque em uma das opções abaixo 👇".
- Resposta 9 → mensagem de despedida amigável + pausa bot 24h.
- Limite: 2 chamadas IA por step/cliente (campo `ai_intent_match_count` em customers); na 3ª já escala para humano.

### 2. Detector de recusa em `capture_*` — `handlers/bot-flow.ts` (ou `conversational/index.ts`)

Antes do smart-repeat, regex de recusa explícita: `/n[ãa]o (vou|quero|posso|irei|tenho|consigo|sei) (mandar|enviar|cadastrar|agora|tirar)|n[ãa]o tenho|sem tempo|depois eu|amanh[ãa]/i`.

Se casar:

- Resposta humanizada: "Tranquilo, {{nome}}! Quando quiser dar continuidade é só me mandar uma foto da conta. Tô por aqui 💚"
- Pausa bot 24h, marca step `lead_paused_by_refusal`.
- Não dispara handoff (cliente só não quer agora — diferente de problema).

### 3. Conteúdo padrão para `d_como_funciona` — migration

O step `d_como_funciona` está praticamente vazio. Preencher JAT EM UM AUDIO E UM VIDEO QUE VAI SER ENVIADO NO LUGAR DO TEXTO E EMBAISO APARECE AS PERGUNTAS DNV

E os `transitions` desse step ganham botões: `[Quero simular] [Falar com Rafael]`.

### 4. Dedupe de welcome — `handlers/bot-flow.ts` no `dispatchStepFromFlow`

Já existe anti-rep de 10min para alguns steps. Adicionar guard específico para steps do tipo `welcome` (step_key começando com `d_welcome` ou position=1): se já mandou nos últimos **3 minutos**, ignora silenciosamente o re-dispatch.

## Arquivos

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — AI intent match (1), detector de recusa (2), dedupe welcome (4)
- `supabase/functions/_shared/ai-intent.ts` — novo helper para chamar Gemini com prompt de match de botão (cache + limite)
- Migration — atualizar `message_text` e `transitions` de `d_como_funciona`

Sem mudanças de schema (`ai_intent_match_count` aproveita coluna `ai_followups_count` já existente).