#!/bin/bash
set -e

echo "[entrypoint] Criando diretórios necessários..."
mkdir -p /app/screenshots /app/fixtures /app/tmp

echo "[entrypoint] Iniciando portal-worker na porta ${PORT:-3100}..."
exec node server.mjs
