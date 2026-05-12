/**
 * TESTE REAL - Portal iGreen
 * Dados: Humberto Vieira e Silva
 * Seletores confirmados via simulação: TODOS por name=
 */
import { chromium } from './node_modules/playwright-chromium/index.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const DIR = './teste-screenshots';
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
const shot = async (page, nome) => {
  n++;
  const f = `${DIR}/${String(n).padStart(2,'0')}-${nome}.png`;
  await page.screenshot({ path: f, fullPage: true }).catch(() => {});
  console.log(`📸 ${f}`);
};

const D = {
  cpf: '33277354172',
  whatsapp: '11971254913',
  email: 'tvmensal11@gmail.com',
  cep: '13309410',
  valor: '205',
  numero: '182',
  instalacao: '2095855191',
};

async function main() {
  console.log('='.repeat(60));
  console.log('🎯 TESTE REAL - PORTAL IGREEN');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  try {
    // 1. ABRIR
    console.log('\n[1] Abrindo portal...');
    await page.goto('https://digital.igreenenergy.com.br/?id=124170&sendcontract=true', { waitUntil: 'networkidle', timeout: 45000 });
    await delay(3000);
    await shot(page, 'portal');

    // 2. CEP + VALOR
    console.log('[2] CEP + Valor...');
    await page.locator('input[name="cep"]').fill(D.cep);
    console.log('  ✅ CEP: ' + D.cep);
    await page.locator('input[name="consumption"]').fill(D.valor);
    console.log('  ✅ Valor: ' + D.valor);
    await page.locator('button[type="submit"]').click();
    await delay(4000);
    await shot(page, 'calcular');
    console.log('  ✅ Calcular OK');

    // 3. GARANTIR
    console.log('[3] Garantir desconto...');
    const garantir = page.locator('button:has-text("Garantir")').first();
    if (await garantir.count() > 0) {
      await garantir.click();
      await delay(4000);
      console.log('  ✅ Garantir OK');
    }
    await shot(page, 'garantir');

    // 4. CPF
    console.log('[4] CPF...');
    await page.waitForSelector('input[name="documentNumber"]', { timeout: 15000 });
    const cpfField = page.locator('input[name="documentNumber"]');
    await cpfField.click();
    await cpfField.type(D.cpf, { delay: 100 });
    await page.keyboard.press('Tab');
    console.log('  ✅ CPF: ' + D.cpf);
    await delay(8000); // aguardar Receita Federal
    await shot(page, 'cpf-autofill');

    // Verificar auto-fill
    const nome = await page.locator('input[name="name"]').inputValue().catch(() => '');
    const nasc = await page.locator('input[name="birthDate"]').inputValue().catch(() => '');
    console.log(`  📥 Auto-fill: Nome="${nome}" Nasc="${nasc}"`);

    // Tratar CPF já cadastrado
    const novoBtn = page.locator('button:has-text("novo cadastro")').first();
    if (await novoBtn.count() > 0 && await novoBtn.isVisible().catch(() => false)) {
      await novoBtn.click();
      await delay(3000);
      console.log('  ⚠️  CPF duplicado → novo cadastro');
    }

    // 5. WHATSAPP
    console.log('[5] WhatsApp...');
    await page.waitForSelector('input[name="phone"]', { timeout: 15000 });
    const phoneField = page.locator('input[name="phone"]');
    await phoneField.click();
    await phoneField.type(D.whatsapp, { delay: 80 });
    await page.keyboard.press('Tab');
    await delay(500);
    const phoneVal = await phoneField.inputValue().catch(() => '');
    console.log(`  ✅ WhatsApp: ${phoneVal}`);

    // 6. CONFIRME CELULAR
    console.log('[6] Confirme celular...');
    await page.waitForSelector('input[name="phoneConfirm"]', { timeout: 10000 });
    const phoneConfirm = page.locator('input[name="phoneConfirm"]');
    await phoneConfirm.click();
    await phoneConfirm.type(D.whatsapp, { delay: 80 });
    await page.keyboard.press('Tab');
    await delay(500);
    const phoneConfVal = await phoneConfirm.inputValue().catch(() => '');
    console.log(`  ✅ Confirme: ${phoneConfVal}`);
    await shot(page, 'telefone');

    // 7. EMAIL
    console.log('[7] Email...');
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    const emailField = page.locator('input[name="email"]');
    await emailField.click();
    await emailField.type(D.email, { delay: 60 });
    await page.keyboard.press('Tab');
    await delay(500);
    console.log(`  ✅ Email: ${await emailField.inputValue().catch(() => '')}`);

    // 8. CONFIRME EMAIL
    console.log('[8] Confirme email...');
    await page.waitForSelector('input[name="emailConfirm"]', { timeout: 10000 });
    const emailConfirm = page.locator('input[name="emailConfirm"]');
    await emailConfirm.click();
    await emailConfirm.type(D.email, { delay: 60 });
    await page.keyboard.press('Tab');
    await delay(500);
    console.log(`  ✅ Confirme email: ${await emailConfirm.inputValue().catch(() => '')}`);
    await shot(page, 'email');

    // 9. ENDEREÇO (número)
    console.log('[9] Número endereço...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await page.waitForSelector('input[name="number"]', { timeout: 10000 });
    const numField = page.locator('input[name="number"]');
    await numField.click();
    await numField.type(D.numero, { delay: 80 });
    console.log(`  ✅ Número: ${D.numero}`);

    // Verificar endereço auto-preenchido
    const endereco = await page.locator('input[name="address"]').inputValue().catch(() => '');
    const bairro = await page.locator('input[name="neighborhood"]').inputValue().catch(() => '');
    const cidade = await page.locator('input[name="city"]').inputValue().catch(() => '');
    console.log(`  📥 Endereço: ${endereco}, ${bairro}, ${cidade}`);
    await shot(page, 'endereco');

    // 10. INSTALAÇÃO
    console.log('[10] Número instalação...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await page.waitForSelector('input[name="installationNumber"]', { timeout: 10000 });
    const instField = page.locator('input[name="installationNumber"]');
    await instField.click();
    await instField.type(D.instalacao, { delay: 80 });
    console.log(`  ✅ Instalação: ${D.instalacao}`);
    await delay(2000);

    // Verificar se instalação duplicada
    const dupText = await page.textContent('body').catch(() => '');
    if (/instalação.*já.*cadastrad/i.test(dupText) || /número.*já.*cadastrad/i.test(dupText)) {
      console.log('  ⚠️  Instalação duplicada detectada!');
    }
    await shot(page, 'instalacao');

    // 11. TIPO DOCUMENTO (aparece logo após instalação — NÃO clicar "clique aqui")
    console.log('[11] Tipo documento (CNH)...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);

    // O dropdown é um MUI Select: div[role="combobox"] com input[name="document_type"]
    const docTypeCombo = page.locator('[role="combobox"]').filter({ has: page.locator('~ input[name="document_type"]') }).first();
    // Fallback: buscar pelo contexto "Tipo documento"
    let docTypeClicked = false;
    const allCombos = await page.locator('[role="combobox"], .MuiSelect-select').all();
    for (const combo of allCombos) {
      if (!await combo.isVisible().catch(() => false)) continue;
      const ctx = await combo.evaluate(el => {
        const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement?.parentElement;
        return (p?.textContent || '').toLowerCase();
      }).catch(() => '');
      if (!ctx.includes('tipo') && !ctx.includes('documento')) continue;
      
      await combo.scrollIntoViewIfNeeded().catch(() => {});
      await combo.click({ force: true });
      await delay(1000);
      console.log('  📋 Dropdown aberto, buscando CNH...');
      
      // Listar opções
      const opts = await page.locator('li[role="option"], [role="option"]').all();
      for (const opt of opts) {
        const txt = (await opt.textContent().catch(() => '')).trim();
        console.log(`    opção: "${txt}"`);
      }
      
      // Selecionar CNH
      for (const opt of opts) {
        const txt = (await opt.textContent().catch(() => '')).trim();
        if (txt === 'CNH' || txt.includes('CNH')) {
          await opt.click({ force: true });
          console.log(`  ✅ Tipo documento: ${txt}`);
          docTypeClicked = true;
          break;
        }
      }
      break;
    }
    if (!docTypeClicked) console.warn('  ⚠️  Tipo documento não selecionado');
    await delay(2000);
    await shot(page, 'tipo-doc');

    // 12. MAPEAR O QUE APARECEU APÓS TIPO DOCUMENTO
    console.log('\n[12] Mapeando campos após tipo documento...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);

    const tela2 = await page.evaluate(() => {
      const result = [];
      document.querySelectorAll('input, [role="combobox"], [role="radio"]').forEach(e => {
        if (e.offsetParent === null) return;
        const parent = e.closest('.MuiFormControl-root') || e.parentElement?.parentElement?.parentElement;
        const label = parent?.querySelector('label');
        result.push({
          tag: e.tagName, type: e.getAttribute('type') || '',
          name: e.getAttribute('name') || '', role: e.getAttribute('role') || '',
          label: label?.textContent?.trim() || '',
          value: e.value || e.textContent?.trim().substring(0, 50) || '',
          accept: e.getAttribute('accept') || ''
        });
      });
      document.querySelectorAll('button').forEach(b => {
        if (b.offsetParent !== null) result.push({ tag: 'BUTTON', text: b.textContent?.trim().substring(0, 40) });
      });
      document.querySelectorAll('h1, h2, h3, p, span').forEach(el => {
        const t = el.textContent?.trim();
        if (el.offsetParent !== null && t && t.length > 3 && t.length < 100) {
          result.push({ tag: el.tagName, text: t.substring(0, 80) });
        }
      });
      return result;
    });
    console.log('  === ELEMENTOS APÓS TIPO DOC ===');
    tela2.forEach(e => console.log(`  ${JSON.stringify(e)}`));
    await shot(page, 'apos-tipo-doc');

    // 13. UPLOAD DOCUMENTOS (se input file apareceu)
    console.log('\n[13] Upload documentos...');
    const fileInputs = await page.locator('input[type="file"]').all();
    console.log(`  📊 ${fileInputs.length} input(s) file`);
    for (let i = 0; i < fileInputs.length; i++) {
      const accept = await fileInputs[i].getAttribute('accept').catch(() => '');
      const name = await fileInputs[i].getAttribute('name').catch(() => '');
      const id = await fileInputs[i].getAttribute('id').catch(() => '');
      console.log(`  [${i}] name="${name}" id="${id}" accept="${accept}"`);
    }

    // 14. DISTRIBUIDORA (se aparecer)
    console.log('[14] Distribuidora...');
    for (const combo of await page.locator('[role="combobox"], .MuiSelect-select').all()) {
      if (!await combo.isVisible().catch(() => false)) continue;
      const ctx = await combo.evaluate(el => {
        const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
        return (p?.textContent || '').toLowerCase();
      }).catch(() => '');
      if (!ctx.includes('distribuidora')) continue;
      await combo.click({ force: true });
      await delay(1000);
      const opts = await page.locator('li[role="option"]').all();
      console.log(`  📋 ${opts.length} opções`);
      for (const opt of opts) {
        const txt = (await opt.textContent().catch(() => '')).toLowerCase();
        if (txt.includes('cpfl') || txt.includes('piratininga')) {
          await opt.click({ force: true });
          console.log(`  ✅ Distribuidora: ${await opt.textContent().catch(() => '')}`);
          break;
        }
      }
      break;
    }
    await delay(1500);

    // 15. PERGUNTAS (todas "Não")
    console.log('[15] Perguntas...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(1500);
    let respondidas = 0;
    for (const r of await page.locator('input[type="radio"][value="nao"], input[type="radio"][value="Não"], input[type="radio"][value="false"]').all()) {
      if (!await r.isVisible().catch(() => false)) continue;
      await r.click({ force: true }).catch(() => {});
      respondidas++;
    }
    if (respondidas === 0) {
      for (const l of await page.locator('label:has-text("Não"), [role="radio"]:has-text("Não")').all()) {
        if (!await l.isVisible().catch(() => false)) continue;
        await l.click({ force: true }).catch(() => {});
        respondidas++;
      }
    }
    console.log(`  ✅ ${respondidas} perguntas respondidas`);

    // 16. BOTÃO FINALIZAR (NÃO CLICAR — só mapear)
    console.log('[16] Botão finalizar...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
    const allBtns = await page.locator('button').all();
    for (const btn of allBtns) {
      if (!await btn.isVisible().catch(() => false)) continue;
      const txt = (await btn.textContent().catch(() => '')).trim();
      if (txt.length > 2 && txt.length < 40) console.log(`  📍 Botão: "${txt}"`);
    }

    // MAPEAMENTO FINAL
    console.log('\n[FINAL] Estado completo:');
    const camposFinal = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, [role="combobox"]'))
        .filter(e => e.offsetParent !== null)
        .map(e => ({
          name: e.getAttribute('name') || '',
          label: (e.closest('.MuiFormControl-root') || e.parentElement?.parentElement)?.querySelector('label')?.textContent?.trim() || '',
          value: e.value || e.textContent?.trim() || '',
        }));
    });
    camposFinal.forEach(c => console.log(`  ${c.value && c.value !== '​' ? '✅' : '❌'} ${c.label || c.name}: "${c.value}"`));
    await shot(page, 'FINAL');

    console.log('\n' + '='.repeat(60));
    console.log('✅ TESTE COMPLETO — CHEGOU AO FINAL');
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
