// Renderizador de OutboundChoice (Phase D Task 23 do
// whatsapp-flow-architecture-v3).
//
// FUNÇÃO PURA. Recebe `OutboundChoice` + `ChannelCapabilities`, decide se
// o canal vai renderizar como botão real, lista interativa, ou texto
// numerado determinístico. Caller (dispatcher) chama `adapter.send*`
// apropriado em seguida.
//
// Lógica:
//   1. preferred='button' && supportsButtons && options <= maxButtons → button
//   2. preferred='list' && supportsList → list
//   3. caso contrário → text numerado
//
// Output formato `text` é exatamente "*1.* opção A\n*2.* opção B…\n\n_Digite o número da opção desejada._"

import type { ChannelCapabilities, OutboundChoice } from "./types.ts";

export type RenderedChoice =
  | { kind: "button"; options: Array<{ id: string; title: string }> }
  | { kind: "list"; options: Array<{ id: string; title: string; description?: string }> }
  | { kind: "text"; text: string };

export interface RenderChoiceResult {
  rendered: RenderedChoice;
  /** True quando preferimos botão mas caímos em texto numerado. */
  downgraded: boolean;
  /** Razão do downgrade quando aplicável. */
  downgradeReason?: "channel_no_button_support" | "too_many_options" | "channel_no_list_support" | "preferred_number";
}

export function renderChoice(
  prompt: string,
  choice: OutboundChoice,
  capabilities: ChannelCapabilities,
): RenderChoiceResult {
  const options = (choice.options || []).slice();

  // (1) Tenta botão real
  if (choice.preferred === "button") {
    if (capabilities.supportsButtons && options.length > 0 && options.length <= capabilities.maxButtons) {
      return {
        rendered: {
          kind: "button",
          options: options.map((o) => ({ id: o.id, title: (o.title || "").slice(0, 25) })),
        },
        downgraded: false,
      };
    }
    // Fallback: lista numerada.
    return {
      rendered: { kind: "text", text: renderNumberedText(prompt, options) },
      downgraded: true,
      downgradeReason: !capabilities.supportsButtons
        ? "channel_no_button_support"
        : "too_many_options",
    };
  }

  // (2) Tenta lista interativa
  if (choice.preferred === "list") {
    if (capabilities.supportsList && options.length > 0) {
      return {
        rendered: { kind: "list", options },
        downgraded: false,
      };
    }
    return {
      rendered: { kind: "text", text: renderNumberedText(prompt, options) },
      downgraded: true,
      downgradeReason: "channel_no_list_support",
    };
  }

  // (3) preferred='number' explícito → texto numerado direto (sem downgrade).
  return {
    rendered: { kind: "text", text: renderNumberedText(prompt, options) },
    downgraded: false,
    downgradeReason: "preferred_number",
  };
}

/**
 * Formato determinístico para texto numerado:
 *   "<prompt>
 *
 *   *1.* opção A
 *   *2.* opção B
 *
 *   _Digite o número da opção desejada._"
 */
export function renderNumberedText(
  prompt: string,
  options: Array<{ id: string; title: string }>,
): string {
  if (!options.length) return prompt;
  const lines = options.map((o, i) => `*${i + 1}.* ${o.title}`);
  return `${prompt}\n\n${lines.join("\n")}\n\n_Digite o número da opção desejada._`;
}
