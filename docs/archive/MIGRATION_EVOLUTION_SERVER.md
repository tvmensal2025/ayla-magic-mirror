# Migração do Servidor Evolution API

## 📋 Resumo da Mudança

Você está migrando o servidor Evolution API de um servidor antigo para um novo servidor hospedado em:
- **Nova URL**: `https://igreen-evolution-api.d9v63q.easypanel.host` (HTTPS)
- **Status**: ✅ Servidor testado e funcionando!

## 🔍 Arquitetura Atual

O sistema usa uma arquitetura de proxy:
1. **Frontend** → chama `src/services/evolutionApi.ts`
2. **evolutionApi.ts** → envia requisições para Supabase Edge Function
3. **Supabase Edge Function** (`evolution-proxy`) → faz proxy para o servidor Evolution API real
4. **Servidor Evolution API** → processa as requisições do WhatsApp

## ✅ O Que Precisa Ser Alterado

### 1. Variáveis de Ambiente do Supabase Edge Function

A Edge Function `supabase/functions/evolution-proxy/index.ts` lê duas variáveis de ambiente:

```typescript
const evolutionUrlRaw = Deno.env.get("EVOLUTION_API_URL");
const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
```

**AÇÃO NECESSÁRIA:**

Você precisa atualizar as variáveis de ambiente no **Supabase Dashboard**:

1. Acesse: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/settings/functions
2. Configure as seguintes variáveis:

```bash
EVOLUTION_API_URL=https://igreen-evolution-api.d9v63q.easypanel.host
EVOLUTION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
```

**IMPORTANTE:** 
- ⚠️ Use **HTTPS** (não HTTP) - o servidor redireciona automaticamente
- A URL **NÃO** deve incluir `/manager` no final (o código já remove isso automaticamente)
- Use a URL base: `https://igreen-evolution-api.d9v63q.easypanel.host`
- A API Key é: `429683C4C977415CAAFCCE10F7D57E11` (do seu arquivo de configuração)
- ✅ **Servidor testado e funcionando corretamente!**

### 2. Verificar Configurações do Novo Servidor

Certifique-se de que o novo servidor Evolution API está configurado com:

```env
AUTHENTICATION_API_KEY=429683C4C977415CAAFCCE10F7D57E11
SERVER_URL=https://igreen-evolution-api.d9v63q.easypanel.host
CORS_ORIGIN=*
CORS_CREDENTIALS=true
```

**Status:** ✅ Servidor já está configurado e respondendo corretamente!

### 3. Testar a Conexão

Após atualizar as variáveis de ambiente no Supabase:

1. **Reinicie a Edge Function** (pode ser necessário fazer um redeploy)
2. **Teste a conexão** no frontend:
   - Faça logout e login novamente
   - Tente criar uma nova instância do WhatsApp
   - Verifique se o QR Code é gerado corretamente

## 🔧 Mudanças no Código (NÃO NECESSÁRIAS)

**Boa notícia:** Você **NÃO precisa alterar nenhum código** no frontend!

O arquivo `src/services/evolutionApi.ts` já está configurado corretamente para usar o proxy do Supabase. A única mudança necessária é nas variáveis de ambiente da Edge Function.

## 📝 Checklist de Migração

- [ ] Atualizar `EVOLUTION_API_URL` no Supabase Dashboard
- [ ] Atualizar `EVOLUTION_API_KEY` no Supabase Dashboard
- [ ] Verificar configurações do novo servidor Evolution API
- [ ] Redeploy da Edge Function (se necessário)
- [ ] Testar criação de instância
- [ ] Testar envio de mensagens
- [ ] Testar recebimento de mensagens
- [ ] Verificar logs da Edge Function para erros

## 🐛 Troubleshooting

### Se aparecer erro "Configuração do serviço de conexão incompleta"
- Verifique se as variáveis `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` estão configuradas no Supabase

### Se aparecer erro de timeout
- Verifique se o novo servidor está acessível
- Teste manualmente: `curl https://igreen-evolution-api.d9v63q.easypanel.host/instance/fetchInstances -H "apikey: 429683C4C977415CAAFCCE10F7D57E11"`
- ✅ Servidor testado e funcionando!

### Se aparecer erro de CORS
- Verifique se `CORS_ORIGIN=*` está configurado no servidor Evolution API

## 📊 Monitoramento

Após a migração, monitore:
1. **Logs da Edge Function** no Supabase Dashboard
2. **Logs do servidor Evolution API** no Easypanel
3. **Comportamento do frontend** (criação de instâncias, envio de mensagens)

## 🔗 Links Úteis

- **Supabase Project**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl
- **Edge Functions**: https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/settings/functions
- **Novo Servidor Evolution**: https://igreen-evolution-api.d9v63q.easypanel.host/manager

---

## ✅ Resultado do Teste

**Status:** 🟢 SERVIDOR FUNCIONANDO

```bash
$ curl https://igreen-evolution-api.d9v63q.easypanel.host/instance/fetchInstances \
  -H "apikey: 429683C4C977415CAAFCCE10F7D57E11"

[]  # Resposta OK - sem instâncias criadas ainda
```

**Próximo passo:** Configure as variáveis no Supabase e teste no frontend!
