/**
 * TESTE FINAL COMPLETO - Mapear TODO o portal até o botão Finalizar
 * Preenche tudo e mapeia cada tela que aparece
 */
import { chromium } from './node_modules/playwright-chromium/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const DIR = './teste-final-screenshots';
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
const shot = async (page, nome) => {
  n++;
  const f = `${DIR}/${String(n).padStart(2,'0')}-${nome}.png`;
  await page.screenshot({ path: f, fullPage: true }).catch(() => {});
  console.log(`📸 ${f}`);
};

// Mapear todos os elementos visíveis
async function mapear(page, label) {
  console.log(`\n  === ${label} ===`);
  const els = await page.evaluate(() => {
    const r = [];
    document.querySelectorAll('input, select, [role="combobox"], [role="radio"], textarea').forEach(e => {
      if (e.offsetParent === null) return;
      const p = e.closest('.MuiFormControl-root') || e.parentElement?.parentElement?.parentElement;
      r.push({
        tag: e.tagName, type: e.getAttribute('type') || '',
        name: e.getAttribute('name') || '', id: e.getAttribute('id') || '',
        role: e.getAttribute('role') || '',
        label: p?.querySelector('label')?.textContent?.trim() || '',
        value: e.value || e.textContent?.trim().substring(0, 40) || '',
        accept: e.getAttribute('accept') || '',
      });
    });
    document.querySelectorAll('button, a').forEach(e => {
      if (e.offsetParent === null) return;
      const t = e.textContent?.trim();
      if (t && t.length > 1 && t.length < 50) r.push({ tag: e.tagName, text: t });
    });
    document.querySelectorAll('h1, h2, h3, p, span').forEach(e => {
      if (e.offsetParent === null) return;
      const t = e.textContent?.trim();
      if (t && t.length > 3 && t.length < 80 && !t.includes('\n')) r.push({ tag: e.tagName, text: t });
    });
    return r;
  });
  els.forEach(e => console.log(`  ${JSON.stringify(e)}`));
  return els;
}

const D = {
  cpf: '33277354172', whatsapp: '11971254913', email: 'tvmensal11@gmail.com',
  cep: '13309410', valor: '205', numero: '182', instalacao: '2095855191',
};

async function main() {
  console.log('='.repeat(60));
  console.log('🎯 TESTE FINAL - MAPEAR TODO O PORTAL');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  try {
    // FASE 1-10: Preencher tudo (já confirmado que funciona)
    console.log('\n[1] Portal...');
    await page.goto('https://digital.igreenenergy.com.br/?id=124170&sendcontract=true', { waitUntil: 'networkidle', timeout: 45000 });
    await delay(3000);

    console.log('[2] CEP + Valor + Calcular...');
    await page.locator('input[name="cep"]').fill(D.cep);
    await page.locator('input[name="consumption"]').fill(D.valor);
    await page.locator('button[type="submit"]').click();
    await delay(4000);

    console.log('[3] Garantir...');
    const g = page.locator('button:has-text("Garantir")').first();
    if (await g.count() > 0) { await g.click(); await delay(4000); }

    console.log('[4] CPF...');
    await page.waitForSelector('input[name="documentNumber"]', { timeout: 15000 });
    await page.locator('input[name="documentNumber"]').type(D.cpf, { delay: 100 });
    await page.keyboard.press('Tab');
    await delay(8000);
    const nome = await page.locator('input[name="name"]').inputValue().catch(() => '');
    console.log(`  ✅ Auto-fill: ${nome}`);

    // CPF duplicado?
    const novoBtn = page.locator('button:has-text("novo cadastro")').first();
    if (await novoBtn.count() > 0 && await novoBtn.isVisible().catch(() => false)) {
      await novoBtn.click(); await delay(3000);
      console.log('  ⚠️  CPF duplicado → novo cadastro');
    }

    console.log('[5] WhatsApp + Confirme...');
    await page.locator('input[name="phone"]').type(D.whatsapp, { delay: 80 });
    await page.locator('input[name="phoneConfirm"]').type(D.whatsapp, { delay: 80 });
    console.log('  ✅ WhatsApp OK');

    console.log('[6] Email + Confirme...');
    await page.locator('input[name="email"]').type(D.email, { delay: 60 });
    await page.locator('input[name="emailConfirm"]').type(D.email, { delay: 60 });
    console.log('  ✅ Email OK');

    console.log('[7] Número endereço...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await page.locator('input[name="number"]').type(D.numero, { delay: 80 });
    console.log('  ✅ Número OK');

    console.log('[8] Instalação...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await page.locator('input[name="installationNumber"]').type(D.instalacao, { delay: 80 });
    console.log('  ✅ Instalação OK');
    await delay(1500);
    await shot(page, 'pre-tipo-doc');

    // FASE 11: TIPO DOCUMENTO (CNH)
    console.log('\n[9] Tipo documento (CNH)...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1000);
    const combos = await page.locator('[role="combobox"]').all();
    for (const combo of combos) {
      if (!await combo.isVisible().catch(() => false)) continue;
      const ctx = await combo.evaluate(el => {
        const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement?.parentElement;
        return (p?.textContent || '').toLowerCase();
      }).catch(() => '');
      if (!ctx.includes('tipo') && !ctx.includes('documento')) continue;
      await combo.scrollIntoViewIfNeeded().catch(() => {});
      await combo.click({ force: true });
      await delay(1000);
      const opts = await page.locator('li[role="option"]').all();
      for (const opt of opts) {
        if ((await opt.textContent().catch(() => '')).trim() === 'CNH') {
          await opt.click({ force: true });
          console.log('  ✅ CNH selecionada');
          break;
        }
      }
      break;
    }
    await delay(3000);
    await shot(page, 'apos-tipo-doc');

    // MAPEAR TUDO QUE APARECEU
    await mapear(page, 'APÓS TIPO DOC');

    // FASE 12: UPLOAD CNH (frente)
    console.log('\n[10] Upload CNH frente...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);

    // Verificar inputs file
    const files = await page.locator('input[type="file"]').all();
    console.log(`  📊 ${files.length} input(s) file:`);
    for (let i = 0; i < files.length; i++) {
      const nm = await files[i].getAttribute('name').catch(() => '');
      const id = await files[i].getAttribute('id').catch(() => '');
      const acc = await files[i].getAttribute('accept').catch(() => '');
      console.log(`  [${i}] name="${nm}" id="${id}" accept="${acc}"`);
    }

    // Criar imagem fake para teste (1x1 pixel JPEG)
    const fakeJpg = `${DIR}/fake-cnh.jpg`;
    if (!existsSync(fakeJpg)) {
      const buf = Buffer.from([
        0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
        0x00,0x01,0x00,0x00,0xff,0xdb,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
        0x07,0x07,0x07,0x09,0x09,0x08,0x0a,0x0c,0x14,0x0d,0x0c,0x0b,0x0b,0x0c,0x19,0x12,
        0x13,0x0f,0x14,0x1d,0x1a,0x1f,0x1e,0x1d,0x1a,0x1c,0x1c,0x20,0x24,0x2e,0x27,0x20,
        0x22,0x2c,0x23,0x1c,0x1c,0x28,0x37,0x29,0x2c,0x30,0x31,0x34,0x34,0x34,0x1f,0x27,
        0x39,0x3d,0x38,0x32,0x3c,0x2e,0x33,0x34,0x32,0xff,0xc0,0x00,0x0b,0x08,0x00,0x01,
        0x00,0x01,0x01,0x01,0x11,0x00,0xff,0xc4,0x00,0x1f,0x00,0x00,0x01,0x05,0x01,0x01,
        0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
        0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0xff,0xda,0x00,0x08,0x01,0x01,0x00,0x00,0x3f,
        0x00,0x7b,0x94,0x11,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xff,0xd9
      ]);
      writeFileSync(fakeJpg, buf);
    }

    // Upload frente
    const frente = page.locator('#personalDocumentFileFront, input[name="personalDocumentFileFront"]').first();
    if (await frente.count() > 0) {
      await frente.setInputFiles(fakeJpg);
      console.log('  ✅ CNH frente uploaded');
      await delay(3000);
    } else {
      // Fallback: primeiro input file
      if (files.length > 0) {
        await files[0].setInputFiles(fakeJpg);
        console.log('  ✅ CNH frente uploaded (fallback 1º input)');
        await delay(3000);
      }
    }
    await shot(page, 'apos-upload-cnh');

    // MAPEAR O QUE APARECEU APÓS UPLOAD
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await mapear(page, 'APÓS UPLOAD CNH');
    await shot(page, 'apos-upload-mapeado');

    // FASE 13: CONTA DE ENERGIA (se aparecer)
    console.log('\n[11] Conta de energia...');
    const contaFiles = await page.locator('input[type="file"]').all();
    console.log(`  📊 ${contaFiles.length} input(s) file agora:`);
    for (let i = 0; i < contaFiles.length; i++) {
      const nm = await contaFiles[i].getAttribute('name').catch(() => '');
      const id = await contaFiles[i].getAttribute('id').catch(() => '');
      console.log(`  [${i}] name="${nm}" id="${id}"`);
    }

    // Upload conta (se houver input file para conta)
    const contaInput = page.locator('#energyBillFile, input[name="energyBillFile"], input[name*="bill" i], input[name*="conta" i], input[name*="energy" i]').first();
    if (await contaInput.count() > 0) {
      await contaInput.setInputFiles(fakeJpg);
      console.log('  ✅ Conta uploaded');
      await delay(3000);
    } else if (contaFiles.length >= 2) {
      // Último input file pode ser a conta
      await contaFiles[contaFiles.length - 1].setInputFiles(fakeJpg);
      console.log('  ✅ Conta uploaded (último input)');
      await delay(3000);
    }
    await shot(page, 'apos-upload-conta');

    // MAPEAR APÓS CONTA
    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(2000);
    await mapear(page, 'APÓS UPLOAD CONTA');

    // FASE 14: PERGUNTAS
    console.log('\n[12] Perguntas...');
    let resp = 0;
    // Radios "Não"
    for (const r of await page.locator('input[type="radio"]').all()) {
      if (!await r.isVisible().catch(() => false)) continue;
      const val = await r.getAttribute('value').catch(() => '');
      const name = await r.getAttribute('name').catch(() => '');
      console.log(`  radio: name="${name}" value="${val}"`);
    }
    // Clicar em todos "Não"
    for (const r of await page.locator('input[type="radio"][value="nao"], input[type="radio"][value="Não"], input[type="radio"][value="false"], input[type="radio"][value="no"]').all()) {
      if (!await r.isVisible().catch(() => false)) continue;
      await r.click({ force: true }).catch(() => {});
      resp++;
    }
    if (resp === 0) {
      for (const l of await page.locator('label:has-text("Não")').all()) {
        if (!await l.isVisible().catch(() => false)) continue;
        await l.click({ force: true }).catch(() => {});
        resp++;
      }
    }
    console.log(`  ✅ ${resp} perguntas respondidas`);
    await delay(1500);
    await shot(page, 'apos-perguntas');

    // MAPEAR APÓS PERGUNTAS
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
    await mapear(page, 'ESTADO FINAL');
    await shot(page, 'FINAL');

    // BOTÕES VISÍVEIS
    console.log('\n  === BOTÕES ===');
    for (const btn of await page.locator('button').all()) {
      if (!await btn.isVisible().catch(() => false)) continue;
      const txt = (await btn.textContent().catch(() => '')).trim();
      if (txt.length > 1) console.log(`  📍 "${txt}"`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ MAPEAMENTO COMPLETO');
    console.log('='.repeat(60));
    await delay(120000);
  } catch (err) {
    console.error('\n❌ ERRO:', err.message);
    await shot(page, 'ERRO');
    await mapear(page, 'ESTADO NO ERRO');
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
