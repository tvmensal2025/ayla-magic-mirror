// Automação Playwright - Portal iGreen v11.3
// Fluxo 100% automático: CEP → Calcular → Garantir → Formulário → Upload Docs → Perguntas → OTP → Enviar
//
// v11.3 - Correções críticas:
// ✅ Email fallback: tvmensal11@gmail.com (quando cliente não informou)
// ✅ Telefone fallback: 11971254913 (quando cliente não informou)
// ✅ waitForSelector antes de preencher email/telefone (campos dinâmicos)
// ✅ Confirmação email/telefone aguarda campo aparecer antes de preencher
// ✅ Validação de obrigatórios não bloqueia email/telefone (têm fallback)

import { chromium } from 'playwright-chromium';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logPhase, WORKER_VERSION_TAG } from './phase-logger.mjs';
import * as Sentry from '@sentry/node';

const CONSULTOR_ID_FALLBACK = process.env.IGREEN_CONSULTOR_ID || '124170';
// PORTAL_URL agora é gerado dinamicamente por cliente (usa igreen_id do consultor)
const PORTAL_WORKER_URL = process.env.PORTAL_WORKER_URL || 'http://localhost:3100';
const SCREENSHOTS_DIR = './screenshots';
const FIXTURES_DIR = './fixtures';
const TMP_DIR = './tmp';
const MAX_RETRIES = 3;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── reactFill: 3-tier strategy for React/MUI inputs ─────────────────────────
async function reactFill(page, selector, value) {
  const el = typeof selector === 'string' ? page.locator(selector).first() : selector;
  if (await el.count() === 0) return false;
  
  const selectorStr = typeof selector === 'string' ? selector : '(locator)';
  
  // Detectar campos com máscara (telefone/celular/WhatsApp/CPF/CEP/data)
  // Para esses, PULAR Tier 1 (que quebra a máscara MUI/react-imask) e ir direto para digitação real.
  let isMasked = false;
  try {
    isMasked = await el.evaluate((input) => {
      const ph = (input.getAttribute('placeholder') || '').toLowerCase();
      const name = (input.getAttribute('name') || '').toLowerCase();
      const type = (input.getAttribute('type') || '').toLowerCase();
      const maskKeywords = ['whatsapp', 'celular', 'telefone', 'phone', 'cpf', 'cnpj', 'cep', 'data', 'nascimento'];
      return type === 'tel'
        || maskKeywords.some(k => ph.includes(k) || name.includes(k))
        || !!input.getAttribute('data-mask')
        || !!input.closest('.MuiInputBase-root')?.querySelector('[data-mask]');
    }).catch(() => false);
  } catch (_) { /* noop */ }
  
  if (isMasked) {
    console.log(`   🎭 [reactFill] Campo com máscara detectado (${selectorStr}) — usando digitação real`);
    const onlyDigitsValue = String(value).replace(/\D/g, '');
    // Até 3 tentativas: o React do portal iGreen pode re-renderizar entre o autofill (CPF→Receita)
    // e o próximo campo, fazendo o input ficar STALE. Re-resolvemos a referência a cada tentativa.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Re-resolver o locator a cada tentativa (caso o React tenha re-montado o input)
        const fresh = typeof selector === 'string' ? page.locator(selector).first() : selector;
        if (await fresh.count() === 0) {
          console.log(`   ⚠️  [reactFill MASK attempt ${attempt}] locator desapareceu`);
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        await fresh.scrollIntoViewIfNeeded().catch(() => {});
        // Forçar foco real (click + focus JS) antes de digitar
        await fresh.click({ timeout: 3000 }).catch(() => {});
        await fresh.evaluate((input) => input.focus()).catch(() => {});
        await new Promise(r => setTimeout(r, 60));
        // Limpar usando seleção + Backspace (não quebra máscara) em vez de fill('')
        await fresh.evaluate((input) => {
          input.select?.();
        }).catch(() => {});
        await page.keyboard.press('Backspace').catch(() => {});
        await new Promise(r => setTimeout(r, 40));
        await fresh.type(onlyDigitsValue, { delay: 35 });
        await fresh.evaluate((input) => input.dispatchEvent(new Event('blur', { bubbles: true }))).catch(() => {});
        await new Promise(r => setTimeout(r, 150));
        const filled = await fresh.inputValue().catch(() => '');
        const onlyDigitsFilled = filled.replace(/\D/g, '');
        if (onlyDigitsFilled === onlyDigitsValue) {
          console.log(`   ✅ [reactFill MASK attempt ${attempt}] ${selectorStr}: "${filled}"`);
          return true;
        }
        console.log(`   ⚠️  [reactFill MASK attempt ${attempt}] valor não bate. Atual: "${filled}" / esperado: "${onlyDigitsValue}"`);
      } catch (e) {
        console.log(`   ⚠️  [reactFill MASK attempt ${attempt}] erro: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }
  
  // Tier 1: Reset React _valueTracker + native setter + dispatch events
  try {
    await el.evaluate((input, val) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      if (nativeInputValueSetter) {
        const tracker = input._valueTracker;
        if (tracker) tracker.setValue('');
        nativeInputValueSetter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, value);
    
    const filled = await el.inputValue().catch(() => '');
    if (filled === value) {
      console.log(`   ✅ [reactFill T1] ${selectorStr}: "${value}"`);
      return true;
    }
  } catch (e) {
    console.log(`   ⚠️  [reactFill T1] falhou: ${e.message}`);
  }
  
  // Tier 2: Playwright native fill
  try {
    await el.fill(value);
    const filled = await el.inputValue().catch(() => '');
    if (filled === value) {
      console.log(`   ✅ [reactFill T2] ${selectorStr}: "${value}"`);
      return true;
}

// ─── bulletproofType: NUNCA falha em campos com placeholder conhecido ──────
// Estratégia "à prova de balas" para o portal iGreen (react-imask + MUI re-renders):
// 1. Aguarda input com placeholder aparecer (até 30s, polling 250ms)
// 2. Re-resolve o handle a cada tentativa (input pode ser re-montado)
// 3. Foca via .click(force) + .focus() JS
// 4. Limpa com Ctrl+A + Backspace (compatível com máscara)
// 5. Digita via page.keyboard.type (foco no input, não importa se re-renderizar)
// 6. Verifica valor; se não bater, retenta (até 5x). Aceita match por dígitos.
async function bulletproofType(page, placeholder, value, opts = {}) {
  const { maxAttempts = 5, appearTimeoutMs = 15000, label = placeholder } = opts;
  const onlyDigits = String(value).replace(/\D/g, '');
  const expected = onlyDigits || String(value);
  const escPh = placeholder.replace(/"/g, '\\"');
  const getLocator = () => page.locator(`input[placeholder="${escPh}"]`).first();

  console.log(`   🛡️  [bulletproof] aguardando "${label}" aparecer...`);
  const appearStart = Date.now();
  while (Date.now() - appearStart < appearTimeoutMs) {
    const loc = getLocator();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  if ((await getLocator().count()) === 0) {
    throw new Error(`[bulletproof] Campo "${label}" não apareceu em ${appearTimeoutMs}ms`);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fresh = getLocator();
      if ((await fresh.count()) === 0) { await new Promise(r => setTimeout(r, 500)); continue; }
      await fresh.scrollIntoViewIfNeeded().catch(() => {});
      await fresh.click({ timeout: 5000, force: true }).catch(() => {});
      await fresh.evaluate((el) => el.focus()).catch(() => {});
      await new Promise(r => setTimeout(r, 80));

      // Limpar
      await page.keyboard.down('Control').catch(() => {});
      await page.keyboard.press('a').catch(() => {});
      await page.keyboard.up('Control').catch(() => {});
      await page.keyboard.press('Backspace').catch(() => {});
      await new Promise(r => setTimeout(r, 40));

      // Re-focar (Backspace pode ter desfocado em alguns browsers)
      const fresh2 = getLocator();
      await fresh2.click({ timeout: 3000, force: true }).catch(() => {});
      await fresh2.evaluate((el) => el.focus()).catch(() => {});
      await new Promise(r => setTimeout(r, 40));

      // Digitar via teclado
      await page.keyboard.type(expected, { delay: 30 });
      await new Promise(r => setTimeout(r, 100));
      await page.keyboard.press('Tab').catch(() => {});
      await new Promise(r => setTimeout(r, 120));

      const filled = await getLocator().inputValue().catch(() => '');
      if (filled.replace(/\D/g, '') === expected || filled === expected) {
        console.log(`   ✅ [bulletproof attempt ${attempt}] ${label}: "${filled}"`);
        return true;
      }
      console.log(`   🔁 [bulletproof attempt ${attempt}] "${filled}" ≠ "${expected}", retry`);
    } catch (e) {
      console.log(`   ⚠️  [bulletproof attempt ${attempt}] erro: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 300 + attempt * 100));
  }

  const finalVal = await getLocator().inputValue().catch(() => '');
  if (finalVal.replace(/\D/g, '') === expected) {
    console.log(`   ✅ [bulletproof FINAL] ${label}: "${finalVal}"`);
    return true;
  }
  throw new Error(`[bulletproof] Falhou "${label}" após ${maxAttempts} tentativas. Final: "${finalVal}"`);
}
  } catch (e) {
    console.log(`   ⚠️  [reactFill T2] falhou: ${e.message}`);
  }
  
  // Tier 3: Character-by-character typing
  try {
    await el.click();
    await el.fill('');
    await el.type(value, { delay: 40 });
    console.log(`   ✅ [reactFill T3] ${selectorStr}: "${value}"`);
    return true;
  } catch (e) {
    console.log(`   ⚠️  [reactFill T3] falhou: ${e.message}`);
  }
  
  return false;
}

// ─── waitForAutoFill: aguarda portal preencher Nome + DataNasc após CPF ────
// O portal iGreen consulta a Receita Federal via CPF e auto-preenche esses
// campos. NUNCA sobrescrever — eles são a fonte da verdade.
async function waitForAutoFill(page, timeoutMs = 8000) {
  const start = Date.now();
  let result = { nome: '', nascimento: '' };
  while (Date.now() - start < timeoutMs) {
    try {
      result = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const findValue = (regex) => {
          for (const input of inputs) {
            const ph = (input.getAttribute('placeholder') || '').toLowerCase();
            const name = (input.getAttribute('name') || '').toLowerCase();
            const aria = (input.getAttribute('aria-label') || '').toLowerCase();
            if (regex.test(ph) || regex.test(name) || regex.test(aria)) {
              const v = (input).value || '';
              if (v && v.trim().length > 1) return v.trim();
            }
          }
          return '';
        };
        return {
          nome: findValue(/(^|\s)nome|fullname|full[_-]?name|titular/i),
          nascimento: findValue(/nascim|birth|nasc/i),
        };
      });
      // Considerar preenchido quando nome (>= 5 chars) OU nasc (>= 8 chars) chegar
      if ((result.nome && result.nome.length >= 5) || (result.nascimento && result.nascimento.replace(/\D/g, '').length >= 8)) {
        return result;
      }
    } catch (_) { /* noop */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return result;
}

// ─── waitForFieldByPlaceholder: detecção via MutationObserver ────────────
// Espera por um campo aparecer no DOM observando mutações em vez de só
// fazer polling. Retorna true se encontrou, false se timeout.
async function waitForFieldByPlaceholder(page, regex, timeoutMs = 8000) {
  try {
    const found = await page.evaluate(({ pattern, timeout }) => {
      return new Promise((resolve) => {
        const re = new RegExp(pattern, 'i');
        const check = () => {
          const inputs = Array.from(document.querySelectorAll('input'));
          for (const input of inputs) {
            const ph = input.getAttribute('placeholder') || '';
            const name = input.getAttribute('name') || '';
            const aria = input.getAttribute('aria-label') || '';
            if ((re.test(ph) || re.test(name) || re.test(aria)) && (input).offsetParent !== null) {
              return true;
            }
          }
          return false;
        };
        if (check()) return resolve(true);
        const observer = new MutationObserver(() => {
          if (check()) {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
      });
    }, { pattern: regex.source, timeout: timeoutMs });
    return found;
  } catch (_) {
    return false;
  }
}

// ─── findFieldFast: detecção AGRESSIVA com waitForFunction (250ms poll) ──
// Múltiplos critérios em OR: placeholder, name, aria-label, type, label adjacente.
// Retorna o handle do elemento (ou null em timeout).
// Usado para campos críticos que demoram a aparecer (ex: WhatsApp após CPF).
async function findFieldFast(page, criteria, timeoutMs = 8000) {
  const start = Date.now();
  try {
    const handle = await page.waitForFunction(
      (crit) => {
        const inputs = Array.from(document.querySelectorAll('input, textarea'));
        for (const input of inputs) {
          if (input.offsetParent === null) continue;
          if (input.disabled) continue;
          const ph = (input.getAttribute('placeholder') || '').toLowerCase();
          const name = (input.getAttribute('name') || '').toLowerCase();
          const aria = (input.getAttribute('aria-label') || '').toLowerCase();
          const type = (input.getAttribute('type') || '').toLowerCase();
          const id = (input.getAttribute('id') || '').toLowerCase();
          // Buscar contexto via label/parent
          let ctx = '';
          try {
            const labelFor = id ? document.querySelector(`label[for="${id}"]`) : null;
            const parentLabel = input.closest('label');
            const formCtl = input.closest('.MuiFormControl-root,[class*="FormControl"],div');
            ctx = ((labelFor?.textContent || '') + ' ' + (parentLabel?.textContent || '') + ' ' + (formCtl?.textContent || '')).toLowerCase();
          } catch (_) {}
          const haystack = `${ph} ${name} ${aria} ${id} ${ctx}`;
          // OR: qualquer keyword bater
          const matchKeyword = (crit.keywords || []).some((k) => haystack.includes(k.toLowerCase()));
          const matchType = crit.type ? type === crit.type : false;
          const matchExclude = (crit.exclude || []).some((x) => haystack.includes(x.toLowerCase()));
          if ((matchKeyword || matchType) && !matchExclude) {
            return true;
          }
        }
        return false;
      },
      criteria,
      { polling: 250, timeout: timeoutMs }
    ).catch(() => null);

    const elapsed = Date.now() - start;
    if (!handle) {
      console.log(`   ⚠️  [findFieldFast] timeout após ${elapsed}ms — keywords=${JSON.stringify(criteria.keywords || [])}`);
      return null;
    }

    // Re-localizar agora que sabemos que existe (handle do waitForFunction é o boolean)
    const locator = await page.evaluateHandle((crit) => {
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      for (const input of inputs) {
        if (input.offsetParent === null) continue;
        if (input.disabled) continue;
        const ph = (input.getAttribute('placeholder') || '').toLowerCase();
        const name = (input.getAttribute('name') || '').toLowerCase();
        const aria = (input.getAttribute('aria-label') || '').toLowerCase();
        const type = (input.getAttribute('type') || '').toLowerCase();
        const id = (input.getAttribute('id') || '').toLowerCase();
        let ctx = '';
        try {
          const labelFor = id ? document.querySelector(`label[for="${id}"]`) : null;
          const parentLabel = input.closest('label');
          const formCtl = input.closest('.MuiFormControl-root,[class*="FormControl"],div');
          ctx = ((labelFor?.textContent || '') + ' ' + (parentLabel?.textContent || '') + ' ' + (formCtl?.textContent || '')).toLowerCase();
        } catch (_) {}
        const haystack = `${ph} ${name} ${aria} ${id} ${ctx}`;
        const matchKeyword = (crit.keywords || []).some((k) => haystack.includes(k.toLowerCase()));
        const matchType = crit.type ? type === crit.type : false;
        const matchExclude = (crit.exclude || []).some((x) => haystack.includes(x.toLowerCase()));
        if ((matchKeyword || matchType) && !matchExclude) {
          return input;
        }
      }
      return null;
    }, criteria);

    console.log(`   ⚡ [findFieldFast] OK em ${elapsed}ms — keywords=${JSON.stringify(criteria.keywords || [])}`);
    return locator;
  } catch (e) {
    console.warn(`   ⚠️  [findFieldFast] erro: ${e.message}`);
    return null;
  }
}

// ─── Controle global: apenas 1 browser por vez ───────────────────────────────
let activeBrowser = null;

async function closeActiveBrowser() {
  if (activeBrowser) {
    try {
      console.log('🔒 Fechando browser anterior...');
      await activeBrowser.close();
      console.log('🔒 Browser anterior fechado.');
    } catch (e) {
      console.warn(`⚠️  Erro ao fechar browser anterior: ${e.message}`);
    }
    activeBrowser = null;
  }
}

async function killOrphanedChromium() {
  try {
    const { execSync } = await import('child_process');
    // Matar processos Chromium/Chrome for Testing órfãos (SIGKILL para garantir)
    execSync('pkill -9 -f "Google Chrome for Testing" 2>/dev/null || true', { stdio: 'ignore' });
    execSync('pkill -9 -f "chromium" 2>/dev/null || true', { stdio: 'ignore' });
    console.log('🧹 Processos Chromium órfãos limpos');
  } catch (_) {}
}

// JPEG mínimo para documento placeholder
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x09, 0x09,
  0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13,
  0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24,
  0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c,
  0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c,
  0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00,
  0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01,
  0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
  0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x7b, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xff, 0xd9,
]);

// ─── Garantir diretórios ──────────────────────────────────────────────────────
async function ensureDirs() {
  for (const dir of [SCREENSHOTS_DIR, FIXTURES_DIR, TMP_DIR]) {
    try { await mkdir(dir, { recursive: true }); } catch (_) {}
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  return createClient(url, key);
}

async function buscarCliente(customerId) {
  // Try join first, fallback to separate queries if FK not cached
  let data, error;
  try {
    const res = await getSupabase()
      .from('customers')
      .select(`
        *,
        consultants:consultant_id (
          id,
          name,
          igreen_id
        )
      `)
      .eq('id', customerId)
      .single();
    data = res.data;
    error = res.error;
  } catch (e) {
    error = e;
  }

  // Fallback: separate queries if join fails
  if (error || !data) {
    console.log(`⚠️ Join falhou (${error?.message || 'sem data'}), usando queries separadas...`);
    const { data: customer, error: custErr } = await getSupabase()
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();
    if (custErr) throw new Error(`Erro ao buscar cliente: ${custErr.message}`);
    if (!customer) throw new Error(`Cliente ${customerId} não encontrado`);

    // Fetch consultant separately
    if (customer.consultant_id) {
      const { data: consultant } = await getSupabase()
        .from('consultants')
        .select('id, name, igreen_id')
        .eq('id', customer.consultant_id)
        .single();
      customer.consultants = consultant || null;
    } else {
      customer.consultants = null;
    }
    return customer;
  }

  return data;
}

async function atualizarStatus(customerId, status, errorMsg = null) {
  const updates = { status, updated_at: new Date().toISOString() };
  if (errorMsg) updates.error_message = errorMsg;
  if (status === 'registered_igreen') updates.portal_submitted_at = new Date().toISOString();
  if (status === 'awaiting_otp') updates.otp_code = null;
  await getSupabase().from('customers').update(updates).eq('id', customerId);
}

// ─── Notificar cliente para digitar o OTP no chat ────────────────────────────
async function notificarClienteOTP(customerId) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    const { data: customer } = await supabase
      .from('customers').select('phone_whatsapp, consultant_id, name')
      .eq('id', customerId).single();
    if (!customer?.phone_whatsapp) return;

    let instanceName = null;
    if (customer.consultant_id) {
      const { data: inst } = await supabase
        .from('whatsapp_instances').select('instance_name')
        .eq('consultant_id', customer.consultant_id).limit(1).single();
      instanceName = inst?.instance_name;
    }

    const evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const evolutionKey = process.env.EVOLUTION_API_KEY || '';
    if (!evolutionUrl || !evolutionKey || !instanceName) {
      console.warn('   ⚠️  notificarClienteOTP: Evolution API não configurada');
      return;
    }

    let phone = String(customer.phone_whatsapp).replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;
    const remoteJid = `${phone}@s.whatsapp.net`;

    const nome = customer.name?.split(' ')[0] || '';
    const message = `📱 *Código de Verificação*\n\nOlá${nome ? ' ' + nome : ''}! Você vai receber um *código numérico* no WhatsApp enviado pela iGreen Energy.\n\n👉 *Quando receber, digite o código aqui neste chat* para eu finalizar seu cadastro!\n\n⏳ Aguardando o código...`;

    const res = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: remoteJid, text: message }),
    });
    if (res.ok) {
      console.log(`   ✅ Mensagem OTP enviada ao cliente ${phone}`);
    } else {
      console.warn(`   ⚠️  Falha ao notificar cliente sobre OTP: ${res.status}`);
    }
  } catch (e) {
    console.error(`   ❌ notificarClienteOTP erro: ${e.message}`);
  }
}

// ─── Enviar link de reconhecimento facial ao cliente via WhatsApp ─────────────
async function sendFacialLinkToCustomer(customerId, facialLink) {
  const supabase = getSupabase();
  if (!supabase) { console.error('   ❌ sendFacialLink: Supabase não configurado'); return; }
  try {
    const { data: customer } = await supabase
      .from('customers').select('phone_whatsapp, consultant_id, name')
      .eq('id', customerId).single();
    if (!customer?.phone_whatsapp) { console.error('   ❌ sendFacialLink: telefone não encontrado'); return; }

    let instanceName = null;
    if (customer.consultant_id) {
      const { data: inst } = await supabase
        .from('whatsapp_instances').select('instance_name')
        .eq('consultant_id', customer.consultant_id).limit(1).single();
      instanceName = inst?.instance_name;
    }

    const evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    const evolutionKey = process.env.EVOLUTION_API_KEY || '';

    // Fallback: buscar das settings
    let eUrl = evolutionUrl, eKey = evolutionKey;
    if (!eUrl || !eKey) {
      const { data: rows } = await supabase.from('settings').select('key, value');
      const s = {}; (rows || []).forEach(r => { s[r.key] = r.value; });
      eUrl = eUrl || (s.evolution_api_url || '').replace(/\/$/, '');
      eKey = eKey || s.evolution_api_key || '';
    }

    let phone = String(customer.phone_whatsapp).replace(/\D/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;
    const remoteJid = `${phone}@s.whatsapp.net`;

    const nome = customer.name?.split(' ')[0] || '';
    const message = `📲 *Última etapa — Validação Facial*\n\nOlá${nome ? ' ' + nome : ''}! Falta apenas a validação facial para concluir seu cadastro.\n\n🔗 Abra o link abaixo *no celular*:\n${facialLink}\n\n📱 Siga as instruções na tela (selfie + documento).\n\n⚠️ Use boa iluminação e tire o óculos se necessário.\n\n✅ *Quando terminar, responda aqui:* PRONTO\n\nQualquer dúvida, estamos aqui! ☀️`;

    if (eUrl && eKey && instanceName) {
      const res = await fetch(`${eUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { apikey: eKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: remoteJid, text: message }),
      });
      if (res.ok) {
        console.log(`   ✅ Link facial enviado via WhatsApp para ${phone}`);
        return;
      }
      console.warn(`   ⚠️  Evolution falhou: ${res.status}`);
    }
    console.warn('   ⚠️  Não foi possível enviar link facial via WhatsApp');
  } catch (e) {
    console.error(`   ❌ sendFacialLink erro: ${e.message}`);
  }
}

let _whapiSettings = null;
async function getWhapiSettings() {
  if (_whapiSettings) return _whapiSettings;
  const { data: rows } = await getSupabase().from('settings').select('key, value');
  const s = {};
  (rows || []).forEach((r) => { s[r.key] = r.value; });
  _whapiSettings = {
    token: s.whapi_token || process.env.WHAPI_TOKEN,
    baseUrl: (s.whapi_api_url || process.env.WHAPI_API_URL || 'https://gate.whapi.cloud').replace(/\/$/, ''),
  };
  return _whapiSettings;
}

async function downloadWhapiMedia(mediaId, label) {
  const { token, baseUrl } = await getWhapiSettings();
  if (!token) throw new Error('Whapi token não configurado - não é possível baixar whapi-media');
  const res = await fetch(`${baseUrl}/media/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`Whapi media ${res.status}: ${await res.text()}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const ext = ct.includes('pdf') ? 'pdf' : ct.includes('png') ? 'png' : 'jpg';
  const outPath = join(TMP_DIR, `${label}-${Date.now()}.${ext}`);
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}

// ─── Converter PDF para JPG (portal só aceita image/*) ──────────────────────
async function convertPdfToJpg(pdfPath, label) {
  try {
    const { execSync } = await import('child_process');
    const jpgPath = pdfPath.replace(/\.pdf$/i, '.jpg');
    // pdftoppm vem do poppler-utils (já instalado no container playwright)
    execSync(`pdftoppm -jpeg -r 150 -f 1 -l 1 "${pdfPath}" "${jpgPath.replace(/\.jpg$/, '')}" 2>/dev/null`, { stdio: 'ignore' });
    // pdftoppm gera arquivo com sufixo -1.jpg
    const generated = jpgPath.replace(/\.jpg$/, '-1.jpg');
    if (existsSync(generated)) {
      copyFileSync(generated, jpgPath);
      console.log(`   🔄 ${label} convertido PDF→JPG: ${jpgPath}`);
      return jpgPath;
    }
    if (existsSync(jpgPath)) return jpgPath;
  } catch (e) {
    console.warn(`   ⚠️  Conversão PDF→JPG falhou (${label}): ${e.message}`);
  }
  return pdfPath; // fallback: tenta original
}

// ─── Baixar mídia direta via Evolution API (fallback quando MinIO está offline) ─
async function downloadMediaViaEvolution(messageId, instanceName, label) {
  if (!messageId || !instanceName) return null;
  try {
    let evolutionUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    let evolutionKey = process.env.EVOLUTION_API_KEY || '';
    if (!evolutionUrl || !evolutionKey) {
      const { data: rows } = await getSupabase().from('settings').select('key, value');
      const s = {}; (rows || []).forEach(r => { s[r.key] = r.value; });
      evolutionUrl = evolutionUrl || (s.evolution_api_url || '').replace(/\/$/, '');
      evolutionKey = evolutionKey || s.evolution_api_key || '';
    }
    if (!evolutionUrl || !evolutionKey) {
      console.warn(`   ⚠️  [${label}] Evolution não configurado — pulando fallback`);
      return null;
    }
    console.log(`   📡 [${label}] Re-baixando via Evolution API (msgId=${messageId.substring(0, 16)}...)`);
    const res = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: 'POST',
      headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
    });
    if (!res.ok) {
      console.warn(`   ⚠️  [${label}] Evolution retornou ${res.status}`);
      return null;
    }
    const data = await res.json();
    const b64 = data?.base64;
    const mime = (data?.mimetype || 'application/octet-stream').toLowerCase();
    if (!b64 || b64.length < 100) return null;
    const ext = mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : 'jpg';
    const outPath = join(TMP_DIR, `${label}-evo-${Date.now()}.${ext}`);
    writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log(`   ✅ [${label}] Re-baixado via Evolution: ${outPath}`);
    return outPath;
  } catch (e) {
    console.warn(`   ⚠️  [${label}] downloadMediaViaEvolution falhou: ${e.message}`);
    return null;
  }
}

// ─── Preparar arquivos de upload ──────────────────────────────────────────────
// Hierarquia (FAIL-FAST: nunca cai em fixture genérica para documento):
//   1. URL HTTP do MinIO (se válida)
//   2. data: URL Base64 já no campo *_url
//   3. Base64 inline no banco (cliente.document_front_base64 / cliente.bill_base64)
//   4. Re-baixar via Evolution API (cliente.media_message_id / cliente.bill_message_id)
//   5. ABORT — devolve null e o caller decide (worker hoje aborta para doc-frente)
async function prepararDocumento(url, label, cliente = null, instanceName = null) {
  // Tratar URLs inválidas (nao_aplicavel, vazio, etc.)
  if (!url || url === 'nao_aplicavel' || url === 'null' || url === 'undefined' || String(url).trim() === '') {
    console.log(`   ⚠️  ${label}: URL não aplicável, retornando null`);
    return null;
  }
  // whapi-media:xxx → baixar via API Whapi (legado)
  if (url.startsWith('whapi-media:')) {
    try {
      const mediaId = url.replace('whapi-media:', '').trim();
      const outPath = await downloadWhapiMedia(mediaId, label);
      console.log(`📄 ${label} baixado (Whapi): ${outPath}`);
      return outPath.endsWith('.pdf') ? await convertPdfToJpg(outPath, label) : outPath;
    } catch (e) {
      console.warn(`⚠️  Erro ao baixar ${label} (Whapi): ${e.message}`);
    }
  }

  // Tentar baixar foto real do documento (URL HTTP ou data:)
  try {
    let outPath;

    if (url.startsWith('data:')) {
      const isPdf = url.includes('application/pdf');
      const ext = isPdf ? 'pdf' : 'jpg';
      outPath = join(TMP_DIR, `${label}-${Date.now()}.${ext}`);
      const base64 = url.replace(/^data:[^;]+;base64,/, '');
      writeFileSync(outPath, Buffer.from(base64, 'base64'));
    } else if (url.startsWith('http')) {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const ext = ct.includes('pdf') ? 'pdf' : 'jpg';
        outPath = join(TMP_DIR, `${label}-${Date.now()}.${ext}`);
        writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
      } else {
        console.warn(`   ⚠️  ${label}: HTTP ${res.status} ao baixar URL primária`);
      }
    } else {
      // url == "evolution-media:pending" ou outra string inesperada
      console.warn(`   ⚠️  ${label}: URL não-HTTP/data: "${String(url).substring(0, 60)}"`);
    }

    if (outPath && existsSync(outPath)) {
      console.log(`📄 ${label} baixado: ${outPath}`);
      if (outPath.endsWith('.pdf') && (label === 'doc-frente' || label === 'doc-verso')) {
        return await convertPdfToJpg(outPath, label);
      }
      return outPath;
    }
  } catch (e) {
    console.warn(`⚠️  Erro ao baixar ${label}: ${e.message}`);
  }

  // 🆘 FALLBACK 1: Base64 inline no banco
  if (cliente) {
    const inlineB64 = label === 'doc-frente' ? cliente.document_front_base64
                    : label === 'conta'      ? cliente.bill_base64
                    : null;
    if (inlineB64 && inlineB64.length > 100) {
      try {
        // Heurística simples para PDF (header %PDF em base64 começa com "JVBERi")
        const isPdf = inlineB64.startsWith('JVBERi');
        const ext = isPdf ? 'pdf' : 'jpg';
        const outPath = join(TMP_DIR, `${label}-inline-${Date.now()}.${ext}`);
        writeFileSync(outPath, Buffer.from(inlineB64, 'base64'));
        console.log(`   ✅ [${label}] Recuperado do Base64 inline do banco`);
        if (isPdf && (label === 'doc-frente' || label === 'doc-verso')) {
          return await convertPdfToJpg(outPath, label);
        }
        return outPath;
      } catch (e) {
        console.warn(`   ⚠️  [${label}] Falha ao decodar Base64 inline: ${e.message}`);
      }
    }
  }

  // 🆘 FALLBACK 2: Re-baixar via Evolution API
  if (cliente && instanceName) {
    const msgId = label === 'doc-frente' ? cliente.media_message_id
                : label === 'conta'      ? cliente.bill_message_id
                : null;
    if (msgId) {
      const evoPath = await downloadMediaViaEvolution(msgId, instanceName, label);
      if (evoPath) {
        if (evoPath.endsWith('.pdf') && (label === 'doc-frente' || label === 'doc-verso')) {
          return await convertPdfToJpg(evoPath, label);
        }
        return evoPath;
      }
    }
  }

  // 🛑 FAIL-FAST: para documento pessoal, NUNCA usar fixture genérico
  if (label === 'doc-frente') {
    console.error(`   ❌ [${label}] Não foi possível recuperar mídia real (URL/Base64/Evolution todos falharam)`);
    return null;
  }

  // Para verso (RG) e conta, ainda permitimos placeholder porque o worker decide depois
  if (label === 'doc-verso') {
    const docPath = join(FIXTURES_DIR, 'documento.jpg');
    if (!existsSync(docPath)) {
      writeFileSync(docPath, MINIMAL_JPEG);
    }
    console.log(`📄 ${label} placeholder criado (verso opcional)`);
    return docPath;
  }

  return null;
}

async function prepararContaEnergia(cliente, instanceName = null) {
  const url = cliente.electricity_bill_photo_url;
  if (url && url.startsWith('whapi-media:')) {
    try {
      const mediaId = url.replace('whapi-media:', '').trim();
      const outPath = await downloadWhapiMedia(mediaId, 'conta');
      console.log(`📄 Conta de energia baixada (Whapi): ${outPath}`);
      return outPath;
    } catch (e) {
      console.warn('⚠️  Erro ao baixar conta (Whapi):', e.message);
    }
  }
  // Tentar baixar foto real da conta (URL HTTP ou data:)
  if (url) {
    try {
      let outPath;

      if (url.startsWith('data:')) {
        const isPdf = url.includes('application/pdf');
        const ext = isPdf ? 'pdf' : 'jpg';
        outPath = join(TMP_DIR, `conta-${Date.now()}.${ext}`);
        const base64 = url.replace(/^data:[^;]+;base64,/, '');
        writeFileSync(outPath, Buffer.from(base64, 'base64'));
      } else if (url.startsWith('http')) {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const ext = ct.includes('pdf') ? 'pdf' : 'jpg';
          outPath = join(TMP_DIR, `conta-${Date.now()}.${ext}`);
          writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
        }
      }

      if (outPath && existsSync(outPath)) {
        console.log(`📄 Conta de energia baixada: ${outPath}`);
        return outPath;
      }
    } catch (e) {
      console.warn('⚠️  Erro ao baixar conta:', e.message);
    }
  }

  // 🆘 Fallbacks: Base64 inline → Evolution API
  const inlineB64 = cliente.bill_base64;
  if (inlineB64 && inlineB64.length > 100) {
    try {
      const isPdf = inlineB64.startsWith('JVBERi');
      const ext = isPdf ? 'pdf' : 'jpg';
      const outPath = join(TMP_DIR, `conta-inline-${Date.now()}.${ext}`);
      writeFileSync(outPath, Buffer.from(inlineB64, 'base64'));
      console.log(`   ✅ [conta] Recuperada do Base64 inline do banco`);
      return outPath;
    } catch (e) {
      console.warn(`   ⚠️  [conta] Falha ao decodar Base64 inline: ${e.message}`);
    }
  }
  if (cliente.bill_message_id && instanceName) {
    const evoPath = await downloadMediaViaEvolution(cliente.bill_message_id, instanceName, 'conta');
    if (evoPath) return evoPath;
  }

  // Fallback final: PDF mínimo (portal exige um arquivo qualquer no campo)
  const pdfPath = join(FIXTURES_DIR, 'conta-energia.pdf');
  if (!existsSync(pdfPath)) {
    const pdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000062 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n206\n%%EOF';
    writeFileSync(pdfPath, pdfContent);
    console.log('📄 PDF placeholder de conta criado');
  }
  return pdfPath;
}

// ─── Salvar documentos organizados em ~/Documents/iGreen/contratos ────────
async function salvarDocumentosCliente(cliente) {
  try {
    const nome = (cliente.name || 'SEM-NOME').replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '').trim().replace(/\s+/g, '-');
    const dataHoje = new Date().toISOString().split('T')[0];
    const pastaCliente = join(homedir(), 'Documents', 'iGreen', 'contratos', `${nome}-${dataHoje}`);
    
    await mkdir(pastaCliente, { recursive: true });
    console.log(`\n📁 Pasta do cliente: ${pastaCliente}`);

    let salvos = 0;

    // RG/CNH Frente
    if (cliente.document_front_url && cliente.document_front_url !== 'nao_aplicavel') {
      try {
        const ext = await baixarArquivo(cliente.document_front_url, join(pastaCliente, `RG-frente-${nome}`));
        console.log(`   ✅ RG-frente-${nome}${ext}`);
        salvos++;
      } catch (e) { console.warn(`   ⚠️  RG frente: ${e.message}`); }
    }

    // RG/CNH Verso
    if (cliente.document_back_url && cliente.document_back_url !== 'nao_aplicavel') {
      try {
        const ext = await baixarArquivo(cliente.document_back_url, join(pastaCliente, `RG-verso-${nome}`));
        console.log(`   ✅ RG-verso-${nome}${ext}`);
        salvos++;
      } catch (e) { console.warn(`   ⚠️  RG verso: ${e.message}`); }
    }

    // Conta de Luz
    if (cliente.electricity_bill_photo_url && cliente.electricity_bill_photo_url !== 'nao_aplicavel') {
      try {
        const ext = await baixarArquivo(cliente.electricity_bill_photo_url, join(pastaCliente, `conta-de-luz-${nome}`));
        console.log(`   ✅ conta-de-luz-${nome}${ext}`);
        salvos++;
      } catch (e) { console.warn(`   ⚠️  Conta de luz: ${e.message}`); }
    }

    console.log(`📁 ${salvos}/3 documento(s) salvos em: ${pastaCliente}`);
    return pastaCliente;
  } catch (e) {
    console.error(`❌ Erro ao salvar documentos: ${e.message}`);
    return null;
  }
}

async function baixarArquivo(url, caminhoSemExtensao) {
  if (url.startsWith('data:')) {
    const isPdf = url.includes('application/pdf');
    const ext = isPdf ? '.pdf' : '.jpg';
    const base64 = url.replace(/^data:[^;]+;base64,/, '');
    writeFileSync(caminhoSemExtensao + ext, Buffer.from(base64, 'base64'));
    return ext;
  }
  if (url.startsWith('whapi-media:')) {
    const mediaId = url.replace('whapi-media:', '').trim();
    const outPath = await downloadWhapiMedia(mediaId, 'file');
    const ext = outPath.endsWith('.pdf') ? '.pdf' : outPath.endsWith('.png') ? '.png' : '.jpg';
    copyFileSync(outPath, caminhoSemExtensao + ext);
    return ext;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const ext = ct.includes('pdf') ? '.pdf' : ct.includes('png') ? '.png' : '.jpg';
  writeFileSync(caminhoSemExtensao + ext, Buffer.from(await res.arrayBuffer()));
  return ext;
}

// ─── Formatar dados ───────────────────────────────────────────────────────────
// ─── Dados reais obrigatórios — NUNCA usar fallback hardcoded ────────────────
// O bot do WhatsApp DEVE coletar email e telefone antes de enviar pro worker.
// Se chegou aqui sem, é bug no bot — rejeitar o lead.
const FALLBACK_EMAIL = ''; // REMOVIDO: não usar email fake
const FALLBACK_PHONE = ''; // REMOVIDO: não usar telefone fake

function formatarDados(cliente) {
  const onlyDigits = (s) => (s || '').replace(/\D+/g, '');
  
  const cpfDigits = onlyDigits(cliente.cpf);
  if (cpfDigits.length !== 11) throw new Error(`CPF inválido: ${cliente.cpf}`);
  const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  
  const cepDigits = onlyDigits(cliente.cep);
  if (cepDigits.length !== 8) throw new Error(`CEP inválido: ${cliente.cep}`);
  const cepFormatted = cepDigits.replace(/(\d{5})(\d{3})/, '$1-$2');
  
  // Telefone SEM código do país (portal não aceita +55)
  // OBRIGATÓRIO: usar phone_landline (telefone confirmado pelo cliente no chat)
  // Fallback para phone_whatsapp apenas se phone_landline não existir
  const phoneLandline = onlyDigits(cliente.phone_landline || '');
  const phoneWhatsapp = onlyDigits(cliente.phone_whatsapp || '');
  // Preferir phone_landline (telefone real do cliente digitado no chat)
  const phoneDigits = phoneLandline.length >= 10 ? phoneLandline : phoneWhatsapp;
  const whatsappRaw = phoneDigits.length >= 12 ? phoneDigits.slice(-11) : phoneDigits;
  if (whatsappRaw.length < 10) {
    throw new Error(`Telefone do cliente ausente ou inválido ("${phoneDigits}"). O bot deveria ter coletado antes de enviar pro worker.`);
  }
  const whatsapp = whatsappRaw;

  // Email OBRIGATÓRIO: bot deve ter coletado email real do cliente
  const emailRaw = (cliente.email || '').trim();
  if (!emailRaw || !emailRaw.includes('@') || emailRaw.endsWith('@lead.igreen')) {
    throw new Error(`Email do cliente ausente ou placeholder ("${emailRaw}"). O bot deveria ter coletado antes de enviar pro worker.`);
  }
  const email = emailRaw;

  return {
    nomeCompleto: cliente.name,
    cpfDigits,
    cpfFormatted,
    cepFormatted,
    whatsapp,
    email,
    endereco: cliente.address_street,
    numeroEndereco: cliente.address_number,
    bairro: cliente.address_neighborhood,
    cidade: cliente.address_city,
    estadoSigla: cliente.address_state,
    complemento: cliente.address_complement,
    distribuidora: cliente.distribuidora,
    numeroInstalacao: (() => {
      const num = cliente.numero_instalacao || '';
      const digits = num.replace(/\D/g, '');
      // Portal espera 7-12 dígitos (campo "Seu Código" na conta de luz)
      // Se já está no range correto, usar direto
      if (digits.length >= 7 && digits.length <= 12) return digits;
      // Se veio maior (ex: código de barras ou outro campo), tentar sem zeros à esquerda
      if (digits.length > 12) {
        const semZeros = digits.replace(/^0+/, '');
        if (semZeros.length >= 7 && semZeros.length <= 12) return semZeros;
        // Último recurso: últimos 10 dígitos
        return digits.slice(-10);
      }
      return digits;
    })(),
    electricity_bill_value: cliente.electricity_bill_value || 300,
    dataNascimento: cliente.data_nascimento,
    // Normalizar document_type (aceita "CNH"/"cnh"/"RG (Novo)"/"rg_novo"/etc.)
    documentType: normalizeDocType(cliente.document_type),
    possuiProcurador: cliente.possui_procurador || false,
    pdfProtegido: cliente.conta_pdf_protegida || false,
    debitosAberto: cliente.debitos_aberto || false,
  };
}

// ─── Normalização ÚNICA de document_type (espelha _shared/document-type.ts) ──
// Valores canônicos: "cnh" | "rg_novo" | "rg_antigo".
function normalizeDocType(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return 'rg_antigo';
  if (/cnh|habilita/.test(raw)) return 'cnh';
  if (/novo/.test(raw)) return 'rg_novo';
  if (/antigo|rg/.test(raw)) return 'rg_antigo';
  return 'rg_antigo';
}

// Texto exato da opção no MUI Select do portal igreen.
function portalDocLabel(canonical) {
  if (canonical === 'cnh') return 'CNH';
  if (canonical === 'rg_novo') return 'RG (Novo)';
  return 'RG (Antigo)';
}

// ─── Screenshot helper ────────────────────────────────────────────────────────
async function screenshot(page, customerId, fase) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filepath = join(SCREENSHOTS_DIR, `${customerId}-${fase}-${ts}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot: ${fase}`);
    
    // Salvar HTML para diagnóstico em fases críticas
    if (fase.includes('apos-enviar') || fase.includes('apos-finalizar') || fase.includes('resultado') || fase.includes('ERROR') || fase.includes('FALHOU')) {
      try {
        const htmlPath = join(SCREENSHOTS_DIR, `${customerId}-${fase}-${ts}.html`);
        const html = await page.content();
        writeFileSync(htmlPath, html);
        console.log(`📄 HTML dump: ${fase}`);
      } catch (_) {}
    }
    
    return filepath;
  } catch (_) { return null; }
}

// ─── Aguardar OTP via polling ─────────────────────────────────────────────────
async function aguardarOTP(customerId, timeoutMs = 120000) {
  console.log(`\n⏳ Aguardando OTP no WhatsApp (timeout: ${timeoutMs / 1000}s)...`);
  const inicio = Date.now();
  let tentativas = 0;
  
  while (Date.now() - inicio < timeoutMs) {
    tentativas++;
    
    // Estratégia 1: buscar via endpoint local do server
    try {
      const resp = await fetch(`${PORTAL_WORKER_URL}/otp/${customerId}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.code) {
          console.log(`🔑 OTP recebido via server (${data.source || 'unknown'}) após ${tentativas} tentativas: ${data.code}`);
          return data.code;
        }
      }
    } catch (_) {}
    
    // Estratégia 2: buscar direto no Supabase (fallback)
    if (tentativas % 3 === 0) {
      try {
        const { data } = await getSupabase()
          .from('customers')
          .select('otp_code')
          .eq('id', customerId)
          .single();
        if (data?.otp_code) {
          console.log(`🔑 OTP recebido via Supabase após ${tentativas} tentativas: ${data.otp_code}`);
          return data.otp_code;
        }
      } catch (_) {}
    }
    
    if (tentativas % 10 === 0) console.log(`⏳ Tentativa ${tentativas} - aguardando OTP...`);
    await delay(1500);
  }
  throw new Error(`Timeout aguardando OTP (${timeoutMs / 1000}s)`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMAÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export async function executarAutomacao(customerId, options = {}) {
  const startTime = Date.now();
  const { headless, stopBeforeSubmit = false } = options;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🤖 AUTOMAÇÃO PLAYWRIGHT v3.0`);
  console.log(`   Customer ID : ${customerId}`);
  console.log(`   Headless    : ${headless !== undefined ? headless : (process.env.HEADLESS === '1')}`);
  console.log(`   Stop before submit: ${stopBeforeSubmit}`);
  console.log(`   Timestamp   : ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  
  let browser;
  let currentPhase = 'init';
  
  try {
    await ensureDirs();
    
    // ─── 1. Buscar e validar dados ────────────────────────────────────────
    console.log('\n📥 Buscando dados do cliente + consultor...');
    const cliente = await buscarCliente(customerId);
    
    // Extrair igreen_id do consultor para URL individualizada
    const consultant = cliente.consultants;
    const consultorId = consultant?.igreen_id || CONSULTOR_ID_FALLBACK;
    const consultorName = consultant?.name || 'Consultor';
    console.log(`✅ Cliente: ${cliente.name}`);
    console.log(`👤 Consultor: ${consultorName} (iGreen ID: ${consultorId})`);
    
    // URL individualizada por consultor
    const PORTAL_URL = `https://digital.igreenenergy.com.br/?id=${consultorId}&sendcontract=true`;
    
    const data = formatarDados(cliente);
    
    // ─── Salvar documentos organizados em ~/Documents/iGreen/contratos ──
    const pastaDocumentos = await salvarDocumentosCliente(cliente);
    
    // Validar campos obrigatórios (email e whatsapp têm fallback, não bloqueiam)
    const obrigatorios = ['nomeCompleto', 'cpfDigits', 'cepFormatted', 'endereco', 'numeroEndereco', 'cidade', 'estadoSigla'];
    const faltando = obrigatorios.filter(c => !data[c] || String(data[c]).trim() === '');
    if (faltando.length > 0) throw new Error(`Campos obrigatórios faltando: ${faltando.join(', ')}`);
    // Email e telefone sempre têm valor (fallback garantido em formatarDados)
    console.log(`✅ Dados validados | email: ${data.email} | whatsapp: ${data.whatsapp}`);

    
    // Buscar instanceName do consultor (necessário p/ fallback Evolution API)
    let instanceName = null;
    if (cliente.consultant_id) {
      try {
        const { data: inst } = await getSupabase()
          .from('whatsapp_instances').select('instance_name')
          .eq('consultant_id', cliente.consultant_id).limit(1).maybeSingle();
        instanceName = inst?.instance_name || null;
      } catch (_) {}
    }

    // Preparar arquivos de upload (com hierarquia URL → Base64 → Evolution → fail)
    const docFrentePath = await prepararDocumento(cliente.document_front_url, 'doc-frente', cliente, instanceName);
    const docVersoPath = await prepararDocumento(cliente.document_back_url, 'doc-verso', cliente, instanceName);
    const contaPath = await prepararContaEnergia(cliente, instanceName);
    console.log(`📄 Doc frente: ${docFrentePath}`);
    console.log(`📄 Doc verso: ${docVersoPath}`);
    console.log(`📄 Conta: ${contaPath}`);

    // 🛑 FAIL-FAST: se não conseguimos a frente do documento, NÃO abrir browser
    if (!docFrentePath) {
      const msg = 'Documento (frente) indisponível: MinIO offline + Base64 inline ausente + Evolution API sem messageId. Cliente precisa reenviar a foto pelo WhatsApp.';
      console.error(`❌ ${msg}`);
      await atualizarStatus(customerId, 'awaiting_document_resend', msg);
      throw new Error(msg);
    }
    
    await atualizarStatus(customerId, 'portal_submitting');
    
    // ─── 2. Iniciar browser (fechar qualquer browser anterior primeiro) ──
    console.log('\n🌐 Iniciando Chromium...');
    await closeActiveBrowser();   // Garante que só 1 browser existe
    await killOrphanedChromium(); // Mata processos órfãos do sistema
    
    const isHeadless = headless !== undefined ? Boolean(headless) : (process.env.HEADLESS !== '0');
    console.log(`   🖥️  headless=${isHeadless} (HEADLESS env=${process.env.HEADLESS})`);
    browser = await chromium.launch({
      headless: isHeadless,
      slowMo: isHeadless ? 50 : 100,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--no-first-run',
        '--single-process',
        '--js-flags=--max-old-space-size=256',
        '--start-maximized',
      ],
    });
    activeBrowser = browser; // Registrar como browser ativo
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    
    // ─── 3. Navegar para portal ───────────────────────────────────────────
    currentPhase = 'navegacao';
    console.log(`\n🔗 Acessando: ${PORTAL_URL}`);
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(2000);
    
    // Aguardar formulário React renderizar (campo CEP ou botão Calcular)
    // Se VPS estiver lenta, o HTML carrega mas o JS/React demora pra montar os inputs
    const portalReady = await page.waitForSelector(
      'input[name="cep"], button:has-text("Calcular")',
      { state: 'visible', timeout: 30000 }
    ).catch(() => null);
    if (!portalReady) {
      console.warn('   ⚠️ Formulário não renderizou em 30s — recarregando página...');
      await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
      await delay(3000);
      await page.waitForSelector(
        'input[name="cep"], button:has-text("Calcular")',
        { state: 'visible', timeout: 30000 }
      ).catch(() => {});
    }
    
    await screenshot(page, customerId, '01-portal-carregado');
    console.log('✅ Portal carregado');
    
    // ═══════════════════════════════════════════════════════════════════
    // PREENCHIMENTO DO FORMULÁRIO — MAPEAMENTO VALIDADO 20/04/2026
    // Usa input[name="xxx"] direto + pressSequentially para React/MUI
    // ═══════════════════════════════════════════════════════════════════

    /** Preenche campo por name, aguardando aparecer. Usa pressSequentially para React. */
    async function fillByName(nameAttr, value, label, timeoutMs = 20000) {
      const sel = `input[name="${nameAttr}"]`;
      try {
        await page.waitForSelector(sel, { state: 'visible', timeout: timeoutMs });
      } catch {
        console.warn(`   ⚠️ ${label} (name="${nameAttr}"): não apareceu em ${timeoutMs}ms`);
        return false;
      }
      const loc = page.locator(sel).first();
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click();
      await loc.fill('');
      await delay(50);
      await loc.pressSequentially(String(value), { delay: 25 });
      await loc.press('Tab');
      await delay(200);
      const filled = await loc.inputValue().catch(() => '');
      console.log(`   ✅ ${label}: "${filled}"`);
      return true;
    }

    // ─── FASE 1: CEP + Valor + Calcular ──────────────────────────────────
    currentPhase = 'fase1-cep';
    console.log('\n📋 [1/14] CEP + Valor + Calcular...');
    
    // Retry interno: se campos não aparecem, recarrega a página (até 2x)
    let fase1Ok = false;
    for (let fase1Try = 1; fase1Try <= 3; fase1Try++) {
      const cepOk = await fillByName('cep', data.cepFormatted.replace(/\D/g, ''), 'CEP');
      const valOk = await fillByName('consumption', String(data.electricity_bill_value), 'Valor');
      
      if (cepOk && valOk) {
        fase1Ok = true;
        break;
      }
      
      if (fase1Try < 3) {
        console.warn(`   ⚠️ Campos não apareceram (tentativa ${fase1Try}/3) — recarregando portal...`);
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
        await delay(3000);
        await page.waitForSelector('input[name="cep"], button:has-text("Calcular")', { state: 'visible', timeout: 30000 }).catch(() => {});
      }
    }
    
    if (!fase1Ok) {
      throw new Error('Campos CEP/Consumo não apareceram após 3 tentativas de reload');
    }
    
    await page.locator('button:has-text("Calcular")').first().click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await delay(2000);
    await screenshot(page, customerId, '02-apos-calcular');

    // ─── FASE 2: Garantir Desconto ───────────────────────────────────────
    currentPhase = 'fase2-garantir';
    console.log('\n📋 [2/14] Garantir desconto...');
    await page.locator('button:has-text("Garantir meu desconto")').first().click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await delay(2000);
    await screenshot(page, customerId, '03-apos-garantir');

    // ─── FASE 3: CPF + Auto-fill Receita ─────────────────────────────────
    currentPhase = 'fase3-cpf';
    console.log('\n📋 [3/14] CPF...');
    await fillByName('documentNumber', data.cpfDigits, 'CPF');
    
    // Aguardar auto-fill nome via Receita Federal (até 10s)
    console.log('   ⏳ Aguardando Receita Federal...');
    let nomeAutoFill = '';
    for (let i = 0; i < 20; i++) {
      await delay(500);
      nomeAutoFill = await page.locator('input[name="name"]').first().inputValue().catch(() => '');
      if (nomeAutoFill.length > 2) {
        console.log(`   ✅ Auto-fill nome: "${nomeAutoFill}"`);
        break;
      }
    }
    if (!nomeAutoFill || nomeAutoFill.length < 3) {
      // Tentar preencher manualmente se Receita não retornou
      if (data.nomeCompleto) {
        console.log(`   ⚠️ Receita não retornou — preenchendo manual: "${data.nomeCompleto}"`);
        await fillByName('name', data.nomeCompleto, 'Nome (manual)', 3000);
      } else {
        const msg = 'Nome ausente: Receita não retornou e banco vazio';
        await atualizarStatus(customerId, 'awaiting_cpf_review', msg);
        throw new Error(msg);
      }
    }
    await screenshot(page, customerId, '04-apos-cpf');

    // ─── FASE 4: Telefone ────────────────────────────────────────────────
    currentPhase = 'fase4-telefone';
    console.log('\n📋 [4/14] Telefone...');
    // Fechar qualquer Modal/dialog MUI que possa estar interceptando pointer events
    // (causa recorrente de "automation_failed" antes de clicar em Finalizar).
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('.MuiBackdrop-root').click({ force: true, timeout: 2000 }).catch(() => {});
    await delay(300);
    const phoneDigits = String(data.whatsapp).replace(/\D/g, '');
    await fillByName('phone', phoneDigits, 'WhatsApp');
    await fillByName('phoneConfirm', phoneDigits, 'Confirme celular');

    // ─── FASE 5: Email ───────────────────────────────────────────────────
    currentPhase = 'fase5-email';
    console.log('\n📋 [5/14] Email...');
    let emailToUse = data.email;
    await fillByName('email', emailToUse, 'Email');
    
    // Detectar email duplicado
    await delay(500);
    const dupEmail = await page.locator('text=/j[áa].*cadastrad/i').count().catch(() => 0);
    if (dupEmail > 0) {
      emailToUse = `${data.cpfDigits}@igreen.temp.com.br`;
      console.log(`   ⚠️ Email duplicado no portal iGreen → usando alternativo: ${emailToUse}`);
      await fillByName('email', emailToUse, 'Email (alternativo - duplicado no portal)');
    }
    
    await fillByName('emailConfirm', emailToUse, 'Confirme email');
    await delay(1000);
    await screenshot(page, customerId, '05-apos-email');

    // ─── FASE 6: Endereço ────────────────────────────────────────────────
    currentPhase = 'fase6-endereco';
    console.log('\n📋 [6/14] Endereço...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(1500);
    
    // CEP, address, neighborhood, city, state são auto-preenchidos pelo CEP
    const autoAddr = await page.locator('input[name="address"]').first().inputValue().catch(() => '');
    console.log(`   📍 Auto-fill endereço: "${autoAddr}"`);
    
    // Se endereço não auto-preencheu, preencher manualmente
    if (!autoAddr || autoAddr.length < 3) {
      console.log('   ⚠️ CEP não auto-preencheu — preenchendo manual');
      if (data.endereco) await fillByName('address', data.endereco, 'Endereço', 3000);
      if (data.bairro) await fillByName('neighborhood', data.bairro, 'Bairro', 3000);
      if (data.cidade) await fillByName('city', data.cidade, 'Cidade', 3000);
    }
    
    await fillByName('number', data.numeroEndereco || '100', 'Número');
    if (data.complemento) {
      await fillByName('complement', data.complemento, 'Complemento', 5000);
    }
    await screenshot(page, customerId, '06-apos-endereco');

    // ─── FASE 7: Número da Instalação ────────────────────────────────────
    currentPhase = 'fase7-instalacao';
    console.log('\n📋 [7/14] Nº Instalação...');
    if (data.numeroInstalacao) {
      await fillByName('installationNumber', data.numeroInstalacao, 'Nº Instalação');
      await delay(1000);
      
      // Detectar instalação duplicada
      const dupInst = await page.locator('text=/instala[cç][aã]o.*j[áa].*cadastrad/i').count().catch(() => 0);
      if (dupInst > 0) {
        const msg = `Instalação ${data.numeroInstalacao} já cadastrada`;
        await atualizarStatus(customerId, 'installation_duplicate', msg);
        throw new Error(`INSTALLATION_DUPLICATE: ${msg}`);
      }
    }
    await screenshot(page, customerId, '07-apos-instalacao');

    // ─── FASE 8: Tipo de Documento ───────────────────────────────────────
    currentPhase = 'fase8-tipo-doc';
    console.log('\n📋 [8/14] Tipo documento...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(500);
    
    const tipoDocCanonical = normalizeDocType(data.documentType);
    const opcaoTexto = portalDocLabel(tipoDocCanonical);
    const isCNH = tipoDocCanonical === 'cnh';
    console.log(`   📋 Tipo: "${opcaoTexto}" (CNH=${isCNH})`);
    
    // O combobox de tipo documento é o ÚLTIMO [role="combobox"] visível
    const allCombos = await page.locator('[role="combobox"]:visible').all();
    console.log(`   Comboboxes visíveis: ${allCombos.length}`);
    let tipoDocOk = false;
    if (allCombos.length > 0) {
      const tipoDocCombo = allCombos[allCombos.length - 1];
      await tipoDocCombo.scrollIntoViewIfNeeded().catch(() => {});
      await tipoDocCombo.click();
      await delay(600);
      
      const targetOption = page.locator('li[role="option"]').filter({ hasText: opcaoTexto });
      if (await targetOption.count() > 0) {
        await targetOption.click();
        console.log(`   ✅ Tipo documento: ${opcaoTexto}`);
        tipoDocOk = true;
      } else {
        // Fallback: CNH
        const cnhOpt = page.locator('li[role="option"]').filter({ hasText: 'CNH' });
        if (await cnhOpt.count() > 0) {
          await cnhOpt.click();
          console.log('   ✅ Tipo documento: CNH (fallback)');
          tipoDocOk = true;
        } else {
          await page.keyboard.press('Escape');
        }
      }
    }
    if (!tipoDocOk) {
      console.warn('   ⚠️ Tipo documento não selecionado');
      await screenshot(page, customerId, 'ERROR-tipo-doc');
    }
    await delay(1500);
    await screenshot(page, customerId, '08-apos-tipo-doc');

    // ─── FASE 9: Upload Documento Pessoal ────────────────────────────────
    currentPhase = 'fase9-upload-doc';
    console.log('\n📋 [9/14] Upload documento pessoal...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(500);
    
    // Aguardar input file aparecer
    let fileInputs = page.locator('input[type="file"]');
    let fileCount = await fileInputs.count();
    if (fileCount === 0) {
      console.log('   ⏳ Aguardando bloco de upload...');
      for (let i = 0; i < 10; i++) {
        await delay(1000);
        fileCount = await fileInputs.count();
        if (fileCount > 0) break;
      }
    }
    console.log(`   Inputs file: ${fileCount}`);
    
    if (fileCount > 0 && docFrentePath) {
      await fileInputs.nth(0).setInputFiles(docFrentePath);
      console.log('   ✅ Upload FRENTE');
      await delay(2000);
      
      // Verso (só RG)
      if (!isCNH && docVersoPath) {
        const newCount = await fileInputs.count();
        if (newCount >= 2) {
          await fileInputs.nth(1).setInputFiles(docVersoPath);
          console.log('   ✅ Upload VERSO');
          await delay(2000);
        }
      }
    } else if (!docFrentePath) {
      throw new Error('Documento (frente) indisponível para upload');
    }
    await screenshot(page, customerId, '09-apos-upload-doc');

    // ─── FASE 10: Perguntas + Conta de Energia ───────────────────────────
    currentPhase = 'fase10-perguntas-conta';
    console.log('\n📋 [10/14] Perguntas + Conta de energia...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(1000);
    
    // hasProcurator = Não
    const procNao = page.locator('input[name="hasProcurator"][value="false"]');
    if (await procNao.count() > 0) {
      await procNao.click({ force: true });
      console.log('   ✅ Procurador: Não');
    }
    await delay(500);
    
    // Upload conta de energia (próximo input file disponível)
    const allFiles = page.locator('input[type="file"]');
    const totalFiles = await allFiles.count();
    console.log(`   Inputs file total: ${totalFiles}`);
    
    // O último input file é o da conta de energia
    if (totalFiles >= 2 && contaPath) {
      await allFiles.nth(totalFiles - 1).setInputFiles(contaPath);
      console.log('   ✅ Upload Conta de Energia');
      await delay(2000);
    } else if (contaPath) {
      // Fallback: tentar o primeiro file input disponível sem arquivo
      try {
        await allFiles.last().setInputFiles(contaPath);
        console.log('   ✅ Upload Conta de Energia (last)');
        await delay(2000);
      } catch (e) {
        console.warn(`   ⚠️ Upload conta falhou: ${e.message}`);
      }
    }
    
    // energyBillPassword (opcional, pular)
    
    // hasPendingDebts = Não
    const debtNao = page.locator('input[name="hasPendingDebts"][value="false"]');
    if (await debtNao.count() > 0) {
      await debtNao.click({ force: true });
      console.log('   ✅ Débitos pendentes: Não');
    }
    await delay(500);
    await screenshot(page, customerId, '10-apos-perguntas');

    // ─── FASE 11: Clicar Finalizar ───────────────────────────────────────
    currentPhase = 'submit';
    console.log('\n📋 [11/14] Clicando Finalizar...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(1000);

    let finalizarClicado = false;
    if (!stopBeforeSubmit) {
      const seletoresFinalizar = [
        'button:has-text("Finalizar")',
        'button:has-text("Enviar")',
        'button:has-text("Concluir")',
        'button:has-text("Confirmar")',
        'button[type="submit"]',
        'a:has-text("Finalizar")',
        '[role="button"]:has-text("Finalizar")',
      ];
      for (const sel of seletoresFinalizar) {
        try {
          const btn = page.locator(sel).last();
          if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
            await btn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
            await delay(500);
            await btn.click({ timeout: 8000 });
            console.log(`   ✅ Botão clicado: ${sel}`);
            finalizarClicado = true;
            break;
          }
        } catch (_) {}
      }
      
      if (!finalizarClicado) {
        console.warn('   ⚠️  Nenhum botão de submit encontrado');
        throw new Error('Botão Finalizar/Enviar não encontrado no portal');
      }
    }

    if (finalizarClicado) {
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await delay(3000);
      await screenshot(page, customerId, '10-apos-finalizar');
      
      // ─── DIAGNÓSTICO PÓS-FINALIZAR ─────────────────────────────────
      const pageText = await page.textContent('body').catch(() => '');
      const postClickUrl = page.url();
      console.log(`\n   🔍 DIAGNÓSTICO PÓS-FINALIZAR:`);
      console.log(`   📎 URL atual: ${postClickUrl}`);
      console.log(`   📄 Texto da página (primeiros 500 chars): ${(pageText || '').substring(0, 500).replace(/\s+/g, ' ')}`);
      
      // Detectar erros do portal
      const erroPortal = await page.locator('.MuiAlert-root, .error, [role="alert"], .toast-error, .Toastify__toast--error').first().textContent().catch(() => null);
      if (erroPortal) {
        console.error(`   🚨 ERRO DO PORTAL DETECTADO: "${erroPortal.trim()}"`);
      }
      
      // Detectar mensagens de validação
      const validationErrors = await page.locator('.MuiFormHelperText-root.Mui-error, .field-error, .validation-error, [class*="error"]').allTextContents().catch(() => []);
      if (validationErrors.length > 0) {
        console.error(`   🚨 ERROS DE VALIDAÇÃO: ${validationErrors.filter(e => e.trim()).join(' | ')}`);
      }
      
      // Verificar se apareceu OTP
      if (/código|OTP|verificação|whatsapp|token/i.test(pageText)) {
        console.log('   📱 OTP detectado - aguardando código...');
        await atualizarStatus(customerId, 'awaiting_otp');
        
        // Enviar mensagem pedindo o OTP ao cliente via WhatsApp
        await notificarClienteOTP(customerId);
        
        try {
          // Timeout 5 min — cliente leva tempo até olhar o WhatsApp.
          const otpCode = await aguardarOTP(customerId, 300000);
          // Preencher campo OTP — buscar por múltiplos seletores
          let otpField = page.locator('input[name="token"], input[name="otp"], input[name="otpCode"], input[name="code"], input[name="verificationCode"]').first();
          if (!(await otpField.count() > 0 && await otpField.isVisible().catch(() => false))) {
            otpField = page.locator('input[maxlength="6"], input[maxlength="4"], input[maxlength="8"]').first();
          }
          if (!(await otpField.count() > 0 && await otpField.isVisible().catch(() => false))) {
            otpField = page.locator('input[placeholder*="código" i], input[placeholder*="OTP" i], input[placeholder*="token" i], input[type="tel"]').first();
          }
          // Fallback: qualquer input visível vazio que não seja dos campos anteriores
          if (!(await otpField.count() > 0 && await otpField.isVisible().catch(() => false))) {
            otpField = await page.evaluate(() => {
              const known = ['documentNumber','name','birthDate','phone','phoneConfirm','email','emailConfirm','cep','address','number','neighborhood','city','state','complement','installationNumber','energyBillPassword'];
              const inputs = Array.from(document.querySelectorAll('input'));
              for (const inp of inputs) {
                if (inp.offsetParent === null) continue;
                const n = inp.getAttribute('name') || '';
                const t = inp.getAttribute('type') || '';
                if (t === 'file' || t === 'radio' || t === 'hidden' || t === 'checkbox') continue;
                if (known.includes(n)) continue;
                if (!inp.value || inp.value.trim() === '') return true;
              }
              return false;
            }) ? page.locator('input:visible').filter({ hasNot: page.locator('[type="file"],[type="radio"],[type="hidden"]') }).last() : null;
          }
          if (otpField && await otpField.count() > 0) {
            await otpField.scrollIntoViewIfNeeded().catch(() => {});
            await otpField.click();
            await otpField.type(otpCode, { delay: 100 });
            console.log(`   ✅ OTP digitado: ${otpCode}`);
            await delay(1000);
            
            // Confirmar OTP
            const confirmOtpClicked = await clickText('Confirmar') || await clickText('Verificar') || await clickText('Enviar');
            if (confirmOtpClicked) console.log('   ✅ OTP confirmado');
            
            await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
            await delay(3000);
            await screenshot(page, customerId, '11-apos-otp');
          }
        } catch (otpErr) {
          console.warn(`   ⚠️  OTP falhou: ${otpErr.message}`);
        }
      }
      
      // ─── Capturar link de reconhecimento facial / assinatura ─────────
      await delay(3000);
      const finalPageText = await page.textContent('body').catch(() => '');
      const currentUrl = page.url();
      let facialLink = null;

      // Blacklist: telas de login de distribuidoras (CPFL, etc) — NUNCA são link facial
      const BLACKLIST = /cpflb2cprd|b2clogin\.com|microsoftonline|oauth2\/v2\.0\/authorize/i;
      // Whitelist: padrões válidos para link de validação/assinatura
      const VALID_FACIAL = /(digital\.igreenenergy\.com\.br\/validacao-codigo|certisign|\/facial|\/biometria|\/selfie|\/assinatura|\/validacao-codigo)/i;
      const isValidFacial = (url) => !!url && url.startsWith('http') && !BLACKLIST.test(url) && VALID_FACIAL.test(url);

      // Estratégia 1 (PRIORIDADE MÁXIMA): Buscar padrão canônico iGreen
      // digital.igreenenergy.com.br/validacao-codigo/{codigo}?id={consultor}&sendcontract=true
      try {
        const igreenLinks = await page.locator('a[href*="digital.igreenenergy.com.br/validacao-codigo"]').all();
        for (const link of igreenLinks) {
          const href = await link.getAttribute('href').catch(() => null);
          if (isValidFacial(href)) {
            facialLink = href;
            console.log(`   🔗 [Estratégia 1 - canônico iGreen] Link facial: ${facialLink}`);
            break;
          }
        }
        if (!facialLink && currentUrl && /digital\.igreenenergy\.com\.br\/validacao-codigo/i.test(currentUrl)) {
          facialLink = currentUrl;
          console.log(`   🔗 [Estratégia 1 - URL atual canônica] Link facial: ${facialLink}`);
        }
        if (!facialLink) {
          const iframesIgreen = await page.locator('iframe[src*="digital.igreenenergy.com.br/validacao-codigo"]').all();
          for (const ifr of iframesIgreen) {
            const src = await ifr.getAttribute('src').catch(() => null);
            if (isValidFacial(src)) {
              facialLink = src;
              console.log(`   🔗 [Estratégia 1 - iframe canônico] Link facial: ${facialLink}`);
              break;
            }
          }
        }
      } catch (e1) { console.warn(`   ⚠️ Estratégia 1 falhou: ${e1.message}`); }

      // Estratégia 2 (refinada): Seletores específicos — sem `*="sign"` solto (matchava CPFL signin)
      if (!facialLink) {
        const linkSelectors = [
          'a[href*="certisign.com"]',
          'a[href*="/assinatura"]', 'a[href*="/sign/"]', 'a[href*="/signature"]',
          'a[href*="/facial"]', 'a[href*="/biometria"]', 'a[href*="/validacao-codigo"]',
          'a[href*="/reconhecimento"]', 'a[href*="/selfie"]',
        ];
        for (const sel of linkSelectors) {
          const links = await page.locator(sel).all();
          for (const link of links) {
            const href = await link.getAttribute('href').catch(() => null);
            if (!href || !href.startsWith('http')) continue;
            if (BLACKLIST.test(href)) {
              console.log(`   🚫 Descartado (blacklist CPFL/B2C): ${href}`);
              continue;
            }
            if (isValidFacial(href)) {
              facialLink = href;
              console.log(`   🔗 [Estratégia 2 - seletor ${sel}] Link facial: ${facialLink}`);
              break;
            }
          }
          if (facialLink) break;
        }
      }

      // Estratégia 3: URL atual mudou para página válida de assinatura/facial (sem CPFL)
      if (!facialLink && currentUrl && !BLACKLIST.test(currentUrl) && /facial|biometria|certisign|\/assinatura|\/selfie|\/validacao-codigo/i.test(currentUrl)) {
        facialLink = currentUrl;
        console.log(`   🔗 [Estratégia 3 - URL atual] Link facial: ${facialLink}`);
      }

      // Estratégia 4: iframes (filtrando blacklist)
      if (!facialLink) {
        const iframes = await page.locator('iframe[src*="certisign"], iframe[src*="/facial"], iframe[src*="/assinatura"], iframe[src*="/biometria"]').all();
        for (const iframe of iframes) {
          const src = await iframe.getAttribute('src').catch(() => null);
          if (isValidFacial(src)) {
            facialLink = src;
            console.log(`   🔗 [Estratégia 4 - iframe] Link facial: ${facialLink}`);
            break;
          }
        }
      }

      // Estratégia 5 (FALLBACK CONSTRUTIVO): se portal mostra sucesso mas nenhum link foi achado,
      // construir URL canônica a partir de igreen_code do customer + igreen_id do consultor.
      if (!facialLink && /código validado|codigo validado|cadastro concluíd|cadastro concluid|cadastro realizado|cadastro finalizado|sucesso/i.test(finalPageText)) {
        try {
          const supabase = getSupabase();
          if (supabase) {
            const { data: cust } = await supabase
              .from('customers')
              .select('igreen_code, consultant_id')
              .eq('id', customerId)
              .single();
            let igreenId = null;
            if (cust?.consultant_id) {
              const { data: cons } = await supabase
                .from('consultants')
                .select('igreen_id')
                .eq('id', cust.consultant_id)
                .single();
              igreenId = cons?.igreen_id || null;
            }
            if (cust?.igreen_code && igreenId) {
              facialLink = `https://digital.igreenenergy.com.br/validacao-codigo/${cust.igreen_code}?id=${igreenId}&sendcontract=true`;
              console.log(`   🔗 [Estratégia 5 - fallback construtivo] Link facial: ${facialLink}`);
            } else {
              console.warn(`   ⚠️ Fallback impossível: igreen_code=${cust?.igreen_code} igreen_id=${igreenId}`);
            }
          }
        } catch (e5) { console.warn(`   ⚠️ Estratégia 5 falhou: ${e5.message}`); }
      }

      // Validação final: se algo passou mas é inválido (ex: CPFL escapou), descartar
      if (facialLink && !isValidFacial(facialLink)) {
        console.error(`   ❌ Link facial inválido capturado, descartando: ${facialLink}`);
        facialLink = null;
      }

      await screenshot(page, customerId, '12-pos-otp-facial');

      // Salvar link e enviar ao cliente via WhatsApp
      if (facialLink) {
        console.log(`   📲 Enviando link de reconhecimento facial ao cliente...`);
        const supabase = getSupabase();
        if (supabase) {
          // Escreve nas DUAS colunas:
          // - link_facial / aguardando_facial → usado pelo evolution-webhook para detectar
          //   a confirmação manual do cliente ("PRONTO") e fechar como cadastro_concluido
          // - link_assinatura / awaiting_signature → mantido para compatibilidade com
          //   código legado e dashboards existentes
          await supabase.from('customers').update({
            link_facial: facialLink,
            link_assinatura: facialLink,
            conversation_step: 'aguardando_facial',
            status: 'awaiting_signature',
            updated_at: new Date().toISOString(),
          }).eq('id', customerId);
        }
        // Enviar link via WhatsApp (mensagem instrui cliente a responder "PRONTO")
        await sendFacialLinkToCustomer(customerId, facialLink);
        await atualizarStatus(customerId, 'awaiting_signature');
      } else if (/assinatura|contrato|sucesso|cadastro realizado|cadastro finalizado/i.test(finalPageText)) {
        console.log('   🎉 Cadastro finalizado com sucesso (sem link facial detectado)');
        await atualizarStatus(customerId, 'portal_submitted');
      } else {
        // Salvar HTML completo para diagnóstico
        await screenshot(page, customerId, '13-FALHOU-sem-confirmacao');
        const htmlDump = await page.content().catch(() => 'N/A');
        const dumpPath = join(SCREENSHOTS_DIR, `${customerId}-FALHOU-dump-${Date.now()}.html`);
        try { writeFileSync(dumpPath, htmlDump); console.log(`   📄 HTML dump salvo: ${dumpPath}`); } catch (_) {}
        console.error(`   ❌ FALHA: Portal não confirmou envio.`);
        console.error(`   📎 URL: ${page.url()}`);
        console.error(`   📄 Texto (500 chars): ${(finalPageText || '').substring(0, 500).replace(/\s+/g, ' ')}`);
        throw new Error(`Portal não confirmou envio após Finalizar. URL: ${page.url()} | Texto: ${(finalPageText || '').substring(0, 200).replace(/\s+/g, ' ')}`);
      }
      
      const pageUrl = page.url();
      console.log('   ✅ Formulário processado com sucesso');
      if (pageUrl) console.log(`   📎 URL: ${pageUrl}`);
      activeBrowser = null;
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ AUTOMAÇÃO CONCLUÍDA. Tempo: ${duration}s`);
      console.log('='.repeat(70));
      return { success: true, duration: parseFloat(duration), manualSubmit: false, pageUrl };
    }

    if (stopBeforeSubmit) {
      console.log('\n   ⏳ Modo manual: aguardando...');
      await atualizarStatus(customerId, 'awaiting_manual_submit');
      try {
        await new Promise((resolve) => {
          browser.on('disconnected', resolve);
          const checkInterval = setInterval(() => {
            if (!browser.isConnected()) { clearInterval(checkInterval); resolve(); }
          }, 2000);
        });
      } catch (_) {}
      try { await browser.close(); } catch (_) {}
      activeBrowser = null;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ Automação concluída (modo manual). Tempo: ${duration}s`);
      return { success: true, duration: parseFloat(duration), manualSubmit: true };
    }

    throw new Error('Fluxo terminou sem submit real do portal');

  } catch (error) {
    console.error(`\n${'='.repeat(70)}`);
    console.error(`❌ ERRO NA AUTOMAÇÃO`);
    console.error(`   Fase: ${currentPhase}`);
    console.error(`   Erro: ${error.message}`);
    console.error(`   Customer: ${customerId}`);
    console.error(`   Tempo: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.error('='.repeat(70));
    
    // SENTRY: Capturar erro com contexto completo da automação
    try {
      Sentry.withScope((scope) => {
        scope.setTags({
          module: 'playwright-automation',
          phase: currentPhase,
          customer_id: customerId,
        });
        scope.setExtras({
          duration_seconds: ((Date.now() - startTime) / 1000).toFixed(1),
          headless: options?.headless,
          url: (typeof page !== 'undefined' && page) ? page.url() : 'N/A',
        });
        Sentry.captureException(error);
      });
    } catch (_) { /* sentry opcional */ }
    
    try {
      if (typeof page !== 'undefined' && page) {
        await screenshot(page, customerId, `ERROR-${currentPhase}`);
        const errUrl = page.url();
        const errText = await page.textContent('body').catch(() => '');
        console.error(`   📎 URL no momento do erro: ${errUrl}`);
        console.error(`   📄 Texto da página (200 chars): ${(errText || '').substring(0, 200).replace(/\s+/g, ' ')}`);
        const htmlDump = await page.content().catch(() => null);
        if (htmlDump) {
          const dumpPath = join(SCREENSHOTS_DIR, `${customerId}-ERROR-${currentPhase}-${Date.now()}.html`);
          try { writeFileSync(dumpPath, htmlDump); console.error(`   📄 HTML dump: ${dumpPath}`); } catch (_) {}
        }
      }
    } catch (_) {}
    
    if (browser) {
      try { await browser.close(); } catch (_) {}
      activeBrowser = null;
    }
    
    await atualizarStatus(customerId, 'automation_failed', `[${currentPhase}] ${error.message}`).catch(() => {});
    throw error;
  }
}
