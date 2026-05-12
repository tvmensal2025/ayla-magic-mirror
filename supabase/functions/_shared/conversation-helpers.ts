// ─── Normalização e validação pós-OCR documento ─────────────────────────
export function normalizarRG(rg: string | undefined): string {
  if (!rg || typeof rg !== "string") return "";
  const limpo = rg.replace(/\s/g, "").replace(/[.\-/]/g, "").replace(/[^\d]/g, "");
  return limpo.length >= 7 && limpo.length <= 12 ? limpo : "";
}

export function validarDataNascimento(data: string | undefined): string {
  if (!data || typeof data !== "string") return "";
  const trim = data.trim();
  const match = trim.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    const iso = trim.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
    return "";
  }
  const [, d, m, y] = match;
  const dia = parseInt(d, 10), mes = parseInt(m, 10), ano = parseInt(y, 10);
  const anoMax = new Date().getFullYear() - 15;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1920 || ano > anoMax) return "";
  return `${d}/${m}/${y}`;
}

export function validarNomeOCR(nome: string | undefined): string {
  if (!nome || typeof nome !== "string") return "";
  let t = nome.trim().replace(/\s+/g, " ");
  t = t.replace(/\s0\s/g, " O ");
  if (t.length < 3) return "";
  if (/^\d+$/.test(t)) return "";
  return t;
}

export function validarCPFDigitos(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i], 10) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(c[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i], 10) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === parseInt(c[10], 10);
}

/**
 * Determina o próximo passo baseado nos dados que faltam.
 * Ordem: nome → cpf → rg → nascimento → telefone → email → cep → número → complemento → instalação → valor → finalizar
 */
export function getNextMissingStep(c: any): string {
  if (!c.name) return "ask_name";
  if (!c.cpf) return "ask_cpf";
  // CPF com dígitos verificadores inválidos → pedir novamente
  if (c.cpf && !validarCPFDigitos(c.cpf)) return "ask_cpf";
  if (!c.rg) return "ask_rg";
  // Data placeholder (2000-01-01) ou vazia → pedir
  if (!c.data_nascimento || /^2000-01-01/.test(String(c.data_nascimento))) return "ask_birth_date";
  // Telefone só vale se foi CONFIRMADO pelo cliente (não basta existir phone_landline herdado)
  if (!c.phone_landline || c.phone_contact_confirmed !== true) return "ask_phone_confirm";
  // Email vazio, placeholder ou de teste → pedir
  if (
    !c.email ||
    /@lead\.igreen$/i.test(c.email) ||
    /^tvmensal/i.test(c.email) ||
    /@teste/i.test(c.email) ||
    /^teste@/i.test(c.email) ||
    /^noreply@/i.test(c.email) ||
    /^sem_email/i.test(c.email)
  ) return "ask_email";
  if (!c.cep) return "ask_cep";
  // CEP genérico (termina em 000) → pedir manualmente
  if (c.cep && /000$/.test(c.cep.replace(/\D/g, ""))) return "ask_cep";
  if (!c.address_number) return "ask_number";
  // complemento é opcional, mas perguntar uma vez
  if (c.address_complement === null || c.address_complement === undefined) return "ask_complement";
  if (!c.numero_instalacao) return "ask_installation_number";
  // Valor da conta: ausente ou suspeito (< 30)
  if (!c.electricity_bill_value || c.electricity_bill_value <= 0 || c.electricity_bill_value < 30) return "ask_bill_value";
  // Documentos (frente/verso) já foram coletados no fluxo principal
  if (!c.document_front_url) return "ask_doc_frente_manual";
  // Verso só é exigido para RG. Normalizamos para suportar "CNH"/"cnh"/"Cnh" etc.
  {
    const dt = String(c.document_type || "").toLowerCase();
    const isCnh = /cnh|habilita/.test(dt);
    const verso = String(c.document_back_url || "").trim();
    if (!isCnh && (!verso || verso === "nao_aplicavel")) return "ask_doc_verso_manual";
  }
  // Todos preenchidos → mostrar botão Finalizar
  return "ask_finalizar";
}

/**
 * Retorna a mensagem para cada step
 */
export function getReplyForStep(step: string, c: any): string {
  switch (step) {
    case "ask_name": return "Qual é o seu *nome completo*?";
    case "ask_tipo_documento": return "Qual documento de identidade você vai enviar? Toque em uma opção:";
    case "ask_cpf": return "Qual o seu *CPF*? (apenas números)";
    case "ask_rg": return "Qual o seu *RG*?";
    case "ask_birth_date": return "Qual sua *data de nascimento*? (DD/MM/AAAA)";
    case "ask_phone_confirm": {
      let p = (c.phone_whatsapp || "").replace(/\D/g, "");
      // Remove 55 prefix for display
      if (p.startsWith("55") && p.length >= 12) p = p.substring(2);
      const fmt = p.length >= 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : (c.phone_whatsapp || "");
      return `📞 Esse é o seu *telefone de contato*?\n\n*${fmt}*\n\n1️⃣ ✅ Sim, é meu\n2️⃣ 📱 Outro número\n\n_Digite o número da opção:_`;
    }
    case "ask_phone": return "Informe seu *telefone* com DDD (ex: 11999998888):";
    case "ask_email": return "📧 Informe seu *e-mail* para finalizarmos seu cadastro no portal iGreen (ex: joao.silva@gmail.com)\n\n_Se não tiver e-mail, crie um agora em *gmail.com* — leva 1 minuto._";
    case "ask_cep": return "Qual o seu *CEP*? (8 dígitos)";
    case "ask_number": return `📍 Endereço: *${c.address_street || ""}*\n\nQual o *número* da residência?`;
    case "ask_complement": return "Tem *complemento*? (ex: Apto 12)\n\nDigite *NÃO* ou *PULAR* se não tiver.";
    case "ask_installation_number": return "Qual o *número da instalação* de energia?\n(Campo \"Seu Código\" na conta de luz)";
    case "ask_bill_value": return "Qual o *valor médio* da sua conta de luz? (ex: 350)";
    case "ask_doc_frente_manual": return "📸 Envie a *FRENTE do seu documento* (RG ou CNH)";
    case "ask_doc_verso_manual": return "📸 Envie o *VERSO do seu documento*";
    case "ask_finalizar": return "✅ *Todos os dados foram preenchidos!*\n\n1️⃣ ✅ Finalizar\n\n_Digite *1* ou *FINALIZAR* para concluir:_";
    case "finalizando": return "✅ Todos os dados coletados! Processando...";
    default: return `Continuando... (${step})`;
  }
}
