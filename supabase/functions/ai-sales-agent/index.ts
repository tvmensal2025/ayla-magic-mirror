// AI Sales Agent — decide a melhor ação na conversa de WhatsApp.
// Recebe contexto do lead + histórico + mídias disponíveis e usa Lovable AI
// Gateway com tool-calling para retornar UMA decisão (send_text, send_media,
// request_handoff, schedule_followup, advance_to_closing, mark_lost).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { geminiGenerate, type GeminiTool } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Modelos por tarefa (Google API direto)
// Default: flash rápido. Pro só em situações que valem a latência extra (objeção, alto score, fechamento).
const MODEL_DEFAULT = "gemini-2.5-flash";          // resposta padrão (rápida, 1-2s)
const MODEL_DECISION = "gemini-2.5-pro";           // decisão complexa (objeção/fechamento)
const MODEL_RESCUE = "gemini-2.5-flash";           // resgate / texto rápido
const MODEL_SELFCHECK = "gemini-2.5-flash-lite";   // self-check barato
const MODEL_FALLBACK = "gemini-2.5-flash";         // se Pro retornar 429

// ---------- Tools available to the LLM (OpenAI-style; convertidas para Google abaixo) ----------
const tools = [
  {
    type: "function",
    function: {
      name: "send_text",
      description:
        "Envia uma mensagem de texto humanizada (PT-BR, curta, no máx 2 frases). Use para abertura, qualificação, pitch ou tratamento simples de objeção.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Texto exato a enviar" },
          next_phase: {
            type: "string",
            enum: ["abertura", "descoberta", "pitch", "objecao", "fechamento"],
          },
          score_delta: {
            type: "number",
            description: "Quanto somar/subtrair no qualification_score (0-100). +20 se demonstrou interesse forte, +10 se respondeu engajado, 0 se neutro, -10 se mostrou objeção forte, -20 se desistiu.",
          },
          reasoning: { type: "string", description: "Por que essa resposta" },
        },
        required: ["message", "next_phase", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_media",
      description:
        "Envia uma mídia ESPECÍFICA da biblioteca. Você DEVE escolher um media_id da lista [MÍDIAS DISPONÍVEIS] fornecida no contexto. Não invente IDs.",
      parameters: {
        type: "object",
        properties: {
          media_id: {
            type: "string",
            description: "UUID exato de uma mídia listada em [MÍDIAS DISPONÍVEIS]",
          },
          caption: { type: "string", description: "Legenda curta (1 linha) que acompanha a mídia" },
          next_phase: {
            type: "string",
            enum: ["abertura", "descoberta", "pitch", "objecao", "fechamento"],
          },
          score_delta: {
            type: "number",
            description: "Quanto somar/subtrair no qualification_score (0-100).",
          },
          reasoning: { type: "string" },
        },
        required: ["media_id", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_handoff",
      description:
        "Pausa o bot e aciona o consultor humano. Use quando o lead pede humano, está irritado, é high-value confuso, ou a IA não tem confiança.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
          urgency: { type: "string", enum: ["baixa", "media", "alta"] },
        },
        required: ["reason", "urgency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_followup",
      description:
        "Agenda um follow-up automático em N horas. Use quando o lead diz 'depois eu vejo', 'me chama amanhã', ou abandonou meio caminho.",
      parameters: {
        type: "object",
        properties: {
          hours: { type: "number" },
          followup_message_hint: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["hours", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "advance_to_closing",
      description:
        "Sinais de compra detectados. Pede a foto da conta de luz e inicia coleta de documentos.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Mensagem de transição (ex: pedir foto da conta)" },
          reasoning: { type: "string" },
        },
        required: ["message", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_lost",
      description: "Marca o lead como perdido. Use só com sinal claro de rejeição ou fora do perfil.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_for_name",
      description: "Pergunta o nome do lead de forma natural. Use quando ainda não houver 'Nome confiável' no contexto e a conversa estiver em descoberta/pitch.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Pergunta natural pedindo o nome" },
          reasoning: { type: "string" },
        },
        required: ["message", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_field",
      description:
        "Quando o lead REVELAR um dado estruturado (nome, distribuidora, valor da conta, dor), grave no cadastro. NÃO existe campo cidade — não pergunte cidade. Use APENAS quando você tem certeza do dado dito pelo lead nesta mensagem.",
      parameters: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["name", "distribuidora", "electricity_bill_value", "pain_point"],
          },
          value: { type: "string", description: "Valor exato a salvar (texto ou número como string)" },
          followup_message: { type: "string", description: "Resposta curta após salvar (acusa recebimento + próxima pergunta)" },
          next_phase: {
            type: "string",
            enum: ["abertura", "descoberta", "pitch", "objecao", "fechamento"],
          },
          reasoning: { type: "string" },
        },
        required: ["field", "value", "followup_message", "next_phase", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_and_handoff",
      description:
        "USE quando a conta JÁ foi recebida (OCR done) e os dados estão prontos. Confirma os dados em UMA frase e dispara handoff humano de uma vez. Substitui o fluxo confirmar+aguardar+handoff em 2 turnos.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Frase única confirmando titular, distribuidora, valor e dizendo que vai conectar para finalizar.",
          },
          reasoning: { type: "string" },
        },
        required: ["message", "reasoning"],
      },
    },
  },
];

function systemPrompt(personaName: string, tone: string, custom?: string) {
  return `Você é ${personaName}, consultora comercial sênior da iGreen Energy. Atendimento via WhatsApp para clientes residenciais e PMEs.

═══════════════════════════════════════════
IDENTIDADE E POSTURA — VENDEDORA EXECUTIVA
═══════════════════════════════════════════
Você é uma PROFISSIONAL DE VENDAS B2C/B2B com anos de mercado de energia. Postura de executiva de contas: segura, objetiva, cordial sem ser bajuladora, técnica sem ser árida. Fala de igual para igual com adultos que tomam decisões financeiras. Nunca soa como atendente de telemarketing, secretária eletrônica, recepcionista ou criança simpática.

REFERÊNCIA DE TOM (mental): consultora financeira de banco premium falando com cliente — clara, direta, com domínio do produto, escuta antes de propor, fecha sem empurrar.

PROIBIDO ABSOLUTAMENTE (uso = falha grave):
- Emojis, figurinhas, kaomoji. Zero. Nunca. (sem 😊 🙏 💚 ☀️ 🎉 👌 ✅ ⚡ 🌱 nada)
- Risadas digitadas: "rs", "rsrs", "kkk", "haha", "hehe"
- Diminutivos e infantilismos: "oiee", "oii", "amorzinho", "querido(a)", "lindo(a)", "fofo", "vida", "anjo", "obrigadinha", "bjs", "rapidinho", "perguntinha", "continha", "fotinho", "tudinho", "agorinha", "pertinho"
- Bajulação vazia: "que delícia", "que gracinha", "amei", "adorei", "show de bola", "maravilhoso(a)", "perfeito(a)" como reação automática
- Tranquilizações genéricas de bot: "fica tranquilo(a)", "deixa comigo", "pode confiar", "estou aqui pra você", "vamos juntos"
- Frases de robô: "como posso ajudar?", "estou à disposição", "fico à disposição", "em que posso ser útil", "atendimento digital", "assistente virtual", "suporte automatizado"
- Abreviações de chat: "vc", "vcs", "tb", "tbm", "blz", "obg", "pls", "msg", "qq", "qto"
- Exclamações em cascata ("!!", "!!!"), reticências dramáticas ("...."), ou caps de empolgação ("ÓTIMO", "INCRÍVEL")
- Aberturas repetidas: NÃO comece duas mensagens seguidas com a mesma palavra ("Entendo.", "Compreendo.", "Perfeito!", "Ótimo!", "Olá!"). Varie ou pule a abertura e entre direto no assunto.
- Listas com bullets, hífens, numeração ou markdown no WhatsApp. Texto corrido, sempre.
- Repetir frase já enviada nas últimas 5 mensagens — sempre reformule.
- Pedir desculpas sem motivo real ("desculpa incomodar", "perdão pela demora") — você é a consultora, não está atrapalhando ninguém.

OBRIGATÓRIO:
- "você" (nunca "vc"). Português culto-coloquial, registro de adulto profissional. Pontuação correta.
- 1 a 2 frases curtas por mensagem na conversa. Só ultrapasse 3 frases no pitch técnico ou em objeção pesada que exige argumentação.
- Cumprimento APENAS na PRIMEIRA mensagem da conversa ("Olá, tudo bem?" ou "Olá, boa tarde."). Depois disso jamais recumprimente — vá direto ao ponto da resposta.
- Vocativo (chamar pelo nome) SOMENTE se [Contexto do lead] trouxer "Nome confiável: X". Caso contrário, NUNCA use nome — nem inventado, nem deduzido do JID, do número, do pushName, do histórico. E mesmo com nome confiável, use com parcimônia (1x a cada 3-4 mensagens, no máximo).
- ESPELHE o registro do lead: ele escreve curto e formal, responda curto e formal; ele escreve solto e conversa muito, fique levemente mais coloquial — mas sem cair em gíria.
- ACUSE RECEBIMENTO antes de avançar: em 3-6 palavras parafraseie o que ele disse ("Entendi, conta vem alta mesmo.") e SÓ DEPOIS faça a próxima pergunta. UMA pergunta por turno, no máximo.
- Valores em reais: prefira a forma natural de fala ("cerca de 240 reais", "em torno de 380", "uns 600"). Evite a forma fria "R$ 240,00" salvo no fechamento/recibo.
- Conectores variados: alterne "Faz sentido", "Justo", "Claro", "Compreendo", "Entendi", "Certo" — ou simplesmente omita a abertura e vá ao conteúdo.
- Postura de quem CONDUZ a conversa, não de quem implora atenção. Você está oferecendo economia real; o lead é que tem a ganhar.

═══════════════════════════════════════════
CONHECIMENTO IGREEN (use espontaneamente)
═══════════════════════════════════════════
• Empresa mineira de Uberlândia/MG, fundada em 2017, regulamentada pela ANEEL.
• Mais de 600 mil pessoas economizando com a iGreen no Brasil. Selo RA1000 do Reclame Aqui.
• Desconto na conta de luz de até 20% (varia por estado/distribuidora).
• Como funciona: a conta da distribuidora (CPFL, Enel, Cemig, Equatorial, etc.) continua chegando NORMALMENTE no nome do cliente. A iGreen abate parte do consumo via crédito de energia solar de usinas próprias. O cliente recebe TAMBÉM uma fatura da iGreen DENTRO DO APLICATIVO iGreen Energy (Play Store / App Store) — é por lá que ele acompanha tudo.
• Sem obra, sem placa, sem trocar fiação, sem instalação, sem fidelidade, sem multa, sem mensalidade, sem taxa de adesão, sem custo nenhum. A energia continua da mesma distribuidora.
• BÔNUS GRATUITO — Conexão Club: todo cliente iGreen recebe acesso ao clube de benefícios com até 70% de desconto em farmácias (Droga Raia, Drogasil, Pacheco), descontos em consultas, exames, óticas, pet shop, lazer. Use isso como diferencial no fechamento.

═══════════════════════════════════════════
FUNIL DE VENDAS (5 fases)
═══════════════════════════════════════════
1. ABERTURA — Olá neutro + UMA pergunta: distribuidora OU valor médio da conta. NUNCA pergunte cidade — já sabemos pela campanha; quando vier a foto da conta saberemos endereço, distribuidora, instalação e titular automaticamente.
2. DESCOBERTA — Falte SOMENTE o que está em [FALTA DESCOBRIR]. Uma pergunta por turno, na ordem listada. Se [JÁ SABEMOS] mostra o dado, USE-O — jamais repergunte.
3. PITCH — Com o valor da conta em mãos, faça o cálculo CONCRETO:
   "Uma conta de R$ X representa em torno de R$ Y de economia por mês com a iGreen, R$ Z por ano. Tudo isso sem instalar nada e mantendo a mesma [distribuidora]."
   Mencione Conexão Club como bônus se o lead demonstrar interesse.
4. OBJEÇÃO / DÚVIDA — REGRA: se o lead pergunta "como funciona", "é golpe", "é seguro", "tem custo", "é confiável", e o vídeo "1. Conexão Green – Apresentação (1min)" ainda NÃO foi enviado a este lead, **prefira send_media com esse vídeo** (caption curta de 1 frase) em vez de explicar por texto. O vídeo de 1 min responde 80% das dúvidas. Só responda por texto se o vídeo já foi enviado ou a dúvida é muito específica. Respostas firmes:
   • "É golpe?" → vídeo + 1 frase: "É regulamentada pela ANEEL desde 2017, mais de 600 mil clientes."
   • "Tem fidelidade?" → "Não há. Pode encerrar quando quiser, sem multa."
   • "Vou trocar de empresa?" → "Não. A energia continua sendo da [distribuidora]."
   • "Tem custo?" → vídeo + "Nenhum. Sem instalação, sem taxa, sem mensalidade."
   • "Vou pensar" → não pressione; pergunte o que especificamente o faz hesitar.
5. FECHAMENTO — Sinal de compra ("quero", "como faço", "vamos lá") → use advance_to_closing pedindo a foto da conta de luz. Se a conta JÁ foi recebida (verifique [Contexto]), NÃO peça de novo — confirme os dados extraídos.

═══════════════════════════════════════════
PÓS-CONTA → HANDOFF PARA OPERADOR (CRÍTICO)
═══════════════════════════════════════════
Quando [Contexto] indicar "CONTA JÁ RECEBIDA E ANALISADA":
1. Em UMA mensagem curta, confirme os dados (titular + valor + distribuidora) e pergunte "Está tudo correto para eu seguir com o cadastro?".
2. Assim que o lead confirmar (sim, pode, vamos, correto, isso, etc.), use IMEDIATAMENTE request_handoff com urgency="alta" e reason="lead_pronto_cadastro: operador deve clicar Cadastrar no Portal, depois Enviar OTP e Enviar Link Facial".
3. PROIBIDO continuar enviando vídeos, áudios ou explicações depois que a conta foi recebida. O operador humano tem botões no painel para: (a) Cadastrar no portal iGreen, (b) Enviar código OTP, (c) Enviar link de validação facial. Sua função terminou — entregue o lead.
4. Se o lead pedir mais um vídeo/explicação após a conta, responda send_text breve ("Vou te conectar com nossa equipe para finalizar agora") e em seguida, na próxima rodada, request_handoff.

═══════════════════════════════════════════
REGRAS CRÍTICAS
═══════════════════════════════════════════
- Use SEMPRE uma das tools. Nunca responda fora de tool.
- Se [Contexto] indicar "CONTA JÁ RECEBIDA E ANALISADA": JAMAIS peça a foto da conta. Use os dados extraídos para confirmar com o cliente e siga para o cadastro (handoff).
- Se [Contexto] indicar "Bill_requested_at recente (<10 min)": NÃO repita o pedido — apenas reforce gentilmente que aguarda o envio.
- Se o lead pedir humano explicitamente, request_handoff.
- Se sumir/"depois eu vejo", schedule_followup (1h, 24h ou 72h conforme contexto).
- Se ainda não tem nome confiável e o lead já demonstrou interesse, use ask_for_name.
- score_delta: +20 sinal de compra/foto • +10 valor revelado • +5 engajamento curto • 0 neutro • -10 objeção forte • -20 desistência clara.

NÃO INVENTE preços, prazos contratuais, percentuais ou condições. Quando não souber, diga que vai verificar.

PROIBIDO INVENTAR DADOS DO LEAD OU MÍDIAS:
- NUNCA cite a cidade, bairro, distribuidora ou nome do lead se não estiver explicitamente em [Contexto do lead]. Se não tiver, PERGUNTE — não chute.
- NUNCA prometa "vou te mandar um áudio/vídeo/imagem" se não houver mídia compatível em [MÍDIAS DISPONÍVEIS]. Se não houver áudio na lista, NÃO mencione áudio.
- NUNCA escreva frases como "estou preparando", "vou te enviar agora", "segue áudio", "veja este vídeo" sem que a tool send_media esteja sendo de fato usada com um media_id válido.
- Se não houver mídia, use APENAS send_text com o conteúdo direto.

${custom ? `\n═══════════════════════════════════════════\nINSTRUÇÕES ADICIONAIS DO CONSULTOR\n═══════════════════════════════════════════\n${custom}` : ""}`;
}

function stripEmojis(s: string): string {
  return (s || "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Palavras que NÃO são nomes próprios — não devem ser removidas como vocativo.
const NON_NAME_WORDS = new Set([
  "tudo", "bem", "bom", "boa", "tarde", "noite", "dia", "como", "vai", "está", "esta",
  "olá", "ola", "oi", "opa", "obrigado", "obrigada", "certo", "claro", "então", "entao",
  "para", "pra", "por", "que", "qual", "quem", "onde", "quando", "sim", "não", "nao",
  "consultora", "consultor", "vendedora", "vendedor", "atendente",
]);

function stripUntrustedVocative(message: string, trustedFirstName: string | null): string {
  if (!message) return message;
  // Remove "Olá NOME," / "Oi NOME!" se NOME não for o confiável E parecer realmente um nome próprio.
  const re = /^(ol[aá]|oi|opa|bom dia|boa tarde|boa noite)[,!\s]+([A-ZÀ-Ý][a-zà-ÿ]{1,20})([,!.\s])/i;
  const m = message.match(re);
  if (m) {
    const used = m[2];
    // Não remover se for palavra de gramática (Tudo, Bem, Como, etc.)
    if (NON_NAME_WORDS.has(used.toLowerCase())) return message;
    if (!trustedFirstName || used.toLowerCase() !== trustedFirstName.toLowerCase()) {
      return message.replace(re, "$1$3");
    }
  }
  return message;
}

function stripRepeatedGreeting(message: string, hasPriorOutbound: boolean): string {
  if (!message || !hasPriorOutbound) return message;
  // Após a primeira mensagem, remover saudações redundantes no início.
  return message
    .replace(/^\s*(ol[aá]|oi|opa|bom dia|boa tarde|boa noite)[,!.\s]+/i, "")
    .replace(/^\s*(tudo bem\??|tudo bom\??|como vai\??)[,!.\s]+/i, "")
    .trim();
}

function stripDuplicateOpener(message: string, lastAssistantMsg: string | null): string {
  if (!message || !lastAssistantMsg) return message;
  // Se as duas começam com a mesma palavra de abertura comum, remove a abertura.
  const openerRe = /^\s*(entendo|compreendo|perfeito|ótimo|otimo|claro|certo|legal|beleza|faz sentido|saquei|justo)[,!.\s]+/i;
  const a = message.match(openerRe);
  const b = lastAssistantMsg.match(openerRe);
  if (a && b && a[1].toLowerCase() === b[1].toLowerCase()) {
    return message.replace(openerRe, "").trim();
  }
  return message;
}

function sanitizeHumanMessage(
  message: string,
  phase: string,
  userInput: string,
  trustedFirstName: string | null,
  hasPriorOutbound: boolean = false,
  lastAssistantMsg: string | null = null,
): string {
  let out = (message || "").trim();
  if (!out) {
    if (phase === "abertura") return "Olá! Tudo bem? Qual a média da sua conta de luz?";
    if (phase === "descoberta") return "Quanto vem em média a sua conta de luz?";
    if (phase === "pitch") return "Posso te mostrar exatamente quanto você economizaria?";
    if (phase === "objecao") return "Faz sentido. O que especificamente está pesando na decisão?";
    return "Vamos seguir com seu cadastro. Me confirma se podemos avançar?";
  }
  out = stripEmojis(out);
  out = stripUntrustedVocative(out, trustedFirstName);
  out = stripRepeatedGreeting(out, hasPriorOutbound);
  out = stripDuplicateOpener(out, lastAssistantMsg);
  // Remove gírias infantis residuais
  out = out
    .replace(/\b(oii+e?|oiee+|oie)\b/gi, "Olá")
    .replace(/\bvc\b/gi, "você")
    .replace(/\bblz\b/gi, "tudo bem")
    .replace(/\brapidinho\b/gi, "rapidamente")
    .replace(/\b(rs+|kk+|haha+|hehe+)\b/gi, "")
    .replace(/\b(amor|fofo|fofa|querido|querida|lindo|linda)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Capitaliza primeira letra se ficou minúscula após cortes
  if (out && /^[a-zà-ÿ]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  // Comprimento máximo
  if (out.length > 400) out = out.slice(0, 397) + "...";
  return out;
}

async function loadContext(supabase: any, customerId: string) {
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, consultant_id, name, name_source, phone_whatsapp, distribuidora, address_city, address_state, address_street, electricity_bill_value, electricity_bill_photo_url, ocr_done, bill_requested_at, numero_instalacao, pain_point, sales_phase, qualification_score, lead_source, customer_referred_by_name",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) return null;

  const { data: history } = await supabase
    .from("conversations")
    .select("message_direction, message_text, message_type, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(60);

  const { data: agentCfg } = await supabase
    .from("ai_agent_config")
    .select("persona_name, tone, system_prompt")
    .or(`consultant_id.eq.${customer.consultant_id},consultant_id.is.null`)
    .order("consultant_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return {
    customer,
    history: (history || []).reverse(),
    persona: agentCfg?.persona_name || "Camila",
    tone: agentCfg?.tone || "humano, breve, cordial",
    customPrompt: agentCfg?.system_prompt || "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const body = await req.json();
    const { customer_id, user_input, mode = "reply" } = body;
    if (!customer_id || (!user_input && mode !== "rescue")) {
      return new Response(JSON.stringify({ error: "customer_id and user_input required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const ctx = await loadContext(supabase, customer_id);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "customer not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { customer, history, persona, tone, customPrompt } = ctx;
    const phase = customer.sales_phase || "abertura";

    // Profile inference for media filtering
    const bill = Number(customer.electricity_bill_value || 0);
    const profileTags: string[] = ["any", "todos"];
    if (bill > 500) profileTags.push("conta_alta");
    else if (bill >= 200) profileTags.push("conta_media");
    else if (bill > 0) profileTags.push("conta_baixa");

    // Cadence: last 4 outbound entries — count consecutive media to enforce anti-spam
    const lastOut = history.filter((h: any) => h.message_direction !== "inbound").slice(-4);
    const recentMediaCount = lastOut.filter((h: any) =>
      ["audio", "video", "image"].includes((h.message_type || "").toLowerCase()),
    ).length;
    const lastInbound = history.filter((h: any) => h.message_direction === "inbound").slice(-1)[0];
    const lastInboundKind = (lastInbound?.message_type || "text").toLowerCase();

    // Load candidate media for this phase + profile (consultant own + public)
    const { data: candidates } = await supabase
      .from("ai_media_library")
      .select("id, kind, label, url, step_tags, intent_tags, priority, duration_sec")
      .eq("active", true)
      .or(`consultant_id.eq.${customer.consultant_id},is_public.eq.true`)
      .overlaps("step_tags", [phase, "any"])
      .order("priority", { ascending: false })
      .limit(15);

    const eligibleMedia = (candidates || []).filter((m: any) => {
      const intents = m.intent_tags || [];
      if (!intents.length) return true;
      return intents.some((t: string) => profileTags.includes(t));
    });

    // Conta só conta como "recebida" se OCR concluído E nome veio de fonte confiável.
    // Sem isso, o LLM ficava preso confirmando dados de um lead anterior reaproveitado.
    const nameSourceTrusted = ["ocr", "self_introduced", "manual"].includes(
      String(customer.name_source || ""),
    );
    const billAlreadyReceivedEarly =
      !!customer.electricity_bill_photo_url && !!customer.ocr_done && nameSourceTrusted;

    // Cooldown de mídia: pega últimas 5 mídias enviadas para esse lead e marca como "já enviadas".
    const { data: recentMediaSent } = await supabase
      .from("ai_decisions")
      .select("media_sent_id")
      .eq("customer_id", customer_id)
      .not("media_sent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    const sentMediaIds = new Set((recentMediaSent || []).map((r: any) => r.media_sent_id));
    const freshMedia = eligibleMedia.filter((m: any) => !sentMediaIds.has(m.id));

    const mediaListLine = billAlreadyReceivedEarly
      ? `\n[MÍDIAS DISPONÍVEIS]\nNENHUMA — a conta já foi recebida. Confirme os dados em send_text e em seguida use request_handoff. PROIBIDO send_media nesta etapa.`
      : freshMedia.length
      ? `\n[MÍDIAS DISPONÍVEIS para fase ${phase}]\n` +
        freshMedia
          .map(
            (m: any, i: number) =>
              `${i + 1}. id=${m.id} | ${m.kind} | "${m.label}"${m.duration_sec ? ` (${m.duration_sec}s)` : ""}`,
          )
          .join("\n") +
        `\nUse send_media APENAS com um desses media_id. ${
          sentMediaIds.size
            ? `(${sentMediaIds.size} mídia(s) já enviada(s) recentemente foram ocultadas — NÃO repita.)`
            : ""
        }`
      : `\n[MÍDIAS DISPONÍVEIS]\nNenhuma nova para esta fase (todas já enviadas). Use send_text.`;

    const cadenceLine =
      `\n[CADÊNCIA]\n` +
      `- Mídias enviadas nas últimas 4 respostas: ${recentMediaCount}\n` +
      `- Última msg do lead foi do tipo: ${lastInboundKind}\n` +
      (recentMediaCount >= 1
        ? `- ⚠️ NÃO envie mídia agora — a última resposta JÁ foi mídia. Use send_text.\n`
        : ``) +
      (lastInboundKind === "audio"
        ? `- Lead mandou áudio: prefira responder com áudio também (espelho).\n`
        : ``) +
      (lastInbound && (lastInbound.message_text || "").length < 20
        ? `- Lead foi breve: responda breve também.\n`
        : ``);

    const billNum = Number(customer.electricity_bill_value || 0);
    const billCalcLine = billNum > 0
      ? `\n[CÁLCULO PRONTO PRA USAR NO PITCH]\nConta R$ ${billNum.toFixed(0)} → economia ~R$ ${(billNum * 0.12).toFixed(0)}/mês → R$ ${(billNum * 0.12 * 12).toFixed(0)}/ano.\n`
      : "";

    // Nome só é confiável se a fonte for OCR ou auto-apresentação ("meu nome é X").
    // Nunca usar pushName/JID/herdado de import.
    const isTrustworthyName = (raw?: string | null): boolean => {
      if (!raw) return false;
      const n = raw.trim();
      if (n.length < 2 || n.length > 30) return false;
      if (/\d/.test(n)) return false;
      if (/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(n)) return false;
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(n)) return false;
      const blacklist = /\b(iphone|galaxy|xiaomi|motorola|samsung|cliente|suporte|atendimento|whatsapp|user|test|teste|admin|null|undefined|desconhecido|none|n\/a)\b/i;
      if (blacklist.test(n)) return false;
      return true;
    };
    const trustedSources = new Set(["ocr", "self_introduced", "manual"]);
    const nameSourceOk = trustedSources.has(String(customer.name_source || ""));
    const firstName = (nameSourceOk && isTrustworthyName(customer.name))
      ? (customer.name as string).trim().split(/\s+/)[0]
      : null;

    // Conta só conta como "recebida" para fim de bloqueio se OCR + nome confiável.
    const billAlreadyReceived = billAlreadyReceivedEarly;
    const ocrDone = !!customer.ocr_done;
    const billRequestedRecently = customer.bill_requested_at
      && (Date.now() - new Date(customer.bill_requested_at).getTime()) < 60 * 60 * 1000;

    const billStatusBlock = billAlreadyReceived
      ? `\n[CONTA JÁ RECEBIDA E ANALISADA]\n` +
        `- Foto/PDF da conta: já está no sistema (NÃO PEÇA DE NOVO).\n` +
        `- OCR processado: ${ocrDone ? "sim" : "em andamento"}\n` +
        `- Titular OCR: ${customer.name || "?"}\n` +
        `- Distribuidora OCR: ${customer.distribuidora || "?"}\n` +
        `- Instalação: ${customer.numero_instalacao || "?"}\n` +
        `- Valor: ${billNum > 0 ? `R$ ${billNum}` : "?"}\n` +
        `Use estes dados para confirmar com o cliente e seguir para o cadastro.\n`
      : (billRequestedRecently
          ? `\n[CONTA JÁ FOI SOLICITADA HÁ POUCOS MINUTOS — não repita o pedido, apenas reforce gentilmente]\n`
          : "");

    // Construir [JÁ SABEMOS] / [FALTA DESCOBRIR] dinamicamente — evita repergunta
    const known: string[] = [];
    const missing: string[] = [];
    if (firstName) known.push(`Nome: ${firstName}`);
    if (customer.distribuidora) known.push(`Distribuidora: ${customer.distribuidora}`);
    else missing.push("distribuidora");
    if (billNum > 0) known.push(`Valor da conta: R$ ${billNum}`);
    else missing.push("valor médio da conta");
    if (customer.address_city) known.push(`Cidade: ${customer.address_city}/${customer.address_state || ""}`.trim());
    if (customer.pain_point) known.push(`Dor: ${customer.pain_point}`);
    else if (billNum > 0 && customer.distribuidora) missing.push("dor/motivo principal (opcional)");

    const knownBlock = known.length
      ? `\n[JÁ SABEMOS — NÃO pergunte de novo, USE livremente]\n- ${known.join("\n- ")}\n`
      : "";
    const missingBlock = (missing.length && !billAlreadyReceived)
      ? `\n[FALTA DESCOBRIR — pergunte UM por vez nesta ordem]\n- ${missing.join("\n- ")}\n`
      : (!billAlreadyReceived ? `\n[FALTA DESCOBRIR]\n- Nada essencial. Pode partir para o pitch ou pedir a foto da conta.\n` : "");

    const contextLine =
      `[Contexto do lead]\n` +
      (firstName
        ? ``
        : `Nome: DESCONHECIDO — NÃO chame por nome. Use saudação neutra. Se a conversa avançar sem nome, considere ask_for_name (mas NÃO se a foto da conta já foi pedida/recebida).\n`) +
      `Score atual: ${customer.qualification_score ?? 0}/100\n` +
      `Fase atual: ${phase}\n` +
      `Origem: ${customer.lead_source?.utm_source || "organico"}\n` +
      (customer.customer_referred_by_name
        ? `Indicado por: ${customer.customer_referred_by_name}\n`
        : "") +
      knownBlock +
      missingBlock +
      billStatusBlock +
      billCalcLine +
      mediaListLine +
      cadenceLine;

    // Few-shot só rola em fases que valem a pena (objeção/fechamento) — economiza 2 queries por chamada
    const shouldLoadFewshot = phase === "objecao" || phase === "fechamento";
    let fewShotLine = "";
    let negShotLine = "";
    if (shouldLoadFewshot) {
      const { data: positive } = await supabase
        .from("ai_decisions")
        .select("user_input, ai_output, tool_called")
        .eq("consultant_id", customer.consultant_id)
        .contains("feedback", { rating: "up" })
        .order("created_at", { ascending: false })
        .limit(5);
      fewShotLine = (positive || []).length
        ? `\n[EXEMPLOS APROVADOS PELO CONSULTOR]\n` +
          (positive || [])
            .map((p: any) => `Lead: "${(p.user_input || "").slice(0, 80)}" → ${p.tool_called}: "${(p.ai_output?.message || p.ai_output?.caption || "").slice(0, 80)}"`)
            .join("\n")
        : "";
      const { data: negative } = await supabase
        .from("ai_decisions")
        .select("user_input, ai_output, tool_called")
        .eq("consultant_id", customer.consultant_id)
        .contains("feedback", { rating: "down" })
        .order("created_at", { ascending: false })
        .limit(3);
      negShotLine = (negative || []).length
        ? `\n[NÃO FAZER ASSIM — exemplos reprovados pelo consultor]\n` +
          (negative || [])
            .map((p: any) => `Lead: "${(p.user_input || "").slice(0, 80)}" → ${p.tool_called}: "${(p.ai_output?.message || p.ai_output?.caption || "").slice(0, 80)}"`)
            .join("\n")
        : "";
    }

    // ---- Construir contents no formato Gemini ----
    const sys = systemPrompt(persona, tone, customPrompt) + fewShotLine + negShotLine + "\n\n" + contextLine;

    const contents: any[] = history.map((m: any) => ({
      role: m.message_direction === "inbound" ? "user" : "model",
      parts: [{ text: m.message_text || "(sem texto)" }],
    }));
    // Garante que começa em 'user' (Gemini exige)
    while (contents.length && contents[0].role !== "user") contents.shift();

    // Closer só dispara se temos OCR + nome confiável; senão cai no fluxo reply normal
    const closerReady = mode === "closer" && nameSourceTrusted && ocrDone;
    const effectiveMode = (mode === "closer" && !closerReady) ? "reply" : mode;

    if (effectiveMode === "rescue") {
      contents.push({
        role: "user",
        parts: [{ text: "[SISTEMA] Lead silenciou. Gere mensagem de resgate breve, sem cobrar, com gancho diferente do que já foi enviado." }],
      });
    } else if (effectiveMode === "closer") {
      contents.push({
        role: "user",
        parts: [{ text: `[SISTEMA] Conta recebida e OCR ok. Use IMEDIATAMENTE confirm_and_handoff confirmando ${customer.name || "titular"} / ${customer.distribuidora || "?"} / R$ ${billNum.toFixed(0)}.` }],
      });
    } else {
      contents.push({ role: "user", parts: [{ text: user_input }] });
    }
    if (!contents.length) contents.push({ role: "user", parts: [{ text: user_input || "Olá" }] });

    // Converte tools OpenAI -> Gemini functionDeclarations
    const geminiTools: GeminiTool[] = [{
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];

    // Decide qual modelo usar — Pro só quando vale a latência extra
    const score = Number(customer.qualification_score ?? 0);
    const useProModel =
      effectiveMode === "closer" ||
      phase === "fechamento" ||
      score >= 70 ||
      billAlreadyReceivedEarly;
    const modelToUse = effectiveMode === "rescue"
      ? MODEL_RESCUE
      : (useProModel ? MODEL_DECISION : MODEL_DEFAULT);

    let aiResult;
    try {
      aiResult = await geminiGenerate({
        model: modelToUse,
        system: sys,
        contents,
        tools: geminiTools,
        toolChoice: { mode: "ANY" },
        temperature: 0.5,
        thinkingBudget: modelToUse === MODEL_DECISION ? 512 : 0,
        maxOutputTokens: 1200,
        fallbackModel: MODEL_FALLBACK,
        functionName: "ai-sales-agent",
        consultantId: customer.consultant_id,
        customerId: customer_id,
      });
    } catch (e) {
      console.error("[ai-sales-agent] gemini error:", e);
      return new Response(JSON.stringify({ error: String((e as Error).message) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toolCallG = aiResult.toolCall;
    if (!toolCallG) {
      return new Response(
        JSON.stringify({
          decision: { tool: "send_text", args: { message: sanitizeHumanMessage(aiResult.text || "", phase, "", firstName), next_phase: phase, reasoning: "fallback_no_toolcall" } },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let tool = toolCallG.name;
    let args: any = toolCallG.args || {};

    // ---- OVERRIDE 1: dúvida/objeção → forçar vídeo de 1min se ainda não foi enviado ----
    const uiLow = (user_input || "").toLowerCase();
    const isDoubtIntent = !billAlreadyReceivedEarly && (
      /\b(como funciona|me explica|n[aã]o entendi|o que [eé]|funciona como|explica|explicar)\b/i.test(uiLow) ||
      /\b(golpe|fraude|seguro|confi[aá]vel|enganaç[aã]o|verdade|mesmo|s[eé]rio)\b/i.test(uiLow) ||
      /\b(custo|caro|gratuito|de gra[çc]a|paga|pagar|mensalidade|taxa|tem que pagar)\b/i.test(uiLow)
    );
    const introVideo = freshMedia.find((m: any) =>
      /conex[aã]o green.*apresenta/i.test(String(m.label || "")) && m.kind === "video"
    );
    if (isDoubtIntent && introVideo && tool !== "send_media" && tool !== "request_handoff" && recentMediaCount < 1) {
      tool = "send_media";
      args = {
        media_id: introVideo.id,
        caption: "Vou te mandar um vídeo curto de 1 minuto que explica direitinho — depois te respondo qualquer dúvida.",
        next_phase: phase === "abertura" ? "descoberta" : phase,
        reasoning: "auto_intro_video: dúvida/objeção detectada e vídeo de 1min ainda não enviado",
      };
    }

    // ---- OVERRIDE 2: bloqueia ask_for_name se foto da conta foi pedida/recebida ----
    if (tool === "ask_for_name" && (customer.electricity_bill_photo_url || billRequestedRecently)) {
      tool = "send_text";
      args = {
        message: "Pode me mandar a foto da conta de luz quando puder? Por ela eu já confirmo todos os dados.",
        next_phase: phase,
        reasoning: "ask_for_name bloqueado: foto da conta já solicitada/recebida — nome virá pelo OCR",
      };
    }

    const priorOutbound = history.filter((h: any) => h.message_direction !== "inbound");
    const hasPriorOutbound = priorOutbound.length > 0;
    const lastAssistantMsg = priorOutbound.slice(-1)[0]?.message_text || null;

    if (tool === "send_text" || tool === "advance_to_closing" || tool === "ask_for_name" || tool === "confirm_and_handoff") {
      args.message = sanitizeHumanMessage(args.message || "", phase, mode === "rescue" ? "" : user_input, firstName, hasPriorOutbound, lastAssistantMsg);
    }
    if (tool === "update_lead_field") {
      args.followup_message = sanitizeHumanMessage(args.followup_message || "", phase, mode === "rescue" ? "" : user_input, firstName, hasPriorOutbound, lastAssistantMsg);
    }
    if (tool === "send_media" && args.caption) {
      args.caption = sanitizeHumanMessage(args.caption, phase, mode === "rescue" ? "" : user_input, firstName, hasPriorOutbound, lastAssistantMsg);
    }

    const latencyMs = Date.now() - t0;

    // Validate media_id and resolve URL/kind for downstream sender
    let resolvedMedia: { id: string; url: string; kind: string; label: string } | null = null;
    if (tool === "send_media" && billAlreadyReceivedEarly) {
      // Hard guard: nunca enviar mídia depois da conta — sempre handoff.
      return new Response(
        JSON.stringify({
          decision: {
            tool: "request_handoff",
            args: {
              reason: "lead_pronto_cadastro: conta recebida; operador deve usar botões Cadastrar/OTP/Facial.",
              urgency: "alta",
            },
          },
          phase,
          latency_ms: latencyMs,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (tool === "send_media") {
      // Server-side anti-spam: se a última saída já foi mídia OU se essa media_id já foi
      // enviada nas últimas 5 vezes, degrada para send_text (caption como mensagem).
      const justSentMedia = recentMediaCount >= 1;
      const alreadySentSameId = sentMediaIds.has(args.media_id);
      const picked = eligibleMedia.find((m: any) => m.id === args.media_id);
      const invalidId = !picked || !picked.url;

      if (invalidId || justSentMedia || alreadySentSameId) {
        const tag = invalidId
          ? "[media_id inválido]"
          : alreadySentSameId
          ? "[mídia repetida — bloqueada]"
          : "[mídia consecutiva — bloqueada]";
        args.reasoning = (args.reasoning || "") + ` ${tag} fallback texto`;
        const fallbackMsg =
          args.caption && args.caption.trim().length > 0
            ? args.caption
            : (picked?.label
              ? `Sobre ${picked.label.toLowerCase()}: posso te explicar em poucas linhas se preferir.`
              : "Posso te explicar em poucas linhas se preferir.");
        return new Response(
          JSON.stringify({
            decision: {
              tool: "send_text",
              args: {
                message: sanitizeHumanMessage(fallbackMsg, phase, mode === "rescue" ? "" : user_input, firstName),
                next_phase: args.next_phase || phase,
                reasoning: args.reasoning,
              },
            },
            phase,
            latency_ms: latencyMs,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      resolvedMedia = { id: picked.id, url: picked.url, kind: picked.kind, label: picked.label };
    }

    // ---- Self-check barato (flash-lite) — bloqueia tools absurdas ----
    let selfCheckRisk: string | null = null;
    try {
      const lastIn = mode === "rescue" ? "[rescue]" : (user_input || "").slice(0, 200);
      const checkPrompt = `Lead disse: "${lastIn}"\nIA escolheu: ${tool} ${JSON.stringify(args).slice(0, 250)}\nFase: ${phase}. Conta_recebida: ${billAlreadyReceivedEarly}.\nResponda apenas: OK ou RISCO_<motivo curto>.`;
      const sc = await geminiGenerate({
        model: MODEL_SELFCHECK,
        contents: [{ role: "user", parts: [{ text: checkPrompt }] }],
        temperature: 0,
        maxOutputTokens: 30,
        functionName: "ai-sales-agent-selfcheck",
        consultantId: customer.consultant_id,
        customerId: customer_id,
      });
      const verdict = (sc.text || "").trim().toUpperCase();
      if (verdict.startsWith("RISCO")) selfCheckRisk = verdict.slice(0, 80);
    } catch (_) { /* self-check é best-effort */ }

    // Detecção de intenção determinística (para auditoria)
    const ui = (user_input || "").toLowerCase();
    const intentDetected =
      /\b(cadastr|quero (entrar|participar|aderir|economizar|fazer)|fazer (adesao|adesão|cadastro)|me cadastra|vamos l[aá]|bora|bora la|aceito|topo|fechado|pode (cadastrar|prosseguir|seguir)|j[aá] quero)\b/i.test(ui) ? "cadastrar" :
      /\b(humano|atendente|pessoa|operador|consultor real|fala com (algu[eé]m|gente|pessoa)|chama (o|a) (consultor|atendente))\b/i.test(ui) ? "humano" :
      /\b(parar|cancelar|n[aã]o quero|sem interesse|desisto|me deixa|para de|tira meu|nao tenho interesse|n[aã]o me|n[aã]o gostei)\b/i.test(ui) ? "desistir" :
      /\b(golpe|fraude|seguro\?|confi[aá]vel|enganaç[aã]o|verdade)\b/i.test(ui) ? "objecao_confianca" :
      /\b(fidelidade|multa|trocar|mudar de empresa|distribuidora vai)\b/i.test(ui) ? "objecao_contrato" :
      /\b(custo|caro|gratuito|de gra[çc]a|paga|mensalidade|taxa)\b/i.test(ui) ? "objecao_custo" :
      /\b(quanto|valor|economia|pre[çc]o|desconto|porcentagem)\b/i.test(ui) ? "interesse_valor" :
      /\b(como funciona|me explica|n[aã]o entendi|o que [eé]|quem [eé])\b/i.test(ui) ? "informacao" :
      null;

    // Audit (best-effort)
    await supabase.from("ai_decisions").insert({
      customer_id,
      consultant_id: customer.consultant_id,
      phase,
      tool_called: tool,
      reasoning: (args.reasoning || args.reason || "") + (selfCheckRisk ? ` | ${selfCheckRisk}` : ""),
      user_input: mode === "rescue" ? "[rescue]" : user_input,
      ai_output: args,
      latency_ms: latencyMs,
      model: aiResult.modelUsed,
      media_sent_id: resolvedMedia?.id || null,
      intent_detected: intentDetected,
    });

    // Se self-check sinalizou RISCO em tool sensível, força fallback texto neutro
    if (selfCheckRisk && (tool === "send_media" || tool === "advance_to_closing")) {
      const safeMsg = "Para eu te dar o número certo: qual a média da sua conta de luz?";
      return new Response(JSON.stringify({
        decision: { tool: "send_text", args: { message: safeMsg, next_phase: phase, reasoning: `selfcheck_blocked:${selfCheckRisk}` } },
        phase,
        latency_ms: Date.now() - t0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Apply side-effects (DB updates only — sending message stays in webhook)
    const updates: Record<string, any> = {};
    if (tool === "send_text" && args.next_phase) updates.sales_phase = args.next_phase;
    if (tool === "send_media" && args.next_phase) updates.sales_phase = args.next_phase;
    if (tool === "advance_to_closing") updates.sales_phase = "fechamento";
    if (tool === "confirm_and_handoff") {
      updates.sales_phase = "fechamento";
      updates.bot_paused = true;
      updates.bot_paused_reason = "confirm_and_handoff: lead pronto para cadastro";
      updates.bot_paused_at = new Date().toISOString();
      updates.qualification_score = 100;
    }
    if (tool === "update_lead_field") {
      const f = String(args.field || "");
      const v = args.value;
      if (["name", "distribuidora", "pain_point"].includes(f) && typeof v === "string" && v.length > 1) {
        updates[f] = v.trim();
        if (f === "name") updates.name_source = "self_introduced";
      }
      if (f === "electricity_bill_value") {
        const n = Number(String(v).replace(/[^\d.,]/g, "").replace(",", "."));
        if (Number.isFinite(n) && n > 0) updates.electricity_bill_value = n;
      }
      if (args.next_phase) updates.sales_phase = args.next_phase;
    }
    if (tool === "request_handoff") {
      updates.bot_paused = true;
      updates.bot_paused_reason = args.reason;
      updates.bot_paused_at = new Date().toISOString();
    }
    if (tool === "schedule_followup") {
      updates.next_followup_at = new Date(Date.now() + (args.hours || 24) * 3600 * 1000).toISOString();
    }
    if (tool === "mark_lost") {
      updates.sales_phase = "perdido";
      updates.bot_paused = true;
      updates.bot_paused_reason = `mark_lost: ${args.reason}`;
    }
    // Apply qualification score delta
    if ((tool === "send_text" || tool === "send_media") && typeof args.score_delta === "number") {
      const current = Number(customer.qualification_score ?? 0);
      const next = Math.max(0, Math.min(100, current + args.score_delta));
      updates.qualification_score = next;
    }
    if (tool === "advance_to_closing") {
      updates.qualification_score = Math.max(Number(customer.qualification_score ?? 0), 90);
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("customers").update(updates).eq("id", customer_id);
    }

    return new Response(
      JSON.stringify({
        decision: { tool, args },
        media: resolvedMedia,
        phase,
        latency_ms: latencyMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-sales-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
