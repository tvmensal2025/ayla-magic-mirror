# Dockerfile para Worker VPS - Portal iGreen
# VERSÃO 11.3 - 2026-04-21 (CORRIGIDO: copia todos os arquivos + npm ci)

FROM node:20-bookworm-slim

LABEL version="v11.3-2026.04.21"
LABEL changelog="fix-dockerfile-copy-all,npm-ci,package-lock"

# Instalar dependências do sistema para Playwright + VNC + noVNC
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 curl \
    xvfb x11vnc novnc websockify \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Criar estrutura de diretórios
WORKDIR /app
RUN mkdir -p /tmp screenshots fixtures

# Copiar package.json + package-lock.json e instalar dependências
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Instalar Playwright e Chromium
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Copiar TODOS os arquivos de código (.mjs, .html, .sh)
COPY *.mjs ./
COPY *.html ./
COPY start.sh ./
RUN chmod +x start.sh

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3100
ENV HEADLESS=1
ENV DISPLAY=:99
ENV WORKER_VERSION=v11.4-2026.04.24

# Expor portas: 3100 (API) + 6080 (noVNC web)
EXPOSE 3100 6080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

# Iniciar via script (Xvfb + x11vnc + noVNC + Node)
CMD ["./start.sh"]
