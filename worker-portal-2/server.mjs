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

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Monta o link de validação de código (mesmo link da facial/contrato).
 * Padrão canônico do sistema iGreen:
 *   https://digital.igreenenergy.com.br/validacao-codigo/{idcliente}?id={consultor}&sendcontract=true
 *
 * É o mesmo URL usado pra:
 *   - Cliente digitar o código OTP (recebido via WhatsApp pelo backend iGreen)
 *   - Validação facial (Idwall)
 *   - Assinatura do contrato
 */
function buildValidationLink(idcliente, idconsultor) {
  return `https://digital.igreenenergy.com.br/validacao-codigo/${idcliente}?id=${idconsultor}&sendcontract=true`;
}

/**
 * Envia uma mensagem WhatsApp pro cliente com o link da validação.
 * Tenta Evolution API (instância do consultor) primeiro, depois Whapi como fallback.
 * Best-effort: erros são logados mas não quebram o cadastro.
 */
async function sendValidationLinkToCustomer(customerId, link) {
  if (!supabase || !customerId) return { skipped: 'no_supabase_or_customer_id' };

  // Carrega settings + customer + instance
  const [{ data: settingsRows }, { data: customer }] = await Promise.all([
    supabase.from('settings').select('*'),
    supabase
      .from('customers')
      .select('id, name, phone_whatsapp, consultant_id')
      .eq('id', customerId)
      .maybeSingle(),
  ]);
  if (!customer?.phone_whatsapp) return { skipped: 'no_phone' };

  const settings = {};
  settingsRows?.forEach(s => { settings[s.key] = s.value; });

  const phone = String(customer.phone_whatsapp).replace(/\D/g, '');
  const normalized = phone.startsWith('55') ? phone : `55${phone}`;
  const firstName = String(customer.name || '').trim().split(/\s+/)[0] || 'tudo bem';

  const text =
    `Oi ${firstName}! 🎉\n\n` +
    `📲 Você receberá em instantes uma mensagem da iGreen aqui no WhatsApp ` +
    `com um *código de verificação*.\n\n` +
    `Quando chegar, é só clicar no link abaixo e digitar o código:\n` +
    `${link}\n\n` +
    `No mesmo link você também faz a *validação facial* e a *assinatura do contrato*. ` +
    `Tudo em um lugar só! ✅`;

  // 1. Evolution API (instância do consultor)
  let instanceName = null;
  if (customer.consultant_id) {
    const { data: inst } = await supabase
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('consultant_id', customer.consultant_id)
      .limit(1)
      .maybeSingle();
    instanceName = inst?.instance_name || null;
  }
  const evoUrl = (settings.evolution_api_url || process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const evoKey = settings.evolution_api_key || process.env.EVOLUTION_API_KEY || '';
  if (evoUrl && evoKey && instanceName) {
    try {
      const r = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoKey },
        body: JSON.stringify({ number: normalized, text }),
      });
      if (r.ok) return { sent: 'evolution', instance: instanceName };
      console.warn(`  ⚠ evolution sendText ${r.status}`);
    } catch (e) {
      console.warn(`  ⚠ evolution send failed: ${e.message}`);
    }
  }

  // 2. Whapi fallback
  const whapiToken = settings.whapi_token || process.env.WHAPI_TOKEN || '';
  const whapiUrl = (settings.whapi_api_url || process.env.WHAPI_API_URL || 'https://gate.whapi.cloud').replace(/\/$/, '');
  if (whapiToken) {
    try {
      const r = await fetch(`${whapiUrl}/messages/text`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${whapiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: `${normalized}@s.whatsapp.net`, body: text, typing_time: 0 }),
      });
      if (r.ok) return { sent: 'whapi' };
      console.warn(`  ⚠ whapi sendText ${r.status}`);
    } catch (e) {
      console.warn(`  ⚠ whapi send failed: ${e.message}`);
    }
  }

  return { skipped: 'no_channel_configured' };
}

// ─── Job processor ──────────────────────────────────────────────────────────
async function processLead(job) {
  const { customer_id, dados } = job.data;
  console.log(`▶ [job ${job.id}] cadastrando customer=${customer_id} idconsultor=${dados.idconsultor}`);

  const c = new Portal2Client({ idconsultor: dados.idconsultor });
  try {
    const result = await c.cadastrarCliente(dados);
    console.log(`✓ [job ${job.id}] customer=${customer_id} → idcliente=${result.idcliente}`);

    // Link único de validação de código + facial + assinatura
    const validationLink = buildValidationLink(result.idcliente, dados.idconsultor);
    console.log(`  🔗 link: ${validationLink}`);

    // Persistir no banco (best-effort) — popula tanto colunas portal2_* quanto
    // campos canônicos (link_facial / link_assinatura) que o resto do sistema usa.
    if (supabase && customer_id) {
      const updates = {
        portal2_idcliente: result.idcliente,
        portal2_idsolcontratovalidacao: result.idsolcontratovalidacao,
        portal2_status: 'created',
        portal2_created_at: new Date().toISOString(),
        portal2_contract_link: validationLink,
        // Campos canônicos do sistema (já usados pelo CRM, painel, e mensagens
        // automáticas existentes). Manter em sync evita ter código duplicado
        // procurando o link por tipo de portal.
        link_facial: validationLink,
        link_assinatura: validationLink,
        igreen_link: validationLink,
        igreen_code: String(result.idcliente),
        status: 'awaiting_otp',
        conversation_step: 'aguardando_otp',
        portal_submitted_at: new Date().toISOString(),
      };
      await supabase.from('customers').update(updates).eq('id', customer_id).then(
        () => {},
        (e) => console.warn(`  ⚠ supabase update falhou: ${e.message}`),
      );
    }

    // Disparar geração de OTP (a iGreen manda WhatsApp pro cliente com o código)
    let otpGenerated = false;
    try {
      await c.generateVerificationCode(result.idcliente);
      otpGenerated = true;
      console.log(`  ✓ OTP requisitado pra customer=${customer_id} (cliente recebe via WhatsApp da iGreen)`);
      if (supabase && customer_id) {
        await supabase.from('customers').update({
          portal2_status: 'otp_sent',
          portal2_otp_sent_at: new Date().toISOString(),
        }).eq('id', customer_id).then(() => {}, () => {});
      }
    } catch (e) {
      console.warn(`  ⚠ falha ao gerar OTP: ${e.message}`);
    }

    // Mandar o link pro cliente via WhatsApp (mesmo link de OTP/facial/assinatura)
    try {
      const sendResult = await sendValidationLinkToCustomer(customer_id, validationLink);
      console.log(`  📲 link WhatsApp: ${JSON.stringify(sendResult)}`);
    } catch (e) {
      console.warn(`  ⚠ envio do link falhou: ${e.message}`);
    }

    return { success: true, validationLink, otpGenerated, ...result };
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
function buildRedisConn(forWorker = false) {
  try {
    const u = new URL(REDIS_URL);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password ? decodeURIComponent(u.password) : undefined,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      // Worker (blocking) precisa maxRetriesPerRequest=null; Queue não.
      maxRetriesPerRequest: forWorker ? null : 3,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 1000, 5000)),
    };
  } catch { return { host: 'evolution-api-redis', port: 6379 }; }
}

let queue = null;
let worker = null;
let queueAvailable = false;

async function initQueue() {
  try {
    queue = new Queue(QUEUE_NAME, { connection: buildRedisConn(false) });
    // suprime spam de erros de conexão antes de declararmos indisponível
    queue.on('error', (e) => {
      if (queueAvailable) console.warn(`  queue error: ${e.message}`);
    });
    await queue.getJobCounts();
    worker = new Worker(QUEUE_NAME, processLead, {
      connection: buildRedisConn(true), // ⚠️ worker exige maxRetriesPerRequest=null
      concurrency: 1, // 1 cadastro por vez (evita problemas com Playwright singleton)
      limiter: { max: 6, duration: 60_000 }, // máximo 6 cadastros/min
    });
    worker.on('error', (e) => {
      if (queueAvailable) console.warn(`  worker conn error: ${e.message}`);
    });
    worker.on('failed', (job, err) => console.error(`  worker fail job=${job?.id}: ${err.message}`));
    worker.on('completed', (job) => console.log(`  worker done job=${job.id}`));
    queueAvailable = true;
    const conn = buildRedisConn();
    console.log(`✅ BullMQ conectado (${conn.host}:${conn.port}) fila="${QUEUE_NAME}"`);
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
  let { customer_id, dados } = req.body || {};

  // Se não veio dados, busca do Supabase a partir do customer_id
  if (!dados && customer_id && supabase) {
    try {
      dados = await fetchDadosFromSupabase(customer_id);
      if (!dados) return res.status(404).json({ ok: false, error: 'customer não encontrado ou sem igreen_id do consultor' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: `falha ao buscar customer: ${e.message}` });
    }
  }

  if (!dados?.idconsultor) return res.status(400).json({ ok: false, error: 'dados.idconsultor obrigatório (ou customer_id válido)' });
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

// ─── Helper: monta payload a partir do customers do Supabase ─────────────────
async function fetchDadosFromSupabase(customerId) {
  const { data: c, error } = await supabase
    .from('customers')
    .select(`
      id,
      cpf, name, doc_holder_name, bill_holder_name,
      data_nascimento,
      phone_whatsapp,
      email,
      cep, address_street, address_number, address_complement,
      address_neighborhood, address_city, address_state,
      numero_instalacao, media_consumo, electricity_bill_value,
      distribuidora, debitos_aberto, possui_procurador,
      referral_partner_id, consultant_id,
      consultants:consultant_id(igreen_id, name, portal_kind),
      referral_partners:referral_partner_id(cli)
    `)
    .eq('id', customerId)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;
  const consultant = c.consultants;
  const partner = c.referral_partners;
  const igreenId = consultant?.igreen_id ? Number(consultant.igreen_id) : null;
  if (!igreenId) return null;

  // Estimativa de consumo médio (kWh) quando o customer só tem o valor da fatura
  // em R$. Tarifa média BR ~R$0,90/kWh em 2026 (varia 0.75-1.05 por distribuidora).
  // É só pra desbloquear o /bonus/rules — backend re-calcula com a fatura real.
  const TARIFA_MEDIA_KWH = 0.9;
  let consumoMedio = Number(c.media_consumo || 0);
  if (!consumoMedio) {
    const valorConta = Number(c.electricity_bill_value || 0);
    if (valorConta > 0) {
      consumoMedio = Math.max(50, Math.round(valorConta / TARIFA_MEDIA_KWH));
      console.log(`  ↳ media_consumo null; estimando ${consumoMedio} kWh a partir de R$${valorConta}`);
    }
  }

  return {
    idconsultor: igreenId,
    indcli: partner?.cli ? Number(partner.cli) : 0,
    cpf: c.cpf || '',
    nome: c.doc_holder_name || c.name || '',
    dataNascimento: c.data_nascimento || '',
    whatsapp: c.phone_whatsapp || '',
    email: c.email || '',
    cep: c.cep || '',
    endereco: c.address_street || '',
    numero: c.address_number || '',
    complemento: c.address_complement || '',
    bairro: c.address_neighborhood || '',
    cidade: c.address_city || '',
    uf: c.address_state || '',
    numeroInstalacao: c.numero_instalacao || '',
    consumoMedio,
    concessionaria: c.distribuidora || '',
    possuiPlacas: false,
    sendcontract: true,
  };
}

app.post('/confirm-otp', authRequired, async (req, res) => {
  const { idconsultor, idcliente, code, customer_id } = req.body || {};
  if (!idconsultor || !idcliente || !code) {
    return res.status(400).json({ ok: false, error: 'idconsultor, idcliente, code obrigatórios' });
  }
  try {
    const c = new Portal2Client({ idconsultor });
    const result = await c.validateVerificationCode({ idcliente, code });

    // Best-effort: atualiza estado no banco
    if (supabase && customer_id) {
      const validationLink = buildValidationLink(idcliente, idconsultor);
      await supabase.from('customers').update({
        portal2_status: 'otp_validated',
        portal2_otp_validated_at: new Date().toISOString(),
        portal2_contract_link: validationLink,
        link_assinatura: validationLink,
        otp_code: String(code).slice(0, 12),
        otp_validated_at: new Date().toISOString(),
        status: 'validating_otp',
        conversation_step: 'aguardando_facial',
      }).eq('id', customer_id).then(() => {}, () => {});
    }
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
