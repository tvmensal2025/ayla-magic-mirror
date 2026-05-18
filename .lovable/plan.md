
# Resposta honesta: ainda NÃO está pronto pra escalar pra 100+

## O que o banco mostra agora (últimos 30 dias)

| Métrica | Valor | Leitura |
|---|---|---|
| Fluxos ativos | 13 | OK |
| Steps sem `captures` / `transitions` / `fallback` | 0 / 0 / 0 | OK (depois do `repair_bot_flow` de hoje) |
| Leads novos | 785 | OK |
| Conversões (`status=active`) | **0** | 🚨 nenhum lead virou cliente |
| Handoffs registrados | **1** | 🚨 bot nunca escala — ou está mudo, ou está fingindo que entende |
| Leads em loop detectados pelo lint | 1 (12 msgs no mesmo step) | 🚨 prova que o lint funciona, mas ninguém vê |
| Bot pausado | 1 | OK |

**Diagnóstico:** o motor não trava mais (isso a gente já consertou), mas ele também não **se vigia sozinho**. Em escala, ninguém vai abrir 100 fluxos pra ver se cada consultor está com lead travado. Hoje, depende de você ou da Camila olharem caso a caso — exatamente o que você quer evitar.

---

## O que vou entregar (5 itens, em ordem)

### 1. Auto-handoff por loop em produção (cron)

A função `lint_bot_flow_consistency()` já detecta lead com 5+ mensagens no mesmo step em 24h. Mas só roda quando alguém pergunta.

**O que muda:** novo cron a cada 15 min (`bot-loop-watchdog`) que:
- Roda o lint
- Para cada `possible_loop`: pausa o bot daquele cliente, cria `bot_handoff_alerts` com `reason=auto_loop_detected`, e dispara `notifyHandoff` pro consultor.

Resultado: nenhum lead fica 24h batendo cabeça sem o consultor saber.

### 2. Painel "Saúde do meu bot" pra cada consultor

Página nova `/whatsapp/saude-bot` (ou bloco na home) que mostra, por consultor logado:
- ⚠️ Alertas abertos (handoffs últimos 7d) com nome, telefone, motivo, botão "Assumir conversa"
- 📊 Leads parados há +24h no mesmo step (com link pra abrir)
- 🩹 Status do fluxo: usa `FlowAuditPanel` que já existe + botão "Reparar"
- 📈 Taxa de avanço por passo (quantos leads passaram de cada step) — pra ver onde o bot perde gente

Tudo lido de tabelas que já existem (`bot_handoff_alerts`, `customers`, `bot_step_transitions`).

### 3. Validação no editor de fluxo (`/admin/fluxos`)

Hoje o consultor pode salvar um passo `question` sem nenhuma `transition`. Aí trava. O reparo conserta depois, mas o ideal é não deixar entrar lixo.

**O que muda no editor:**
- Botão "Salvar" desabilitado se algum passo `question`/`media_request`/`capture_*` estiver sem `captures` ou `transitions`.
- Badge vermelho no card do passo com tooltip explicando o que falta.
- Botão "Reparar agora" inline (mesma RPC `repair_bot_flow`) pra resolver com 1 clique.

### 4. Métricas globais (admin)

Em `/admin` (visível só pra super_admin) um cartão "Saúde da plataforma":
- Total de fluxos ativos / quebrados (calculado igual ao FlowAuditPanel)
- Loops detectados nas últimas 24h
- Handoffs sem resposta há +1h
- Top 5 passos onde leads mais param (em todos os 13 consultores)

Permite ver, sem ler código, qual passo da Camila é gargalo e ajustar o template global.

### 5. Documentar contrato `bot_flow_steps` no DOCUMENTATION.md

Hoje a estrutura de `captures`, `transitions`, `fallback`, `step_type` está espalhada em 3978 linhas de `bot-flow.ts`. Pra quem chegar depois (ou IA futura), é caixa-preta.

Vou adicionar seção curta no `DOCUMENTATION.md`:
- Tipos de step válidos e quando usar cada
- Schema esperado de `captures` / `transitions` / `fallback`
- Como o `repair_bot_flow` aplica defaults
- Anti-loop: como o engine decide retry vs handoff

Sem isso, qualquer mudança futura vira tentativa e erro.

---

## O que NÃO faz parte deste plano

- **Conversão zero (0 de 785).** É problema de copy / oferta / Camila, não de engine. Auditar isso é outro escopo (qualidade da IA).
- **Refatorar `bot-flow.ts` (3978 linhas).** Grande demais pra fazer agora sem regressão. Marco como dívida técnica e atacamos quando rolar o sprint de simplificação.
- **Teste automatizado E2E dos 13 fluxos.** Útil, mas eu sugiro deixar pra depois do item 1 e 2 — eles já dão visibilidade suficiente pra detectar regressão em produção.

---

## Detalhes técnicos

**Item 1 — `bot-loop-watchdog`:**
- Nova edge function `supabase/functions/bot-loop-watchdog/index.ts`
- Cron `*/15 * * * *` via `pg_cron` + `net.http_post`
- Lógica: `SELECT * FROM lint_bot_flow_consistency() WHERE category IN ('possible_loop','orphan_flow_step')` → para cada row, `UPDATE customers SET bot_paused=true, bot_paused_reason='auto_loop_detected'` + `INSERT bot_handoff_alerts` + chamar `notify-consultant`.

**Item 2 — painel:**
- Nova rota `/whatsapp/saude-bot` em `src/pages/`
- Componente reutiliza `FlowAuditPanel` já existente em `FluxoCamila.tsx`
- Queries: `bot_handoff_alerts` filtrado por `consultant_id=auth.uid()`, `customers` agrupado por `conversation_step`
- Card de "Assumir conversa" reusa o mesmo modal de conversa já existente no CRM

**Item 3 — validação no editor:**
- `/admin/fluxos` (arquivo atual `src/pages/admin/Fluxos.tsx` ou similar) → adicionar `validateStep(step)` que retorna lista de problemas
- Mostrar badge usando `<Badge variant="destructive">` com tooltip
- Botão "Reparar" chama mesma RPC `repair_bot_flow`

**Item 4 — admin global:**
- `/admin` (Dashboard.tsx ou Home admin) → novo card `<SystemHealthCard />`
- Queries SQL agregadas (uso de `bot_step_transitions` para top steps com mais retries)

**Item 5 — docs:**
- Append em `DOCUMENTATION.md`, seção nova `## Bot Flow Engine — Contrato`

Sem nova tabela. Sem mudança destrutiva. Tudo aditivo.
