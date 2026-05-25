// Tipos e helpers compartilhados entre o editor antigo (FluxoCamila) e o novo
// editor (FlowBuilder). Mantém a forma de dados idêntica para preservar
// compatibilidade total com o engine de runtime (whapi-webhook).

export type IconKey = "msg" | "video" | "sparkle" | "user" | "file";

export type Variant = "A" | "B" | "C" | "D" | "E";
export const ALL_VARIANTS: Variant[] = ["A", "B", "C", "D", "E"];

export type Transition = {
  trigger_intent: string;
  trigger_phrases: string[];
  goto_step_id: string | null;
  goto_special: "cadastro" | "humano" | "repeat" | "ai" | null;
};

export type CaptureField =
  | "name"
  | "electricity_bill_value"
  | "phone_whatsapp"
  | "cpf"
  | "_buttons";

export type Capture = {
  field: CaptureField;
  enabled: boolean;
  value?: { id: string; title: string }[]; // _buttons usa value
};

export type FallbackMode = "repeat" | "goto" | "ai" | "ai_limit";

export type Fallback = {
  mode: FallbackMode;
  goto_step_id?: string | null;
  ai_prompt?: string;
  /** "ai_limit": após N perguntas sem clique, dispara `then` */
  max_questions?: number;
  then?: "humano" | "next" | "repeat";
};


export type Step = {
  id: string;
  flow_id: string;
  position: number;
  step_type: string;
  step_key: string | null;
  title: string;
  summary: string | null;
  icon: IconKey;
  message_text: string | null;
  text_delay_ms: number | null;
  slot_key: string | null;
  transitions: Transition[];
  captures: Capture[];
  fallback: Fallback;
  is_active: boolean;
  auto_detect_doc_type?: boolean;
};

export const STEP_TYPE_OPTIONS: { value: string; label: string; emoji: string; hint: string }[] = [
  { value: "message", emoji: "💬", label: "Mensagem comum", hint: "Texto + mídia + regras (padrão)." },
  { value: "capture_conta", emoji: "📸", label: "Captar conta de luz", hint: "Pede a conta, faz OCR e confirma." },
  { value: "capture_documento", emoji: "🪪", label: "Captar documento", hint: "RG/CNH com auto-detecção." },
  { value: "capture_email", emoji: "📧", label: "Captar e-mail", hint: "Pede e-mail e confirma antes de seguir." },
  { value: "confirm_phone", emoji: "📱", label: "Confirmar telefone", hint: "Usa este WhatsApp ou outro?" },
  { value: "finalizar_cadastro", emoji: "🎉", label: "Finalizar cadastro", hint: "Envia ao portal, trata OTP e parabeniza." },
];

export const VARIANT_LABEL: Record<Variant, string> = {
  A: "A (com áudio)",
  B: "B (sem áudio)",
  C: "C (vídeo inicial)",
  D: "D (personalizado)",
  E: "E (personalizado)",
};

// Presets de botões prontos para arrastar/clicar
export const BUTTON_PRESETS: { id: string; title: string; emoji: string }[] = [
  { id: "simular", title: "Quero simular", emoji: "📸" },
  { id: "como", title: "Como funciona", emoji: "🤔" },
  { id: "sim", title: "Sim", emoji: "✅" },
  { id: "nao", title: "Não", emoji: "❌" },
  { id: "duvida", title: "Tenho dúvida", emoji: "🤔" },
  { id: "cadastrar", title: "Cadastrar agora", emoji: "📝" },
  { id: "humano", title: "Falar com humano", emoji: "👤" },
];

export function parseTransitions(raw: unknown): Transition[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .filter((t) => String(t?.trigger_intent ?? "") !== "default")
    .map((t) => ({
      trigger_intent: String(t?.trigger_intent ?? "afirmacao"),
      trigger_phrases: Array.isArray(t?.trigger_phrases) ? t.trigger_phrases.map(String) : [],
      goto_step_id: t?.goto_step_id ?? null,
      goto_special: (t?.goto_special as Transition["goto_special"]) ?? null,
    }));
}

export function parseCaptures(raw: unknown): Capture[] {
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .filter((c) => c && typeof c.field === "string")
    .map((c) => {
      const base: any = { field: c.field, enabled: c.enabled !== false };
      if (c.field === "_buttons" && Array.isArray(c.value)) base.value = c.value;
      return base as Capture;
    });
}

export function parseFallback(raw: unknown, transitions: unknown): Fallback {
  if (raw && typeof raw === "object") {
    const r = raw as any;
    if (r.mode === "goto" || r.mode === "ai" || r.mode === "repeat") {
      return {
        mode: r.mode,
        goto_step_id: r.goto_step_id ?? null,
        ai_prompt: typeof r.ai_prompt === "string" ? r.ai_prompt : "",
      };
    }
  }
  if (Array.isArray(transitions)) {
    const def = (transitions as any[]).find((t) => t?.trigger_intent === "default");
    if (def) {
      if (def.goto_special === "repeat" || (!def.goto_step_id && !def.goto_special)) {
        return { mode: "repeat" };
      }
      if (def.goto_step_id) return { mode: "goto", goto_step_id: def.goto_step_id };
    }
  }
  return { mode: "repeat" };
}

/** Retorna os botões definidos em captures._buttons (se houver). */
export function getButtons(step: Step): { id: string; title: string }[] {
  const c = step.captures.find((x) => x.field === "_buttons");
  return Array.isArray(c?.value) ? c!.value! : [];
}

/** Detecta se o passo dispara OCR (foto da conta de luz ou documento). */
export function isOcrStep(step: Step): "conta" | "documento" | null {
  if (isAiAnswerStep(step)) return null;
  const key = (step.step_key ?? "").toLowerCase();
  const type = (step.step_type ?? "").toLowerCase();
  if (type === "capture_conta" || /conta|fatura|luz/.test(key)) {
    if (/document|rg|cnh/.test(key)) return "documento";
    if (/conta|fatura|luz/.test(key)) return "conta";
  }
  if (type === "capture_documento" || /document|rg|cnh/.test(key)) return "documento";
  return null;
}

/** Detecta se o passo é "IA livre" (responde dúvidas com Gemini em loop). */
export function isAiAnswerStep(step: Step): boolean {
  const slot = (step.slot_key ?? "").toLowerCase();
  const key = (step.step_key ?? "").toLowerCase();
  if (slot === "esclarecer_duvidas") return true;
  if (slot && slot.includes("duvid") && slot !== "duvidas_pos_club") return true;
  if (key && key.includes("duvid") && key !== "duvidas_pos_club") return true;
  return false;
}




/** Resolve o título de um passo destino para exibir no preview/inspector. */
export function resolveGotoLabel(
  steps: Step[],
  t: Transition,
): { label: string; missing: boolean } {
  if (t.goto_special === "humano") return { label: "👤 Falar com humano", missing: false };
  if (t.goto_special === "cadastro") return { label: "📝 Pular para cadastro", missing: false };
  if (t.goto_special === "repeat") return { label: "🔁 Repetir passo", missing: false };
  if (t.goto_step_id) {
    const s = steps.find((x) => x.id === t.goto_step_id);
    if (!s) return { label: "⚠ Passo removido", missing: true };
    if (!s.is_active) return { label: `⚠ ${s.title} (inativo)`, missing: true };
    return { label: s.title, missing: false };
  }
  return { label: "⚠ Sem destino", missing: true };
}

/** Substitui variáveis padrão por exemplos pro preview. */
export function renderVarsPreview(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\{\{nome\}\}/gi, "João")
    .replace(/\{\{valor_conta\}\}/gi, "450,00")
    .replace(/\{\{economia_range\}\}/gi, "R$ 80 a R$ 90")
    .replace(/\{\{telefone\}\}/gi, "(11) 99999-8888")
    .replace(/\{\{cpf\}\}/gi, "123.456.789-00")
    .replace(/\{\{representante\}\}/gi, "Rafael")
    .replace(/\{\{email\}\}/gi, "joao@email.com");
}
