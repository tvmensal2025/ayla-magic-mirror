// useViewportPersistence — persiste o zoom/pan do canvas Modo_Diagrama em
// `localStorage` por par `(consultantId, variant)` e restaura no próximo
// carregamento.
//
// Mapeia para os requisitos:
//   - R10.14: "manter o zoom (no intervalo `[0,25, 2,0]`) e o pan do canvas
//     em `localStorage` por par `(consultantId, variant)`, sem persistir
//     esses valores no banco."
//   - R1.7:   falha em `localStorage` é silenciosa (fallback em memória,
//     nunca bloqueia interação do Consultor nem exibe erro modal).
//
// O hook:
//   1) Subscreve ao `onMove` do React Flow via `useOnViewportChange` e grava
//      `{x, y, zoom}` em `localStorage` com debounce de 500 ms.
//   2) Na montagem (e a cada troca de `(consultantId, variant)`), tenta
//      restaurar o viewport persistido via `reactFlowInstance.setViewport()`.
//      Valor inválido — JSON corrompido, zoom fora de `[0.25, 2.0]`, x/y não
//      numéricos — é descartado silenciosamente (cai no `fitView` default do
//      `<ReactFlow>`).
//   3) Toda interação com `localStorage` está protegida por try/catch para
//      tolerar `SecurityError` (cookies bloqueados), `QuotaExceededError`
//      (storage cheio) e ambientes server-side onde `window` não existe.
//
// Importante: deve ser chamado dentro de `<ReactFlowProvider>` porque
// `useOnViewportChange` lê do contexto interno da lib.

import { useEffect, useRef } from "react";
import {
  useOnViewportChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";

import type { Variant } from "@/components/admin/flow-builder/flowTypes";

const DEBOUNCE_MS = 500;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

export interface UseViewportPersistenceArgs {
  consultantId: string;
  variant: Variant;
  /** Instância do React Flow obtida via `useReactFlow()`. */
  reactFlowInstance: ReactFlowInstance | null;
}

/** Chave canônica do `localStorage` (R10.14). */
function storageKey(consultantId: string, variant: Variant): string {
  return `flow-viewport:${consultantId}:${variant}`;
}

/**
 * Valida que o objeto carregado do `localStorage` é um `Viewport` íntegro.
 * - x, y: numéricos finitos (sem NaN/Infinity, sem strings).
 * - zoom: numérico finito dentro de `[MIN_ZOOM, MAX_ZOOM]` (R10.14).
 */
function isValidViewport(value: unknown): value is Viewport {
  if (!value || typeof value !== "object") return false;
  const v = value as { x?: unknown; y?: unknown; zoom?: unknown };
  if (typeof v.x !== "number" || !Number.isFinite(v.x)) return false;
  if (typeof v.y !== "number" || !Number.isFinite(v.y)) return false;
  if (typeof v.zoom !== "number" || !Number.isFinite(v.zoom)) return false;
  if (v.zoom < MIN_ZOOM || v.zoom > MAX_ZOOM) return false;
  return true;
}

/** Lê e valida o viewport persistido. Retorna `null` em qualquer falha. */
function readViewport(key: string): Viewport | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidViewport(parsed) ? parsed : null;
  } catch {
    // R1.7 / R10.14: falha silenciosa (JSON corrompido, SecurityError, etc).
    return null;
  }
}

/** Grava o viewport. Falha é silenciosa (R1.7 / R10.14). */
function writeViewport(key: string, viewport: Viewport): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(viewport));
  } catch {
    // QuotaExceededError, SecurityError em iframes, etc — apenas ignora.
  }
}

export function useViewportPersistence({
  consultantId,
  variant,
  reactFlowInstance,
}: UseViewportPersistenceArgs): void {
  const key = storageKey(consultantId, variant);

  // Refs para o debounce do save. Mantemos a chave atual em ref para que o
  // callback de `useOnViewportChange` (cuja identidade muda a cada render)
  // sempre grave na chave correta sem reagendar a subscrição.
  const keyRef = useRef(key);
  keyRef.current = key;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Viewport | null>(null);

  // -------------------------------------------------------------------------
  // 1) Restauração na montagem e em troca de (consultantId, variant).
  //
  // Não dependemos do shallow-equality de `reactFlowInstance` porque a lib
  // pode trocar a referência entre renders. Usamos a chave como dep para
  // disparar o restore quando o Consultor muda de Variante.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!reactFlowInstance) return;
    const restored = readViewport(key);
    if (!restored) return;
    try {
      reactFlowInstance.setViewport(restored);
    } catch {
      // setViewport não deve lançar, mas guardamos por defesa em depth.
    }
    // `key` já carrega `(consultantId, variant)`; `reactFlowInstance` precisa
    // estar materializado.
  }, [key, reactFlowInstance]);

  // -------------------------------------------------------------------------
  // 2) Subscrição ao onMove via `useOnViewportChange` com debounce de 500 ms.
  //
  // Não usamos `onEnd` do hook porque queremos persistir mesmo durante drags
  // longos (R10.14 fala em "manter zoom e pan", e o debounce já coalesce as
  // chamadas em rajada).
  // -------------------------------------------------------------------------
  useOnViewportChange({
    onChange: (viewport: Viewport) => {
      pendingRef.current = viewport;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        if (!pending) return;
        pendingRef.current = null;
        // Só persiste se o zoom estiver no range — fora do range é descartado
        // silenciosamente para nunca pluir entrada inválida no `localStorage`.
        if (pending.zoom < MIN_ZOOM || pending.zoom > MAX_ZOOM) return;
        writeViewport(keyRef.current, pending);
      }, DEBOUNCE_MS);
    },
  });

  // -------------------------------------------------------------------------
  // 3) Flush em unmount: garante que o último viewport observado seja gravado
  //    mesmo que o Consultor saia da página antes do timer expirar.
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const pending = pendingRef.current;
      if (pending && pending.zoom >= MIN_ZOOM && pending.zoom <= MAX_ZOOM) {
        writeViewport(keyRef.current, pending);
      }
      pendingRef.current = null;
    };
  }, []);
}

export default useViewportPersistence;
