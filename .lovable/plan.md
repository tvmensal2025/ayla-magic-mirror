## Princípios (não-negociáveis)

1. **Aditivo, nunca destrutivo** — toda correção entra atrás de uma flag ou como camada nova (ex.: wrapper de botão, helper, util). Nada de reescrever componentes que já estão estáveis (`FlowQuickBar`, `paused.ts`, `flowStepResolver` core).
2. **Lotes pequenos com verificação** — cada lote = 1 PR mental, com 1 checagem objetiva (log, console, network ou query) antes de seguir.
3. **Sem mexer no fluxo do bot em produção sem feature flag** — F2/F6/F10 ficam atrás de `app_settings.bot_global_enabled` + flag específica por correção.
4. **RLS antes de UI** — qualquer mudança que toque tabela passa por migration revisada (linter limpo).
5. **Rollback em 1 clique** — toda mudança de comportamento de bot tem kill switch (a flag global `bot_global_enabled` já é o primeiro item).

---

## Fase 0 — Rede de segurança (1h, zero risco)

Antes de tocar em qualquer botão crítico, criar o que permite desligar tudo sem código:

1. **Migration: `app_settings**` com `bot_global_enabled boolean default true` + RLS só leitura para authenticated, escrita só super_admin.
2. **Helper `_shared/bot/global-flag.ts**` lido por: `whapi-webhook`, `evolution-webhook`, todos os crons (`bot-stuck-recovery`, `ai-followup-cron`, `bot-loop-watchdog`, `send-scheduled-messages`). Se `false` → early return sem erro.
3. **Botão no SuperAdmin** "Pausar bot global" (toggle simples) — sem mexer em nada visual existente.

Verificação: virar a flag, mandar uma mensagem ao bot de teste, confirmar silêncio total. Religar.

---

## Fase 1 — Bloqueadores de UI (sem tocar em bot) (2-3h)

Itens isolados ao frontend, risco mínimo.

### B7 — Feedback de progresso no envio multi-parte

- Em `FlowQuickBar` / `SendSequenceDialog`: adicionar estado `{ current, total }` no `confirmSendFull`.
- Botão mostra `Enviando 2/5…` e fica `disabled` até terminar/abortar.
- Não muda a lógica de envio — só observa o loop existente.

### B13 — Confirmação no "Forçar reset conversa"

- Trocar `onClick` direto por `AlertDialog` (componente já existe no projeto) com nome do cliente no corpo.
- Botão destrutivo só habilita após o user digitar "RESETAR" ou clicar 2× no confirm (padrão shadcn).

### B1 — Double-click protection em `sendStep`

- Em `CaptureStepsGrid` o `sending` já é `string | null` mas só bloqueia o passo atual. Trocar para `Set<string>` e adicionar `disabled={sending.has(s.id)}` em cada card, mais `e.currentTarget.disabled = true` defensivo.

### B10 — Confirmação no takeover + undo

- No botão "Assumir": toast com action `Desfazer` (10s) que restaura `bot_paused=false` e `assigned_human_id=null`.

Verificação: testar cada botão no preview, conferir console sem erro, network sem requests duplicados.

---

## Fase 2 — Bloqueador de envio em massa (B8) (1-2h)

Único item desta fase porque mexe num caminho usado por todos os consultores.

- Em `BulkSendPanel`: introduzir helper `sendInChunks(items, chunkSize=5, delayMs=3000, perItemDelay=1500-2500)`.
- **Não substituir** o sender atual — envolvê-lo. Se a flag `bulk_send_v2` (localStorage por enquanto, default ON em dev / OFF em prod até validar) estiver OFF, comportamento antigo.
- UI: barra de progresso `X/Y enviados · Z falhas` + botão Cancelar que dá `break` no loop entre chunks.

Verificação: rodar contra 10 leads de teste, ver no log Evolution que respeitou 5×3s, sem 429.

---

## Fase 3 — Compliance & Rollback (B7-equivalente para legal) (2h)

Bloqueia GO mas não exige refactor.

### 3.6 LGPD

- Adicionar `<CookieBanner />` (componente novo, simples, opt-in para analytics) montado no layout das LPs do consultor.
- Link "Política de Privacidade" no rodapé das LPs apontando para `/politica-privacidade` (página estática nova).

### 3.6 Opt-out "SAIR"

- Em `whapi-webhook/handlers/conversational/index.ts`, **antes** de qualquer roteamento, detectar `messageText.trim().toUpperCase() === "SAIR"` → set `bot_paused=true, bot_paused_reason='opt_out', do_not_contact=true` (coluna nova via migration), responder UMA confirmação, return.
- Migration: adicionar `do_not_contact boolean default false` em `customers` + filtro em todos os crons/bulk send.

### 3.1 Evolution capacity

- Não é código: documentar em `LAUNCH_OPS.md` o requisito (RAM, plano Easypanel). Confirmar com user antes de abrir os 100.

Verificação: mandar "SAIR" em conversa de teste, ver `do_not_contact=true`, conferir que cron não dispara.

---

## Fase 4 — Altos (pós soft-launch de 10 pilotos, 48h)

Só entra **depois** que os 10 pilotos rodaram estáveis. Mantém a opção de adiar sem bloquear o GO.

- **B6** — Abort real em `runFromHere`: checar `abortRef.current` no início de cada iteração do loop e antes de cada `sendPart`.
- **B12** — Confirmar `WITH CHECK` em RLS de `templates` rodando linter + teste UPDATE como consultor não-dono.
- **F2** — Em `flowStepResolver`: quando custom não mapeia, em vez de cair no welcome, logar `console.warn('[resolver] no legacy mapping', stepKey)` e retornar `null` para que o handler mantenha o estado atual.
- **F6** — Estender `recover-stuck-otp` para também cobrir `conversation_step='finalizando'` parado >10min.
- **F10** — Try/catch em download de vídeo variant C; em falha, fallback para variant B no mesmo turno.
- **F12** — Worker novo `minio-quota-check` (cron 15min) → grava em `system_health` → alerta no SuperAdmin >80%.
- **3.1 worker-portal** — escalar para 3 réplicas no Easypanel (operacional, não código).
- **3.5 alertas** — `instance-health-check` cron já existe; adicionar notificação ao `notification_phone` do super_admin quando >5min desconectado ou worker offline.

---

## Ordem de execução proposta

```text
Hoje:        Fase 0 → Fase 1 → Fase 2 → Fase 3        (bloqueadores resolvidos)
Soft launch: 10 consultores piloto por 48h
+48h:        Fase 4 em lotes de 2-3 itens             (altos)
+1 semana:   Médios (B2, B3, B9, B14, F3, F7, F11)
```

## Como garantir "não quebra nada"

- **Cada lote tem 1 verificação obrigatória** antes de seguir (console limpo, network sem 4xx/5xx novos, ou query confirmando estado esperado).
- **Nenhum arquivo `_shared/` é reescrito** — só ganha helpers novos.
- **Nenhuma migration faz `DROP` ou `ALTER` destrutivo** — só `ADD COLUMN ... DEFAULT` e `CREATE TABLE/POLICY`.
- **Flags onde houver dúvida** (`bulk_send_v2`, `bot_global_enabled`) permitem reverter sem deploy.
- **Tudo que toca bot tem o kill switch da Fase 0** como rede de segurança.

## Decisões que preciso de você antes de implementar

1. Posso começar pela **Fase 0 + Fase 1** já? (são as mais seguras e destravam o resto) sim
2. Para o opt-out "SAIR": ok criar a coluna `do_not_contact` em `customers`? Sim
3. Quer que o `CookieBanner` use design igual ao da LP atual (verde glassmorphism) ou mais discreto? Atual