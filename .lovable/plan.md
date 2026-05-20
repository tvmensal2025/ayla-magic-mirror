## Problema

No `NetworkPanel.tsx` (modo "Rede"), o conteúdo nunca fica centralizado: começa cortado à esquerda e exige scroll horizontal manual, mesmo quando a árvore caberia na tela.

Causa raiz:
1. O wrapper externo usa `overflow-auto` + filho com `min-w-max` (largura intrínseca da árvore não-escalada).
2. O `transform: scale(${zoom})` é puramente visual — não reduz a largura usada no layout. Então o scroll horizontal sempre considera a largura cheia da árvore.
3. Como o `flex justify-center` está dentro de um container com `min-w-max`, a centralização só funciona quando a viewport é maior que a árvore (raro). Em telas pequenas, o conteúdo "encosta" à esquerda.
4. O zoom inicial é fixo (`0.85`), sem fit-to-width — então em mobile a árvore quase sempre estoura.

## Plano (somente UI/apresentação, arquivo único)

Arquivo: `src/components/admin/NetworkPanel.tsx`

1. **Medir a largura intrínseca da árvore**
   - Adicionar `treeInnerRef = useRef<HTMLDivElement>(null)` no conteúdo não-escalado.
   - Adicionar `containerRef = useRef<HTMLDivElement>(null)` no wrapper `overflow-auto`.
   - Em `useLayoutEffect`, medir `treeInnerRef.scrollWidth` e armazenar em estado (`contentWidth`, `contentHeight`).

2. **Fit-to-width inteligente no mount e quando membros mudam**
   - Calcular `fitZoom = clamp(containerWidth / contentWidth, 0.4, 1)`.
   - Se nunca o usuário tocou nos botões de zoom, usar `fitZoom`. Adicionar flag `zoomTouched` para preservar zoom manual após interação.

3. **Compensar layout do transform**
   - Trocar a estrutura para:
     ```
     <div ref=container className="overflow-auto" style={{maxHeight:'72vh'}}>
       <div className="mx-auto" style={{ width: contentWidth*zoom, height: contentHeight*zoom }}>
         <div ref=treeInner style={{ transform:`scale(${zoom})`, transformOrigin:'top left', width: contentWidth }}>
           {tree.map(...)}
         </div>
       </div>
     </div>
     ```
   - Isso faz com que a área ocupada no DOM = tamanho real escalado, então `mx-auto` centraliza horizontalmente quando cabe, e o overflow só aparece quando realmente excede.

4. **Scroll inicial para o centro**
   - Após render, se `contentWidth*zoom > containerWidth`, fazer `container.scrollLeft = (scrollWidth - clientWidth)/2` para abrir já no centro da árvore (raiz visível).

5. **Resize observer**
   - Usar `ResizeObserver` no container para recalcular `fitZoom` quando a janela/preview mudar de tamanho.

6. **Sem mudanças**
   - Botões +/− e badge de zoom continuam iguais (apenas marcam `zoomTouched=true`).
   - Modo Tabela, dados, RLS, palette, modais — intocados.

## Resultado esperado

- Abre sempre com a árvore centralizada e visível.
- Em mobile (390px) o zoom inicial encolhe automaticamente para caber a raiz na tela.
- Em desktop, árvore pequena fica centralizada; árvore grande abre rolada no centro.
- Zoom manual continua respeitando a escolha do usuário.