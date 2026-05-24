# 🚀 GUIA DE DEPLOY - WEBHOOK EVOLUTION API

## ⚡ DEPLOY RÁPIDO (5 minutos)

### **Passo 1: Deploy da Edge Function**
```bash
cd supabase
supabase functions deploy evolution-webhook
```

**Resultado esperado:**
```
Deploying evolution-webhook (project ref: seu-projeto)
✓ Deployed evolution-webhook
```

---

### **Passo 2: Criar Instância no Banco**

**Opção A: Via SQL (Supabase Dashboard)**
```sql
-- 1. Buscar ID do consultor
SELECT id, name, igreen_id FROM consultants WHERE email = 'seu-email@exemplo.com';

-- 2. Criar instância
INSERT INTO whatsapp_instances (
  consultant_id,
  instance_name,
  api_url,
  api_key,
  webhook_url,
  status
) VALUES (
  'uuid-do-consultor-aqui',
  'minha-instancia',
  'https://minha-evolution-api.com',
  'minha-api-key-aqui',
  'https://seu-projeto.supabase.co/functions/v1/evolution-webhook',
  'connected'
);

-- 3. Verificar
SELECT * FROM whatsapp_instances WHERE instance_name = 'minha-instancia';
```

**Opção B: Via API (Postman/Insomnia)**
```bash
curl -X POST https://seu-projeto.supabase.co/rest/v1/whatsapp_instances \
  -H "apikey: sua-anon-key" \
  -H "Authorization: Bearer sua-anon-key" \
  -H "Content-Type: application/json" \
  -d '{
    "consultant_id": "uuid-do-consultor",
    "instance_name": "minha-instancia",
    "api_url": "https://minha-evolution-api.com",
    "api_key": "minha-api-key",
    "webhook_url": "https://seu-projeto.supabase.co/functions/v1/evolution-webhook",
    "status": "connected"
  }'
```

---

### **Passo 3: Configurar Webhook na Evolution API**

**Método 1: Via API (Recomendado)**
```bash
curl -X POST https://minha-evolution-api.com/webhook/set/minha-instancia \
  -H "apikey: minha-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-projeto.supabase.co/functions/v1/evolution-webhook",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE"
    ]
  }'
```

**Método 2: Via Painel Evolution (se disponível)**
1. Acesse o painel da Evolution API
2. Vá em "Instâncias" → "minha-instancia" → "Webhook"
3. Configure:
   - **URL:** `https://seu-projeto.supabase.co/functions/v1/evolution-webhook`
   - **Events:** `MESSAGES_UPSERT`, `MESSAGES_UPDATE`
   - **Webhook by events:** `false`
   - **Webhook base64:** `false`

---

### **Passo 4: Testar**

**Teste 1: Enviar mensagem via API**
```bash
curl -X POST https://seu-projeto.supabase.co/functions/v1/evolution-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "instance": "minha-instancia",
    "data": {
      "key": {
        "remoteJid": "5511999998888@s.whatsapp.net",
        "fromMe": false,
        "id": "test-message-id"
      },
      "message": {
        "conversation": "Olá"
      },
      "messageTimestamp": "1234567890"
    }
  }'
```

**Resultado esperado:**
```json
{
  "ok": true
}
```

**Teste 2: Ver logs**
```bash
supabase functions logs evolution-webhook --follow
```

**Resultado esperado:**
```
Evolution webhook received: {"instance":"minha-instancia"...
✅ Instance found: minha-instancia (consultant: Nome do Consultor)
📱 Mensagem de: 5511999998888 | Texto: "Olá" | Botão: null | Arquivo: false
📱 Telefone 5511999998888: criando novo registro.
📝 Salvando updates para uuid-do-cliente: {"conversation_step":"aguardando_conta"}
```

**Teste 3: Enviar mensagem real via WhatsApp**
1. Abra o WhatsApp
2. Envie mensagem para o número da instância
3. Verifique os logs
4. Cliente deve receber boas-vindas

---

## 🔧 CONFIGURAÇÕES ADICIONAIS

### **1. Configurar Settings do Consultor**

**Via SQL:**
```sql
-- Buscar ID do consultor
SELECT id FROM consultants WHERE email = 'seu-email@exemplo.com';

-- Inserir settings
INSERT INTO settings (consultant_id, key, value) VALUES
  ('uuid-do-consultor', 'portal_worker_url', 'https://seu-worker.com'),
  ('uuid-do-consultor', 'worker_secret', 'seu-secret-aqui'),
  ('uuid-do-consultor', 'igreen_consultor_id', '124170'),
  ('uuid-do-consultor', 'nome_representante', 'Seu Nome');

-- Verificar
SELECT * FROM settings WHERE consultant_id = 'uuid-do-consultor';
```

---

### **2. Configurar Variáveis de Ambiente**

**No Supabase Dashboard:**
1. Vá em "Edge Functions" → "Settings"
2. Adicione:
   - `GEMINI_API_KEY` = sua-chave-gemini
   - `PORTAL_WORKER_URL` = https://seu-worker.com (opcional)
   - `WORKER_SECRET` = seu-secret (opcional)

**Via CLI:**
```bash
supabase secrets set GEMINI_API_KEY=sua-chave-gemini
supabase secrets set PORTAL_WORKER_URL=https://seu-worker.com
supabase secrets set WORKER_SECRET=seu-secret
```

---

## 🧪 TESTES COMPLETOS

### **Teste 1: Fluxo Completo (Conta de Energia)**
1. Envie: "Olá"
2. Recebe: Boas-vindas + pede conta
3. Envie: Foto da conta
4. Recebe: OCR + confirmação (botões)
5. Clique: "SIM"
6. Recebe: Pede tipo documento (botões)

### **Teste 2: Edição de Dados**
1. No passo de confirmação, clique: "EDITAR"
2. Recebe: Menu edição (1-6)
3. Envie: "1" (nome)
4. Recebe: Pede nome
5. Envie: "João Silva"
6. Recebe: Confirmação atualizada

### **Teste 3: OCR Documento**
1. Escolha tipo documento: "RG Novo"
2. Envie: Foto frente RG
3. Recebe: Confirmação + pede verso
4. Envie: Foto verso RG
5. Recebe: OCR + confirmação (botões)

### **Teste 4: Perguntas Manuais**
1. Se OCR falhar, recebe: "Qual seu nome?"
2. Envie: "João Silva"
3. Recebe: "Qual seu CPF?"
4. Envie: "12345678901"
5. Continua até finalizar

### **Teste 5: Finalização**
1. Após todos os dados, recebe: Botão "Finalizar"
2. Clique: "Finalizar"
3. Recebe: "Processando cadastro..."
4. Sistema envia ao Portal Worker
5. Recebe: "Aguarde código no WhatsApp"

---

## 🐛 TROUBLESHOOTING

### **Erro: "Instance name required"**
**Causa:** Webhook não está enviando `instance` no body ou header  
**Solução:**
```bash
# Verificar configuração webhook Evolution
curl -X GET https://minha-evolution-api.com/webhook/find/minha-instancia \
  -H "apikey: minha-api-key"

# Reconfigurar se necessário
curl -X POST https://minha-evolution-api.com/webhook/set/minha-instancia \
  -H "apikey: minha-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-projeto.supabase.co/functions/v1/evolution-webhook",
    "webhook_by_events": false
  }'
```

---

### **Erro: "Instance not found"**
**Causa:** Instância não existe no banco  
**Solução:**
```sql
-- Verificar instâncias
SELECT * FROM whatsapp_instances WHERE instance_name = 'minha-instancia';

-- Criar se não existir (ver Passo 2)
```

---

### **Erro: "Failed to create customer"**
**Causa:** Problema com RLS ou campos obrigatórios  
**Solução:**
```sql
-- Verificar RLS
SELECT * FROM pg_policies WHERE tablename = 'customers';

-- Verificar campos obrigatórios
\d customers
```

---

### **Erro: OCR não funciona**
**Causa:** GEMINI_API_KEY não configurada  
**Solução:**
```bash
# Verificar secrets
supabase secrets list

# Adicionar se não existir
supabase secrets set GEMINI_API_KEY=sua-chave-gemini

# Redeploy
supabase functions deploy evolution-webhook
```

---

### **Erro: Portal Worker offline**
**Causa:** Worker não está rodando ou URL incorreta  
**Solução:**
```bash
# Verificar health
curl https://seu-worker.com/health

# Verificar settings
SELECT * FROM settings WHERE key = 'portal_worker_url';

# Atualizar se necessário
UPDATE settings SET value = 'https://seu-worker.com' WHERE key = 'portal_worker_url';
```

---

## 📊 MONITORAMENTO

### **Ver Logs em Tempo Real**
```bash
supabase functions logs evolution-webhook --follow
```

### **Ver Logs de um Cliente Específico**
```sql
-- Buscar cliente
SELECT id, name, phone_whatsapp, conversation_step, status 
FROM customers 
WHERE phone_whatsapp = '5511999998888';

-- Ver conversas
SELECT * FROM conversations 
WHERE customer_id = 'uuid-do-cliente' 
ORDER BY created_at DESC;
```

### **Ver Instâncias Ativas**
```sql
SELECT 
  wi.instance_name,
  wi.status,
  c.name as consultant_name,
  COUNT(cu.id) as total_customers
FROM whatsapp_instances wi
LEFT JOIN consultants c ON c.id = wi.consultant_id
LEFT JOIN customers cu ON cu.whatsapp_instance_id = wi.id
GROUP BY wi.id, c.name;
```

---

## ✅ CHECKLIST DE DEPLOY

- [ ] Deploy edge function
- [ ] Criar instância no banco
- [ ] Configurar webhook Evolution
- [ ] Testar mensagem via API
- [ ] Ver logs
- [ ] Testar mensagem real WhatsApp
- [ ] Configurar settings consultor
- [ ] Configurar variáveis ambiente
- [ ] Testar fluxo completo
- [ ] Testar OCR
- [ ] Testar edição
- [ ] Testar Portal Worker
- [ ] Configurar monitoramento

---

## 🎉 PRONTO!

**Seu webhook Evolution está no ar!**

**Próximos passos:**
1. Testar com clientes reais
2. Monitorar logs
3. Ajustar mensagens se necessário
4. Configurar múltiplas instâncias (1 por consultor)

---

**Versão:** 1.0.0  
**Data:** 12 de abril de 2026  
**Status:** ✅ PRONTO PARA PRODUÇÃO
