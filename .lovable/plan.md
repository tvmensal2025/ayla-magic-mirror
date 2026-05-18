
# Plano: onde vale Lovable AI vs onde fica Gemini direto

## Estado atual

O projeto já tem infra robusta de Gemini direto (`_shared/gemini.ts`) com pricing, retries, fallback Pro→Flash, telemetria por consultor e cliente. E já existe um **híbrido OpenAI/Gemini** em `intent-classifier.ts`. Ou seja, não estamos partindo do zero — a decisão é **onde plugar Lovable AI Gateway** sem quebrar o que funciona.

## Princípio de escolha

| Critério | Vai pra **Gemini direto** | Vai pra **Lovable AI** |
|---|---|---|
| Volume | Alto (>1k req/dia) | Baixo a médio |
| Latência sensível ao usuário | Sim (bot WhatsApp em tempo real) | Não (cron, batch, dashboards) |
| Custo crítico | Sim | Tanto faz |
| Multi-modal pesado (imagem/áudio/PDF) | Sim (já está em produção) | Evitar |
| Precisa de provider failover (OpenAI/Anthropic) | Não | Sim |
| Você quer trocar de modelo sem mexer em código | Não | Sim |

## Mapa: o que fica onde

### Fica em Gemini direto (NÃO MEXER — alto volume / latência crítica)

```text
whapi-webhook (bot WhatsApp em tempo real)
├── intent-classifier        ── já é híbrido OpenAI+Gemini, OK
├── bot-flow (resolver)      ── determinístico, sem IA
├── ai-transcribe-media      ── áudio Whapi, alto volume
├── _shared/ocr.ts           ── RG/CNH/conta de luz (volume alto)
├── _shared/detect-doc-type  ── classificação de docs
├── ad-image-validator       ── batch grande de criativos
└── extract-pdf-text         ── PDFs longos, tokens caros
```

Motivo: já paga pricing tabelado, tem retries, fallback Pro→Flash e a conta de tokens é grande demais pra passar por gateway intermediário.

### Migra pra Lovable AI (ganho real)

| Função atual | Por que migrar | Modelo sugerido |
|---|---|---|
| `ai-summarize-conversation` | Resumo de handoff — 1 chamada por handoff, baixo volume, valoriza ter prompts editáveis e trocar modelo fácil | `google/gemini-3-flash-preview` |
| `ai-extract-memory` | Extrai memórias do CRM — batch noturno, latência não importa | `google/gemini-3-flash-preview` |
| `ai-daily-digest` | Resumo diário do consultor — 1x/dia, qualidade > custo | `google/gemini-3.1-pro-preview` |
| `ai-learn-feedback` | Aprende com correções do humano — ocasional | `google/gemini-3-flash-preview` |
| `ai-cpl-watchdog` | Análise de CPL de campanhas — observabilidade interna | `google/gemini-3-flash-preview` |
| `ai-followup-cron` (geração de copy) | Mensagem de follow-up — ganha em poder testar variantes | `google/gemini-3-flash-preview` |
| `support-chat` / `igreen-chat` | Chats internos pro admin — baixo volume, melhor com streaming AI SDK | `google/gemini-3-flash-preview` |
| `ad-creative-builder` / `ad-creative-qa` | Geração de copy de anúncios — qualidade > custo, baixo volume | `google/gemini-3.1-pro-preview` |

Ganhos concretos:
- **Sem `GEMINI_API_KEY` pra rotacionar** nesses pontos — Lovable provisiona `LOVABLE_API_KEY`.
- **Trocar `google/gemini-3-flash` por `openai/gpt-5-mini` numa linha** se um caso específico responder melhor.
- **Streaming nativo via AI SDK** (`support-chat`, `igreen-chat` ficam mais fluidos).
- **Telemetria centralizada no gateway** (sem precisar manter `ai_usage_log` à mão pra esses).

### Novo: o que dá pra criar com Lovable AI (alto ROI)

1. **FAQ Answerer com RAG** — quando o lead pergunta algo fora do script no WhatsApp, classifier já marca `tem_duvida` mas o bot só responde se houver match em `bot_flow_qa`. Adicionar uma chamada **Lovable AI** com contexto de `ai_knowledge_sections` (RAG) pra responder objeções genéricas. **Frequência baixa por lead, qualidade alta** — perfeito pro gateway.

2. **Handoff Summary on-demand** — gerar resumo da conversa no botão "passar pro humano" do CRM (1 clique = 1 request). Lovable AI ideal.

3. **Audit Dashboard com IA** — você pediu auditoria das conversas. Plugar um endpoint `audit-conversation` no Lovable AI que recebe `conversation_id` e cospe: sentimento, ponto de fricção, próxima ação sugerida. Roda 1x/conversa, qualitativo.

4. **Sugestão de resposta no chat do consultor** — quando o consultor digita no CRM, sugerir 3 respostas baseadas no histórico. Streaming pelo AI SDK fica natural.

## Implementação proposta (3 fases pequenas)

### Fase 1 — FAQ Answerer (maior impacto no bot)
- Nova função `bot-faq-answerer` (Lovable AI, `gemini-3-flash-preview`)
- Chamada de `whapi-webhook` quando `intent=tem_duvida` E não houver match em `bot_flow_qa`
- Usa `ai_knowledge_sections` como contexto (RAG simples)
- Resposta limitada a 3 frases + handoff se confidence < 0.6
- Resolve diretamente o problema da auditoria (Franciele travada)

### Fase 2 — Migração das funções de baixo volume
- `ai-summarize-conversation`, `ai-extract-memory`, `ai-daily-digest`, `ai-learn-feedback`, `ai-cpl-watchdog`
- Trocar `_shared/gemini.ts` por `_shared/ai-gateway.ts` (já existe!)
- Manter prompts iguais, só trocar o client
- Sem mudança de comportamento percebida

### Fase 3 — Sugestão de resposta no CRM
- Endpoint streaming via AI SDK
- Frontend: input com botão "💡 Sugerir resposta"
- 3 variantes geradas em paralelo

## O que NÃO recomendo fazer

- ❌ Migrar `intent-classifier` pra Lovable AI — volume alto, já tem fallback OpenAI→Gemini, latência crítica.
- ❌ Migrar `ai-transcribe-media`, `ocr`, `extract-pdf-text` — multi-modal pesado, custo importa.
- ❌ Migrar `bot-flow` — é determinístico, não tem IA.
- ❌ Centralizar TUDO no Lovable AI — perde controle de custo no alto volume.

## Próximo passo

Aprovando este plano, sugiro começar pela **Fase 1 (FAQ Answerer)** porque resolve diretamente o problema visto na auditoria (leads fazendo pergunta fora do script e bot travando). É 1 edge function nova + 1 hook no `whapi-webhook`. Não toca em nada que já funciona.

Quer que eu prossiga só com a Fase 1, ou aprova o conjunto Fase 1 + Fase 2 pra rodar em sequência?
