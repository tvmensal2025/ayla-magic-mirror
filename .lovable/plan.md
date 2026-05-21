
## Problema

Aba **Ficha** ocupa muito espaço: lista vertical de 9 campos + 3 tiles `aspect-square` enormes de Documentos empilhados embaixo. No modo compacto (36dvh) você nem vê os documentos, no expandido fica gigante e cheio de scroll.

## Redesenho proposto

### 1. Layout em 2 colunas (md+)
Dentro da aba Ficha, em telas ≥ md (~768px), divide em grid `grid-cols-[1fr_220px]`:
- **Esquerda**: lista de campos da ficha (compactada — ver item 3)
- **Direita**: coluna fixa "Documentos" com os 3 tiles empilhados em `h-16` cada (não mais quadrados gigantes), com preview e botão "Trocar"

No mobile (< md) volta pra stacked, mas Documentos vira **linha horizontal** de 3 tiles `h-14 w-full` lado a lado, não mais quadrados.

### 2. CaptureDocumentTiles compacto
- Nova prop `compact?: boolean` (default false pra não quebrar outros usos).
- Quando `compact`: tiles `h-14` (em vez de `aspect-square` que vira ~150×150), label em uma linha só, sem hint embaixo, ícone menor (`w-4 h-4`). Total da seção: ~70px vs ~220px hoje.

### 3. Campos da ficha mais densos
Em `CaptureLeadCard.tsx` (linha 170+):
- `p-2` → `p-1.5`, `space-y-1.5` → `space-y-1`
- Label + valor na **mesma linha** (`flex items-baseline gap-2`), valor truncado com tooltip. Hoje label fica numa linha e valor noutra → cada campo come ~46px. Vai pra ~28px.
- Edit inline continua funcionando (expande quando clica).
- Sugestão da IA (faixa âmbar) vira chip pequeno inline ao lado do valor, não bloco abaixo.

### 4. Ficha tab no Sheet
- `CaptureSheet` linha 232: a `TabsContent="ficha"` ganha `p-2` (hoje `p-0`) e o `FichaWrap` envolve o `CaptureLeadCard` com o grid 2-col.
- Default `36dvh` sobe pra **42dvh** só pra caber a ficha+docs sem precisar expandir. Continua minimizável e expansível.

### 5. Sem mudanças funcionais
- Auto-extração da IA, upload de docs, edição inline, submit final — tudo igual.
- Modo standalone (sidebar de 320px no /admin/captacao) **não muda** porque depende de `embedded=false`; só o modo dentro do chat (embedded) ganha o novo layout.

## Arquivos

- `src/components/captacao/CaptureLeadCard.tsx` (layout 2-col + linhas densas)
- `src/components/captacao/CaptureDocumentTiles.tsx` (prop `compact`)
- `src/components/captacao/CaptureSheet.tsx` (altura default + padding ficha tab)

Aprova?
