# Causa raiz: detector de CNH/RG está **silenciosamente quebrado**

## O que está acontecendo (provado pelos logs)

Olhei os logs reais do `whapi-webhook` nas últimas horas:

```
🤖 [detectDoc] pass1 ambíguo (no-parse) — pass2 com 2.5-pro
🤖 [detectDoc] pass2 ambíguo — pass3 desempate
⚠️ [detectDoc] sem parse — fallback rg_antigo
🤖 [doc-auto] tipo detectado pela IA: rg_antigo
```

**As 3 passadas do Gemini estão retornando vazio (`no-parse`)** e o código cai no fallback final `tipo: "rg_antigo"`. Resultado: **TODO documento — CNH, RG novo, RG antigo — está sendo classificado como `rg_antigo`**, então o bot sempre pede o verso. O classificador "profissional" de 3 passadas hoje nunca funcionou.

## Por que as 3 passadas retornam vazio

`supabase/functions/_shared/detect-doc-type.ts:154`:

```ts
generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: "application/json" }
```

Dois problemas combinados:

1. **`gemini-2.5-flash` e `gemini-2.5-pro` têm "thinking" ligado por default.** Os tokens de raciocínio entram no mesmo orçamento de `maxOutputTokens`. Com 400 tokens, o thinking consome tudo e a parte visível (`candidates[0].content.parts[0].text`) volta vazia.
2. **`responseMimeType: "application/json"` força JSON estrito** — qualquer "pensamento" no meio quebra ou é cortado pelo limite.

A função `parseDetectJson` então recebe `""`, retorna `null`, e cada pass é marcado como "no-parse". O fallback final `rg_antigo` sempre vence.

## Diferença entre RG antigo, RG novo e CNH (o checklist já está bom)

O `CHECKLIST` no arquivo já cobre corretamente as diferenças visuais:
- **CNH**: horizontal, "CATEGORIA"/"VALIDADE"/"HABILITAÇÃO", sem verso útil.
- **RG novo (CIN)**: policarbonato, QR grande, CPF na frente, horizontal.
- **RG antigo**: papel laminado vertical, sem QR grande, sem CPF na frente.

O problema **não é** o prompt nem a distinção — é que o Gemini nunca responde nada parseável.

## Plano de correção

### 1. Desligar thinking explicitamente e aumentar orçamento

Em `callGemini` (detect-doc-type.ts):

```ts
generationConfig: {
  temperature: 0,
  maxOutputTokens: 2048,                         // antes 400
  responseMimeType: "application/json",
  thinkingConfig: { thinkingBudget: 0 },         // 🚨 sem thinking
},
```

Isso aplica nas 3 passadas (flash e pro). Sem thinking, o modelo gera o JSON direto e o `text` volta preenchido.

### 2. Log da resposta crua quando o parse falha

Hoje o log diz só "no-parse" — não dá pra debugar. Adicionar:

```ts
if (!parsed1) console.warn("[detectDoc] pass1 raw:", raw1.substring(0, 300));
```

Idem pass2 e pass3. Sem isso, qualquer regressão futura fica invisível de novo.

### 3. Fallback inteligente em vez de assumir `rg_antigo`

Quando as 3 passadas falham (caso raro após o fix), em vez de empurrar `rg_antigo` (que sempre pede verso e quebra UX de CNH), o bot deve **perguntar** uma única vez: "É RG ou CNH?" e seguir com a resposta. Isso vai no `case "aguardando_doc_auto"` em `bot-flow.ts:2519`.

Implementação:
- `detectDocumentTypeDetailed` ganha campo `confianca: 0, source: "fallback"` (já existe).
- No handler, se `confianca === 0 && source === "fallback"`, em vez de prosseguir, salva `document_front_*`, vai para `ask_tipo_documento` (que já existe — linha 2620) e pergunta "RG ou CNH?".

### 4. Ajuste do fallback "rg_antigo é mais seguro" no PROMPT_PASS3

Hoje a regra R5 do pass3 ("em dúvida → rg_antigo") **incentiva** o modelo a chutar RG mesmo quando viu CATEGORIA/VALIDADE. Trocar por "em dúvida → responda com `confianca: 0.3`" e deixar o handler aplicar o fallback humano do item 3.

## Arquivos afetados

- `supabase/functions/_shared/detect-doc-type.ts` (itens 1, 2, 4)
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (item 3, no case `aguardando_doc_auto`)

## Verificação

Depois de deploy:
1. Esperar próximo lead enviar CNH ou RG.
2. Conferir logs: deve aparecer `pass1 confiante: cnh (0.90+)` em vez de `no-parse`.
3. Conferir que CNH não dispara mais "envie o verso".

Sem mudar UX visível para o lead — a correção é só fazer o classificador realmente funcionar.
