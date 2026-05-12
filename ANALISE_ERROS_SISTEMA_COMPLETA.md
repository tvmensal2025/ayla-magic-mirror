# 🔴 ANÁLISE COMPLETA DE ERROS DO SISTEMA

> **Data:** 18 de abril de 2026  
> **Status:** 🔴 9 PROBLEMAS IDENTIFICADOS  
> **Severidade:** 2 Críticos, 3 Altos, 4 Médios

---

## 📊 RESUMO EXECUTIVO

Após análise completa do sistema, foram identificados **9 problemas** que estão causando erros:

| Severidade | Quantidade | Impacto |
|-----------|-----------|---------|
| 🔴 Crítica | 2 | Sistema não funciona |
| 🟠 Alta | 3 | Funcionalidades quebradas |
| 🟡 Média | 4 | Degradação de performance |

---

## 🔴 PROBLEMAS CRÍTICOS (BLOQUEADORES)

### **1. VARIÁVEIS DE AMBIENTE FALTANDO**

**Arquivo:** `.env`

**Problema:** O `.env` atual tem APENAS credenciais Supabase públicas. Faltam variáveis essenciais:

```bash
# ❌ FALTANDO:
SUPABASE_SERVICE_ROLE_KEY=
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
GEMINI_API_KEY=
MINIO_SERVER_URL=
MINIO_ROOT_USER=
MINIO_ROOT_PASSWORD=
MINIO_BUCKET=
WORKER_SECRET=
WORKER_PORTAL_URL=
```

**Impacto:**
- ❌ Edge functions não conseguem fazer upload em MinIO
- ❌ OCR não funciona (sem Gemini API)
- ❌ Evolution API não conecta
- ❌ Worker Portal não autentica requisições

**Solução:** Criar arquivo `.env.local` completo

---

### **2. CONFIGURAÇÃO SUPABASE INCOMPLETA**

**Arquivo:** `supabase/config.toml`

**Problema:** Faltam configurações para a nova function `recover-stuck-otp`

**Atual:**
```toml
[functions.evolution-webhook]
verify_jwt = false

[functions.upload-documents-minio]
verify_jwt = false
```

**Necessário:**
```toml
[functions.recover-stuck-otp]
verify_jwt = false

[functions.evolution-webhook]
verify_jwt = false
memory_mb = 1024
timeout_sec = 60

[functions.upload-documents-minio]
verify_jwt = false
memory_mb = 512
timeout_sec = 30
```

---

## 🟠 PROBLEMAS ALTOS

### **3. DOCKERFILE COM PROBLEMAS**

**Arquivo:** `worker-portal/Dockerfile`

**Problemas:**

1. **Falta `curl` para health check:**
   ```dockerfile
   # ❌ PROBLEMA: curl não está instalado
   HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
     CMD curl -f http://localhost:3100/health || exit 1
   ```

2. **Playwright install sem dependências:**
   ```dockerfile
   # ❌ PROBLEMA: Sem --with-deps
   RUN npx playwright install chromium
   ```

3. **Health check start-period muito curto:**
   - 40s pode ser insuficiente para Playwright instalar

**Solução:**
```dockerfile
# Adicionar curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ... curl ...

# Instalar Playwright com deps
RUN npx playwright install --with-deps chromium

# Aumentar start-period
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1
```

---

### **4. SCRIPTS DE INICIALIZAÇÃO SEM TRATAMENTO DE ERRO**

**Arquivo:** `worker-portal/start.sh`

**Problemas:**
- Sem verificação se Xvfb iniciou com sucesso
- Sem verificação se portas já estão em uso
- Sem timeout para inicialização

**Solução:** Adicionar verificações

---

### **5. MIGRATIONS COM DEPENDÊNCIAS NÃO VERIFICADAS**

**Arquivo:** `supabase/migrations/20260418004119_fbc240d8-586c-4ad0-9db9-71fa6a4136c4.sql`

**Problema:** RLS policy usa função `has_role()` que pode não existir:

```sql
CREATE POLICY "Admins read all phase logs"
ON public.worker_phase_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

**Solução:** Verificar que `has_role()` existe antes de aplicar migration

---

## 🟡 PROBLEMAS MÉDIOS

### **6. OTP FLOW INCOMPLETO**

**Problema:** Se `WORKER_PORTAL_URL` não estiver configurado, Evolution webhook não notifica o Worker:

```typescript
const workerUrl = Deno.env.get("WORKER_PORTAL_URL");
if (workerUrl) {
  await fetchWithTimeout(`${workerUrl}/confirm-otp`, { ... });
}
```

**Impacto:** Worker não sabe que OTP chegou, fica esperando indefinidamente

---

### **7. UPLOAD MINIO SEM FALLBACK**

**Arquivo:** `supabase/functions/upload-documents-minio/index.ts`

**Problema:** Se MinIO estiver offline, retorna erro sem tentar Supabase Storage

**Solução:** Implementar fallback para Supabase Storage

---

### **8. DEDUPLICAÇÃO DE MENSAGENS PODE FALHAR**

**Arquivo:** `supabase/functions/evolution-webhook/index.ts`

**Problema:** Se `messageId` for vazio, todas as mensagens sem ID serão consideradas duplicatas

**Solução:** Validar que `messageId` existe antes de marcar como processado

---

### **9. RATE LIMITING INSUFICIENTE**

**Problema:** Rate limit não persiste entre execuções (cada invocação tem seu próprio Map)

**Solução:** Usar Redis ou banco de dados para persistir rate limits

---

## ✅ CHECKLIST DE CORREÇÕES

### **IMEDIATO (Bloqueador):**
- [ ] Criar `.env.local` com todas as variáveis
- [ ] Adicionar `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Adicionar credenciais Evolution API
- [ ] Adicionar credenciais MinIO
- [ ] Adicionar `GEMINI_API_KEY`
- [ ] Corrigir Dockerfile (curl + playwright --with-deps)
- [ ] Aumentar health check start-period para 60s
- [ ] Atualizar `supabase/config.toml`

### **CURTO PRAZO (1-2 dias):**
- [ ] Validar completude de `server.mjs`
- [ ] Validar completude de `evolution-webhook/index.ts`
- [ ] Testar OTP flow end-to-end
- [ ] Testar upload MinIO com fallback
- [ ] Verificar que `has_role()` existe

### **MÉDIO PRAZO (1 semana):**
- [ ] Implementar fallback Supabase Storage
- [ ] Melhorar rate limiting
- [ ] Adicionar retry logic para Evolution API
- [ ] Implementar circuit breaker
- [ ] Adicionar testes de integração

---

## 🚀 PLANO DE AÇÃO IMEDIATO

### **1. Criar `.env.local` completo**

```bash
# Supabase
SUPABASE_URL=https://zlzasfhcxcznaprrragl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Evolution API
EVOLUTION_API_URL=https://evolution.exemplo.com
EVOLUTION_API_KEY=sua-chave-aqui

# Gemini (OCR)
GEMINI_API_KEY=AIzaSy...

# MinIO
MINIO_SERVER_URL=https://minio.exemplo.com
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=senha-segura
MINIO_BUCKET=igreen

# Worker Portal
WORKER_SECRET=igreen-worker-secret-2024
WORKER_PORTAL_URL=https://portal-worker.d9v83a.easypanel.host

# Whapi (fallback)
WHAPI_TOKEN=seu-token
WHAPI_API_URL=https://gate.whapi.cloud
```

---

### **2. Corrigir Dockerfile**

```dockerfile
# Adicionar curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 curl \
    xvfb x11vnc novnc websockify \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Instalar Playwright com deps
RUN npx playwright install --with-deps chromium

# Health check com start-period maior
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1
```

---

### **3. Atualizar `supabase/config.toml`**

```toml
project_id = "zlzasfhcxcznaprrragl"

[functions.evolution-webhook]
verify_jwt = false
memory_mb = 1024
timeout_sec = 60

[functions.upload-documents-minio]
verify_jwt = false
memory_mb = 512
timeout_sec = 30

[functions.recover-stuck-otp]
verify_jwt = false
memory_mb = 256
timeout_sec = 30
```

---

## 🔍 VERIFICAÇÕES NECESSÁRIAS

### **1. Testar Edge Functions:**
```bash
supabase functions serve
curl -X POST http://localhost:54321/functions/v1/evolution-webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### **2. Validar Migrations:**
```bash
supabase db push --dry-run
```

### **3. Testar Worker Portal:**
```bash
cd worker-portal
npm install
npm start
# Acessar http://localhost:3100/health
```

### **4. Verificar Variáveis:**
```bash
env | grep -E "SUPABASE|EVOLUTION|MINIO|GEMINI|WHAPI"
```

---

## 📝 RESUMO

**Problemas identificados:** 9  
**Bloqueadores:** 2 (variáveis de ambiente + config Supabase)  
**Correções imediatas:** 8 itens  
**Tempo estimado:** 2-3 horas para correções imediatas  

**Próximo passo:** Criar `.env.local` completo e corrigir Dockerfile

---

**Versão:** 1.0.0  
**Data:** 18 de abril de 2026  
**Status:** 🔴 REQUER AÇÃO IMEDIATA
