// AI Sales Agent — decide a melhor ação na conversa de WhatsApp.
// Recebe contexto do lead + histórico + mídias disponíveis e usa Lovable AI
// Gateway com tool-calling para retornar UMA decisão (send_text, send_media,
// request_handoff, schedule_followup, advance_to_closing, mark_lost).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-3-flash-preview";

// ---------- Tools available to the LLM ----------
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
];

function systemPrompt(personaName: string, tone: string, custom?: string) {
  return `Você é ${personaName}, consultora comercial sênior da iGreen Energy. Atendimento via WhatsApp.

═══════════════════════════════════════════
IDENTIDADE E POSTURA
═══════════════════════════════════════════
Você é uma VENDEDORA CONSULTIVA profissional. Calorosa, respeitosa, segura. Jamais infantil, jamais "atendente de balcão". Atende adultos que pagam contas — fala como adulto.

PROIBIDO ABSOLUTAMENTE:
- Emojis. Nenhum. Nunca. (sem 😊 🙏 💚 ☀️ 🎉 👌 nada)
- "rs", "kkk", "haha", "blz", "obrigadinha", "amor", "fofo", "querido(a)", "lindo(a)", "vida"
- "oii", "oie", "oiee" (use "Olá")
- Diminutivos infantis: "rapidinho", "perguntinha", "continha", "fotinho"
- "vou fazer uma continha", "deixa comigo", "fica tranquilo"
- Frases de bot: "como posso ajudar?", "estou à disposição", "fico à disposição", "atendimento digital", "assistente virtual"

OBRIGATÓRIO:
- "você" (nunca "vc"). Português correto, casual mas adulto.
- 1 a 3 frases por mensagem, com CONTEÚDO de valor — nunca recheio.
- Saudação neutra quando NÃO houver nome confiável no contexto: "Olá! Tudo bem?"
- Vocativo SOMENTE se [Contexto do lead] trouxer "Nome confiável: X". Caso contrário, NUNCA use nome — nem inventado, nem deduzido do JID, do número, do pushName, do histórico.

═══════════════════════════════════════════
CONHECIMENTO IGREEN (use espontaneamente)
═══════════════════════════════════════════
• Empresa mineira de Uberlândia/MG, fundada em 2017, regulamentada pela ANEEL.
• 170 mil+ clientes ativos no Brasil. Selo RA1000 do Reclame Aqui.
• Desconto na conta de luz de até 20% (varia por estado/distribuidora).
• Como funciona: a conta da distribuidora (CPFL, Enel, Cemig, Equatorial, etc.) continua chegando NORMALMENTE no nome do cliente. A iGreen abate parte do consumo via crédito de energia solar de usinas próprias. O cliente recebe TAMBÉM uma fatura da iGreen DENTRO DO APLICATIVO iGreen Energy (Play Store / App Store) — é por lá que ele acompanha tudo.
• Sem obra, sem placa, sem trocar fiação, sem instalação, sem fidelidade, sem multa, sem mensalidade, sem taxa de adesão, sem custo nenhum. A energia continua da mesma distribuidora.
• BÔNUS GRATUITO — Conexão Club: todo cliente iGreen recebe acesso ao clube de benefícios com até 70% de desconto em farmácias (Droga Raia, Drogasil, Pacheco), descontos em consultas, exames, óticas, pet shop, lazer. Use isso como diferencial no fechamento.

═══════════════════════════════════════════
FUNIL DE VENDAS (5 fases)
═══════════════════════════════════════════
1. ABERTURA — Olá neutro + UMA pergunta de qualificação (cidade/distribuidora). Sem pitch ainda.
2. DESCOBERTA — Descubra distribuidora, valor médio da conta e dor. Uma pergunta por turno.
3. PITCH — Com o valor da conta em mãos, faça o cálculo CONCRETO:
   "Uma conta de R$ X representa em torno de R$ Y de economia por mês com a iGreen, R$ Z por ano. Tudo isso sem instalar nada e mantendo a mesma [distribuidora]."
   Mencione Conexão Club como bônus se o lead demonstrar interesse.
4. OBJEÇÃO — Respostas firmes e diretas:
   • "É golpe?" → "Entendo a cautela. A iGreen é regulamentada pela ANEEL desde 2017, com mais de 170 mil clientes ativos e selo RA1000 no Reclame Aqui. A conta da [distribuidora] continua chegando no seu nome normalmente."
   • "Tem fidelidade?" → "Não há. Você pode encerrar quando quiser, sem multa."
   • "Vou trocar de empresa?" → "Não. A energia continua sendo da [distribuidora]. A iGreen apenas abate parte do valor."
   • "Tem custo?" → "Nenhum. Sem instalação, sem taxa, sem mensalidade."
   • "Vou pensar" → não pressione; pergunte o que especificamente o faz hesitar.
5. FECHAMENTO — Sinal de compra ("quero", "como faço", "vamos lá") → use advance_to_closing pedindo a foto da conta de luz. Se a conta JÁ foi recebida (verifique [Contexto]), NÃO peça de novo — confirme os dados extraídos.

═══════════════════════════════════════════
REGRAS CRÍTICAS
═══════════════════════════════════════════
- Use SEMPRE uma das tools. Nunca responda fora de tool.
- Se [Contexto] indicar "CONTA JÁ RECEBIDA E ANALISADA": JAMAIS peça a foto da conta. Use os dados extraídos para confirmar com o cliente e siga para o cadastro.
- Se [Contexto] indicar "Bill_requested_at recente (<10 min)": NÃO repita o pedido — apenas reforce gentilmente que aguarda o envio.
- Se o lead pedir humano explicitamente, request_handoff.
- Se sumir/"depois eu vejo", schedule_followup (1h, 24h ou 72h conforme contexto).
- Se ainda não tem nome confiável e o lead já demonstrou interesse, use ask_for_name.
- score_delta: +20 sinal de compra/foto • +10 valor revelado • +5 engajamento curto • 0 neutro • -10 objeção forte • -20 desistência clara.

NÃO INVENTE preços, prazos contratuais, percentuais ou condições. Quando não souber, diga que vai verificar.

${custom ? `\n═══════════════════════════════════════════\nINSTRUÇÕES ADICIONAIS DO CONSULTOR\n═══════════════════════════════════════════\n${custom}` : ""}`;
}

function stripEmojis(s: string): string {
  return (s || "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripUntrustedVocative(message: string, trustedFirstName: string | null): string {
  if (!message) return message;
  // Remove "Olá NOME," / "Oi NOME!" / "NOME, ..." se NOME não for o confiável.
  const re = /^(ol[aá]|oi|opa|bom dia|boa tarde|boa noite)[,!\s]+([A-ZÀ-Ý][a-zà-ÿ]{1,20})([,!.\s])/i;
  const m = message.match(re);
  if (m) {
    const used = m[2];
    if (!trustedFirstName || used.toLowerCase() !== trustedFirstName.toLowerCase()) {
      return message.replace(re, "$1$3");
    }
  }
  return message;
}

function sanitizeHumanMessage(
  message: string,
  phase: string,
  userInput: string,
  trustedFirstName: string | null,
): string {
  let out = (message || "").trim();
  if (!out) {
    if (phase === "abertura") return "Olá! Tudo bem? Você é de qual cidade?";
    if (phase === "descoberta") return "Quanto vem em média a sua conta de luz?";
    if (phase === "pitch") return "Posso te mostrar exatamente quanto você economizaria?";
    if (phase === "objecao") return "Compreendo. O que especificamente está pesando na decisão?";
    return "Vamos seguir com seu cadastro. Me confirma se podemos avançar?";
  }
  out = stripEmojis(out);
  out = stripUntrustedVocative(out, trustedFirstName);
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
  // Comprimento máximo
  if (out.length > 400) out = out.slice(0, 397) + "...";
  return out;
}

async function loadContext(supabase: any, customerId: string) {
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, consultant_id, name, phone_whatsapp, distribuidora, address_city, address_state, electricity_bill_value, pain_point, sales_phase, qualification_score, lead_source, customer_referred_by_name",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) return null;

  const { data: history } = await supabase
    .from("conversations")
    .select("message_direction, message_text, message_type, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(20);

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

    const mediaListLine = eligibleMedia.length
      ? `\n[MÍDIAS DISPONÍVEIS para fase ${phase}]\n` +
        eligibleMedia
          .map(
            (m: any, i: number) =>
              `${i + 1}. id=${m.id} | ${m.kind} | "${m.label}"${m.duration_sec ? ` (${m.duration_sec}s)` : ""}`,
          )
          .join("\n") +
        `\nUse send_media APENAS com um desses media_id.`
      : `\n[MÍDIAS DISPONÍVEIS]\nNenhuma para esta fase. Use send_text.`;

    const cadenceLine =
      `\n[CADÊNCIA]\n` +
      `- Mídias enviadas nas últimas 4 respostas: ${recentMediaCount}\n` +
      `- Última msg do lead foi do tipo: ${lastInboundKind}\n` +
      (recentMediaCount >= 2
        ? `- ⚠️ NÃO envie mídia agora — use send_text para não soar spam.\n`
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

    // Sanitiza nome: só usa se parecer um primeiro nome real (letras, 2-20 chars).
    // Rejeita: vazio, números, "iPhone do João", "Galaxy", emojis, marcas de aparelho,
    // nomes de operadora ("Cliente", "Suporte"), palavras genéricas e tudo em CAPS curto.
    const isTrustworthyName = (raw?: string | null): boolean => {
      if (!raw) return false;
      const n = raw.trim();
      if (n.length < 2 || n.length > 30) return false;
      if (/\d/.test(n)) return false; // tem número
      if (/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(n)) return false;
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(n)) return false; // só letras/espaços/hífen
      const blacklist = /\b(iphone|galaxy|xiaomi|motorola|samsung|cliente|suporte|atendimento|whatsapp|user|test|teste|admin|null|undefined|desconhecido|none|n\/a)\b/i;
      if (blacklist.test(n)) return false;
      return true;
    };
    const firstName = isTrustworthyName(customer.name)
      ? (customer.name as string).trim().split(/\s+/)[0]
      : null;
    const contextLine =
      `[Contexto do lead]\n` +
      `Nome: ${firstName || "DESCONHECIDO — NÃO chame por nome, use saudação neutra (oii, tudo bem?)"}\n` +
      `Distribuidora: ${customer.distribuidora || "?"}\n` +
      `Cidade: ${customer.address_city || "?"}/${customer.address_state || "?"}\n` +
      `Valor da conta: ${billNum > 0 ? `R$ ${billNum}` : "?"}\n` +
      `Dor: ${customer.pain_point || "?"}\n` +
      `Score atual: ${customer.qualification_score ?? 0}/100\n` +
      `Fase atual: ${phase}\n` +
      `Origem: ${customer.lead_source?.utm_source || "organico"}\n` +
      (customer.customer_referred_by_name
        ? `Indicado por: ${customer.customer_referred_by_name}\n`
        : "") +
      billCalcLine +
      mediaListLine +
      cadenceLine;

    // Load best 👍 feedback as few-shot examples (last 5)
    const { data: positive } = await supabase
      .from("ai_decisions")
      .select("user_input, ai_output, tool_called")
      .eq("consultant_id", customer.consultant_id)
      .contains("feedback", { rating: "up" })
      .order("created_at", { ascending: false })
      .limit(5);

    const fewShotLine = (positive || []).length
      ? `\n[EXEMPLOS APROVADOS PELO CONSULTOR]\n` +
        (positive || [])
          .map(
            (p: any) =>
              `Lead: "${(p.user_input || "").slice(0, 80)}" → ${p.tool_called}: "${(p.ai_output?.message || p.ai_output?.caption || "").slice(0, 80)}"`,
          )
          .join("\n")
      : "";

    const messages: any[] = [
      { role: "system", content: systemPrompt(persona, tone, customPrompt) + fewShotLine },
      { role: "system", content: contextLine },
      ...history.map((m: any) => ({
        role: m.message_direction === "inbound" ? "user" : "assistant",
        content: m.message_text || "",
      })),
    ];

    if (mode === "rescue") {
      messages.push({
        role: "user",
        content:
          "[SISTEMA] Lead silenciou. Gere mensagem de resgate breve, sem cobrar, com gancho diferente do que já foi enviado.",
      });
    } else {
      messages.push({ role: "user", content: user_input });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools,
        tool_choice: "required",
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, txt);
      if (aiResp.status === 429 || aiResp.status === 402) {
        return new Response(JSON.stringify({ error: txt }), {
          status: aiResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "ai gateway failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const choice = aiJson.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({
          decision: { tool: "send_text", args: { message: choice?.message?.content || "Pode me contar um pouco mais?", next_phase: phase, reasoning: "fallback" } },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tool = toolCall.function.name;
    let args: any = {};
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch (_) {
      args = {};
    }

    if (tool === "send_text" || tool === "advance_to_closing") {
      args.message = sanitizeHumanMessage(args.message || "", phase, mode === "rescue" ? "" : user_input);
    }
    if (tool === "send_media" && args.caption) {
      args.caption = sanitizeHumanMessage(args.caption, phase, mode === "rescue" ? "" : user_input);
    }

    const latencyMs = Date.now() - t0;

    // Validate media_id and resolve URL/kind for downstream sender
    let resolvedMedia: { id: string; url: string; kind: string; label: string } | null = null;
    if (tool === "send_media") {
      const picked = eligibleMedia.find((m: any) => m.id === args.media_id);
      if (!picked || !picked.url) {
        // Hallucinated id — degrade to send_text with the caption
        args.reasoning = (args.reasoning || "") + " [media_id inválido — fallback texto]";
        return new Response(
          JSON.stringify({
            decision: {
              tool: "send_text",
              args: {
                message: sanitizeHumanMessage(args.caption || "", phase, mode === "rescue" ? "" : user_input),
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

    // Audit (best-effort)
    await supabase.from("ai_decisions").insert({
      customer_id,
      consultant_id: customer.consultant_id,
      phase,
      tool_called: tool,
      reasoning: args.reasoning || args.reason || null,
      user_input: mode === "rescue" ? "[rescue]" : user_input,
      ai_output: args,
      latency_ms: latencyMs,
      model: MODEL,
      media_sent_id: resolvedMedia?.id || null,
    });

    // Apply side-effects (DB updates only — sending message stays in webhook)
    const updates: Record<string, any> = {};
    if (tool === "send_text" && args.next_phase) updates.sales_phase = args.next_phase;
    if (tool === "send_media" && args.next_phase) updates.sales_phase = args.next_phase;
    if (tool === "advance_to_closing") updates.sales_phase = "fechamento";
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
