---
name: Active Media Filter
description: Webhooks whapi/evolution devem filtrar ai_media_library.active=true ao resolver media_id direto — soft delete não some sem isso
type: constraint
---

Quando o passo do fluxo tem `media_id` salvo no JSON, ambos `whapi-webhook/handlers/bot-flow.ts` e `evolution-webhook/handlers/bot-flow.ts` resolviam a URL via `.from("ai_media_library").eq("id", m.media_id)` **sem** `.eq("active", true)`. Resultado: mídia marcada como removida (soft delete em `StepMediaPanel.saveAllChanges`) continuava sendo enviada.

Regra: TODA query em `ai_media_library` por id deve incluir `.eq("active", true)`. O fallback por `slot_key` (linhas 1556+ whapi, 1556+ evolution) já filtrava — só o lookup direto por id estava furado.

**Why:** o v3-loader já filtra corretamente; apenas o caminho legacy precisava da correção.
