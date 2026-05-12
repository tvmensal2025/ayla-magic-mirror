/**
 * TESTE COMPLETO v5 — preenche tudo, tira print em cada etapa, não fecha
 * Nomes reais: cep, consumption, documentNumber, name, birthDate,
 *   phone, phoneConfirm, email, emailConfirm, address, number,
 *   neighborhood, city, state(combobox), complement, installationNumber,
 *   document_type(combobox)
 */
import { chromium } from 'playwright-chromium';
import { existsSync, mkdirSync } from 'fs';

const SHOTS = './screenshots/teste-completo';
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

const delay = ms => new Promise(r => setTimeout(r, ms));
let shotN = 0;

const CPF = '43728802867';
const CEP = '13323072';
const WHATSAPP = '11999887766';
const EMAIL = 'teste.ficticio@email.com';
const NUM = '100';
const COMPL = 'Apto 1';
const INST = '9999999999';
const VALOR = '350';
const URL_P = 'https://digital.igreenenergy.com.br/?id=124170&sendcontract=true';

// Fixture: imagem JPEG mínima 1x1 para upload
const JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAFBABAAAAAAAAAAAAAAAAAAAACf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKgA/9k=';

async function shot(page, label) {
  shotN++;
  const f = `${SHOTS}/${String(shotN).padStart(2,'0')}-${label}.png`;
  await page.screenshot({ path: f, fullPage: true }).catch(() => {});
  console.log(`  📸 ${String(shotN).padStart(2,'0')}-${label}.png`);
}

async function fill(page, name, value, label) {
  try {
    await page.waitForSelector(`input[name="${name}"]`, { state: 'visible', timeout: 8000 });
    const loc = page.locator(`input[name="${name}"]`).first();
    await loc.click();
    await loc.fill('');
    await loc.pressSequentially(value, { delay: 20 });
    await loc.press('Tab');
    await delay(150);
    const v = await loc.inputValue().catch(() => '');
    console.log(`  ✅ ${label}: "${v}"`);
    return true;
  } catch {
    console.log(`  ❌ ${label} (name="${name}")`);
    return false;
  }
}

async function dump(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input,[role="combobox"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => el.getAttribute('name') || el.getAttribute('role') || '?')
  );
}

async function run() {
  console.log('🚀 Abrindo navegador...\n');
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  // ── ETAPA 1: Simulador ──
  console.log('═══ ETAPA 1: Simulador ═══');
  await page.goto(URL_P, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(1000);
  await shot(page, 'portal-aberto');

  await fill(page, 'cep', CEP, 'CEP');
  await fill(page, 'consumption', VALOR, 'Valor');
  await page.locator('button:has-text("Calcular")').first().click();
  await delay(2000);
  await shot(page, 'apos-calcular');

  await page.locator('button:has-text("Garantir meu desconto")').first().click();
  await delay(2000);
  await shot(page, 'apos-garantir');

  // ── ETAPA 2: CPF ──
  console.log('\n═══ ETAPA 2: CPF + Receita ═══');
  await fill(page, 'documentNumber', CPF, 'CPF');
  for (let i = 0; i < 20; i++) {
    await delay(500);
    const n = await page.locator('input[name="name"]').first().inputValue().catch(() => '');
    if (n.length > 2) { console.log(`  ✅ Auto-fill: "${n}"`); break; }
    if (i === 19) console.log('  ⚠️ Nome não preencheu');
  }
  await shot(page, 'apos-cpf');

  // ── ETAPA 3: Telefone ──
  console.log('\n═══ ETAPA 3: Telefone ═══');
  await fill(page, 'phone', WHATSAPP, 'WhatsApp');
  await fill(page, 'phoneConfirm', WHATSAPP, 'Confirme cel');
  await shot(page, 'apos-telefone');

  // ── ETAPA 4: Email ──
  console.log('\n═══ ETAPA 4: Email ═══');
  await fill(page, 'email', EMAIL, 'Email');
  await fill(page, 'emailConfirm', EMAIL, 'Confirme email');
  await delay(1000);
  await shot(page, 'apos-email');

  // ── ETAPA 5: Endereço ──
  console.log('\n═══ ETAPA 5: Endereço ═══');
  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(800);
  // CEP, address, neighborhood, city, state já auto-preenchidos
  const addr = await page.locator('input[name="address"]').first().inputValue().catch(() => '');
  const bairro = await page.locator('input[name="neighborhood"]').first().inputValue().catch(() => '');
  const cidade = await page.locator('input[name="city"]').first().inputValue().catch(() => '');
  console.log(`  📍 Auto: "${addr}", "${bairro}", "${cidade}"`);
  await fill(page, 'number', NUM, 'Número');
  await fill(page, 'complement', COMPL, 'Complemento');
  await shot(page, 'apos-endereco');

  // ── ETAPA 6: Instalação ──
  console.log('\n═══ ETAPA 6: Nº Instalação ═══');
  await fill(page, 'installationNumber', INST, 'Nº Instalação');
  await delay(500);
  await shot(page, 'apos-instalacao');

  // ── ETAPA 7: Tipo Documento ──
  console.log('\n═══ ETAPA 7: Tipo Documento ═══');
  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(500);
  
  // O combobox de tipo documento é o ÚLTIMO [role="combobox"] visível
  // (o primeiro é o de Estado, auto-preenchido pelo CEP)
  const allCombos = await page.locator('[role="combobox"]:visible').all();
  console.log(`  Comboboxes visíveis: ${allCombos.length}`);
  if (allCombos.length > 0) {
    const tipoDocCombo = allCombos[allCombos.length - 1]; // último
    await tipoDocCombo.scrollIntoViewIfNeeded();
    await delay(300);
    await tipoDocCombo.click();
    await delay(600);
    
    // Selecionar CNH
    const cnhOption = page.locator('li[role="option"]').filter({ hasText: 'CNH' });
    if (await cnhOption.count() > 0) {
      await cnhOption.click();
      console.log('  ✅ Tipo: CNH selecionado');
    } else {
      // Listar opções disponíveis
      const opts = await page.locator('li[role="option"]').all();
      for (const o of opts) console.log(`    opção: "${await o.textContent()}"`);
      await page.keyboard.press('Escape');
      console.log('  ❌ CNH não encontrado nas opções');
    }
  }
  await delay(1500); // aguardar bloco de upload aparecer
  await shot(page, 'apos-tipo-doc');

  // ── ETAPA 8: Upload Documento (CNH = só Frente) ──
  console.log('\n═══ ETAPA 8: Upload Documento ═══');
  const { writeFileSync: wf, existsSync: fe } = await import('fs');
  const { resolve: rp } = await import('path');
  
  let imgPath;
  const fixtureReal = rp('./fixtures/cnh-frente.jpg');
  if (fe(fixtureReal)) {
    imgPath = fixtureReal;
    console.log('  Usando fixture real: fixtures/cnh-frente.jpg');
  } else {
    imgPath = '/tmp/teste-cnh-frente.jpg';
    wf(imgPath, Buffer.from(JPEG_B64, 'base64'));
    console.log('  Usando JPEG mínimo temporário');
  }

  await page.evaluate(() => window.scrollBy(0, 300));
  await delay(500);
  
  let fileInputs = page.locator('input[type="file"]');
  let fileCount = await fileInputs.count();
  console.log(`  Inputs file encontrados: ${fileCount}`);

  if (fileCount === 0) {
    console.log('  ⏳ Aguardando bloco de upload...');
    for (let i = 0; i < 10; i++) {
      await delay(1000);
      fileCount = await fileInputs.count();
      if (fileCount > 0) break;
    }
    console.log(`  Inputs file após espera: ${fileCount}`);
  }

  if (fileCount > 0) {
    await fileInputs.nth(0).setInputFiles(imgPath);
    console.log('  ✅ Upload Frente CNH');
    await delay(2000);
  } else {
    console.log('  ❌ Nenhum input file — bloco de upload não apareceu');
  }
  await shot(page, 'apos-upload-doc');

  // ── ETAPA 9: Perguntas + Conta de Energia ──
  console.log('\n═══ ETAPA 9: Perguntas + Conta de Energia ═══');
  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(1000);

  // hasProcurator = Não
  const procNao = page.locator('input[name="hasProcurator"][value="false"]');
  if (await procNao.count() > 0) {
    await procNao.click({ force: true });
    console.log('  ✅ Procurador: Não');
  }
  await delay(300);

  // Upload conta de energia (2º input file)
  const allFiles = page.locator('input[type="file"]');
  const totalFiles = await allFiles.count();
  console.log(`  Inputs file total: ${totalFiles}`);
  if (totalFiles >= 2) {
    const { existsSync: fe2 } = await import('fs');
    const { resolve: rp2 } = await import('path');
    let contaPath = imgPath;
    if (fe2(rp2('./fixtures/conta-energia.jpg'))) contaPath = rp2('./fixtures/conta-energia.jpg');
    else if (fe2(rp2('./fixtures/conta-energia.pdf'))) contaPath = rp2('./fixtures/conta-energia.pdf');
    console.log(`  Conta de energia: ${contaPath}`);
    await allFiles.nth(1).setInputFiles(contaPath);
    console.log('  ✅ Upload Conta de Energia');
    await delay(2000);
  }

  // energyBillPassword (opcional)
  const senhaInput = page.locator('input[name="energyBillPassword"]');
  if (await senhaInput.count() > 0 && await senhaInput.isVisible().catch(() => false)) {
    console.log('  ℹ️ Senha da conta: vazio (opcional)');
  }

  // hasPendingDebts = Não
  const debtNao = page.locator('input[name="hasPendingDebts"][value="false"]');
  if (await debtNao.count() > 0) {
    await debtNao.click({ force: true });
    console.log('  ✅ Débitos pendentes: Não');
  }
  await delay(500);
  await shot(page, 'apos-perguntas-conta');

  // ── ETAPA 10: Botão Finalizar ──
  console.log('\n═══ ETAPA 10: Botão Finalizar ═══');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(1000);
  await shot(page, 'pre-finalizar');

  // Dump estado
  const allInputsFinal = await dump(page);
  console.log(`  Inputs: ${allInputsFinal.join(', ')}`);

  // Botões
  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ text: el.textContent.trim().slice(0, 60), disabled: el.disabled }))
  );
  for (const b of buttons) console.log(`  ${b.disabled ? '🔒' : '🟢'} "${b.text}"`);

  // Campos vazios
  const vazios = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input:not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'))
      .filter(el => el.offsetParent !== null && (!el.value || !el.value.trim()) && !el.readOnly)
      .map(el => ({ name: el.name, placeholder: el.placeholder }))
  );
  if (vazios.length > 0) {
    console.log(`  ⚠️ Campos vazios: ${vazios.length}`);
    for (const v of vazios) console.log(`    ⬜ name="${v.name}"`);
  } else {
    console.log('  ✅ Todos os campos preenchidos!');
  }

  // Radios não marcados
  const radioState = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[type="radio"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({ name: el.name, value: el.value, checked: el.checked }))
  );
  console.log('  Radios:');
  for (const r of radioState) console.log(`    ${r.checked ? '🔘' : '⚪'} ${r.name}=${r.value}`);

  const finBtn = page.locator('button:has-text("Finalizar")').first();
  const finVis = await finBtn.count() > 0 && await finBtn.isVisible().catch(() => false);
  const finEnabled = finVis ? await finBtn.isEnabled().catch(() => false) : false;
  console.log(`\n  🎯 Finalizar: ${finVis ? (finEnabled ? '✅ HABILITADO' : '🔒 DESABILITADO') : '❌ NÃO ENCONTRADO'}`);

  // CLICAR FINALIZAR
  if (finEnabled) {
    console.log('  🚀 Clicando Finalizar...');
    await finBtn.click();
    await delay(5000);
    await shot(page, 'apos-finalizar');

    // Explorar o que apareceu após finalizar
    console.log('\n═══ PÓS-FINALIZAR ═══');
    const bodyText = await page.textContent('body').catch(() => '');
    
    // Verificar OTP
    if (/c[óo]digo|otp|verifica/i.test(bodyText)) {
      console.log('  📱 OTP/Código de verificação detectado!');
    }
    
    // Dump inputs novos
    const postInputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ name: el.name, type: el.type, placeholder: el.placeholder, value: el.value }))
    );
    console.log(`  Inputs pós-finalizar: ${postInputs.length}`);
    for (const i of postInputs) console.log(`    name="${i.name}" type="${i.type}" placeholder="${i.placeholder}" value="${i.value}"`);

    // Botões
    const postBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .filter(el => el.offsetParent !== null)
        .map(el => ({ text: el.textContent.trim().slice(0, 60), disabled: el.disabled }))
    );
    for (const b of postBtns) console.log(`    ${b.disabled ? '🔒' : '🟢'} "${b.text}"`);

    // URL atual
    console.log(`  URL: ${page.url()}`);
    
    // Texto relevante na página
    const relevantText = await page.evaluate(() => {
      const els = document.querySelectorAll('h1,h2,h3,h4,p,.MuiTypography-root,.MuiAlert-root,[role="alert"]');
      return Array.from(els).filter(el => el.offsetParent !== null && el.textContent.trim().length > 5)
        .map(el => el.textContent.trim().slice(0, 100));
    });
    console.log('  Textos na página:');
    for (const t of relevantText) console.log(`    📝 "${t}"`);

    await shot(page, 'pos-finalizar-explorado');
  }

  await shot(page, 'final');

  // ── RESUMO ──
  console.log('\n' + '═'.repeat(60));
  console.log('📊 MAPEAMENTO COMPLETO');
  console.log('═'.repeat(60));
  const finalDump = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input, [role="combobox"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => ({
        name: el.getAttribute('name') || '',
        type: el.type || el.getAttribute('role') || '',
        value: (el.value || '').slice(0, 40),
        readOnly: el.readOnly || false,
        checked: el.checked || undefined,
      }))
  );
  for (const f of finalDump) {
    const icon = f.type === 'radio' ? (f.checked ? '🔘' : '⚪') : f.value ? '✅' : '⬜';
    console.log(`  ${icon} name="${f.name}" type="${f.type}" value="${f.value}" ${f.readOnly ? '(ro)' : ''}`);
  }

  console.log('\n🏁 Navegador aberto. Ctrl+C para fechar.\n');
  await new Promise(() => {});
}

run().catch(e => { console.error('❌ FATAL:', e.message); process.exit(1); });
