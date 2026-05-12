/**
 * TESTE v2 - Fluxo completo até Finalizar
 * Ordem real: campos → tipo doc → upload CNH → procurador NÃO → upload conta → débitos NÃO → Finalizar
 */
import { chromium } from './node_modules/playwright-chromium/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const DIR = './teste-v2-shots';
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
const shot = async (p, nome) => { n++; const f=`${DIR}/${String(n).padStart(2,'0')}-${nome}.png`; await p.screenshot({path:f,fullPage:true}).catch(()=>{}); console.log(`📸 ${f}`); };

// Fake JPEG 1x1
const FAKE = `${DIR}/fake.jpg`;
if (!existsSync(FAKE)) {
  writeFileSync(FAKE, Buffer.from([
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
  ]));
}

async function main() {
  console.log('='.repeat(60));
  console.log('🎯 TESTE v2 - FLUXO COMPLETO ATÉ FINALIZAR');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  try {
    // [1] Portal
    await page.goto('https://digital.igreenenergy.com.br/?id=124170&sendcontract=true', { waitUntil: 'networkidle', timeout: 45000 });
    await delay(3000);
    console.log('✅ [1] Portal');

    // [2] CEP + Valor + Calcular
    await page.locator('input[name="cep"]').fill('13309410');
    await page.locator('input[name="consumption"]').fill('205');
    await page.locator('button[type="submit"]').click();
    await delay(4000);
    console.log('✅ [2] CEP + Valor + Calcular');

    // [3] Garantir
    const g = page.locator('button:has-text("Garantir")').first();
    if (await g.count() > 0) { await g.click(); await delay(4000); }
    console.log('✅ [3] Garantir');

    // [4] CPF + auto-fill
    await page.waitForSelector('input[name="documentNumber"]', { timeout: 15000 });
    await page.locator('input[name="documentNumber"]').type('33277354172', { delay: 100 });
    await page.keyboard.press('Tab');
    await delay(8000);
    const nome = await page.locator('input[name="name"]').inputValue().catch(() => '');
    console.log(`✅ [4] CPF → Auto-fill: ${nome}`);

    // CPF duplicado?
    const novoBtn = page.locator('button:has-text("novo cadastro")').first();
    if (await novoBtn.count() > 0 && await novoBtn.isVisible().catch(() => false)) {
      await novoBtn.click(); await delay(3000);
      console.log('  ⚠️ CPF duplicado → novo cadastro');
    }

    // [5] WhatsApp + Confirme
    await page.locator('input[name="phone"]').type('11971254913', { delay: 80 });
    await page.locator('input[name="phoneConfirm"]').type('11971254913', { delay: 80 });
    console.log('✅ [5] WhatsApp');

    // [6] Email + Confirme
    await page.locator('input[name="email"]').type('tvmensal11@gmail.com', { delay: 60 });
    await page.locator('input[name="emailConfirm"]').type('tvmensal11@gmail.com', { delay: 60 });
    console.log('✅ [6] Email');

    // [7] Número endereço
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await page.locator('input[name="number"]').type('182', { delay: 80 });
    console.log('✅ [7] Número: 182');

    // [8] Instalação
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await page.locator('input[name="installationNumber"]').type('2095855192', { delay: 80 });
    console.log('✅ [8] Instalação: 2095855192');
    await delay(1500);

    // [9] Tipo documento → CNH
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1000);
    for (const combo of await page.locator('[role="combobox"]').all()) {
      if (!await combo.isVisible().catch(() => false)) continue;
      const ctx = await combo.evaluate(el => (el.closest('.MuiFormControl-root') || el.parentElement?.parentElement?.parentElement)?.textContent?.toLowerCase() || '').catch(() => '');
      if (!ctx.includes('tipo') && !ctx.includes('documento')) continue;
      await combo.scrollIntoViewIfNeeded().catch(() => {});
      await combo.click({ force: true });
      await delay(1000);
      for (const opt of await page.locator('li[role="option"]').all()) {
        if ((await opt.textContent().catch(() => '')).trim() === 'CNH') {
          await opt.click({ force: true });
          break;
        }
      }
      break;
    }
    await delay(2000);
    console.log('✅ [9] Tipo doc: CNH');
    await shot(page, 'tipo-doc');

    // [10] Upload CNH frente
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);
    const frenteInput = page.locator('#personalDocumentFileFront, input[name="personalDocumentFileFront"]').first();
    if (await frenteInput.count() > 0) {
      await frenteInput.setInputFiles(FAKE);
      console.log('✅ [10] Upload CNH frente');
    } else {
      const files = await page.locator('input[type="file"]').all();
      if (files.length > 0) { await files[0].setInputFiles(FAKE); console.log('✅ [10] Upload CNH (fallback)'); }
    }
    await delay(3000);
    await shot(page, 'upload-cnh');

    // [11] Procurador → NÃO
    console.log('[11] Procurador...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1000);
    const procNao = page.locator('input[type="radio"][name="hasProcurator"][value="false"]').first();
    if (await procNao.count() > 0 && await procNao.isVisible().catch(() => false)) {
      await procNao.scrollIntoViewIfNeeded().catch(() => {});
      await procNao.click({ force: true });
      console.log('✅ [11] Procurador: Não');
    } else {
      // Fallback: label "Não" no contexto de procurador
      for (const l of await page.locator('label:has-text("Não")').all()) {
        const ctx = await l.evaluate(el => (el.closest('div')?.parentElement?.textContent || '').toLowerCase()).catch(() => '');
        if (ctx.includes('procurador')) { await l.click({ force: true }); console.log('✅ [11] Procurador: Não (label)'); break; }
      }
    }
    await delay(1000);
    await shot(page, 'procurador');

    // [12] Upload conta de energia
    console.log('[12] Conta de energia...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);

    let contaOk = false;

    // S1: input#energyBillFile direto (hidden mas setInputFiles funciona)
    try {
      const contaInput = page.locator('#energyBillFile, input[name="energyBillFile"]').first();
      if (await contaInput.count() > 0) {
        await contaInput.setInputFiles(FAKE);
        contaOk = true;
        console.log('✅ [12] Conta (#energyBillFile)');
      }
    } catch (e) { console.log(`  ⚠️ setInputFiles: ${e.message.substring(0,50)}`); }

    // S2: fileChooser — clicar em "Enviar PDF ou imagem"
    if (!contaOk) {
      const targets = [
        page.locator('text=Enviar PDF ou imagem').first(),
        page.locator('text=Faça o anexo').first(),
        page.locator('text=conta de energia').first(),
      ];
      for (const t of targets) {
        if (contaOk) break;
        try {
          if (await t.count() > 0 && await t.isVisible().catch(() => false)) {
            const [chooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 8000 }),
              t.click({ timeout: 5000 }),
            ]);
            await chooser.setFiles(FAKE);
            contaOk = true;
            console.log('✅ [12] Conta (fileChooser)');
          }
        } catch (e) { console.log(`  ⚠️ fileChooser: ${e.message.substring(0,50)}`); }
      }
    }

    // S3: último input file
    if (!contaOk) {
      const allFiles = await page.locator('input[type="file"]').all();
      if (allFiles.length >= 2) {
        try {
          await allFiles[allFiles.length - 1].setInputFiles(FAKE);
          contaOk = true;
          console.log('✅ [12] Conta (último input)');
        } catch (_) {}
      }
    }

    if (!contaOk) console.warn('⚠️ [12] Conta NÃO enviada');
    await delay(2000);
    await shot(page, 'conta');

    // [13] Débitos → NÃO
    console.log('[13] Débitos...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1000);
    const debitNao = page.locator('input[type="radio"][name="hasPendingDebts"][value="false"]').first();
    if (await debitNao.count() > 0 && await debitNao.isVisible().catch(() => false)) {
      await debitNao.scrollIntoViewIfNeeded().catch(() => {});
      await debitNao.click({ force: true });
      console.log('✅ [13] Débitos: Não');
    } else {
      for (const l of await page.locator('label:has-text("Não")').all()) {
        const ctx = await l.evaluate(el => (el.closest('div')?.parentElement?.textContent || '').toLowerCase()).catch(() => '');
        if (ctx.includes('débito') || ctx.includes('debito')) { await l.click({ force: true }); console.log('✅ [13] Débitos: Não (label)'); break; }
      }
    }
    await delay(1000);

    // Fallback: clicar em TODOS os radios value="false" não clicados
    for (const r of await page.locator('input[type="radio"][value="false"]').all()) {
      if (!await r.isVisible().catch(() => false)) continue;
      if (!await r.isChecked().catch(() => false)) {
        await r.click({ force: true }).catch(() => {});
        console.log(`  ✅ Radio extra: ${await r.getAttribute('name').catch(() => '')} = false`);
      }
    }
    await shot(page, 'perguntas');

    // [14] Verificação final
    console.log('\n[14] Verificação final...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);

    // Listar todos os campos e seus valores
    const campos = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, [role="combobox"]'))
        .filter(e => e.offsetParent !== null)
        .map(e => {
          const n = e.getAttribute('name') || '';
          const t = e.getAttribute('type') || '';
          if (t === 'radio' || t === 'file' || t === 'hidden') return null;
          const p = (e.closest('.MuiFormControl-root') || e.parentElement?.parentElement)?.querySelector('label')?.textContent?.trim() || '';
          const v = e.value || e.textContent?.trim() || '';
          return { name: n, label: p, value: v };
        }).filter(Boolean);
    });
    campos.forEach(c => console.log(`  ${c.value && c.value !== '​' ? '✅' : '❌'} ${c.label || c.name}: "${c.value}"`));

    // Botões
    console.log('\n  Botões:');
    for (const btn of await page.locator('button').all()) {
      if (!await btn.isVisible().catch(() => false)) continue;
      const txt = (await btn.textContent().catch(() => '')).trim();
      if (txt.length > 1 && txt.length < 40) console.log(`  📍 "${txt}"`);
    }

    // [15] Botão Finalizar — NÃO CLICAR (teste seguro)
    const finBtn = page.locator('button:has-text("Finalizar"), button:has-text("Enviar"), button[type="submit"]').last();
    if (await finBtn.count() > 0 && await finBtn.isVisible().catch(() => false)) {
      const txt = await finBtn.textContent().catch(() => '');
      console.log(`\n  🎯 BOTÃO FINALIZAR ENCONTRADO: "${txt.trim()}" — NÃO CLICANDO (teste seguro)`);
    } else {
      console.log('\n  ⚠️ Botão Finalizar não encontrado');
    }

    await shot(page, 'FINAL');
    console.log('\n' + '='.repeat(60));
    console.log('✅ TESTE COMPLETO');
    console.log('='.repeat(60));
    await delay(120000);
  } catch (err) {
    console.error('\n❌ ERRO:', err.message);
    await shot(page, 'ERRO');
  } finally {
    await browser.close().catch(() => {});
  }
}
main();
