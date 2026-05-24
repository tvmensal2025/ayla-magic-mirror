# 🔍 ANÁLISE E TESTE COMPLETO DO OCR

> **Análise detalhada do fluxo de OCR e testes da IA**
> 
> **Data:** 13 de abril de 2026

---

## 📊 ANÁLISE DO FLUXO ATUAL

### **1. FLUXO DE PROCESSAMENTO DE MÍDIA** ✅

#### **A. Recebimento da Mídia (Evolution Webhook)**

```typescript
// 1. Parse da mensagem Evolution
const parsed = parseEvolutionMessage(body);
const { hasImage, hasDocument, imageMessage, documentMessage } = parsed;

// 2. Extração de URL ou download via Evolution
let fileUrl: string | null = null;
let fileBase64: string | null = null;

if (isFile) {
  // Tentar extrair URL direta
  fileUrl = extractMediaUrl(message);
  
  // Se não tem URL, baixar via Evolution API
  if (!fileUrl) {
    fileBase64 = await downloadMedia(key, message);
    if (fileBase64) {
      const mimeType = imageMessage?.mimetype || documentMessage?.mimetype;
      fileUrl = `data:${mimeType};base64,${fileBase64}`;
    }
  }
}
```

**Status:** ✅ CORRETO
- Webhook extrai URL ou baixa base64
- Suporta imagens (JPG, PNG) e PDFs
- Cria data URL quando necessário

---

#### **B. OCR da Conta de Energia**

```typescript
// Chamada do OCR com base64 e mediaMessage
const ocrData = await ocrContaEnergia(
  fileUrl,                              // URL ou data URL
  GEMINI_API_KEY,                       // API key
  fileBase64 || undefined,              // Base64 (NOVO!)
  documentMessage || imageMessage       // Media message (NOVO!)
);
```

**Status:** ✅ CORRETO
- Passa base64 diretamente para OCR
- Passa mediaMessage com mimetype
- Suporta PDFs de alta qualidade

---

#### **C. Função baixarImagem (OCR Helper)**

```typescript
export async function baixarImagem(
  url: string | null,
  base64FromEvolution?: string,  // Base64 da Evolution
  mediaMessage?: any             // Media message com mimetype
): Promise<{ b64: string; mime: string } | null> {
  
  // PRIORIDADE 1: Base64 da Evolution (NOVO!)
  if (base64FromEvolution) {
    const mime = mediaMessage?.mimetype || "image/jpeg";
    
    // Detectar PDF
    if (mime === "application/pdf" || mime.includes("pdf")) {
      console.log("📄 Detectado PDF - Gemini suporta PDF diretamente");
      return { b64: base64FromEvolution, mime: "application/pdf" };
    }
    
    return { b64: base64FromEvolution, mime };
  }
  
  // PRIORIDADE 2: Data URL
  if (url && url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mime = match[1];
      const b64 = match[2];
      
      if (mime === "application/pdf" || mime.includes("pdf")) {
        return { b64, mime: "application/pdf" };
      }
      
      return { b64, mime };
    }
  }
  
  // PRIORIDADE 3: Download via URL
  if (url) {
    const imgRes = await fetchWithTimeout(url, { timeout: TIMEOUT_FETCH_IMAGE });
    // ... download e conversão para base64
  }
}
```

**Status:** ✅ CORRETO
- 3 métodos de obtenção de mídia
- Detecção específica de PDF
- Suporte a data URLs
- Logs detalhados

---

#### **D. OCR Documento (Frente + Verso)**

```typescript
// Salvar base64 da frente
if (fileBase64) {
  updates.document_front_base64 = fileBase64;
}

// Usar base64 salvo no OCR do verso
const frenteBase64 = customer.document_front_base64 || undefined;

const ocrData = await ocrDocumentoFrenteVerso(
  docFrenteUrl,
  docVersoUrl,
  customer.document_type || "RG",
  GEMINI_API_KEY,
  frenteBase64 || undefined,  // Base64 da frente (NOVO!)
  undefined,
  fileBase64 || undefined     // Base64 do verso (NOVO!)
);
```

**Status:** ✅ CORRETO
- Base64 da frente salvo no banco
- Usado no OCR conjunto (frente + verso)
- Suporta RG e CNH

---

### **2. PROMPTS DO GEMINI** ✅

#### **A. Prompt Conta de Energia**

```
Você é um especialista em extrair dados de contas de energia elétrica brasileiras.
ANALISE ESTA IMAGEM DE CONTA DE ENERGIA e extraia os dados do CLIENTE.
IMPORTANTE: NÃO extraia CPF - o CPF será obtido do documento de identidade.

Extraia:
1. NOME do TITULAR
2. ENDEREÇO DE INSTALAÇÃO
3. NÚMERO do endereço
4. BAIRRO
5. CEP (8 dígitos)
6. CIDADE
7. ESTADO (sigla UF)
8. DISTRIBUIDORA
9. NÚMERO DA INSTALAÇÃO
10. VALOR TOTAL A PAGAR

Retorne APENAS JSON válido:
{"nome":"","endereco":"","numero":"","bairro":"","cep":"","cidade":"","estado":"","distribuidora":"","numeroInstalacao":"","valorConta":""}
```

**Status:** ✅ EXCELENTE
- Instruções claras e específicas
- Formato JSON estruturado
- Campos bem definidos

---

#### **B. Prompt RG Frente**

```
Você é um especialista em extrair dados da FRENTE do REGISTRO GERAL (RG) brasileiro.
ANALISE ESTA IMAGEM DA FRENTE do RG (pode ser RG novo ou RG antigo).

Na frente do RG brasileiro:
- NOME COMPLETO
- RG (Registro Geral): apenas dígitos (7 a 12)
- CPF: 11 dígitos (se visível)
- DATA DE NASCIMENTO: DD/MM/AAAA
- NOME DO PAI e NOME DA MÃE (se aparecerem)

REGRAS OBRIGATÓRIAS:
- Extraia SOMENTE o que está ESCRITO e LEGÍVEL. NUNCA invente.
- CPF: exatamente 11 dígitos (sem pontos/traços).
- RG: apenas números (7 a 12 dígitos).
- Data: estritamente DD/MM/AAAA.

Retorne APENAS este JSON:
{"nome":"","rg":"","cpf":"","dataNascimento":"","nomePai":"","nomeMae":""}
```

**Status:** ✅ EXCELENTE
- Instruções muito específicas
- Regras claras de validação
- Formato JSON estruturado

---

#### **C. Prompt RG Verso**

```
Você é um especialista em extrair dados do VERSO do REGISTRO GERAL (RG) brasileiro.
ESTA IMAGEM É DO VERSO (COSTAS) DO RG.

No verso do RG costumam aparecer:
- NÚMERO DO RG: apenas dígitos (7 a 12)
- CPF: 11 dígitos
- NOME COMPLETO (se legível)
- DATA DE NASCIMENTO: DD/MM/AAAA
- FILIAÇÃO: Nome do Pai e Nome da Mãe

REGRAS:
- Extraia SOMENTE o que estiver ESCRITO e LEGÍVEL. NUNCA invente.
- CPF: exatamente 11 dígitos (sem pontos/traços).
- RG: só números (7 a 12 dígitos).
- Data: estritamente DD/MM/AAAA.

Retorne APENAS um JSON válido:
{"nome":"","rg":"","cpf":"","dataNascimento":"","nomePai":"","nomeMae":""}
```

**Status:** ✅ EXCELENTE
- Prompt específico para verso
- Instruções claras
- Validação rigorosa

---

#### **D. Prompt CNH**

```
Você é um especialista em extrair dados da CARTEIRA NACIONAL DE HABILITAÇÃO (CNH) brasileira.
ANALISE ESTA IMAGEM DA FRENTE da CNH.

Na CNH (frente) os campos estão em posições padrão:
- NOME: nome do titular em destaque
- CPF: exatamente 11 dígitos
- DATA DE NASCIMENTO: DD/MM/AAAA
- RG / IDENTIDADE: apenas dígitos (7 a 12)

REGRAS OBRIGATÓRIAS:
- Extraia APENAS o que está ESCRITO e LEGÍVEL. NUNCA invente.
- CPF: exatamente 11 dígitos numéricos.
- RG: apenas números (7 a 12 dígitos).
- Data: estritamente DD/MM/AAAA.

Retorne APENAS este JSON:
{"nome":"","rg":"","cpf":"","dataNascimento":"","nomePai":"","nomeMae":""}
```

**Status:** ✅ EXCELENTE
- Específico para CNH
- Campos bem definidos
- Validação rigorosa

---

## 🧪 PLANO DE TESTES

### **TESTE 1: OCR Conta de Energia (PDF)** 🔴 PENDENTE

**Objetivo:** Verificar se o Gemini lê PDFs de alta qualidade

**Como testar:**
1. Enviar PDF de conta de energia via WhatsApp
2. Verificar logs da function

**Logs esperados:**
```
📥 Usando base64 da Evolution API
📥 Imagem Evolution: b64 len: XXXXX, tipo: application/pdf
📄 Detectado PDF - Gemini suporta PDF diretamente
🔍 OCR Conta - Imagem OK: application/pdf, b64 len: XXXXX
🔍 OCR Conta - Chamando Gemini 2.5 Flash...
🔍 OCR Conta - Gemini status: 200
🔍 OCR Conta - resposta: {"nome":"...","endereco":"...",...}
✅ OCR Conta OK: {"nome":"..."}
```

**Comando para ver logs:**
```bash
supabase functions logs evolution-webhook --follow
```

**Critérios de sucesso:**
- ✅ PDF detectado corretamente
- ✅ Base64 passado para Gemini
- ✅ Gemini retorna status 200
- ✅ Dados extraídos corretamente
- ✅ Nome, endereço, CEP, distribuidora, valor extraídos

---

### **TESTE 2: OCR Conta de Energia (Imagem JPG)** 🔴 PENDENTE

**Objetivo:** Verificar se o Gemini lê imagens JPG

**Como testar:**
1. Enviar foto JPG de conta de energia via WhatsApp
2. Verificar logs da function

**Logs esperados:**
```
📥 Usando base64 da Evolution API
📥 Imagem Evolution: b64 len: XXXXX, tipo: image/jpeg
🔍 OCR Conta - Imagem OK: image/jpeg, b64 len: XXXXX
🔍 OCR Conta - Chamando Gemini 2.5 Flash...
🔍 OCR Conta - Gemini status: 200
✅ OCR Conta OK: {"nome":"..."}
```

**Critérios de sucesso:**
- ✅ Imagem detectada corretamente
- ✅ Base64 passado para Gemini
- ✅ Gemini retorna status 200
- ✅ Dados extraídos corretamente

---

### **TESTE 3: OCR RG Frente** 🔴 PENDENTE

**Objetivo:** Verificar se o Gemini lê a frente do RG

**Como testar:**
1. Escolher "RG Novo" no bot
2. Enviar foto da frente do RG
3. Verificar logs

**Logs esperados:**
```
📥 Usando base64 da Evolution API
📥 Imagem Evolution: b64 len: XXXXX, tipo: image/jpeg
✅ Frente recebida!
📸 Agora envie o VERSO do RG
```

**Critérios de sucesso:**
- ✅ Frente recebida
- ✅ Base64 salvo em `document_front_base64`
- ✅ Bot pede o verso

---

### **TESTE 4: OCR RG Verso (com base64 da frente)** 🔴 PENDENTE

**Objetivo:** Verificar se o OCR usa base64 da frente + verso

**Como testar:**
1. Após enviar frente, enviar verso do RG
2. Verificar logs

**Logs esperados:**
```
📡 Chamando OCR documento (frente+verso)
📡 Frente base64: SIM, Verso base64: SIM
🔍 OCR Doc - Imagem OK: image/jpeg, tipo: RG, lado: frente
🔍 OCR Doc - Chamando Gemini 2.5 Flash...
🔍 OCR Doc - Gemini status: 200
✅ OCR Doc (frente+verso sempre) OK: {"nome":"...","cpf":"...","rg":"..."}
```

**Critérios de sucesso:**
- ✅ Base64 da frente recuperado do banco
- ✅ Base64 do verso passado
- ✅ OCR frente executado
- ✅ OCR verso executado
- ✅ Dados mesclados (frente tem prioridade)
- ✅ Nome, CPF, RG, data de nascimento extraídos

---

### **TESTE 5: OCR CNH (apenas frente)** 🔴 PENDENTE

**Objetivo:** Verificar se o OCR lê CNH corretamente

**Como testar:**
1. Escolher "CNH" no bot
2. Enviar foto da frente da CNH
3. Verificar logs

**Logs esperados:**
```
📡 Chamando OCR documento CNH (apenas frente)
🔍 OCR Doc - Imagem OK: image/jpeg, tipo: CNH, lado: frente
🔍 OCR Doc - Chamando Gemini 2.5 Flash...
✅ OCR CNH resultado: {"nome":"...","cpf":"...","rg":"..."}
```

**Critérios de sucesso:**
- ✅ CNH detectada
- ✅ Apenas frente processada (sem verso)
- ✅ Dados extraídos corretamente

---

### **TESTE 6: PDF Grande (>20MB)** 🔴 PENDENTE

**Objetivo:** Verificar alerta para PDFs muito grandes

**Como testar:**
1. Enviar PDF >20MB via WhatsApp
2. Verificar logs

**Logs esperados:**
```
📄 PDF baixado: 25.50 MB
⚠️ PDF muito grande (25.50 MB), pode falhar no Gemini
```

**Critérios de sucesso:**
- ✅ Alerta exibido
- ✅ Tentativa de processar mesmo assim
- ✅ Se falhar, mensagem clara ao usuário

---

### **TESTE 7: Imagem Ilegível** 🔴 PENDENTE

**Objetivo:** Verificar tratamento de erro quando imagem é ilegível

**Como testar:**
1. Enviar imagem borrada ou muito escura
2. Verificar logs e resposta

**Logs esperados:**
```
❌ Gemini sem candidates: (imagem ilegível?)
⚠️ Não consegui ler a conta. Tente enviar uma foto mais nítida.
```

**Critérios de sucesso:**
- ✅ Erro detectado
- ✅ Mensagem clara ao usuário
- ✅ Opção de reenviar

---

### **TESTE 8: Fluxo Completo** 🔴 PENDENTE

**Objetivo:** Testar todo o fluxo do início ao fim

**Como testar:**
1. Escanear QR Code
2. Enviar PDF da conta
3. Escolher tipo de documento
4. Enviar frente do documento
5. Enviar verso do documento
6. Confirmar dados
7. Finalizar cadastro

**Critérios de sucesso:**
- ✅ Todos os steps funcionam
- ✅ OCR extrai dados corretamente
- ✅ Base64 salvo e usado
- ✅ Upload MinIO com nomenclatura correta
- ✅ Cadastro criado no portal

---

## 📊 CHECKLIST DE VALIDAÇÃO

### **Código** ✅ 100%
- [x] Webhook passa base64 para OCR
- [x] Campo `document_front_base64` criado
- [x] Base64 da frente salvo
- [x] Base64 usado no OCR do verso
- [x] Detecção específica de PDF
- [x] Suporte a data URLs
- [x] Logs detalhados
- [x] Tratamento de erros

### **Prompts Gemini** ✅ 100%
- [x] Prompt conta de energia
- [x] Prompt RG frente
- [x] Prompt RG verso
- [x] Prompt CNH
- [x] Instruções claras
- [x] Validação rigorosa
- [x] Formato JSON estruturado

### **Testes** 🔴 0%
- [ ] Teste 1: PDF conta de energia
- [ ] Teste 2: JPG conta de energia
- [ ] Teste 3: RG frente
- [ ] Teste 4: RG verso (com base64 frente)
- [ ] Teste 5: CNH
- [ ] Teste 6: PDF grande
- [ ] Teste 7: Imagem ilegível
- [ ] Teste 8: Fluxo completo

---

## 🎯 PONTOS FORTES DO SISTEMA

### **1. Múltiplas Fontes de Mídia** ✅
- Base64 da Evolution API (prioridade 1)
- Data URLs (prioridade 2)
- Download via URL (prioridade 3)

### **2. Suporte Completo a PDF** ✅
- Detecção automática de PDF
- Gemini 2.5 Flash suporta PDF nativamente
- Alertas para PDFs grandes (>20MB)

### **3. OCR Inteligente** ✅
- Prompts específicos por tipo de documento
- Validação rigorosa de dados
- Mesclagem de dados (frente + verso)
- Prioridade para dados da frente

### **4. Tratamento de Erros** ✅
- Retry automático (até 2x)
- Mensagens claras ao usuário
- Logs detalhados para debug
- Fallback para coleta manual

### **5. Logs Detalhados** ✅
- Tipo de mídia detectado
- Tamanho do base64
- Status do Gemini
- Dados extraídos
- Erros e avisos

---

## 🔧 COMANDOS PARA TESTES

### **Ver logs em tempo real:**
```bash
supabase functions logs evolution-webhook --follow
```

### **Ver últimos 100 logs:**
```bash
supabase functions logs evolution-webhook --limit 100
```

### **Filtrar logs por palavra-chave:**
```bash
supabase functions logs evolution-webhook --follow | grep "OCR"
supabase functions logs evolution-webhook --follow | grep "PDF"
supabase functions logs evolution-webhook --follow | grep "Gemini"
```

### **Verificar banco:**
```sql
-- Ver últimos clientes com base64 salvo
SELECT 
  id, 
  name, 
  document_front_base64 IS NOT NULL as tem_base64_frente,
  document_front_url IS NOT NULL as tem_url_frente,
  document_back_url IS NOT NULL as tem_url_verso,
  conversation_step,
  created_at
FROM customers
ORDER BY created_at DESC
LIMIT 10;

-- Ver cliente específico
SELECT * FROM customers WHERE phone_whatsapp = '5511999998888';
```

---

## 📝 CONCLUSÃO DA ANÁLISE

### **Sistema está 100% preparado para:**
- ✅ Ler PDFs de alta qualidade
- ✅ Ler imagens JPG/PNG
- ✅ Processar RG (frente + verso)
- ✅ Processar CNH (apenas frente)
- ✅ Salvar base64 da frente
- ✅ Usar base64 no OCR conjunto
- ✅ Detectar e tratar erros
- ✅ Logs detalhados para debug

### **Falta apenas:**
- 🔴 Executar testes reais via WhatsApp
- 🔴 Validar com documentos reais
- 🔴 Confirmar extração de dados
- 🔴 Verificar nomenclatura MinIO

### **Próxima ação:**
**Executar TESTE 1** - Enviar PDF de conta de energia via WhatsApp e verificar logs!

---

**Versão:** 1.0.0  
**Data:** 13 de abril de 2026  
**Status:** ✅ ANÁLISE COMPLETA - PRONTO PARA TESTES

🔍 **SISTEMA 100% PREPARADO PARA TESTES!** 🔍

