# Ativar PWA para escalar

Hoje o projeto já tem `manifest.json` + meta tags (`apple-mobile-web-app-capable`, theme-color, icons), então o app **já é instalável** ("Adicionar à tela inicial") em iOS e Android. O que falta para um PWA "de verdade" é o **service worker** (cache, carregamento offline, atualização automática).

## ⚠️ Aviso importante (Lovable)

PWA com service worker **não funciona no preview do editor** (iframe). Só vai funcionar:
- Na URL publicada (`ayla-magic-mirror.lovable.app`)
- No domínio customizado (`igreen.cloud`)
- Em produção no celular do usuário

No editor o SW será automaticamente desativado para não cachear builds antigos.

## O que vou fazer

### 1. Instalar e configurar `vite-plugin-pwa`
- `vite.config.ts`: adicionar `VitePWA` com:
  - `registerType: "autoUpdate"` (atualiza sozinho quando sai deploy novo)
  - `devOptions.enabled: false` (não roda em dev)
  - `workbox.navigateFallbackDenylist: [/^\/~oauth/, /^\/api/]` (não cacheia rotas internas)
  - `workbox.runtimeCaching` com `NetworkFirst` para HTML (evita travar em build velho) e `CacheFirst` para assets estáticos (`/assets/`, imagens MinIO)
  - Reaproveita o `manifest.json` existente (não duplica)

### 2. Guard contra iframe/preview em `src/main.tsx`
```ts
const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const isPreview = location.hostname.includes("id-preview--") || location.hostname.includes("lovableproject.com");
if (!inIframe && !isPreview) {
  import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
} else {
  navigator.serviceWorker?.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
}
```

### 3. Página `/install` (opcional, recomendada)
Pequena tela com:
- Detecção de plataforma (iOS/Android/Desktop)
- Instruções "Compartilhar → Adicionar à Tela de Início" (iOS)
- Botão `beforeinstallprompt` (Android/Chrome desktop)
- Status "✅ Já instalado" quando rodando em standalone

Útil para mandar o link aos consultores: `igreen.cloud/install`.

### 4. Ajustes no `manifest.json`
- Trocar `start_url` de `/admin` para `/admin?source=pwa` (telemetria de uso instalado via GA4)
- Manter `id: "/admin"` (não pode mudar, senão vira "novo app" pra quem já instalou)
- Adicionar ícone 192x192 caso `favicon.png` não tenha (verifico na hora)

## Detalhes técnicos

- **Rotas excluídas do cache**: `/~oauth/*` (callback de auth), `/api/*` (edge functions Supabase), qualquer fetch para `supabase.co` e `minio` (esses vão direto pra rede, sem cache, pra não servir media velha do WhatsApp).
- **Estratégia HTML**: NetworkFirst com timeout 3s → se a rede falhar serve do cache. Garante que deploy novo aparece sempre que tem internet.
- **Update flow**: `autoUpdate` aplica novo SW na próxima navegação sem prompt. Sem `selfDestroying`.
- **Sem mudar appID** do Capacitor / sem mexer no backend.

## Arquivos alterados

- `vite.config.ts` — adiciona `VitePWA`
- `src/main.tsx` — guard de registro
- `public/manifest.json` — pequenos ajustes
- `src/pages/InstallPage.tsx` (novo) + rota em `src/App.tsx`
- `package.json` — `vite-plugin-pwa` como devDep

## O que NÃO vou fazer

- Não vou habilitar SW no editor (cacheia builds velhos e quebra HMR).
- Não vou mudar `id`/`scope`/`display` (PWAs já instalados perderiam continuidade).
- Não vou virar Capacitor/app nativa — você pediu PWA.

Posso seguir?
