import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Sentry é carregado de forma assíncrona para não bloquear o React.
// Se falhar, o app continua funcionando normalmente.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
          }),
        ],
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
        sendDefaultPii: false,
      });
    })
    .catch((e) => console.warn("Sentry init failed:", e));
}

createRoot(document.getElementById("root")!).render(<App />);

// ─── PWA: registro de Service Worker com guards de iframe/preview ──────────
// Service worker quebra o preview do Lovable (cacheia builds velhos).
// Só registramos em produção real (domínio publicado / igreen.cloud).
const inIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const host = typeof window !== "undefined" ? window.location.hostname : "";
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("lovableproject.com") ||
  host === "localhost" ||
  host === "127.0.0.1";

if (!inIframe && !isPreviewHost && "serviceWorker" in navigator) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch((e) => console.warn("[PWA] register failed:", e));
} else if ("serviceWorker" in navigator) {
  // Em preview / iframe / localhost: limpa qualquer SW antigo para não cachear.
  navigator.serviceWorker.getRegistrations().then((rs) => {
    rs.forEach((r) => r.unregister());
  }).catch(() => {});
}
