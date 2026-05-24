# Simulador 100% fiel à produção

Hoje o simulador usa um **motor client-side** (`simulateStep` em `src/lib/flow-simulator/engine.ts`) para decidir transições/fallbacks. Isso **não é** o mesmo motor da produção (`runBotFlow` em `whapi-webhook/handlers/bot-flow.ts`, ~4.8 mil linhas). Resultado: transições, intent IA, A/B/C, OCR, retomada após silêncio, captura de campos — tudo pode divergir do real.

Para ser **100% igual**, o simulador precisa executar o **mesmo `runBotFlow**` da produção, trocando apenas o canal de saída.

## Arquitetura

O webhook já isola o canal num `ChannelAdapter` (`supabase/functions/_shared/channels/types.ts`). Vamos criar um `**SimulatorAdapter**` que implementa o mesmo contrato (`sendText`, `sendChoice`, `sendMedia`, `sendPresence`), mas em vez de chamar Whapi/Evolution, **empurra cada saída num buffer**. Esse buffer é devolvido na resposta da edge.

### Como fica o ciclo

```text
UI clica "Enviar" → edge flow-simulate-run
                    ├── garante customer sandbox (is_sandbox=true)
                    ├── monta ParsedMessage fake (texto / button_id)
                    ├── runBotFlow(ctx, adapter=SimulatorAdapter)
                    │     ├── mesma resolução de step
                    │     ├── mesma IA livre (Gemini real)
                    │     ├── mesma busca em ai_media_library
                    │     ├── mesmas transições/fallback/repeat
                    │     └── adapter.sendText/sendMedia → push no buffer
                    └── devolve [{kind:text|audio|image|video|presence, ...}]
UI renderiza eventos com áudio/vídeo tocáveis e IA "digitando" como hoje
```

## Mudanças

### Backend

1. **Migração**: `customers.is_sandbox boolean default false` + índice parcial. `bot_flow_logs.is_sandbox` (se a tabela existir) para isolar dos KPIs.
2. **Guardas em hot-paths de produção** — toda função que dispara efeito externo precisa ignorar quando `customer.is_sandbox`:
  - `notifyNewLead` / `notifyHandoff` (não manda WhatsApp pro Rafael)
  - `pending_outbound_media` writes
  - `deals` auto-create (CRM)
  - `conversation_logs`/`message_metrics`/`flow-engine-health` (não polui métricas)
  - `pg_cron` follow-ups (`ai-followup-cron`, `send-scheduled-messages`, `bot-stuck-recovery`, `bot-loop-watchdog`)
  - `customer-takeover` / notificações por handoff
  - Todo INSERT em `flow_engine_*` (parity/shadow) já filtra por flag.
   Implementação: helper `isSandbox(customer)` em `_shared/sandbox-guard.ts`, chamado nos pontos de entrada. Cada guarda volta cedo com log `event:"sandbox_skip"`.
3. **Novo adapter** `supabase/functions/_shared/channels/simulator.ts`:
  - Implementa `ChannelAdapter`. Buffer em memória do request (Map por jid).
  - `sendPresence` vira evento `{kind:"presence", state:"composing"|"recording", durationMs}` (UI mostra "digitando…"/"gravando áudio…").
  - `sendMedia` devolve `url` direto (já vem da `ai_media_library`).
  - `sendText` e `sendChoice` viram `text` + `buttons`.
  - `parseInbound` / `downloadMedia` não são usados na simulação (apenas saída).
4. **Refator mínimo em `whapi-webhook/index.ts**`: extrair "como escolher o adapter" para uma função `selectAdapter(provider)`. Hoje deve estar inline.
5. **Duas novas edges**:
  - `flow-simulate-run` (POST): `{consultant_id, variant?, user_message?, button_id?, attach_image_url?, reset?}` → `{events:[...], current_step, customer_state}`. Cria/reusa o sandbox customer (jid `simulator-<uid>@s.whatsapp.net`), monta `ParsedMessage` e chama `runBotFlow`.
  - `flow-simulate-reset` (POST): apaga sandbox customer do consultor + mensagens.
  - Authz: usa o JWT do usuário; só dono do consultor ou admin/super_admin pode rodar.
6. `**flow-simulate` atual vira deprecated** — UI passa a usar `flow-simulate-run` puro. Removo o handler `action:"ai"` (a IA passa a rodar dentro do `runBotFlow`).

### Frontend

7. Reescrever `FlowSimulator.tsx`:
  - Remove import do `simulateStep` (engine client-side morre).
  - Cada interação chama `flow-simulate-run` com `user_message` ou `button_id`.
  - Renderiza eventos vindos da edge **na ordem que vieram** (texto, áudio playable, imagem, vídeo, "digitando…" com `durationMs`).
  - Botão **Zerar conversa** chama `flow-simulate-reset` antes de mandar 1ª mensagem (vazia → engine produz boas-vindas).
  - Seletor de **Variante (A/B/C/D)** no topo (passa pra edge).
  - Botão **"📷 Enviar foto fake da conta"** anexa `attach_image_url` (preset MinIO de conta-luz de exemplo) → engine roda OCR de verdade.
  - Banner: "Conversa sandbox — não afeta CRM, métricas nem cliente real."
8. Remover `src/lib/flow-simulator/engine.ts` (mock) e referências.

## Riscos e mitigação

- **Vazamento**: se algum hot-path esquecer o `isSandbox()`, o Rafael recebe alerta fake, métrica suja, etc. Mitigação: gera lista exaustiva por `rg "notifyNewLead|notifyHandoff|pending_outbound_media|insert.*flow_engine_|insert.*conversation_logs"` e cobre cada chamada. Adicionar **trigger de defesa** em `customers`: se `is_sandbox=true`, bloquear INSERT em tabelas `deals`, `bot_loop_alerts`, etc. via policy.
- `**runBotFlow` lê/escreve DB** — sandbox customer escreve em `customers` mesmo (necessário pro motor funcionar com estado real). Limpamos a cada reset.
- **Custo IA**: cada run gasta créditos Gemini (já era assim). Toggle "IA real" sai (sempre real).
- **Refator grande**: vou mexer em `whapi-webhook/index.ts` e adicionar guardas em ~10–15 pontos. Testes Deno existentes (`runBotFlow` test, `whapi_test.ts`) garantem que o caminho normal não muda. Adiciono um `simulator_test.ts` com end-to-end usando `SimulatorAdapter`.

## Detalhes técnicos

- Sandbox jid determinístico: `sim-<consultantId>@s.whatsapp.net` — um por consultor.
- `instance_name` sandbox: `igreen-sim-<slug>` (não tenta conectar Whapi de verdade).
- `runBotFlow` recebe `adapter` via parâmetro do ctx (hoje provavelmente é resolvido internamente — vou injetar).
- Foto fake da conta: upload de uma URL pública estática no MinIO de "conta exemplo" — engine baixa, faz OCR de verdade, captura `valor_conta`, `nome_titular`.

## O que NÃO entra

- Reaquecimento via cron (são jobs de tempo — `is_sandbox` os ignora). Se quiser testar follow-up, criamos um botão "Simular passagem de 24h" depois.
- Envio real pelo WhatsApp do consultor (o ponto é justamente não enviar).

## Cronograma

Uma entrega. Posso começar assim que aprovar.  
  
ACRESCENTE PARA EU ENVIAR ARQUIVO NO TESTE DE FLUXO DE MIDIA UM EXEMPLO A FOTO DA ENERGIA OU PDF OU FOTO DO DOCUMENTO, PARA FICAR 100% IGUAL

&nbsp;