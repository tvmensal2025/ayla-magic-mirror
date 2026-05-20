
# Auditoria Pré-Publicação — iGreen Cloud

Levantamento do estado real do projeto hoje, com foco em "está 100% pra liberar para consultores?". Separei em **Bloqueadores**, **Riscos médios**, **Acertos confirmados** e **Plano de hardening** (executável em outro passo, com sua aprovação).

---

## 1. Bloqueadores (resolver ANTES de publicar)

### 1.1 Linter Supabase: 63 issues, 1 ERROR
- **ERROR — Security Definer View**: existe view com `SECURITY DEFINER` exposta na API. Em produção isso permite que qualquer logado bypasse RLS.
- **WARN — RLS Policy Always True (3x)**: 3 políticas com `USING (true)` em UPDATE/DELETE/INSERT. Tabelas precisam ser revisadas — risco de escalonamento entre consultores (multi-tenant!).
- **WARN — Public Bucket Allows Listing (5x)**: 5 buckets públicos com SELECT amplo em `storage.objects`. Permite listar arquivos de outros consultores (contas de energia, documentos!). **Crítico para LGPD.**
- **WARN — SECURITY DEFINER Function executável por anon/authenticated**: funções privilegiadas chamáveis sem auth ou por qualquer logado.
- **INFO — RLS Enabled No Policy**: tabela com RLS mas sem política = ninguém lê, mas indica tabela "morta" ou config esquecida.

### 1.2 Senha vazada (Leaked Password Protection)
- Desabilitado no Auth. Para um produto multi-tenant com consultores, ligar é 1 clique e protege contra reuso de senha comprometida.

### 1.3 Validação manual recomendada
- Confirmar que `customers`, `messages`, `bot_flows`, `templates`, `consultants`, `whatsapp_instances` têm RLS escopada por `consultant_id` (já corrigimos em várias sessões, mas precisa um sweep final).
- Confirmar que os 5 buckets públicos são realmente públicos por design (igreen-public assets/vídeos) e que NÃO incluem `documents`, `contas`, `bills` (PII de cliente).

---

## 2. Riscos Médios (não bloqueia, mas vai dar trabalho depois)

### 2.1 Limpeza de repo
- 70+ arquivos `.md` de status/sessão/troubleshooting na raiz (`RESUMO_*`, `ANALISE_*`, `DEPLOY_*`, `STATUS_*`). Polui o repo e confunde leitura. Mover para `/docs/_arquivo/`.
- Pasta `screenshots/simulacao/` versionada com HTMLs — pode sair do git.

### 2.2 Edge functions (80 deployadas)
- Várias parecem deprecadas (paralelo whapi↔evolution, ad-creative-*, facebook-* experimentais). Confirmar quais o consultor realmente usa hoje e desabilitar/marcar as outras. Cada função ativa = superfície de ataque + custo.
- `whapi-webhook` confirmado ativo. `evolution-webhook` é "espelho futuro" (memory). OK.
- Crons rodando (`bot-stuck-recovery`, `send-scheduled-messages`, `migrate-supabase-to-minio`) — logs limpos no último ciclo. ✅

### 2.3 Modo Captação (gamificação que acabamos de entregar)
- HUD, XP, combo, level-up, boss-fight: implementado.
- Falta validar visualmente no preview real (não há QA visual ainda do bloco completo). Quero rodar um teste rápido com você antes de liberar.

### 2.4 Observabilidade
- Não vi alerta automático para: bot caído >5min, fila WhatsApp travada, OCR/IA falhando em sequência. Hoje só descobrimos quando consultor reclama. Recomendo painel "Saúde" agregando os crons + last_heartbeat.

---

## 3. O que JÁ está bom (confirmado nesta sessão)

- ✅ Pausa do bot respeitada por crons + helper `_shared/bot/paused.ts` + envio manual ignora pausa (corrigido nas últimas mensagens).
- ✅ Multi-variante A/B/C resolvendo `bot_flows` por variant (sem `.maybeSingle()` quebrando).
- ✅ Notificações de novo lead + handoff (`consultants.notification_phone`).
- ✅ Separação `customer_origin` (lead WA vs cliente iGreen).
- ✅ Captação Intel e Bot Health Intel (Gemini) rodando.
- ✅ Compressão de vídeo no `/admin/fluxos` via worker.
- ✅ Storage strategy clara (MinIO estático / Supabase dinâmico).
- ✅ Crons recentes sem erro nos logs.

---

## 4. Plano de hardening proposto (após sua aprovação)

Em ordem de prioridade, cada item é uma migration/PR isolado:

1. **Revisar e corrigir as 3 políticas `USING (true)`** — bloqueador LGPD.
2. **Auditar os 5 buckets públicos** — manter público só os de marketing; mover documentos/contas para bucket privado com signed URLs.
3. **Corrigir Security Definer View** — trocar para `security_invoker=on` ou recriar como função com `SECURITY INVOKER`.
4. **Revogar EXECUTE público em funções `SECURITY DEFINER`** que não devem ser chamáveis por anon/authenticated.
5. **Ligar Leaked Password Protection** no Supabase Auth (1 toggle).
6. **Limpar repo**: mover `.md`s de sessão para `/docs/_arquivo/`, remover `screenshots/simulacao/` do versionamento.
7. **Mapear e desativar edge functions não usadas** (lista a confirmar com você).
8. **QA visual do Modo Captação** no preview (você navegando + eu validando).
9. **Painel Saúde Geral** (opcional v2): semáforo dos 6 crons + última atividade do bot por consultor.

---

## 5. Veredito Go/No-Go

🔴 **Hoje: NÃO-GO para publicar em massa.**
Os itens 1.1 (buckets listáveis + políticas `true`) são incompatíveis com multi-tenant exposto a vários consultores manipulando dados de clientes finais (CPF, conta de energia).

🟢 **Resolvendo 1–5 do plano acima (estimativa: 1 ciclo de migrations + 2h de revisão): GO.**

---

## Quer que eu siga?

Posso começar pelos itens 1 a 5 (os bloqueadores de segurança) em uma única migration com tudo isolado, e logo depois fazer a limpeza do repo. Os itens 6–9 entram numa segunda rodada.

Se quiser, ao invés do plano completo, eu posso só **listar exatamente quais tabelas/buckets/funções estão com problema** primeiro (read-only), pra você decidir o que de fato fica público vs privado antes de eu mexer.
