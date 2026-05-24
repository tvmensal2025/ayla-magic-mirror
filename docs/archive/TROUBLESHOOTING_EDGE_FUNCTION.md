# 🔧 Troubleshooting - Edge Function não está usando novas configurações

## 🔴 Problema

Você configurou as variáveis no Supabase, mas o sistema ainda mostra "Servidor lento" e não gera o QR Code.

## 🎯 Possíveis Causas

### 1. Edge Function não foi redeployada

As variáveis de ambiente só são aplicadas quando a função é redeployada.

**Solução:**
1. Acesse: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions
2. Encontre a função `evolution-proxy`
3. Clique em **Deploy** ou **Redeploy** ou **...** (três pontos) → **Redeploy**
4. Aguarde o deploy terminar (pode levar 1-2 minutos)
5. Teste novamente no frontend

### 2. Variáveis configuradas no lugar errado

As variáveis precisam estar em **Edge Functions → Environment Variables**, não em **Project Settings**.

**Verificar:**
1. Acesse: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/settings/functions
2. Procure por "Environment Variables" ou "Secrets"
3. Verifique se as variáveis estão lá:
   - `EVOLUTION_API_URL=https://igreen-evolution-api.d9v63q.easypanel.host`
   - `EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11`

### 3. Typo no nome das variáveis

Os nomes precisam ser EXATAMENTE:
- `EVOLUTION_API_URL` (não `EVOLUTION_URL` ou `API_URL`)
- `EVOLUTION_API_KEY` (não `EVOLUTION_KEY` ou `API_KEY`)

### 4. Cache do navegador

O token antigo pode estar em cache.

**Solução:**
1. Abra o DevTools (F12)
2. Vá na aba **Application** ou **Storage**
3. Limpe o **localStorage**
4. Ou faça logout/login novamente

### 5. Edge Function ainda não pegou as variáveis

Pode levar alguns minutos para as variáveis serem aplicadas.

**Solução:**
- Aguarde 2-3 minutos
- Faça um hard refresh (Ctrl+Shift+R ou Cmd+Shift+R)
- Tente novamente

---

## 🔍 Como Verificar se as Variáveis Estão Aplicadas

### Opção 1: Verificar os Logs da Edge Function

1. Acesse: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions/evolution-proxy/logs
2. Procure por linhas como:
   ```
   [evolution-proxy] EVOLUTION_API_URL(normalized): https://igreen-evolution-api...
   [evolution-proxy] EVOLUTION_API_KEY configured: true
   ```
3. Se aparecer `NOT SET` ou `false`, as variáveis não foram aplicadas

### Opção 2: Testar com Script

Execute o script de teste:
```bash
bash test-supabase-proxy.sh
```

Você vai precisar do token de acesso. Para obter:
1. Abra o DevTools (F12)
2. Console
3. Digite: `JSON.parse(localStorage.getItem('sb-zlzasfhcxcznaprrragl-auth-token')).access_token`
4. Copie o token

---

## ✅ Checklist de Verificação

- [ ] Variáveis configuradas em **Edge Functions → Environment Variables**
- [ ] Nomes das variáveis corretos (EVOLUTION_API_URL e EVOLUTION_API_KEY)
- [ ] Valores das variáveis corretos (HTTPS, não HTTP)
- [ ] Edge Function redeployada
- [ ] Aguardou 2-3 minutos após configurar
- [ ] Fez logout/login no frontend
- [ ] Limpou cache do navegador
- [ ] Verificou os logs da Edge Function

---

## 🚨 Se NADA Funcionar

### Última Opção: Recriar a Edge Function

Se as variáveis não estão sendo aplicadas, pode ser necessário recriar a função.

**Passos:**
1. Faça backup do código da função (já está em `supabase/functions/evolution-proxy/index.ts`)
2. Delete a função no Supabase Dashboard
3. Crie uma nova função com o mesmo nome
4. Cole o código novamente
5. Configure as variáveis
6. Deploy

---

## 📞 Próximos Passos

1. **PRIMEIRO**: Tente fazer **redeploy da Edge Function**
2. **SEGUNDO**: Verifique os **logs** para ver se as variáveis aparecem
3. **TERCEIRO**: Aguarde 2-3 minutos e teste novamente
4. **QUARTO**: Se nada funcionar, me avise para tentarmos outra abordagem

---

## 🔗 Links Úteis

- **Edge Functions**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions
- **Environment Variables**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/settings/functions
- **Logs**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions/evolution-proxy/logs
