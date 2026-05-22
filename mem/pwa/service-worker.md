---
name: PWA Service Worker
description: vite-plugin-pwa com guards de iframe/preview; só registra em produção real
type: feature
---
PWA habilitado via vite-plugin-pwa (autoUpdate, NetworkFirst para HTML, NetworkOnly para Supabase/MinIO). Registro do SW em src/main.tsx é guardado: NUNCA registra em iframe, id-preview--*, *.lovableproject.com, localhost — nesses casos desregistra qualquer SW antigo. Manifest fica em /public/manifest.json (manifest:false no plugin). Página /install detecta iOS/Android/desktop e usa beforeinstallprompt quando disponível. start_url=/admin?source=pwa para telemetria GA4 de uso instalado.
