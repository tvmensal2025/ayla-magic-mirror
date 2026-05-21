# Modo Game no /admin + PWA instalável no celular

## 1. Modo Game — nova aba "Captação" no /admin do consultor

**Diagnóstico:** O componente `CaptacaoPanel` (que contém o `GameModeToggle`) existe em `src/components/captacao/CaptacaoPanel.tsx`, mas não está montado em nenhuma página. Por isso o consultor não acha. A aba "Captação" do SuperAdmin é outra coisa (diagnóstico IA).

**Mudanças** (em `src/pages/Admin.tsx`):
- Adicionar `"captacao"` ao tipo do `activeTab`.
- Lazy-load: `const CaptacaoPanel = lazy(() => import("@/components/captacao/CaptacaoPanel"))`.
- Adicionar item na lista de abas com label **"Captação"** e ícone `Gamepad2` (lucide).
- Render condicional: `{activeTab === "captacao" && <CaptacaoPanel consultantId={userId} onOpenChat={(phone) => { setActiveTab("whatsapp"); setPendingChatPhone(phone); }} />}`.
- Suportar `?tab=captacao` na URL inicial.

Resultado: o consultor abre /admin → clica "Captação" → vê o toggle "Modo Game ON/OFF" + som + painel do jogo.

## 2. PWA — instalar no celular (manifest-only, sem service worker)

**Diagnóstico:** Já existe `public/manifest.json` válido (display standalone, theme color, ícones) e o link no `index.html`. Para o "Adicionar à tela inicial" funcionar bem no iOS e Android falta apenas:
- Meta tags Apple no `<head>` do `index.html`:
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
  - `<meta name="apple-mobile-web-app-title" content="iGreen" />`
  - `<meta name="mobile-web-app-capable" content="yes" />`
  - `<meta name="format-detection" content="telephone=no" />`
- Liberar zoom (acessibilidade) no viewport: remover `maximum-scale=1.0, user-scalable=no` ou trocar por `viewport-fit=cover`.
- Adicionar `id` e `scope` ao manifest para travar a identidade do PWA:
  - `"id": "/admin"`, `"scope": "/"`, `"lang": "pt-BR"`, `"categories": ["business","productivity"]`.
- Adicionar `shortcuts` ao manifest (atalhos no ícone): WhatsApp, CRM, Captação.

**Botão "Instalar app" + tela /install** (componente novo):
- `src/components/admin/InstallPwaButton.tsx`: escuta `beforeinstallprompt`, mostra botão "📱 Instalar app" no header do /admin quando o evento dispara (Android/Chrome). Em iOS Safari (sem `beforeinstallprompt`), mostra modal com instrução visual "Toque em Compartilhar → Adicionar à Tela de Início".
- Detecta `display-mode: standalone` para esconder o botão quando já instalado.
- Persiste dismiss em `localStorage`.

**Não usaremos** `vite-plugin-pwa` / service worker. Motivos:
- Lovable preview roda em iframe; SW quebra o preview e o usuário não precisa de offline.
- Manifest puro já basta para "Adicionar à tela inicial" em iOS + Android.

## Arquivos
- editar `src/pages/Admin.tsx` (nova aba)
- editar `index.html` (meta tags Apple + viewport)
- editar `public/manifest.json` (id/scope/shortcuts/lang)
- criar `src/components/admin/InstallPwaButton.tsx`
- montar `<InstallPwaButton />` no header de `/admin`

## Fora de escopo
- Push notifications, offline cache, sync.
- Reformatar visualmente o painel Captação (só montar o que já existe).
