/**
 * `TransitionPopover` — Popover compacto para criar (`kind: "create"`) ou
 * editar (`kind: "edit"`) uma Transition no Modo_Diagrama.
 *
 * Cobre os requisitos:
 * - R6.2: aberto em ≤200ms próximo ao ponto de soltura, com campo de
 *   `trigger_phrase` (até 60 chars) e seletor de `trigger_intent` com pelo
 *   menos 5 presets.
 * - R6.3: bloqueia confirmação quando phrase e intent estão ambos vazios e
 *   exibe a mensagem inline "Informe pelo menos um gatilho".
 * - R6.5: em modo `edit` exibe também botões "Remover" e selector
 *   "Redirecionar" listando todos os passos da Variante atual.
 * - R6.6: a confirmação dispara `onConfirm`/`onRemove`/`onRedirect`; a
 *   persistência efetiva é responsabilidade do componente pai (`FlowDiagram`),
 *   que é quem conhece o `Step` de origem e a `transitions[idx]` em edição.
 *
 * Posicionamento:
 * - Renderizado como `<div style="position: absolute; top, left">` no espaço
 *   da viewport. Coordenadas `state.x`/`state.y` vêm do React Flow (já em
 *   coordenadas de tela do contêiner). O componente pai monta este popover
 *   dentro do `<ReactFlow>` (geralmente no mesmo elemento que recebe o evento
 *   de drop ou no <Panel>) — usar `position: absolute` evita o overhead do
 *   `<Popover>` do Radix com Portal e mantém a abertura em ≤200ms.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { BUTTON_PRESETS, type Step } from "@/components/admin/flow-builder/flowTypes";
import type { TerminalKind } from "@/hooks/useDiagramData";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Estado do popover gerenciado pelo componente pai. */
export type TransitionPopoverState =
  | {
      kind: "create";
      sourceId: string;
      sourceHandle?: string;
      targetId: string | TerminalKind;
      x: number;
      y: number;
    }
  | {
      kind: "edit";
      edgeId: string;
      x: number;
      y: number;
      /** Valores atuais para preencher o formulário em modo edit. */
      initialTriggerPhrase?: string;
      initialTriggerIntent?: string;
      /** ID do passo de destino atual (em modo edit), para inicializar o
       * selector "Redirecionar". `null` quando o destino atual é um terminal. */
      currentTargetId?: string | null;
    };

export interface TransitionPopoverProps {
  state: TransitionPopoverState;
  /** Lista de passos da Variante atual — usada no selector "Redirecionar". */
  steps: Step[];
  /** Confirma a criação/edição com os valores digitados. Pai persiste. */
  onConfirm: (input: {
    triggerPhrase: string;
    triggerIntent: string;
  }) => Promise<void>;
  /** Remove a transition (apenas em modo edit, R6.5). */
  onRemove?: () => Promise<void>;
  /** Redireciona o destino para outro passo (apenas em modo edit, R6.5). */
  onRedirect?: (newTargetId: string) => Promise<void>;
  /** Fecha o popover sem persistir nada (botão Cancelar, Esc, click outside). */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Limite de caracteres do campo de phrase, conforme R6.2. */
const TRIGGER_PHRASE_MAX_LEN = 60;

/**
 * Presets do selector `trigger_intent`. R6.2 exige no mínimo 5 presets.
 *
 * - Os primeiros valores são intents reconhecidos pelo runtime
 *   (`palavra_chave`, `media_received` são determinísticos; os demais são
 *   semânticos resolvidos pelo Gemini).
 * - Em seguida, vêm os ids dos `BUTTON_PRESETS` para que o Consultor possa
 *   reaproveitar como atalho de gatilho. Mantemos o `id` como value (o runtime
 *   compara case-insensitive em `trigger_intent`/`trigger_phrases`).
 */
const PRIMARY_INTENT_PRESETS: { value: string; label: string }[] = [
  { value: "palavra_chave", label: "Palavra-chave (literal)" },
  { value: "afirmacao", label: "Afirmação (sim, claro, ok)" },
  { value: "negacao", label: "Negação (não, depois)" },
  { value: "interesse_alto", label: "Interesse alto" },
  { value: "media_received", label: "Mídia recebida (foto/áudio)" },
];

const BUTTON_PRESET_ITEMS = BUTTON_PRESETS.map((p) => ({
  value: p.id,
  label: `${p.emoji} ${p.title}`.trim(),
}));

/** Sentinela para "nenhum intent" no Select (Radix não aceita value=""). */
const INTENT_NONE = "__none__";

/** Sentinela para "manter destino atual" no selector de redirecionamento. */
const REDIRECT_NONE = "__keep__";

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function TransitionPopover({
  state,
  steps,
  onConfirm,
  onRemove,
  onRedirect,
  onCancel,
}: TransitionPopoverProps) {
  const isEdit = state.kind === "edit";
  const initialPhrase = isEdit ? state.initialTriggerPhrase ?? "" : "";
  const initialIntent = isEdit ? state.initialTriggerIntent ?? "" : "";
  const initialRedirect = isEdit ? state.currentTargetId ?? null : null;

  const [triggerPhrase, setTriggerPhrase] = useState<string>(initialPhrase);
  const [triggerIntent, setTriggerIntent] = useState<string>(initialIntent);
  const [redirectTarget, setRedirectTarget] = useState<string>(
    initialRedirect ?? REDIRECT_NONE,
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const phraseId = useId();
  const intentId = useId();
  const redirectId = useId();
  const errorId = useId();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const phraseInputRef = useRef<HTMLInputElement | null>(null);

  // R6.2: foca o campo de texto ao abrir, viabilizando "abrir em ≤200ms" pela
  // perspectiva do usuário (campo já pronto para digitar).
  useEffect(() => {
    phraseInputRef.current?.focus();
    phraseInputRef.current?.select?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, isEdit && state.kind === "edit" ? state.edgeId : null]);

  // Esc fecha o popover; Enter dentro do input dispara confirmação.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  // R6.5: opções do selector "Redirecionar" — todos os passos da Variante.
  // Ordem: por `position` ascendente para manter previsível.
  const redirectOptions = useMemo(() => {
    return [...steps]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        value: s.id,
        label: `${s.position}. ${s.title || "(sem título)"}`,
      }));
  }, [steps]);

  // R6.3: habilita "Confirmar" apenas se phrase OU intent não estiverem vazios.
  const phraseTrimmed = triggerPhrase.trim();
  const intentNorm = triggerIntent.trim();
  const hasAtLeastOneTrigger = phraseTrimmed !== "" || intentNorm !== "";

  async function handleConfirm() {
    if (!hasAtLeastOneTrigger) {
      setErrorMsg("Informe pelo menos um gatilho");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onConfirm({
        triggerPhrase: phraseTrimmed,
        triggerIntent: intentNorm,
      });
    } catch (err) {
      // O pai exibe toast.error; aqui apenas reabilita o botão.
      setSubmitting(false);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar. Tente novamente.",
      );
      return;
    }
    setSubmitting(false);
  }

  async function handleRemove() {
    if (!onRemove) return;
    setSubmitting(true);
    try {
      await onRemove();
    } catch {
      setSubmitting(false);
      setErrorMsg("Não foi possível remover. Tente novamente.");
      return;
    }
    setSubmitting(false);
  }

  async function handleRedirectChange(newTargetId: string) {
    setRedirectTarget(newTargetId);
    if (
      !onRedirect ||
      newTargetId === REDIRECT_NONE ||
      newTargetId === initialRedirect
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await onRedirect(newTargetId);
    } catch {
      setSubmitting(false);
      setErrorMsg("Não foi possível redirecionar. Tente novamente.");
      // Reverte o select para o destino original em caso de erro.
      setRedirectTarget(initialRedirect ?? REDIRECT_NONE);
      return;
    }
    setSubmitting(false);
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="false"
      aria-label={isEdit ? "Editar transição" : "Nova transição"}
      style={{
        position: "absolute",
        top: state.y,
        left: state.x,
        zIndex: 50,
      }}
      // Impede que o clique dentro do popover propague para o canvas (que
      // chamaria `onPaneClick` e fecharia o popover).
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none"
    >
      <div className="mb-2 text-sm font-semibold">
        {isEdit ? "Editar transição" : "Nova transição"}
      </div>

      {/* R6.2 — campo de texto trigger_phrase (60 chars max). */}
      <div className="mb-2">
        <Label htmlFor={phraseId} className="text-xs">
          Frase do gatilho
        </Label>
        <Input
          id={phraseId}
          ref={phraseInputRef}
          type="text"
          maxLength={TRIGGER_PHRASE_MAX_LEN}
          placeholder='Ex.: "sim", "quero simular"'
          value={triggerPhrase}
          onChange={(e) => {
            setTriggerPhrase(e.target.value);
            if (errorMsg) setErrorMsg(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleConfirm();
            }
          }}
          aria-invalid={errorMsg ? true : undefined}
          aria-describedby={errorMsg ? errorId : undefined}
          className="h-9 text-sm"
        />
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {triggerPhrase.length}/{TRIGGER_PHRASE_MAX_LEN}
        </div>
      </div>

      {/* R6.2 — selector trigger_intent com presets. */}
      <div className="mb-2">
        <Label htmlFor={intentId} className="text-xs">
          Intenção (opcional)
        </Label>
        <Select
          value={triggerIntent === "" ? INTENT_NONE : triggerIntent}
          onValueChange={(v) => {
            setTriggerIntent(v === INTENT_NONE ? "" : v);
            if (errorMsg) setErrorMsg(null);
          }}
        >
          <SelectTrigger id={intentId} className="h-9 text-sm">
            <SelectValue placeholder="Selecionar intenção" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INTENT_NONE}>— nenhuma —</SelectItem>
            {PRIMARY_INTENT_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
            {BUTTON_PRESET_ITEMS.length > 0 && (
              <>
                <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Botões prontos
                </div>
                {BUTTON_PRESET_ITEMS.map((p) => (
                  <SelectItem key={`btn-${p.value}`} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* R6.5 — Redirecionar (somente em modo edit). */}
      {isEdit && onRedirect && redirectOptions.length > 0 && (
        <div className="mb-2">
          <Label htmlFor={redirectId} className="text-xs">
            Redirecionar para
          </Label>
          <Select
            value={redirectTarget}
            onValueChange={(v) => {
              void handleRedirectChange(v);
            }}
          >
            <SelectTrigger id={redirectId} className="h-9 text-sm">
              <SelectValue placeholder="Manter destino atual" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={REDIRECT_NONE}>— manter destino —</SelectItem>
              {redirectOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* R6.3 — mensagem de validação inline. */}
      {errorMsg && (
        <div
          id={errorId}
          role="alert"
          className="mb-2 text-xs text-destructive"
        >
          {errorMsg}
        </div>
      )}

      {/* Botões: Confirmar / Cancelar (sempre); Remover (apenas edit). */}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
        {isEdit && onRemove && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={submitting}
            onClick={() => {
              void handleRemove();
            }}
            className="mr-auto"
          >
            Remover
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitting || !hasAtLeastOneTrigger}
          onClick={() => {
            void handleConfirm();
          }}
        >
          Confirmar
        </Button>
      </div>
    </div>
  );
}

export default TransitionPopover;
