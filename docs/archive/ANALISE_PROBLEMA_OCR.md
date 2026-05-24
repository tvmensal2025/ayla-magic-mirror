# 🔍 ANÁLISE: PROBLEMA OCR NÃO LENDO IMAGENS

> **Diagnóstico completo do problema de OCR**
> 
> **Data:** 13 de abril de 2026

---

## ❌ PROBLEMA RELATADO

**Sintoma:** OCR não está lendo as imagens corretamente

**Impacto:** Dados não são extraídos, cadastro não avança

---

## 🔍 ANÁLISE DO FLUXO

### **1. Recebimento da Mídia** ✅

```typescript
// Webhook recebe a mensagem
if (isFile) {
  fileUrl = extractMediaUrl(message);
  if (!fileUrl) {
    // Baixar via Evolution API
    fileBase64 = await downloadMedia(key, message);
    if (fileBase64) {
      const mimeType = imageMessage?.mimetype || documentMessage?.mimetype;
      fileUrl = `data:${mimeType};base64,${fileBase64}`;
    }
  }
}
```

**Status:** ✅ Correto - Baixa base64 e cria data URL

---

### **2. Chamada do OCR** ⚠️ PROBLEMA IDENTIFICADO

```typescript
// ATUAL (pode ter problema)
const ocrData = await ocrContaEnergia(
  fileUrl,                              // data URL
  GEMINI_API_KEY,                       // API key
  fileBase64 || undefined,              // Base64 ✅
  documentMessage || imageMessage       // ⚠️ PROBLEMA AQUI
);
```

**PROBLEMA:** Está passando `documentMessage || imageMessage` mas deveria passar o objeto completo com mimetype.

---

### **3. Função baixarImagem** ✅

```typescript
export async function baixarImagem(
  url: string | null,
  base64FromEvolution?: string,
  mediaMessage?: any
): Promise<{ b64: string; mime: string } | null> {
  
  // PRIORIDADE 1: Base64 da Evolution
  if (base64FromEvolution) {
    const mime = mediaMessage?.mimetype || "image/jpeg";
    return { b64: base64FromEvolution, mime };
  }
  
  // PRIORIDADE 2: Data URL
  if (url && url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { b64: match[2], mime: match[1] };
    }
  }
}
```

**Status:** ✅ Correto - Processa base64 e data URL

---

## 🐛 PROBLEMAS IDENTIFICADOS

### **Problema 1: mediaMessage pode estar undefined** ⚠️

**Código atual:**
```typescript
const ocrData = await ocrContaEnergia(
  fileUrl, 
  GEMINI_API_KEY, 
  fileBase64 || undefined, 
  documentMessage || imageMessage  // ⚠️ Pode ser undefined
);
```

**Solução:**
```typescript
const mediaMsg = documentMessage || imageMessage || { mimetype: "image/jpeg" };
const ocrData = await ocrContaEnergia(
  fileUrl, 
  GEMINI_API_KEY, 
  fileBase64 || undefined, 
  mediaMsg  // ✅ Sempre tem valor
);
```

---

### **Problema 2: Logs insuficientes** ⚠️

**Falta:**
- Log do base64 recebido
- Log do mimetype
- Log se base64 está vazio
- Log do tamanho da imagem

**Solução:** Adicionar logs detalhados

---

### **Problema 3: Sem validação de base64** ⚠️

**Falta:**
- Verificar se base64 não está vazio
- Verificar se base64 é válido
- Verificar tamanho mínimo

**Solução:** Adicionar validações

---

## 🔧 CORREÇÕES NECESSÁRIAS

### **Correção 1: Garantir mediaMessage sempre tem valor**

```typescript
// ANTES
const ocrData = await ocrContaEnergia(
  fileUrl, 
  GEMINI_API_KEY, 
  fileBase64 || undefined, 
  documentMessage || imageMessage
);

// DEPOIS
const mediaMsg = documentMessage || imageMessage || { 
  mimetype: imageMessage?.mimetype || documentMessage?.mimetype || "image/jpeg" 
};

console.log("📡 Media message:", JSON.stringify(mediaMsg).substring(0, 200));
console.log("📡 Base64 length:", fileBase64?.length || 0);
console.log("📡 File URL:", fileUrl?.substring(0, 100));

const ocrData = await ocrContaEnergia(
  fileUrl, 
  GEMINI_API_KEY, 
  fileBase64 || undefined, 
  mediaMsg
);
```

---

### **Correção 2: Adicionar validação de base64**

```typescript
// Validar base64 antes de chamar OCR
if (fileBase64) {
  if (fileBase64.length < 100) {
    console.error("❌ Base64 muito pequeno:", fileBase64.length);
    reply = "⚠️ Erro ao processar imagem. Tente enviar novamente.";
    break;
  }
  
  // Verificar se é base64 válido
  try {
    atob(fileBase64.substring(0, 100));
  } catch (e) {
    console.error("❌ Base64 inválido");
    reply = "⚠️ Erro ao processar imagem. Tente enviar novamente.";
    break;
  }
}
```

---

### **Correção 3: Melhorar logs**

```typescript
console.log("📥 Arquivo recebido:");
console.log("  - isFile:", isFile);
console.log("  - hasImage:", hasImage);
console.log("  - hasDocument:", hasDocument);
console.log("  - imageMessage:", !!imageMessage);
console.log("  - documentMessage:", !!documentMessage);
console.log("  - fileUrl:", fileUrl?.substring(0, 100));
console.log("  - fileBase64 length:", fileBase64?.length || 0);
console.log("  - mimetype:", imageMessage?.mimetype || documentMessage?.mimetype);
```

---

### **Correção 4: Fallback para URL se base64 falhar**

```typescript
// Se não conseguiu baixar base64, tentar URL
if (!fileBase64 && !fileUrl) {
  console.error("❌ Não conseguiu obter mídia (nem base64 nem URL)");
  reply = "⚠️ Erro ao processar imagem. Tente enviar novamente.";
  break;
}

// Se tem URL mas não tem base64, avisar
if (fileUrl && !fileBase64) {
  console.warn("⚠️ Usando URL sem base64 - pode ser mais lento");
}
```

---

## 🧪 TESTES PARA VALIDAR

### **Teste 1: Imagem JPG**
```
1. Enviar foto JPG via WhatsApp
2. Verificar logs:
   - "📥 Arquivo recebido"
   - "📡 Base64 length: XXXXX"
   - "📡 Media message: {...}"
   - "📥 Usando base64 da Evolution API"
   - "🔍 OCR Conta - Imagem OK"
```

### **Teste 2: PDF**
```
1. Enviar PDF via WhatsApp
2. Verificar logs:
   - "📄 Detectado PDF"
   - "📡 Base64 length: XXXXX"
   - "📥 Usando base64 da Evolution API"
   - "🔍 OCR Conta - Imagem OK"
```

### **Teste 3: Imagem muito pequena**
```
1. Enviar imagem < 1KB
2. Verificar logs:
   - "⚠️ Imagem muito pequena"
   - Mensagem de erro ao usuário
```

### **Teste 4: Base64 inválido**
```
1. Simular base64 corrompido
2. Verificar logs:
   - "❌ Base64 inválido"
   - Mensagem de erro ao usuário
```

---

## 📊 CHECKLIST DE VALIDAÇÃO

### **Antes do OCR** ✅
- [ ] Verificar se isFile é true
- [ ] Verificar se fileBase64 não está vazio
- [ ] Verificar se fileBase64 tem tamanho mínimo (>100 bytes)
- [ ] Verificar se mediaMessage tem mimetype
- [ ] Verificar se fileUrl está presente (fallback)

### **Durante o OCR** ✅
- [ ] Log do base64 length
- [ ] Log do mimetype
- [ ] Log do tipo de mídia (imagem/PDF)
- [ ] Log da resposta do Gemini

### **Após o OCR** ✅
- [ ] Verificar se sucesso é true
- [ ] Verificar se dados foram extraídos
- [ ] Verificar se campos obrigatórios estão preenchidos
- [ ] Log dos dados extraídos

---

## 🚀 IMPLEMENTAÇÃO DAS CORREÇÕES

Vou implementar todas as correções agora:

1. ✅ Garantir mediaMessage sempre tem valor
2. ✅ Adicionar validação de base64
3. ✅ Melhorar logs
4. ✅ Adicionar fallback

---

## 📝 LOGS ESPERADOS (CORRETOS)

```
📥 Arquivo recebido:
  - isFile: true
  - hasImage: true
  - hasDocument: false
  - imageMessage: true
  - documentMessage: false
  - fileUrl: data:image/jpeg;base64,/9j/4AAQ...
  - fileBase64 length: 45678
  - mimetype: image/jpeg

📡 Media message: {"mimetype":"image/jpeg"}
📡 Base64 length: 45678
📡 File URL: data:image/jpeg;base64,/9j/4AAQ...

📡 Chamando OCR Gemini para conta: data:image/jpeg;base64,/9j/4AAQ...
📥 Usando base64 da Evolution API
📥 Imagem Evolution: b64 len: 45678, tipo: image/jpeg
🔍 OCR Conta - Imagem OK: image/jpeg, b64 len: 45678
🔍 OCR Conta - Chamando Gemini 2.5 Flash...
🔍 OCR Conta - Gemini status: 200
🔍 OCR Conta - resposta: {"nome":"João Silva",...}
✅ OCR Conta OK: {"nome":"João Silva","endereco":"Rua X",...}
```

---

## ⚠️ LOGS DE ERRO (PARA DIAGNOSTICAR)

```
❌ Base64 muito pequeno: 50
⚠️ Erro ao processar imagem. Tente enviar novamente.

OU

❌ Base64 inválido
⚠️ Erro ao processar imagem. Tente enviar novamente.

OU

❌ Não conseguiu obter mídia (nem base64 nem URL)
⚠️ Erro ao processar imagem. Tente enviar novamente.
```

---

**Versão:** 1.0.0  
**Data:** 13 de abril de 2026  
**Status:** 🔍 ANÁLISE COMPLETA - IMPLEMENTANDO CORREÇÕES

🔧 **CORREÇÕES SERÃO IMPLEMENTADAS AGORA!** 🔧

