// Worker Portal 2 — servidor HTTP que recebe leads e cadastra via API
// Diferente do worker-portal original (que clica na UI), este chama a API
// direto com HMAC + Playwright como tunnel TLS.
//
// Endpoints:
//   POST /submit-lead           — Cadastra lead no Portal 2
//   POST /confirm-otp           — Recebe OTP do cliente e valida
//   GET  /lead/:id/status       — Status do cadastro
//   GET  /health                — Healthcheck
//
// Autenticação: header `Authorization: Bearer ${WORKER_SECRET}`

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { Queue, Worker } from 'bullmq';
import dotenv from 'dotenv';
import ws from 'ws';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { Portal2Client, fileFromPath, closeBrowser } from './portal2-api-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const PORT = Number(process.env.PORT || 3101);
const SECRET = process.env.WORKER_SECRET || 'change-me';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const REDIS_URL = process.env.REDIS_URL || 'redis://evolution-api-redis:6379';
const QUEUE_NAME = 'portal-worker-2-leads';

const supabase = (() => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('⚠️ Supabase não configurado — leads não serão persistidos');
    return null;
  }
  try {
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Node <22 não tem WebSocket nativo; passamos `ws` pra realtime-js
      realtime: { transport: ws },
    });
  } catch (e) {
    console.warn(`⚠️ Supabase init falhou: ${e.message} — seguindo sem persistência`);
    return null;
  }
})();

// ─── Auth middleware ────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${SECRET}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

// ─── Job processor ──────────────────────────────────────────────────────────
async function processLead(job) {
  const { customer_id, dados } = job.data;
  console.log(`▶ [job ${job.id}] cadastrando customer=${customer_id} idconsultor=${dados.idconsultor}`);

  const c = new Portal2Client({ idconsultor: dados.idconsultor });
  try {
    const result = await c.cadastrarCliente(dados);
    console.log(`✓ [job ${job.id}] customer=${customer_id} → idcliente=${result.idcliente}`);

    // Persistir no banco (best-effort)
    if (supabase && customer_id) {
      await supabase.from('customers').update({
        portal2_idcliente: result.idcliente,
        portal2_idsolcontratovalidacao: result.idsolcontratovalidacao,
        portal2_status: 'created',
        portal2_created_at: new Date().toISOString(),
      }).eq('id', customer_id).then(
        () => {},
        (e) => console.warn(`  ⚠ supabase update falhou: ${e.message}`),
      );
    }

    // Disparar geração de OTP automaticamente
    try {
      await c.generateVerificationCode(result.idcliente);
      console.log(`  ✓ OTP enviado pra customer=${customer_id}`);
    } catch (e) {
      console.warn(`  ⚠ falha ao gerar OTP: ${e.message}`);
    }

    return { success: true, ...result };
  } catch (e) {
    console.error(`✗ [job ${job.id}] customer=${customer_id} erro: ${e.message}`);
    if (supabase && customer_id) {
      await supabase.from('customers').update({
        portal2_status: 'failed',
        portal2_error: e.message.slice(0, 500),
      }).eq('id', customer_id).then(() => {}, () => {});
    }
    throw e; // bullmq faz retry
  }
}

// ─── Setup BullMQ ───────────────────────────────────────────────────────────
const redisConn = (() => {
  try {
    const u = new URL(REDIS_URL);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password ? decodeURIComponent(u.password) : undefined,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      // não fica spamando reconexões em loop quando senha está errada
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 1000, 5000)),
    };
  } catch { return { host: 'evolution-api-redis', port: 6379 }; }
})();

let queue = null;
let worker = null;
let queueAvailable = false;

async function initQueue() {
  try {
    queue = new Queue(QUEUE_NAME, { connection: redisConn });
    // suprime spam de erros de conexão antes de declararmos indisponível
    queue.on('error', (e) => {
      if (queueAvailable) console.warn(`  queue error: ${e.message}`);
    });
    await queue.getJobCounts();
    worker = new Worker(QUEUE_NAME, processLead, {
      connection: redisConn,
      concurrency: 1, // 1 cadastro por vez (evita problemas com Playwright singleton)
      limiter: { max: 6, duration: 60_000 }, // máximo 6 cadastros/min
    });
    worker.on('error', (e) => {
      if (queueAvailable) console.warn(`  worker conn error: ${e.message}`);
    });
    worker.on('failed', (job, err) => console.error(`  worker fail job=${job?.id}: ${err.message}`));
    worker.on('completed', (job) => console.log(`  worker done job=${job.id}`));
    queueAvailable = true;
    console.log(`✅ BullMQ conectado (${redisConn.host}:${redisConn.port}) fila="${QUEUE_NAME}"`);
  } catch (e) {
    console.warn(`⚠️ Redis indisponível: ${e.message} — funcionando em modo síncrono`);
    // limpa connections que ficaram tentando reconectar em loop
    try { if (worker) await worker.close(); } catch {}
    try { if (queue) await queue.close(); } catch {}
    queue = null;
    worker = null;
    queueAvailable = false;
  }
}

// ─── Express ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '20mb' }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'worker-portal-2',
    portal: 'https://green.igreenenergy.com.br/autoconexao',
    queue: queueAvailable ? 'redis-bullmq' : 'sync',
    uptime: process.uptime(),
  });
});

app.post('/submit-lead', authRequired, async (req, res) => {
  const { customer_id, dados } = req.body || {};
  if (!dados?.idconsultor) return res.status(400).json({ ok: false, error: 'dados.idconsultor obrigatório' });
  if (!dados?.cpf) return res.status(400).json({ ok: false, error: 'dados.cpf obrigatório' });

  try {
    if (queueAvailable) {
      const job = await queue.add('cadastrar', { customer_id, dados }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 7 * 86400 },
      });
      return res.json({ ok: true, queued: true, job_id: job.id });
    }
    // Modo síncrono (sem Redis): processa direto
    const result = await processLead({ id: 'sync-' + Date.now(), data: { customer_id, dados } });
    return res.json({ ok: true, queued: false, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/confirm-otp', authRequired, async (req, res) => {
  const { idconsultor, idcliente, code } = req.body || {};
  if (!idconsultor || !idcliente || !code) {
    return res.status(400).json({ ok: false, error: 'idconsultor, idcliente, code obrigatórios' });
  }
  try {
    const c = new Portal2Client({ idconsultor });
    const result = await c.validateVerificationCode({ idcliente, code });
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/lead/:idcliente/status', authRequired, async (req, res) => {
  const { idcliente } = req.params;
  const idconsultor = Number(req.query.idconsultor);
  if (!idconsultor) return res.status(400).json({ ok: false, error: 'idconsultor obrigatório (query)' });
  try {
    const c = new Portal2Client({ idconsultor });
    const [otp, contract] = await Promise.all([
      c.getVerificationCodeStatus(idcliente).catch(e => ({ error: e.message })),
      c.getContractGenerated(idcliente).catch(e => ({ error: e.message })),
    ]);
    return res.json({ ok: true, otp_status: otp, contract });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/queue/status', authRequired, async (req, res) => {
  if (!queueAvailable) return res.json({ ok: true, queue: 'sync (sem redis)' });
  const counts = await queue.getJobCounts();
  return res.json({ ok: true, queue: QUEUE_NAME, counts });
});

// ─── Bootstrap ──────────────────────────────────────────────────────────────
async function main() {
  await initQueue();
  app.listen(PORT, () => {
    console.log(`🚀 worker-portal-2 ouvindo na porta ${PORT}`);
    console.log(`   POST /submit-lead`);
    console.log(`   POST /confirm-otp`);
    console.log(`   GET  /lead/:id/status`);
    console.log(`   GET  /queue/status`);
    console.log(`   GET  /health`);
  });
}

// Graceful shutdown — fecha browser singleton
async function shutdown(sig) {
  console.log(`\n[${sig}] encerrando...`);
  try { if (worker) await worker.close(); } catch {}
  try { if (queue) await queue.close(); } catch {}
  try { await closeBrowser(); } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
