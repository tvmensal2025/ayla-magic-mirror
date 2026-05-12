// Envia alerta WhatsApp para o próprio consultor quando algo dá errado
// (campanha, automação, validação de imagem, etc).
// Usa a instância Evolution do próprio consultor para mandar a mensagem
// para o número pessoal dele (consultants.phone).
import { adminClient } from "./fb-graph.ts";

export type AlertLevel = "info" | "warning" | "error";

const ICON: Record<AlertLevel, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "🚨",
};

export async function notifyConsultant(
  consultantId: string,
  level: AlertLevel,
  title: string,
  body: string,
): Promise<boolean> {
  try {
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
    if (!evolutionUrl || !evolutionKey) {
      console.warn("[notify] Evolution não configurada — skip");
      return false;
    }

    const admin = adminClient();
    const { data: consultant } = await admin
      .from("consultants")
      .select("phone, name")
      .eq("id", consultantId)
      .maybeSingle();
    if (!consultant?.phone) {
      console.warn("[notify] consultor sem phone:", consultantId);
      return false;
    }

    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("instance_name, connected_phone")
      .eq("consultant_id", consultantId)
      .maybeSingle();
    if (!inst?.instance_name) {
      console.warn("[notify] consultor sem instance Evolution:", consultantId);
      return false;
    }

    // Normaliza número: só dígitos, garante DDI 55
    const digits = String(consultant.phone).replace(/\D/g, "");
    const number = digits.startsWith("55") ? digits : `55${digits}`;

    const text = `${ICON[level]} *${title}*\n\n${body}\n\n_Mensagem automática iGreen_`;

    const res = await fetch(`${evolutionUrl.replace(/\/+$/, "")}/message/sendText/${inst.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionKey },
      body: JSON.stringify({ number, text }),
    });
    if (!res.ok) {
      console.warn("[notify] Evolution falhou:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[notify] erro:", (e as Error).message);
    return false;
  }
}