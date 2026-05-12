/**
 * Health/timeout/recovery counter helpers for useWhatsApp.
 * Pure factory: receives refs/setters and returns control functions.
 */
import type { MutableRefObject } from "react";
import {
  type OperationalHealth,
  MAX_CONSECUTIVE_TIMEOUTS,
} from "./whatsappHelpers";

export interface HealthDeps {
  healthRef: MutableRefObject<OperationalHealth>;
  setHealth: (h: OperationalHealth) => void;
  timeoutCountRef: MutableRefObject<number>;
  setConsecutiveTimeouts: (n: number) => void;
  recoveryCyclesRef: MutableRefObject<number>;
  addLog: (msg: string) => void;
}

export interface HealthControls {
  resetTimeoutCounter: () => void;
  incrementTimeoutCounter: () => void;
  resetRecoveryCounter: () => void;
}

export function createHealthControls(deps: HealthDeps): HealthControls {
  const {
    healthRef, setHealth, timeoutCountRef, setConsecutiveTimeouts,
    recoveryCyclesRef, addLog,
  } = deps;

  const resetTimeoutCounter = () => {
    timeoutCountRef.current = 0;
    setConsecutiveTimeouts(0);
    if (healthRef.current === "degraded") {
      setHealth("healthy");
    }
  };

  const incrementTimeoutCounter = () => {
    timeoutCountRef.current++;
    setConsecutiveTimeouts(timeoutCountRef.current);
    if (timeoutCountRef.current >= MAX_CONSECUTIVE_TIMEOUTS) {
      setHealth("reset_recommended");
      addLog("⚠️ Servidor não responde há várias tentativas. Recomendamos resetar a conexão.");
    } else if (timeoutCountRef.current >= 2) {
      setHealth("degraded");
    }
  };

  const resetRecoveryCounter = () => {
    recoveryCyclesRef.current = 0;
  };

  return { resetTimeoutCounter, incrementTimeoutCounter, resetRecoveryCounter };
}