# 🧪 TESTE RÁPIDO DA IA (GEMINI)

> **Testes rápidos para verificar se o Gemini está funcionando**
> 
> **Data:** 13 de abril de 2026

---

## 🎯 OBJETIVO

Verificar se a API do Gemini está:
- ✅ Acessível
- ✅ Extraindo dados corretamente
- ✅ Processando imagens/PDFs

---

## 📊 STATUS ATUAL

### **Configuração** ✅
```bash
# Verificar se a chave está configurada
supabase secrets list | grep GEMINI

# Output esperado:
# GEMINI_API_KEY | caa7ebdb9c5da0422dc484d3776dfc733dbfd9621e4119e571da6b0fb55d3e1b
```

**Status:** ✅ Chave configurada no Supabase

---

## 🧪 TESTES DISPONÍVEIS

### **TESTE 1: Via Logs da Function** ⭐ RECOMENDADO

**Como fazer:**
1. Enviar uma mensagem de teste via WhatsApp
2. Ver logs em tempo real

```bash
supabase functions logs evolution-webhook --follow
```

**Logs esperados:**
```
📥 Usando base64 da Evolution API
🔍 OCR Conta - Chamando Gemini 2.5 Flash...
🔍 OCR Conta - Gemini status: 200
✅ OCR Conta OK: {"nome":"..."}
```

**Critérios de sucesso:**
- ✅ `Gemini status: 200`
- ✅ Dados extraídos no JSON
- ✅ Sem erros de API

---

### **TESTE 2: Via Dashboard Supabase**

**Como fazer:**
1. Acessar: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions
2. Clicar em `evolution-webhook`
3. Ver logs recentes
4. Procurar por:
   - `Gemini status: 200`
   - `OCR Conta OK`
   - `OCR Doc OK`

**Critérios de sucesso:**
- ✅ Logs mostram status 200
- ✅ Dados extraídos corretamente
- ✅ Sem erros de timeout

---

### **TESTE 3: Teste Manual via WhatsApp** ⭐ MAIS CONFIÁVEL

**Como fazer:**

1. **Escanear QR Code** de um consultor
2. **Enviar mensagem:** "Oi"
3. **Bot responde:** Pede foto da conta
4. **Enviar foto** de uma conta de energia (JPG ou PDF)
5. **Aguardar** processamento (5-10 segundos)
6. **Verificar resposta:**
   - Bot deve mostrar dados extraídos
   - Nome, endereço, CEP, valor, etc.

**Logs esperados:**
```bash
# Terminal 1: Ver logs
supabase functions logs evolution-webhook --follow

# Logs que devem aparecer:
📥 Usando base64 da Evolution API
📥 Imagem Evolution: b64 len: XXXXX, tipo: image/jpeg
🔍 OCR Conta - Imagem OK: image/jpeg, b64 len: XXXXX
🔍 OCR Conta - Chamando Gemini 2.5 Flash...
🔍 OCR Conta - Gemini status: 200
🔍 OCR Conta - resposta: {"nome":"João Silva",...}
✅ OCR Conta OK: {"nome":"João Silva","endereco":"Rua X",...}
```

**Critérios de sucesso:**
- ✅ Bot recebe a imagem
- ✅ Gemini retorna status 200
- ✅ Dados extraídos corretamente
- ✅ Bot mostra os dados ao usuário

---

### **TESTE 4: Verificar Últimos Clientes no Banco**

**Como fazer:**
```sql
-- Conectar ao banco via Supabase Dashboard
-- SQL Editor: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/editor

-- Ver últimos clientes processados
SELECT 
  id,
  name,
  address_street,
  cep,
  electricity_bill_value,
  conversation_step,
  created_at
FROM customers
WHERE name IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

**Critérios de sucesso:**
- ✅ Clientes têm nome preenchido
- ✅ Endereço preenchido
- ✅ CEP preenchido
- ✅ Valor da conta preenchido
- ✅ Step avançou após OCR

---

## 🔍 DIAGNÓSTICO DE PROBLEMAS

### **Problema 1: Gemini retorna erro 429**

**Causa:** Rate limit excedido

**Solução:**
- Aguardar 1 minuto
- Tentar novamente
- Sistema tem retry automático (2x)

**Logs:**
```
❌ Gemini erro: {"error":{"code":429,"message":"Resource exhausted"}}
```

---

### **Problema 2: Gemini retorna erro 400**

**Causa:** Imagem muito grande ou formato inválido

**Solução:**
- Verificar tamanho da imagem
- Verificar formato (JPG, PNG, PDF)
- Verificar se base64 está correto

**Logs:**
```
❌ Gemini erro: {"error":{"code":400,"message":"Invalid image"}}
```

---

### **Problema 3: Gemini sem candidates**

**Causa:** Imagem ilegível ou muito borrada

**Solução:**
- Pedir ao usuário para enviar foto mais nítida
- Verificar iluminação
- Verificar se documento está completo

**Logs:**
```
❌ Gemini sem candidates: (imagem ilegível?)
⚠️ Não consegui ler a conta. Tente enviar uma foto mais nítida.
```

---

### **Problema 4: Timeout**

**Causa:** Gemini demorou muito para responder

**Solução:**
- Sistema tem retry automático
- Timeout configurado: 30 segundos
- Se persistir, verificar status da API Gemini

**Logs:**
```
❌ OCR Conta erro: timeout
```

---

## 📊 MÉTRICAS DE SUCESSO

### **Taxa de Sucesso Esperada:**
- ✅ **Imagens JPG/PNG:** 95%+ de sucesso
- ✅ **PDFs de boa qualidade:** 90%+ de sucesso
- ⚠️ **PDFs escaneados ruins:** 70-80% de sucesso
- ❌ **Imagens borradas:** 30-50% de sucesso

### **Tempo de Resposta:**
- ⚡ **Imagens pequenas (<1MB):** 2-5 segundos
- ⏱️ **Imagens médias (1-5MB):** 5-10 segundos
- 🐌 **PDFs grandes (>5MB):** 10-20 segundos

---

## ✅ CHECKLIST DE VALIDAÇÃO

### **Configuração** ✅
- [x] GEMINI_API_KEY configurada no Supabase
- [x] Edge functions deployadas
- [x] Código atualizado com correções

### **Testes Básicos** 🔴 PENDENTE
- [ ] Teste 1: Ver logs da function
- [ ] Teste 2: Dashboard Supabase
- [ ] Teste 3: WhatsApp com foto JPG
- [ ] Teste 4: WhatsApp com PDF
- [ ] Teste 5: Verificar banco de dados

### **Testes Avançados** 🔴 PENDENTE
- [ ] PDF de alta qualidade
- [ ] Imagem borrada (deve falhar graciosamente)
- [ ] PDF muito grande (>20MB)
- [ ] Múltiplos documentos em sequência

---

## 🚀 TESTE RÁPIDO AGORA

### **Opção 1: Via WhatsApp (5 minutos)** ⭐

```bash
# Terminal 1: Ver logs
supabase functions logs evolution-webhook --follow

# Terminal 2: Enviar mensagem via WhatsApp
# 1. Escanear QR Code
# 2. Enviar "Oi"
# 3. Enviar foto da conta
# 4. Ver logs no Terminal 1
```

**Resultado esperado:**
- ✅ Logs mostram "Gemini status: 200"
- ✅ Dados extraídos corretamente
- ✅ Bot responde com dados

---

### **Opção 2: Via Banco de Dados (2 minutos)**

```sql
-- Ver últimos clientes com dados extraídos
SELECT 
  name,
  address_street,
  cep,
  electricity_bill_value,
  created_at
FROM customers
WHERE name IS NOT NULL
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;
```

**Resultado esperado:**
- ✅ Clientes recentes têm dados preenchidos
- ✅ Nome, endereço, CEP extraídos
- ✅ Valor da conta extraído

---

### **Opção 3: Via Logs do Dashboard (1 minuto)**

1. Acessar: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions/evolution-webhook/logs
2. Procurar por: "Gemini status: 200"
3. Verificar se há erros recentes

**Resultado esperado:**
- ✅ Logs mostram status 200
- ✅ Sem erros de API
- ✅ Dados extraídos

---

## 🎯 CONCLUSÃO

### **Para confirmar que a IA está funcionando:**

1. **Ver logs em tempo real:**
   ```bash
   supabase functions logs evolution-webhook --follow
   ```

2. **Enviar teste via WhatsApp:**
   - Escanear QR Code
   - Enviar foto da conta
   - Ver resposta do bot

3. **Verificar logs:**
   - Procurar por "Gemini status: 200"
   - Procurar por "OCR Conta OK"
   - Verificar dados extraídos

**Se todos os 3 passos funcionarem:** ✅ IA está 100% funcional!

---

## 📞 COMANDOS ÚTEIS

```bash
# Ver logs em tempo real
supabase functions logs evolution-webhook --follow

# Ver últimos 100 logs
supabase functions logs evolution-webhook --limit 100

# Filtrar logs do Gemini
supabase functions logs evolution-webhook --follow | grep "Gemini"

# Filtrar logs de OCR
supabase functions logs evolution-webhook --follow | grep "OCR"

# Ver erros
supabase functions logs evolution-webhook --follow | grep "❌"
```

---

**Versão:** 1.0.0  
**Data:** 13 de abril de 2026  
**Status:** 📋 GUIA DE TESTES - PRONTO PARA EXECUTAR

🧪 **EXECUTE O TESTE AGORA VIA WHATSAPP!** 🧪

