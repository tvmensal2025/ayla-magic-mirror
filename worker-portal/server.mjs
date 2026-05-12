// Worker VPS - Servidor HTTP para automação do portal iGreen
//
// Endpoints:
// - POST /submit-lead    - Dispara automação Playwright
// - POST /confirm-otp    - Recebe código OTP (manual)
// - POST /webhook/whapi  - Recebe webhook do Whapi (WhatsApp)
// - GET  /otp/:id        - Playwright busca OTP
// - GET  /health         - Health check

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import dotenv from 'dotenv';
// Sentry — fallback caso a flag --import não seja suportada (Node < 20.6)
import * as Sentry from '@sentry/node';
// SOLUÇÃO 2: Import ESTÁTICO garante UMA ÚNICA instância do módulo (e do activeBrowser)
import { executarAutomacao } from './playwright-automation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON LOCK — Impede múltiplas instâncias do worker na mesma máquina
// ═══════════════════════════════════════════════════════════════════════════════
const LOCK_FILE = join(__dirname, '.worker.lock');
function acquireLock() {
  const myPid = process.pid;
  if (existsSync(LOCK_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
      // Verificar se o processo antigo ainda está vivo
      try { process.kill(oldPid, 0); /* processo existe */ 
        console.error(`\n🚫 OUTRA INSTÂNCIA JÁ ESTÁ RODANDO (PID ${oldPid}). Encerrando esta.`);
        console.error(`   Se isso é um erro, delete o arquivo: ${LOCK_FILE}`);
        process.exit(1);
      } catch (_) {
        // Processo morto — lock file órfão, podemos tomar
        console.warn(`⚠️  Lock file órfão encontrado (PID ${oldPid} morto). Assumindo controle.`);
      }
    } catch (_) {}
  }
  writeFileSync(LOCK_FILE, String(myPid));
  console.log(`🔒 Lock adquirido (PID ${myPid})`);
}
function releaseLock() {
  try { unlinkSync(LOCK_FILE); } catch (_) {}
}
acquireLock();

// Carregar variáveis de ambiente (.env.local da raiz do projeto)
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '.env') });
if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const app = express();
const PORT = process.env.PORT || 3100;
const SECRET = process.env.WORKER_SECRET || 'change-me-in-production';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Armazenar códigos OTP em memória (backup do Supabase)
const otpCodes = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE FILA - BullMQ (Redis) com fallback memória
// ═══════════════════════════════════════════════════════════════════════════════
import {
  initQueue, addToQueue, processNextMemoryQueue, getQueueStatus,
  clearQueue, forceAllow, pushActivity, getActivityLog,
  isRedisAvailable, getCurrentJob,
} from './queue-manager.mjs';

// ─── Função de processamento de job (usada pelo BullMQ e fallback memória) ──
async function processJob(customer_id, options) {
  const result = await executarAutomacao(customer_id, options);
  if (!result?.success) {
    throw new Error(result?.error || 'Automação terminou sem sucesso explícito');
  }

  const supabase = getSupabase();
  let finalStatus = null;
  if (supabase) {
    const { data: customerStatus } = await supabase
      .from('customers')
      .select('status, error_message')
      .eq('id', customer_id)
      .single();
    finalStatus = customerStatus?.status || null;
    if (!finalStatus || ['portal_submitting', 'automation_failed'].includes(finalStatus)) {
      throw new Error(`Automação não concluiu o lead no banco. Status final: ${finalStatus || 'desconhecido'}${customerStatus?.error_message ? ` | ${customerStatus.error_message}` : ''}`);
    }
  }
  return { ...result, finalStatus };
}

// ─── Callbacks pós-processamento (fallback memória) ─────────────────────────
async function onJobSuccess(customer_id, result) {
  console.log(`✅ FILA: Lead ${customer_id} processado com sucesso!`);
  if (result?.pageUrl) {
    try {
      const supabase = getSupabase();
      let alreadySent = false;
      if (supabase) {
        const { data: c } = await supabase.from('customers').select('link_facial').eq('id', customer_id).single();
        alreadySent = !!c?.link_facial;
      }
      if (!alreadySent) {
        await sendLinkToCustomer(customer_id, result.pageUrl);
      } else {
        console.log('   ⏭️  link_facial já gravado pelo automation — pulando envio duplicado');
      }
    } catch (linkErr) {
      console.warn(`   ⚠️ Falha ao decidir envio de link: ${linkErr.message}`);
    }
  }
}

async function onJobFailure(customer_id, error, attempts) {
  console.error(`❌ FILA: Lead ${customer_id} falhou (tentativa ${attempts}/3): ${error.message}`);
  try {
    Sentry.withScope((scope) => {
      scope.setTags({ module: 'playwright-automation', customer_id: String(customer_id), attempt: String(attempts) });
      Sentry.captureException(error);
    });
  } catch (_) {}
  if (attempts >= 3) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase.from('customers').update({
          status: 'automation_failed',
          error_message: `Tentativa ${attempts}/3: ${error.message}`,
          updated_at: new Date().toISOString(),
        }).eq('id', customer_id);
      } catch (_) {}
    }
  }
}

// ─── Helper: atualizar status no Supabase ────────────────────────────────────
async function supabaseSetSubmitting(customer_id) {
  const supabase = getSupabase();
  if (supabase) {
    await supabase.from('customers').update({
      status: 'portal_submitting',
      updated_at: new Date().toISOString(),
    }).eq('id', customer_id);
    console.log(`   ✅ Status → portal_submitting (CONFIRMADO no banco)`);
  }
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

const linkSentRecently = new Set();
const LINK_SENT_TTL_MS = 15 * 60 * 1000;

//
// Envia o link da página iGreen para o cliente via WhatsApp (Evolution API).
// Faz até 3 tentativas. Não reenvia se já enviou nos últimos 15 min.
///
async function sendLinkToCustomer(customerId, pageUrl) {
  if (linkSentRecently.has(customerId)) {
    console.log('   ⏭️  Link já enviado para este cliente recentemente; não reenviar.');
    return;
  }
  if (!pageUrl || typeof pageUrl !== 'string') {
    console.error('   ❌ sendLinkToCustomer: pageUrl inválido');
    pushActivity('link_failed', customerId, 'Link não enviado: URL inválida');
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    console.error('   ❌ sendLinkToCustomer: Supabase não configurado');
    pushActivity('link_failed', customerId, 'Link não enviado: Supabase indisponível');
    return;
  }
  try {
    // Buscar telefone do cliente e instância do consultor
    const { data: customer, error: errCustomer } = await supabase
      .from('customers')
      .select('phone_whatsapp, consultant_id')
      .eq('id', customerId)
      .single();
    if (errCustomer || !customer?.phone_whatsapp) {
      console.error('   ❌ sendLinkToCustomer: cliente ou phone não encontrado', errCustomer?.message || '');
      pushActivity('link_failed', customerId, 'Link não enviado: telefone não encontrado');
      return;
    }

    // Buscar instância Evolution do consultor
    let instanceName = null;
    if (customer.consultant_id) {
      const { data: inst } = await supabase
        .from('whatsapp_instances')
        .select('instance_name')
        .eq('consultant_id', customer.consultant_id)
        .limit(1)
        .single();
      instanceName = inst?.instance_name;
    }

    // Buscar settings para Evolution API
    const { data: settingsRows } = await supabase.from('settings').select('key, value');
    const settings = {};
    (settingsRows || []).forEach((s) => { settings[s.key] = s.value; });

    const evolutionUrl = (settings.evolution_api_url || process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const evolutionKey = settings.evolution_api_key || process.env.EVOLUTION_API_KEY || '';

    let phone = String(customer.phone_whatsapp).replace(/\D/g, '');
    if (phone && !phone.startsWith('55')) phone = '55' + phone;
    const remoteJid = phone ? `${phone}@s.whatsapp.net` : '';
    if (!remoteJid) {
      console.error('   ❌ sendLinkToCustomer: remoteJid vazio');
      pushActivity('link_failed', customerId, 'Link não enviado: número inválido');
      return;
    }

    const message = `✅ Cadastro finalizado!\n\nAcesse o link abaixo para continuar pelo celular:\n${pageUrl}\n\nQualquer dúvida, estamos à disposição.`;
    const maxAttempts = 3;
    const delayMs = 1500;
    let lastError = null;
    let sent = false;

    // Tentar enviar via Evolution API (preferido)
    if (evolutionUrl && evolutionKey && instanceName) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
            method: 'POST',
            headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: remoteJid, text: message }),
          });
          if (res.ok) {
            sent = true;
            break;
          }
          lastError = `Evolution ${res.status}: ${(await res.text()).substring(0, 100)}`;
        } catch (e) {
          lastError = e.message || String(e);
        }
        if (attempt < maxAttempts) {
          console.warn(`   ⚠️  Tentativa ${attempt}/${maxAttempts} falhou, retry em ${delayMs}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    // Fallback Whapi removido (token 401 morto). Se Evolution falhar, log + parar.

    if (sent) {
      linkSentRecently.add(customerId);
      setTimeout(() => linkSentRecently.delete(customerId), LINK_SENT_TTL_MS);
      console.log('   📤 Link da página enviado por WhatsApp para o cliente');
      pushActivity('link_sent', customerId, 'Link da página iGreen enviado');
    } else {
      console.error('   ❌ sendLinkToCustomer: falhou após todas as tentativas:', lastError);
      pushActivity('link_failed', customerId, `Link NÃO enviado: ${String(lastError).slice(0, 80)}`);
    }
  } catch (e) {
    console.error('   ❌ sendLinkToCustomer:', e.message);
    pushActivity('link_failed', customerId, `Link não enviado: ${e.message}`);
  }
}

// Middleware
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Middleware de autenticação (exceto health, OTP polling, e webhook)
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/dashboard' || req.path === '/status' || req.path.startsWith('/otp/') || req.path === '/webhook/whapi') {
    return next();
  }
  
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${SECRET}`) {
    console.warn('❌ Unauthorized request:', req.path);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

//
// POST /submit-lead
// Adiciona lead na fila de processamento (processa 1 por vez)
///
app.post('/submit-lead', async (req, res) => {
  const { customer_id, headless, stop_before_submit } = req.body;
  
  if (!customer_id) {
    return res.status(400).json({ error: 'customer_id required' });
  }

  const isHeadless = headless !== undefined ? Boolean(headless) : (process.env.HEADLESS === '1');
  const stopBeforeSubmit = Boolean(stop_before_submit);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📥 NOVO LEAD RECEBIDO`);
  console.log(`   Customer ID: ${customer_id}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  const result = await addToQueue(customer_id, { headless: isHeadless, stopBeforeSubmit }, supabaseSetSubmitting);
  if (!result.duplicate) pushActivity('lead_received', customer_id, 'Lead adicionado à fila (WhatsApp finalizou cadastro)');
  // Disparar processamento da fila em memória (se não estiver usando BullMQ)
  processNextMemoryQueue(processJob, onJobSuccess, onJobFailure);

  const status = await getQueueStatus();
  
  res.json({ 
    success: true, 
    message: result.duplicate 
      ? 'Lead já está na fila ou processando' 
      : `Lead adicionado na fila (posição ${result.position})`,
    customer_id,
    position: result.position,
    duplicate: result.duplicate,
    queue: {
      processing: status.currentJob?.customer_id || null,
      waiting: status.queueLength,
      totalProcessed: status.stats.processed,
    },
    timestamp: new Date().toISOString()
  });
});

//
// POST /clear-queue
// Zera a fila de leads (não cancela o job atual, mas nenhum novo será processado após ele)
///
app.post('/clear-queue', async (req, res) => {
  await clearQueue();
  const cj = getCurrentJob();
  pushActivity('queue_cleared', null, 'Fila zerada');
  console.log('🧹 FILA: zerada');
  res.json({
    success: true,
    message: 'Fila zerada',
    queueLength: 0,
    currentJob: cj ? cj.customer_id : null,
    timestamp: new Date().toISOString(),
  });
});

//
// POST /force-submit
// Força reenvio de lead ignorando retry limits
///
app.post('/force-submit', async (req, res) => {
  const { customer_id } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'customer_id required' });
  
  // Limpar bloqueios para este lead
  forceAllow(customer_id);
  
  const result = await addToQueue(customer_id, { headless: true }, supabaseSetSubmitting);
  processNextMemoryQueue(processJob, onJobSuccess, onJobFailure);
  pushActivity('force_submit', customer_id, 'Lead forçado na fila (retry limpo)');
  
  res.json({
    success: true,
    message: `Lead forçado na fila (posição ${result.position})`,
    customer_id,
    position: result.position,
    timestamp: new Date().toISOString(),
  });
});

//
// Recebe código OTP do WhatsApp e armazena para o script usar
//
app.post('/confirm-otp', async (req, res) => {
  const { customer_id, otp_code } = req.body;
  
  if (!customer_id || !otp_code) {
    return res.status(400).json({ 
      error: 'customer_id and otp_code required' 
    });
  }
  
  // Validar formato do código (4-8 dígitos)
  const codeClean = otp_code.replace(/\D/g, '');
  if (codeClean.length < 4 || codeClean.length > 8) {
    return res.status(400).json({ 
      error: 'OTP code must be 4-8 digits' 
    });
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔐 OTP RECEBIDO`);
  console.log(`   Customer ID: ${customer_id}`);
  console.log(`   Code: ${codeClean}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  // Armazenar código em memória (expira em 5 minutos)
  otpCodes.set(customer_id, {
    code: codeClean,
    timestamp: Date.now(),
    expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutos
  });
  
  // TAMBÉM salvar no Supabase (redundância - automação busca de ambos)
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('customers').update({
        otp_code: codeClean,
        otp_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', customer_id);
      console.log(`✅ OTP também salvo no Supabase`);
    } catch (e) {
      console.warn(`⚠️  Erro ao salvar OTP no Supabase: ${e.message}`);
    }
  }
  
  // Limpar códigos expirados
  cleanExpiredOtpCodes();
  
  res.json({ 
    success: true, 
    message: 'OTP code received and stored (memory + supabase)',
    customer_id,
    code: codeClean
  });
  
  console.log(`✅ OTP armazenado. Total de códigos em memória: ${otpCodes.size}`);
});

//
// GET /otp/:customer_id
// Retorna código OTP armazenado (usado pelo script Playwright)
// Verifica: 1) memória local, 2) Supabase
///
app.get('/otp/:customer_id', async (req, res) => {
  const { customer_id } = req.params;
  
  // 1. Verificar memória local
  const otpData = otpCodes.get(customer_id);
  if (otpData && Date.now() <= otpData.expiresAt) {
    console.log(`📤 OTP (memória) para ${customer_id}: ${otpData.code}`);
    return res.json({ 
      code: otpData.code,
      customer_id,
      source: 'memory',
      expiresAt: new Date(otpData.expiresAt).toISOString()
    });
  }
  
  // Limpar expirado
  if (otpData) otpCodes.delete(customer_id);
  
  // 2. Verificar Supabase
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('otp_code, otp_received_at, status')
        .eq('id', customer_id)
        .single();
      
      if (!error && data?.otp_code) {
        console.log(`📤 OTP (Supabase) para ${customer_id}: ${data.otp_code}`);
        return res.json({ 
          code: data.otp_code,
          customer_id,
          source: 'supabase',
          received_at: data.otp_received_at
        });
      }
    } catch (_) {}
  }
  
  return res.status(404).json({ 
    error: 'OTP code not found',
    customer_id,
    waiting: true
  });
});

// ─── Extrair OTP de mensagem WhatsApp ─────────────────────────────────────────
function extrairOTP(texto) {
  if (!texto || typeof texto !== 'string') return null;
  const textoLimpo = texto.trim();
  
  const padroes = [
    /(?:c[oó]digo|code|otp|token|verifica[cç][aã]o)[^\d]*(\d{4,8})/i,
    /c[oó]digo\s*:?\s*(\d{4,8})/i,
    /^(\d{4,8})$/,
    /\b(\d{4,8})\b/,
  ];

  for (const padrao of padroes) {
    const match = textoLimpo.match(padrao);
    if (match && match[1] && match[1].length >= 4 && match[1].length <= 8) {
      return match[1];
    }
  }
  return null;
}

//
// POST /webhook/whapi
// Recebe mensagens do Whapi (WhatsApp) e extrai OTP
///
app.post('/webhook/whapi', async (req, res) => {
  try {
    const payload = req.body;
    
    console.log('\n' + '='.repeat(70));
    console.log('📩 WEBHOOK WHAPI RECEBIDO');
    console.log('='.repeat(70));
    console.log(`Payload: ${JSON.stringify(payload).substring(0, 500)}`);

    const messages = payload.messages || 
                     (payload.message ? [payload.message] : []) ||
                     (payload.data?.messages || []);

    if (messages.length === 0) {
      return res.status(200).json({ ok: true, processed: 0 });
    }

    let processadas = 0;
    const supabase = getSupabase();

    for (const msg of messages) {
      // Ignora mensagens enviadas por nós
      if (msg.from_me || msg.fromMe) continue;

      // Apenas texto
      const tipoMensagem = msg.type || msg.message?.type;
      if (tipoMensagem !== 'text' && tipoMensagem !== 'conversation') continue;

      const texto = msg.text?.body || msg.body || msg.conversation || 
                    msg.message?.conversation || msg.message?.text?.body || '';
      const remetente = msg.from || msg.chat_id || msg.chatId || '';

      console.log(`📱 De: ${remetente} | Texto: "${texto}"`);

      if (!texto || !remetente) continue;

      const otpCode = extrairOTP(texto);
      if (!otpCode) {
        console.log('   ⏭️  Sem OTP na mensagem');
        continue;
      }

      console.log(`   🔑 OTP extraído: ${otpCode}`);

      if (!supabase) {
        console.warn('   ⚠️  Supabase não configurado');
        continue;
      }

      // Buscar cliente pelo telefone
      const digits = remetente.replace(/\D/g, '');
      const phoneVariants = [
        digits.slice(-11),
        digits.slice(-13),
        digits,
      ].filter(q => q.length >= 10);

      const { data: customer, error } = await supabase
        .from('customers')
        .select('id, name, status, phone_whatsapp')
        .or(phoneVariants.map(q => `phone_whatsapp.ilike.%${q}`).join(','))
        .in('status', ['awaiting_otp', 'portal_submitting'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !customer) {
        console.log(`   ⚠️  Nenhum cliente aguardando OTP para ${remetente}`);
        continue;
      }

      // Salvar OTP no Supabase
      await supabase.from('customers').update({
        otp_code: otpCode,
        otp_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', customer.id);

      // Também salvar em memória (backup)
      otpCodes.set(customer.id, {
        code: otpCode,
        timestamp: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000)
      });

      console.log(`   ✅ OTP salvo para ${customer.name} (${customer.id})`);
      processadas++;
    }

    res.status(200).json({ ok: true, processed: processadas });

  } catch (error) {
    console.error('❌ Erro no webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
});

//
// GET /health
// Health check endpoint
///
//
// GET /screenshots/:customerId
// Lista screenshots de uma execução (para diagnóstico)
///
app.get('/screenshots/:customerId', async (req, res) => {
  const { customerId } = req.params;
  try {
    const { readdirSync } = await import('fs');
    const files = readdirSync('./screenshots')
      .filter(f => f.includes(customerId))
      .sort();
    res.json({ customerId, screenshots: files, total: files.length });
  } catch (e) {
    res.json({ customerId, screenshots: [], error: e.message });
  }
});

//
// GET /screenshot/:filename
// Serve um screenshot específico
///
app.get('/screenshot/:filename', async (req, res) => {
  const { filename } = req.params;
  const { join } = await import('path');
  const { existsSync } = await import('fs');
  const filepath = join('./screenshots', filename);
  if (!existsSync(filepath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filepath, { root: '.' });
});

//
// GET /page-dump/:customerId
// Retorna o HTML salvo da última execução (para diagnóstico)
///
app.get('/page-dump/:customerId', async (req, res) => {
  const { customerId } = req.params;
  try {
    const { readdirSync, readFileSync } = await import('fs');
    const files = readdirSync('./screenshots')
      .filter(f => f.includes(customerId) && f.endsWith('.html'))
      .sort()
      .reverse();
    if (files.length === 0) return res.json({ error: 'No HTML dumps found' });
    const content = readFileSync(`./screenshots/${files[0]}`, 'utf-8');
    res.json({ file: files[0], contentLength: content.length, content: content.substring(0, 50000) });
  } catch (e) {
    res.json({ error: e.message });
  }
});

//
// GET /queue
// Mostra status completo da fila de processamento
///
app.get('/queue', async (req, res) => {
  res.json(await getQueueStatus());
});

//
// GET /status
// JSON com fila + últimas atividades (por que abriu, etc.) - sem auth para ver no navegador
///
app.get('/status', async (req, res) => {
  const status = await getQueueStatus();
  res.json({
    timestamp: new Date().toISOString(),
    queue: status,
    activities: getActivityLog().slice(-30).reverse(),
    whyItOpens: 'O navegador abre quando um lead finaliza no WhatsApp (POST /submit-lead) ou quando o worker encontra leads pendentes no banco (polling a cada 5s).',
  });
});

//
// GET /dashboard
// Página HTML simples para ver o que está acontecendo (sem auth)
///
app.get('/dashboard', async (req, res) => {
  const status = await getQueueStatus();
  const activities = getActivityLog().slice(-25).reverse();
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Status - Automação iGreen</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 700px; margin: 24px auto; padding: 0 16px; }
    h1 { color: #0d9488; }
    .card { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .activity { font-size: 14px; margin: 6px 0; padding: 6px; background: #fff; border-radius: 4px; }
    .time { color: #64748b; font-size: 12px; }
    .event { font-weight: 600; }
    code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
    p { color: #475569; }
  </style>
</head>
<body>
  <h1>Status da automação</h1>
  <div class="card">
    <p><strong>Por que o navegador abre sozinho?</strong></p>
    <p>Quando um cliente finaliza o cadastro no WhatsApp, o sistema envia o lead para o worker. O worker abre o navegador, preenche o portal iGreen e clica em Finalizar. A <strong>página do iGreen permanece aberta</strong> para você conferir (não fechamos mais).</p>
  </div>
  <div class="card">
    <p><strong>Agora:</strong></p>
    <p>Processando: ${status.currentJob ? status.currentJob.customer_id : '—'}</p>
    <p>Na fila: ${status.queueLength} | Concluídos: ${status.stats.processed} | Falhas: ${status.stats.failed}</p>
  </div>
  <h2>Últimas atividades</h2>
  ${activities.length ? activities.map(a => `
  <div class="activity">
    <span class="time">${a.at}</span>
    <span class="event">${a.event}</span>
    ${a.customer_id ? `<code>${a.customer_id}</code>` : ''}
    ${a.message ? ` — ${a.message}` : ''}
  </div>`).join('') : '<p>Nenhuma atividade ainda.</p>'}
  <p style="margin-top: 24px;"><a href="/status">Ver JSON completo (/status)</a></p>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

//
// GET /health
// Health check endpoint
///
app.get('/health', async (req, res) => {
  const status = await getQueueStatus();
  res.json({ 
    status: 'ok',
    service: 'worker-portal',
    version: process.env.WORKER_VERSION || '5.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    otpCodesInMemory: otpCodes.size,
    supabaseConfigured: !!(SUPABASE_URL && SUPABASE_KEY),
    queueBackend: status.backend || 'memory',
    queue: status.stats,
    currentJob: status.currentJob,
  });
});

//
// GET /debug/version - Confirma se rebuild v10.1 foi aplicado
///
app.get('/debug/version', async (req, res) => {
  let hasPoppler = false;
  let popplerVersion = null;
  try {
    const { execSync } = await import('child_process');
    const out = execSync('pdftoppm -v 2>&1 || true', { encoding: 'utf-8' }).trim();
    hasPoppler = out.toLowerCase().includes('pdftoppm') || out.toLowerCase().includes('poppler');
    popplerVersion = out.split('\n')[0] || null;
  } catch (_) {}

  let hasPhaseLogger = false;
  try {
    const { existsSync } = await import('fs');
    hasPhaseLogger = existsSync('./phase-logger.mjs');
  } catch (_) {}

  res.json({
    worker_version: process.env.WORKER_VERSION || '5.1.0',
    expected_version: 'v10.1-2026.04.18',
    is_v10_or_newer: (process.env.WORKER_VERSION || '').startsWith('v10'),
    has_poppler: hasPoppler,
    poppler_version: popplerVersion,
    has_phase_logger: hasPhaseLogger,
    has_findFieldFast: true,
    confirme_celular_optional: true,
    node_version: process.version,
    timestamp: new Date().toISOString(),
  });
});


//
// Limpar códigos OTP expirados
///
function cleanExpiredOtpCodes() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [customerId, otpData] of otpCodes.entries()) {
    if (now > otpData.expiresAt) {
      otpCodes.delete(customerId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Limpeza: ${cleaned} código(s) OTP expirado(s) removido(s)`);
  }
}

// Limpar códigos expirados a cada 1 minuto
setInterval(cleanExpiredOtpCodes, 60 * 1000);

//
// Busca leads pendentes: data_complete + portal_submitting travados (>2 min).
// Roda na inicialização e a cada 5 segundos.
///
async function recuperarLeadsPendentes() {
  // Não rodar polling enquanto tem job processando
  const cj = getCurrentJob();
  if (cj) return;

  const supabase = getSupabase();
  if (!supabase) {
    console.log('⚠️  Supabase não configurado - não é possível recuperar leads pendentes');
    return;
  }

  try {
    // Buscar leads que precisam ser processados:
    // 1) data_complete: dados coletados, aguardando automação
    // 2) portal_submitting travados (>2 min): nunca abriu (worker reiniciou/crashou)
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: leadsComplete, error: err1 } = await supabase
      .from('customers')
      .select('id, name, status, conversation_step, created_at, updated_at')
      .eq('status', 'data_complete')
      .order('updated_at', { ascending: true })
      .limit(5);
    const { data: leadsStuck, error: err2 } = await supabase
      .from('customers')
      .select('id, name, status, conversation_step, created_at, updated_at')
      .eq('status', 'portal_submitting')
      .lt('updated_at', twoMinAgo)
      .order('updated_at', { ascending: true })
      .limit(3);

    if (err1 || err2) {
      console.error('❌ Erro ao buscar leads pendentes:', err1?.message || err2?.message);
      return;
    }
    const leads = [...(leadsComplete || []), ...(leadsStuck || [])];
    if (leadsStuck?.length > 0) {
      console.log(`🔧 Recuperando ${leadsStuck.length} lead(s) travados em portal_submitting (>2 min)`);
    }
    if (!leads || leads.length === 0) return;

    console.log(`\n🔍 Encontrados ${leads.length} lead(s) pendente(s) no banco:`);
    let adicionados = 0;
    for (const lead of leads) {
      const result = await addToQueue(lead.id, { headless: process.env.HEADLESS === '1' }, supabaseSetSubmitting);
      if (!result.duplicate) {
        console.log(`   📋 ${lead.name || 'Sem nome'} (${lead.id}) [${lead.status}] → posição ${result.position}`);
        adicionados++;
      }
    }
    if (adicionados > 0) {
      console.log(`✅ ${adicionados} lead(s) adicionado(s) na fila automaticamente`);
      processNextMemoryQueue(processJob, onJobSuccess, onJobFailure);
    }
  } catch (e) {
    console.error('❌ Erro na recuperação de leads:', e.message);
  }
}

// Polling: verificar leads pendentes a cada 5 segundos (fallback se webhook não chamar)
setInterval(recuperarLeadsPendentes, 5 * 1000);

// Sentry: handler de erros do Express. Deve vir DEPOIS de todas as rotas
// e ANTES de qualquer outro middleware de erro.
try { Sentry.setupExpressErrorHandler(app); } catch (_) {}

// Fallback error handler — captura qualquer erro não tratado
app.use((err, _req, res, _next) => {
  try { Sentry.captureException(err); } catch (_) {}
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ error: err?.message || 'Internal error' });
});

// Iniciar servidor
app.listen(PORT, async () => {
  // Inicializar BullMQ (tenta conectar ao Redis, fallback pra memória)
  await initQueue(processJob).catch((e) => {
    console.warn(`⚠️  Erro ao inicializar BullMQ: ${e.message}. Usando fila em memória.`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('🚀 WORKER VPS - PORTAL IGREEN v5.1 (1 BROWSER GARANTIDO)');
  console.log('='.repeat(70));
  console.log(`📡 Servidor rodando na porta: ${PORT}`);
  console.log(`🔐 Autenticação: Bearer ${SECRET.substring(0, 10)}...`);
  console.log(`🗄️  Supabase: ${SUPABASE_URL ? '✅' : '❌ NÃO CONFIGURADO'}`);
  console.log(`📋 Sistema de FILA ativo: processa 1 lead por vez`);
  console.log(`🔒 Proteções: mutex + recentlyProcessed + await update`);
  console.log(`📋 Auto-recuperação: busca leads pendentes a cada 5s`);
  console.log(`\n📋 Endpoints disponíveis:`);
  console.log(`   POST /submit-lead     - Adicionar lead na fila`);
  console.log(`   POST /clear-queue     - Zerar fila (parar fluxo)`);
  console.log(`   POST /confirm-otp     - Confirmar código OTP (manual)`);
  console.log(`   POST /webhook/whapi   - Webhook do Whapi (WhatsApp)`);
  console.log(`   GET  /otp/:id         - Buscar código OTP`);
  console.log(`   GET  /queue           - Ver status da fila`);
  console.log(`   GET  /status          - Fila + últimas atividades (JSON)`);
  console.log(`   GET  /dashboard       - Página com o que está acontecendo`);
  console.log(`   GET  /health          - Health check`);
  console.log('\n' + '='.repeat(70));
  console.log(`✅ Pronto para receber requisições!\n`);

  // Limpar processos Chromium órfãos na inicialização
  try {
    import('child_process').then(({ execSync }) => {
      execSync('pkill -9 -f "Google Chrome for Testing" 2>/dev/null || true', { stdio: 'ignore' });
      console.log('🧹 Processos Chromium órfãos limpos na inicialização');
    }).catch(() => {});
  } catch (_) {}

  // Recuperar leads pendentes na inicialização (1.5s - tempo suficiente pra subir)
  setTimeout(recuperarLeadsPendentes, 1500);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown — espera job atual terminar antes de encerrar
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n⏸️  ${signal} recebido.`);
  
  if (getCurrentJob()) {
    console.log(`   ⏳ Aguardando job atual terminar (${getCurrentJob().customer_id})...`);
    const maxWait = 120000;
    const start = Date.now();
    while (getCurrentJob() && (Date.now() - start) < maxWait) {
      await new Promise(r => setTimeout(r, 1000));
    }
    if (getCurrentJob()) {
      console.warn(`   ⚠️  Timeout esperando job. Encerrando forçado.`);
    } else {
      console.log(`   ✅ Job finalizado. Encerrando limpo.`);
    }
  }
  
  releaseLock();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
