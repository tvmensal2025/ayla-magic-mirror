# 🔄 MIGRAÇÃO COMPLETA: Whapi → Evolution API (Individual por Usuário)

> **Objetivo:** Migrar o bot WhatsApp do sistema whapi-analysis (que usa Whapi centralizado) para usar Evolution API com instâncias individuais por consultor.

---

## 📋 ÍNDICE

1. [Diferenças Principais](#1-diferenças-principais)
2. [Fluxo Completo do Bot (Whapi)](#2-fluxo-completo-do-bot-whapi)
3. [Todos os Botões e Mensagens](#3-todos-os-botões-e-mensagens)
4. [Adaptações para Evolution API](#4-adaptações-para-evolution-api)
5. [Estrutura de Tabelas](#5-estrutura-de-tabelas)
6. [Edge Functions a Migrar](#6-edge-functions-a-migrar)
7. [Checklist de Implementação](#7-checklist-de-implementação)

---

## 1. DIFERENÇAS PRINCIPAIS

### **Whapi (Sistema Atual)**
```
✅ 1 instância WhatsApp centralizada
✅ 1 número para todos os consultores
✅ Webhook único: /functions/v1/whatsapp-webhook
✅ Token único: WHAPI_TOKEN
✅ API: https://gate.whapi.cloud
```

### **Evolution API (Sistema Novo)**
```
✅ 1 instância por consultor (individual)
✅ 1 número por consultor
✅ Webhook por instância: /functions/v1/evolution-webhook
✅ Token por instância: armazenado em whatsapp_instances
✅ API: URL configurável por consultor
```

---

## 2. FLUXO COMPLETO DO BOT (WHAPI)

### **MÁQUINA DE ESTADOS - 30+ STEPS**

```
welcome
  ↓
aguardando_conta (foto/PDF conta energia)
  ↓
processando_ocr_conta (OCR Gemini)
  ↓
confirmando_dados_conta (botões: SIM / NÃO / EDITAR)
  ├─ editing_conta_menu (1-6)
  ├─ editing_conta_nome
  ├─ editing_conta_endereco
  ├─ editing_conta_cep
  ├─ editing_conta_distribuidora
  ├─ editing_conta_instalacao
  └─ editing_conta_valor
  ↓
ask_tipo_documento (botões: RG Novo / RG Antigo / CNH)
  ↓
aguardando_doc_frente (foto frente)
  ↓
aguardando_doc_verso (foto verso + OCR documento)
  ↓
confirmando_dados_doc (botões: SIM / NÃO / EDITAR)
  ├─ editing_doc_menu (1-4)
  ├─ editing_doc_nome
  ├─ editing_doc_cpf
  ├─ editing_doc_rg
  └─ editing_doc_nascimento
  ↓
ask_name (se OCR falhou)
  ↓
ask_cpf
  ↓
ask_rg
  ↓
ask_birth_date
  ↓
ask_phone_confirm (botões: Sim / Editar / Cancelar)
  ↓
ask_phone
  ↓
ask_email
  ↓
ask_cep (busca ViaCEP automático)
  ↓
ask_number
  ↓
ask_complement
  ↓
ask_installation_number
  ↓
ask_bill_value
  ↓
ask_doc_frente_manual (se não coletado antes)
  ↓
ask_doc_verso_manual (se não coletado antes)
  ↓
ask_finalizar (botão: Finalizar)
  ↓
finalizando (validação completa)
  ↓
portal_submitting (envia ao worker VPS)
  ↓
aguardando_otp (cliente digita código SMS)
  ↓
validando_otp
  ↓
aguardando_assinatura (link CertoSign)
  ↓
complete
```

---

## 3. TODOS OS BOTÕES E MENSAGENS

### **3.1. WELCOME**
```typescript
reply = 
  `👋 Olá! Eu sou o assistente da *${nomeRepresentante}* em parceria com a *iGreen Energy*!\n\n` +
  "💡 Sabia que você pode economizar até *20% na sua conta de luz* com energia solar?\n\n" +
  "Para fazer uma simulação gratuita, preciso de alguns dados.\n\n" +
  "📸 *Envie uma FOTO ou PDF da sua conta de energia* para começarmos!";
```

### **3.2. CONFIRMANDO DADOS DA CONTA**
```typescript
reply = 
  "📋 *Dados encontrados na conta:*\n\n" +
  `👤 *Nome:* ${nome}\n` +
  `📍 *Endereço:* ${endereco} ${numero}\n` +
  `🏘️ *Bairro:* ${bairro}\n` +
  `🏙️ *Cidade:* ${cidade} - ${estado}\n` +
  `📮 *CEP:* ${cep}\n` +
  `⚡ *Distribuidora:* ${distribuidora}\n` +
  `🔢 *Nº Instalação:* ${numeroInstalacao}\n` +
  `💰 *Valor:* R$ ${valor}\n\n` +
  "Está tudo correto?";

// BOTÕES:
[
  { id: "sim_conta", title: "✅ SIM" },
  { id: "nao_conta", title: "❌ NÃO" },
  { id: "editar_conta", title: "✏️ EDITAR" }
]
```

### **3.3. MENU EDIÇÃO CONTA**
```typescript
reply = 
  "✏️ Qual campo deseja editar?\n\n" +
  "1️⃣ Nome\n" +
  "2️⃣ Endereço\n" +
  "3️⃣ CEP\n" +
  "4️⃣ Distribuidora\n" +
  "5️⃣ Nº Instalação\n" +
  "6️⃣ Valor da conta\n\n" +
  "Digite o número:";
```

### **3.4. TIPO DE DOCUMENTO**
```typescript
reply = "✅ Dados da conta confirmados!\n\n📋 Qual documento de identidade você vai enviar?\n\nToque em uma opção:";

// BOTÕES:
[
  { id: "tipo_rg_novo", title: "📄 RG Novo" },
  { id: "tipo_rg_antigo", title: "📄 RG Antigo" },
  { id: "tipo_cnh", title: "🪪 CNH" }
]
```

### **3.5. CONFIRMANDO DADOS DO DOCUMENTO**
```typescript
reply = 
  "📋 *Confirme seus dados pessoais:*\n\n" +
  `👤 *Nome:* ${nome}\n` +
  `🆔 *CPF:* ${cpf}\n` +
  `📄 *RG:* ${rg}\n` +
  `🎂 *Data Nasc:* ${dataNascimento}\n\n` +
  "Está tudo correto?";

// BOTÕES:
[
  { id: "sim_doc", title: "✅ SIM" },
  { id: "nao_doc", title: "❌ NÃO" },
  { id: "editar_doc", title: "✏️ EDITAR" }
]
```

### **3.6. MENU EDIÇÃO DOCUMENTO**
```typescript
reply = 
  "✏️ Qual campo deseja editar?\n\n" +
  "1️⃣ Nome\n" +
  "2️⃣ CPF\n" +
  "3️⃣ RG\n" +
  "4️⃣ Data de Nascimento\n\n" +
  "Digite o número:";
```

### **3.7. CONFIRMAR TELEFONE**
```typescript
reply = `📱 Confirme seu telefone:\n\n*${telefoneFormatado}*\n\nEstá correto?`;

// BOTÕES:
[
  { id: "sim_phone", title: "✅ Sim" },
  { id: "editar_phone", title: "✏️ Editar" },
  { id: "cancelar_phone", title: "❌ Cancelar" }
]
```

### **3.8. FINALIZAR**
```typescript
reply = 
  "🎉 *Todos os dados coletados!*\n\n" +
  "📋 Revise:\n" +
  `👤 Nome: ${nome}\n` +
  `🆔 CPF: ${cpf}\n` +
  `📍 Endereço: ${endereco}\n` +
  `📱 Telefone: ${telefone}\n` +
  `💰 Valor conta: R$ ${valor}\n\n` +
  "Tudo certo? Toque em *Finalizar* para enviar!";

// BOTÃO:
[
  { id: "btn_finalizar", title: "✅ Finalizar" }
]
```

### **3.9. AGUARDANDO OTP**
```typescript
reply = 
  "✅ *Todos os dados coletados com sucesso!* 🎉\n\n" +
  "⏳ Estamos processando seu cadastro no portal...\n\n" +
  "📱 Em breve você receberá um *código de verificação por SMS*. Quando receber, *digite aqui*!\n\n" +
  "Obrigado pela confiança! ☀️🌱";
```

### **3.10. VALIDANDO OTP**
```typescript
reply = `✅ Código *${otpCode}* recebido! ⏳ Validando no portal...\n\nAguarde alguns instantes...`;
```

### **3.11. LINK ASSINATURA**
```typescript
reply = 
  `🎉 *Cadastro quase completo!*\n\n` +
  `🔗 Clique no link abaixo para fazer a *validação facial* e assinar digitalmente:\n\n` +
  `${linkAssinatura}\n\n` +
  `📱 Abra pelo celular e siga as instruções.\n\n` +
  `Após a validação, seu cadastro estará 100% completo! ✅`;
```

### **3.12. COMPLETE**
```typescript
reply = "✅ Seus dados já foram registrados! Se precisar de algo, um consultor entrará em contato. ☀️";
```

---

## 4. ADAPTAÇÕES PARA EVOLUTION API

### **4.1. ESTRUTURA DE WEBHOOK**

**Whapi (atual):**
```typescript
const messages = body.messages || [];
for (const msg of messages) {
  const chatId = msg.chat_id || "";
  const messageText = msg.text?.body || "";
  const imageUrl = msg.image?.link || null;
  const buttonId = msg.button_response?.id || null;
}
```

**Evolution API (novo):**
```typescript
const data = body.data || body;
const key = data.key || {};
const message = data.message || {};
const remoteJid = key.remoteJid || "";
const messageText = message.conversation || message.extendedTextMessage?.text || "";
const imageMessage = message.imageMessage;
const documentMessage = message.documentMessage;
const buttonResponseMessage = message.buttonsResponseMessage;
const listResponseMessage = message.listResponseMessage;
```

### **4.2. ENVIO DE MENSAGENS**

**Whapi (atual):**
```typescript
// Texto
await fetch(`${whapiUrl}messages/text`, {
  method: "POST",
  headers: { Authorization: `Bearer ${whapiToken}` },
  body: JSON.stringify({ to: chatId, body: text })
});

// Botões
await fetch(`${whapiUrl}messages/interactive`, {
  method: "POST",
  headers: { Authorization: `Bearer ${whapiToken}` },
  body: JSON.stringify({
    to: chatId,
    type: "button",
    body: { text: message },
    action: {
      buttons: buttons.map(b => ({ type: "reply", reply: { id: b.id, title: b.title } }))
    }
  })
});
```

**Evolution API (novo):**
```typescript
// Texto
await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
  method: "POST",
  headers: { apikey: apiKey },
  body: JSON.stringify({
    number: remoteJid,
    text: text
  })
});

// Botões
await fetch(`${evolutionUrl}/message/sendButtons/${instanceName}`, {
  method: "POST",
  headers: { apikey: apiKey },
  body: JSON.stringify({
    number: remoteJid,
    title: "Escolha uma opção",
    description: message,
    footer: "iGreen Energy",
    buttons: buttons.map(b => ({ buttonId: b.id, buttonText: { displayText: b.title } }))
  })
});
```

### **4.3. DOWNLOAD DE MÍDIA**

**Whapi (atual):**
```typescript
// URL direta ou via Media API
const imageUrl = msg.image?.link;
const mediaId = msg.image?.id;

if (imageUrl) {
  const res = await fetch(imageUrl);
  const buffer = await res.arrayBuffer();
} else if (mediaId) {
  const res = await fetch(`${whapiUrl}media/${mediaId}`, {
    headers: { Authorization: `Bearer ${whapiToken}` }
  });
  const buffer = await res.arrayBuffer();
}
```

**Evolution API (novo):**
```typescript
// Baixar mídia via base64 da mensagem
const imageMessage = message.imageMessage;
if (imageMessage) {
  const mediaKey = imageMessage.mediaKey;
  const url = imageMessage.url;
  
  // Opção 1: Usar URL direta (se disponível)
  if (url) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
  }
  
  // Opção 2: Baixar via Evolution API
  const res = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: "POST",
    headers: { apikey: apiKey },
    body: JSON.stringify({ message: { key, message } })
  });
  const { base64 } = await res.json();
}
```

---

## 5. ESTRUTURA DE TABELAS

### **5.1. TABELA `whatsapp_instances`** (NOVA)

```sql
CREATE TABLE whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  api_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  webhook_url TEXT,
  status TEXT DEFAULT 'disconnected', -- disconnected, connecting, connected
  qr_code TEXT,
  qr_code_updated_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultants can view own instances"
  ON whatsapp_instances FOR SELECT
  USING (consultant_id = auth.uid());

CREATE POLICY "Consultants can update own instances"
  ON whatsapp_instances FOR UPDATE
  USING (consultant_id = auth.uid());
```

### **5.2. TABELA `customers` (ATUALIZAR)**

```sql
-- Adicionar campo para identificar a instância
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID REFERENCES whatsapp_instances(id);

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_customers_instance 
ON customers(whatsapp_instance_id);
```

---

## 6. EDGE FUNCTIONS A MIGRAR

### **6.1. `evolution-webhook` (NOVA)**

**Substituir:** `whatsapp-webhook`

**Diferenças:**
- Recebe payload Evolution API
- Identifica instância pelo `instance` no body ou header
- Busca configuração em `whatsapp_instances`
- Usa API Evolution para enviar mensagens

**Estrutura:**
```typescript
// 1. Parse payload Evolution
const data = body.data || body;
const instance = body.instance || req.headers.get("x-instance-name");

// 2. Buscar instância
const { data: instanceData } = await supabase
  .from("whatsapp_instances")
  .select("*, consultants(*)")
  .eq("instance_name", instance)
  .single();

// 3. Extrair dados da mensagem
const key = data.key || {};
const message = data.message || {};
const remoteJid = key.remoteJid;
const phone = normalizePhone(remoteJid);

// 4. Processar máquina de estados (IGUAL ao whapi-webhook)
// ... todo o switch(step) ...

// 5. Enviar resposta via Evolution API
await sendEvolutionMessage(instanceData, remoteJid, reply);
```

### **6.2. `evolution-instance-manager` (NOVA)**

**Função:** Gerenciar instâncias Evolution (criar, conectar, desconectar, QR Code)

**Endpoints:**
- `POST /create` - Criar nova instância
- `POST /connect` - Conectar instância (gera QR Code)
- `POST /disconnect` - Desconectar instância
- `GET /qrcode/:instanceName` - Buscar QR Code
- `GET /status/:instanceName` - Status da instância

### **6.3. `_shared/evolution-api.ts` (NOVA)**

**Substituir:** `_shared/whatsapp-api.ts`

```typescript
export function createEvolutionSender(apiUrl: string, apiKey: string, instanceName: string) {
  return {
    async sendText(remoteJid: string, text: string) {
      const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": apiKey },
        body: JSON.stringify({ number: remoteJid, text })
      });
      return res.ok;
    },

    async sendButtons(remoteJid: string, message: string, buttons: Array<{id: string, title: string}>) {
      const res = await fetch(`${apiUrl}/message/sendButtons/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": apiKey },
        body: JSON.stringify({
          number: remoteJid,
          title: "Escolha uma opção",
          description: message,
          footer: "iGreen Energy",
          buttons: buttons.map(b => ({
            buttonId: b.id,
            buttonText: { displayText: b.title }
          }))
        })
      });
      return res.ok;
    },

    async downloadMedia(message: any) {
      const res = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": apiKey },
        body: JSON.stringify({ message })
      });
      const { base64 } = await res.json();
      return base64;
    }
  };
}
```

---

## 7. CHECKLIST DE IMPLEMENTAÇÃO

### **FASE 1: PREPARAÇÃO**
- [ ] Criar tabela `whatsapp_instances`
- [ ] Adicionar campo `whatsapp_instance_id` em `customers`
- [ ] Criar migration para estrutura

### **FASE 2: EDGE FUNCTIONS**
- [ ] Criar `evolution-webhook` (copiar lógica de `whatsapp-webhook`)
- [ ] Criar `evolution-instance-manager`
- [ ] Criar `_shared/evolution-api.ts`
- [ ] Adaptar `_shared/ocr.ts` para Evolution
- [ ] Manter `_shared/conversation-helpers.ts` (sem mudanças)
- [ ] Manter `_shared/validators.ts` (sem mudanças)

### **FASE 3: FRONTEND**
- [ ] Criar página de gerenciamento de instâncias
- [ ] Adicionar QR Code scanner
- [ ] Adicionar status de conexão
- [ ] Adicionar botão "Conectar WhatsApp"

### **FASE 4: TESTES**
- [ ] Testar criação de instância
- [ ] Testar conexão via QR Code
- [ ] Testar envio de mensagens
- [ ] Testar recebimento de mensagens
- [ ] Testar botões interativos
- [ ] Testar upload de imagens
- [ ] Testar OCR
- [ ] Testar fluxo completo

### **FASE 5: MIGRAÇÃO**
- [ ] Migrar consultores existentes
- [ ] Criar instâncias para cada consultor
- [ ] Testar em produção
- [ ] Desativar Whapi

---

## 8. EXEMPLO DE CONFIGURAÇÃO

### **8.1. Criar Instância**
```typescript
const { data, error } = await supabase
  .from("whatsapp_instances")
  .insert({
    consultant_id: consultantId,
    instance_name: `consultor-${consultantId}`,
    api_url: "https://evolution-api.com",
    api_key: "sua-api-key",
    webhook_url: "https://seu-projeto.supabase.co/functions/v1/evolution-webhook"
  })
  .select()
  .single();
```

### **8.2. Conectar Instância**
```typescript
// 1. Criar instância na Evolution API
const res = await fetch(`${apiUrl}/instance/create`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "apikey": globalApiKey },
  body: JSON.stringify({
    instanceName: instanceName,
    token: apiKey,
    qrcode: true,
    webhook: webhookUrl
  })
});

// 2. Buscar QR Code
const qrRes = await fetch(`${apiUrl}/instance/qrcode/${instanceName}`, {
  headers: { "apikey": apiKey }
});
const { qrcode } = await qrRes.json();

// 3. Salvar QR Code no banco
await supabase
  .from("whatsapp_instances")
  .update({
    qr_code: qrcode.base64,
    qr_code_updated_at: new Date().toISOString(),
    status: "connecting"
  })
  .eq("id", instanceId);
```

---

## 9. DIFERENÇAS DE PAYLOAD

### **9.1. Whapi Webhook**
```json
{
  "messages": [{
    "id": "msg-id",
    "from_me": false,
    "chat_id": "5511999998888@s.whatsapp.net",
    "type": "text",
    "text": { "body": "Olá" },
    "image": { "link": "https://...", "id": "media-id" },
    "button_response": { "id": "sim_conta" }
  }]
}
```

### **9.2. Evolution Webhook**
```json
{
  "instance": "consultor-uuid",
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
        "mimetype": "image/jpeg",
        "mediaKey": "...",
        "fileLength": "12345"
      },
      "buttonsResponseMessage": {
        "selectedButtonId": "sim_conta",
        "selectedDisplayText": "✅ SIM"
      }
    }
  }
}
```

---

## 10. RESUMO

**O que muda:**
- ✅ Webhook: `whatsapp-webhook` → `evolution-webhook`
- ✅ API: Whapi → Evolution API
- ✅ Instâncias: 1 centralizada → N individuais
- ✅ Configuração: `settings` → `whatsapp_instances`

**O que NÃO muda:**
- ✅ Máquina de estados (30+ steps)
- ✅ Botões e mensagens
- ✅ OCR (Gemini)
- ✅ Validações
- ✅ Portal Worker
- ✅ Fluxo OTP
- ✅ Banco de dados (customers, conversations)

---

**Versão:** 1.0.0  
**Data:** 12 de abril de 2026  
**Status:** Documentação completa ✅
