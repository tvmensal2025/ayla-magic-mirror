// Step namespace helper.
//
// `customer.conversation_step` agora carrega prefixo explícito:
//   - "sys:<name>"  → motor determinístico (bot-flow.ts) com nome canônico
//   - "flow:<id>"   → motor dinâmico (DB-driven, bot_flow_steps.id)
//
// Rationale: o engine determinístico hardcoda nomes (`qualificacao`,
// `aguardando_conta`, etc.) enquanto o FlowBuilder gera step_keys arbitrários
// (UUIDs ou `passo_<ts>`). Sem namespace eles colidem, o conversational não
// acha o step e fica em loop reiniciando o fluxo.
//
// Compat reversa: leituras sem prefixo são deduzidas pelo SYS_STEPS set.

export const SYS_STEPS: ReadonlySet<string> = new Set([
  // Conversacional / pós-vídeo (legacy hardcoded em bot-flow.ts e templates)
  "welcome", "menu_inicial", "pos_video", "qualificacao",
  "checkin_pos_video", "pitch_conexao_club", "duvidas_pos_club",
  "aguardando_humano",

  // Cadastro — pipeline determinístico
  "aguardando_conta", "processando_ocr_conta", "confirmando_dados_conta",
  "ask_tipo_documento", "aguardando_doc_auto", "aguardando_doc_frente", "aguardando_doc_verso",
  "confirmando_dados_doc", "ask_name", "ask_cpf", "ask_rg", "ask_birth_date",
  "ask_phone_confirm", "ask_phone", "ask_email", "ask_cep", "ask_number",
  "ask_complement", "ask_installation_number", "ask_bill_value",
  "ask_doc_frente_manual", "ask_doc_verso_manual", "ask_finalizar",
  "finalizando", "portal_submitting", "aguardando_otp", "validando_otp",
  "aguardando_assinatura", "complete",

  // Edição pós-OCR (conta de luz)
  "editing_conta_menu", "editing_conta_nome", "editing_conta_endereco",
  "editing_conta_cep", "editing_conta_distribuidora", "editing_conta_instalacao",
  "editing_conta_valor",

  // Edição pós-OCR (documento)
  "editing_doc_menu", "editing_doc_nome", "editing_doc_cpf", "editing_doc_rg",
  "editing_doc_nascimento", "editing_doc_pai", "editing_doc_mae",
]);

export type Engine = "sys" | "flow";

export function isSysStep(raw: string | null | undefined): boolean {
  return !!raw && raw.startsWith("sys:");
}
export function isFlowStep(raw: string | null | undefined): boolean {
  return !!raw && raw.startsWith("flow:");
}

/** Strip prefixo para uso interno dos engines (que esperam nome cru). */
export function stripPrefix(raw: string | null | undefined): string {
  if (!raw) return "welcome";
  if (raw.startsWith("sys:")) return raw.slice(4);
  if (raw.startsWith("flow:")) return raw.slice(5);
  return raw;
}

/** Normaliza valor lido do banco (compat reversa). */
export function normalizeIncoming(raw: string | null | undefined): string {
  if (!raw) return "sys:welcome";
  if (raw.startsWith("sys:") || raw.startsWith("flow:")) return raw;
  // Sem prefixo: deduz pelo nome
  if (SYS_STEPS.has(raw)) return `sys:${raw}`;
  // UUID, passo_xxx, ou qualquer outro literal → tratado como flow step
  return `flow:${raw}`;
}

/** Garante prefixo correto na escrita, conforme engine que produziu o valor. */
export function normalizeOutgoing(raw: string | null | undefined, engine: Engine): string | null {
  if (!raw) return null;
  if (raw.startsWith("sys:") || raw.startsWith("flow:")) return raw;
  if (SYS_STEPS.has(raw)) return `sys:${raw}`;
  return engine === "flow" ? `flow:${raw}` : `sys:${raw}`;
}

/** Roteamento: qual engine deve processar este step? */
export function routeEngine(normalizedStep: string): Engine {
  return isFlowStep(normalizedStep) ? "flow" : "sys";
}
