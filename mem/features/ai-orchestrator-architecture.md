---
name: AI Orchestrator Architecture (GPT-5.5 + Gemini)
description: Cascata triagem→GPT-5.5→Gemini 3.1 Pro RAG via _shared/ai-orchestrator.ts; cost tracking em ai_costs; fallback automático em 429/402/5xx
type: feature
---

## Camadas

| Phase | Modelo padrão | Quando |
|-------|---------------|--------|
| triage | google/gemini-3-flash-preview | Todo texto livre. Decide route (deterministic|answer_faq|escalate|clarify|continue) e needs_orchestrator. |
| orchestrator | openai/gpt-5.5 | Só quando triage.needs_orchestrator=true. Tool-calling JSON: action + reply + use_rag. |
| faq (RAG) | google/gemini-3.1-pro-preview | Só quando brain.use_rag=true. answerFaqWithAI com ai_knowledge_sections. |

## Arquivos

- `_shared/ai-orchestrator.ts` — `runOrchestrator({ supabase, customer, consultantId, message, step, history, isButton, hasMedia })` retorna `{ reply, route, intent, confidence, shouldHandoff, modelChain, latencyMs }`.
- `_shared/ai-gateway.ts` — `aiChatCascade(opts)` segue `FALLBACK_CHAIN` em 429/402/5xx/timeout (GPT-5.5→5.4→5-mini; Gemini 3.1 Pro→2.5 Pro→2.5 Flash; Flash→2.5 Flash→2.5 Flash-Lite).
- `_shared/ai-cost-tracker.ts` — `trackAIUsage` upsert em `ai_costs(consultant_id, day, model, phase)` com PRICING table USD/1M tokens; `logAIDecision` insere em `ai_decisions` com modelo, latência, confiança, reasoning.
- `_shared/ai-faq-answerer.ts` — usa `aiChatCascade` + trackAIUsage. Mantida pra compat (orchestrator chama internamente quando use_rag=true).

## Integração

- `whapi-webhook/handlers/bot-flow.ts` linha ~1822: AI FALLBACK GLOBAL usa `runOrchestrator` em vez de `answerFaqWithAI` direto. Triage barata filtra >75% dos turnos antes de chamar GPT-5.5.
- Anti-loop preservado: `ai_followups_count >= 3` → handoff humano.

## Migrations

- `ai_costs(consultant_id, day, model, phase, calls, input_tokens, output_tokens, usd_est)` UNIQUE(consultant_id,day,model,phase). RLS: super_admin all.
- `consultants.ai_persona text` — 3-5 frases injetadas no system prompt do orquestrador.
- Índices `ai_decisions(customer_id, created_at desc)` e `(consultant_id, created_at desc)`.

## Custo

GPT-5.5 só roda em ~15-25% dos turnos (resto: botão/mídia/triage-rejected). Estimativa: ~1.6-1.8× custo atual com qualidade muito maior. Tracking em `ai_costs` permite alertas e breakdown por consultor.
