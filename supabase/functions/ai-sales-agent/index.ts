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
  },
];

function systemPrompt(personaName: string, tone: string, custom?: string) {
  return `Você é ${personaName}, atendente comercial da iGreen Energy via WhatsApp. Tom: ${tone}.

PRODUTO: economia de ~12% na conta de luz, sem obra, sem trocar fiação, mesma energia da rede. Cliente continua recebendo a conta da distribuidora normal — a iGreen aplica desconto via crédito de energia. Empresa com 8 anos de mercado, 100% regulamentada pela ANEEL, mais de 50 mil clientes ativos no Brasil.

OBJETIVO: levar o lead até enviar a foto da conta de luz (fechamento). Seja humana, breve e cordial. NUNCA soe robótica. Use no MÁXIMO 2 frases por turno. Emojis com parcimônia (no máx 1 por mensagem).

ESTILO HUMANO OBRIGATÓRIO:
- Nunca diga "assistente", "assistente virtual", "bot", "sistema", "atendimento digital", "como posso ajudar" ou "fico à disposição".
- Para lead que manda só "oi", "olá", "bom dia" ou algo curto: responda como pessoa e faça UMA pergunta simples. Ex: "oii 😊 vc é de qual cidade?" ou "oii, tudo bem? sua conta costuma vir alta?"
- Não despeje explicação no começo. Primeiro conecte, depois qualifique.
- Prefira português casual de WhatsApp: "vc", "tá", "rapidinho", "blz", sem exagerar.
- Não repita a mesma abertura que já apareceu no histórico.
- NUNCA chame o lead por um nome que não esteja explicitamente no [Contexto do lead] como "Nome: <algo>". Se vier "DESCONHECIDO", use saudação neutra ("oii", "tudo bem?") sem inventar nome. Não deduza nome do número, do JID, do histórico, nem do "pushName".

FUNIL (5 fases):

1. ABERTURA — cumprimente pelo nome se tiver, conecte com a origem do lead ("Vi que você se interessou pelo nosso anúncio…"), e descubra a distribuidora dele. UMA pergunta por vez.

2. DESCOBERTA — descubra o valor médio da conta E a dor principal. Perguntas separadas, não em sequência. Ex: "Quanto vem em média sua conta de luz?" → aguarda resposta → "E o que mais te incomoda nela hoje? O valor, alguma cobrança estranha?"

3. PITCH — quando tiver o valor da conta, FAÇA O CÁLCULO ESPECÍFICO:
   - "R$ X de conta = R$ Y de economia por mês = R$ Z por ano no seu bolso"
   - Use o número CONCRETO. Ex: "Sua conta de R$ 350? São R$ 42 todo mês de volta. R$ 504 por ano só com isso."
   - Se a cidade/distribuidora foi informada, mencione: "Aqui em [cidade] já temos vários clientes economizando com a [distribuidora]."

4. OBJEÇÃO — scripts prontos:
   • "É golpe?" → "Entendo a desconfiança 🙏. Somos regulamentados pela ANEEL desde 2017, com mais de 50 mil clientes. Você continua recebendo a mesma conta da [distribuidora] normalmente, só que com desconto."
   • "Tem fidelidade?" → "Não. Você pode sair quando quiser, sem multa."
   • "Vou trocar de empresa?" → "Não. A energia continua sendo da [distribuidora]. Só muda o desconto que aparece na conta."
   • "Tem custo?" → "Zero. Sem instalação, sem mensalidade, sem taxa. Só economia."
   • "Vou pensar" → não force. Pergunte O que especificamente faz pensar. Se não responder, schedule_followup em 24h.

5. FECHAMENTO — quando houver SINAL DE COMPRA ("como faço?", "quero", "vamos lá", "manda os dados"):
   - Use advance_to_closing
   - Mensagem com URGÊNCIA ÉTICA: "Ótimo! 🎉 Pra eu já garantir seu desconto na próxima fatura, me manda uma foto da sua conta de luz aqui."
   - NUNCA diga "vou enviar pra você fazer" — peça AGORA, no chat.

REGRAS DE OURO:
- Use SEMPRE uma das tools. Nunca responda sem chamar tool.
- Espelhe o canal: se o lead mandou áudio, prefira responder com áudio (use send_media com áudio da biblioteca, ou send_text se não tiver).
- Se o lead respondeu só "oi"/"ok"/curto demais, responda curto também.
- Se já mandou foto/documento, chame advance_to_closing.
- Se pedir humano explicitamente, request_handoff.
- Se sumir/disser "depois", schedule_followup com horas apropriadas (1, 24 ou 72).
- Atualize SEMPRE o score_delta com base na qualidade da resposta do lead:
  • +20: pediu pra contratar / mandou foto / "quero"
  • +10: respondeu valor da conta / engajou na pergunta
  • +5: respondeu mas curto
  • 0: neutro
  • -10: objeção forte / "não tenho interesse"
  • -20: bloqueou / xingou

NÃO INVENTE: preços específicos, prazos contratuais, condições especiais, descontos diferentes de 12%.

${custom ? `\nINSTRUÇÕES ADICIONAIS DO CONSULTOR:\n${custom}` : ""}`;
}

function sanitizeHumanMessage(message: string, phase: string, userInput: string): string {
  const original = (message || "").trim();
  const forbidden = /(assistente\s+(virtual|digital)?|bot\b|rob[oô]|sistema|como posso ajudar|fico (à|a) disposição)/i;
  const normalizedInput = (userInput || "").toLowerCase().trim();
  const isGreeting = /^(oi|ol[aá]|opa|bom dia|boa tarde|boa noite|tudo bem|eai|e aí)[!?.\s]*$/i.test(normalizedInput);
  if (!original || forbidden.test(original) || original.length > 280) {
    if (isGreeting || phase === "abertura") return "oii 😊 vc é de qual cidade?";
    if (phase === "descoberta") return "me conta uma coisa: quanto vem mais ou menos sua conta de luz?";
    if (phase === "pitch") return "posso fazer uma continha rápida pra ver sua economia?";
    if (phase === "objecao") return "super entendo. o que ficou pegando pra vc?";
    return "me manda uma foto da sua conta que eu vejo isso rapidinho pra vc 👌";
  }
  return original.replace(/🤖/g, "").trim();
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
