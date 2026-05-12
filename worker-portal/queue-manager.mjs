// ═══════════════════════════════════════════════════════════════════════════════
// FILA PERSISTENTE COM BULLMQ + FALLBACK MEMÓRIA
// Se Redis estiver disponível → usa BullMQ (jobs sobrevivem restart)
// Se Redis NÃO estiver disponível → usa fila em memória (comportamento atual)
// ═══════════════════════════════════════════════════════════════════════════════

import { Queue, Worker, QueueEvents } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://evolution-api-redis:6379';
const QUEUE_NAME = 'portal-worker-leads';

let bullQueue = null;
let bullWorker = null;
let bullEvents = null;
let redisAvailable = false;
let redisConnection = null;

// Stats (compartilhados entre BullMQ e memória)
let processedCount = 0;
let failedCount = 0;
let currentJob = null;

// Fallback: fila em memória (comportamento original)
const memoryQueue = [];
let isProcessingLock = false;
const retryTracker = new Map();
const recentlyProcessed = new Set();

// Log de atividades
const ACTIVITY_MAX = 50;
const activityLog = [];

export function pushActivity(event, customer_id, message) {
  activityLog.push({ at: new Date().toISOString(), event, customer_id: customer_id || null, message: message || '' });
  if (activityLog.length > ACTIVITY_MAX) activityLog.shift();
}

export function getActivityLog() { return activityLog; }

// ─── Parsear Redis URL ───────────────────────────────────────────────────────
function parseRedisUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '6379', 10),
      password: u.password || undefined,
    };
  } catch {
    return { host: 'evolution-api-redis', port: 6379 };
  }
}

// ─── Inicializar BullMQ (tenta conectar ao Redis) ────────────────────────────
export async function initQueue(processJobFn) {
  const conn = parseRedisUrl(REDIS_URL);
  redisConnection = conn;

  try {
    // Testar conexão Redis com timeout de 5s
    const { createClient } = await import('redis').catch(() => null) || {};
    // BullMQ usa ioredis internamente, vamos testar criando a queue
    bullQueue = new Queue(QUEUE_NAME, { connection: conn });
    
    // Testar se Redis responde
    await bullQueue.getJobCounts();
    
    redisAvailable = true;
    console.log(`✅ BullMQ conectado ao Redis (${conn.host}:${conn.port})`);
    console.log(`📋 Fila persistente "${QUEUE_NAME}" ativa`);

    // Verificar jobs pendentes que sobreviveram ao restart
    const waiting = await bullQueue.getWaitingCount();
    const active = await bullQueue.getActiveCount();
    if (waiting > 0 || active > 0) {
      console.log(`🔄 Jobs recuperados do Redis: ${waiting} esperando, ${active} ativos`);
    }

    // Criar worker que processa 1 job por vez
    bullWorker = new Worker(QUEUE_NAME, async (job) => {
      const { customer_id, options } = job.data;
      currentJob = { customer_id, startedAt: new Date().toISOString(), bullJobId: job.id };
      pushActivity('job_started', customer_id, `Automação iniciada (BullMQ job ${job.id})`);
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🚀 FILA: Processando lead ${customer_id} (BullMQ job ${job.id}, tentativa ${job.attemptsMade + 1}/3)`);
      console.log('='.repeat(70));

      try {
        const result = await processJobFn(customer_id, options);
        processedCount++;
        pushActivity('job_finished', customer_id, 'Automação concluída com sucesso');
        currentJob = null;
        return result;
      } catch (error) {
        failedCount++;
        pushActivity('job_failed', customer_id, `Falha (${job.attemptsMade + 1}/3): ${error.message}`);
        currentJob = null;
        throw error; // BullMQ faz retry automaticamente
      }
    }, {
      connection: conn,
      concurrency: 1, // 1 job por vez (igual ao comportamento atual)
      limiter: { max: 1, duration: 1000 }, // Máximo 1 job por segundo
    });

    bullWorker.on('failed', (job, err) => {
      console.error(`❌ BullMQ: Job ${job?.id} falhou: ${err.message}`);
    });

    bullWorker.on('completed', (job) => {
      console.log(`✅ BullMQ: Job ${job.id} concluído`);
    });

    bullWorker.on('error', (err) => {
      console.error(`❌ BullMQ Worker erro: ${err.message}`);
    });

  } catch (error) {
    console.warn(`⚠️  Redis não disponível (${conn.host}:${conn.port}): ${error.message}`);
    console.warn(`📋 Usando fila em MEMÓRIA (fallback — jobs não sobrevivem restart)`);
    redisAvailable = false;
    bullQueue = null;
    bullWorker = null;
  }
}

// ─── Adicionar job na fila ───────────────────────────────────────────────────
export async function addToQueue(customer_id, options = {}, supabaseUpdateFn = null) {
  // Verificar duplicatas (funciona tanto com BullMQ quanto memória)
  if (recentlyProcessed.has(customer_id)) {
    console.log(`🔒 ${customer_id} processado recentemente, ignorando`);
    return { position: 0, duplicate: true };
  }
  if (currentJob?.customer_id === customer_id) {
    return { position: 0, duplicate: true };
  }

  // Atualizar status no Supabase
  if (supabaseUpdateFn) {
    try { await supabaseUpdateFn(customer_id); } catch (e) {
      console.warn(`   ⚠️  Erro ao atualizar status: ${e.message}`);
    }
  }

  if (redisAvailable && bullQueue) {
    // ─── BullMQ: fila persistente ─────────────────────────────────────
    // Verificar se já existe job pra esse customer
    const existingJobs = await bullQueue.getJobs(['waiting', 'active', 'delayed']);
    const isDuplicate = existingJobs.some(j => j.data?.customer_id === customer_id);
    if (isDuplicate) {
      return { position: 0, duplicate: true };
    }

    const job = await bullQueue.add('process-lead', { customer_id, options }, {
      attempts: 3,
      backoff: { type: 'fixed', delay: 5000 },
      removeOnComplete: { count: 100 }, // Manter últimos 100 jobs concluídos
      removeOnFail: { count: 50 },      // Manter últimos 50 jobs falhados
      jobId: `lead-${customer_id}-${Date.now()}`,
    });

    const waiting = await bullQueue.getWaitingCount();
    console.log(`📋 FILA (BullMQ): +1 lead (${customer_id}) | Job: ${job.id} | Na fila: ${waiting}`);
    pushActivity('lead_received', customer_id, `Lead adicionado (BullMQ job ${job.id})`);
    return { position: waiting, duplicate: false, jobId: job.id };

  } else {
    // ─── Fallback: fila em memória ────────────────────────────────────
    const alreadyInQueue = memoryQueue.some(j => j.customer_id === customer_id);
    if (alreadyInQueue) {
      return { position: memoryQueue.findIndex(j => j.customer_id === customer_id) + 1, duplicate: true };
    }

    const retryCount = retryTracker.get(customer_id) || 0;
    if (retryCount >= 3) {
      console.log(`🚫 ${customer_id} já falhou ${retryCount}x. Não vai retentar.`);
      return { position: -1, duplicate: false, maxRetries: true };
    }

    const job = {
      customer_id, options,
      addedAt: new Date().toISOString(),
      status: 'waiting',
      attempt: retryCount + 1,
    };
    memoryQueue.push(job);
    console.log(`📋 FILA (memória): +1 lead (${customer_id}) | Posição: ${memoryQueue.length} | Tentativa: ${job.attempt}`);
    pushActivity('lead_received', customer_id, 'Lead adicionado à fila (memória)');
    return { position: memoryQueue.length, duplicate: false };
  }
}

// ─── Processar próximo da fila em memória (fallback) ─────────────────────────
export async function processNextMemoryQueue(processJobFn, onSuccess, onFailure) {
  if (redisAvailable) return; // BullMQ cuida disso
  if (isProcessingLock || currentJob || memoryQueue.length === 0) return;

  isProcessingLock = true;
  const job = memoryQueue.shift();
  job.status = 'processing';
  job.startedAt = new Date().toISOString();
  const jobCustomerId = job.customer_id;
  currentJob = { customer_id: jobCustomerId, startedAt: job.startedAt };

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 FILA (memória): Processando lead ${jobCustomerId}`);
  console.log('='.repeat(70));
  pushActivity('job_started', jobCustomerId, 'Automação iniciada');

  try {
    const result = await processJobFn(jobCustomerId, job.options);
    processedCount++;
    retryTracker.delete(jobCustomerId);
    pushActivity('job_finished', jobCustomerId, 'Automação concluída');
    if (onSuccess) await onSuccess(jobCustomerId, result);
  } catch (error) {
    failedCount++;
    const attempts = (retryTracker.get(jobCustomerId) || 0) + 1;
    retryTracker.set(jobCustomerId, attempts);
    pushActivity('job_failed', jobCustomerId, `Falha (${attempts}/3): ${error.message}`);
    if (attempts < 3) {
      memoryQueue.unshift({ ...job, attempt: attempts, addedAt: new Date().toISOString() });
      console.log(`   🔄 Re-enfileirado (${attempts}/3)`);
    }
    if (onFailure) await onFailure(jobCustomerId, error, attempts);
  } finally {
    recentlyProcessed.add(jobCustomerId);
    setTimeout(() => recentlyProcessed.delete(jobCustomerId), 5 * 60 * 1000);
    currentJob = null;
    isProcessingLock = false;
    setTimeout(() => processNextMemoryQueue(processJobFn, onSuccess, onFailure), 500);
  }
}

// ─── Status da fila ──────────────────────────────────────────────────────────
export async function getQueueStatus() {
  if (redisAvailable && bullQueue) {
    const counts = await bullQueue.getJobCounts().catch(() => ({}));
    return {
      backend: 'bullmq',
      currentJob: currentJob ? { customer_id: currentJob.customer_id, startedAt: currentJob.startedAt } : null,
      queueLength: counts.waiting || 0,
      stats: {
        processed: processedCount,
        failed: failedCount,
        processing: counts.active || 0,
        waiting: counts.waiting || 0,
        delayed: counts.delayed || 0,
      },
    };
  }
  return {
    backend: 'memory',
    currentJob: currentJob ? { customer_id: currentJob.customer_id, startedAt: currentJob.startedAt } : null,
    queueLength: memoryQueue.length,
    waiting: memoryQueue.map((j, i) => ({ position: i + 1, customer_id: j.customer_id, addedAt: j.addedAt })),
    stats: { processed: processedCount, failed: failedCount, processing: currentJob ? 1 : 0, waiting: memoryQueue.length },
  };
}

// ─── Limpar fila ─────────────────────────────────────────────────────────────
export async function clearQueue() {
  if (redisAvailable && bullQueue) {
    await bullQueue.obliterate({ force: true }).catch(() => {});
    console.log('🧹 BullMQ: fila obliterada');
  }
  memoryQueue.length = 0;
  retryTracker.clear();
  recentlyProcessed.clear();
  failedCount = 0;
}

// ─── Forçar reprocessamento ──────────────────────────────────────────────────
export function forceAllow(customer_id) {
  retryTracker.delete(customer_id);
  recentlyProcessed.delete(customer_id);
}

export function isRedisAvailable() { return redisAvailable; }
export function getProcessedCount() { return processedCount; }
export function getFailedCount() { return failedCount; }
export function getCurrentJob() { return currentJob; }
