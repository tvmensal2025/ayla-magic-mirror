## Summary

Reescrita do **Flow Engine v3** + features paralelas (Cashback Keyword Routing, Parceiros QR/Flyer, MediaLibraryPicker, Captação UX) e absorção dos cenários de retry do branch `fix/flow-d-retry-rules`.

Engine v3 entra com gate por feature flag (`isEngineV3Enabled`) e roteia entrada do webhook **antes** do legacy, sem quebrar o fluxo atual.

## What's included

### Flow Engine v3 (núcleo)
- Migração de DB **não-destrutiva** + tipos Supabase regenerados
- Pure runner + types + variants + fallbacks + suíte de testes (tasks 3-24)
- Hooks + router + loader + spec docs (tasks 25/27/28)
- Gate de entrada do webhook por flag `isEngineV3Enabled` (task 29)
- Cenários bot-e2e: `V_A1`, `V_B1`, `V_D1`, `V_D2`, `AI1`, `AI2`, `SILENT` (task 30)
- Carryover dos cenários de retry de `fix/flow-d-retry-rules` como `R_A1..R_B2` (task 31) → torna o branch retry-rules redundante
- Script idempotente `migrate-engine-v3` (task 32)
- Cron diário `flow-engine-v3-rollout-cron` com métricas (task 33)
- Runbook de rollout Phase 1 (super-admin flag ON, janela 24h)

### Engine v3 (correções de integração)
- Normalização legacy `action`→`mode` para `d_pedir_email` e `d_confirmar_telefone` em prod
- Mirror de `conversations`, trigger de `state-mirror`, `capture_mode` automático, `choice` para `message+buttons`
- `renderTemplateVars` aplicado a todos os outbounds + passa `consultantName`
- Resolução de `ai_media_library` por `slot_key` com cadeia de fallback
- Matriz completa dos 15 cenários de Flow D passando
- v3 gate movido para **antes** do roteamento legacy + normalização de `step_id` não-UUID no loader
- Correções no simulador: envelope JSON em `choice`, dedup de text-prompt+choice, `bot_test_outbound` NOT NULL direction, polling de `flow-simulate-run` 30s

### Cashback Keyword Routing
- Implementação completa: DB + keyword-matcher + integração no webhook + CRUD frontend + QR code + métricas

### Parceiros
- Editor de QR com upload de background e posicionamento draggable
- Template de flyer + footer band draggable (LICENCIADO/ID/WHATSAPP)
- Fix RLS: `consultant_id` carimbado no INSERT para satisfazer `WITH CHECK`

### WhatsApp + Captação
- `MediaLibraryPicker` + UX polish em Kanban/Chat/Capture

### Chore
- `.gitignore` para Playwright MCP logs e screenshots de teste
- Refresh dos markers de versão temp do Supabase CLI (gotrue 2.189.0, storage 1.58.25)
- Audit scripts + artefatos de mapping do Portal 2

## Migration / Rollout

1. Aplicar migration via `migrate-engine-v3` (idempotente)
2. Ligar flag `isEngineV3Enabled` apenas para super-admin
3. Janela de 24h com cron `flow-engine-v3-rollout-cron` reportando métricas
4. Promover gradualmente conforme runbook de Phase 1

## Tests

- Unit + PBT do retry helper e `fb.mode=retry`
- bot-e2e cobrindo Flow D (15 cenários), variantes, AI, silent, retry (R_A1..R_B2)
- Testes do simulador com novos formatos de envelope

## Notes

- **Substitui** o branch `fix/flow-d-retry-rules` (commits absorvidos via task 31)
- **Não** desliga código legacy, só roteia antes
- Rollback: desligar a flag `isEngineV3Enabled`
