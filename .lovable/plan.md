## Atalho de passos do fluxo no composer (manual 1-a-1, passo completo, ou daqui em diante)

Logo acima do textarea do `MessageComposer`, um botão "⚡ Fluxo" abre um popover compacto listando os passos do fluxo ativo do consultor. Para cada passo, o consultor escolhe **como** disparar — sempre para o cliente atualmente aberto.

## 3 modos de envio (por passo selecionado)

1. **Manual 1-a-1** — abre o `ManualStepDialog` já com o passo pré-selecionado (cards áudio/imagem/vídeo/texto, cada um com botão Enviar). Reaproveita o componente que já existe.
2. **Passo completo (auto)** — dispara o passo inteiro sequencial (áudio → imagem → vídeo → texto) via `manual-step-send` com `part: "all"`. Um clique e pronto.
3. **Daqui em diante (auto)** — dispara o passo escolhido **e todos os subsequentes** em sequência. Loop client-side: para cada passo da posição N até o fim, chama `manual-step-send` com `part: "all"` e espera o retorno antes de ir para o próximo. Toast de progresso ("Enviando 3/8…"), botão "Parar" cancela o loop.

## Arquivos

**Novo:** `src/components/whatsapp/FlowQuickBar.tsx`
- Props: `consultantId`, `customerId`, `customerName`, `disabled?`.
- Reusa `useFlowSteps(consultantId)` (já existe) para carregar `stepOptions` ordenados por `position`.
- Botão "⚡ Fluxo" (ícone Zap, `h-8 w-8 ghost`) com badge da quantidade de passos. Tooltip "Enviar passo do fluxo".
- Abre `Popover` (shadcn) com:
  - Header curto: "Para **{customerName}**".
  - Lista vertical scrollável (`max-h-72 overflow-y-auto`) dos passos. Cada linha:
    - `#N • título do passo` (truncate).
    - 3 ações lado a lado (icons + tooltip): `Send` (passo completo), `ListChecks` (1-a-1), `FastForward` (daqui em diante).
  - Rodapé com link "Editar fluxo" → `/admin/fluxos`.
- Estado interno: `sendingStepId`, `runningSequence: { fromIdx, currentIdx, total } | null`, `abortRef`.
- Funções:
  - `sendFull(stepId)` → invoca `manual-step-send` `{ stepId, part: "all" }`. Toast sucesso/erro.
  - `openOneByOne(step)` → seta `dialogStep` e renderiza `<ManualStepDialog open ... />` controlado, abrindo já naquele passo (extender ManualStepDialog com prop opcional `initialStepId`).
  - `runFromHere(fromIdx)` → loop `for (i = fromIdx; i < steps.length; i++)`, await cada `manual-step-send`. Aborta se `abortRef.current === true` ou erro. Mostra toast "▶️ 3/8 enviado". Ao final: toast "✅ Sequência concluída".
- Confirmação leve (AlertDialog) para "Daqui em diante" mostrando "Vai enviar X passos para {nome}. Continuar?".

**Editar:** `src/components/whatsapp/MessageComposer.tsx`
- Renderizar `<FlowQuickBar consultantId={consultantId} customerId={customerId} customerName={customerName} disabled={disabled} />` ao lado do botão de respostas rápidas (`MessageSquareText`), antes do `Paperclip`. Só renderiza se `consultantId && customerId`.

**Editar:** `src/components/admin/AIAgentTab/ManualStepDialog.tsx`
- Aceitar prop opcional `initialStepId?: string`. No `useEffect` de carga, se `initialStepId` estiver setado e existir nos `steps`, chamar `loadStepParts(step)` automaticamente para já abrir na visão de partes (modo 1-a-1).

## Comportamento e segurança

- `manual-step-send` já respeita o estado pausado/handoff do bot e a ordem áudio→imagem→texto (memórias "Manual Step Capture Prompt" e "Human Takeover Silence") — nada muda no backend.
- Loop "daqui em diante" é client-side e cancelável, evita criar nova edge function. Delay natural vem do próprio `manual-step-send` (espera retorno entre passos).
- Sem inserir nada no textarea — disparo é direto, evita confusão com o que o consultor está digitando.

## Fora de escopo

- Edição de passos (continua em `/admin/fluxos`).
- Disparo de variantes A/B/C distintas — usa o fluxo ativo padrão do consultor.
- Agendamento (continua no `SchedulePanel`).