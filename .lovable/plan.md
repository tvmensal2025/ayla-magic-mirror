## Objetivo

Botão "Rodar bot" na página `/admin/bot-audit` que executa um cenário **end-to-end real**: o webhook é chamado de verdade, o bot processa cada mensagem, mas **nada vai pro WhatsApp** e **nenhum delay de mídia bloqueia** o fluxo. Resultado: roda do welcome até `complete` em segundos, com transcrição completa de cada turno.

## Componentes

### 1. Modo teste no bot (mudanças cirúrgicas no código existente)

**`bot-flow.ts` → `sleepForMedia()`**
- Aceita um flag `isTestMode` lido do contexto do customer.
- Quando ativo: `return` imediato (zero delay).
- Em produção: comportamento atual intacto.

**Detecção de modo teste**
- Customer com flag `metadata->>'test_mode' = 'true'` OU telefone começando com `5500000` (range reservado).
- O flag é setado pelo runner ao criar o customer temporário.

**Outbound mock (Whapi)**
- Ponto único onde o bot chama `whapi-proxy` para enviar texto/áudio/imagem/vídeo.
- Quando `isTestMode`: ao invés de chamar Whapi, grava o "envio" numa tabela nova `bot_test_outbound` (turno, tipo, conteúdo, ts) e retorna sucesso simulado.
- OCR (Google Vision): se em modo teste e a imagem for `data:test/...`, devolve um payload mockado pré-definido (nome, CPF, valor, etc.) — sem chamar Vision real.

### 2. Tabela `bot_test_runs` + `bot_test_outbound`

```text
bot_test_runs(id, started_at, finished_at, status, customer_id, scenario, summary)
bot_test_outbound(id, run_id, turn, kind, content, conversation_step, created_at)
```
RLS: só admin/super_admin lê.

### 3. Edge function `bot-e2e-runner`

POST `/bot-e2e-runner` → body `{ scenario: "happy_path" }`:

1. Cria customer temp (`phone_whatsapp = 550000099XXXX`, `metadata.test_mode = true`, `consultant_id` = consultor demo).
2. Cria `bot_test_runs` row, captura `run_id`.
3. Loop de turnos (max 30, abort se `complete` ou erro):
   - Lê `customers.conversation_step` atual.
   - Decide payload do próximo "input" do usuário pelo step (tabela hardcoded de respostas do "lead simulado":
     - `null/welcome` → texto "oi"
     - `qualificacao` → áudio fake "350"
     - `checkin_pos_video` → "sim"
     - `aguardando_conta` → imagem fake `data:test/conta` (OCR mockado retorna João Silva, R$350, distribuidora X)
     - `confirmando_dados_conta` → "sim, está certo"
     - `coleta_doc` / `ask_tipo_documento` → "rg"
     - `aguardando_doc_*` → imagem fake `data:test/rg` (OCR mockado retorna CPF, RG, nascimento)
     - `editing_*_menu` → "ok"
     - etc. (15-18 entradas cobrindo todo o cadastro)
   - POSTa no `whapi-webhook` o payload Whapi-shaped (`{messages: [...]}`).
   - Aguarda 200ms e relê `customer.conversation_step`.
   - Se mudou → registra turno em `bot_test_outbound`.
   - Se ficou parado 3 turnos seguidos → marca como **stuck**, encerra.
4. Finaliza `bot_test_runs` com status (`completed` / `stuck` / `error`).
5. Retorna o transcript completo + tempos.

### 4. UI — `/admin/bot-audit`

Adiciona seção "Teste end-to-end real":
- Dropdown de cenário: **Happy path** (único por enquanto).
- Botão grande "▶ Rodar bot do início ao fim".
- Enquanto roda: spinner + log ao vivo (polling `bot_test_outbound` via realtime).
- Resultado:
  - Timeline vertical: cada turno com badge (USER/BOT), tipo (texto/áudio/imagem), conteúdo, step antes→depois, latência.
  - Status final: ✅ Completou / ⚠️ Travou em `<step>` / ❌ Erro.
  - Botão "Limpar customer de teste" (apaga registros do teste).

### 5. Limpeza automática
- Função SQL `cleanup_bot_test_data(run_id)` chamada ao final ou via botão UI, deleta:
  - `customers` test
  - `conversations` desse customer
  - `bot_step_transitions`
  - `bot_test_outbound`/`bot_test_runs` mais antigos que 7 dias

## Arquivos

```text
EDIT  supabase/functions/whapi-webhook/handlers/bot-flow.ts   (sleepForMedia + outbound mock + OCR mock)
EDIT  supabase/functions/whapi-webhook/index.ts                (passa isTestMode pro contexto)
NOVO  supabase/functions/bot-e2e-runner/index.ts
NOVO  supabase/migrations/<ts>_bot_test_tables.sql             (2 tabelas + RLS + cleanup fn)
EDIT  src/pages/BotAudit.tsx                                   (nova seção end-to-end)
```

## Riscos & mitigações
- **Customer fantasma sobrando**: cleanup automático + botão manual.
- **Bot travar em loop infinito**: max 30 turnos + detector de "step não mudou em 3 turnos".
- **OCR mock divergir do real**: payload mockado replica exatamente o schema que o Vision retorna hoje.
- **Mídias reais (vídeos do consultor)**: o outbound mock registra que SERIA enviado mas não envia — não busca arquivo no MinIO.
