## Problema

No `/admin` (Performance ON), o painel ocupa altura enorme e os passos seguem bloqueados em ordem sequencial mesmo quando o cliente já respondeu (ex.: nome capturado). O usuário deve poder enviar qualquer passo livremente, e o cabeçalho precisa caber sem rolar.

## Mudanças (UI apenas, sem mexer no backend)

### 1. `CaptureStepsGrid.tsx` — remover bloqueio de ordem
- Apagar a regra `locked = !sent && !isNext`. Todos os passos não enviados ficam habilitados.
- Remover ícone `Lock`, classes `opacity-50` e o `disabled={locked}` do botão "Ver e enviar".
- Manter o destaque visual apenas no "próximo sugerido" (`isNext`) com `ring-primary/30`, mas sem desabilitar os outros.
- Mostrar o preview inline em todos os tiles (não só nos desbloqueados).
- Tooltip do botão passa a ser sempre "Ver e enviar".

### 2. `PlayerHud.tsx` — reduzir altura
- Trocar `p-4` por `px-3 py-2`, emblema de `w-14 h-14` para `w-10 h-10`, ícone `w-5 h-5`.
- Tipografia: rank `text-xs`, chips com `py-1` e fontes `text-[10px]`.
- Remover o parágrafo "Pontos de Performance" (já está implícito no contexto do header).
- Reduzir `rounded-2xl` → `rounded-xl` e remover `animate-exec-card` para evitar layout-shift inicial.

### 3. `QuestsBar.tsx` — compactar metas do dia
- Diminuir gap e padding (`p-2`, `gap-2`), barras de progresso para `h-1`.
- Esconder o subtítulo "+50 PTS / +100 PTS" em telas < `md` (mantém só o título + barra).
- No desktop, manter 3 colunas mas com `text-[10px]`.

### 4. `CaptacaoPanel.tsx`
- O wrapper do gameOn (`<div className="px-4 py-3 space-y-3">` linhas 217-220) vira `px-3 py-2 space-y-2` para reduzir espaçamento total.
- Ajustar a altura calculada do main: `md:h-[calc(100vh-380px)]` → `md:h-[calc(100vh-300px)]` já que o HUD ficou menor.

### 5. `CaptureSheet.tsx` (atalho raio "Enviar tudo")
- Verificar se o `pendingSteps` ainda respeita a ordem travada antiga; ajustar para enviar todos os pendentes em sequência sem depender do "isNext" (já é assim, mas confirmar sem regressão).

## Fora de escopo
- Lógica de envio (`manual-step-send`), state machine do bot, captura de OCR.
- Nenhum schema/edge function alterado.

## Arquivos editados
- `src/components/captacao/CaptureStepsGrid.tsx`
- `src/components/captacao/game/PlayerHud.tsx`
- `src/components/captacao/game/QuestsBar.tsx`
- `src/components/captacao/CaptacaoPanel.tsx`
- `src/components/captacao/CaptureSheet.tsx` (verificação)
