// Standalone Deno uploader: envia MP3s do repo igreen-autoflow-server para o MinIO
// Bucket: igreen | Prefix: public/media/autoflow/
// Usa AWS SigV4 (PUT direto), espelhando supabase/functions/_shared/minio-upload.ts

const SERVER_URL = Deno.env.get("MINIO_SERVER_URL") || "https://igreen-minio.d9v63q.easypanel.host";
const ACCESS_KEY = Deno.env.get("MINIO_ROOT_USER") || "testando200";
const SECRET_KEY = Deno.env.get("MINIO_ROOT_PASSWORD") || "200300400500600";
const BUCKET = Deno.env.get("MINIO_BUCKET") || "igreen";
const PREFIX = "public/media/autoflow/";
const SOURCE_DIR = Deno.env.get("AUTOFLOW_SRC") || "/tmp/igreen-autoflow-server";

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

async function putObject(objectKey: string, bytes: Uint8Array, contentType: string) {
  const url = new URL(SERVER_URL);
  const host = url.host;
  const region = "us-east-1";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = toHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer)),
  );
  const canonicalUri = `/${BUCKET}/${objectKey}`;
  const canonicalHeaders =
    `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${
    toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest))))
  }`;
  const signingKey = await getSignatureKey(SECRET_KEY, dateStamp, region, service);
  const signature = toHex(await hmacSHA256(signingKey, stringToSign));
  const authorizationHeader =
    `${algorithm} Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadUrl = `${SERVER_URL}${canonicalUri}`;
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorizationHeader,
    },
    body: bytes as BodyInit,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`MinIO upload failed (${res.status}): ${errBody.substring(0, 500)}`);
  }
  return uploadUrl;
}

// Limpa "01__Boas_Vindas.mp3_igreen_audio.mp3" -> "01__Boas_Vindas.mp3"
function cleanName(filename: string): string {
  return filename.replace(/\.mp3_igreen_audio\.mp3$/i, ".mp3");
}

const files: { src: string; dst: string }[] = [];
for await (const entry of Deno.readDir(SOURCE_DIR)) {
  if (!entry.isFile) continue;
  if (!entry.name.toLowerCase().endsWith(".mp3")) continue;
  files.push({
    src: `${SOURCE_DIR}/${entry.name}`,
    dst: `${PREFIX}${cleanName(entry.name)}`,
  });
}
files.sort((a, b) => a.dst.localeCompare(b.dst));

console.log(`📦 Encontrados ${files.length} arquivos .mp3 — enviando para s3://${BUCKET}/${PREFIX}`);
console.log(`🌐 Servidor: ${SERVER_URL}`);

const results: { name: string; url: string; bytes: number; ok: boolean; error?: string }[] = [];
for (const f of files) {
  const bytes = await Deno.readFile(f.src);
  try {
    const url = await putObject(f.dst, bytes, "audio/mpeg");
    results.push({ name: f.dst, url, bytes: bytes.length, ok: true });
    console.log(`✅ ${f.dst}  (${bytes.length} bytes)`);
  } catch (e) {
    const msg = (e as Error).message;
    results.push({ name: f.dst, url: "", bytes: bytes.length, ok: false, error: msg });
    console.error(`❌ ${f.dst} — ${msg}`);
  }
}

const ok = results.filter((r) => r.ok).length;
console.log(`\n📊 Resultado: ${ok}/${results.length} arquivos enviados.`);

await Deno.writeTextFile(
  "./.tmp/upload-autoflow-result.json",
  JSON.stringify(results, null, 2),
);
console.log("📝 Detalhes salvos em .tmp/upload-autoflow-result.json");
