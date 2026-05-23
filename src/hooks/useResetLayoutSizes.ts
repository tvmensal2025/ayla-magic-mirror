import { useCallback } from "react";

const PREFIX = "igreen:dragsize:";

/** Limpa todas as larguras persistidas dos DragResizer e recarrega a página. */
export function useResetLayoutSizes() {
  return useCallback(() => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
    window.location.reload();
  }, []);
}
