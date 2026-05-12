# Evolution Webhook

Edge Function que recebe mensagens da Evolution API e processa o bot WhatsApp.

## 🎯 Diferenças do Whapi Webhook

### **Whapi (antigo)**
- 1 instância centralizada
- 1 webhook para todos
- Token único

### **Evolution (novo)**
- N instâncias (1 por consultor)
- 1 webhook por instância
- Token por instância

## 📋 Estrutura

```
evolution-webhook/
├── index.ts          ← Webhook principal
└── README.md         ← Este arquivo
```

## 🔧 Configuração

### **1. Criar Instância no Banco**

```sql
INSERT INTO whatsapp_instances (
  consultant_id,
  instance_name,
  api_url,
  api_key,
  webhook_url,
  status
) VALUES (
  'uuid-do-consultor',
  'consultor-ana-giulia',
  'https://evolution-api.com',
  'sua-api-key',
  'https://seu-projeto.supabase.co/functions/v1/evolution-webhook',
  'disconnected'
);
```

### **2. Configurar Webhook na Evolution API**

```bash
curl -X POST https://evolution-api.com/webhook/set/consultor-ana-giulia \
  -H "apikey: sua-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-projeto.supabase.co/functions/v1/evolution-webhook",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "CONNECTION_UPDATE"
    ]
  }'
```

## 📨 Payload Recebido

```json
{
  "instance": "consultor-ana-giulia",
  "data": {
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "msg-id"
    },
    "message": {
      "conversation": "Olá",
      "imageMessage": {
        "url": "https://...",
        "mimetype": "image/jpeg"
      },
      "buttonsResponseMessage": {
        "selectedButtonId": "sim_conta"
      }
    }
  }
}
```

## 🔄 Fluxo

```
1. Evolution API envia webhook
   ↓
2. Identifica instância (body.instance)
   ↓
3. Busca instância no banco (whatsapp_instances)
   ↓
4. Parse mensagem (parseEvolutionMessage)
   ↓
5. Busca/cria cliente (customers)
   ↓
6. Processa máquina de estados (switch step)
   ↓
7. Salva updates no banco
   ↓
8. Envia resposta via Evolution API
   ↓
9. Log em conversations
```

## 🎨 Máquina de Estados

**Igual ao whapi-webhook:**

```
welcome → aguardando_conta → processando_ocr_conta → 
confirmando_dados_conta → ask_tipo_documento → 
aguardando_doc_frente → aguardando_doc_verso → 
confirmando_dados_doc → ask_name → ask_cpf → 
ask_rg → ask_birth_date → ask_phone_confirm → 
ask_phone → ask_email → ask_cep → ask_number → 
ask_complement → ask_installation_number → 
ask_bill_value → ask_finalizar → finalizando → 
portal_submitting → aguardando_otp → 
validando_otp → aguardando_assinatura → complete
```

## 🔑 Variáveis de Ambiente

```bash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
GEMINI_API_KEY=sua-gemini-api-key
```

## 🧪 Testar

```bash
# 1. Deploy
supabase functions deploy evolution-webhook

# 2. Enviar mensagem de teste
curl -X POST https://seu-projeto.supabase.co/functions/v1/evolution-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "instance": "consultor-ana-giulia",
    "data": {
      "key": {
        "remoteJid": "5511999998888@s.whatsapp.net",
        "fromMe": false
      },
      "message": {
        "conversation": "Olá"
      }
    }
  }'
```

## 📊 Logs

```bash
# Ver logs em tempo real
supabase functions logs evolution-webhook --follow

# Ver últimos 100 logs
supabase functions logs evolution-webhook --limit 100
```

## ⚠️ Troubleshooting

### **Erro: Instance not found**
- Verificar se instância existe no banco
- Verificar se `instance_name` está correto

### **Erro: Failed to send message**
- Verificar se `api_url` e `api_key` estão corretos
- Verificar se instância está conectada (status = 'connected')

### **Mensagem não processada**
- Verificar logs: `supabase functions logs evolution-webhook`
- Verificar se webhook está configurado na Evolution API
- Verificar se payload está no formato correto

## 🔗 Links Úteis

- [Evolution API Docs](https://doc.evolution-api.com)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Documentação Completa](../../../MIGRACAO_WHAPI_PARA_EVOLUTION.md)
