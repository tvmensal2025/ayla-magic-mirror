/**
 * `stepTypeColors` — paleta visual por `step_type` para o Modo_Diagrama.
 *
 * Cada `step_type` recebe um conjunto de classes Tailwind aplicadas no
 * `FlowDiagramNode` para diferenciar o tipo do passo no canvas. Antes,
 * todos os nós eram verde-primary, o que dificultava distinguir um
 * "Captar conta" de um "Mensagem comum" rapidamente.
 *
 * Estratégia:
 *   - `accentBg`  → fundo do "chip" do ícone no header.
 *   - `accentText`→ cor do ícone/emoji.
 *   - `stripe`    → barra vertical à esquerda do card (4px), reforça o tipo.
 *   - `ring`      → cor do anel quando selecionado (sobrescreve o primary).
 *
 * Cores escolhidas para garantir contraste WCAG AA tanto no tema claro
 * quanto no escuro (o componente usa Tailwind dark mode automaticamente).
 */

export type StepTypeColor = {
  /** Classe de fundo do chip do ícone (com leve transparência). */
  accentBg: string;
  /** Classe de cor do ícone/emoji. */
  accentText: string;
  /** Classe da barra colorida lateral à esquerda do card. */
  stripe: string;
  /** Cor HSL utilizada em focus/selected para sobrescrever o primary. */
  ringHsl: string;
  /** Rótulo curto para badge "tipo" — usado em a11y. */
  shortLabel: string;
};

const PALETTE: Record<string, StepTypeColor> = {
  // Mensagem genérica — azul calmo
  message: {
    accentBg: "bg-sky-500/15",
    accentText: "text-sky-600 dark:text-sky-400",
    stripe: "bg-sky-500",
    ringHsl: "199 89% 48%",
    shortLabel: "Mensagem",
  },
  // Captura de conta de luz — laranja (foto/upload)
  capture_conta: {
    accentBg: "bg-orange-500/15",
    accentText: "text-orange-600 dark:text-orange-400",
    stripe: "bg-orange-500",
    ringHsl: "24 95% 53%",
    shortLabel: "Conta de luz",
  },
  // Captura de documento — âmbar
  capture_documento: {
    accentBg: "bg-amber-500/15",
    accentText: "text-amber-700 dark:text-amber-400",
    stripe: "bg-amber-500",
    ringHsl: "38 92% 50%",
    shortLabel: "Documento",
  },
  // Captura de email — violeta
  capture_email: {
    accentBg: "bg-violet-500/15",
    accentText: "text-violet-600 dark:text-violet-400",
    stripe: "bg-violet-500",
    ringHsl: "262 83% 58%",
    shortLabel: "E-mail",
  },
  // Confirmação telefone — ciano
  confirm_phone: {
    accentBg: "bg-cyan-500/15",
    accentText: "text-cyan-700 dark:text-cyan-300",
    stripe: "bg-cyan-500",
    ringHsl: "189 94% 43%",
    shortLabel: "Telefone",
  },
  // Finalizar cadastro — verde primary (sucesso)
  finalizar_cadastro: {
    accentBg: "bg-emerald-500/15",
    accentText: "text-emerald-600 dark:text-emerald-400",
    stripe: "bg-emerald-500",
    ringHsl: "160 84% 39%",
    shortLabel: "Finalizar",
  },
};

const DEFAULT_COLOR: StepTypeColor = {
  accentBg: "bg-primary/10",
  accentText: "text-primary",
  stripe: "bg-primary",
  ringHsl: "var(--primary)",
  shortLabel: "Passo",
};

/**
 * Retorna a paleta para um `step_type`. Tipos não mapeados caem em
 * `DEFAULT_COLOR` (verde primary), mantendo a aparência anterior como
 * fallback — assim, um `step_type` desconhecido não quebra o visual.
 */
export function getStepTypeColor(stepType: string | null | undefined): StepTypeColor {
  if (!stepType) return DEFAULT_COLOR;
  return PALETTE[stepType] ?? DEFAULT_COLOR;
}
