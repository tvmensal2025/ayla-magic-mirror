# ⚠️ AÇÃO NECESSÁRIA - Configurar Supabase

## 🔴 Problema Atual

O frontend está rodando, mas ainda está tentando conectar ao **servidor antigo** porque as variáveis de ambiente da Edge Function do Supabase **NÃO foram atualizadas**.

## ✅ O QUE VOCÊ PRECISA FAZER AGORA

### 1️⃣ Acesse o Supabase Dashboard

**Link direto:** https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/settings/functions

### 2️⃣ Configure estas 2 variáveis de ambiente:

```
EVOLUTION_API_URL=https://igreen-evolution-api.d9v63q.easypanel.host
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
```

### 3️⃣ Salve as configurações

Clique em **Save** ou **Update**

### 4️⃣ Aguarde alguns segundos

As variáveis podem levar alguns segundos para serem aplicadas.

### 5️⃣ Teste no frontend

1. **Faça logout** (se estiver logado)
2. **Faça login novamente** (para renovar o token)
3. **Vá na aba WhatsApp**
4. **Clique em "Atualizar agora"** ou **"Cancelar"** e tente criar uma nova conexão

---

## 🔍 Como Saber se Funcionou?

### ✅ Sinais de sucesso:
- O QR Code aparece na tela
- Não aparece mais "Servidor instável"
- Status muda para "Aguardando QR Code" ou "Conectando..."

### ❌ Se continuar com erro:
- Verifique se as variáveis foram salvas corretamente
- Verifique os logs da Edge Function
- Pode ser necessário fazer redeploy da Edge Function

---

## 📊 Passo a Passo Visual

### No Supabase Dashboard:

1. **Settings** (menu lateral esquerdo)
2. **Edge Functions** 
3. **Environment Variables**
4. **Add Variable** ou **Edit**
5. Adicione:
   - Nome: `EVOLUTION_API_URL`
   - Valor: `https://igreen-evolution-api.d9v63q.easypanel.host`
6. **Add Variable** novamente
7. Adicione:
   - Nome: `EVOLUTION_API_KEY`
   - Valor: `429683C4C977415CAAFCCE10F7D57E11`
8. **Save**

---

## 🚨 IMPORTANTE

**SEM ESSAS VARIÁVEIS, O SISTEMA NÃO VAI FUNCIONAR!**

O frontend está rodando corretamente, mas a Edge Function ainda está tentando conectar ao servidor antigo (ou não tem as configurações).

---

## 🔗 Links Úteis

- **Supabase Project**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl
- **Edge Functions Settings**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/settings/functions
- **Edge Function Logs**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions/evolution-proxy/logs

---

## 📝 Depois de Configurar

1. Aguarde 10-30 segundos
2. Faça logout/login no sistema
3. Tente criar uma nova conexão WhatsApp
4. O QR Code deve aparecer!

**Faça isso AGORA para o sistema funcionar! 🚀**
