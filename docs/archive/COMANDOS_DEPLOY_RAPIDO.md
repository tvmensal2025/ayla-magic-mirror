# ⚡ COMANDOS RÁPIDOS PARA DEPLOY

> **Copie e cole estes comandos para fazer o deploy completo**
> 
> **Tempo total:** 19 minutos

---

## 🚀 SEQUÊNCIA COMPLETA

### **1. Login no Supabase** (1 min)

```bash
supabase login
```

**O que vai acontecer:**
- Abrirá o navegador
- Faça login com sua conta Supabase
- Token será salvo automaticamente

---

### **2. Linkar Projeto** (1 min)

**Primeiro, obtenha o PROJECT_REF:**
1. Acesse: https://supabase.com/dashboard
2. Clique no seu projeto
3. A URL será: `https://supabase.com/dashboard/project/[PROJECT_REF]`
4. Copie o `PROJECT_REF` (exemplo: `abcdefgh`)

**Depois execute:**
```bash
supabase link --project-ref SEU_PROJECT_REF
```

**Substitua `SEU_PROJECT_REF` pelo ID real do seu projeto!**

---

### **3. Aplicar Migration** (1 min)

```bash
cd supabase
supabase db push
```

**O que vai fazer:**
- Adicionar coluna `document_front_base64` na tabela `customers`

---

### **4. Deploy evolution-webhook** (2 min)

```bash
supabase functions deploy evolution-webhook
```

**O que vai fazer:**
- Atualizar webhook com correções de OCR
- PDFs de alta qualidade serão lidos corretamente

---

### **5. Deploy upload-documents-minio** (2 min)

```bash
supabase functions deploy upload-documents-minio
```

**O que vai fazer:**
- Criar função de upload no MinIO
- Nomenclatura: `nome_sobrenome_data_tipo.ext`

---

### **6. Configurar Variáveis MinIO** (2 min)

**IMPORTANTE: Substitua as credenciais reais!**

```bash
supabase secrets set MINIO_SERVER_URL=https://console-igreen-minio.d9v83a.easypanel.host
supabase secrets set MINIO_ROOT_USER=SEU_USUARIO_MINIO
supabase secrets set MINIO_ROOT_PASSWORD=SUA_SENHA_MINIO
supabase secrets set MINIO_BUCKET=igreen
```

**Onde encontrar as credenciais:**
- Acesse o painel do MinIO
- Ou verifique o arquivo `.env` do projeto
- Ou pergunte ao administrador do sistema

---

### **7. Verificar Deploy** (1 min)

```bash
# Listar functions deployadas
supabase functions list

# Listar secrets configurados
supabase secrets list

# Ver logs em tempo real
supabase functions logs evolution-webhook --follow
```

---

## 📋 CHECKLIST

Execute os comandos na ordem e marque:

- [ ] `supabase login` ✅
- [ ] `supabase link --project-ref ...` ✅
- [ ] `cd supabase` ✅
- [ ] `supabase db push` ✅
- [ ] `supabase functions deploy evolution-webhook` ✅
- [ ] `supabase functions deploy upload-documents-minio` ✅
- [ ] `supabase secrets set MINIO_SERVER_URL=...` ✅
- [ ] `supabase secrets set MINIO_ROOT_USER=...` ✅
- [ ] `supabase secrets set MINIO_ROOT_PASSWORD=...` ✅
- [ ] `supabase secrets set MINIO_BUCKET=igreen` ✅
- [ ] `supabase functions list` (verificar) ✅
- [ ] `supabase secrets list` (verificar) ✅

---

## 🧪 TESTES (10 min)

### **Teste 1: OCR com PDF**

1. Abra o WhatsApp do bot
2. Envie um PDF de conta de energia
3. Verifique os logs:
   ```bash
   supabase functions logs evolution-webhook --follow
   ```
4. Procure por:
   - "📄 Detectado PDF"
   - "✅ OCR Conta OK"

---

### **Teste 2: Base64 da Frente**

1. Escolha "RG Novo"
2. Envie foto da frente do documento
3. Verifique logs: "📡 Frente base64: SIM"
4. Envie foto do verso
5. Verifique logs: "📡 Frente base64: SIM, Verso base64: SIM"

---

### **Teste 3: Upload MinIO**

1. Complete o cadastro
2. Verifique logs:
   - "📦 Iniciando upload MinIO"
   - "📝 Nome base: nome_sobrenome_data"
   - "✅ Conta uploaded"
   - "✅ Doc frente uploaded"
   - "✅ Doc verso uploaded"

---

### **Teste 4: Nomenclatura**

1. Acesse MinIO: https://console-igreen-minio.d9v83a.easypanel.host
2. Navegue: bucket "igreen" → pasta "documentos"
3. Verifique arquivos:
   - `nome_sobrenome_19930720_conta.pdf`
   - `nome_sobrenome_19930720_doc_frente.jpg`
   - `nome_sobrenome_19930720_doc_verso.jpg`

---

## 🔧 TROUBLESHOOTING

### **Erro: "Not logged in"**
```bash
supabase login
```

### **Erro: "Project not linked"**
```bash
supabase link --project-ref SEU_PROJECT_REF
```

### **Erro: "Function not found"**
```bash
# Verificar se está na pasta correta
pwd
# Deve estar em: /caminho/para/projeto/supabase

# Se não estiver:
cd supabase
```

### **Erro: "Migration failed"**
```bash
# Ver detalhes do erro
supabase db push --debug

# Se coluna já existir, pode ignorar (migration usa IF NOT EXISTS)
```

### **Erro: "MinIO connection failed"**
```bash
# Verificar secrets
supabase secrets list

# Reconfigurar se necessário
supabase secrets set MINIO_SERVER_URL=...
```

---

## 📊 VERIFICAÇÃO FINAL

### **Tudo funcionando?**

```bash
# 1. Verificar functions
supabase functions list
# Deve mostrar:
# - evolution-webhook
# - upload-documents-minio

# 2. Verificar secrets
supabase secrets list
# Deve mostrar:
# - MINIO_SERVER_URL
# - MINIO_ROOT_USER
# - MINIO_ROOT_PASSWORD
# - MINIO_BUCKET

# 3. Ver logs
supabase functions logs evolution-webhook --follow
# Deve mostrar logs em tempo real

# 4. Testar via WhatsApp
# Enviar mensagem e verificar resposta
```

---

## ✅ DEPLOY COMPLETO!

Se todos os comandos executaram sem erro:

- ✅ Migration aplicada
- ✅ Functions deployadas
- ✅ Secrets configurados
- ✅ Sistema 100% funcional

**Próximo passo:** Testar via WhatsApp! 🎉

---

## 📞 COMANDOS ÚTEIS

### **Ver logs em tempo real:**
```bash
# Evolution webhook
supabase functions logs evolution-webhook --follow

# Upload MinIO
supabase functions logs upload-documents-minio --follow
```

### **Ver últimos 100 logs:**
```bash
supabase functions logs evolution-webhook --limit 100
```

### **Atualizar function:**
```bash
# Após modificar código
supabase functions deploy evolution-webhook
```

### **Atualizar secret:**
```bash
supabase secrets set NOME_SECRET=novo_valor
```

### **Deslinkar projeto:**
```bash
supabase unlink
```

### **Ver status:**
```bash
supabase status
```

---

## 🎯 RESUMO

**Comandos essenciais:**
1. `supabase login`
2. `supabase link --project-ref SEU_PROJECT_REF`
3. `cd supabase && supabase db push`
4. `supabase functions deploy evolution-webhook`
5. `supabase functions deploy upload-documents-minio`
6. `supabase secrets set ...` (4 variáveis)

**Tempo total:** 9 minutos de comandos + 10 minutos de testes = 19 minutos

**Resultado:** Sistema 100% funcional! ✅

---

**Versão:** 1.0.0  
**Data:** 13 de abril de 2026  
**Status:** 📋 GUIA RÁPIDO DE DEPLOY

⚡ **COPIE E COLE OS COMANDOS!** ⚡

