// ─── MinIO Direct Upload Helper (AWS SigV4) ─────────────────────────────
// Faz upload imediato de bytes para MinIO e retorna a URL pública.
// Usado pelo webhook quando recebemos uma mídia (conta/doc) — assim o banco
// guarda apenas a URL pública (curta), não o data URL base64 gigante.

async function hmacSHA256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string,
): Promise<Uint8Array> {
  const kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSHA256(kDate, regionName);
  const kService = await hmacSHA256(kRegion, serviceName);
  const kSigning = await hmacSHA256(kService, "aws4_request");
  return kSigning;
}

function toHex(buffer: Uint8Array): string {
  return Array.from(buffer).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
  };
  return map[mime?.toLowerCase()] || "bin";
}

export interface MinioUploadInput {
  bytes: Uint8Array;
  contentType: string;
  consultantFolder: string; // ex: igreen_id ou consultant uuid
  consultantName?: string;   // nome do consultor para compor a pasta
  customerName: string;
  customerBirth?: string | null;
  kind: "conta" | "doc_frente" | "doc_verso";
}

export interface MinioUploadResult {
  url: string;
  objectKey: string;
  bucket: string;
}

/**
 * Sobe bytes brutos diretamente ao MinIO via AWS SigV4.
 * Lança erro se as credenciais não estiverem configuradas ou a request falhar.
 */
export async function uploadBytesToMinio(input: MinioUploadInput): Promise<MinioUploadResult> {
  const serverUrl = Deno.env.get("MINIO_SERVER_URL") || "";
  const accessKey = Deno.env.get("MINIO_ROOT_USER") || "";
  const secretKey = Deno.env.get("MINIO_ROOT_PASSWORD") || "";
  const bucket = Deno.env.get("MINIO_BUCKET") || "igreen";

  if (!serverUrl || !accessKey || !secretKey) {
    throw new Error("MinIO credentials not configured (MINIO_SERVER_URL/USER/PASSWORD)");
  }

  // Build object key: documentos/{consultor}/{nome_data}_{kind}.{ext}
  const fullName = (input.customerName || "cliente").trim();
  const parts = fullName.split(/\s+/);
  const first = normalizeName(parts[0] || "cliente");
  const last = normalizeName(parts[parts.length - 1] || "x");

  let dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  if (input.customerBirth) {
    const m = input.customerBirth.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) dateStr = `${m[3]}${m[2]}${m[1]}`;
    else if (/^\d{4}-\d{2}-\d{2}/.test(input.customerBirth)) {
      dateStr = input.customerBirth.slice(0, 10).replace(/-/g, "");
    }
  }

  const ext = extFromMime(input.contentType);
  // Pasta do consultor: {id}_{nome_normalizado} (ex: 124661_joao_silva)
  const consultantId = normalizeName(input.consultantFolder || "sem_consultor");
  const consultantNameNorm = normalizeName(input.consultantName || "");
  const consultantSlug = consultantNameNorm
    ? `${consultantId}_${consultantNameNorm}`
    : consultantId;
  // Pasta do cliente: {primeiro_nome}_{sobrenome}_{YYYYMMDD}
  const customerSlug = `${first}_${last}_${dateStr}`;
  const folder = `documentos/${consultantSlug}/${customerSlug}`;
  // Nome do arquivo: apenas o tipo (conta.pdf, doc_frente.jpg, doc_verso.jpg)
  const objectKey = `${folder}/${input.kind}.${ext}`;

  // AWS SigV4
  const url = new URL(serverUrl);
  const host = url.host;
  const region = "us-east-1";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = toHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", input.bytes.buffer as ArrayBuffer)),
  );
  const canonicalUri = `/${bucket}/${objectKey}`;
  const canonicalHeaders =
    `content-type:${input.contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest =
    `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${
    toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest))))
  }`;
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signature = toHex(await hmacSHA256(signingKey, stringToSign));
  const authorizationHeader =
    `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadUrl = `${serverUrl}${canonicalUri}`;
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": input.contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorizationHeader,
    },
    body: input.bytes,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`MinIO upload failed (${res.status}): ${errBody.substring(0, 300)}`);
  }

  return { url: `${serverUrl}${canonicalUri}`, objectKey, bucket };
}

/**
 * Decodifica base64 para Uint8Array.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
