## Diagnóstico

Olhei os logs reais (últimos 30 min) + as conversas do lead `5511989000650`. Existem 3 problemas distintos que se misturam e produzem a sensação de "linguagem feia" + "errou no cadastro":

### 1. Mensagens "feias" não vêm da IA — vêm do `bot-stuck-recovery`
A IA (`ai-sales-agent`) está respondendo bem e adulta: *"Certo. E você fala de qual cidade?"*, *"Saquei! Deixa eu te ajudar então..."* — tudo dentro do persona.

Mas o cron antigo `bot-stuck-recovery` está rodando a cada 5 min em paralelo e dispara textos **hardcoded com emoji** que violam o próprio prompt da IA (que proíbe emoji e diminutivo):
- `👋 Oi! Ainda está aí? Vamos continuar de onde paramos: [texto-script]`
- `⏰ Olá! Para finalizarmos seu cadastro com a iGreen, preciso só desta informação: [texto-script]\n_Caso não queira mais continuar, é só ignorar esta mensagem._`

Resultado: o lead recebe uma mensagem polida da Camila e, minutos depois, uma mensagem robótica com emoji e tom de cobrança ("ignorar esta mensagem"). Parece outra pessoa, mal-educada e desorganizada.

### 2. "Errou ao enviar a parte do cadastro"
Nos logs do `bot-stuck-recovery` (00:10 e 00:05), **4 de 4 envios falharam** com:
```
evolution_send_text_failed_final  status:500
{"message":"Connection Closed"}  instance: igreen-0c2711ad4836
```
A instância Evolution caiu/desautenticou. O cron continua tentando reenviar a mesma mensagem de cadastro toda hora, gerando 8s de erro por execução e zero entrega. Nenhum alerta ao operador, nenhum backoff.

### 3. Dois rescues concorrentes
- `bot-stuck-recovery` (a cada 5 min, scripted, com emoji)
- `ai-closer-cron` (a cada 10 min, IA, recém-criado)

Ambos podem mirar o mesmo lead em fases finais e duplicar mensagens.

---

## Plano de correção

### A. Resgate único, 100% via IA (mata a "linguagem feia")
1. Aposentar todo o texto hardcoded de `bot-stuck-recovery`. Em vez de `getReplyForStep + 👋/⏰`, ele passa a chamar `ai-sales-agent` com `mode: "rescue"` e contexto do step (`stuck_step: "ask_email"`, `idle_minutes: 7`).
2. O `ai-sales-agent` já tem persona Camila sem emoji e com regra "não cumprimente de novo se já houve abertura" → o resgate sai natural, varia frase e respeita histórico.
3. Mesclar `ai-closer-cron` dentro do `bot-stuck-recovery` renomeado para `ai-rescue-cron` (única fonte da verdade), com 1 cron a cada 5 min e seleção interna por fase (coleta vs. fechamento vs. portal).

### B. Anti-spam e proteção da instância Evolution
1. Health-check da instância antes de iterar leads daquele consultor. Se `connectionStatus !== "open"`, pular todos os leads do consultor e gravar `error_message: "instance_offline"` no consultor (não no lead) + 1 alerta diário no painel admin.
2. Backoff exponencial por lead em caso de erro Evolution: 5min → 30min → 2h → desistir e marcar `stuck_evolution`.
3. Só conta `rescue_attempts++` quando o `sendText` retorna `true`. Hoje incrementa mesmo em falha em alguns caminhos, esgotando as 3 tentativas sem nunca ter saído mensagem.

### C. Dedup entre crons + cooldown coerente com a IA
1. Lock por lead: tabela leve `rescue_locks(customer_id, locked_until)` ou simples coluna `next_rescue_allowed_at` em `customers`. Qualquer cron respeita.
2. Cooldown mínimo de 30 min entre rescues E pelo menos 10 min após `last_bot_reply_at` da IA (evita pisar em conversa ativa).
3. Não resgatar leads cuja última mensagem do bot foi um botão interativo aguardando clique há <15 min (caso atual do `5511989000650` em `menu_inicial`).

### D. Caminho do cadastro (handoff) com falha visível
1. Quando `ai-sales-agent` chama `request_handoff` ou quando o operador clica "Cadastrar no portal", se o envio Evolution falhar:
   - Não engolir o erro. Retornar `{ ok:false, reason:"instance_closed" }` para o front.
   - Mostrar toast vermelho no painel: "Instância WhatsApp desconectada — reconecte para enviar cadastro".
   - Botão "Reconectar instância" direto no toast.
2. Persistir tentativa em `handoff_attempts` para auditoria.

### E. Painel /admin de IA (já pedido antes — entra junto)
- Custo R$, latência p50/p95, erros por função, taxa de sucesso de rescue, status de cada instância Evolution em tempo real (verde/amarelo/vermelho).

---

## Arquivos afetados

```
supabase/functions/bot-stuck-recovery/index.ts   → reescrito como ai-rescue-cron (chama ai-sales-agent)
supabase/functions/ai-closer-cron/index.ts       → removido (mesclado)
supabase/functions/_shared/evolution-api.ts      → adiciona healthCheck() + backoff
supabase/functions/_shared/conversation-helpers.ts → remove textos de rescue hardcoded
supabase/functions/ai-sales-agent/index.ts       → reforça mode:"rescue" para usar contexto do step
src/pages/Admin.tsx (novo) ou src/pages/admin/AIHealth.tsx → painel
supabase/migrations/...                          → next_rescue_allowed_at + handoff_attempts + cron único
```

## Validação

1. Curl em `ai-rescue-cron` com instância offline → deve pular tudo e logar `instance_offline`, zero `Connection Closed`.
2. Curl com instância online + lead idle 10min em `ask_email` → deve gerar 1 mensagem via Camila, sem emoji, sem repetir cumprimento, registrada em `conversations` e `ai_usage_log`.
3. Forçar handoff com instância offline → painel mostra toast vermelho com botão reconectar.
4. Verificar em `ai_usage_log` que só `ai-rescue-cron` aparece (não mais 2 crons).

## Pergunta antes de implementar

O painel `/admin` deve ser visível só para super-admin (Rafael) ou também para cada consultor ver as métricas da própria instância?
