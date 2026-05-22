## Problema
No /admin (aba Captação, Performance ON) sobra muito espaço lateral e vertical: o `<main>` limita a 1760px com paddings grandes, o painel usa `h-[calc(100vh-220px)]` e o HUD/Quests ocupam altura demais.

## Mudanças (só layout, sem mexer em lógica)

### 1. `src/pages/Admin.tsx`
- Renderizar `CaptacaoPanel` fora do `<main>` com `max-w-[1760px]` quando `activeTab === "captacao"`. Estrutura: manter o header de tabs no container atual, mas fechar o container antes de renderizar a aba captação e renderizá-la em wrapper `w-full px-2 sm:px-4 py-2`.
  - Implementação: mover só o bloco do `activeTab === "captacao"` para fora do `<main>` numa `<section className="px-2 sm:px-4 lg:px-6 pb-4">` full-width após o `</main>`, e esconder o `<main>` quando aba=captação (`activeTab === "captacao"` retorna null no main para evitar duplicar).

### 2. `src/components/captacao/CaptacaoPanel.tsx`
- Container raiz: trocar `h-[calc(100vh-220px)] min-h-[640px] rounded-xl border` por `h-[calc(100vh-150px)] min-h-[680px] rounded-lg border` para usar mais altura.
- Header interno: `px-4 py-3` → `px-3 py-2`.
- Wrapper do gameOn (HUD/Quests): já está `px-3 py-2 space-y-2`; reduzir para `px-2 py-1.5 space-y-1.5`.
- Altura interna do main: `md:h-[calc(100vh-340px)]` → `md:h-[calc(100vh-280px)]` para esticar a lista de leads + grid de passos.
- Coluna lateral (lead list): `md:w-72` → `md:w-64` para liberar espaço ao grid.
- Aside (Ficha do Cliente): `md:w-72` → `md:w-80` (mais espaço útil pros campos), ou manter `md:w-72` se preferir; padrão: `md:w-72`.
- Área central de scroll: `p-3 md:p-4` → `p-2 md:p-3`.

### 3. `src/components/captacao/CaptureStepsGrid.tsx`
- Grid: `grid-cols-2 md:grid-cols-5 gap-2` → `grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-6 gap-1.5` para aproveitar largura em telas grandes (a tela atual mostra só 5 colunas com vazio à direita).

## Fora de escopo
- Nenhuma mudança em backend, lógica de envio ou bot.
- Modo Performance OFF mantém o layout atual.

## Arquivos editados
- `src/pages/Admin.tsx`
- `src/components/captacao/CaptacaoPanel.tsx`
- `src/components/captacao/CaptureStepsGrid.tsx`
