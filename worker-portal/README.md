# 🚀 Portal Worker - iGreen Energy

Automação com Playwright para preencher automaticamente o portal iGreen.

## 📋 Requisitos

- Node.js 18+
- Chromium (instalado automaticamente via Playwright)
- xvfb (para rodar headless no servidor)

## 🔧 Instalação

```bash
npm install
```

## ⚙️ Configuração

Criar arquivo `.env`:

```bash
# Servidor
PORT=3100
NODE_ENV=production
HEADLESS=1

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Worker
WORKER_SECRET=igreen-worker-secret-2024

# iGreen
IGREEN_CONSULTOR_ID=124170

# Chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

## 🚀 Executar

### Local (desenvolvimento)
```bash
npm start
```

### Docker
```bash
docker build -t portal-worker .
docker run -p 3100:3100 --env-file .env portal-worker
```

### Com xvfb (servidor sem display)
```bash
xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" node server.mjs
```

## 📊 Endpoints

### POST /submit-lead
Adicionar lead na fila de processamento

**Headers:**
```
Authorization: Bearer {WORKER_SECRET}
Content-Type: application/json
```

**Body:**
```json
{
  "customer_id": "uuid-do-cliente"
}
```

### GET /health
Verificar status do serviço

### GET /dashboard
Dashboard visual com fila e atividades

### GET /queue
Ver fila de processamento

### GET /status
Status completo com atividades

## 🐳 Deploy no Easypanel

1. Criar serviço no Easypanel
2. Configurar GitHub:
   - Repositório: `tvmensal2025/viana-replica-vault`
   - Branch: `main`
   - Caminho de Build: `/worker-portal`
3. Configurar variáveis de ambiente
4. Implantar

## 📝 Logs

```bash
# Ver logs em tempo real
docker logs -f container-id

# Dashboard
open http://localhost:3100/dashboard
```

## 🔧 Troubleshooting

### Chromium não abre
- Verificar se xvfb está instalado
- Verificar se CMD usa `xvfb-run`

### Leads não processam
- Verificar se SUPABASE_URL está configurado
- Verificar logs do container

### Health check falha
- Verificar se porta 3100 está exposta
- Verificar se serviço está rodando

## 📚 Documentação

- [REGRAS_PORTAL_WORKER.md](../REGRAS_PORTAL_WORKER.md) - Regras completas
- [INICIO_AQUI_PORTAL_WORKER.md](../INICIO_AQUI_PORTAL_WORKER.md) - Guia rápido

## 📞 Suporte

- Dashboard: http://localhost:3100/dashboard
- Health: http://localhost:3100/health
- Queue: http://localhost:3100/queue

---

**Versão:** 5.1.0  
**Autor:** iGreen Energy  
**Licença:** MIT
