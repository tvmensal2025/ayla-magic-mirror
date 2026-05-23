
# Captação Mobile — Auditoria + Redesenho

## Diagnóstico (com base nos 2 screenshots @ 344px)

### Performance ON (1ª imagem)
A tela inteira é consumida por **5 cabeçalhos empilhados antes de chegar nos passos**, e a conversa+composer ficam fora da viewport:

| Bloco | Altura aprox. | Problema |
|---|---|---|
| Header "Painel de Captação · MODO PERFORMANCE · Iniciante · Nv 1" | 56 px | OK |
| Bloco "PERFORMANCE ON" gigante (toggle quebra linha por `flex-wrap`) | 60 px | Toggle ocupa linha inteira — deveria virar ícone |
| `ExecHudBar` "INICIANTE Nv 1 · 50/100 · 0 · 0" | 44 px | Duplica o subtítulo do header |
| Sub-header "Alvo atual / JOSINETE NUNES… / chat / chevron" | 56 px | OK |
| Linha "Fluxo: A B D" (rebaixada em mobile) | 36 px | Poderia ir no sub-header |
| "10 PASSOS · CLIQUE PARA ENVIAR" | 24 px | Redundante com a próxima |
| "PASSOS DO FLUXO 3/9" + barra | 28 px | **Mesmo título 2x** (linha interna do `CaptureStepsGrid`) |
| Grid de tiles (3 colunas × 96 px) | 96 px | Cada tile tem nº, título, citação em itálico, 4 ícones, botão — pesado |
| "Falta: CPF, RG, Nascimento +8" | 28 px | OK |
| "FALTAM 11 ITEM(S)" finalize | 56 px | OK |
| Composer | 56 px | Empurrado para fora da viewport |
| **Conversa (`CaptureConversationFeed`)** | **~0 px** | **Some completamente — `flex-1` sem espaço** |

### Modo Normal (2ª imagem)
Mesmo padrão, com agravante:
- Chips de scoreboard + missões (`0/3`, `0/5`, `0/5`, `Hoje 0`, `Semana 5`, `Sequência 0d`, toggle Performance) usam **2 linhas inteiras** por `flex-wrap`.
- Sub-header "Conversando com" + tiles ocupam o resto.
- Conversa e composer também invisíveis sem scroll.

### Causa raiz
1. `CaptacaoPanel` foi desenhado para desktop com 3 colunas; no mobile vira uma pilha vertical sem orçamento de altura.
2. Métricas/gamificação são **always-visible** em mobile (deveriam ser opt-in).
3. Tiles de passos têm `min-h-[96px]` e `minmax(100px,1fr)` → 3 tiles preenchem largura, mas com altura cheia roubam o espaço da conversa.
4. Dois títulos "10 Passos" (no painel) e "Passos do fluxo" (dentro do grid).
5. Composer é o elemento mais importante e fica **abaixo de tudo**, não fixo.

---

## Proposta de redesenho (apenas mobile, `< md`)

### 1. Header colapsado
- Manter só: logo + título "Captação" + chip de nível (`Nv 1 · Iniciante`) + ícone-toggle de performance (32×32, sem texto).
- Mover `CaptureMissionsPanel`/`CaptureScoreboard` para dentro de um `<details>` expansível com chip "Stats" (fechado por padrão em mobile).
- `ExecHudBar`: ocultar em mobile (`hidden md:flex`); informação essencial (Nv, hoje, streak) entra no chip do header.

### 2. Toggle Performance compacto
- Em mobile, `GameModeToggle` vira **só o ícone `BarChart2`** com ring dourada quando ativo (40×40). Texto "PERFORMANCE ON" só em `sm:` para cima.

### 3. Sub-header do lead consolidado
- Uma linha só: `←` voltar · Nome (truncate) · pill da variante (A/B/D inline, não barra separada) · ícone de chat externo · ⋯ menu (com "Ficha", "Variante", "Reenviar tudo").
- Remover linha duplicada de "Fluxo: A B D" no mobile (vai pro menu ⋯ ou pill compacto).

### 4. Abas Passos / Conversa / Ficha (mobile only)
- Acima do conteúdo principal, 3 abas (sticky):
  - **Passos** (default quando entra no lead) — mostra grid compacto.
  - **Conversa** — mostra `CaptureConversationFeed` em tela cheia.
  - **Ficha** — mostra `CaptureLeadCard` (substitui o `showAside` atual).
- Em `md+` continua o layout 3 colunas atual (sem mudança).

### 5. Tiles de passos mais leves
- Mobile: grid `grid-cols-2`, tile com altura ~72 px contendo só `Passo N` · título (1 linha) · 4 micro-ícones · status (✓ ou ●).
- Remover a citação em itálico (`"Olá, seja muito Bem-Vindo(a)..."`) no mobile — fica no `CaptureStepPreview` modal.
- Tap no tile inteiro abre o preview (botão "Ver e enviar" some).
- Remover o título redundante "Passos do fluxo" dentro do grid quando o painel já tem "10 Passos · clique para enviar"; deixar só a barra de progresso + contador.

### 6. Composer fixo no rodapé
- Em mobile, `MessageComposer` vira `sticky bottom-0` com sombra sutil, sempre visível independente da aba.
- "FALTAM N ITEM(S)" finalize button vira chip flutuante acima do composer (não bloco full-width).

### 7. Conversa ganha espaço real
- Quando a aba "Conversa" está ativa, o feed ocupa `flex-1` real (sem grid de passos disputando altura).

---

## Detalhes técnicos

**Arquivos a alterar:**

- `src/components/captacao/CaptacaoPanel.tsx`
  - Adicionar `useIsMobile()` (já existe em `src/hooks/use-mobile.tsx`).
  - Novo estado `mobileTab: "passos" | "conversa" | "ficha"`; default `"passos"`.
  - Reorganizar JSX do bloco `selectedId &&` em mobile para mostrar **apenas a aba ativa**; manter desktop intacto via `hidden md:flex` / `md:hidden`.
  - Encapsular scoreboard/missions num `<details>` em mobile.
  - Inserir `<TabBar>` sticky entre sub-header e conteúdo (component inline).
  - Aplicar `sticky bottom-0 z-10` no wrapper do `MessageComposer` em mobile.

- `src/components/captacao/CaptureStepsGrid.tsx`
  - Detectar mobile (via hook) ou usar classes `md:` puras:
    - `grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(100px,1fr))]`
    - `min-h-[72px] md:min-h-[96px]`
    - Esconder `inlinePreview` em mobile (`hidden md:block`).
    - Botão "Ver e enviar" some em mobile; tile inteiro vira `<button>` que abre o preview.
  - Remover o `<div>` "Passos do fluxo / 3/N" duplicado quando renderizado dentro do painel (o painel já tem o cabeçalho); manter só a barra de progresso fina.

- `src/components/captacao/game/ExecHudBar.tsx`
  - Wrapper: `hidden md:flex`. Em mobile o nível vira chip no header.

- `src/components/captacao/game/GameModeToggle.tsx`
  - Versão compacta `< sm`: só `BarChart2` 40×40 com ring dourada quando `enabled`. Texto e pílula só em `sm:` para cima.

- `src/components/captacao/CaptureScoreboard.tsx` / `CaptureMissionsPanel.tsx`
  - Sem mudança interna; o painel passa a renderizá-los dentro de um `<details>` colapsado em mobile.

- `src/components/captacao/FinalizeButton.tsx`
  - Em mobile, classe `fixed bottom-[64px] right-3` (acima do composer) como FAB compacto quando incompleto, ou banner full-width quando completo.

**Sem mudanças de lógica/negócio.** Apenas presentation + responsividade. Nenhuma alteração de banco, edge function ou fluxo de envio.

---

## Resultado esperado @ 344px

```text
Antes (Performance ON)            Depois
┌───────────────────┐             ┌───────────────────┐
│ Painel · MODO PER │             │ Captação · Nv1 [⚡]│  ← 40px
│ [PERFORMANCE ON ●]│             ├───────────────────┤
│ INICIANTE Nv1 50/.│             │ ← JOSINETE [A B D]│  ← 44px
│ Alvo atual / JOSI │             ├───────────────────┤
│ Fluxo: A B D      │             │ Passos|Conversa|Fi│  ← 36px
│ 10 PASSOS         │             ├───────────────────┤
│ PASSOS DO FLUXO   │             │ ▓▓▓▓░░░░ 3/12     │
│ [P1][P2][P3] →    │             │ ┌──┐┌──┐          │
│ Falta: CPF…       │             │ │P1││P2│          │
│ FALTAM 11 ITEM(S) │             │ └──┘└──┘ …        │
│ [composer fora]   │             │ ┌──┐┌──┐          │
│ (conversa vazia)  │             │ │P3││P4│          │
└───────────────────┘             ├───────────────────┤
                                  │ [composer sticky] │
                                  └───────────────────┘
```

Conversa e composer passam a ser **sempre alcançáveis em 1 toque** em vez de exigir scroll por 5 cabeçalhos.
