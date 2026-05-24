// Tipos do motor de fluxo (Phase C Task 17 do whatsapp-flow-architecture-v3).
//
// Tudo aqui é **dado** — nenhuma função, nenhuma dependência de banco/HTTP.
// `types.ts` é importado tanto pelo engine puro quanto pelo dispatcher
// (executor) e pelos testes PBT.

import type {
  ChannelCapabilities,
  MediaPayload,
  OutboundChoice,
} from "../channels/types.ts";
import type {
  CustomerFlowStatus,
  CustomerPauseReason,
  EngineCustomerState,
} from "../customer-flow-state.ts";

export type { CustomerFlowStatus, CustomerPauseReason, EngineCustomerState };
export type { ChannelCapabilities, MediaPayload, OutboundChoice };

// ─── Step (configuração imutável carregada de bot_flow_steps) ──────────────

export type StepTypeCanonical =
  | "text_message"
  | "media_message"
  | "audio_slot"
  | "ask_text"
  | "ask_choice"
  | "ask_media"
  | "branch"
  | "system_capture";

export type WaitFor = "none" | "reply" | "media" | "timer";

export interface ChoiceOptionSpec {
  id: string;
  title: string;
  description?: string;
}

export interface CaptureSpec {
  field: string;
  enabled: boolean;
  /** Para `_buttons` legado. */
  value?: ChoiceOptionSpec[];
  /** Para validação client-side futura. */
  validator?: "email" | "phone" | "cpf" | "cep" | "currency" | "date" | "free";
  required?: boolean;
}

export interface TransitionSpec {
  trigger_intent?: string | null;
  trigger_phrases?: string[] | null;
  goto_step_id?: string | null;
  goto_special?: "cadastro" | "humano" | "menu" | "repeat" | null;
}

export interface FallbackSpec {
  mode: "repeat" | "goto" | "ai" | "ai_limit" | "advance" | "handoff";
  goto_step_id?: string | null;
  ai_prompt?: string;
  max_questions?: number;
  max_retries?: number;
  on_fail?: "advance" | "handoff" | "repeat" | "next";
  handoff_reason?: string;
  then?: "humano" | "next" | "repeat";
}

export interface MediaOrderItem {
  kind: "text" | "image" | "audio" | "video" | "document";
  /** ID em ai_media_library quando aplicável. */
  media_id?: string | null;
  /** slot_key da Camila quando aplicável. */
  slot_key?: string | null;
  /** Texto literal quando kind=text. */
  text?: string | null;
  /** Delay configurado entre item N e N+1. */
  delay_ms?: number | null;
  /** Duração para sleep pós-mídia (apenas áudio/vídeo). */
  duration_sec?: number | null;
}

export interface EngineStep {
  id: string;
  flowId: string;
  stepKey: string | null;
  stepType: StepTypeCanonical;
  position: number;
  messageText: string | null;
  mediaOrder: MediaOrderItem[];
  /** Para ask_choice. Pode ser null para text_message etc. */
  choiceOptions: ChoiceOptionSpec[] | null;
  preferredChoiceKind: "button" | "list" | "number" | null;
  captures: CaptureSpec[];
  transitions: TransitionSpec[];
  fallback: FallbackSpec;
  waitFor: WaitFor;
  waitSeconds: number;
  /** Para system_capture. */
  pipelineKind: "cadastro_portal" | "ocr_conta" | "ocr_documento" | "finalizar_cadastro" | null;
  /** Para audio_slot. */
  slotKey: string | null;
  /** Para branch. */
  conditionExpr: Record<string, unknown> | null;
  /** Lista de steps válidos do mesmo fluxo — usada pelo engine para validar `next_step`. */
  reachableStepIds: string[];
}

// ─── InboundEvent (entrada do tick) ──────────────────────────────────────────

export interface InboundEvent {
  kind: "text" | "button_click" | "media" | "timer_expired" | "no_input";
  text?: string;
  buttonId?: string;
  /** Quando o usuário digita "1"/"2" em resposta a uma lista numerada. */
  rawNumberReply?: string;
  mediaKind?: "image" | "audio" | "video" | "document";
}

// ─── EngineAction (saída do tick — comandos para o dispatcher) ───────────────

export type EngineAction =
  | { kind: "send_text"; text: string; idempotencyKey: string; humanDelayMs: number }
  | { kind: "send_choice"; prompt: string; choice: OutboundChoice; idempotencyKey: string }
  | { kind: "send_media"; media: MediaPayload; idempotencyKey: string }
  | { kind: "send_audio_slot"; slotKey: string; idempotencyKey: string }
  | { kind: "schedule_timer"; expiresAt: string }
  | { kind: "delegate_legacy_runBotFlow"; reason: string }
  | { kind: "delegate_ai_agent_router"; userInput: string };

// ─── EngineLog (logs estruturados) ───────────────────────────────────────────

export type EngineLogKind =
  | "engine_step_advance"
  | "engine_choice_downgrade"
  | "engine_invalid_input"
  | "engine_precondition_failed"
  | "engine_handoff"
  | "engine_no_match"
  | "engine_delegate_legacy"
  | "engine_auto_resume"
  | "engine_invalid_step";

export interface EngineLog {
  kind: EngineLogKind;
  payload: Record<string, unknown>;
}

// ─── EngineResult (saída completa do tick) ───────────────────────────────────

export interface EngineResult {
  nextState: EngineCustomerState;
  actions: EngineAction[];
  /** Valores extraídos para UPDATE em `customers.*` (pelo dispatcher). */
  capturedFields: Record<string, unknown>;
  logs: EngineLog[];
}

// ─── Configuração do engine (estática por turno) ─────────────────────────────

export interface EngineConfig {
  /** Quando true, engine só calcula EngineResult sem efeitos colaterais. */
  isDarkMode: boolean;
  /** Capabilities do canal usadas pelo dispatcher para resolver choice. */
  capabilities: ChannelCapabilities;
  /** Domínios permitidos em links emitidos pela IA (usados em sanitize). */
  allowedDomains: string[];
  /** Função idempotency-key (injetada pelo caller para tick continuar puro). */
  idempotencyKeyFn: (parts: { stepId: string; content: string; minuteBucket: number }) => string;
  /** Bucket atual em minutos (passado pelo caller — tick não chama Date.now). */
  minuteBucket: number;
  /** Função humanDelay — passamos a partir de _shared/human-pace.ts. */
  humanDelayFn: (charLen: number) => number;
}
