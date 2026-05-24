# ✅ SUPABASE CLI INSTALADO COM SUCESSO

> **Supabase CLI instalado e pronto para uso**
> 
> **Data:** 13 de abril de 2026  
> **Versão:** 2.84.2

---

## ✅ INSTALAÇÃO CONCLUÍDA

### **Método usado:**
- Download direto do binário (Apple Silicon ARM64)
- Instalado em: `~/.local/bin/supabase`
- PATH configurado em: `~/.zshrc`

### **Verificação:**
```bash
supabase --version
# Output: 2.84.2 ✅
```

---

## 🚀 PRÓXIMOS PASSOS PARA DEPLOY

### **PASSO 1: Login no Supabase** 🔴 PENDENTE

```bash
supabase login
```

**O que vai acontecer:**
- Abrirá o navegador para autenticação
- Você fará login com sua conta Supabase
- Token será salvo localmente

**Tempo:** 1 minuto

---

### **PASSO 2: Linkar o Projeto** 🔴 PENDENTE

```bash
# Obter o project-ref do dashboard Supabase
# URL: https://supabase.com/dashboard/project/[PROJECT_REF]
# Exemplo: se a URL for https://supabase.com/dashboard/project/abcdefgh
# Então PROJECT_REF = abcdefgh

supabase link --project-ref SEU_PROJECT_REF
```

**Tempo:** 1 minuto

---

### **PASSO 3: Aplicar Migration** 🔴 PENDENTE

```bash
# Navegar para a pasta supabase
cd supabase

# Aplicar migration
supabase db push
```

**O que vai fazer:**
- Adicionar coluna `document_front_base64` na tabela `customers`
- Necessário para salvar base64 da frente do documento

**Tempo:** 1 minuto

---

### **PASSO 4: Deploy evolution-webhook** 🔴 PENDENTE

```bash
# Ainda na pasta supabase
supabase functions deploy evolution-webhook
```

**O que vai fazer:**
- Atualizar webhook com correções de OCR
- Webhook agora passa base64 para OCR
- PDFs de alta qualidade serão lidos corretamente

**Tempo:** 2 minutos

---

### **PASSO 5: Deploy upload-documents-minio** 🔴 PENDENTE

```bash
# Ainda na pasta supabase
supabase functions deploy upload-documents-minio
```

**O que vai fazer:**
- Criar nova edge function para upload no MinIO
- Nomenclatura padronizada: `nome_sobrenome_data_tipo.ext`

**Tempo:** 2 minutos

---

### **PASSO 6: Configurar Variáveis MinIO** 🔴 PENDENTE

```bash
# Configurar credenciais do MinIO
supabase secrets set MINIO_SERVER_URL=https://console-igreen-minio.d9v83a.easypanel.host
supabase secrets set MINIO_ROOT_USER=SEU_USUARIO
supabase secrets set MINIO_ROOT_PASSWORD=SUA_SENHA
supabase secrets set MINIO_BUCKET=igreen
```

**Importante:**
- Substitua `SEU_USUARIO` pelo usuário real do MinIO
- Substitua `SUA_SENHA` pela senha real do MinIO

**Tempo:** 2 minutos

---

### **PASSO 7: Testar Tudo** 🔴 PENDENTE

```bash
# Ver logs em tempo real
supabase functions logs evolution-webhook --follow
```

**Testes a fazer:**
1. Enviar PDF de conta de energia via WhatsApp
2. Verificar logs: "📄 Detectado PDF"
3. Verificar logs: "✅ OCR Conta OK"
4. Enviar foto da frente do documento
5. Enviar foto do verso do documento
6. Verificar logs: "📦 Iniciando upload MinIO"
7. Verificar logs: "✅ Todos os arquivos uploaded"
8. Acessar MinIO e verificar nomenclatura dos arquivos

**Tempo:** 10 minutos

---

## ⏱️ TEMPO TOTAL ESTIMADO

```
Login:                1 minuto
Linkar projeto:       1 minuto
Migration:            1 minuto
Deploy webhook:       2 minutos
Deploy upload:        2 minutos
Configurar MinIO:     2 minutos
Testes:              10 minutos
─────────────────────────────
TOTAL:               19 minutos
```

---

## 📋 CHECKLIST COMPLETO

### **Instalação** ✅ 100%
- [x] Supabase CLI baixado
- [x] Binário extraído
- [x] Movido para ~/.local/bin
- [x] Permissão de execução dada
- [x] PATH configurado
- [x] Versão verificada (2.84.2)

### **Deploy** 🔴 0%
- [ ] Login no Supabase
- [ ] Projeto linkado
- [ ] Migration aplicada
- [ ] evolution-webhook deployado
- [ ] upload-documents-minio deployado
- [ ] Variáveis MinIO configuradas

### **Testes** 🔴 0%
- [ ] OCR PDF testado
- [ ] Base64 frente testado
- [ ] Upload MinIO testado
- [ ] Nomenclatura testada
- [ ] Fluxo completo testado

---

## 🎯 COMANDOS RÁPIDOS

### **Sequência completa de deploy:**

```bash
# 1. Login
supabase login

# 2. Linkar projeto (substitua SEU_PROJECT_REF)
supabase link --project-ref SEU_PROJECT_REF

# 3. Aplicar migration
cd supabase
supabase db push

# 4. Deploy functions
supabase functions deploy evolution-webhook
supabase functions deploy upload-documents-minio

# 5. Configurar MinIO (substitua credenciais)
supabase secrets set MINIO_SERVER_URL=https://console-igreen-minio.d9v83a.easypanel.host
supabase secrets set MINIO_ROOT_USER=SEU_USUARIO
supabase secrets set MINIO_ROOT_PASSWORD=SUA_SENHA
supabase secrets set MINIO_BUCKET=igreen

# 6. Ver logs
supabase functions logs evolution-webhook --follow
```

**Copie e cole os comandos acima, substituindo:**
- `SEU_PROJECT_REF` pelo ID do seu projeto
- `SEU_USUARIO` pelo usuário do MinIO
- `SUA_SENHA` pela senha do MinIO

---

## 🔧 COMANDOS ÚTEIS

### **Ver projetos:**
```bash
supabase projects list
```

### **Ver functions:**
```bash
supabase functions list
```

### **Ver secrets:**
```bash
supabase secrets list
```

### **Ver logs:**
```bash
# Evolution webhook
supabase functions logs evolution-webhook --follow

# Upload MinIO
supabase functions logs upload-documents-minio --follow
```

### **Testar function:**
```bash
# Testar upload MinIO
curl -X POST https://seu-projeto.supabase.co/functions/v1/upload-documents-minio \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"uuid-de-teste"}'
```

---

## 📊 STATUS ATUAL

```
┌─────────────────────────────────────────────────────────┐
│                    STATUS ATUAL                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  CÓDIGO:        ████████████████████████  100% ✅       │
│  GITHUB:        ████████████████████████  100% ✅       │
│  CLI:           ████████████████████████  100% ✅       │
│  DEPLOY:        ░░░░░░░░░░░░░░░░░░░░░░░░    0% 🔴       │
│  TESTES:        ░░░░░░░░░░░░░░░░░░░░░░░░    0% 🔴       │
│                                                          │
│  TOTAL:         ████████████░░░░░░░░░░░░   60% 🟡       │
│                                                          │
└─────────────────────────────────────────────────────────┘

PRÓXIMO PASSO: Login e Deploy (19 minutos)
```

---

## 🎉 RESUMO

### **O que está pronto:**
- ✅ Código 100% corrigido
- ✅ Código no GitHub
- ✅ Supabase CLI instalado
- ✅ Documentação completa

### **O que falta:**
- 🔴 Login no Supabase (1 min)
- 🔴 Linkar projeto (1 min)
- 🔴 Aplicar migration (1 min)
- 🔴 Deploy 2 functions (4 min)
- 🔴 Configurar MinIO (2 min)
- 🔴 Testar tudo (10 min)

### **Tempo total:** 19 minutos

---

## 🚀 PRÓXIMA AÇÃO

**Execute agora:**

```bash
supabase login
```

Depois me avise que fez login para continuarmos com o deploy! 🚀

---

**Versão:** 1.0.0  
**Data:** 13 de abril de 2026  
**Status:** ✅ CLI INSTALADO - PRONTO PARA DEPLOY

