# 📋 REGRAS COMPLETAS DO PORTAL WORKER - iGreen Energy

> **Documentação completa de todas as regras, automações e comportamentos do Portal Worker**
> 
> **Última atualização:** 12 de abril de 2026

---

## 🎯 OBJETIVO PRINCIPAL

O Portal Worker é um sistema de automação que **SEMPRE abre o navegador** para preencher automaticamente o portal iGreen quando um cliente finaliza o cadastro. Cada usuário é único e recebe seu próprio link personalizado do portal iGreen.

---

## 🔑 REGRA FUNDAMENTAL

### ⚠️ **NUNCA DEIXAR DE ABRIR O NAVEGADOR**

O sistema foi projetado com múltiplas camadas de proteção para **GARANTIR** que o navegador sempre abra quando necessário:

1. **Fila de processamento** - Processa 1 lead por vez, na ordem
2. **Sistema de retry automático** - Até 3 tentativas por lead
3. **Auto-recuperação** - Busca leads pendentes a cada 5 segundos
4. **Mutex real** - Impede execuções paralelas
5. **Cooldown de 5 minutos** - Evita duplicatas

---

## 📊 FLUXO COMPLETO DE AUTOMAÇÃO

### 1️⃣ **ENTRADA DO LEAD NA FILA**

**Quando acontece:**
- Cliente finaliza cadastro no WhatsApp
- Sistema detecta status `data_complete` no banco
- POST `/submit-lead` é chamado

**O que acontece:**
```javascript
// 1. Verifica duplicatas
- Já está na fila? → Ignora
- Está processando agora? → Ignora
- Foi processado recentemente (5 min)? → Ignora

// 2. Verifica tentativas
- Já falhou 3x? → Não adiciona mais
- Menos de 3 tentativas? → Adiciona na fila

// 3. Atualiza banco (AWAIT - garantido)
await supabase.update({
  status: 'portal_submitting',
  updated_at: now
})

// 4. Inicia processamento
processNextInQueue()
```

**Status no banco:** `data_complete` → `portal_submitting`

---

### 2️⃣ **PROCESSAMENTO DO LEAD**

**Mutex de processamento:**
```javascript
// SOLUÇÃO 4: Mutex real
if (isProcessingLock) return;
if (currentJob || queue.length === 0) return;

isProcessingLock = true;
```

**Ordem de execução:**
1. Pega próximo da fila
2. Marca como `processing`
3. Registra atividade: `job_started` - "Automação iniciada - navegador aberto no iGreen"
4. Chama `executarAutomacao(customer_id)`
5. Aguarda resultado

---

### 3️⃣ **AUTOMAÇÃO PLAYWRIGHT**

#### **FASE 1: Validação de Dados**

**Campos obrigatórios:**
```javascript
const camposObrigatorios = {
  name: 'Nome completo',
  cpf: 'CPF',
  email: 'Email',
  phone_whatsapp: 'WhatsApp',
  cep: 'CEP',
  address_street: 'Endereço',
  address_number: 'Número',
  address_city: 'Cidade',
  address_state: 'Estado',
  distribuidora: 'Distribuidora',
  numero_instalacao: 'Número de instalação'
}
```

**Se faltar algum campo:**
- ❌ Lança erro: `"Campos obrigatórios faltando: [lista]"`
- Status → `error`
- Lead vai para retry (até 3x)

---

#### **FASE 2: Abertura do Portal**

**URL do portal:**
```
https://digital.igreenenergy.com.br/?id={CONSULTOR_ID}&sendcontract=true
```

**Cada consultor tem seu ID único:**
- Exemplo: `124170` (configurado em `IGREEN_CONSULTOR_ID`)
- **IMPORTANTE:** Cada associado tem seu próprio link único

**Configuração do navegador:**
```javascript
browser = await chromium.launch({
  headless: process.env.HEADLESS === '1',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

viewport: { width: 1280, height: 900 }
```

---

#### **FASE 3: Preenchimento do Formulário**

**Ordem de preenchimento (24 campos):**

1. **CEP + Valor da conta** (Fase 1)
   - CEP formatado: `12345-678`
   - Valor: `electricity_bill_value` (padrão: 300)
   - Clica: "Calcular"
   - Aguarda: `networkidle` (15s timeout)

2. **Garantir desconto** (Fase 2)
   - Clica: "Garantir meu desconto"
   - Aguarda: `networkidle` (15s timeout)

3. **Dados pessoais** (Fase 3)
   - Nome completo
   - CPF formatado: `123.456.789-00`
   - Data de nascimento (se disponível)
   - WhatsApp formatado: `+55 (11) 98765-4321`
   - Email
   - Confirmar email

4. **Endereço completo**
   - CEP (novamente, para autocomplete)
   - Aguarda 1s para autocomplete
   - Endereço (rua)
   - Número
   - Bairro
   - Cidade
   - Estado (sigla: SP, RJ, etc)
   - Complemento (opcional)

5. **Dados da conta de energia**
   - Distribuidora (ex: "CPFL", "Enel")
   - Número de instalação

**Delays entre campos:**
- 300ms entre campos normais
- 1000ms após CEP (aguarda autocomplete)
- 2000ms antes de verificar OTP

---

#### **FASE 4: OTP (Código de Verificação)**

**Detecção do campo OTP:**
```javascript
const otpInput = page.locator('input[placeholder*="digo"], input[name="otp"]').first();

if (await otpInput.count() > 0) {
  // Campo OTP detectado!
}
```

**Quando OTP é necessário:**
- Portal iGreen solicita verificação
- O código é enviado via WhatsApp pelo canal oficial da iGreen (NÃO é SMS)
- Status → `awaiting_otp`
- Cliente recebe o código no WhatsApp e digita na conversa com o consultor

**Busca do código OTP:**

1. **Memória local** (Map no servidor)
   - TTL: 5 minutos
   - Fonte: POST `/confirm-otp` ou webhook

2. **Supabase** (backup)
   - Campo: `otp_code`
   - Campo: `otp_received_at`

**Polling do OTP:**
```javascript
// Tenta a cada 3 segundos
// Timeout: 180 segundos (3 minutos)
// Feedback a cada 30 segundos

while (Date.now() - inicio < 180000) {
  const response = await fetch(`${PORTAL_WORKER_URL}/otp/${customerId}`);
  if (response.ok && data.code) {
    return data.code; // ✅ Encontrou!
  }
  await delay(3000);
}
```

**Extração automática do OTP via WhatsApp:**

O webhook `/webhook/whapi` extrai OTP automaticamente de mensagens:

```javascript
const padroes = [
  /(?:c[oó]digo|code|otp|token|verifica[cç][aã]o)[^\d]*(\d{4,8})/i,
  /c[oó]digo\s*:?\s*(\d{4,8})/i,
  /^(\d{4,8})$/,
  /\b(\d{4,8})\b/,
];
```

**Exemplo de mensagens reconhecidas:**
- "Seu código: 123456"
- "Código de verificação: 123456"
- "123456"
- "OTP: 123456"

---

#### **FASE 5: Finalização**

**Após preencher tudo:**
1. Clica: "Enviar" ou "Finalizar"
2. Aguarda 4 segundos
3. Tira screenshot final
4. **IMPORTANTE:** Navegador permanece aberto!

**Status final:** `registered_igreen`

**Envio do link para o cliente:**
```javascript
// Envia link da página iGreen via WhatsApp
// Até 3 tentativas com delay de 1.5s
// Cooldown de 15 minutos (não reenvia)

const message = `✅ Cadastro finalizado!

Acesse o link abaixo para continuar pelo celular:
${pageUrl}

Qualquer dúvida, estamos à disposição.`;
```

---

### 4️⃣ **TRATAMENTO DE ERROS E RETRY**

**Sistema de retry automático:**

```javascript
// Contador de tentativas por customer_id
const retryTracker = new Map();

// Máximo: 3 tentativas
if (attempts < 3) {
  // Re-enfileira na FRENTE da fila
  queue.unshift(retryJob);
  console.log(`🔄 Re-enfileirado para retry (${attempts}/3)`);
} else {
  // Após 3 tentativas → automation_failed
  await supabase.update({
    status: 'automation_failed',
    error_message: `Tentativa ${attempts}/3: ${error.message}`
  });
}
```

**Tipos de erro:**

1. **Campos faltando**
   - Erro: `"Campos obrigatórios faltando: [lista]"`
   - Retry: Sim (até 3x)
   - Motivo: Dados podem ter sido atualizados

2. **Timeout no portal**
   - Erro: `"Timeout waiting for selector"`
   - Retry: Sim (até 3x)
   - Motivo: Portal pode estar lento

3. **OTP não recebido**
   - Erro: `"Timeout após X tentativas aguardando OTP"`
   - Retry: Sim (até 3x)
   - Motivo: Cliente pode enviar depois

4. **Erro de rede**
   - Erro: `"Connection refused"`, `"ECONNREFUSED"`
   - Retry: Sim (até 3x)
   - Motivo: Problema temporário

---

### 5️⃣ **AUTO-RECUPERAÇÃO DE LEADS PENDENTES**

**Polling a cada 5 segundos:**

```javascript
setInterval(recuperarLeadsPendentes, 5 * 1000);
```

**Busca 2 tipos de leads:**

1. **`data_complete`** - Dados coletados, aguardando automação
   - Limite: 5 leads por vez
   - Ordem: `updated_at` ASC (mais antigos primeiro)

2. **`portal_submitting` travados** - Nunca abriu (worker crashou)
   - Filtro: `updated_at < 2 minutos atrás`
   - Limite: 3 leads por vez
   - Ordem: `updated_at` ASC

**Proteção contra duplicatas:**
```javascript
// Não adiciona se:
- Já está na fila
- Está processando agora
- Foi processado recentemente (5 min)
- Já falhou 3x
```

---

## 🔒 PROTEÇÕES E GARANTIAS

### **SOLUÇÃO 1: AWAIT no Update do Supabase**

**Antes (fire-and-forget):**
```javascript
supabase.update(...).then(() => {});
// ❌ Não garantia que salvou
```

**Depois (garantido):**
```javascript
await supabase.update(...);
// ✅ Só continua após salvar
```

---

### **SOLUÇÃO 2: Import Estático**

**Problema:** Import dinâmico criava múltiplas instâncias do módulo

**Solução:**
```javascript
// Top-level import (UMA instância)
import { executarAutomacao } from './playwright-automation.mjs';
```

---

### **SOLUÇÃO 3: Cooldown de 5 Minutos**

**Problema:** Lead era re-enfileirado imediatamente após finally

**Solução:**
```javascript
const recentlyProcessed = new Set();

// Marca como processado
recentlyProcessed.add(customerId);

// Remove após 5 minutos
setTimeout(() => recentlyProcessed.delete(customerId), 5 * 60 * 1000);
```

---

### **SOLUÇÃO 4: Mutex Real**

**Problema:** `processNextInQueue` podia rodar em paralelo

**Solução:**
```javascript
let isProcessingLock = false;

async function processNextInQueue() {
  if (isProcessingLock) return; // ✅ Bloqueia
  isProcessingLock = true;
  
  try {
    // ... processamento
  } finally {
    isProcessingLock = false; // ✅ Libera
  }
}
```

---

### **SOLUÇÃO 5: Não Rodar Polling Durante Processamento**

**Problema:** Polling adicionava leads enquanto processava

**Solução:**
```javascript
async function recuperarLeadsPendentes() {
  if (currentJob || isProcessingLock) {
    return; // ✅ Não busca se está processando
  }
  // ...
}
```

---

## 📸 SCREENSHOTS E DIAGNÓSTICO

**Screenshots automáticos:**

1. `fase1-inicio` - Portal carregado
2. `fase2-antes-form` - Antes do formulário
3. `fase3-form-preenchido` - Formulário completo
4. `sucesso-final` - Após finalizar
5. `error-{timestamp}` - Em caso de erro

**Localização:** `./screenshots/`

**Formato:** `{tipo}-{customerId}-{timestamp}.png`

---

## 🌐 ENDPOINTS DA API

### **POST /submit-lead**

**Autenticação:** `Bearer {WORKER_SECRET}`

**Body:**
```json
{
  "customer_id": "uuid",
  "headless": true,
  "stop_before_submit": false
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Lead adicionado na fila (posição 1)",
  "customer_id": "uuid",
  "position": 1,
  "duplicate": false,
  "queue": {
    "processing": null,
    "waiting": 1,
    "totalProcessed": 0
  },
  "timestamp": "2026-04-12T..."
}
```

---

### **POST /clear-queue**

**Autenticação:** `Bearer {WORKER_SECRET}`

**Descrição:** Zera a fila (não cancela job atual)

**Resposta:**
```json
{
  "success": true,
  "message": "Fila zerada (3 lead(s) removido(s))",
  "queueLength": 0,
  "removed": 3,
  "currentJob": "uuid-atual",
  "timestamp": "2026-04-12T..."
}
```

---

### **POST /confirm-otp**

**Autenticação:** `Bearer {WORKER_SECRET}`

**Body:**
```json
{
  "customer_id": "uuid",
  "otp_code": "123456"
}
```

**Validação:**
- Código deve ter 6 dígitos
- Remove caracteres não numéricos

**Armazenamento:**
1. Memória local (TTL: 5 min)
2. Supabase (backup)

---

### **GET /otp/:customer_id**

**Autenticação:** Não requer (usado pelo Playwright)

**Resposta (encontrado):**
```json
{
  "code": "123456",
  "customer_id": "uuid",
  "source": "memory",
  "expiresAt": "2026-04-12T..."
}
```

**Resposta (não encontrado):**
```json
{
  "error": "OTP code not found",
  "customer_id": "uuid",
  "waiting": true
}
```

---

### **POST /webhook/whapi**

**Autenticação:** Não requer (webhook público)

**Descrição:** Recebe mensagens do WhatsApp e extrai OTP automaticamente

**Payload esperado:**
```json
{
  "messages": [{
    "from": "5511987654321@s.whatsapp.net",
    "type": "text",
    "text": { "body": "Seu código: 123456" }
  }]
}
```

**Processamento:**
1. Extrai OTP da mensagem
2. Busca cliente pelo telefone
3. Filtra apenas status: `awaiting_otp` ou `portal_submitting`
4. Salva OTP no Supabase + memória

---

### **GET /queue**

**Autenticação:** Não requer

**Resposta:**
```json
{
  "currentJob": {
    "customer_id": "uuid",
    "startedAt": "2026-04-12T..."
  },
  "queueLength": 2,
  "waiting": [
    {
      "position": 1,
      "customer_id": "uuid-1",
      "addedAt": "2026-04-12T..."
    },
    {
      "position": 2,
      "customer_id": "uuid-2",
      "addedAt": "2026-04-12T..."
    }
  ],
  "stats": {
    "processed": 10,
    "failed": 1,
    "processing": 1,
    "waiting": 2
  }
}
```

---

### **GET /status**

**Autenticação:** Não requer

**Resposta:**
```json
{
  "timestamp": "2026-04-12T...",
  "queue": { /* mesmo que /queue */ },
  "activities": [
    {
      "at": "2026-04-12T...",
      "event": "job_started",
      "customer_id": "uuid",
      "message": "Automação iniciada - navegador aberto no iGreen"
    },
    {
      "at": "2026-04-12T...",
      "event": "job_finished",
      "customer_id": "uuid",
      "message": "Finalizar clicado - página iGreen deixada aberta"
    }
  ],
  "whyItOpens": "O navegador abre quando um lead finaliza no WhatsApp..."
}
```

---

### **GET /dashboard**

**Autenticação:** Não requer

**Descrição:** Página HTML com status visual da fila e últimas atividades

**Acesso:** `http://localhost:3100/dashboard`

---

### **GET /health**

**Autenticação:** Não requer

**Resposta:**
```json
{
  "status": "ok",
  "service": "worker-portal",
  "version": "5.1.0",
  "timestamp": "2026-04-12T...",
  "uptime": 3600,
  "memory": { /* process.memoryUsage() */ },
  "otpCodesInMemory": 2,
  "supabaseConfigured": true,
  "queue": {
    "processed": 10,
    "failed": 1,
    "processing": 1,
    "waiting": 2
  },
  "currentJob": {
    "customer_id": "uuid",
    "startedAt": "2026-04-12T..."
  }
}
```

---

## 🔧 VARIÁVEIS DE AMBIENTE

```bash
# Servidor
PORT=3100
NODE_ENV=production
HEADLESS=1
WORKER_SECRET=igreen-worker-secret-2024

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# iGreen
IGREEN_CONSULTOR_ID=124170

# Whapi (para baixar imagens e enviar link)
WHAPI_TOKEN=xxx
WHAPI_API_URL=https://gate.whapi.cloud
```

---

## 📊 LOGS E ATIVIDADES

**Tipos de eventos registrados:**

1. `lead_received` - Lead adicionado à fila (WhatsApp finalizou cadastro)
2. `job_started` - Automação iniciada - navegador aberto no iGreen
3. `job_finished` - Finalizar clicado - página iGreen deixada aberta
4. `job_failed` - Falha (X/3): {erro}
5. `link_sent` - Link da página iGreen enviado por WhatsApp
6. `link_failed` - Link NÃO enviado: {motivo}
7. `queue_cleared` - Fila zerada pelo usuário

**Limite:** 50 atividades (FIFO)

**Acesso:** GET `/status` ou GET `/dashboard`

---

## 🎯 REGRAS DE NEGÓCIO

### **1. Cada Usuário é Único**

- Cada associado tem seu próprio `IGREEN_CONSULTOR_ID`
- Link do portal: `https://digital.igreenenergy.com.br/?id={ID}&sendcontract=true`
- **NUNCA** usar ID de outro consultor

### **2. Link Personalizado**

Após finalizar, o cliente recebe:
- Link da página iGreen (URL atual do navegador)
- Mensagem via WhatsApp
- Cooldown de 15 minutos (não reenvia)

### **3. Navegador Permanece Aberto**

**IMPORTANTE:** O navegador NÃO é fechado após finalizar!

**Motivo:** Permitir que o operador confira o cadastro

**Como fechar:** Manualmente ou via `pkill chromium`

### **4. Processamento Sequencial**

- **1 lead por vez** (nunca paralelo)
- Fila FIFO (primeiro a entrar, primeiro a sair)
- Retry vai para FRENTE da fila (prioridade)

### **5. Proteção Anti-Duplicata**

Não adiciona na fila se:
- Já está na fila
- Está processando agora
- Foi processado nos últimos 5 minutos
- Já falhou 3 vezes

---

## 🚨 TROUBLESHOOTING

### **Navegador não abre**

**Verificar:**
1. Fila está vazia? → GET `/queue`
2. Tem job processando? → GET `/status`
3. Lead foi processado recentemente? → Aguardar 5 min
4. Lead já falhou 3x? → Verificar `error_message` no banco

**Solução:**
```bash
# Limpar fila e reprocessar
curl -X POST http://localhost:3100/clear-queue \
  -H "Authorization: Bearer {SECRET}"

# Adicionar manualmente
curl -X POST http://localhost:3100/submit-lead \
  -H "Authorization: Bearer {SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"uuid"}'
```

---

### **OTP não é detectado**

**Verificar:**
1. Webhook configurado? → Whapi deve enviar para `/webhook/whapi`
2. Cliente enviou código? → Verificar mensagens no WhatsApp
3. Formato correto? → Deve ter 4-8 dígitos

**Solução manual:**
```bash
curl -X POST http://localhost:3100/confirm-otp \
  -H "Authorization: Bearer {SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"uuid","otp_code":"123456"}'
```

---

### **Campos faltando**

**Erro:** `"Campos obrigatórios faltando: [lista]"`

**Verificar no banco:**
```sql
SELECT 
  name, cpf, email, phone_whatsapp, cep,
  address_street, address_number, address_city, address_state,
  distribuidora, numero_instalacao
FROM customers
WHERE id = 'uuid';
```

**Solução:**
1. Completar dados no banco
2. Reprocessar lead (retry automático ou manual)

---

### **Chromium órfão**

**Sintoma:** Múltiplos processos Chromium rodando

**Solução:**
```bash
# Matar todos os processos Chromium
pkill -9 -f "Google Chrome for Testing"

# Ou via API (na inicialização)
# O servidor já faz isso automaticamente
```

---

## 📈 MONITORAMENTO

### **Dashboard Visual**

**URL:** `http://localhost:3100/dashboard`

**Mostra:**
- Job atual processando
- Fila de espera
- Estatísticas (processados, falhas)
- Últimas 25 atividades

---

### **Status JSON**

**URL:** `http://localhost:3100/status`

**Mostra:**
- Fila completa
- Últimas 30 atividades
- Explicação de por que o navegador abre

---

### **Health Check**

**URL:** `http://localhost:3100/health`

**Mostra:**
- Status do serviço
- Uptime
- Memória
- Configurações
- Fila

---

## 🎉 RESUMO FINAL

### **O Portal Worker SEMPRE abre o navegador quando:**

1. ✅ Cliente finaliza cadastro no WhatsApp
2. ✅ Sistema detecta `data_complete` no banco
3. ✅ Lead é adicionado na fila via POST `/submit-lead`
4. ✅ Polling detecta lead pendente (a cada 5s)
5. ✅ Lead travado em `portal_submitting` (>2 min)

### **Proteções garantem que:**

1. ✅ Apenas 1 navegador por vez (mutex)
2. ✅ Retry automático até 3x
3. ✅ Cooldown de 5 min (anti-duplicata)
4. ✅ Status salvo no banco (AWAIT garantido)
5. ✅ Auto-recuperação de leads pendentes

### **Cada usuário recebe:**

1. ✅ Link único do portal iGreen
2. ✅ Mensagem via WhatsApp
3. ✅ Navegador permanece aberto para conferência

---

## 📞 SUPORTE

**Logs em tempo real:**
```bash
# Ver logs do servidor
docker logs -f container-id --tail 100

# Ver dashboard
open http://localhost:3100/dashboard

# Ver status JSON
curl http://localhost:3100/status
```

**Comandos úteis:**
```bash
# Limpar fila
curl -X POST http://localhost:3100/clear-queue \
  -H "Authorization: Bearer {SECRET}"

# Adicionar lead manualmente
curl -X POST http://localhost:3100/submit-lead \
  -H "Authorization: Bearer {SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"uuid"}'

# Confirmar OTP manualmente
curl -X POST http://localhost:3100/confirm-otp \
  -H "Authorization: Bearer {SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"uuid","otp_code":"123456"}'
```

---

**Versão:** 5.1.0  
**Data:** 12 de abril de 2026  
**Autor:** Sistema iGreen Energy
