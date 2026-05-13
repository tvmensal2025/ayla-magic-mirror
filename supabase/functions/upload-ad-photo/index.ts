import { adminClient, authConsultant, corsHeaders } from "../_shared/fb-graph.ts";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await authConsultant(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    let file: File | null = null;
    let requestedConsultantId = auth.id;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      requestedConsultantId = String(body.consultant_id || auth.id);
      const rawBase64 = String(body.data_base64 || "");
      const base64 = rawBase64.includes(",") ? rawBase64.split(",").pop() || "" : rawBase64;
      if (base64) {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const filename = String(body.filename || `upload-${crypto.randomUUID()}.jpg`);
        file = new File([bytes], filename, { type: String(body.content_type || "image/jpeg") });
      }
    } else {
      const formData = await req.formData();
      file = formData.get("file") as File | null;
      requestedConsultantId = String(formData.get("consultant_id") || auth.id);
    }

    if (!file) return json({ error: "Imagem não enviada." }, 400);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return json({ error: "Use JPG, PNG ou WebP." }, 400);
    if (file.size > MAX_IMAGE_SIZE) return json({ error: "Imagem maior que 8 MB." }, 400);

    const admin = adminClient();
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.id)
      .in("role", ["admin", "super_admin"])
      .limit(1)
      .maybeSingle();

    const targetConsultantId = role?.role ? requestedConsultantId : auth.id;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${targetConsultantId}/ads/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    const { error } = await admin.storage.from("consultant-photos").upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });
    if (error) throw error;

    const { data } = admin.storage.from("consultant-photos").getPublicUrl(path);
    return json({ url: data.publicUrl, path });
  } catch (err) {
    console.error("[upload-ad-photo]", err);
    return json({ error: (err as Error).message || "Falha ao enviar imagem." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}