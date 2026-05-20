## Problema

O botão de envio (h-10 + "Eye + letra") ficou desproporcional ao card compacto. Em telinha pequena (390x650), domina visualmente cada linha.

## Mudanças (`src/components/captacao/CaptureStepsList.tsx`)

### Card de passo (linha única, mais enxuta)

- **Botão**: trocar de `h-10 px-3` com ícone+letra por um botão-ícone circular `h-9 w-9 rounded-full` só com `Send` (sem letra, sem `Eye`). Alvo de toque continua 36px (aceitável; iOS recomenda 44, mas a área hit ainda é confortável num card de 44px de altura). Para garantir alvo confortável sem peso visual, uso `relative` + `before:absolute before:inset-[-6px]` (área invisível extra de 6px no toque) — visual 36px, hit-area efetiva 48px.
- **Variante**: badge `A`/`B`/`C` pequena (`text-[9px]`) no canto inferior direito do número `#N`, em vez de no botão. Quem quer trocar variante abre a prévia.
- **Linha de meta**: remover o texto "X variantes / variante A" (redundante com o badge). Manter só os ícones de mídia (mic/img/vídeo) com `w-3 h-3`.
- **Padding do card**: `py-1.5 pl-2 pr-1.5` → `py-2 pl-2.5 pr-2`. Bordas `rounded-lg` mantidas.
- **Tipografia**: título `text-xs` → `text-[13px]` (mais legível, ainda compacto). Removida a segunda linha de meta quando só tem ícones — fica em linha única com o título.

### Layout final por card (~46px altura)

```
[●#N·A]  Apresentação inicial 🎤🖼️           [⤴]
```

- bolinha número+variante à esquerda (28px)
- título + ícones de mídia inline no meio (1 linha truncada)
- botão circular `Send` 36px à direita (com hit-area 48px invisível)

### Estado "enviado"

- Bolinha vira verde sólida com `Check` (já está).
- Botão circular vira `variant="outline"` com `Check` (em vez de `Send`).

## Fora de escopo

Header, footer, modal de prévia, tabs, lógica.

## Validação

1. 390x650: cabem 5-6 passos sem rolar.
2. Botão visualmente discreto mas com hit-area ≥44px (testar tocando nas bordas).
3. Badge da variante visível ao lado do número.
4. Sem botões/textos cortados em 320px.
