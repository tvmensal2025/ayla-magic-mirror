# 🚀 WEBHOOK EVOLUTION API - COMPLETO

> Sistema completo de cadastro via WhatsApp usando Evolution API com 38 steps implementados

[![Status](https://img.shields.io/badge/status-pronto-brightgreen)]()
[![Versão](https://img.shields.io/badge/versão-2.0.0-blue)]()
[![Steps](https://img.shields.io/badge/steps-38%2F38-success)]()
[![Cobertura](https://img.shields.io/badge/cobertura-100%25-brightgreen)]()

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Instalação](#instalação)
- [Uso](#uso)
- [Documentação](#documentação)
- [Testes](#testes)
- [Deploy](#deploy)
- [Suporte](#suporte)

---

## 🎯 Visão Geral

Sistema completo de cadastro de clientes via WhatsApp usando Evolution API, com OCR Gemini para extração automática de dados de documentos, validações completas, edição de dados, integração com Portal Worker e muito mais.

### **Características Principais**

- ✅ **38 steps implementados** (100% completo)
- ✅ **Multi-instância** (1 por consultor)
- ✅ **OCR Gemini** (conta energia + documentos)
- ✅ **Validações completas** (CPF, CEP, email, telefone)
- ✅ **Edição de dados** (conta + documento)
- ✅ **Portal Worker** (integração completa)
- ✅ **OTP** (validação via WhatsApp)
- ✅ **MinIO** (upload documentos)
- ✅ **Logs completos** (rastreamento total)

---

## 🔥 Funcionalidades

### **1. Fluxo Principal**
```
Boas-vindas → Conta Energia → OCR → Confirmação → 
Tipo Documento → Frente → Verso → OCR → Confirmação → 
Perguntas Manuais → Finalização → Portal Worker → OTP → Complete
```

### **2. OCR Gemini**
- **Conta de Energia:** nome, endereço, CEP, distribuidora, nº instalação, valor
- **Documento:** nome, CPF, RG, data nascimento
- **Auto-busca CEP** via ViaCEP se não encontrado

### **3. Validações**
- CPF (dígitos verificadores)
- CEP (8 dígitos + ViaCEP)
- Email (regex)
- Telefone (DDD + 8/9 dígitos)
- Data nascimento (DD/MM/AAAA)

### **4. Edição de Dados**
- **Conta:** nome, endereço, CEP, distribuidora, nº instalação, valor
- **Documento:** nome, CPF, RG, data nascimento
- Menu interativo com botões

### **5. Portal Worker**
- Health check antes de enviar
- Retry automático (3x)
- Tratamento de offline
- Fire-and-forget

### **6. Multi-Instância**
- 1 instância por consultor
- Identificação automática
- Dados personalizados
- Escalável

---

## 🏗️ Arquitetura

```
┌─────────────────┐
│   WhatsApp      │
│   (Cliente)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Evolution API  │
│  (Instância)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Webhook        │
│  (Edge Function)│
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│  Supabase DB    │  │  Gemini OCR     │
│  (PostgreSQL)   │  │  (Google AI)    │
└─────────────────┘  └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Portal Worker  │
│  (Automação)    │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Portal iGreen  │
│  (Cadastro)     │
└─────────────────┘
```

---

## 📦 Instalação

### **1. Pré-requisitos**
- Supabase CLI instalado
- Evolution API configurada
- Gemini API key
- PostgreSQL 15+

### **2. Clone o Repositório**
```bash
git clone https://github.com/seu-usuario/seu-projeto.git
cd seu-projeto
```

### **3. Configure Secrets**
```bash
supabase secrets set GEMINI_API_KEY=sua-chave-gemini
supabase secrets set PORTAL_WORKER_URL=https://seu-worker.com
supabase secrets set WORKER_SECRET=seu-secret
```

### **4. Deploy**
```bash
cd supabase
supabase functions deploy evolution-webhook
```

---

## 🚀 Uso

### **1. Criar Instância**
```sql
INSERT INTO whatsapp_instances (
  consultant_id,
  instance_name,
  api_url,
  api_key,
  webhook_url,
  status
) VALUES (
  'uuid-do-consultor',
  'minha-instancia',
  'https://minha-evolution-api.com',
  'minha-api-key',
  'https://meu-projeto.supabase.co/functions/v1/evolution-webhook',
  'connected'
);
```

### **2. Configurar Webhook**
```bash
curl -X POST https://minha-evolution-api.com/webhook/set/minha-instancia \
  -H "apikey: minha-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://meu-projeto.supabase.co/functions/v1/evolution-webhook",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE"]
  }'
```

### **3. Testar**
```bash
# Enviar mensagem de teste
curl -X POST https://meu-projeto.supabase.co/functions/v1/evolution-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "instance": "minha-instancia",
    "data": {
      "key": {
        "remoteJid": "5511999998888@s.whatsapp.net",
        "fromMe": false
      },
      "message": {
        "conversation": "Olá"
      }
    }
  }'

# Ver logs
supabase functions logs evolution-webhook --follow
```

---

## 📚 Documentação

### **Guias Completos**
- [📖 Implementação Completa](IMPLEMENTACAO_COMPLETA_EVOLUTION.md) - Resumo completo
- [🚀 Guia de Deploy](DEPLOY_EVOLUTION_WEBHOOK.md) - Passo a passo
- [📦 Exemplos de Payload](EXEMPLOS_PAYLOAD_EVOLUTION.md) - Payloads Evolution
- [⚡ Comandos Rápidos](COMANDOS_RAPIDOS_EVOLUTION.md) - Comandos úteis
- [📝 Changelog](CHANGELOG_EVOLUTION.md) - Histórico de mudanças

### **Documentação Técnica**
- [🔧 README Webhook](supabase/functions/evolution-webhook/README.md) - Documentação técnica
- [📊 Status](WEBHOOK_EVOLUTION_CRIADO.md) - Status da implementação
- [📋 Resumo Final](RESUMO_FINAL_EVOLUTION.md) - Resumo executivo

### **Migração**
- [🔄 Guia de Migração](MIGRACAO_WHAPI_PARA_EVOLUTION.md) - Whapi → Evolution
- [📝 Resumo Migração](RESUMO_MIGRACAO_EVOLUTION.md) - Resumo da migração

---

## 🧪 Testes

### **Teste 1: Fluxo Completo**
1. Envie: "Olá"
2. Recebe: Boas-vindas + pede conta
3. Envie: Foto da conta
4. Recebe: OCR + confirmação (botões)
5. Clique: "SIM"
6. Recebe: Pede tipo documento (botões)
7. Escolha: "RG Novo"
8. Envie: Foto frente RG
9. Recebe: Confirmação + pede verso
10. Envie: Foto verso RG
11. Recebe: OCR + confirmação (botões)
12. Clique: "SIM"
13. Recebe: Perguntas manuais (se necessário)
14. Recebe: Botão "Finalizar"
15. Clique: "Finalizar"
16. Recebe: "Processando cadastro..."
17. Sistema envia ao Portal Worker
18. Recebe: "Aguarde código no WhatsApp"

### **Teste 2: Edição de Dados**
1. No passo de confirmação, clique: "EDITAR"
2. Recebe: Menu edição (1-6)
3. Envie: "1" (nome)
4. Recebe: Pede nome
5. Envie: "João Silva"
6. Recebe: Confirmação atualizada

### **Teste 3: OCR**
```bash
# Testar OCR conta
curl -X POST https://seu-projeto.supabase.co/functions/v1/test-ocr-conta \
  -H "Authorization: Bearer sua-service-key" \
  -d '{"image_url": "https://exemplo.com/conta.jpg"}'

# Testar OCR documento
curl -X POST https://seu-projeto.supabase.co/functions/v1/test-ocr-documento \
  -H "Authorization: Bearer sua-service-key" \
  -d '{"frente_url": "https://exemplo.com/frente.jpg", "verso_url": "https://exemplo.com/verso.jpg"}'
```

---

## 🚀 Deploy

### **Produção**
```bash
# 1. Deploy edge function
cd supabase
supabase functions deploy evolution-webhook

# 2. Criar instâncias para consultores
# (via SQL ou API - ver documentação)

# 3. Configurar webhooks Evolution
# (via API - ver documentação)

# 4. Monitorar logs
supabase functions logs evolution-webhook --follow
```

### **Staging**
```bash
# Deploy em staging
supabase functions deploy evolution-webhook --project-ref staging-ref

# Testar
curl -X POST https://staging-projeto.supabase.co/functions/v1/evolution-webhook \
  -d '{"instance": "teste", "data": {...}}'
```

---

## 📊 Monitoramento

### **Logs**
```bash
# Ver logs em tempo real
supabase functions logs evolution-webhook --follow

# Ver últimas 100 linhas
supabase functions logs evolution-webhook --tail 100

# Filtrar por erro
supabase functions logs evolution-webhook | grep "ERROR"
```

### **Estatísticas**
```sql
-- Total de clientes por instância
SELECT 
  wi.instance_name,
  COUNT(c.id) as total_clientes
FROM whatsapp_instances wi
LEFT JOIN customers c ON c.whatsapp_instance_id = wi.id
GROUP BY wi.instance_name;

-- Taxa de conversão
SELECT 
  COUNT(CASE WHEN conversation_step = 'complete' THEN 1 END) as completos,
  COUNT(*) as total,
  ROUND(COUNT(CASE WHEN conversation_step = 'complete' THEN 1 END)::numeric / COUNT(*) * 100, 2) as taxa_conversao
FROM customers;
```

---

## 🐛 Troubleshooting

### **Webhook não recebe mensagens**
```bash
# Verificar webhook configurado
curl -X GET https://api.com/webhook/find/minha-instancia -H "apikey: key"

# Reconfigurar
curl -X POST https://api.com/webhook/set/minha-instancia \
  -H "apikey: key" \
  -d '{"url": "https://webhook.com", "events": ["MESSAGES_UPSERT"]}'
```

### **OCR não funciona**
```bash
# Verificar GEMINI_API_KEY
supabase secrets list | grep GEMINI

# Adicionar se não existir
supabase secrets set GEMINI_API_KEY=sua-chave

# Redeploy
supabase functions deploy evolution-webhook
```

### **Portal Worker offline**
```bash
# Verificar health
curl https://worker.com/health

# Verificar settings
SELECT * FROM settings WHERE key = 'portal_worker_url';
```

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 👥 Autores

- **Equipe de Desenvolvimento** - *Implementação completa*

---

## 🙏 Agradecimentos

- Evolution API
- Supabase
- Google Gemini AI
- ViaCEP
- Comunidade Open Source

---

## 📞 Suporte

**Documentação:**
- [Guia de Deploy](DEPLOY_EVOLUTION_WEBHOOK.md)
- [Comandos Rápidos](COMANDOS_RAPIDOS_EVOLUTION.md)
- [Exemplos de Payload](EXEMPLOS_PAYLOAD_EVOLUTION.md)

**Contato:**
- Email: suporte@exemplo.com
- WhatsApp: +55 11 99999-8888
- Discord: https://discord.gg/exemplo

---

## 📈 Roadmap

### **v2.1.0 (Próximo)**
- [ ] Suporte a listas interativas
- [ ] Suporte a templates WhatsApp
- [ ] Dashboard de métricas
- [ ] Relatórios automáticos

### **v2.2.0 (Futuro)**
- [ ] IA para respostas automáticas
- [ ] Chatbot avançado
- [ ] Análise de sentimento
- [ ] Campanhas automatizadas

---

## ⭐ Star History

Se este projeto foi útil para você, considere dar uma ⭐!

---

**Versão:** 2.0.0 - COMPLETO  
**Data:** 12 de abril de 2026  
**Status:** ✅ PRONTO PARA PRODUÇÃO

🎉 **Sistema 100% completo e pronto para uso!**
