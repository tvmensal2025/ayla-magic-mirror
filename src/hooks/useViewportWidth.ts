/**
 * `useViewportWidth` — observa a largura da viewport (window.innerWidth) e
 * expõe sinais derivados usados pelo `Modo_Diagrama` (R15.x):
 *
 *  - `width`: largura atual (`window.innerWidth`); `1024` no SSR.
 *  - `isNarrow`: `width < 768` — dispara o modo somente leitura do canvas
 *    (R15.2) e oculta controles de edição.
 *  - `isMedium`: `768 <= width < 1024` — usado pelo `<ViewToggle>` para
 *    mostrar o tooltip "Melhor visualização em desktop" (R15.1).
 *
 * Por que um hook próprio em vez de `useIsMobile`:
 *
 *  - Precisamos das **duas faixas** ao mesmo tempo (`<768` e `768-1023`) sem
 *    duplicar o listener `resize`.
 *  - Queremos a transição automática entre estados de R15.4 (cresce/encolhe
 *    via `resize`) sem reload, então usamos um único `matchMedia` baseado em
 *    `window.innerWidth` para garantir consistência em SSR/jsdom.
 *  - Mantemos o `useIsMobile` existente intocado para outros consumidores.
 *
 * Implementação:
 *
 *  - Usa `window.matchMedia("(max-width: ...)")` para os dois breakpoints.
 *    `matchMedia` é mais barato que escutar `resize` direto (o navegador só
 *    notifica quando o estado da MQ muda), atendendo ao "transição em ≤500ms"
 *    de R15.4 sem custo extra de re-render.
 *  - Inicializa o estado a partir de `window.innerWidth` quando disponível,
 *    para evitar um primeiro render com valor incorreto que dispararia uma
 *    troca de modo imediatamente. SSR cai em `1024` (modo desktop).
 */

import { useEffect, useState } from "react";

const NARROW_BREAKPOINT = 768; // R15.2 — abaixo disso, somente leitura.
const MEDIUM_BREAKPOINT = 1024; // R15.1 — abaixo disso (e ≥768), tooltip de hint.

interface ViewportWidthState {
  /** Largura atual da viewport em pixels CSS. */
  width: number;
  /** `width < 768` — dispara modo somente leitura do canvas (R15.2). */
  isNarrow: boolean;
  /** `768 <= width < 1024` — dispara hint do `<ViewToggle>` (R15.1). */
  isMedium: boolean;
}

function readState(): ViewportWidthState {
  if (typeof window === "undefined") {
    // SSR — assume desktop. O primeiro effect no cliente reconcilia o estado.
    return { width: MEDIUM_BREAKPOINT, isNarrow: false, isMedium: false };
  }
  const w = window.innerWidth;
  return {
    width: w,
    isNarrow: w < NARROW_BREAKPOINT,
    isMedium: w >= NARROW_BREAKPOINT && w < MEDIUM_BREAKPOINT,
  };
}

export function useViewportWidth(): ViewportWidthState {
  const [state, setState] = useState<ViewportWidthState>(readState);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Reconcilia uma vez na montagem para o caso SSR.
    setState(readState());

    // Escuta os dois breakpoints. `matchMedia` chama o listener apenas quando
    // o booleano da MQ muda — exatamente quando atravessamos um breakpoint.
    const narrowMql = window.matchMedia(
      `(max-width: ${NARROW_BREAKPOINT - 1}px)`,
    );
    const mediumMql = window.matchMedia(
      `(min-width: ${NARROW_BREAKPOINT}px) and (max-width: ${MEDIUM_BREAKPOINT - 1}px)`,
    );

    const onChange = () => setState(readState());

    // `addEventListener` em `MediaQueryList` é o caminho moderno; alguns
    // navegadores antigos (Safari <14) usam `addListener` — mantemos apenas
    // o caminho moderno porque o projeto usa Vite + browsers modernos.
    narrowMql.addEventListener("change", onChange);
    mediumMql.addEventListener("change", onChange);
    return () => {
      narrowMql.removeEventListener("change", onChange);
      mediumMql.removeEventListener("change", onChange);
    };
  }, []);

  return state;
}

export default useViewportWidth;
