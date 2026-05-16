// Compress Worker — recebe vídeo, comprime com ffmpeg (720p H.264) e sobe pro MinIO.
// Deploy: Easypanel (Dockerfile incluso). Endpoint: POST /compress (multipart "file").
//
// ENV obrigatórias:
//   API_KEY                 — secret para autenticar (header x-api-key)
//   MINIO_ENDPOINT          — ex: minio.seu-dominio.com (sem https://)
//   MINIO_PORT              — 443 (padrão se useSSL=true)
//   MINIO_USE_SSL           — "true" | "false"
//   MINIO_ACCESS_KEY        — = MINIO_ROOT_USER do seu MinIO
//   MINIO_SECRET_KEY        — = MINIO_ROOT_PASSWORD
//   MINIO_BUCKET            — ex: igreen
//   PUBLIC_BASE_URL         — base pública pros arquivos. Ex: https://minio.seu-dominio.com
//
// Opcional:
//   TARGET_HEIGHT           — padrão 720
//   CRF                     — padrão 28 (quanto maior, mais compressão / menos qualidade)
//   AUDIO_BITRATE           — padrão 96k
//   SKIP_BELOW_BYTES        — padrão 5MB (não comprime se já está pequeno)

import express from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";

const PORT = parseInt(process.env.PORT || "8080", 10);
const API_KEY = process.env.API_KEY || "";
const TARGET_HEIGHT = parseInt(process.env.TARGET_HEIGHT || "720", 10);
const CRF = parseInt(process.env.CRF || "28", 10);
const AUDIO_BITRATE = process.env.AUDIO_BITRATE || "96k";
const SKIP_BELOW = parseInt(process.env.SKIP_BELOW_BYTES || `${5 * 1024 * 1024}`, 10);

const MINIO_BUCKET = process.env.MINIO_BUCKET || "igreen";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || "",
  port: parseInt(process.env.MINIO_PORT || "443", 10),
  useSSL: (process.env.MINIO_USE_SSL || "true") === "true",
  accessKey: process.env.MINIO_ACCESS_KEY || "",
  secretKey: process.env.MINIO_SECRET_KEY || "",
});

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB upload máx
});

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

function authOk(req) {
  if (!API_KEY) return true; // sem key configurada = aberto (não recomendado)
  return req.header("x-api-key") === API_KEY;
}

function ffprobeDuration(filePath) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => {
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : null);
    });
  });
}

function hasAudioStream(filePath) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      filePath,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => resolve(out.trim() === "audio"));
  });
}

function runFfmpeg(inputPath, outputPath, withAudio) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-vf", `scale=-2:${TARGET_HEIGHT}`,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", String(CRF),
      "-movflags", "+faststart",
      "-pix_fmt", "yuv420p",
    ];
    if (withAudio) {
      args.push("-c:a", "aac", "-b:a", AUDIO_BITRATE);
    } else {
      args.push("-an");
    }
    args.push(outputPath);

    const p = spawn("ffmpeg", args);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

app.post("/compress", upload.single("file"), async (req, res) => {
  const t0 = Date.now();

  if (!authOk(req)) return res.status(401).json({ error: "unauthorized" });
  if (!req.file) return res.status(400).json({ error: "missing file" });

  const folder = (req.body?.folder || "videos").replace(/[^a-zA-Z0-9_\-/]/g, "_");
  const baseName = (req.body?.name || "video").replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
  const id = randomUUID().slice(0, 8);
  const objectKey = `${folder}/${baseName}_${id}.mp4`;

  const work = await mkdtemp(join(tmpdir(), "cmp-"));
  const inputPath = join(work, "input.bin");
  const outputPath = join(work, "out.mp4");

  try {
    await (await import("node:fs/promises")).writeFile(inputPath, req.file.buffer);
    const originalSize = req.file.size;

    let finalBuffer;
    let skipped = false;

    if (originalSize <= SKIP_BELOW && /^video\/mp4$/i.test(req.file.mimetype || "")) {
      // já é mp4 pequeno — não recomprime
      finalBuffer = req.file.buffer;
      skipped = true;
    } else {
      const withAudio = await hasAudioStream(inputPath);
      await runFfmpeg(inputPath, outputPath, withAudio);
      finalBuffer = await readFile(outputPath);
    }

    const finalSize = finalBuffer.length;
    const duration = await ffprobeDuration(skipped ? inputPath : outputPath);

    // Upload pro MinIO
    await minio.putObject(MINIO_BUCKET, objectKey, finalBuffer, finalSize, {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=31536000, immutable",
    });

    const url = PUBLIC_BASE_URL
      ? `${PUBLIC_BASE_URL}/${MINIO_BUCKET}/${objectKey}`
      : `/${MINIO_BUCKET}/${objectKey}`;

    res.json({
      ok: true,
      url,
      object_key: objectKey,
      bucket: MINIO_BUCKET,
      content_type: "video/mp4",
      original_size: originalSize,
      final_size: finalSize,
      compression_ratio: originalSize ? +(finalSize / originalSize).toFixed(3) : null,
      duration_sec: duration,
      skipped_compression: skipped,
      elapsed_ms: Date.now() - t0,
    });
  } catch (e) {
    console.error("[compress] error:", e?.message);
    res.status(500).json({ error: e?.message || "compress failed" });
  } finally {
    rm(work, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`compress-worker listening on :${PORT}`);
});
