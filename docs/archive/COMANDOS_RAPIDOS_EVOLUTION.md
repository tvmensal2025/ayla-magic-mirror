# ⚡ COMANDOS RÁPIDOS - EVOLUTION API

## 🚀 DEPLOY

```bash
# Deploy edge function
cd supabase
supabase functions deploy evolution-webhook

# Ver logs
supabase functions logs evolution-webhook --follow

# Ver logs específicos
supabase functions logs evolution-webhook --tail 100
```

---

## 🗄️ BANCO DE DADOS

### **Instâncias**
```sql
-- Listar todas
SELECT * FROM whatsapp_instances;

-- Criar nova
INSERT INTO whatsapp_instances (
  consultant_id, instance_name, api_url, api_key, webhook_url, status
) VALUES (
  'uuid-consultor', 'minha-instancia', 'https://api.com', 'key', 'https://webhook.com', 'connected'
);

-- Buscar por nome
SELECT * FROM whatsapp_instances WHERE instance_name = 'minha-instancia';

-- Atualizar status
UPDATE whatsapp_instances SET status = 'connected' WHERE instance_name = 'minha-instancia';

-- Deletar
DELETE FROM whatsapp_instances WHERE instance_name = 'minha-instancia';
```

### **Clientes**
```sql
-- Últimos 10
SELECT id, name, phone_whatsapp, conversation_step, status, created_at 
FROM customers 
ORDER BY created_at DESC 
LIMIT 10;

-- Buscar por telefone
SELECT * FROM customers WHERE phone_whatsapp = '5511999998888';

-- Buscar por instância
SELECT c.*, wi.instance_name 
FROM customers c
JOIN whatsapp_instances wi ON wi.id = c.whatsapp_instance_id
WHERE wi.instance_name = 'minha-instancia'
ORDER BY c.created_at DESC;

-- Contar por step
SELECT conversation_step, COUNT(*) as total 
FROM customers 
GROUP BY conversation_step 
ORDER BY total DESC;

-- Resetar cliente (para testar novamente)
UPDATE customers 
SET conversation_step = 'welcome', status = 'pending' 
WHERE phone_whatsapp = '5511999998888';

-- Deletar cliente
DELETE FROM customers WHERE phone_whatsapp = '5511999998888';
```

### **Conversas**
```sql
-- Ver conversas de um cliente
SELECT * FROM conversations 
WHERE customer_id = 'uuid-cliente' 
ORDER BY created_at DESC;

-- Últimas 20 mensagens
SELECT 
  c.name,
  c.phone_whatsapp,
  co.message_direction,
  co.message_text,
  co.conversation_step,
  co.created_at
FROM conversations co
JOIN customers c ON c.id = co.customer_id
ORDER BY co.created_at DESC
LIMIT 20;

-- Contar mensagens por direção
SELECT message_direction, COUNT(*) as total 
FROM conversations 
GROUP BY message_direction;
```

### **Settings**
```sql
-- Listar settings de um consultor
SELECT * FROM settings WHERE consultant_id = 'uuid-consultor';

-- Criar settings
INSERT INTO settings (consultant_id, key, value) VALUES
  ('uuid-consultor', 'portal_worker_url', 'https://worker.com'),
  ('uuid-consultor', 'worker_secret', 'secret'),
  ('uuid-consultor', 'igreen_consultor_id', '124170'),
  ('uuid-consultor', 'nome_representante', 'Nome');

-- Atualizar setting
UPDATE settings 
SET value = 'https://novo-worker.com' 
WHERE consultant_id = 'uuid-consultor' AND key = 'portal_worker_url';

-- Deletar setting
DELETE FROM settings 
WHERE consultant_id = 'uuid-consultor' AND key = 'portal_worker_url';
```

---

## 🔧 EVOLUTION API

### **Webhook**
```bash
# Configurar webhook
curl -X POST https://api.com/webhook/set/minha-instancia \
  -H "apikey: key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.com",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE"]
  }'

# Ver webhook configurado
curl -X GET https://api.com/webhook/find/minha-instancia \
  -H "apikey: key"

# Deletar webhook
curl -X DELETE https://api.com/webhook/delete/minha-instancia \
  -H "apikey: key"
```

### **Instância**
```bash
# Ver status
curl -X GET https://api.com/instance/connectionState/minha-instancia \
  -H "apikey: key"

# Conectar (QR Code)
curl -X GET https://api.com/instance/connect/minha-instancia \
  -H "apikey: key"

# Desconectar
curl -X DELETE https://api.com/instance/logout/minha-instancia \
  -H "apikey: key"

# Deletar instância
curl -X DELETE https://api.com/instance/delete/minha-instancia \
  -H "apikey: key"
```

### **Mensagens**
```bash
# Enviar texto
curl -X POST https://api.com/message/sendText/minha-instancia \
  -H "apikey: key" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999998888",
    "text": "Olá!"
  }'

# Enviar botões
curl -X POST https://api.com/message/sendButtons/minha-instancia \
  -H "apikey: key" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999998888",
    "title": "Escolha",
    "description": "Selecione uma opção",
    "buttons": [
      {"id": "1", "text": "Opção 1"},
      {"id": "2", "text": "Opção 2"}
    ]
  }'

# Enviar imagem
curl -X POST https://api.com/message/sendMedia/minha-instancia \
  -H "apikey: key" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999998888",
    "mediatype": "image",
    "media": "https://exemplo.com/imagem.jpg",
    "caption": "Legenda"
  }'
```

---

## 🧪 TESTES

### **Testar Webhook**
```bash
# Mensagem de texto
curl -X POST https://webhook.com \
  -H "Content-Type: application/json" \
  -d '{
    "instance": "minha-instancia",
    "data": {
      "key": {
        "remoteJid": "5511999998888@s.whatsapp.net",
        "fromMe": false,
        "id": "test-id"
      },
      "message": {
        "conversation": "Olá"
      },
      "messageTimestamp": "1234567890"
    }
  }'

# Botão clicado
curl -X POST https://webhook.com \
  -H "Content-Type: application/json" \
  -d '{
    "instance": "minha-instancia",
    "data": {
      "key": {
        "remoteJid": "5511999998888@s.whatsapp.net",
        "fromMe": false,
        "id": "test-id"
      },
      "message": {
        "buttonsResponseMessage": {
          "selectedButtonId": "sim_conta",
          "selectedDisplayText": "✅ SIM"
        }
      },
      "messageTimestamp": "1234567890"
    }
  }'
```

### **Testar OCR**
```bash
# OCR conta energia
curl -X POST https://seu-projeto.supabase.co/functions/v1/test-ocr-conta \
  -H "Authorization: Bearer sua-service-key" \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://exemplo.com/conta.jpg"
  }'

# OCR documento
curl -X POST https://seu-projeto.supabase.co/functions/v1/test-ocr-documento \
  -H "Authorization: Bearer sua-service-key" \
  -H "Content-Type: application/json" \
  -d '{
    "frente_url": "https://exemplo.com/frente.jpg",
    "verso_url": "https://exemplo.com/verso.jpg",
    "tipo": "RG"
  }'
```

---

## 📊 MONITORAMENTO

### **Logs**
```bash
# Ver logs em tempo real
supabase functions logs evolution-webhook --follow

# Ver últimas 100 linhas
supabase functions logs evolution-webhook --tail 100

# Filtrar por erro
supabase functions logs evolution-webhook | grep "ERROR"

# Filtrar por cliente
supabase functions logs evolution-webhook | grep "customer_id: uuid-cliente"
```

### **Estatísticas**
```sql
-- Total de clientes por instância
SELECT 
  wi.instance_name,
  COUNT(c.id) as total_clientes
FROM whatsapp_instances wi
LEFT JOIN customers c ON c.whatsapp_instance_id = wi.id
GROUP BY wi.instance_name;

-- Clientes por step
SELECT 
  conversation_step,
  COUNT(*) as total
FROM customers
GROUP BY conversation_step
ORDER BY total DESC;

-- Clientes por status
SELECT 
  status,
  COUNT(*) as total
FROM customers
GROUP BY status
ORDER BY total DESC;

-- Mensagens por dia
SELECT 
  DATE(created_at) as dia,
  COUNT(*) as total_mensagens
FROM conversations
GROUP BY DATE(created_at)
ORDER BY dia DESC;

-- Taxa de conversão (complete / total)
SELECT 
  COUNT(CASE WHEN conversation_step = 'complete' THEN 1 END) as completos,
  COUNT(*) as total,
  ROUND(COUNT(CASE WHEN conversation_step = 'complete' THEN 1 END)::numeric / COUNT(*) * 100, 2) as taxa_conversao
FROM customers;
```

---

## 🔐 SECRETS

```bash
# Listar secrets
supabase secrets list

# Adicionar secret
supabase secrets set GEMINI_API_KEY=sua-chave
supabase secrets set PORTAL_WORKER_URL=https://worker.com
supabase secrets set WORKER_SECRET=secret

# Remover secret
supabase secrets unset GEMINI_API_KEY

# Ver secrets (não mostra valores)
supabase secrets list
```

---

## 🛠️ MANUTENÇÃO

### **Limpar Dados de Teste**
```sql
-- Deletar clientes de teste
DELETE FROM customers WHERE phone_whatsapp LIKE '55119999%';

-- Deletar conversas antigas (> 30 dias)
DELETE FROM conversations WHERE created_at < NOW() - INTERVAL '30 days';

-- Resetar clientes incompletos (> 7 dias)
UPDATE customers 
SET conversation_step = 'welcome', status = 'pending' 
WHERE conversation_step != 'complete' 
AND created_at < NOW() - INTERVAL '7 days';
```

### **Backup**
```bash
# Backup banco completo
supabase db dump -f backup.sql

# Backup apenas dados
supabase db dump --data-only -f backup-data.sql

# Restaurar backup
supabase db reset
psql -h db.seu-projeto.supabase.co -U postgres -d postgres -f backup.sql
```

---

## 🚨 TROUBLESHOOTING

### **Webhook não recebe mensagens**
```bash
# 1. Verificar webhook configurado
curl -X GET https://api.com/webhook/find/minha-instancia -H "apikey: key"

# 2. Reconfigurar webhook
curl -X POST https://api.com/webhook/set/minha-instancia \
  -H "apikey: key" \
  -d '{"url": "https://webhook.com", "events": ["MESSAGES_UPSERT"]}'

# 3. Ver logs
supabase functions logs evolution-webhook --follow
```

### **OCR não funciona**
```bash
# 1. Verificar GEMINI_API_KEY
supabase secrets list | grep GEMINI

# 2. Adicionar se não existir
supabase secrets set GEMINI_API_KEY=sua-chave

# 3. Redeploy
supabase functions deploy evolution-webhook
```

### **Portal Worker offline**
```bash
# 1. Verificar health
curl https://worker.com/health

# 2. Verificar settings
SELECT * FROM settings WHERE key = 'portal_worker_url';

# 3. Atualizar se necessário
UPDATE settings SET value = 'https://novo-worker.com' WHERE key = 'portal_worker_url';
```

---

## 📝 ATALHOS ÚTEIS

```bash
# Deploy rápido
alias deploy-evolution="cd supabase && supabase functions deploy evolution-webhook"

# Ver logs
alias logs-evolution="supabase functions logs evolution-webhook --follow"

# Conectar banco
alias db-evolution="psql -h db.seu-projeto.supabase.co -U postgres -d postgres"

# Backup rápido
alias backup-evolution="supabase db dump -f backup-$(date +%Y%m%d).sql"
```

---

**Versão:** 1.0.0  
**Data:** 12 de abril de 2026  
**Status:** ✅ COMPLETO
