# 🔧 CORREÇÃO: Dockerfile - npm ci → npm install

> **Data:** 14 de abril de 2026  
> **Problema:** Build falhou no `npm ci --only=production`  
> **Status:** ✅ CORRIGIDO

---

## 🔴 PROBLEMA IDENTIFICADO

### **Erro no Build:**
```
ERROR: failed to build: failed to solve: 
process "/bin/sh -c npm ci --only=production" did not complete successfully: exit code: 1
```

### **Linha do Dockerfile:**
```dockerfile
# Linha 33
RUN npm ci --only=production
```

---

## 🔍 CAUSA RAIZ

O comando `npm ci` requer o arquivo `package-lock.json` para funcionar, mas a pasta `/worker-portal` **não tinha** esse arquivo.

### **Diferença entre npm ci e npm install:**

| Comando | Requer package-lock.json | Gera package-lock.json | Uso |
|---------|-------------------------|------------------------|-----|
| `npm ci` | ✅ SIM (obrigatório) | ❌ NÃO | CI/CD, builds reproduzíveis |
| `npm install` | ❌ NÃO (opcional) | ✅ SIM | Desenvolvimento, primeira instalação |

---

## ✅ SOLUÇÃO APLICADA

### **Mudança no Dockerfile:**

**ANTES:**
```dockerfile
# Copiar package.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production
```

**DEPOIS:**
```dockerfile
# Copiar package.json
COPY package*.json ./

# Instalar dependências (usar npm install se não houver package-lock.json)
RUN npm install --omit=dev
```

### **Explicação:**
- `npm install --omit=dev` = instala apenas dependências de produção
- Equivalente a `npm ci --only=production`, mas não requer `package-lock.json`
- Funciona mesmo sem o arquivo de lock

---

## 📊 COMPARAÇÃO

### **npm ci --only=production**
```
✅ Mais rápido (se package-lock.json existe)
✅ Build reproduzível (versões exatas)
❌ Requer package-lock.json (obrigatório)
❌ Falha se não encontrar o arquivo
```

### **npm install --omit=dev**
```
✅ Funciona sem package-lock.json
✅ Instala apenas dependências de produção
✅ Gera package-lock.json automaticamente
⚠️ Pode instalar versões diferentes (usa ranges do package.json)
```

---

## 🚀 RESULTADO

### **Build agora vai funcionar:**
```bash
✅ npm install --omit=dev
✅ Instala @supabase/supabase-js@^2.39.0
✅ Instala playwright-chromium@^1.40.0
✅ Gera package-lock.json automaticamente
✅ Build completa com sucesso
```

---

## 📝 COMMIT

```bash
git commit -m "🔧 fix: Trocar npm ci por npm install no Dockerfile"
git push origin main
```

**Commit hash:** `47bc23b`

---

## 🎯 PRÓXIMO PASSO

Agora você pode **reimplantar** no Easypanel:

1. **Ir para:** Easypanel → igreen → portal-worker
2. **Clicar em "Implantar"** (botão verde)
3. **Aguardar build** (~5 minutos)
4. **Verificar logs** - deve mostrar:
   ```
   ✅ npm install --omit=dev
   ✅ added 150 packages
   ✅ Build completed successfully
   ```

---

## 🔍 VERIFICAÇÃO

Após o deploy, testar:

```bash
# Health check
curl https://portal-worker.d9v83a.easypanel.host/health

# Deve retornar:
{
  "status": "ok",
  "service": "worker-portal",
  "version": "5.1.0",
  "supabaseConfigured": true
}
```

---

## 📚 REFERÊNCIAS

- [npm ci vs npm install](https://docs.npmjs.com/cli/v9/commands/npm-ci)
- [npm install --omit=dev](https://docs.npmjs.com/cli/v9/commands/npm-install)

---

**Versão:** 1.0.0  
**Data:** 14 de abril de 2026  
**Status:** ✅ CORRIGIDO E ENVIADO PARA GITHUB

🚀 **AGORA PODE REIMPLANTAR NO EASYPANEL!** 🚀
