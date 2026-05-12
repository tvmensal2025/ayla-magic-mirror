/**
 * SIMULAÇÃO COMPLETA - Portal iGreen
 * Dados reais: Humberto Vieira e Silva
 * Email: tvmensal11@gmail.com
 * Telefone: 11971254913
 *
 * Executa: node simular.mjs
 */

import { chromium } from 'playwright-chromium';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SCREENSHOTS = './sim-screenshots';
if (!existsSync(SCREENSHOTS)) mkdirSync(SCREENSHOTS, { recursive: true });

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── DADOS REAIS DO CLIENTE ───────────────────────────────────────────────────
const CLIENTE = {
  cpf:              '33277354172',
  cpfFormatted:     '332.773.541-72',
  nome:             'HUMBERTO VIEIRA E SILVA',
  dataNascimento:   '22/07/1964',
  whatsapp:         '11971254913',   // fallback fixo
  email:            'tvmensal11@gmail.com', // fallback fixo
  cep:              '13309410',
  cepFormatted:     '13309-410',
  numeroEndereco:   '182',
  complemento:      '',
  distribuidora:    'CPFL Piratininga',
  numeroInstalacao: '2095855190',
  valorConta:       '205',
  documentType:     'cnh',           // CNH = sem verso
  consultorId:      '124661',
};

const PORTAL_URL = `https://digital.igreenenergy.com.br/?id=${CLIENTE.consultorId}&sendcontract=true`;

// ─── SCREENSHOT HELPER ────────────────────────────────────────────────────────
let step = 0;
async function shot(page, nome) {
  step++;
  const file = join(SCREENSHOTS, `${String(step).padStart(2,'0')}-${nome}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`  📸 ${file}`);
}

// ─── PREENCHER TELEFONE (4 estratégias) ──────────────────────────────────────
async function preencherTelefone(page, placeholder, valor, label) {
  const digits = String(valor).replace(/\D/g, '');
  console.log(`  📱 Preenchendo ${label}: ${digits}`);

  // S1: locator exato
  try {
    const loc = page.locator(`input[placeholder="${placeholder}"]`).first();
    if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ force: true });
      await loc.evaluate(el => { el.value = ''; el.focus(); });
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(digits, { delay: 80 });
      await page.keyboard.press('Tab');
      await delay(400);
      const val = (await loc.inputValue().catch(() => '')).replace(/\D/g, '');
      if (val === digits) { console.log(`  ✅ ${label} OK (S1)`); return true; }
    }
  } catch (_) {}

  // S2: scan todos inputs de telefone
  try {
    const all = await page.locator('input[placeholder*="celular" i], input[placeholder*="WhatsApp" i], input[type="tel"]').all();
    for (const inp of all) {
      if (!await inp.isVisible().catch(() => false)) continue;
      const ph = (await inp.getAttribute('placeholder').catch(() => '')).toLowerCase();
      const isConf = ph.includes('confirm') || ph.includes('confirme');
      if (label.toLowerCase().includes('confirm') && !isConf) continue;
      if (!label.toLowerCase().includes('confirm') && isConf) continue;
      await inp.scrollIntoViewIfNeeded().catch(() => {});
      await inp.click({ force: true });
      await inp.evaluate(el => { el.value = ''; el.focus(); });
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(digits, { delay: 80 });
      await page.keyboard.press('Tab');
      await delay(400);
      console.log(`  ✅ ${label} OK (S2)`);
      return true;
    }
  } catch (_) {}

  // S3: evaluate DOM
  try {
    const isConf = label.toLowerCase().includes('confirm');
    const ok = await page.evaluate(({ isConf, digits }) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      for (const inp of inputs) {
        const p = (inp.getAttribute('placeholder') || '').toLowerCase();
        if (!p.includes('whatsapp') && !p.includes('celular')) continue;
        if (inp.offsetParent === null) continue;
        const hasConf = p.includes('confirm') || p.includes('confirme');
        if (isConf && !hasConf) continue;
        if (!isConf && hasConf) continue;
        const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (ns) { ns.call(inp, digits); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      }
      return false;
    }, { isConf, digits });
    if (ok) { console.log(`  ✅ ${label} OK (S3-DOM)`); return true; }
  } catch (_) {}

  console.warn(`  ⚠️  ${label}: todas estratégias falharam — continuando`);
  return false;
}

// ─── PREENCHER EMAIL (4 estratégias) ─────────────────────────────────────────
async function preencherEmail(page, placeholder, valor, label) {
  console.log(`  📧 Preenchendo ${label}: ${valor}`);

  await page.waitForSelector(
    `input[placeholder="${placeholder}"], input[type="email"], input[placeholder*="mail" i]`,
    { timeout: 12000 }
  ).catch(() => {});
  await delay(300);

  // S1: locator exato
  try {
    const loc = page.locator(`input[placeholder="${placeholder}"]`).first();
    if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ clickCount: 3 });
      await loc.fill('');
      await loc.type(valor, { delay: 60 });
      await loc.dispatchEvent('blur');
      await delay(300);
      const val = await loc.inputValue().catch(() => '');
      if (val === valor) { console.log(`  ✅ ${label} OK (S1)`); return true; }
    }
  } catch (_) {}

  // S2: scan emails
  try {
    const all = await page.locator('input[type="email"], input[placeholder*="mail" i], input[placeholder*="E-mail" i]').all();
    for (const inp of all) {
      if (!await inp.isVisible().catch(() => false)) continue;
      const ph = (await inp.getAttribute('placeholder').catch(() => '')).toLowerCase();
      const isConf = ph.includes('confirm') || ph.includes('confirme');
      if (label.toLowerCase().includes('confirm') && !isConf) continue;
      if (!label.toLowerCase().includes('confirm') && isConf) continue;
      await inp.scrollIntoViewIfNeeded().catch(() => {});
      await inp.click({ clickCount: 3 });
      await inp.fill('');
      await inp.type(valor, { delay: 60 });
      await inp.dispatchEvent('blur');
      await delay(300);
      console.log(`  ✅ ${label} OK (S2)`);
      return true;
    }
  } catch (_) {}

  // S3: DOM
  try {
    const isConf = label.toLowerCase().includes('confirm');
    const ok = await page.evaluate(({ isConf, val }) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      for (const inp of inputs) {
        const p = (inp.getAttribute('placeholder') || '').toLowerCase();
        const t = (inp.getAttribute('type') || '').toLowerCase();
        if (t !== 'email' && !p.includes('mail') && !p.includes('e-mail')) continue;
        if (inp.offsetParent === null) continue;
        const hasConf = p.includes('confirm') || p.includes('confirme');
        if (isConf && !hasConf) continue;
        if (!isConf && hasConf) continue;
        const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (ns) { ns.call(inp, val); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      }
      return false;
    }, { isConf, val: valor });
    if (ok) { console.log(`  ✅ ${label} OK (S3-DOM)`); return true; }
  } catch (_) {}

  console.warn(`  ⚠️  ${label}: todas estratégias falharam — continuando`);
  return false;
}

// ─── SIMULAÇÃO PRINCIPAL ──────────────────────────────────────────────────────
async function simular() {
  console.log('\n' + '='.repeat(70));
  console.log('🎯 SIMULAÇÃO COMPLETA - PORTAL IGREEN');
  console.log(`   Cliente: ${CLIENTE.nome}`);
  console.log(`   CPF: ${CLIENTE.cpfFormatted}`);
  console.log(`   WhatsApp: ${CLIENTE.whatsapp}`);
  console.log(`   Email: ${CLIENTE.email}`);
  console.log(`   Portal: ${PORTAL_URL}`);
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: false,  // VISÍVEL para simulação
    slowMo: 80,
    args: ['--no-sandbox', '--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  const log = [];
  const ok  = (fase, msg) => { console.log(`  ✅ [${fase}] ${msg}`); log.push({ fase, status: 'ok', msg }); };
  const warn = (fase, msg) => { console.warn(`  ⚠️  [${fase}] ${msg}`); log.push({ fase, status: 'warn', msg }); };
  const fail = (fase, msg) => { console.error(`  ❌ [${fase}] ${msg}`); log.push({ fase, status: 'fail', msg }); };

  try {
    // ── FASE 1: Abrir portal ──────────────────────────────────────────────
    console.log('\n[1/14] Abrindo portal...');
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    await shot(page, 'portal-aberto');

    const bodyText = await page.textContent('body').catch(() => '');
    if (bodyText.includes('não tem autorização') || bodyText.includes('nao tem autorizacao')) {
      warn('portal', `ID ${CLIENTE.consultorId} sem autorização — tentando ID 124170`);
      await page.goto('https://digital.igreenenergy.com.br/?id=124170&sendcontract=true', { waitUntil: 'networkidle', timeout: 30000 });
      await delay(3000);
      await shot(page, 'portal-id-alternativo');
    }

    // Verificar se chegou na página inicial (CEP + Valor)
    const temCEP = await page.locator('input[placeholder="CEP"], input[placeholder*="CEP" i]').count().catch(() => 0);
    const temCalc = await page.locator('button:has-text("Calcular")').count().catch(() => 0);
    if (temCEP > 0 || temCalc > 0) {
      ok('portal', 'Portal carregado — página inicial com CEP/Calcular');
    } else {
      // Pode já estar na página do formulário (CPF)
      const temCPF = await page.locator('input[placeholder*="CPF" i]').count().catch(() => 0);
      if (temCPF > 0) {
        ok('portal', 'Portal carregado — já na página do formulário');
      } else {
        warn('portal', 'Portal carregado mas estrutura não reconhecida');
        await shot(page, 'portal-estrutura-desconhecida');
      }
    }

    // ── FASE 2: CEP + Valor ───────────────────────────────────────────────
    console.log('\n[2/14] CEP + Valor da conta...');
    const cepInput = page.locator('input[placeholder="CEP"]').first();
    if (await cepInput.count() > 0) {
      await cepInput.click();
      await cepInput.type(CLIENTE.cepFormatted, { delay: 80 });
      ok('cep', `CEP: ${CLIENTE.cepFormatted}`);
    } else {
      warn('cep', 'Campo CEP não encontrado');
    }

    const valorInput = page.locator('input[placeholder*="conta" i], input[placeholder*="valor" i], input[placeholder*="R$" i]').first();
    if (await valorInput.count() > 0) {
      await valorInput.click();
      await valorInput.type(CLIENTE.valorConta, { delay: 80 });
      ok('valor', `Valor: R$ ${CLIENTE.valorConta}`);
    } else {
      warn('valor', 'Campo valor não encontrado');
    }

    // Botão Calcular
    const calcBtn = page.locator('button:has-text("Calcular")').first();
    if (await calcBtn.count() > 0) {
      await calcBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(2500);
      ok('calcular', 'Calcular clicado');
    } else {
      warn('calcular', 'Botão Calcular não encontrado');
    }
    await shot(page, 'apos-calcular');

    // ── FASE 3: Garantir desconto ─────────────────────────────────────────
    console.log('\n[3/14] Garantir desconto...');
    const garantirBtn = page.locator('button:has-text("Garantir"), button:has-text("garantir")').first();
    if (await garantirBtn.count() > 0) {
      await garantirBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(3000);
      ok('garantir', 'Garantir clicado');
    } else {
      warn('garantir', 'Botão Garantir não encontrado — pode já estar no formulário');
    }
    await shot(page, 'apos-garantir');

    // ── FASE 4: CPF ───────────────────────────────────────────────────────
    console.log('\n[4/14] CPF...');
    await page.waitForSelector('input[placeholder*="CPF" i], input[placeholder*="CNPJ" i]', { timeout: 20000 }).catch(() => {});
    const cpfInput = page.locator('input[placeholder*="CPF" i], input[placeholder*="CNPJ" i]').first();
    if (await cpfInput.count() > 0) {
      await cpfInput.scrollIntoViewIfNeeded().catch(() => {});
      await cpfInput.click();
      await cpfInput.evaluate(el => { el.value = ''; el.focus(); });
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(CLIENTE.cpf, { delay: 100 });
      await page.keyboard.press('Tab');
      ok('cpf', `CPF: ${CLIENTE.cpfFormatted}`);
    } else {
      fail('cpf', 'Campo CPF não encontrado');
    }
    await delay(1000);
    await shot(page, 'apos-cpf');

    // ── FASE 5: Aguardar auto-fill (Nome + DataNasc via Receita) ──────────
    console.log('\n[5/14] Aguardando auto-fill da Receita Federal...');
    let autoFillOk = false;
    const autoStart = Date.now();
    while (Date.now() - autoStart < 12000) {
      const vals = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        let nome = '', nasc = '';
        for (const inp of inputs) {
          const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
          if (/nome/i.test(ph) && inp.value.length > 3) nome = inp.value;
          if (/nascim|birth/i.test(ph) && inp.value.length > 3) nasc = inp.value;
        }
        return { nome, nasc };
      });
      if (vals.nome || vals.nasc) {
        ok('autofill', `Nome="${vals.nome}" DataNasc="${vals.nasc}"`);
        autoFillOk = true;
        break;
      }
      await delay(500);
    }
    if (!autoFillOk) warn('autofill', 'Receita não retornou dados — continuando');
    await delay(1200);
    await shot(page, 'apos-autofill');

    // ── FASE 6: Tratar CPF já cadastrado ─────────────────────────────────
    const novoCadBtn = page.locator('button:has-text("novo cadastro"), button:has-text("Continuar com um novo")').first();
    if (await novoCadBtn.count() > 0) {
      await novoCadBtn.click();
      await delay(2000);
      warn('cpf-dup', 'CPF já cadastrado — clicou "novo cadastro"');
    }

    // ── FASE 7: WhatsApp ──────────────────────────────────────────────────
    console.log('\n[7/14] WhatsApp...');
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForSelector(
      'input[placeholder="Número do seu WhatsApp"], input[placeholder*="WhatsApp" i], input[placeholder*="celular" i]',
      { timeout: 25000 }
    ).catch(() => {});
    await delay(500);
    const waOk = await preencherTelefone(page, 'Número do seu WhatsApp', CLIENTE.whatsapp, 'WhatsApp');
    if (!waOk) warn('whatsapp', 'Preenchimento pode ter falhado');
    await delay(600);
    await shot(page, 'apos-whatsapp');

    // ── FASE 8: Confirme celular ──────────────────────────────────────────
    console.log('\n[8/14] Confirme celular...');
    await page.waitForSelector(
      'input[placeholder="Confirme seu celular"], input[placeholder*="onfirme" i]',
      { timeout: 10000 }
    ).catch(() => {});
    await delay(400);
    await preencherTelefone(page, 'Confirme seu celular', CLIENTE.whatsapp, 'Confirme celular');
    await delay(600);

    // ── FASE 9: Email ─────────────────────────────────────────────────────
    console.log('\n[9/14] Email...');
    await page.evaluate(() => window.scrollBy(0, 200));
    await preencherEmail(page, 'E-mail', CLIENTE.email, 'Email');
    await delay(600);

    // Verificar duplicado
    const dupEmail = await page.locator('text=/(j[áa]\\s*est[áa]\\s*cadastrad)|(email.*j[áa].*cadastrad)/i').count().catch(() => 0);
    if (dupEmail > 0) {
      const fallbackEmail = `${CLIENTE.cpf}@igreen.temp.com.br`;
      warn('email-dup', `Email duplicado → ${fallbackEmail}`);
      await preencherEmail(page, 'E-mail', fallbackEmail, 'Email (fallback)');
      await delay(600);
      await preencherEmail(page, 'Confirme seu E-mail', fallbackEmail, 'Confirme Email (fallback)');
    } else {
      await preencherEmail(page, 'Confirme seu E-mail', CLIENTE.email, 'Confirme Email');
    }
    await delay(2000);
    await shot(page, 'apos-email');

    // ── FASE 10: Endereço (número) ────────────────────────────────────────
    console.log('\n[10/14] Endereço...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2500); // aguardar CEP auto-fill

    // Número do endereço
    await page.waitForSelector('input[placeholder="Número"], input[placeholder*="úmero" i]', { timeout: 10000 }).catch(() => {});
    const numInputs = await page.locator('input[placeholder="Número"], input[placeholder*="úmero" i]').all();
    for (const inp of numInputs) {
      if (!await inp.isVisible().catch(() => false)) continue;
      const ctx = await inp.evaluate(el => {
        const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
        return (p?.textContent || '').toLowerCase();
      }).catch(() => '');
      if (ctx.includes('instalação') || ctx.includes('whatsapp')) continue;
      await inp.scrollIntoViewIfNeeded().catch(() => {});
      await inp.click({ clickCount: 3 });
      await inp.fill('');
      await inp.type(CLIENTE.numeroEndereco, { delay: 80 });
      ok('numero', `Número: ${CLIENTE.numeroEndereco}`);
      break;
    }
    await delay(1000);
    await shot(page, 'apos-endereco');

    // ── FASE 11: Número da instalação ─────────────────────────────────────
    console.log('\n[11/14] Número da instalação...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    const instInput = page.locator('input[placeholder*="instalação" i], input[placeholder*="Código" i], input[placeholder*="codigo" i]').first();
    if (await instInput.count() > 0 && await instInput.isVisible().catch(() => false)) {
      await instInput.scrollIntoViewIfNeeded().catch(() => {});
      await instInput.click({ clickCount: 3 });
      await instInput.fill('');
      await instInput.type(CLIENTE.numeroInstalacao, { delay: 80 });
      ok('instalacao', `Instalação: ${CLIENTE.numeroInstalacao}`);
    } else {
      warn('instalacao', 'Campo instalação não encontrado');
    }
    await delay(1500);

    // Verificar instalação duplicada
    const dupInst = await page.locator('text=/(instala[cç][aã]o.*j[áa].*cadastrad)/i').count().catch(() => 0);
    if (dupInst > 0) fail('instalacao-dup', 'Instalação já cadastrada');

    // ── FASE 12: Distribuidora ────────────────────────────────────────────
    console.log('\n[12/14] Distribuidora...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    // MUI Select
    const distCombos = await page.locator('[role="combobox"], .MuiSelect-select, select').all();
    for (const combo of distCombos) {
      if (!await combo.isVisible().catch(() => false)) continue;
      const ctx = await combo.evaluate(el => {
        const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
        return (p?.textContent || '').toLowerCase();
      }).catch(() => '');
      if (!ctx.includes('distribuidora')) continue;
      await combo.click({ force: true });
      await delay(800);
      // Tentar selecionar CPFL
      const opts = await page.locator('li[role="option"], [role="option"]').all();
      let selecionou = false;
      for (const opt of opts) {
        const txt = (await opt.textContent().catch(() => '')).toLowerCase();
        if (txt.includes('cpfl') || txt.includes('piratininga')) {
          await opt.click({ force: true });
          ok('distribuidora', `Distribuidora: ${await opt.textContent().catch(() => 'CPFL')}`);
          selecionou = true;
          break;
        }
      }
      if (!selecionou) {
        // Selecionar primeira opção
        const first = page.locator('li[role="option"]').first();
        if (await first.count() > 0) {
          const txt = await first.textContent().catch(() => '');
          await first.click({ force: true });
          warn('distribuidora', `Primeira opção selecionada: ${txt}`);
        }
      }
      break;
    }
    await delay(1200);
    await shot(page, 'apos-distribuidora');

    // ── FASE 13: Tipo de documento ────────────────────────────────────────
    console.log('\n[13/14] Tipo de documento (CNH)...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    const docCombos = await page.locator('[role="combobox"], .MuiSelect-select, select').all();
    for (const combo of docCombos) {
      if (!await combo.isVisible().catch(() => false)) continue;
      const ctx = await combo.evaluate(el => {
        const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
        return (p?.textContent || '').toLowerCase();
      }).catch(() => '');
      if (!ctx.includes('documento') && !ctx.includes('tipo')) continue;
      await combo.click({ force: true });
      await delay(800);
      const opts = await page.locator('li[role="option"], [role="option"]').all();
      for (const opt of opts) {
        const txt = (await opt.textContent().catch(() => '')).trim();
        if (txt === 'CNH') {
          await opt.click({ force: true });
          ok('tipo-doc', 'Tipo documento: CNH');
          break;
        }
      }
      break;
    }
    await delay(1500);
    await shot(page, 'apos-tipo-doc');

    // ── FASE 14: Perguntas (todas "Não") ──────────────────────────────────
    console.log('\n[14/14] Perguntas...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    const naoRadios = await page.locator('input[type="radio"][value="nao"], input[type="radio"][value="Não"], input[type="radio"][value="false"]').all();
    let respondidas = 0;
    for (const r of naoRadios) {
      if (!await r.isVisible().catch(() => false)) continue;
      await r.click({ force: true }).catch(() => {});
      respondidas++;
    }
    if (respondidas === 0) {
      const naoLabels = await page.locator('label:has-text("Não"), [role="radio"]:has-text("Não")').all();
      for (const l of naoLabels) {
        if (!await l.isVisible().catch(() => false)) continue;
        await l.click({ force: true }).catch(() => {});
        respondidas++;
      }
    }
    ok('perguntas', `${respondidas} perguntas respondidas com "Não"`);
    await shot(page, 'apos-perguntas');

    // ── RESULTADO ─────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESULTADO DA SIMULAÇÃO:');
    console.log('='.repeat(70));
    for (const entry of log) {
      const icon = entry.status === 'ok' ? '✅' : entry.status === 'warn' ? '⚠️ ' : '❌';
      console.log(`  ${icon} [${entry.fase}] ${entry.msg}`);
    }
    const fails = log.filter(e => e.status === 'fail').length;
    const warns = log.filter(e => e.status === 'warn').length;
    console.log(`\n  Total: ${log.length} fases | ✅ ${log.filter(e=>e.status==='ok').length} OK | ⚠️  ${warns} avisos | ❌ ${fails} falhas`);
    console.log(`\n  📸 Screenshots em: ${SCREENSHOTS}/`);
    console.log('\n  ⏸️  Navegador mantido aberto para inspeção. Feche manualmente.');
    console.log('='.repeat(70));

    // Manter aberto para inspeção
    await delay(60000);

  } catch (err) {
    console.error('\n❌ ERRO FATAL:', err.message);
    await shot(page, 'ERRO-FATAL').catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
}

simular();
