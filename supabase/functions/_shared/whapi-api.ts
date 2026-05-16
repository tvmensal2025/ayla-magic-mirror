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

  async function sendWithRetry(label: string, doSend: () => Promise<Response>, maxAttempts = 3): Promise<boolean> {
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await doSend();
        if (res.ok) return true;
        lastStatus = res.status;
        lastBody = (await res.text()).substring(0, 200);
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
      } catch (error: any) {
        lastBody = error?.message || String(error);
      }
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 300 * Math.pow(3, attempt - 1)));
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

  // Calcula tempo de "digitando" (em segundos) baseado no tamanho do texto.
  // Whapi mantém o status até `typing_time` segundos antes de entregar a mensagem.
  // Limite seguro: 1s mínimo, 15s máximo.
  function typingTimeFor(text: string): number {
    const len = (text || "").length;
    const ms = 1500 + len * 35; // ~mesma curva do humanPace
    return Math.max(1, Math.min(15, Math.round(ms / 1000)));
  }

  async function sendPresence(
    remoteJid: string,
    presence: "typing" | "recording" | "paused" = "typing",
    delaySec = 3,
  ): Promise<boolean> {
    const to = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    return sendWithRetry("send_presence", () =>
      fetchWithTimeout(`${url}/presences/${encodeURIComponent(to)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ presence, delay: Math.max(1, Math.min(25, delaySec)) }),
        timeout: TIMEOUT_WHAPI,
      })
    );
  }

  async function sendText(
    remoteJid: string,
    text: string,
    opts?: { typingSec?: number },
  ): Promise<boolean> {
    // Whapi usa chatId no formato "5511999990001@s.whatsapp.net"
    const to = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    const preview = (text || "").substring(0, 60).replace(/\n/g, " ");
    const typing = opts?.typingSec ?? typingTimeFor(text);
    console.log(`📤 [whapi:sendText] -> ${to} (typing ${typing}s) | "${preview}${text.length > 60 ? "..." : ""}"`);
    const ok = await sendWithRetry("send_text", () =>
      fetchWithTimeout(`${url}/messages/text`, {
        method: "POST",
        headers,
        body: JSON.stringify({ to, body: text, typing_time: typing }),
        timeout: TIMEOUT_WHAPI + typing * 1000,
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

  async function sendMedia(
    remoteJid: string,
    mediaUrl: string,
    caption: string,
    mediatype: "video" | "image" | "document" | "audio" | "voice" = "video",
  ): Promise<boolean> {
    const to = remoteJid.includes("@") ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    const isAudio = mediatype === "audio" || mediatype === "voice";
    const endpoint = mediatype === "video" ? "messages/video"
      : mediatype === "image" ? "messages/image"
      : isAudio ? "messages/voice"
      : "messages/document";
    const urlPreview = String(mediaUrl || "").slice(-60);

    const cleanPath = (() => {
      try { return new URL(mediaUrl).pathname; } catch (_) { return mediaUrl.split("?")[0] || "media"; }
    })();
    const fileName = decodeURIComponent(cleanPath.split("/").pop() || (isAudio ? "audio.webm" : "media"));
    const contentType = isAudio ? "audio/webm"
      : mediatype === "video" ? "video/mp4"
      : mediatype === "image" ? "image/jpeg"
      : "application/octet-stream";

    const sendMultipart = async (path: string): Promise<boolean> => {
      try {
        const mediaRes = await fetchWithTimeout(mediaUrl, { method: "GET", timeout: 30_000 });
        if (!mediaRes.ok) {
          console.warn(`⚠️ [whapi:sendMedia] download da mídia falhou (${mediaRes.status})`);
          return false;
        }
        const blob = new Blob([await mediaRes.arrayBuffer()], { type: mediaRes.headers.get("content-type") || contentType });
        const form = new FormData();
        form.append("to", to);
        form.append("media", blob, fileName);
        if (caption && !isAudio) form.append("caption", caption);
        if (isAudio) {
          form.append("mime_type", blob.type || "audio/webm");
          form.append("no_cache", "true");
          form.append("recording_time", "1");
        }
        console.log(`📤 [whapi:sendMedia] fallback multipart -> ${to} (${mediatype} via ${path}, ${blob.size} bytes, ${blob.type})`);
        return await sendWithRetry("send_media_multipart", () =>
          fetchWithTimeout(`${url}/${path}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiToken}` },
            body: form,
            timeout: 90_000,
          }),
        );
      } catch (e: any) {
        console.warn(`⚠️ [whapi:sendMedia] fallback multipart falhou: ${e?.message || e}`);
        return false;
      }
    };

    sendPresence(remoteJid, isAudio ? "recording" : "typing", 3).catch(() => {});

    console.log(`📤 [whapi:sendMedia] -> ${to} (${mediatype} via ${endpoint}) url=…${urlPreview}`);
    const body: Record<string, unknown> = isAudio
      ? { to, media: mediaUrl, mime_type: contentType, no_cache: true, recording_time: 1 }
      : { to, media: mediaUrl, caption };
    const ok = await sendWithRetry("send_media", () =>
      fetchWithTimeout(`${url}/${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        timeout: 60_000,
      }),
    );
    if (ok) {
      console.log(`✅ [whapi:sendMedia] resultado=true (${mediatype} via ${endpoint})`);
      return true;
    }

    const multipartOk = await sendMultipart(endpoint);
    if (multipartOk) {
      console.log(`✅ [whapi:sendMedia] resultado=true (${mediatype} via ${endpoint}, multipart)`);
      return true;
    }

    if (isAudio && endpoint !== "messages/audio") {
      const audioEndpointOk = await sendMultipart("messages/audio");
      if (audioEndpointOk) {
        console.log(`✅ [whapi:sendMedia] resultado=true (${mediatype} via messages/audio, multipart)`);
        return true;
      }
    }

    console.log(`❌ [whapi:sendMedia] resultado=false (${mediatype} via ${endpoint})`);
    return false;
  }

  async function downloadMedia(_key: any, _message: any): Promise<string | null> {
    // Whapi entrega base64 diretamente no webhook payload (campo media.link ou media.data)
    // Não precisa de chamada extra como Evolution
    console.log(`ℹ️ [whapi:downloadMedia] Whapi entrega mídia no webhook — não precisa download separado`);
    return null;
  }

  return { sendText, sendButtons, downloadMedia, sendMedia, sendPresence };
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

  // Áudio / Voice note (PTT)
  const hasAudio = msg.type === "voice" || msg.type === "audio" || !!msg.voice || !!msg.audio;
  const audioPayload = msg.voice || msg.audio || null;
  const audioMessage = hasAudio
    ? { mimetype: audioPayload?.mime_type || "audio/ogg", url: audioPayload?.link, ptt: msg.type === "voice" }
    : null;

  const isFile = hasImage || hasDocument || hasAudio;
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
  if (hasAudio && audioPayload) {
    fileBase64 = audioPayload.data || null;
    fileUrl = audioPayload.link || null;
  }

  // Nome do remetente vindo do WhatsApp (pushName)
  const fromName: string | null = msg.from_name || msg.pushname || msg.notify_name || null;

  return {
    remoteJid,
    fromName,
    messageText: messageText.trim(),
    buttonId,
    hasImage,
    hasDocument,
    hasAudio,
    hasVideo: false,
    isFile,
    isButton,
    imageMessage,
    documentMessage,
    audioMessage,
    videoMessage: null,
    key: { remoteJid, fromMe: false, id: msg.id || "" },
    message: msg,
    messageTimestamp: msg.timestamp,
    messageId: msg.id || "",
    fileBase64,
    fileUrl,
  };
}
