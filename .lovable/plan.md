## Objetivo

Adicionar um **toggle "Modo Game"** no painel de Captação (`/admin` → aba Captação). Quando ligado, transforma a tela de trabalho num jogo de verdade — divertido, com níveis, XP, combo, conquistas, animações e SFX. Quando desligado, fica o painel atual sem alterações.

A preferência fica salva por consultor (localStorage) e o estado de progresso continua usando a tabela existente `capture_scoreboard` (cada cadastro concluído = +1 ponto, já implementado). O modo Game só lê esses dados de um jeito mais divertido — não muda nada do fluxo de captação, banco ou envio.

## Como o usuário vai usar

1. No header de Captação aparece um botão grande **"🎮 Ligar Modo Game"** (toggle estilo switch).
2. Ao ligar:
   - O painel inteiro entra em "tela de jogo" — fundo animado com gradiente verde/aurora, partículas flutuando, leve glow.
   - Em cima fica a **HUD do jogador**: avatar + título de rank ("Aprendiz", "Captador", "Caçador", "Mestre", "Lenda"), barra de XP grande com brilho, nível atual, multiplicador de combo.
   - Cada lead capturado dispara: confete, "+10 XP" flutuante, som de moeda (mutável), e se completar nível → tela de level-up com troféu animado.
   - Painel lateral de **"Conquistas"** (achievements desbloqueáveis: "Primeiro Cadastro", "Maratona 5 em 1 dia", "Streak 7 dias", "Combo x3", etc.) com cards que viram dourados ao desbloquear.
   - Missões diárias viram **"Quests"** com recompensa em XP visível.
   - Botão de som on/off e botão "Sair do Modo Game" sempre visíveis.
3. Ao desligar: volta exatamente ao painel atual.

## Sistema de níveis (cálculo client-side, sem migração)

- 1 cadastro = 10 XP base. Combo (capturas no mesmo dia em sequência) multiplica: 2º +5, 3º +10, 4º+ +15 bônus.
- Curva de níveis: XP necessário = `100 * level^1.4` (níveis ficam progressivamente mais longos sem virar grind).
- Ranks por faixa de nível: 1-4 Aprendiz · 5-9 Captador · 10-19 Caçador · 20-34 Mestre · 35+ Lenda.
- XP total = soma de `capture_scoreboard.registrations` dos últimos 90 dias × 10. Tudo derivado, nada novo no banco.

## Arquivos a criar

- `src/components/captacao/game/GameModeToggle.tsx` — switch animado com label e ícone.
- `src/components/captacao/game/GameShell.tsx` — wrapper visual (fundo animado, partículas via CSS, glow).
- `src/components/captacao/game/PlayerHud.tsx` — avatar, rank, nível, barra de XP grande, combo.
- `src/components/captacao/game/AchievementsRail.tsx` — grid lateral de conquistas.
- `src/components/captacao/game/QuestsBar.tsx` — versão "game" das missões diárias.
- `src/components/captacao/game/LevelUpOverlay.tsx` — overlay full-screen com troféu + confete ao subir de nível.
- `src/components/captacao/game/XpToast.tsx` — toast flutuante "+10 XP" com bounce.
- `src/components/captacao/game/useGameProgress.ts` — hook que calcula nível/XP/rank/próximo a partir do scoreboard, retorna `addXp(amount)` que dispara level-up.
- `src/components/captacao/game/useGameMode.ts` — hook que lê/escreve preferência em `localStorage` (`game-mode-v1-<consultantId>`) + preferência de som.
- `src/components/captacao/game/sfx.ts` — utilitário pequeno tocando WebAudio (oscillator) para "ding", "coin", "level-up" — sem dependência de arquivo de áudio.

## Arquivos a editar

- `src/components/captacao/CaptacaoPanel.tsx` — adicionar `GameModeToggle` no header; quando ligado, embrulhar conteúdo em `GameShell` e substituir `CaptureScoreboard`/`CaptureMissionsPanel` por `PlayerHud`/`QuestsBar`/`AchievementsRail`. Em `handleSubmitted` chamar `addXp(...)` e disparar `XpToast`/level-up.
- `src/index.css` — adicionar keyframes leves: `aurora-drift`, `coin-pop`, `xp-pulse`, `level-up-burst` (usando tokens HSL existentes).

## Fora de escopo

- Não mexe em `manual-step-send`, webhook, banco, ou na lógica do `CaptureSheet`/`CaptureStepsGrid`.
- Sem nova tabela; reaproveita `capture_scoreboard`.
- Sem libs novas (confete = CSS + emojis animados, áudio = WebAudio nativo).
- Modo Normal fica idêntico ao atual.

## Observações de design

- Todas as cores via tokens (`primary` verde, `accent`, `muted`). Glow usa `primary/30`.
- Animações respeitam `prefers-reduced-motion` (desliga partículas e level-up burst).
- Som começa desligado por padrão; usuário liga manualmente.
- Toggle e botão de sair sempre visíveis para o usuário não se sentir preso.
