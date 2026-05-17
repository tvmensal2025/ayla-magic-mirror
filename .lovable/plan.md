
## Objetivo

Trocar o cérebro do classificador de intenção do bot (hoje Gemini 2.0 Flash) por **OpenAI GPT-5-mini**, usando sua chave própria da OpenAI. Isso resolve o bug onde respostas como "tá", "pode ser", "bora" eram classificadas como `outro` e travavam o fluxo.

## Por que GPT-5-mini

- Melhor compreensão de gírias e variações do português falado ("tá bom", "fechou", "simbora", "pode crer").
- Custo baixíssimo nesse uso (~$0.0001 por classificação, classifier roda só quando regex falha).
- Mantém o pre-pass de regex (resolve 70% sem chamar IA), então o custo real é marginal.

## Etapas

### 1. Adicionar a chave OpenAI (interação do usuário)
- Use o tool de secrets para pedir `OPENAI_API_KEY`.
- Onde pegar: https://platform.openai.com/api-keys → "Create new secret key".
- Você precisa ter crédito na conta OpenAI (mínimo $5).

### 2. Criar helper compartilhado OpenAI
Novo arquivo: `supabase/functions/_shared/openai.ts`
- Função `openaiChat({ model, messages, jsonSchema, temperature })` similar ao `ai-gateway.ts`.
- Lê `OPENAI_API_KEY` do env.
- Chama `https://api.openai.com/v1/chat/completions`.
- Suporta `response_format: json_schema` (structured output nativo do GPT-5).
- Trata erros 429 (rate limit), 401 (chave inválida), 402 (sem crédito).

### 3. Refatorar o classificador
Editar: `supabase/functions/whapi-webhook/handlers/conversational/intent-classifier.ts`
- Manter o pre-pass regex (não mexer — funciona bem).
- Trocar a chamada Gemini por OpenAI GPT-5-mini quando regex falhar.
- Manter a mesma interface `ClassifyResult` (intent, confidence, source).
- `source` passa a ser `"regex" | "openai" | "fallback"`.
- Prompt fica praticamente igual, mas com uma linha extra: "Considere gírias brasileiras: 'tá', 'fechou', 'bora', 'pode crer' = afirmacao; 'nem' = negacao".

### 4. Passar a chave para o classificador
- O orchestrator (`handlers/conversational/index.ts` ou `whapi-webhook/index.ts`) hoje passa `geminiApiKey` para `classifyIntent`. Vamos renomear o parâmetro para `openaiApiKey` e ler `Deno.env.get("OPENAI_API_KEY")`.
- Gemini continua sendo usado para OCR de conta de luz (`extract-pdf-text`) — **não mexer**, está funcionando bem.

### 5. Validação
- Deploy automático da edge function `whapi-webhook`.
- Teste com 5 mensagens reais via curl:
  - "tá bom" → deve virar `afirmacao` (hoje vira `outro`)
  - "pode ser" → `afirmacao`
  - "fechou" → `afirmacao` ou `quer_cadastrar`
  - "nem rola" → `negacao`
  - "vocês atendem SP?" → `tem_duvida`
- Conferir logs em `supabase--edge_function_logs whapi-webhook` para ver `source: "openai"` aparecendo.

## Detalhes técnicos

```text
ANTES (Gemini):
mensagem → regex → [falhou] → Gemini 2.0 Flash → intent

DEPOIS (OpenAI):
mensagem → regex → [falhou] → GPT-5-mini → intent
                              ↑
                              novo: melhor com gírias PT-BR
```

**Arquivos tocados:** 2 criados/editados, 0 removidos.
- `supabase/functions/_shared/openai.ts` (novo)
- `supabase/functions/whapi-webhook/handlers/conversational/intent-classifier.ts` (editar)
- Talvez 1 linha em `whapi-webhook/index.ts` se for onde a key é injetada.

**Custo estimado:** ~$0.50/mês para 5.000 mensagens (assumindo 30% chegam ao LLM após regex).

**O que NÃO muda:**
- Fluxo de cadastro, captura de nome, OCR de conta, envio de mídia, RLS, banco — tudo intocado.
- Gemini continua no OCR (`extract-pdf-text`) — é multimodal e barato lá.

## O que fica para depois (não incluído neste plano)

- Bug da captura de nome em texto livre ("oi me chamo Luciano").
- Handler de resposta livre (`answerFreeQuestion`) — você escolheu fazer só o classificador agora.

Se depois de 1 semana o bot estiver respondendo "sim/tá/pode" corretamente, atacamos os outros 2 bugs.
