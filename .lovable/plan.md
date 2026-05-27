## O que está grande demais

Olhando o print da aba **Captação** (viewport 948px), três blocos consomem espaço desproporcional:

1. **Cards "Passos do Fluxo"** (`CaptureStepsGrid`)
   - `min-h-[128px]` + grid `minmax(110px, 1fr)` → só cabem 3 cards na largura, cada um quase quadrado.
   - Botão "Ver e enviar" altura `h-7` ocupa quase 1/3 do card.
   - Padding `p-2`, gap `gap-1.5`, badge "Passo X" e ícones em linha separada.

2. **Coluna direita "Ficha do Cliente"** (`CaptureLeadCard` → `CaptureDocumentTiles` no modo não-embedded)
   - Tiles de documento renderizam **`aspect-square`** (≈ 110×110px cada) com câmera 6×6 e label `text-[10px]`.
   - Botão **"CADASTRAR TUDO"** é `size="lg"` + `text-base` + shadow-glow + padding pesado.
   - Cabeçalho HUD (`CaptureHud`) com tier/combo/xp ocupa banda inteira mesmo fora do game mode.

3. **Sub-header do alvo** (linha "Conversando com / Kelly" + "Abrir conversa")
   - Linhas duplas (label "Conversando com" em cima do nome) + `Button size="sm"` quebram em mobile-narrow.

## Plano: enxugar mantendo a identidade (glassmorphism verde, dark)

### 1. `CaptureStepsGrid.tsx`
- Trocar `min-h-[128px]` → `min-h-[96px]` e `minmax(110px,1fr)` → `minmax(96px,1fr)` (cabem 4–5 cards visíveis).
- Reduzir `p-2` → `p-1.5`, `gap-1` → `gap-1`, badge "Passo X" para `text-[9px] px-1 py-px`.
- Tirar a linha de ícones de mídia (Mic/Image/Video) — virar **um único cluster compacto** ao lado do título: `<div className="flex gap-0.5 ml-auto">` com ícones `w-2.5 h-2.5`.
- Esconder o preview inline (“Kelly me conta uma coisa…”) por padrão; revelar só no hover (`opacity-0 group-hover:opacity-100 hidden xl:block`). Encurta o card e fica mais clean.
- Botão "Ver e enviar" → `h-6 text-[9px]` com label só ícone (`Eye` w-3) em telas <xl; texto completo em xl+. O ícone Edit3 vira `h-6 w-6`.

### 2. `CaptureDocumentTiles.tsx`
- Adotar **modo compact por padrão** quando o componente está no aside da `CaptureLeadCard` não-embedded (passar `compact` baseado em viewport ou simplesmente sempre `compact`).  
  → Tiles passam de `aspect-square` (110×110) para `h-14` (56px) com câmera `w-4 h-4` e label `text-[9px]`.
- Manter modo grande só dentro de modal ou quando o usuário expandir o aside.

### 3. `CaptureLeadCard.tsx`
- Botão "CADASTRAR TUDO" → `size="default"` em vez de `size="lg"`, `text-sm` em vez de `text-base`, shadow reduzida (`shadow-[0_0_14px_hsl(var(--primary)/0.25)]`). Continua com gradient verde, só menor.
- Esconder `CaptureHud` quando `gameOn === false` (já é o caso) — confirmar que nenhuma versão duplicada está renderizando. Trocar `p-2.5` da coluna principal por `p-2`.
- Compactar `CaptureDataConfirmCard` bill/doc para `text-[10px]` e padding `px-2 py-1` (hoje são "cards" verdes destacados maiores que precisam).

### 4. Sub-header do alvo (`CaptacaoPanel.tsx` linhas 264-295 e 414-432)
- Colocar "Alvo atual:" + nome **na mesma linha** (`<span class="text-[10px] text-muted-foreground mr-1">Alvo:</span><span class="text-sm font-semibold">Kelly</span>`) — economiza 1 linha.
- Botão "Abrir conversa" → `size="xs"` (h-6) com label somente em `lg:` (`hidden lg:inline`).
- A/B/C toggle (linhas 273-284): `text-[10px]` e `px-1.5 py-0` (já é pequeno, só afinar).

### 5. Cluster de counters do header (0/3, 0/5, 0/5, Hoje 0, Semana 5…)
- Já são `CaptureScoreboard` / `CaptureMissionsPanel`. Encurtar separadores e rodar gap `gap-1.5` → `gap-1`. Sem mudança estrutural, só tightening de espaçamento (faço numa varredura visual).

## O que NÃO vou mudar
- Layout em 3 colunas (lista | conversa | ficha) e o DragResizer.
- Cores, gradients, tokens semânticos do design system (continua dark/glassmorphism verde).
- Comportamento de envio, A/B/C, OCR, finalize button.
- Estado/dados, hooks, edge functions.

## Resultado esperado

- **Cards de Passo**: 4–5 visíveis em vez de 3, altura ~30% menor.
- **Tiles de Documento**: ~60% menores, viram chips compactos com câmera + label curta.
- **Botão "CADASTRAR TUDO"**: caber confortavelmente sem dominar o aside.
- **Header do alvo**: 1 linha em vez de 2.

Tudo só CSS/Tailwind — zero mudança de lógica.
