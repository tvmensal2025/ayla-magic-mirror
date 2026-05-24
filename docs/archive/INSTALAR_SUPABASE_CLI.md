# 🔧 INSTALAR SUPABASE CLI - GUIA COMPLETO

> **Guia para instalar Supabase CLI no macOS**
> 
> **Data:** 13 de abril de 2026

---

## ⚠️ SITUAÇÃO ATUAL

**Problema:** Nenhum gerenciador de pacotes encontrado no sistema
- ❌ Homebrew não instalado
- ❌ npm não instalado
- ❌ yarn não instalado
- ❌ pnpm não instalado
- ❌ bun não instalado

---

## 🚀 OPÇÕES DE INSTALAÇÃO

### **OPÇÃO 1: Instalar Homebrew + Supabase CLI** ⭐ RECOMENDADO

**Passo 1: Instalar Homebrew**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Passo 2: Instalar Supabase CLI**
```bash
brew install supabase/tap/supabase
```

**Passo 3: Verificar instalação**
```bash
supabase --version
```

**Tempo:** ~5 minutos

---

### **OPÇÃO 2: Instalar Node.js + npm + Supabase CLI**

**Passo 1: Baixar Node.js**
1. Acesse: https://nodejs.org/
2. Baixe a versão LTS (recomendada)
3. Instale o .pkg

**Passo 2: Verificar instalação**
```bash
node --version
npm --version
```

**Passo 3: Instalar Supabase CLI**
```bash
npm install -g supabase
```

**Passo 4: Verificar instalação**
```bash
supabase --version
```

**Tempo:** ~10 minutos

---

### **OPÇÃO 3: Download Direto (Binário)**

**Passo 1: Baixar binário**
```bash
# Intel Mac
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_darwin_amd64.tar.gz -o supabase.tar.gz

# Apple Silicon (M1/M2/M3)
curl -L https://github.com/supabase/cli/releases/latest/download/supabase_darwin_arm64.tar.gz -o supabase.tar.gz
```

**Passo 2: Extrair**
```bash
tar -xzf supabase.tar.gz
```

**Passo 3: Mover para PATH**
```bash
sudo mv supabase /usr/local/bin/
```

**Passo 4: Dar permissão de execução**
```bash
sudo chmod +x /usr/local/bin/supabase
```

**Passo 5: Verificar instalação**
```bash
supabase --version
```

**Tempo:** ~3 minutos

---

### **OPÇÃO 4: Usar Docker** (Se Docker estiver instalado)

**Verificar se Docker está instalado:**
```bash
docker --version
```

**Se Docker estiver instalado:**
```bash
# Criar alias
echo 'alias supabase="docker run --rm -v $(pwd):/workspace -w /workspace supabase/cli"' >> ~/.zshrc
source ~/.zshrc

# Testar
supabase --version
```

**Tempo:** ~2 minutos

---

## 🎯 RECOMENDAÇÃO

### **Para desenvolvedores:**
**OPÇÃO 1** (Homebrew) - Mais fácil de manter atualizado

### **Para uso rápido:**
**OPÇÃO 3** (Binário direto) - Mais rápido

### **Se já tem Node.js:**
**OPÇÃO 2** (npm) - Aproveita instalação existente

---

## 📋 APÓS INSTALAR

### **1. Verificar instalação**
```bash
supabase --version
# Deve mostrar: supabase version X.X.X
```

### **2. Fazer login**
```bash
supabase login
# Abrirá navegador para autenticar
```

### **3. Linkar projeto**
```bash
# Obter project-ref do dashboard Supabase
# URL: https://supabase.com/dashboard/project/[PROJECT_REF]

supabase link --project-ref seu-project-ref
```

### **4. Testar conexão**
```bash
supabase projects list
# Deve mostrar seus projetos
```

---

## 🚀 COMANDOS ÚTEIS

### **Aplicar migrations:**
```bash
cd supabase
supabase db push
```

### **Deploy edge functions:**
```bash
supabase functions deploy evolution-webhook
supabase functions deploy upload-documents-minio
```

### **Configurar secrets:**
```bash
supabase secrets set MINIO_SERVER_URL=https://...
supabase secrets set MINIO_ROOT_USER=usuario
supabase secrets set MINIO_ROOT_PASSWORD=senha
supabase secrets set MINIO_BUCKET=igreen
```

### **Ver logs:**
```bash
supabase functions logs evolution-webhook --follow
supabase functions logs upload-documents-minio --follow
```

### **Listar functions:**
```bash
supabase functions list
```

### **Listar secrets:**
```bash
supabase secrets list
```

---

## 🔧 TROUBLESHOOTING

### **Problema: "command not found: supabase"**

**Causa:** Supabase CLI não está no PATH

**Solução:**
```bash
# Verificar onde está instalado
which supabase

# Se não encontrar, reinstalar
# Opção 1: Homebrew
brew install supabase/tap/supabase

# Opção 2: npm
npm install -g supabase

# Opção 3: Adicionar ao PATH manualmente
echo 'export PATH="/usr/local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

### **Problema: "Permission denied"**

**Causa:** Falta permissão de execução

**Solução:**
```bash
sudo chmod +x /usr/local/bin/supabase
```

---

### **Problema: "Failed to authenticate"**

**Causa:** Não fez login

**Solução:**
```bash
supabase login
# Seguir instruções no navegador
```

---

### **Problema: "Project not linked"**

**Causa:** Não linkou o projeto

**Solução:**
```bash
# Obter project-ref do dashboard
supabase link --project-ref seu-project-ref
```

---

## 📝 ALTERNATIVA: DEPLOY VIA DASHBOARD

Se não conseguir instalar Supabase CLI, pode fazer deploy via Dashboard:

### **1. Migration:**
1. Acesse: https://supabase.com/dashboard/project/SEU_PROJECT/editor
2. Clique em "SQL Editor"
3. Cole o SQL da migration
4. Clique em "Run"

### **2. Edge Functions:**
1. Acesse: https://supabase.com/dashboard/project/SEU_PROJECT/functions
2. Clique em "Create a new function" ou "Deploy new version"
3. Cole o código
4. Clique em "Deploy"

### **3. Secrets:**
1. Acesse: https://supabase.com/dashboard/project/SEU_PROJECT/settings/functions
2. Adicione as variáveis de ambiente
3. Salve

---

## 🎯 PRÓXIMOS PASSOS

### **Após instalar Supabase CLI:**

1. **Login**
   ```bash
   supabase login
   ```

2. **Link projeto**
   ```bash
   supabase link --project-ref seu-project-ref
   ```

3. **Aplicar migration**
   ```bash
   cd supabase
   supabase db push
   ```

4. **Deploy functions**
   ```bash
   supabase functions deploy evolution-webhook
   supabase functions deploy upload-documents-minio
   ```

5. **Configurar secrets**
   ```bash
   supabase secrets set MINIO_SERVER_URL=https://console-igreen-minio.d9v83a.easypanel.host
   supabase secrets set MINIO_ROOT_USER=seu_usuario
   supabase secrets set MINIO_ROOT_PASSWORD=sua_senha
   supabase secrets set MINIO_BUCKET=igreen
   ```

6. **Testar**
   ```bash
   supabase functions logs evolution-webhook --follow
   ```

---

## 📞 LINKS ÚTEIS

- **Supabase CLI Docs:** https://supabase.com/docs/guides/cli
- **Supabase CLI GitHub:** https://github.com/supabase/cli
- **Homebrew:** https://brew.sh/
- **Node.js:** https://nodejs.org/

---

## ✅ CHECKLIST

- [ ] Gerenciador de pacotes instalado (Homebrew ou npm)
- [ ] Supabase CLI instalado
- [ ] `supabase --version` funciona
- [ ] `supabase login` executado
- [ ] Projeto linkado
- [ ] Pronto para deploy

---

**Versão:** 1.0.0  
**Data:** 13 de abril de 2026  
**Status:** 📋 GUIA DE INSTALAÇÃO

🔧 **ESCOLHA UMA OPÇÃO E INSTALE!** 🔧

---

## 🎯 RECOMENDAÇÃO FINAL

**Mais rápido:** OPÇÃO 3 (Binário direto) - 3 minutos  
**Mais fácil:** OPÇÃO 1 (Homebrew) - 5 minutos  
**Sem CLI:** Dashboard Supabase - 0 minutos (já disponível)

**Escolha a opção que preferir e siga os passos!** 🚀
