/**
 * TESTE RÁPIDO v4 — nomes REAIS dos inputs do portal MUI
 * Descobertos: cep, consumption, documentNumber, name, birthDate, phone, phoneConfirm
 * Restantes: descobrir via dump progressivo
 */
import { chromium } from 'playwright-chromium';
const delay = ms => new Promise(r => setTimeout(r, ms));

const CPF = '43728802867';
const CEP = '13323072';
const WHATSAPP = '11999887766';
const EMAIL = 'teste.ficticio@email.com';
const NUM_ENDERECO = '100';
const COMPLEMENTO = 'Apto 1';
const NUM_INSTALACAO = '9999999999';
const VALOR_CONTA = '350';
const URL = `https://digital.igreenenergy.com.br/?id=124170&sendcontract=true`;

async function fill(page, name, value, label) {
  const sel = `input[name="${name}"]`;
  try {
    await page.waitForSelector(sel, { state: 'visible', timeout: 8000 });
    const loc = page.locator(sel).first();
    await loc.click();
    await loc.fill('');
    await loc.pressSequentially(value, { delay: 25 });
    await loc.press('Tab');
    await delay(150);
    const val = await loc.inputValue().catch(() => '');
    console.log(`  ✅ ${label}: "${val}"`);
    return true;
  } catch {
    console.log(`  ❌ ${label} (name="${name}"): não encontrado`);
    return false;
  }
}

async function dump(page, label) {
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input, [role="combobox"]'))
      .filter(el => el.offsetParent !== null)
      .map(el => el.getAttribute('name') || el.getAttribute('role') || '?')
  );
  console.log(`  📋 [${label}] inputs: ${inputs.join(', ')}`);
  return inputs;
}

async function run() {
  console.log('🚀 Abrindo...\n');
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  try {
    console.log('[1] Portal + Simulador...');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(1000);
    await fill(page, 'cep', CEP, 'CEP');
    await fill(page, 'consumption', VALOR_CONTA, 'Valor');
    await page.locator('button:has-text("Calcular")').first().click();
    await delay(2000);

    console.log('[2] Garantir desconto...');
    await page.locator('button:has-text("Garantir meu desconto")').first().click();
    await delay(2000);

    console.log('[3] CPF + Receita...');
    await fill(page, 'documentNumber', CPF, 'CPF');
    for (let i = 0; i < 20; i++) {
      await delay(500);
      const n = await page.locator('input[name="name"]').first().inputValue().catch(() => '');
      if (n.length > 2) { console.log(`  ✅ Nome: "${n}"`); break; }
    }
    await dump(page, 'pós-CPF');

    console.log('[4] Telefone...');
    await fill(page, 'phone', WHATSAPP, 'WhatsApp');
    await fill(page, 'phoneConfirm', WHATSAPP, 'Confirme cel');
    await dump(page, 'pós-telefone');

    console.log('[5] Email...');
    await fill(page, 'email', EMAIL, 'Email');
    // Esperar campo confirme email aparecer
    await delay(500);
    await dump(page, 'pós-email');
    await fill(page, 'emailConfirm', EMAIL, 'Confirme email');
    // Se não achou, tentar confirmEmail
    if (!(await page.locator('input[name="emailConfirm"]').count())) {
      await fill(page, 'confirmEmail', EMAIL, 'Confirme email (alt)');
    }
    await delay(1000);
    await dump(page, 'pós-confirme-email');

    console.log('[6] Endereço...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(1000);
    await dump(page, 'endereço');
    // Tentar nomes comuns para número
    await fill(page, 'number', NUM_ENDERECO, 'Número');
    if (!(await page.locator('input[name="number"]:visible').count())) {
      await fill(page, 'addressNumber', NUM_ENDERECO, 'Número (alt)');
    }
    await fill(page, 'complement', COMPLEMENTO, 'Complemento');

    console.log('[7] Instalação...');
    await dump(page, 'pré-instalação');
    await fill(page, 'installationNumber', NUM_INSTALACAO, 'Nº Instalação');
    if (!(await page.locator('input[name="installationNumber"]:visible').count())) {
      await fill(page, 'installation', NUM_INSTALACAO, 'Nº Instalação (alt)');
    }

    console.log('[8] Tipo Doc + Perguntas...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(500);
    await dump(page, 'pré-doc');

    const combos = await page.locator('[role="combobox"]:visible').all();
    for (const c of combos) {
      await c.click();
      await delay(400);
      const cnh = page.locator('li[role="option"]').filter({ hasText: 'CNH' });
      if (await cnh.count() > 0) { await cnh.click(); console.log('  ✅ Tipo: CNH'); break; }
      await page.keyboard.press('Escape');
    }

    const nao = await page.locator('label:has-text("Não"):visible').all();
    for (const l of nao) await l.click({ force: true }).catch(() => {});
    console.log(`  Perguntas "Não": ${nao.length}`);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(500);
    await page.screenshot({ path: './teste-e2e-screenshots/v4-final.png', fullPage: true });
    await dump(page, 'FINAL');

    const fin = page.locator('button:has-text("Finalizar")').first();
    const vis = await fin.count() > 0 && await fin.isVisible().catch(() => false);
    console.log(`\n${vis ? '✅' : '⚠️'} Finalizar: ${vis ? (await fin.isEnabled() ? 'HABILITADO' : 'DESABILITADO') : 'não encontrado'}`);

    console.log('\n🏁 Pronto. Ctrl+C para fechar.\n');
    await new Promise(() => {});
  } catch (err) {
    console.error(`\n❌ ERRO: ${err.message}`);
    await page.screenshot({ path: './teste-e2e-screenshots/v4-ERRO.png', fullPage: true }).catch(() => {});
    await browser.close();
    process.exit(1);
  }
}
run();
