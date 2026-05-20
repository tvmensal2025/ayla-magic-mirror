## Problema

Em 390x844 com a sheet em meia-tela (~52dvh), só cabem ~2 cards de passo na lista. Cada card hoje tem 5 linhas (título, preview 2 linhas, ícones de mídia, botões A/B/C com label+hint), ocupando ~120px. Resultado: muito scroll, difícil de ver tudo, e ainda assim os botões precisam continuar fáceis de apertar (alvo ≥40px).

## Mudanças (apenas `src/components/captacao/CaptureStepsList.tsx`)

### 1. Card em linha única (modo compacto)

Cada `<li>` vira uma linha horizontal de altura fixa ~52px:

```
[#N] Título do passo …          🎤🖼️       [Enviar A ▾]
```

- `#N` + título truncado à esquerda (1 linha, `text-sm`).
- Ícones de mídia (mic/image/video) no meio, menores (`w-3 h-3`).
- **Um único botão primário à direita** disparando a variante padrão (`defaultV`), altura `h-10 px-3` → alvo de toque confortável.
- O botão mostra `Send` + letra da variante (A/B/C). Se já enviado, vira `outline` com `Check`.

### 2. A/B/C dentro do preview, não no card

Remove a fileira de 3 botões A/B/C do card. O clique no botão principal abre o `CaptureStepPreview` (já existe), onde o consultor:
- vê o conteúdo,
- escolhe variante (A/B/C) via tabs/chips dentro do preview,
- confirma envio.

Vantagem: card fica enxuto, e a escolha de variante ganha mais espaço/contexto. Isso exige acrescentar um seletor de variante no `CaptureStepPreview` (chips A/B/C no header do modal) — mantém a lógica `doSend(row)` já existente, só troca qual `row` vai.

### 3. Remover preview de texto do card

A linha `<p className="line-clamp-2">{g.preview}</p>` sai. O preview completo já aparece no modal `CaptureStepPreview`. Libera ~32px por card.

### 4. Indicador "enviado" sutil

Em vez do badge "✓ enviado" no canto, quando `anySent` o card inteiro ganha `bg-primary/5` + uma bolinha `✓` no `#N` (`bg-primary text-primary-foreground rounded-full`). Mantém feedback visual sem ocupar linha extra.

### 5. Barra de busca colapsável

A busca + "Só pendentes" hoje ocupam ~52px fixos no topo. Vira um ícone `Search` à direita do título da aba "Passos" (no header da sheet) — quando clicado, expande inline. Em meia-tela, ganha 1 card a mais visível.

Como o ícone fica no header da sheet (fora do `CaptureStepsList`), uma alternativa mais simples: manter a barra mas reduzir altura `h-9 → h-8` e fundir busca + toggle "Só pendentes" num único `Input` com chip à direita.

**Decisão**: usar a versão simples (barra `h-8`, mais densa) para escopo menor.

## Resultado esperado

- Card de passo: ~52px de altura (era ~120px).
- Em 52dvh com header (~120px) + tabs (~40px) + footer (~80px), sobra ~280px para a lista → cabem **~5 passos** sem scroll (era 2).
- Botão de envio continua `h-10` (≥40px) — fácil de apertar.
- Variantes A/B/C continuam acessíveis via modal de confirmação.

## Validação

1. Mobile 390x844, sheet meia-tela: ver 4-5 passos sem rolar.
2. Tocar no botão "Enviar A": abre preview com chips A/B/C, permite trocar variante, confirma envio.
3. Passos enviados ficam com `#N` em bolinha verde e fundo `primary/5`.
4. Em 320x568 (telinhas mínimas), botão ainda cabe e tem ≥40px de alvo.
5. Modo expandido continua funcionando (mesmo layout, só mais altura disponível).

## Fora de escopo

- Lógica de envio (`manual-step-send`), OCR, modo expandido, desktop, ficha, footer da sheet.
