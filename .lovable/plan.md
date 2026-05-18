## Diagnóstico — Evolution NÃO está 100%

Auditei a parte de WhatsApp ponta a ponta (webhook, bot, frontend) comparando com o caminho Whapi (super-admin). Encontrei lacunas críticas. Como está hoje, **um consultor novo conecta a instância e o QR aparece, mas o bot vai engasgar em produção** porque o webhook do Evolution é uma versão antiga/reduzida do bot, e o painel de conversas só lê do Whapi.

### O que está duplicado e funcionando

- Edge functions `evolution-proxy` e `evolution-webhook` existem.
- `src/services/evolutionApi.ts` cria instância já com webhook apontando para `/functions/v1/evolution-webhook` e eventos `MESSAGES_UPSERT` + `CONNECTION_UPDATE`.
- `messageSender.ts` envia por Evolution por padrão; só usa Whapi se `isWhapi=true` (super admin).
- `handlers/connection.ts`, `handlers/otp-intercept.ts` e o esqueleto do bot existem.
- `notifyNewLead` está plugado no fluxo de criação de cliente.

### O que está faltando / divergente (bloqueia uso real)

1. **Motor de fluxo customizado (`bot_flow_steps`) não existe no Evolution.**
   - `whapi-webhook/handlers/bot-flow.ts` = 4217 linhas, com resolver de `bot_flow_steps` (UUID/`flow:<id>`/`passo_<ts>`), `dispatchStepFromFlow`, transitions por `trigger_phrases`, anti-duplicação via `last_custom_prompt_at`, FAQ (`matchQA`), `notifyHandoff`, módulo `conversational/` (intent-classifier, rules-engine, state-machine, templates), `step-namespace`.
   - `evolution-webhook/handlers/bot-flow.ts` = 1582 linhas. Sem `bot_flow_steps`, sem `matchQA`, sem `notifyHandoff`, sem `dispatchStepFromFlow`, sem `conversational/`, sem `step-namespace`, sem `last_custom_prompt_at`. → **O FluxoCamila configurado no /admin/fluxos NÃO roda no Evolution.** Vai usar só os steps legacy hardcoded.

2. **Tests e arquivos auxiliares ausentes** no Evolution: `bot-flow_test.ts`, `step-namespace.ts`, pasta `handlers/conversational/` inteira.

3. **Painel de conversas do consultor (frontend) é Whapi-only para listar/ler.**
   - `useChats.ts` e `useMessages.ts` chamam `whapiListChats/whapiListMessages/whapiGetProfilePicture` quando NÃO é super-admin — mas o Whapi token é único do super-admin. Consultor comum vai ver lista vazia ou erro 401.
   - Já existe `findChats/findContacts/getProfilePicture` em `evolutionApi.ts` importados mas só usados no branch super-admin invertido. A lógica de roteamento está espelhada.

4. **`evolution-webhook` não tem o reentry/notify-handoff** quando o cliente volta após >24h sem inbound, nem pausa por pergunta fora do FAQ (regras hoje vivas no Whapi — ver `mem/features/lead-notifications-and-handoff` e `mem/features/custom-flow-step-engine`).

5. **Pitch Conexão Club + dúvidas pós-club** dependem de `dispatchStepFromFlow` (ordem text→audio→video→image) — não vão disparar via Evolution.

6. **Variáveis `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`** precisam estar configuradas como secrets das edge functions (o arquivo `URGENTE_CONFIGURAR_AGORA.md` confirma que historicamente faltavam). Vale revalidar.

7. **Connection update / `connected_phone`**: precisa garantir que ao conectar a instância o webhook `CONNECTION_UPDATE` grava `connected_phone` em `whatsapp_instances` (`useInstancePhone` depende disso para o BulkSend e filtros).

8. **Trigger de mensagem outbound**: ao consultor mandar manualmente pelo painel, `sendWhatsAppMessage` usa `instanceName` — precisa confirmar que `useChats/useMessages/BulkSendPanel` passam `instanceName` correto (o do consultor logado, padrão `igreen-{slug}`).

### Plano de execução (ordem obrigatória)

**Fase 1 — Paridade do webhook (crítico)**
1. Copiar para `evolution-webhook/handlers/`:
   - `conversational/` (intent-classifier, rules-engine, state-machine, templates + tests)
   - `step-namespace.ts` (+ test)
2. Reescrever `evolution-webhook/handlers/bot-flow.ts` espelhando 100% o do Whapi, trocando apenas a camada de envio (usar `ctx.sender` que já é o `createEvolutionSender`) e o download de mídia (já é `sender.downloadMedia`). O resto (resolver de `bot_flow_steps`, `dispatchStepFromFlow`, `matchQA`, `notifyHandoff`, anti-rep `last_custom_prompt_at`, intent transitions, chain) é idêntico.
3. Em `evolution-webhook/index.ts` adicionar: notifyNewLead em reentrada (sem inbound 24h) e roteamento `runConversationalFlow` antes do legacy switch — igual ao Whapi.

**Fase 2 — Frontend multi-provider**
4. `useChats.ts` / `useMessages.ts`: quando o consultor NÃO é super-admin (a maioria), buscar a instância do consultor e usar `findChats`/`findContacts`/`getProfilePicture`/`findMessages` do `evolutionApi.ts`. Manter Whapi só no branch super-admin.
5. Garantir que `messageSender` recebe `instanceName` correto em todos os pontos (`useChats`, `useMessages`, `BulkSendPanel`, templates, CRM auto-reply).

**Fase 3 — Connection lifecycle**
6. Confirmar/ajustar `handlers/connection.ts` para gravar `connected_phone`, `status='connected'`, limpar QR ao parear, e marcar `disconnected` em logout. Testar com instância nova (`igreen-{slug}`).

**Fase 4 — Validação E2E por consultor novo**
7. Criar consultor de teste → seed automático do FluxoCamila já existe (`seed_camila_flow_on_consultant_insert`). Verificar:
   - Conectar QR via /admin/whatsapp.
   - Receber mensagem real → cai no `welcome` do `bot_flow_steps` (não no hardcoded).
   - Avançar até `capture_conta` → OCR → confirmação → cadastro_portal → OTP.
   - `notifyNewLead` chega no `notification_phone`.
   - Pergunta fora do FAQ pausa bot e dispara `notifyHandoff`.
   - Painel /admin/whatsapp lista o chat e o histórico via Evolution (não Whapi).
   - BulkSend para esse consultor usa a instância dele.

**Fase 5 — Limpeza**
8. Documentar em `mem/whatsapp/evolution-parity.md` que `whapi-webhook` continua só para super-admin e `evolution-webhook` é o caminho default; remover/depreciar arquivos `.md` confusos (`URGENTE_CONFIGURAR_AGORA.md`, duplicatas de RESUMO/STATUS) num passo opcional.

### Detalhes técnicos

- O resolver de `bot_flow_steps` no Whapi (`bot-flow.ts` linha ~1845) precisa ser portado **textualmente** — qualquer divergência quebra transitions custom.
- `conversational/index.ts` usa `customer.consultant_id` para buscar `bot_flow_steps` — funciona igual no Evolution.
- `notifyHandoff` e `notifyNewLead` já existem em `_shared/notify-consultant.ts` (compartilhado).
- Não há mudança de schema necessária — todas as colunas (`last_custom_prompt_at`, `bot_paused`, `pending_inbound_message_id`, `notification_phone`) já existem.
- Risco: o `bot-flow.ts` do Whapi tem 4217 linhas; portar para Evolution é cópia + adaptação da camada `sender`. Vou validar com `bot-flow_test.ts`.

### Fora de escopo

- Mudanças na LP, CRM Kanban, Anúncios, MinIO.
- Migração definitiva super-admin Whapi → Evolution (fica para depois; por ora coexistem).

### Resposta direta à pergunta

**Hoje, NÃO está 100%.** Um consultor novo conecta o QR mas:
- o bot ignora o FluxoCamila customizado (usa só legacy hardcoded),
- o painel de chats fica vazio (lê Whapi do super-admin),
- não há handoff/FAQ/anti-dup,
- pitch Conexão Club / dúvidas não disparam.

Aplicando as Fases 1–4 acima, fica 100%.
