# 📦 EXEMPLOS DE PAYLOAD - EVOLUTION API

## 📋 ÍNDICE
1. [Mensagem de Texto](#mensagem-de-texto)
2. [Botão Clicado](#botão-clicado)
3. [Imagem](#imagem)
4. [Documento (PDF)](#documento-pdf)
5. [Áudio](#áudio)
6. [Vídeo](#vídeo)
7. [Mensagem de Grupo (Ignorada)](#mensagem-de-grupo-ignorada)
8. [Mensagem Própria (Ignorada)](#mensagem-própria-ignorada)

---

## 1. Mensagem de Texto

```json
{
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C7F8B2E5A1D4F6C8"
    },
    "pushName": "João Silva",
    "message": {
      "conversation": "Olá, quero fazer uma simulação"
    },
    "messageType": "conversation",
    "messageTimestamp": "1712937600",
    "instanceId": "minha-instancia",
    "source": "android"
  },
  "destination": "5511988887777@s.whatsapp.net",
  "date_time": "2026-04-12T10:00:00.000Z",
  "sender": "5511999998888@s.whatsapp.net",
  "server_url": "https://minha-evolution-api.com",
  "apikey": "minha-api-key"
}
```

**Parse:**
```typescript
const remoteJid = "5511999998888@s.whatsapp.net"
const messageText = "Olá, quero fazer uma simulação"
const isButton = false
const isFile = false
```

---

## 2. Botão Clicado

```json
{
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C7F8B2E5A1D4F6C9"
    },
    "pushName": "João Silva",
    "message": {
      "buttonsResponseMessage": {
        "selectedButtonId": "sim_conta",
        "selectedDisplayText": "✅ SIM",
        "contextInfo": {
          "stanzaId": "3EB0C7F8B2E5A1D4F6C8",
          "participant": "5511988887777@s.whatsapp.net"
        }
      }
    },
    "messageType": "buttonsResponseMessage",
    "messageTimestamp": "1712937610",
    "instanceId": "minha-instancia",
    "source": "android"
  },
  "destination": "5511988887777@s.whatsapp.net",
  "date_time": "2026-04-12T10:00:10.000Z",
  "sender": "5511999998888@s.whatsapp.net",
  "server_url": "https://minha-evolution-api.com",
  "apikey": "minha-api-key"
}
```

**Parse:**
```typescript
const remoteJid = "5511999998888@s.whatsapp.net"
const buttonId = "sim_conta"
const messageText = "✅ SIM"
const isButton = true
const isFile = false
```

---

## 3. Imagem

```json
{
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C7F8B2E5A1D4F6CA"
    },
    "pushName": "João Silva",
    "message": {
      "imageMessage": {
        "url": "https://mmg.whatsapp.net/v/t62.7118-24/...",
        "mimetype": "image/jpeg",
        "caption": "",
        "fileSha256": "abc123...",
        "fileLength": "123456",
        "height": 1920,
        "width": 1080,
        "mediaKey": "xyz789...",
        "fileEncSha256": "def456...",
        "directPath": "/v/t62.7118-24/...",
        "mediaKeyTimestamp": "1712937620",
        "jpegThumbnail": "/9j/4AAQSkZJRg..."
      }
    },
    "messageType": "imageMessage",
    "messageTimestamp": "1712937620",
    "instanceId": "minha-instancia",
    "source": "android"
  },
  "destination": "5511988887777@s.whatsapp.net",
  "date_time": "2026-04-12T10:00:20.000Z",
  "sender": "5511999998888@s.whatsapp.net",
  "server_url": "https://minha-evolution-api.com",
  "apikey": "minha-api-key"
}
```

**Parse:**
```typescript
const remoteJid = "5511999998888@s.whatsapp.net"
const hasImage = true
const isFile = true
const fileUrl = "https://mmg.whatsapp.net/v/t62.7118-24/..."
const imageMessage = data.message.imageMessage
```

**Download (se URL não disponível):**
```typescript
const fileBase64 = await downloadMedia(data.key, data.message)
const fileUrl = `data:image/jpeg;base64,${fileBase64}`
```

---

## 4. Documento (PDF)

```json
{
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C7F8B2E5A1D4F6CB"
    },
    "pushName": "João Silva",
    "message": {
      "documentMessage": {
        "url": "https://mmg.whatsapp.net/v/t62.7119-24/...",
        "mimetype": "application/pdf",
        "title": "conta_energia.pdf",
        "fileSha256": "abc123...",
        "fileLength": "234567",
        "pageCount": 1,
        "mediaKey": "xyz789...",
        "fileName": "conta_energia.pdf",
        "fileEncSha256": "def456...",
        "directPath": "/v/t62.7119-24/...",
        "mediaKeyTimestamp": "1712937630",
        "jpegThumbnail": "/9j/4AAQSkZJRg..."
      }
    },
    "messageType": "documentMessage",
    "messageTimestamp": "1712937630",
    "instanceId": "minha-instancia",
    "source": "android"
  },
  "destination": "5511988887777@s.whatsapp.net",
  "date_time": "2026-04-12T10:00:30.000Z",
  "sender": "5511999998888@s.whatsapp.net",
  "server_url": "https://minha-evolution-api.com",
  "apikey": "minha-api-key"
}
```

**Parse:**
```typescript
const remoteJid = "5511999998888@s.whatsapp.net"
const hasDocument = true
const isFile = true
const fileUrl = "https://mmg.whatsapp.net/v/t62.7119-24/..."
const documentMessage = data.message.documentMessage
```

---

## 5. Áudio

```json
{
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C7F8B2E5A1D4F6CC"
    },
    "pushName": "João Silva",
    "message": {
      "audioMessage": {
        "url": "https://mmg.whatsapp.net/v/t62.7114-24/...",
        "mimetype": "audio/ogg; codecs=opus",
        "fileSha256": "abc123...",
        "fileLength": "12345",
        "seconds": 5,
        "ptt": true,
        "mediaKey": "xyz789...",
        "fileEncSha256": "def456...",
        "directPath": "/v/t62.7114-24/...",
        "mediaKeyTimestamp": "1712937640"
      }
    },
    "messageType": "audioMessage",
    "messageTimestamp": "1712937640",
    "instanceId": "minha-instancia",
    "source": "android"
  },
  "destination": "5511988887777@s.whatsapp.net",
  "date_time": "2026-04-12T10:00:40.000Z",
  "sender": "5511999998888@s.whatsapp.net",
  "server_url": "https://minha-evolution-api.com",
  "apikey": "minha-api-key"
}
```

**Parse:**
```typescript
const remoteJid = "5511999998888@s.whatsapp.net"
const hasAudio = true
const isFile = true
const fileUrl = "https://mmg.whatsapp.net/v/t62.7114-24/..."
```

---

## 6. Vídeo

```json
{
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C7F8B2E5A1D4F6CD"
    },
    "pushName": "João Silva",
    "message": {
      "videoMessage": {
        "url": "https://mmg.whatsapp.net/v/t62.7113-24/...",
        "mimetype": "video/mp4",
        "fileSha256": "abc123...",
        "fileLength": "1234567",
        "seconds": 10,
        "mediaKey": "xyz789...",
        "height": 1920,
        "width": 1080,
        "fileEncSha256": "def456...",
        "directPath": "/v/t62.7113-24/...",
        "mediaKeyTimestamp": "1712937650",
        "jpegThumbnail": "/9j/4AAQSkZJRg..."
      }
    },
    "messageType": "videoMessage",
    "messageTimestamp": "1712937650",
    "instanceId": "minha-instancia",
    "source": "android"
  },
  "destination": "5511988887777@s.whatsapp.net",
  "date_time": "2026-04-12T10:00:50.000Z",
  "sender": "5511999998888@s.whatsapp.net",
  "server_url": "https://minha-evolution-api.com",
  "apikey": "minha-api-key"
}
```

---

## 7. Mensagem de Grupo (Ignorada)

```json
{
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "120363123456789012@g.us",
      "fromMe": false,
      "id": "3EB0C7F8B2E5A1D4F6CE",
      "participant": "5511999998888@s.whatsapp.net"
    },
    "pushName": "João Silva",
    "message": {
      "conversation": "Olá grupo!"
    },
    "messageType": "conversation",
    "messageTimestamp": "1712937660",
    "instanceId": "minha-instancia",
    "source": "android"
  },
  "destination": "120363123456789012@g.us",
  "date_time": "2026-04-12T10:01:00.000Z",
  "sender": "5511999998888@s.whatsapp.net",
  "server_url": "https://minha-evolution-api.com",
  "apikey": "minha-api-key"
}
```

**Parse:**
```typescript
const remoteJid = "120363123456789012@g.us"
// Ignorado porque contém "@g.us" (grupo)
```

---

## 8. Mensagem Própria (Ignorada)

```json
{
  "instance": "minha-instancia",
  "data": {
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": true,
      "id": "3EB0C7F8B2E5A1D4F6CF"
    },
    "pushName": "Meu Bot",
    "message": {
      "conversation": "Olá! Como posso ajudar?"
    },
    "messageType": "conversation",
    "messageTimestamp": "1712937670",
    "instanceId": "minha-instancia",
    "source": "android"
  },
  "destination": "5511999998888@s.whatsapp.net",
  "date_time": "2026-04-12T10:01:10.000Z",
  "sender": "5511988887777@s.whatsapp.net",
  "server_url": "https://minha-evolution-api.com",
  "apikey": "minha-api-key"
}
```

**Parse:**
```typescript
const fromMe = true
// Ignorado porque fromMe = true (mensagem própria)
```

---

## 🔧 FUNÇÃO DE PARSE

```typescript
export function parseEvolutionMessage(body: any) {
  const data = body.data;
  if (!data || !data.key) return null;

  const { key, message, pushName } = data;
  const { remoteJid, fromMe } = key;

  // Ignorar mensagens próprias
  if (fromMe) return null;

  // Ignorar grupos, newsletters, canais
  if (remoteJid.includes("@g.us") || 
      remoteJid.includes("@newsletter") || 
      remoteJid.includes("@broadcast")) {
    return null;
  }

  // Texto simples
  const messageText = message.conversation || 
                      message.extendedTextMessage?.text || 
                      "";

  // Botão
  const buttonId = message.buttonsResponseMessage?.selectedButtonId || 
                   message.listResponseMessage?.singleSelectReply?.selectedRowId || 
                   null;
  const isButton = !!buttonId;

  // Imagem
  const imageMessage = message.imageMessage || null;
  const hasImage = !!imageMessage;

  // Documento
  const documentMessage = message.documentMessage || null;
  const hasDocument = !!documentMessage;

  // Arquivo
  const isFile = hasImage || hasDocument;

  return {
    remoteJid,
    messageText,
    buttonId,
    hasImage,
    hasDocument,
    isFile,
    isButton,
    imageMessage,
    documentMessage,
    key,
    message,
    pushName,
  };
}
```

---

## 📤 EXEMPLOS DE ENVIO

### **1. Enviar Texto**
```bash
curl -X POST https://minha-evolution-api.com/message/sendText/minha-instancia \
  -H "apikey: minha-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999998888",
    "text": "Olá! Como posso ajudar?"
  }'
```

### **2. Enviar Botões**
```bash
curl -X POST https://minha-evolution-api.com/message/sendButtons/minha-instancia \
  -H "apikey: minha-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999998888",
    "title": "Escolha uma opção",
    "description": "Os dados estão corretos?",
    "buttons": [
      {
        "id": "sim_conta",
        "text": "✅ SIM"
      },
      {
        "id": "nao_conta",
        "text": "❌ NÃO"
      },
      {
        "id": "editar_conta",
        "text": "✏️ EDITAR"
      }
    ]
  }'
```

### **3. Baixar Mídia**
```bash
curl -X POST https://minha-evolution-api.com/message/downloadMedia/minha-instancia \
  -H "apikey: minha-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "key": {
      "remoteJid": "5511999998888@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0C7F8B2E5A1D4F6CA"
    },
    "message": {
      "imageMessage": {
        "url": "https://mmg.whatsapp.net/v/t62.7118-24/...",
        "mimetype": "image/jpeg"
      }
    }
  }'
```

**Resposta:**
```json
{
  "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "mimetype": "image/jpeg"
}
```

---

## 🎯 RESUMO

**Tipos de Mensagem:**
- ✅ Texto simples (`conversation`)
- ✅ Botão clicado (`buttonsResponseMessage`)
- ✅ Imagem (`imageMessage`)
- ✅ Documento (`documentMessage`)
- ✅ Áudio (`audioMessage`)
- ✅ Vídeo (`videoMessage`)
- ❌ Grupo (`@g.us`) - Ignorado
- ❌ Própria (`fromMe: true`) - Ignorado

**Parse:**
- `remoteJid` - Número do remetente
- `messageText` - Texto da mensagem
- `buttonId` - ID do botão clicado
- `isFile` - Se é arquivo (imagem/documento)
- `fileUrl` - URL da mídia (se disponível)

**Envio:**
- `sendText()` - Envia texto
- `sendButtons()` - Envia botões
- `downloadMedia()` - Baixa mídia

---

**Versão:** 1.0.0  
**Data:** 12 de abril de 2026  
**Status:** ✅ COMPLETO
