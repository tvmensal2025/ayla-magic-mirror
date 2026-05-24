// Step types canônicos para o Flow Builder (Phase G Task 35 do
// whatsapp-flow-architecture-v3). Reflete o conjunto restringido por
// CHECK constraint em `bot_flow_steps.step_type_canonical`.

import type { Step } from "./flowTypes";

export type StepTypeCanonical =
  | "text_message"
  | "media_message"
  | "audio_slot"
  | "ask_text"
  | "ask_choice"
  | "ask_media"
  | "branch"
  | "system_capture";

export const CANONICAL_STEP_TYPE_OPTIONS: {
  value: StepTypeCanonical;
  label: string;
  emoji: string;
  hint: string;
}[] = [
  { value: "text_message", emoji: "💬", label: "Mensagem de texto", hint: "Envia texto e segue para o próximo passo." },
  { value: "media_message", emoji: "📎", label: "Mensagem de mídia", hint: "Envia imagem/áudio/vídeo/documento e segue." },
  { value: "audio_slot", emoji: "🎙️", label: "Áudio Camila", hint: "Toca um slot de áudio (boas_vindas, etc.)." },
  { value: "ask_text", emoji: "✍️", label: "Perguntar (texto livre)", hint: "Espera uma resposta do lead e captura o valor." },
  { value: "ask_choice", emoji: "🔘", label: "Perguntar (escolha)", hint: "Apresenta botão real ou lista numerada conforme o canal." },
  { value: "ask_media", emoji: "📸", label: "Pedir mídia", hint: "Espera uma foto/áudio/documento do lead." },
  { value: "branch", emoji: "🔀", label: "Decisão", hint: "Avalia uma condição e ramifica para outro passo." },
  { value: "system_capture", emoji: "⚙️", label: "Captura especial", hint: "OCR de conta, OCR de doc, cadastro no portal, OTP. Delega para runBotFlow legado." },
];

export type CanonicalValidationError = {
  stepId: string;
  field: string;
  message: string;
};

/**
 * Valida um step contra as regras canônicas. Retorna lista de erros
 * (vazia se válido).
 *
 * Regras (Task 35):
 *   - ask_choice → exige choice_options (>=2) e preferred_choice_kind.
 *   - ask_text   → exige captures.length > 0 (algum field).
 *   - ask_media  → exige um capture do tipo mídia.
 *   - branch     → exige condition_expr não vazia.
 *   - system_capture → exige pipeline_kind.
 *
 * Os campos canônicos são opcionais no tipo `Step` legado (usado pelo
 * editor atual); essa função valida quando o caller passa o step com
 * `step_type_canonical` setado.
 */
export function validateCanonicalStep(step: Step & {
  step_type_canonical?: StepTypeCanonical;
  choice_preferred?: "button" | "list" | "number" | null;
  choice_options?: Array<{ id: string; title: string }> | null;
  pipeline_kind?: string | null;
  condition_expr?: Record<string, unknown> | null;
}): CanonicalValidationError[] {
  const errors: CanonicalValidationError[] = [];
  const t = step.step_type_canonical;
  if (!t) return errors;

  switch (t) {
    case "ask_choice": {
      const options = step.choice_options ?? [];
      if (options.length < 2) {
        errors.push({
          stepId: step.id,
          field: "choice_options",
          message: "ask_choice exige pelo menos 2 opções.",
        });
      }
      if (!step.choice_preferred) {
        errors.push({
          stepId: step.id,
          field: "choice_preferred",
          message: "ask_choice exige choice_preferred (button | list | number).",
        });
      }
      break;
    }
    case "ask_text": {
      const captures = (step.captures ?? []).filter((c) => c.enabled && c.field !== "_buttons");
      if (captures.length === 0) {
        errors.push({
          stepId: step.id,
          field: "captures",
          message: "ask_text exige pelo menos um capture configurado.",
        });
      }
      break;
    }
    case "ask_media": {
      const captures = step.captures ?? [];
      if (captures.length === 0) {
        errors.push({
          stepId: step.id,
          field: "captures",
          message: "ask_media exige um capture (imagem_conta, doc_frente, etc.).",
        });
      }
      break;
    }
    case "branch": {
      const expr = step.condition_expr ?? null;
      if (!expr || Object.keys(expr).length === 0) {
        errors.push({
          stepId: step.id,
          field: "condition_expr",
          message: "branch exige condition_expr (field/op/value/thenStepId/elseStepId).",
        });
      }
      break;
    }
    case "system_capture": {
      if (!step.pipeline_kind) {
        errors.push({
          stepId: step.id,
          field: "pipeline_kind",
          message: "system_capture exige pipeline_kind (cadastro_portal | ocr_conta | ocr_documento | finalizar_cadastro).",
        });
      }
      break;
    }
    case "audio_slot":
    case "text_message":
    case "media_message":
      // Sem regras canônicas extras nesses tipos.
      break;
  }

  return errors;
}
