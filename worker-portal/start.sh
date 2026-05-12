#!/bin/bash
set -e

echo "=== WORKER VPS COM noVNC ==="

# 1. Iniciar Xvfb (display virtual)
echo "[start] Iniciando Xvfb..."
Xvfb :99 -screen 0 1280x900x24 -ac &
export DISPLAY=:99
sleep 1

# 2. Iniciar x11vnc (servidor VNC conectado ao display)
echo "[start] Iniciando x11vnc..."
x11vnc -display :99 -forever -nopw -shared -rfbport 5900 -bg -o /tmp/x11vnc.log
sleep 1

# 3. Iniciar noVNC/websockify (ponte WebSocket na porta 6080)
echo "[start] Iniciando noVNC na porta 6080..."
websockify --web=/usr/share/novnc/ 6080 localhost:5900 &
sleep 1

echo "[start] noVNC disponível em http://localhost:6080/vnc.html"

# 4. Iniciar servidor Node
echo "[start] Iniciando servidor Node na porta ${PORT:-3100}..."
exec node server.mjs
