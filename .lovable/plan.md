# Plano: Deixar o app abrir mais rápido

Objetivo: reduzir o tempo de abertura do app (especialmente `/admin` e `/super-admin`) sem mudar nenhuma funcionalidade ou visual.

## 1. Lazy loading de rotas em `src/App.tsx`
Converter todas as páginas pesadas para `React.lazy()` + `Suspense`:
- `Admin`, `SuperAdmin`, `WhatsAppClientsPage`, `FluxoCamila`, páginas de relatórios, captação, saúde-bot, install, etc.
- Manter rotas leves (landing `/ayla-viana`, `/cadastro`, `NotFound`) com import normal para não atrasar o first paint público.
- Adicionar um `<Suspense fallback={<LoadingScreen />}>` global com um spinner usando o design system (verde primário).

## 2. Lazy loading de tabs/painéis dentro do Admin e SuperAdmin
Os painéis mais pesados (Ads, IA, Captação, Saúde Bot, Templates WhatsApp, Fluxos, Kanban) serão carregados via `lazy()` somente quando a aba for aberta. Hoje todos entram no bundle inicial mesmo sem o usuário abrir.

## 3. Split de chunks no `vite.config.ts`
Adicionar `build.rollupOptions.output.manualChunks` separando:
- `react-vendor`: react, react-dom, react-router-dom
- `supabase`: @supabase/supabase-js
- `ui-vendor`: radix-ui, lucide-react
- `charts`: recharts (se usado)
- `motion`: framer-motion (se usado)

Isso reduz o bundle principal e permite cache melhor entre deploys.

## 4. Pré-carregar rotas críticas após o idle
Usar `requestIdleCallback` para pré-buscar o chunk do `/admin` depois que o login renderiza, evitando "tela branca" ao clicar para entrar.

## 5. Fora de escopo
- Nenhuma mudança em lógica de negócio, edge functions, banco, RLS, WhatsApp, CRM ou IA.
- Nenhuma mudança visual além do spinner do Suspense.
- Landing pages públicas continuam como estão.

## Detalhes técnicos
- Arquivos tocados: `src/App.tsx`, `vite.config.ts`, `src/pages/Admin.tsx`, `src/pages/SuperAdmin.tsx` (somente para lazy nos tabs).
- Sem novas dependências.
- Build do Vite vai gerar vários chunks pequenos em `dist/assets/` — primeiro load do `/admin` cai significativamente porque só baixa o chunk da aba ativa.
