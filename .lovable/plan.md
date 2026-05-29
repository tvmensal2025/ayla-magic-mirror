# Análise do fluxo do lead 5511971254913 (BRUNO MANOEL DOS SANTOS)

## O que realmente aconteceu (cronologia real do banco)

```text
20:27:50  Lead manda "Oi" → d_welcome
20:28:00  "Quero simular" → pede conta de luz
20:28:18  Foto da conta enviada
20:28:36  Confirma dados da conta → d_resultado
20:28:57  "Cadastrar agora"
20:29:00  Pede documento (RG/CNH)
20:29:26  Foto do documento enviada
20:29:47  Confirma dados do doc
20:29:55  Confirma titularidade (mesma pessoa)
20:30:06  Confirma telefone
20:30:11  Pede email
20:30:25  Manda email do consultor (rejeitado)
20:30:38  Sistema reclama "email do consultor não pode"
20:31:10  Manda email correto
20:31:18  → finalize-capture disparado
          → status = portal_submitting
          → tenta worker-portal-2 (autoconexao)
          → health check FALHA
          → status = worker_offline
          → envia "⏳ Estamos com um pequeno atraso…"
```

## Estado atual no banco

```text
status              = worker_offline
conversation_step   = portal_submitting
otp_code            = NULL          ← nunca chegou
link_assinatura     = NULL          ← nunca foi enviado
igreen_code         = NULL
error_message       = "Worker (autoconexao) offline no momento do envio — polling vai pegar"
```

Ou seja: **o portal nunca recebeu o lead, OTP nunca foi gerado e link de assinatura nunca foi enviado**. A percepção de que "recebeu OTP e mandou link" não bate com os dados — provavelmente é memória de outro lead/fluxo.

## Causa raiz

O consultor **Rafael Ferreira** (id `0c2711ad…`, igreen_id 124170) está com `portal_kind = autoconexao`, então o dispatcher roteia para o `worker-portal-2`.

A URL configurada em `settings.portal2_worker_url` é:

```text
http://igreen_portal-worker-2:3101
```

Isso é o **hostname interno do Docker Compose da VPS**. Edge Functions do Supabase rodam no Deno Deploy (cloud), **não enxergam essa rede**. Resultado: o `fetch(${url}/health)` sempre falha com DNS/timeout → marca `worker_offline` → envia mensagem de "atraso" → fim.

Comprovação no `_shared/portal-worker.ts`:

```text
http://igreen_portal-worker-2:3101  ← Docker DNS, inalcançável
https://srv1580107.hstgr.cloud      ← Portal 1 (digital), público, funciona
```

Além disso, o comentário "polling vai pegar" no código é falso — **não existe nenhuma edge function/cron que faz polling de leads em `worker_offline**` para reenviar quando o worker voltar. O lead fica permanentemente parado.

## Por que o cliente ficou em silêncio após o "atraso"

1. Sem submit ao portal → sem OTP → fluxo trava em `portal_submitting`.
2. `bot_paused_reason = 'humano_assumiu_audio'` faz o bot ignorar qualquer nova mensagem desse lead (regra `human-takeover-silence`).
3. Não há retry automático.

## Plano de correção

### 1. Expor o worker-portal-2 publicamente

Configurar em `settings.portal2_worker_url` a URL pública HTTPS do worker-2 (ex.: `https://portal2.srv1580107.hstgr.cloud` ou subdomínio equivalente, com Bearer secret já existente). Precisa do usuário confirmar/fornecer a URL pública — sem isso o Edge Function nunca chega lá.

### 2. Reprocessar este lead manualmente

Após a URL ser corrigida, rodar:

```text
UPDATE customers
   SET status='ready_to_submit', error_message=NULL
 WHERE id='482c0262-e5e0-4716-82f1-f3f4528b2e79';
```

e invocar `finalize-capture` de novo (botão "Tentar novamente" já existe no `PortalStatusTracker`).

### 3. Criar cron de retry para `worker_offline`

Nova edge function `portal-offline-retry` (agendada 1×/min) que:

- busca `customers` com `status='worker_offline'` e `finalized_at` nos últimos 24 h;
- chama `dispatchPortalWorker` novamente;
- limita a N tentativas (campo novo `portal_retry_count`) e marca `automation_failed` se exceder.

### 4. Health-check melhor no dispatch

- Aumentar timeout do `/health` de 5 s para 10 s.
- Logar o motivo exato da falha (DNS vs 5xx vs timeout) em `error_message` pra diagnóstico futuro.
- Trocar a mensagem ao cliente para algo honesto ("Recebemos seus dados — em até 5 min mandamos o código") só quando `mode === "queued_offline"`.

### 5. Validar pareamento consultor ↔ worker

Adicionar checagem na criação/edição de consultor: se `portal_kind='autoconexao'` então `settings.portal2_worker_url` precisa estar setada e responder `/health`. Bloquear salvar caso contrário (admin UI).

## Detalhes técnicos

- Arquivos envolvidos: `supabase/functions/_shared/portal-worker.ts`, `supabase/functions/finalize-capture/index.ts`, `src/components/captacao/PortalStatusTracker.tsx`.
- Nova função: `supabase/functions/portal-offline-retry/index.ts` + entrada em `supabase/config.toml` schedule.
- Migration: adicionar coluna `portal_retry_count int default 0` em `customers`.

## Pergunta pro usuário antes de implementar

Você tem (ou consegue gerar) uma **URL pública HTTPS para o `worker-portal-2**` na VPS? Sem isso o passo 1 não anda e o resto vira paliativo.  
  
[https://igreen-portal-worker-2.d9v63q.easypanel.host/](https://igreen-portal-worker-2.d9v63q.easypanel.host/)   
  


```dotenv
PORT=3101
NODE_ENV=production
HEADLESS=1

WORKER_SECRET=b77ac5db653b3e500d8ce45ed4a1c40de31476dba616a51b016ddcf86c2cab36

SUPABASE_URL=https://zlzasfhcxcznaprrragl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsemFzZmhjeGN6bmFwcnJyYWdsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTI3NDU3MCwiZXhwIjoyMDg2ODUwNTcwfQ.m82Darbn5pFX1ktXSZPSS_BPAIlA4xN9oj8nLdT1xng

REDIS_URL=redis://default:2a84f63f8924fb99b904@igreen_evolution-api-redis:6379
```