// Flow Templates — biblioteca de blocos padrão.
//
// Cada bloco é uma função que recebe um contexto (posição inicial,
// próximo step ID etc.) e retorna 1+ steps + a posição final usada.
//
// Convenção: o bloco RECEBE o ID do próximo step (ou null se for o último)
// e gera transições/fallbacks pra apontar pra ele. Isso garante que
// nenhum bloco fique órfão.

import type {
  FlowTemplateBlock,
  GeneratedStep,
  RenderStyle,
  StandardBlockId,
} from "./types.ts";

interface BlockContext {
  /** Posição do primeiro step deste bloco. */
  startPosition: number;
  /** ID do próximo step (após este bloco). null = último bloco. */
  nextStepId: string | null;
  /** ID do step de handoff humano (se existir no fluxo). */
  humanStepId: string | null;
  /** ID do step de IA de dúvidas (se existir). */
  duvidasStepId: string | null;
  /** Estilo de renderização escolhido. */
  renderStyle: RenderStyle;
  /** Sufixo único do step_key (gerado pelo caller). */
  uniqueSuffix: string;
}

interface BlockResult {
  steps: Array<Omit<GeneratedStep, "transitions"> & { transitions: any[] | null }>;
  endPosition: number;
  /** Slots que precisam de mídia carregada. */
  mediaSlots: Array<{ slot_key: string; description: string }>;
  /** Mapa de step_key gerados → para outros blocos referenciarem. */
  stepKeysGenerated: Record<string, string>;
}

const TXT_BUTTONS = (label: string, opts: Array<{ id: string; title: string }>): string => {
  const list = opts.map((o, i) => `*${i + 1}.* ${o.title}`).join("\n");
  return `${label}\n\n${list}`;
};

// ─── Bloco: pedir_conta_ocr ────────────────────────────────────────────
function blockPedirContaOcr(ctx: BlockContext, _block: FlowTemplateBlock): BlockResult {
  const stepKey = `pedir_conta_${ctx.uniqueSuffix}`;
  return {
    steps: [{
      step_key: stepKey,
      step_type: "capture_conta",
      position: ctx.startPosition,
      is_active: true,
      message_text:
        "Pra fazer sua simulação, me manda agora uma *foto da sua conta de luz*.\n\n" +
        "📸 Pode ser do mês atual ou anterior. Foto inteira, com boa iluminação.",
      slot_key: stepKey,
      wait_for: "none",
      text_delay_ms: 1500,
      captures: [{
        kind: "media",
        name: "imagem_conta",
        accepts: ["image", "document"],
        required: true,
        retry_text: "📷 Pode mandar a *foto da conta de luz*? Imagem ou PDF.",
      }],
      transitions: ctx.nextStepId
        ? [{ goto_step_id: ctx.nextStepId, trigger_intent: "default", trigger_phrases: [] }]
        : [],
      fallback: {
        mode: "retry",
        max_retries: 2,
        retry_text: "📷 Não recebi a foto. Pode reenviar a *conta de luz*?",
        on_fail: "humano",
      },
    }],
    endPosition: ctx.startPosition + 1,
    mediaSlots: [{ slot_key: stepKey, description: "Áudio/vídeo opcional para acompanhar pedido da conta" }],
    stepKeysGenerated: { pedir_conta: stepKey },
  };
}

// ─── Bloco: pedir_documento_ocr ────────────────────────────────────────
function blockPedirDocumentoOcr(ctx: BlockContext, _block: FlowTemplateBlock): BlockResult {
  const stepKey = `pedir_documento_${ctx.uniqueSuffix}`;
  return {
    steps: [{
      step_key: stepKey,
      step_type: "capture_documento",
      position: ctx.startPosition,
      is_active: true,
      message_text:
        "Show! Agora preciso de *um documento com foto*.\n\n" +
        "🪪 *RG* (frente e verso) ou *CNH* (frente).\n\n" +
        "Pode mandar como imagem que eu identifico aqui.",
      slot_key: stepKey,
      wait_for: "none",
      text_delay_ms: 1500,
      captures: [{
        kind: "media",
        name: "documento_cliente",
        accepts: ["image", "document"],
        required: true,
        auto_detect_doc_type: true,
        retry_text: "🪪 Pode reenviar a *foto do documento* (RG ou CNH)?",
      }],
      transitions: ctx.nextStepId
        ? [{ goto_step_id: ctx.nextStepId, trigger_intent: "default", trigger_phrases: [] }]
        : [],
      fallback: {
        mode: "retry",
        max_retries: 2,
        retry_text: "🪪 Não consegui ler o documento. Pode mandar uma foto mais nítida?",
        on_fail: "humano",
      },
    }],
    endPosition: ctx.startPosition + 1,
    mediaSlots: [],
    stepKeysGenerated: { pedir_documento: stepKey },
  };
}

// ─── Bloco: confirmar_email ────────────────────────────────────────────
function blockConfirmarEmail(ctx: BlockContext, _block: FlowTemplateBlock): BlockResult {
  const stepKey = `pedir_email_${ctx.uniqueSuffix}`;
  return {
    steps: [{
      step_key: stepKey,
      step_type: "ask_email",
      position: ctx.startPosition,
      is_active: true,
      message_text: "Pra finalizar, qual o seu *e-mail* principal? 📧\n\n(o portal envia o contrato pra esse e-mail)",
      slot_key: null,
      wait_for: "reply",
      text_delay_ms: 1500,
      captures: [{
        kind: "text",
        name: "email",
        validator: "email",
        required: true,
        retry_text: "📧 Hmm, esse e-mail parece inválido. Pode digitar de novo?",
      }],
      transitions: ctx.nextStepId
        ? [{ goto_step_id: ctx.nextStepId, trigger_intent: "default", trigger_phrases: [] }]
        : [],
      fallback: {
        mode: "retry",
        max_retries: 2,
        on_fail: "humano",
      },
    }],
    endPosition: ctx.startPosition + 1,
    mediaSlots: [],
    stepKeysGenerated: { pedir_email: stepKey },
  };
}

// ─── Bloco: confirmar_telefone ─────────────────────────────────────────
function blockConfirmarTelefone(ctx: BlockContext, _block: FlowTemplateBlock): BlockResult {
  const stepKey = `confirmar_telefone_${ctx.uniqueSuffix}`;
  const otherStepKey = `pedir_outro_telefone_${ctx.uniqueSuffix}`;

  // Se renderStyle é text-numbered, vira texto numerado dentro do message_text.
  const useButtons = ctx.renderStyle === "buttons" || ctx.renderStyle === "list-interactive";
  const buttonOptions = [
    { id: "sim_phone", title: "Sim, é esse" },
    { id: "outro_phone", title: "Quero usar outro" },
  ];

  const messageTextBase =
    "📱 Esse é o telefone que eu uso pra te chamar?\n\n*{{telefone}}*";

  return {
    steps: [
      {
        step_key: stepKey,
        step_type: "confirm_phone",
        position: ctx.startPosition,
        is_active: true,
        message_text: useButtons
          ? messageTextBase
          : TXT_BUTTONS(messageTextBase, buttonOptions),
        slot_key: null,
        wait_for: "reply",
        text_delay_ms: 1500,
        captures: useButtons
          ? [{ field: "_buttons", value: buttonOptions, enabled: true }]
          : [],
        transitions: [
          {
            goto_step_id: ctx.nextStepId,
            trigger_intent: "afirmacao",
            trigger_phrases: ["sim_phone", "Sim, é esse", "sim", "1", "esse mesmo"],
          },
          {
            goto_step_id: null, // será preenchido depois (otherStepKey)
            trigger_intent: "negacao",
            trigger_phrases: ["outro_phone", "Quero usar outro", "outro", "2"],
          },
        ],
        fallback: {
          mode: "goto",
          goto_step_id: ctx.nextStepId,
        },
      },
      {
        step_key: otherStepKey,
        step_type: "ask_phone",
        position: ctx.startPosition + 1,
        is_active: true,
        message_text: "Beleza, qual telefone *com DDD* você prefere usar? 📱",
        slot_key: null,
        wait_for: "reply",
        text_delay_ms: 1500,
        captures: [{
          kind: "text",
          name: "phone_landline",
          validator: "phone",
          required: true,
        }],
        transitions: ctx.nextStepId
          ? [{ goto_step_id: ctx.nextStepId, trigger_intent: "default", trigger_phrases: [] }]
          : [],
        fallback: { mode: "retry", max_retries: 2, on_fail: "humano" },
      },
    ],
    endPosition: ctx.startPosition + 2,
    mediaSlots: [],
    stepKeysGenerated: { confirmar_telefone: stepKey, pedir_outro_telefone: otherStepKey },
  };
}

// ─── Bloco: duvidas_ia ────────────────────────────────────────────────
function blockDuvidasIa(ctx: BlockContext, block: FlowTemplateBlock): BlockResult {
  const stepKey = `duvidas_${ctx.uniqueSuffix}`;
  const useButtons = ctx.renderStyle === "buttons" || ctx.renderStyle === "list-interactive";
  const opts = [
    { id: "voltei", title: "Já entendi, vamos lá" },
    { id: "outra", title: "Tenho outra dúvida" },
    { id: "humano", title: "Falar com humano" },
  ];
  const baseTxt =
    "Claro! 💬 Me conta sua dúvida que eu tento esclarecer rapidinho.\n\n" +
    "*Posso responder sobre:*\n" +
    "• Como funciona a economia\n" +
    "• Se tem fidelidade ou multa\n" +
    "• Por que a iGreen é confiável\n" +
    "• Quanto tempo demora pra ativar";

  return {
    steps: [{
      step_key: stepKey,
      step_type: "message",
      position: ctx.startPosition,
      is_active: true,
      message_text: useButtons ? baseTxt : TXT_BUTTONS(baseTxt, opts),
      slot_key: null,
      wait_for: "reply",
      text_delay_ms: 1000,
      // 🤖 Captura especial: handler vai redirecionar para IA
      captures: [
        ...(useButtons ? [{ field: "_buttons", value: opts, enabled: true }] : []),
        { kind: "text", name: "duvida_livre", enabled: true, ai_answer: true },
      ],
      transitions: [
        {
          goto_step_id: ctx.nextStepId,
          trigger_intent: "afirmacao",
          trigger_phrases: ["voltei", "Já entendi", "vamos", "1", "entendi"],
        },
        {
          goto_step_id: null, // self-loop (faz IA responder a mesma duvida)
          trigger_intent: "palavra_chave",
          trigger_phrases: ["outra", "Tenho outra", "2"],
        },
        {
          goto_special: "humano",
          trigger_intent: "palavra_chave",
          trigger_phrases: ["humano", "Falar com humano", "3", "atendente"],
        },
      ],
      fallback: {
        // 🎯 IA responde por aqui via mode='ai'
        mode: "ai",
        ai_prompt:
          block.overrides?.ai_prompt ||
          "Responda a dúvida do cliente sobre energia solar/iGreen Energy " +
          "em 2-3 frases curtas. Use linguagem simples, sem jargão. " +
          "Se a dúvida for fora do escopo (ex: pergunta pessoal, política), " +
          "diga que vai chamar o consultor humano. Após responder, sempre " +
          "termine com '👇 Posso te ajudar com mais alguma coisa?'",
      },
    }],
    endPosition: ctx.startPosition + 1,
    mediaSlots: [],
    stepKeysGenerated: { duvidas: stepKey },
  };
}

// ─── Bloco: finalizar_cadastro ─────────────────────────────────────────
function blockFinalizarCadastro(ctx: BlockContext, _block: FlowTemplateBlock): BlockResult {
  const stepKey = `finalizar_${ctx.uniqueSuffix}`;
  return {
    steps: [{
      step_key: stepKey,
      step_type: "finalizar_cadastro",
      position: ctx.startPosition,
      is_active: true,
      message_text:
        "Tudo certo, *{{nome}}*! 🎉\n\n" +
        "Estou enviando seu cadastro pro *portal da iGreen* agora.\n\n" +
        "📱 Em alguns instantes você vai receber um *código de verificação* aqui.\n\n" +
        "Quando chegar, é só *digitar o código aqui mesmo* que eu finalizo a parte da selfie pra você. ✅",
      slot_key: null,
      wait_for: "none",
      text_delay_ms: 2000,
      captures: [{
        kind: "system",
        name: "cadastro_completo",
        pipeline: "finalizar_cadastro",
        required: true,
        enabled: true,
      }],
      transitions: [],
      fallback: {
        mode: "handoff",
        handoff_reason: "cadastro_falhou",
      },
    }],
    endPosition: ctx.startPosition + 1,
    mediaSlots: [],
    stepKeysGenerated: { finalizar: stepKey },
  };
}

// ─── Registry ─────────────────────────────────────────────────────────
type BlockRenderer = (ctx: BlockContext, block: FlowTemplateBlock) => BlockResult;
export const BLOCK_RENDERERS: Record<StandardBlockId, BlockRenderer> = {
  pedir_conta_ocr: blockPedirContaOcr,
  pedir_documento_ocr: blockPedirDocumentoOcr,
  confirmar_email: blockConfirmarEmail,
  confirmar_telefone: blockConfirmarTelefone,
  duvidas_ia: blockDuvidasIa,
  finalizar_cadastro: blockFinalizarCadastro,
};

export const BLOCK_DESCRIPTIONS: Record<StandardBlockId, { label: string; description: string }> = {
  pedir_conta_ocr: {
    label: "📸 Pedir conta de luz + OCR",
    description: "Captura imagem ou PDF da conta. OCR extrai distribuidora, valor, instalação automaticamente.",
  },
  pedir_documento_ocr: {
    label: "🪪 Pedir documento + OCR",
    description: "Captura RG/CNH com auto-detecção do tipo. Extrai nome, CPF, data nascimento.",
  },
  confirmar_email: {
    label: "📧 Pedir e-mail",
    description: "Captura e-mail com validação. Necessário para envio de contrato pelo portal.",
  },
  confirmar_telefone: {
    label: "📱 Confirmar telefone",
    description: "Pergunta se o WhatsApp é o mesmo telefone de contato. Botão Sim/Outro.",
  },
  duvidas_ia: {
    label: "🤖 Bloco de dúvidas com IA",
    description: "Lead pode tirar dúvidas livremente. IA responde com base no conhecimento da iGreen.",
  },
  finalizar_cadastro: {
    label: "🎯 Finalizar cadastro (portal)",
    description: "Envia tudo ao portal da iGreen. Lead recebe SMS/OTP. Selfie via link.",
  },
};
