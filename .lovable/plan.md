
# Subir toda a IA para modelos premium

## Situação atual (mista)

| Camada | Modelo hoje | Onde |
|---|---|---|
| Triagem (toda msg) | `google/gemini-3-flash-preview` | `_shared/ai-orchestrator.ts` |
| Cérebro (decisão) | `openai/gpt-5.5` ✅ | `_shared/ai-orchestrator.ts` |
| RAG / FAQ | `google/gemini-3.1-pro-preview` ✅ | `_shared/ai-orchestrator.ts` → `ai-faq-answerer.ts` |
| Resumo de conversa | `google/gemini-2.5-flash` | `_shared/ai-summary.ts` |
| Button intent (texto→botão) | `gemini-3.5-flash` (perfil `balanced`) | `_shared/ai-config.ts` |
| Outros consultores | perfil `balanced` (Flash em quase tudo) | `consultants.ai_profile` |

Apenas o consultor **Rafael Ferreira** está em `accuracy`. Os outros 12 estão em `balanced`.

## O que vai mudar

**Objetivo: zero modelo Flash em decisão/resposta. Premium ponta-a-ponta.**

1. **Triagem** → `openai/gpt-5-mini` (premium pequeno, raciocínio melhor que Flash, ainda barato/rápido). Fallback `gpt-5-nano`.
2. **Cérebro** → `openai/gpt-5.5` (mantém). Fallback já é `gpt-5.4` → `gpt-5-mini`.
3. **RAG FAQ** → `google/gemini-3.1-pro-preview` (mantém). Fallback `gemini-2.5-pro`.
4. **Resumo** → `openai/gpt-5-mini` (sobe de Flash para premium pequeno; resumo persistente é crítico).
5. **Button intent** → forçar `accuracy` no fallback LLM (`gpt-5-mini`), mesmo para consultores em `balanced`.
6. **Forçar `accuracy` em todos os consultores** → migration `UPDATE consultants SET ai_profile='accuracy'`.
7. **Bypass do "caminho barato" da triagem** → quando `needs_orchestrator=false` mas é `answer_faq`/`clarify`/`escalate`, hoje a triagem responde sozinha. Vamos forçar `needs_orchestrator=true` sempre que `route ∈ {answer_faq, escalate, clarify}` — garante que GPT-5.5 sempre formula a resposta final.

## Arquivos a editar

- `supabase/functions/_shared/ai-orchestrator.ts`
  - `TRIAGE_MODEL = "openai/gpt-5-mini"`
  - Após `runTriage`, se `route` exigir resposta, forçar `needs_orchestrator=true`
- `supabase/functions/_shared/ai-summary.ts`
  - `SUMMARY_MODEL = "openai/gpt-5-mini"`
- `supabase/functions/_shared/ai-gateway.ts`
  - Adicionar cadeia de fallback para `openai/gpt-5-mini` → `gpt-5-nano`
- `supabase/functions/_shared/ai-config.ts`
  - Subir `button_intent` e `intent_classify` no perfil `balanced` para usar `gpt-5-mini`/`gemini-3.1-pro`
- Migration SQL
  - `UPDATE consultants SET ai_profile='accuracy';`

## Impacto

- **Qualidade**: respostas mais precisas, menos "alucinação", menos handoff por baixa confiança.
- **Latência**: +0.5-1.5s na triagem (gpt-5-mini vs Flash). Aceitável no WhatsApp.
- **Custo**: estimo **3-5× o gasto de IA atual** (Flash → Mini/Pro premium em toda mensagem inbound). Monitorável em `ai_costs` no painel `/admin/saude-bot`.
- **Rollback**: reverter os 3 arquivos + `UPDATE consultants SET ai_profile='balanced'`.

## Fora de escopo

- OCR de conta (`ocr_extract`) e transcrição de áudio — já usam Pro/multimodal adequados.
- Reconectar Whapi e despausar leads (operacional, não relacionado a modelo de IA).
