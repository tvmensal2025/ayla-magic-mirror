// Helper para o WhatsAppPreview renderizar choices conforme o canal
// selecionado (Phase G Task 35 do whatsapp-flow-architecture-v3).
//
// Espelha a lógica de `_shared/channels/dispatch-choice.ts` mas em browser
// (TypeScript puro). Útil para mostrar ao consultor como o passo aparece
// em Whapi vs Evolution sem rodar o webhook real.

export type PreviewChannel = "whapi" | "evolution";

export interface PreviewChoice {
  preferred: "button" | "list" | "number";
  options: Array<{ id: string; title: string }>;
}

export interface PreviewRendered {
  kind: "button" | "list" | "text";
  body: string;
  buttons?: Array<{ id: string; title: string }>;
  downgraded: boolean;
  downgradeReason?: string;
}

const CHANNEL_CAPS = {
  evolution: { supportsButtons: true, maxButtons: 3, supportsList: false },
  whapi:     { supportsButtons: true, maxButtons: 3, supportsList: true },
} as const;

export function previewChoice(
  prompt: string,
  choice: PreviewChoice,
  channel: PreviewChannel,
): PreviewRendered {
  const caps = CHANNEL_CAPS[channel];
  const opts = (choice.options || []).slice();

  if (choice.preferred === "button") {
    if (caps.supportsButtons && opts.length > 0 && opts.length <= caps.maxButtons) {
      return {
        kind: "button",
        body: prompt,
        buttons: opts.map((o) => ({ id: o.id, title: o.title.slice(0, 25) })),
        downgraded: false,
      };
    }
    return {
      kind: "text",
      body: renderNumbered(prompt, opts),
      downgraded: true,
      downgradeReason: !caps.supportsButtons ? "channel_no_button_support" : "too_many_options",
    };
  }

  if (choice.preferred === "list") {
    if (caps.supportsList && opts.length > 0) {
      return { kind: "list", body: prompt, buttons: opts, downgraded: false };
    }
    return {
      kind: "text",
      body: renderNumbered(prompt, opts),
      downgraded: true,
      downgradeReason: "channel_no_list_support",
    };
  }

  return {
    kind: "text",
    body: renderNumbered(prompt, opts),
    downgraded: false,
    downgradeReason: "preferred_number",
  };
}

function renderNumbered(prompt: string, options: Array<{ id: string; title: string }>): string {
  if (!options.length) return prompt;
  const lines = options.map((o, i) => `*${i + 1}.* ${o.title}`);
  return `${prompt}\n\n${lines.join("\n")}\n\n_Digite o número da opção desejada._`;
}
