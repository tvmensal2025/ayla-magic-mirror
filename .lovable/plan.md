# IA Gemini 3.1 Pro global para dúvidas em qualquer momento

## Objetivo
1. Trocar `openai/gpt-5.5` por **`google/gemini-3.1-pro-preview`** (última geração, máxima precisão, PT-BR nativo).
2. Garantir que o passo "Esclarecer Dúvidas" (passo 6) NUNCA dispare áudio/vídeo/imagem — só texto da IA.
3. Tornar a IA **sempre ativa**: se o lead mandar uma pergunta em qualquer passo do funil, a IA responde com base no Knowledge Base (`ai_knowledge_sections`), sem precisar estar num passo específico.

## Mudanças

### 1. Modelo Gemini 3.1 Pro Preview
- `supabase/functions/_shared/ai-faq-answerer.ts`: default `model = "google/gemini-3.1-pro-preview"`.
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` e `evolution-webhook/handlers/bot-flow.ts`: remover override do GPT-5.5 (usa o default Gemini 3.1 Pro).

### 2. Passo 6 sem mídia (guard absoluto)
Hoje `dispatchStepFromFlow` já intercepta `esclarecer_duvidas` e responde só com texto IA, mas mídia ainda chega. Causa provável: o passo é disparado por outra rota (switch legacy ou `runConversationalFlow`) antes de cair no interceptador.

Fix: adicionar guard absoluto que pula qualquer envio de áudio/vídeo/imagem se o step atual for `esclarecer_duvidas` (ou `step_key` contém "duvid" exceto `duvidas_pos_club`). Aplicado nas funções de envio de mídia do flow runner.

### 3. IA global (sempre ativa) — AI Fallback Layer
Novo bloco em `whapi-webhook/handlers/bot-flow.ts` (e espelho `evolution-webhook`), executado em todo inbound de texto, na seguinte ordem:

```
1. customer.bot_paused / assigned_human_id → return (silêncio total)
2. isFile / isButton → fluxo normal
3. Handlers determinísticos (captura de valor, intent positivo, club progress)
4. trySendConfiguredQa() → se bater FAQ estático, usa
5. NOVO: AI Fallback Global
   - se passo está em NO_QA_STEPS (cadastro/edição CPF/email/conta) E texto não tem "?"
     → segue fluxo normal (não interrompe coleta)
   - senão se (texto contém "?" OU começa com palavra-pergunta OU 4+ palavras
              em passo conversacional)
     → answerFaqWithAI(question, recentHistory=8, consultantId, leadName)
     → se ai.confidence >= 0.55:
         sendText(ai.text)
         if ai.shouldHandoff: bot_paused=true + notifyHandoff
         MANTÉM o step atual (não avança)
         contador customer.ai_followups_count += 1
         se ai_followups_count >= 3 sem progresso: bot_paused + notifyHandoff "muitas_duvidas_ia"
         return
6. Switch legacy do passo atual (comportamento default)
```

**Palavras-pergunta** (regex PT-BR):
`^(como|quanto|qual|quando|onde|por\s?que|pq|posso|tem|é|funciona|cobra|paga|cancel|seguro|garantia|risco|fidelidade|multa|preciso|precisa|vale|dá|consigo|aceita|atende|distribuidor|conta)`

**Passos conversacionais** (já existem em `conversationalSteps`):
`welcome, menu_inicial, pos_video, checkin_pos_video, qualificacao, pitch_conexao_club, duvidas_pos_club, aguardando_humano`

**Reset do contador** `ai_followups_count` quando o lead progride (qualquer mudança de step) ou manda valor numérico válido.

### 4. Espelhar em evolution-webhook
Mesma lógica aplicada no espelho futuro.

## Arquivos afetados
- `supabase/functions/_shared/ai-faq-answerer.ts` — modelo default `google/gemini-3.1-pro-preview`.
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — guard mídia passo 6 + bloco AI Fallback global + contador.
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts` — espelho.
- **Migration**: adicionar `customers.ai_followups_count INT DEFAULT 0`.

## Detalhes técnicos
- **Modelo**: `google/gemini-3.1-pro-preview` via AI Gateway (LOVABLE_API_KEY já configurado).
- **Custo**: ~US$0.005 por pergunta (input ~1500 tok, output ~350 tok). ~2,5× mais barato que GPT-5.5.
- **Latência**: ~1.5-3s.
- **Memória**: últimas 8 mensagens da conversa enviadas ao prompt.
- **Anti-loop**: máx 3 IA-responses consecutivas sem progresso → handoff humano.
- **Respeita** `bot_paused`/`assigned_human_id` (silêncio total mantido).

## Critério de sucesso
- Passo 6 envia APENAS texto IA, nunca áudio/vídeo/imagem.
- Lead pergunta "tem fidelidade?" durante qualificação → IA responde corretamente sem quebrar fluxo nem avançar step.
- Lead pede humano explicitamente ou faz 3 perguntas seguidas → bot pausa e consultor é notificado.
- Modelo Gemini 3.1 Pro entrega respostas precisas, em PT-BR, baseadas no knowledge base.
