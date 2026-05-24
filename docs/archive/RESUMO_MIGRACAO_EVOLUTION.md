# 📋 RESUMO EXECUTIVO - Migração Whapi → Evolution API

## 🎯 OBJETIVO

Migrar o bot WhatsApp do `whapi-analysis/` (Whapi centralizado) para usar **Evolution API com instâncias individuais por consultor**.

---

## ✅ O QUE JÁ ESTÁ PRONTO (whapi-analysis/)

1. **Bot Conversacional Completo** ✅
   - 30+ steps na máquina de estados
   - OCR automático (Gemini) para conta de energia e documentos
   - Validação de CPF, RG, CEP
   - Edição de dados via botões
   - Coleta de documentos (frente/verso)

2. **Todos os Botões** ✅
   - Confirmação conta: SIM / NÃO / EDITAR
   - Tipo documento: RG Novo / RG Antigo / CNH
   - Confirmação documento: SIM / NÃO / EDITAR
   - Confirmar telefone: Sim / Editar / Cancelar
   - Finalizar: Finalizar

3. **Portal Worker** ✅
   - Automação Playwright
   - Sistema de fila
   - OTP automático
   - Upload de documentos

4. **Edge Functions** ✅
   - `whatsapp-webhook` - Processa mensagens
   - `worker-callback` - Callbacks do worker
   - `submit-otp` - Envia OTP
   - OCR functions

---

## 🔄 O QUE PRECISA MUDAR

### **1. WEBHOOK**

**Antes (Whapi):**
```typescript
// 1 webhook para todos
POST /functions/v1/whatsapp-webhook

// Payload
{
  "messages": [{
    "chat_id": "5511999998888@s.whatsapp.net",
    "text": { "body": "Olá" },
    "button_response": { "id": "sim_conta" }
  }]
}
```

**Depois (Evolution):**
```typescript
// 1 webhook por instância
POST /functions/v1/evolution-webhook

// Payload
{
  "instance": "consultor-uuid",
  "data": {
    "key": { "remoteJid": "5511999998888@s.whatsapp.net" },
    "message": {
      "conversation": "Olá",
      "buttonsResponseMessage": { "selectedButtonId": "sim_conta" }
    }
  }
}
```

### **2. ENVIO DE MENSAGENS**

**Antes (Whapi):**
```typescript
// Texto
POST https://gate.whapi.cloud/messages/text
{ "to": chatId, "body": text }

// Botões
POST https://gate.whapi.cloud/messages/interactive
{
  "to": chatId,
  "type": "button",
  "body": { "text": message },
  "action": { "buttons": [...] }
}
```

**Depois (Evolution):**
```typescript
// Texto
POST ${evolutionUrl}/message/sendText/${instanceName}
{ "number": remoteJid, "text": text }

// Botões
POST ${evolutionUrl}/message/sendButtons/${instanceName}
{
  "number": remoteJid,
  "title": "Escolha",
  "description": message,
  "buttons": [{ "buttonId": "sim_conta", "buttonText": { "displayText": "✅ SIM" } }]
}
```

### **3. ESTRUTURA DE DADOS**

**Nova tabela:**
```sql
CREATE TABLE whatsapp_instances (
  id UUID PRIMARY KEY,
  consultant_id UUID REFERENCES consultants(id),
  instance_name TEXT UNIQUE,
  phone_number TEXT,
  api_url TEXT,
  api_key TEXT,
  status TEXT, -- disconnected, connecting, connected
  qr_code TEXT,
  created_at TIMESTAMPTZ
);
```

**Atualizar customers:**
```sql
ALTER TABLE customers 
ADD COLUMN whatsapp_instance_id UUID REFERENCES whatsapp_instances(id);
```

---

## 📝 CHECKLIST DE IMPLEMENTAÇÃO

### **FASE 1: BANCO DE DADOS** (1 dia)
- [ ] Criar tabela `whatsapp_instances`
- [ ] Adicionar campo `whatsapp_instance_id` em `customers`
- [ ] Criar RLS policies
- [ ] Criar índices

### **FASE 2: EDGE FUNCTIONS** (3 dias)
- [ ] Criar `evolution-webhook` (copiar de `whatsapp-webhook`)
- [ ] Criar `evolution-instance-manager`
- [ ] Criar `_shared/evolution-api.ts`
- [ ] Adaptar parsing de mensagens
- [ ] Adaptar envio de mensagens
- [ ] Adaptar download de mídia

### **FASE 3: FRONTEND** (2 dias)
- [ ] Página de gerenciamento de instâncias
- [ ] QR Code scanner
- [ ] Status de conexão
- [ ] Botão "Conectar WhatsApp"

### **FASE 4: TESTES** (2 dias)
- [ ] Testar criação de instância
- [ ] Testar conexão via QR Code
- [ ] Testar fluxo completo do bot
- [ ] Testar todos os botões
- [ ] Testar OCR
- [ ] Testar Portal Worker

### **FASE 5: MIGRAÇÃO** (1 dia)
- [ ] Migrar consultores existentes
- [ ] Criar instâncias para cada um
- [ ] Testar em produção
- [ ] Desativar Whapi

**TOTAL: ~9 dias de trabalho**

---

## 🎨 FLUXO VISUAL

```
┌─────────────────┐
│   Cliente WA    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  Evolution API (Individual) │
│  - consultor-ana-giulia     │
│  - consultor-joao-silva     │
│  - consultor-maria-santos   │
└────────┬────────────────────┘
         │ webhook
         ▼
┌─────────────────────────────┐
│  evolution-webhook          │
│  (Edge Function)            │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Máquina de Estados         │
│  (30+ steps - IGUAL)        │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  OCR Gemini (IGUAL)         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Portal Worker (IGUAL)      │
└─────────────────────────────┘
```

---

## 🔑 PONTOS CRÍTICOS

### **1. Parsing de Mensagens**
```typescript
// Whapi
const text = msg.text?.body;
const buttonId = msg.button_response?.id;

// Evolution
const text = message.conversation || message.extendedTextMessage?.text;
const buttonId = message.buttonsResponseMessage?.selectedButtonId;
```

### **2. Identificação de Instância**
```typescript
// Buscar instância pelo nome
const instance = body.instance || req.headers.get("x-instance-name");

const { data: instanceData } = await supabase
  .from("whatsapp_instances")
  .select("*, consultants(*)")
  .eq("instance_name", instance)
  .single();
```

### **3. Envio de Botões**
```typescript
// Evolution usa estrutura diferente
{
  "buttons": [{
    "buttonId": "sim_conta",
    "buttonText": { "displayText": "✅ SIM" }
  }]
}
```

---

## 📊 COMPARAÇÃO

| Aspecto | Whapi | Evolution |
|---------|-------|-----------|
| **Instâncias** | 1 centralizada | N individuais |
| **Webhook** | 1 único | 1 por instância |
| **Token** | 1 global | 1 por instância |
| **Custo** | Pago | Gratuito (self-hosted) |
| **Controle** | Limitado | Total |
| **Escalabilidade** | Limitada | Ilimitada |

---

## 🚀 PRÓXIMOS PASSOS

1. **Ler documentação completa:** `MIGRACAO_WHAPI_PARA_EVOLUTION.md`
2. **Criar tabelas no banco**
3. **Implementar `evolution-webhook`**
4. **Testar com 1 consultor**
5. **Migrar todos os consultores**

---

## 📚 ARQUIVOS IMPORTANTES

```
MIGRACAO_WHAPI_PARA_EVOLUTION.md  ← Documentação completa
RESUMO_MIGRACAO_EVOLUTION.md      ← Este arquivo
whapi-analysis/                    ← Sistema original (Whapi)
  ├── supabase/functions/
  │   ├── whatsapp-webhook/        ← Copiar lógica daqui
  │   ├── _shared/
  │   │   ├── conversation-helpers.ts  ← Manter igual
  │   │   ├── validators.ts            ← Manter igual
  │   │   ├── ocr.ts                   ← Adaptar download
  │   │   └── whatsapp-api.ts          ← Substituir por evolution-api.ts
```

---

**Versão:** 1.0.0  
**Data:** 12 de abril de 2026  
**Status:** Pronto para implementação ✅
