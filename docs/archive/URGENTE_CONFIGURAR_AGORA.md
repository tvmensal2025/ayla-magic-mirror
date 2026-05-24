# 🚨 URGENTE - Configure AGORA para Funcionar

## ❌ Por que não está funcionando?

Você vê "Servidor instável" porque a **Edge Function do Supabase ainda não tem as configurações do novo servidor**.

## ✅ Solução (2 minutos)

### 1. Abra este link:
https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/settings/functions

### 2. Procure por "Environment Variables" ou "Variáveis de Ambiente"

### 3. Adicione estas 2 variáveis:

**Variável 1:**
```
Nome: EVOLUTION_API_URL
Valor: https://igreen-evolution-api.d9v63q.easypanel.host
```

**Variável 2:**
```
Nome: EVOLUTION_API_KEY
Valor: 429683C4C977415CAAFCCE10F7D57E11
```

### 4. Clique em SAVE/SALVAR

### 5. Aguarde 30 segundos

### 6. No sistema:
- Faça **LOGOUT**
- Faça **LOGIN** novamente
- Vá na aba **WhatsApp**
- Clique em **"Cancelar"** e tente criar nova conexão

---

## 🎯 O que vai acontecer depois:

✅ O QR Code vai aparecer
✅ Você vai conseguir conectar o WhatsApp
✅ Não vai mais aparecer "Servidor instável"

---

## 📸 Onde configurar no Supabase:

```
Supabase Dashboard
  └─ Settings (menu lateral)
      └─ Edge Functions
          └─ Environment Variables
              └─ [+ Add Variable]
```

---

## ⏱️ Tempo estimado: 2 minutos

**Faça isso AGORA para o sistema funcionar!**

Depois volte aqui e me avise que configurou, para eu te ajudar a testar! 🚀
