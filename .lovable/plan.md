# Plano — Modo Captação em formato Game (v2)

Hoje a tela é "uma ficha com confete". O usuário sente que está preenchendo formulário, não jogando. Vamos transformar em um mini-game de captura, mantendo o ambiente profissional (sem virar fliperama).

## Princípios

- Game **acompanha** a ação, não atrapalha (animações 200–400ms, som curtos opt-in).
- Cada microação dá feedback **imediato + visível + recompensador**.
- Progressão clara: XP → Nível → Missão → Vitória.
- Nada bloqueia o consultor. Tudo é decorativo sobre o fluxo real.

---

## 1. Sistema de XP, Nível e Combo (novo `useCaptureGameState`)

Hook central que escuta `filledCount`, `sentSteps`, tempo entre ações:

- **XP por campo:** +10 (normal), +25 (campo via OCR/IA aceita), +50 (documento), bônus +20 se preencheu em <30s desde último.
- **Combo:** contador "x2 / x3 / x4" se duas capturas acontecerem em <20s. Reseta após 30s parado. Multiplica XP.
- **Nível do lead:** 5 níveis (Bronze → Prata → Ouro → Platina → ⚡Pronto) ligados a `filledCount/totalFields`. Cada nível troca cor da barra e dispara animação maior.
- **Persistência:** apenas o `total_xp_today` vai pra `capture_scoreboard` (nova coluna). Combo/nível são UI local.

## 2. HUD de jogo no topo do painel direito (substitui ficha estática)

Substituir o header atual do `CaptureLeadCard` por um HUD compacto:

- Avatar circular do lead + nome + telefone.
- Barra XP com brilho que "enche líquido" (gradient animado, shimmer).
- Badge de Nível atual com pulse ao subir.
- Indicador de Combo grande (x2/x3) que aparece e some.
- Mini "missão atual": "Capture nome do titular" (sugere próximo campo vazio prioritário).

Componentes novos:

- `src/components/captacao/CaptureHud.tsx`
- `src/components/captacao/CaptureLevelBadge.tsx`
- `src/components/captacao/CaptureComboIndicator.tsx`
- `src/components/captacao/CaptureMissionHint.tsx`

## 3. Feedback por campo (linha viva)

No `CaptureLeadCard`, quando um campo é preenchido:

- A linha faz **flash verde** + **scale 1→1.05→1** + **check icon "draw"** (300ms).
- Mostra um **+XP** flutuando subindo e sumindo (texto pequeno animado).
- Som curto opt-in (toggle 🔊 no header; default off para não incomodar).
- Se veio da IA: usa cor âmbar + texto "🤖 +25 XP IA".

Componente: `src/components/captacao/XpFloater.tsx` (portal absoluto).

## 4. Steps Grid mais atrativos

No `CaptureStepsGrid`:

- Numerar como cartas (#1..#10) com **hover lift + glow** suave.
- Quando enviado, vira **carta "virada"** (efeito flip 3D) com check brilhante.
- Adicionar barra fininha de progresso "passos enviados X/10" acima do grid.
- Conquistas visuais quando todos os 10 forem enviados → toast especial + confete.

## 5. Sistema de Conquistas / Missões diárias

Painel pequeno no header (substituir/complementar o `CaptureScoreboard`):

- "Missões de hoje" com 3 metas:
  - 🥉 Capturar 3 leads completos
  - 🥈 Streak de 5 dias
  - 🥇 Aceitar 5 sugestões da IA
- Cada uma com barra de progresso. Ao completar: explosão de XP, badge desbloqueada (persiste em `capture_achievements` nova tabela ou só localStorage por consultor).

Por simplicidade na 1ª versão: **localStorage** com sync diário ao scoreboard.

## 6. Sons opcionais (Web Audio simples)

`src/lib/captureSfx.ts`:

- `pop()` ao preencher campo (sininho curto 80ms)
- `levelUp()` ao trocar de nível
- `combo()` ao engatar combo
- `victory()` no cadastro completo
- Toggle global salvo em localStorage `capture-sfx-enabled`.

Sons gerados via WebAudio (oscilador) — sem arquivo externo, zero peso.

## 7. Animações ambiente sutis

- Background do painel central com **gradiente animado** muito sutil (4–8s loop) — verde-esmeralda passando devagar.
- Quando combo ativo, borda do painel ganha **glow pulsante verde**.
- Quando lead chega a 100%, painel inteiro recebe **shimmer dourado** + CTA "CADASTRAR" passa a **vibrar suavemente** chamando atenção.

## 8. Botão "CADASTRAR TUDO" como boss-fight

Quando `canSubmit`:

- Botão grande, gradient verde→dourado animado, ícone troféu girando lento.
- Texto: "⚡ FINALIZAR CAPTURA — +100 XP"
- Ao clicar: animação de "loading épico" (barra preenchendo com partículas) por 1.5s antes do toast de sucesso → confete grande + som de vitória + soma no scoreboard.

## 9. Lista de leads (esquerda) com ranking visual

No `CaptureLeadList`:

- Cada lead mostra **medalha de nível** ao lado do nome (bronze/prata/ouro conforme % preenchido).
- Lead 100% pronto aparece com **borda dourada pulsante**.
- No topo, mini-leaderboard "Hoje: X cadastros" já existe — adicionar **mini sparkline** dos últimos 7 dias para sensação de progresso.

## 10. Não tornar chato — guardas

- Toasts limitados: máx 1 a cada 3s (debounce); frases motivacionais só em milestones (3, 5, 7, 10), não em todo campo.
- Confete grande só em: subir de nível, completar lead, completar missão diária. Microconfete em campos.
- Sons **off por padrão**.
- Animações respeitam `prefers-reduced-motion`: cai para fade simples.

---

## Arquivos a criar

- `src/hooks/useCaptureGameState.ts`
- `src/lib/captureSfx.ts`
- `src/components/captacao/CaptureHud.tsx`
- `src/components/captacao/CaptureLevelBadge.tsx`
- `src/components/captacao/CaptureComboIndicator.tsx`
- `src/components/captacao/CaptureMissionHint.tsx`
- `src/components/captacao/CaptureMissionsPanel.tsx`
- `src/components/captacao/XpFloater.tsx`

## Arquivos a editar

- `src/components/captacao/CaptacaoPanel.tsx` — montar HUD + missões + ambient bg.
- `src/components/captacao/CaptureLeadCard.tsx` — integrar XP por campo, floater, flash.
- `src/components/captacao/CaptureStepsGrid.tsx` — cards estilo "carta" + flip.
- `src/components/captacao/CaptureLeadList.tsx` — medalhas + sparkline + borda pronta.
- `src/components/captacao/CaptureProgressBar.tsx` — shimmer e troca de cor por nível.
- `src/lib/captureGame.ts` — adicionar tier system, helpers de nível, mais frases curtas.
- `src/hooks/useCaptureScoreboard.ts` — adicionar `xpToday` e arrays de 7 dias para sparkline.

## Migração de banco (opcional, pode ficar p/ v2)

- `capture_scoreboard.xp_today integer default 0` — para persistir XP agregado.
- Sem novas tabelas nesta entrega; conquistas em localStorage.

## Detalhes técnicos

- Animações com Tailwind keyframes já existentes + 3 novas: `xp-rise`, `card-flip`, `shimmer-gold`.
- Tokens semânticos (HSL) — adicionar `--gold` e `--combo-glow` ao `index.css`.
- `prefers-reduced-motion` via `@media` desabilita keyframes pesadas.

## Fora de escopo

- Reorganização do fluxo de captura ou regras de IA/OCR.
- Mudanças no `manual-step-send`, scoreboard backend, ou bot.
- Multiplayer/ranking entre consultores (fica para depois).

siga completa com o plano