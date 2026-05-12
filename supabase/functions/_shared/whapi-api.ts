/**
 * Whapi Cloud API Helper
 * Usado EXCLUSIVAMENTE pelo super admin (rafael.ids@icloud.com)
 * Suporta botões reais do WhatsApp (quick_reply)
 * 
 * NÃO interfere nas instâncias Evolution dos consultores.
 */

import { fetchWithTimeout, logStructured, TIMEOUT_WHAPI } from "./utils.ts";
import { captureError } from "./sentry.ts";

export interface WhapiButton {
  id: string;
  title: string;
}

/**
 * Cria sender para Whapi Cloud API
 * Retorna a mesma interface do Evolution sender (sendText, sendButtons, sendMedia, downloadMedia)
 * para que o bot-flow.ts funcione sem alteração.
 */
export function createWhapiSender(apiToken: string, baseUrl = "https://gate.whapi.cloud") {
  const url = baseUrl.replace(/\/$/, "");

  async function sendWithRetry(label: string, doSend: () => Promise<Response>): Promise<boolean> {
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await doSend();
        if (res.ok) return true;
        lastStatus = res.status;
        lastBody = (await res.text()).substring(0, 200);
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
      } catch (error: any) {
        lastBody = error?.message || String(error);
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * Math.pow(3, attempt - 1)));
    }
    logStructured("error", `whapi_${label}_failed`, { status: lastStatus, error: lastBody });
    captureError(new Error(`Whapi ${label} failed: ${lastBody}`), {
      tags: { function: "whapi-api", kind: label },
    });
    return false;
  }

  const headers = {
    "Authorization": `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  async function sendText(remoteJid: string, text: string): Promise<boolean> {
    // Whapi usa chatId no formato "5511999990001@s.whatsapp.net"
    const to = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    const preview = (text || "").substring(0, 60).replace(/\n/g, " ");
    console.log(`📤 [whapi:sendText] -> ${to} | "${preview}${text.length > 60 ? "..." : ""}"`);
    const ok = await sendWithRetry("send_text", () =>
      fetchWithTimeout(`${url}/messages/text`, {
        method: "POST",
        headers,
        body: JSON.stringify({ to, body: text, typing_time: 0 }),
        timeout: TIMEOUT_WHAPI,
      })
    );
    console.log(`${ok ? "✅" : "❌"} [whapi:sendText] resultado=${ok}`);
    return ok;
  }

  async function sendButtons(remoteJid: string, message: string, buttons: WhapiButton[]): Promise<boolean> {
    const to = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    const safeButtons = buttons.slice(0, 3).map((b) => ({
      type: "quick_reply" as const,
      title: (b.title || "").substring(0, 25),
      id: b.id,
    }));

    console.log(`📤 [whapi:sendButtons] -> ${to} (${safeButtons.length} botões: ${safeButtons.map(b => b.id).join(",")})`);
    const ok = await sendWithRetry("send_buttons", () =>
      fetchWithTimeout(`${url}/messages/interactive`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to,
          type: "button",
          body: { text: message },
          footer: { text: "iGreen Energy ☀️" },
          action: { buttons: safeButtons },
        }),
        timeout: TIMEOUT_WHAPI,
      })
    );

    if (ok) {
      console.log(`✅ [whapi:sendButtons] botões entregues`);
      return true;
    }

    // Fallback: texto numerado (caso botões falhem por instabilidade do WhatsApp)
    console.warn(`⚠️ [whapi:sendButtons] FALHOU -> caindo para texto numerado`);
    const textWithOptions = `${message}\n\n${buttons.map((b, i) => `${i + 1}️⃣ ${b.title}`).join("\n")}\n\n_Digite o número da opção:_`;
    return sendText(remoteJid, textWithOptions);
  }

  async function sendMedia(remoteJid: string, mediaUrl: string, caption: string, mediatype: "video" | "image" | "document" = "video"): Promise<boolean> {
    const to = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    const endpoint = mediatype === "video" ? "messages/video"
      : mediatype === "image" ? "messages/image"
      : "messages/document";

    console.log(`📤 [whapi:sendMedia] -> ${to} (${mediatype})`);
    const ok = await sendWithRetry("send_media", () =>
      fetchWithTimeout(`${url}/${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ to, media: mediaUrl, caption }),
        timeout: 120_000,
      })
    );
    console.log(`${ok ? "✅" : "❌"} [whapi:sendMedia] resultado=${ok}`);
    return ok;
  }

  async function downloadMedia(_key: any, _message: any): Promise<string | null> {
    // Whapi entrega base64 diretamente no webhook payload (campo media.link ou media.data)
    // Não precisa de chamada extra como Evolution
    console.log(`ℹ️ [whapi:downloadMedia] Whapi entrega mídia no webhook — não precisa download separado`);
    return null;
  }

  return { sendText, sendButtons, downloadMedia, sendMedia };
}

/**
 * Parseia mensagem recebida do webhook Whapi
 * Retorna o mesmo formato que parseEvolutionMessage para compatibilidade com bot-flow.ts
 */
export function parseWhapiMessage(body: any) {
  const messages = body.messages || [];
  if (messages.length === 0) return null;

  const msg = messages[0];

  // Ignorar mensagens enviadas por nós
  if (msg.from_me) return null;

  // Ignorar grupos
  const chatId = msg.chat_id || "";
  if (chatId.includes("@g.us") || chatId.includes("@newsletter") || chatId.includes("@broadcast")) return null;

  const remoteJid = chatId || `${msg.from}@s.whatsapp.net`;

  // Texto
  let messageText = "";
  if (msg.type === "text" || msg.type === "conversation") {
    messageText = msg.text?.body || msg.body || msg.conversation || "";
  }

  // Resposta de botão (quick_reply)
  let buttonId: string | null = null;
  if (msg.type === "reply" && msg.reply?.type === "buttons_reply") {
    buttonId = msg.reply.buttons_reply.id?.replace(/^ButtonsV3:/, "") || null;
    messageText = msg.reply.buttons_reply.title || "";
  }
  // Resposta de lista
  if (msg.type === "reply" && msg.reply?.type === "list_reply") {
    buttonId = msg.reply.list_reply.id?.replace(/^ListV3:/, "") || null;
    messageText = msg.reply.list_reply.title || "";
  }

  // Imagem
  const hasImage = msg.type === "image";
  const imageMessage = hasImage ? { mimetype: msg.image?.mime_type || "image/jpeg", url: msg.image?.link } : null;

  // Documento
  const hasDocument = msg.type === "document";
  const documentMessage = hasDocument ? { mimetype: msg.document?.mime_type || "application/pdf", url: msg.document?.link } : null;

  const isFile = hasImage || hasDocument;
  const isButton = !!buttonId;

  // Extrair base64 se disponível (Whapi pode enviar inline)
  let fileBase64: string | null = null;
  let fileUrl: string | null = null;
  if (hasImage && msg.image) {
    fileBase64 = msg.image.data || null;
    fileUrl = msg.image.link || null;
  }
  if (hasDocument && msg.document) {
    fileBase64 = msg.document.data || null;
    fileUrl = msg.document.link || null;
  }

  return {
    remoteJid,
    messageText: messageText.trim(),
    buttonId,
    hasImage,
    hasDocument,
    hasAudio: false,
    hasVideo: false,
    isFile,
    isButton,
    imageMessage,
    documentMessage,
    audioMessage: null,
    videoMessage: null,
    key: { remoteJid, fromMe: false, id: msg.id || "" },
    message: msg,
    messageTimestamp: msg.timestamp,
    messageId: msg.id || "",
    fileBase64,
    fileUrl,
  };
}
