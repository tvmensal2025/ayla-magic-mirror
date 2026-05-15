## Objetivo

Adicionar testes end-to-end **reais** do bot no `/admin/bot-audit`: o sistema vai disparar mensagens fictícias (mas com payload real do Whapi) contra o `whapi-webhook` em modo de teste, percorrer o fluxo completo (boas-vindas → nome → conta → vídeo → dúvidas → cadastro → conta de luz → documento → endereço → finalização) e mostrar a transcrição passo a passo. Sem custo de WhatsApp, sem 90s de delay de mídia, OCR mockado.

A infra do backend já está no ar (migration `bot_test_runs` + `bot_test_outbound`, função `bot-e2e-runner`, `_shared/test-mode.ts`, mocks no `whapi-webhook` e `bot-flow.ts`). Falta UI + cenários adicionais + endurecer o runner para validar de verdade.

## O que será feito

### 1. UI — nova seção "Teste end-to-end real" em `src/pages/BotAudit.tsx`

Card novo abaixo dos dois existentes, com:

- Dropdown de **cenário**:
  - `happy_path` — lead colaborativo, completa o cadastro inteiro
  - `lead_indeciso` — pede preço duas vezes, faz dúvidas, depois aceita
  - `valor_baixo` — conta abaixo do mínimo (<R$ 100), bot deve descartar educadamente
  - `lead_some` — para de responder no meio (valida detector de "stuck")
  - `documento_cnh` — escolhe CNH em vez de RG no cadastro
- Botão **"▶ Rodar bot do início ao fim"**
- Enquanto roda: spinner + contador de turnos ao vivo (polling `bot_test_outbound` por `run_id` a cada 1s)
- Timeline vertical com badges **USER** (azul) / **BOT** (verde) / **SYSTEM** (cinza), mostrando: tipo (texto/áudio/imagem), conteúdo (truncado a 200 chars), step antes → depois, latência em ms
- Resumo final: status (`completed` / `stuck` / `max_turns` / `error`), nº de turnos, último step, tempo total
- Botão **"🗑 Limpar dados deste teste"** que chama `cleanup_bot_test_data(run_id)` (já existe no DB)
- Lista das últimas 5 runs (`bot_test_runs`) com status colorido e ação de re-abrir/limpar

### 2. Cenários no `bot-e2e-runner`

Refatorar `nextReplyForStep()` para receber também o nome do cenário e variar as respostas:

```ts
function nextReply(scenario: string, step: string|null, turn: number): Reply
```

- `happy_path`: comportamento atual
- `lead_indeciso`: nos steps `checkin_pos_video` e `duvidas_pos_club`, primeiro responde "tenho dúvida, é seguro?"; só na 2ª passada confirma
- `valor_baixo`: no `qualificacao` envia áudio com transcript "minha conta é uns 60 reais"
- `lead_some`: depois do turno 4, devolve `null` para o runner registrar "lead silencioso" e parar
- `documento_cnh`: no `ask_tipo_documento` responde "cnh"

### 3. Validações automáticas pós-run

No final de cada run, o runner roda checagens e grava em `bot_test_runs.summary`:

- ✅ todas as transições têm `from_step ≠ to_step` (não ficou parado)
- ✅ nenhum `bot_test_outbound.kind === 'fetch_error'`
- ✅ nenhuma resposta do bot contém placeholders não substituídos (`{{nome}}`, `{{valor_conta}}`, etc.)
- ✅ no cenário `happy_path`, `customer.status` final ∈ {`pending_review`, `approved`, `active`}
- ✅ no `valor_baixo`, último step contém `descarte` ou `bot_paused = true`

A UI mostra cada checagem com ✓/✗ ao lado do resumo.

### 4. Pequenos ajustes técnicos

- `bot-e2e-runner` hoje usa `superadmin_consultant_id` de `settings`. Adicionar fallback: se ausente, pega o consultor do usuário logado (`consultants.user_id = auth.uid()`).
- O runner já trata `lead_some` parando o loop quando `nextReply` devolve null.
- Botão "Limpar customer de teste" em massa: `cleanup_bot_test_data` para todas as runs >24h em um clique (admin).

## Arquivos

- `src/pages/BotAudit.tsx` — nova seção + polling + timeline
- `supabase/functions/bot-e2e-runner/index.ts` — cenários + validações + fallback de consultor

Sem migrations novas. Sem mudanças no fluxo de produção do bot.

## Riscos

- **Customer fantasma**: range `5500000xxx` é reservado e o botão de limpeza apaga tudo. Garbage collection de runs >7 dias já no `cleanup_bot_test_data`.
- **OCR mockado pode divergir do real**: o mock devolve exatamente o schema atual do Google Vision (`distribuidora`, `numero_instalacao`, `valor`); se o schema mudar no Vision, o mock precisa ser atualizado junto.
- **Loop infinito**: limite de 25 turnos + detector de "stuck" (3 turnos sem mudança de step) já implementados.

Depois que você aprovar, implemento direto.