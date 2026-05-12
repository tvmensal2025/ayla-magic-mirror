// phase-logger.mjs — registra cada fase da automação na tabela worker_phase_logs
// Tolerante a falhas: NUNCA quebra a automação se o Supabase estiver indisponível.

import { createClient } from '@supabase/supabase-js';

const WORKER_VERSION = process.env.WORKER_VERSION || 'v11.2-2026.04.18';

let _client = null;
function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

const phaseStartTimes = new Map(); // `${customerId}:${phase}` → timestamp

export async function logPhase(customerId, phase, status, opts = {}) {
  const c = client();
  if (!c) return;
  try {
    const key = `${customerId}:${phase}`;
    let durationMs = opts.duration_ms ?? null;

    if (status === 'started') {
      phaseStartTimes.set(key, Date.now());
    } else if (durationMs == null && phaseStartTimes.has(key)) {
      durationMs = Date.now() - phaseStartTimes.get(key);
      phaseStartTimes.delete(key);
    }

    const row = {
      customer_id: customerId || null,
      phase,
      status,                     // 'started' | 'ok' | 'warn' | 'failed' | 'aborted' | 'soft-skip'
      message: opts.message ? String(opts.message).slice(0, 1000) : null,
      selector_used: opts.selector_used || null,
      screenshot_url: opts.screenshot_url || null,
      duration_ms: durationMs,
      attempt: opts.attempt || 1,
      worker_version: WORKER_VERSION,
    };
    await c.from('worker_phase_logs').insert(row);
  } catch (e) {
    // NUNCA quebrar automação por falha no logger
    console.warn(`[phase-logger] falha ao gravar ${phase}/${status}: ${e.message}`);
  }
}

export const WORKER_VERSION_TAG = WORKER_VERSION;
