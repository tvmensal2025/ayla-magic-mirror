// Template loader — reads bot_messages from DB with hardcoded fallback.

const FALLBACK: Record<string, string> = {
  "welcome:saudacao": "Oi! Aqui é a Camila, assistente do {{representante}} 👋",
  "menu_inicial:reforco": "{{nome}}, ainda quer entender como funciona o desconto?",
  "qualificacao:pergunta_conta": "Qual o valor médio da sua conta de luz hoje?",
  "pos_video:checkin": "E aí, {{nome}}, ficou alguma dúvida?",
  "checkin_pos_video:reforco_checkin": "{{nome}}, ficou alguma dúvida ou já partimos pro cadastro?",
  "checkin_pos_video:pedir_conta": "Perfeito! Me manda uma foto ou PDF da sua conta de luz 📸",
  "pitch_conexao_club:apresentar": "Olha que legal, {{nome}} — vou te mostrar 👇",
  "duvidas_pos_club:pode_perguntar": "Pode perguntar à vontade, {{nome}} 🤝",
  "duvidas_pos_club:rumo_cadastro": "Show! Me envia uma foto da sua conta de luz 📸",
  "aguardando_humano:avisado": "Já avisei o {{representante}}. Em breve te chama 👍",
  "fallback:nao_entendi": "Desculpa, não captei. Pode reformular?",
};

export interface TemplateVars {
  nome?: string | null;
  representante?: string | null;
}

export function renderTemplate(tpl: string, vars: TemplateVars): string {
  const nome = (vars.nome || "").split(" ")[0] || "amigo";
  const rep = vars.representante || "consultor";
  return tpl
    .replaceAll("{{nome}}", nome)
    .replaceAll("{{representante}}", rep);
}

export async function getTemplate(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  step_key: string,
  template_key: string,
  vars: TemplateVars,
  variant = "default",
): Promise<string> {
  try {
    const { data } = await supabase
      .from("bot_messages")
      .select("text")
      .eq("step_key", step_key)
      .eq("template_key", template_key)
      .eq("variant", variant)
      .eq("active", true)
      .maybeSingle();
    const tpl = data?.text || FALLBACK[`${step_key}:${template_key}`] || FALLBACK["fallback:nao_entendi"];
    return renderTemplate(tpl, vars);
  } catch {
    return renderTemplate(FALLBACK[`${step_key}:${template_key}`] || FALLBACK["fallback:nao_entendi"], vars);
  }
}
