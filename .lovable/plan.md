## Diagnóstico

O painel `/admin` foi construído mobile-first com container `max-w-7xl mx-auto` (1280px). Em monitores grandes (1440, 1920, 2560px) sobra fundo preto nas laterais — por isso "parece que não foi feito pra PC". Além disso, em desktop o conteúdo continua empilhado verticalmente como no celular, desperdiçando a tela.

Vou tratar isso de forma sistêmica, sem quebrar o mobile.

## O que vou fazer

### 1. Shell do /admin com largura total + sidebar fixa em desktop

- Substituir o `max-w-7xl mx-auto` em `src/pages/Admin.tsx` por um shell de duas colunas:
  - **Sidebar lateral fixa** (≥ `lg:`) com as abas atuais (Dashboard, WhatsApp, CRM, Templates, Fluxos, etc.) — usando o padrão Shadcn `Sidebar` (collapsible em ícone).
  - **Área de conteúdo fluida** ocupando o resto da tela (`flex-1`, sem max-width travado).
- No mobile (< `lg:`) mantém exatamente o layout atual (top bar + tabs horizontais) — zero regressão.
- Header passa a ter `SidebarTrigger` para colapsar a barra.

### 2. Container de conteúdo respira até telas grandes

- Onde hoje tem `max-w-7xl`, troco por padding lateral generoso (`px-4 lg:px-8 xl:px-12`) e largura controlada por `max-w-screen-2xl` (1536px) com `mx-auto`, em vez de 1280px estreito.
- Em telas ≥ 1920px, conteúdo respira sem barras pretas berrantes.

### 3. Densidade desktop nas telas-chave

Aumentar colunas onde hoje tudo empilha:

- **DashboardTab** — KPIs em `grid-cols-2 md:grid-cols-3 xl:grid-cols-4`; gráficos lado-a-lado em `xl:grid-cols-2`.
- **WhatsApp (chat)** — 3 colunas em desktop: lista de conversas | chat ativo | painel do cliente (CRM lateral). Hoje o painel do cliente vira modal mesmo em PC.
- **CRM Kanban** — colunas com largura mínima maior em desktop (`xl:min-w-[320px]`) e scroll horizontal contido na área.
- **Templates / Fluxos / Saúde Bot** — listagens passam de 1 coluna para `xl:grid-cols-2`.

### 4. Fundo do app

- Substituir o preto puro pelo gradient sutil do design system (`bg-background` com leve textura verde glassmorphism que já existe na LP), pra que mesmo em ultrawide as laterais fiquem elegantes em vez de "vazio preto".

## Fora de escopo

- Landing pages públicas (`/ayla-viana`, `/cadastro`) — já são responsivas e desenhadas para desktop. Só mexo se você confirmar problema específico ali.
- Mudanças de funcionalidade — só CSS/layout.

## Validação

Depois de aplicar, tiro screenshots em 1366, 1536, 1920 e 1191 (o seu atual) para confirmar zero overflow e zero faixa preta indevida.

---

**Pergunta rápida antes de implementar:** confirma que quer começar pelo **/admin inteiro** (CRM + WhatsApp + Templates + Dashboard) ou prefere que eu faça primeiro só a tela do **WhatsApp** (que é a mais usada) e depois evoluo as outras?