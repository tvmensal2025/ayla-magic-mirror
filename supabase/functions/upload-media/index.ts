import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  audio: ["audio/mpeg", "audio/ogg", "audio/mp4", "audio/wav", "audio/webm"],
  video: ["video/mp4", "video/webm"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

function getAllowedTypes(): string[] {
  return Object.values(ALLOWED_TYPES).flat();
}

function getExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[mime] || "bin";
}

// ── AWS Signature V4 for MinIO ──────────────────────────────────────────
async function hmacSHA256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  let kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  let kRegion = await hmacSHA256(kDate, region);
  let kService = await hmacSHA256(kRegion, service);
  let kSigning = await hmacSHA256(kService, "aws4_request");
  return kSigning;
}

interface MinIOUploadParams {
  serverUrl: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  objectKey: string;
  fileBytes: Uint8Array;
  contentType: string;
}

async function uploadToMinIO(params: MinIOUploadParams): Promise<void> {
  const { serverUrl, accessKey, secretKey, bucket, objectKey, fileBytes, contentType } = params;

  const url = new URL(`/${bucket}/${objectKey}`, serverUrl);
  const host = url.host;
  const region = "us-east-1";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dateStamp = amzDate.substring(0, 8);

  const payloadHash = await sha256Hex(fileBytes);

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    `/${bucket}/${objectKey}`,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256Hex(new TextEncoder().encode(canonicalRequest));

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signature = toHex(await hmacSHA256(signingKey, stringToSign));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Authorization": authHeader,
    },
    body: fileBytes,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`MinIO upload failed (${res.status}): ${errBody}`);
  }
}

// ── Check if user is admin ──────────────────────────────────────────────
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const minioUrl = Deno.env.get("MINIO_SERVER_URL") ?? "";
    const minioUser = Deno.env.get("MINIO_ROOT_USER") ?? "";
    const minioPass = Deno.env.get("MINIO_ROOT_PASSWORD") ?? "";
    const minioBucket = Deno.env.get("MINIO_BUCKET") ?? "igreen";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!minioUrl || !minioUser || !minioPass) {
      return new Response(
        JSON.stringify({ error: "MinIO credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Authenticate the caller ─────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    
    let userId: string | null = null;
    let userIsAdmin = false;

    if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
        userIsAdmin = await isAdmin(supabase, userId);
      }
    }

    // ── Parse form data ─────────────────────────────────────────────────
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_SIZE) {
      return new Response(
        JSON.stringify({ error: "File too large (max 100MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowed = getAllowedTypes();
    if (!allowed.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: `File type not allowed: ${file.type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ext = getExtension(file.type);
    const fileId = `${crypto.randomUUID()}-${Date.now()}.${ext}`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // ── Determine storage path ──────────────────────────────────────────
    // Admin → public/media/{file}  (publicly accessible)
    // Client → private/{consultant_id}/{file}  (personal, private)
    let objectKey: string;
    if (userIsAdmin) {
      objectKey = `public/media/${fileId}`;
    } else if (userId) {
      objectKey = `private/${userId}/${fileId}`;
    } else {
      objectKey = `public/uploads/${fileId}`;
    }

    console.log(`Uploading to MinIO: ${objectKey} (${file.type}, ${file.size} bytes, admin=${userIsAdmin})`);

    await uploadToMinIO({
      serverUrl: minioUrl,
      accessKey: minioUser,
      secretKey: minioPass,
      bucket: minioBucket,
      objectKey,
      fileBytes,
      contentType: file.type,
    });

    // Build the public URL
    const publicUrl = `${minioUrl}/${minioBucket}/${objectKey}`;

    return new Response(
      JSON.stringify({
        url: publicUrl,
        key: objectKey,
        type: file.type,
        size: file.size,
        visibility: userIsAdmin ? "public" : "private",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("upload-media error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
