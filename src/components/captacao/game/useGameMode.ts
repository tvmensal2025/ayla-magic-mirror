import { useEffect, useState, useCallback } from "react";

const MODE_KEY = "game-mode-v1-";
const SOUND_KEY = "game-sound-v1-";

export function useGameMode(consultantId: string | null) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (!consultantId) return false;
    try { return localStorage.getItem(MODE_KEY + consultantId) === "1"; } catch { return false; }
  });
  const [sound, setSound] = useState<boolean>(() => {
    if (!consultantId) return false;
    try { return localStorage.getItem(SOUND_KEY + consultantId) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!consultantId) return;
    try { localStorage.setItem(MODE_KEY + consultantId, enabled ? "1" : "0"); } catch { /* */ }
  }, [enabled, consultantId]);

  useEffect(() => {
    if (!consultantId) return;
    try { localStorage.setItem(SOUND_KEY + consultantId, sound ? "1" : "0"); } catch { /* */ }
  }, [sound, consultantId]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);
  const toggleSound = useCallback(() => setSound((v) => !v), []);

  return { enabled, setEnabled, toggle, sound, setSound, toggleSound };
}
