import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "igreen:layout-unlocked";
const EVENT = "igreen:layout-lock-changed";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Global layout-lock state.
 * locked=true  → resize handles are disabled (default, "safety lock").
 * locked=false → user can drag panel borders to resize.
 */
export function useLayoutLock() {
  const unlocked = useSyncExternalStore(subscribe, read, () => false);

  const setUnlocked = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const toggle = useCallback(() => setUnlocked(!read()), [setUnlocked]);

  return { locked: !unlocked, unlocked, toggle, setUnlocked };
}
