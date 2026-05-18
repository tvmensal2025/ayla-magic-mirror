# Diagnóstico do fluxo atual (Rafael Ferreira, 18/05 00:33-00:35)

Analisei os logs do `whapi-webhook` e do CRM. A IA está falhando por 4 motivos independentes, todos visíveis no caso do Rafael:

## Bug 1 — Coluna `__ai_faq` não existe (quebra silencioso após FAQ AI)
```
❌ ERRO ao salvar updates: Could not find the '__ai_faq' column of 'customers'
```
`handlers/conversational/index.ts:991` adiciona `__ai_faq: true` nos updates, mas `index.ts:728` só remove `__intent`, `__confidence` e `__inline_sent` antes do `update()`. Resultado: sempre que a IA responde uma dúvida via Lovable AI, o update do customer falha — `detour_count`, `conversation_step`, restore de step etc. não salvam. Lead fica preso no mesmo estado.

## Bug 2 — Classifier OpenAI quebrado (gpt-5-mini rejeita temperature=0)
```
[classifier] openai failed: 'temperature' does not support 0 with this model. Only the default (1) value is supported.
```
`intent-classifier.ts:89` e `:119` enviam `temperature: 0`. Em todo turno o OpenAI falha, cai pro Gemini (mais lento, e às vezes classifica errado). Quando volta `intent="outro"` em vez de `tem_duvida`, o lead pula o ramo AI FAQ e vai pra rota default — que dispara o Bug 3.

## Bug 3 — Motor `conversational` ainda silencia (`reply vazio bloqueado`)
```
[conversational] fallback goto bloqueado: step=33be... exige captura antes de 6226...
[conversational] ⚠️ reply vazio bloqueado em step=33be...
```
O fix anterior do `respondAndReentry` foi aplicado só em `handlers/bot-flow.ts`. Mas leads em welcome/qualificação/`flow:*` rodam por `handlers/conversational/index.ts`, que tem seu próprio caminho de "fallback goto bloqueado" e devolve `reply:""` → silêncio total. Foi exatamente o que aconteceu na mensagem das 00:33 do Rafael.

## Bug 4 — Spam de "NOVO LEAD CHEGOU" a cada minuto
Cada áudio do Rafael disparou uma notificação nova. O dedup do `_shared/notify-consultant.ts:155` (`recentAlerts = new Map`, TTL 60s) **só funciona dentro do mesmo isolate**. Edge Functions reiniciam ("booted" aparece a cada poucos segundos no log), então o Map sempre nasce vazio e o `shouldSend` deixa passar.

---

# Plano de correção

## 1. Sanitização genérica de chaves `__*` (resolve Bug 1 e previne novos)
Em `supabase/functions/whapi-webhook/index.ts`, antes do `supabase.from("customers").update(updates)`:
```ts
for (const k of Object.keys(updates)) if (k.startsWith("__")) delete (updates as any)[k];
```
Substitui os `delete` manuais por uma varredura única. Preserva `__intent`/`__confidence` em variáveis locais antes da limpeza (como já é feito).

## 2. Remover `temperature` dos classifiers (resolve Bug 2)
- `intent-classifier.ts:89`: remover `temperature: 0` (gpt-5-mini só aceita default).
- `intent-classifier.ts:119` (Gemini): manter `temperature: 0` (Gemini suporta) ou trocar pra `0.1`. Apenas o OpenAI é o problema.
- Auditar `bot-flow.ts:1106` (outro `temperature: 0`) — checar qual modelo é; se for gpt-5*, remover também.

## 3. Portar `respondAndReentry` para o motor conversational (resolve Bug 3)
No `handlers/conversational/index.ts`, em todo ponto que hoje retorna `_finalize(stepKey, { reply:"", ... })` por "fallback goto bloqueado" ou por miss de QA/AI:
- Chamar o mesmo helper `respondAndReentry` já criado em `bot-flow.ts` (extrair pra `_shared/respond-and-reentry.ts` para reuso).
- Fluxo: tenta `matchQA` → tenta `answerFaqWithAI` (já existe aqui, ampliar para qualquer intent) → fallback genérico ("Boa pergunta! Já te explico — antes me confirma: <pergunta do step atual>") → após 5 deviations, handoff cortês + `bot_handoff_alerts` + `notifyHandoff`.
- Garante que **nunca** retornamos `reply:""` quando não houve mídia inline.

## 4. Dedup persistente de notificações (resolve Bug 4)
Migration nova:
```sql
alter table customers add column if not exists last_new_lead_notified_at timestamptz;
alter table customers add column if not exists last_handoff_notified_at timestamptz;
```
Em `_shared/notify-consultant.ts`:
- `notifyNewLead`: antes de enviar, ler `customers.last_new_lead_notified_at`. Se < 24h, abortar. Após enviar, gravar `now()`.
- `notifyHandoff`: mesma lógica com janela de 30 min.
- Manter o Map em memória como cache rápido (TTL 60s) só pra evitar duas chamadas no mesmo isolate.

Isso elimina o spam mesmo com cold-boot constante.

## 5. Telemetria de recuperação
Reusar a tabela `bot_recovery_events` já planejada: registrar `source: "conversational"` quando o motor cair no `respondAndReentry`. Card `/admin/saude-bot` já vai mostrar.

---

# Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/whapi-webhook/index.ts` | Loop de strip `__*` antes do update |
| `supabase/functions/whapi-webhook/handlers/conversational/intent-classifier.ts` | Remover `temperature: 0` do OpenAI |
| `supabase/functions/whapi-webhook/handlers/bot-flow.ts` | Auditar `temperature: 0` na linha 1106 |
| `supabase/functions/whapi-webhook/handlers/conversational/index.ts` | Substituir `_finalize(...,reply:"")` por `respondAndReentry` |
| `supabase/functions/_shared/respond-and-reentry.ts` | **novo** — extrair helper compartilhado |
| `supabase/functions/_shared/notify-consultant.ts` | Dedup via colunas em `customers` |
| Migration | `last_new_lead_notified_at`, `last_handoff_notified_at` em `customers` |

# Não-objetivos
- Não mexer em UI/CRM (apenas backend).
- Não alterar fluxos do `/admin/fluxos`.
- Não trocar provider de IA (continua OpenAI + Gemini fallback).
