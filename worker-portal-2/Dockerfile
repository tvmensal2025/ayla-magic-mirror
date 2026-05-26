# Dockerfile — Worker Portal 2 (autoconexao) — API direta via Playwright tunnel
#
# Diferenças vs worker-portal original:
#   - Não roda Xvfb/VNC (não tem UI pra mostrar; é só HTTP)
#   - Imagem mais leve (Playwright Chromium ainda precisa, pra TLS fingerprint)
#   - Cmd direto sem start.sh

FROM node:20-bookworm-slim

LABEL service="worker-portal-2"
LABEL portal="green.igreenenergy.com.br/autoconexao"
LABEL version="v1.0-2026.05.26"

# Deps mínimas do Chromium headless (sem display server)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 curl \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN mkdir -p /tmp fixtures

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Chromium do Playwright + deps
RUN npx playwright install chromium
RUN npx playwright install-deps chromium

# Copiar todo o código
COPY *.mjs ./

ENV NODE_ENV=production
ENV PORT=3101
ENV HEADLESS=1

EXPOSE 3101

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3101/health || exit 1

CMD ["node", "server.mjs"]
