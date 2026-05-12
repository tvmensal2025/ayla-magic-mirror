import { chromium } from 'playwright-chromium';
const delay = ms => new Promise(r => setTimeout(r, ms));
const URL = 'https://digital.igreenenergy.com.br/?id=124170&sendcontract=true';

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. Abrir portal
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(2000);

  // 2. Preencher CEP + valor
  await page.locator('input[name="cep"]').first().fill('13323072');
  await page.locator('input[name="consumption"]').first().fill('350');
  await delay(500);

  // 3. Calcular
  await page.locator('button:has-text("Calcular")').first().click();
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await delay(2000);

  // 4. Garantir desconto
  await page.locator('button:has-text("Garantir")').first().click();
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await delay(2000);

  // 5. CPF
  const cpfInput = page.locator('input[name="documentNumber"]').first();
  await cpfInput.fill('43728802867');
  await delay(8000); // esperar Receita

  // 6. DUMP de TODOS os inputs visíveis
  console.log('\n=== DUMP DE TODOS OS INPUTS VISÍVEIS ===\n');
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, [role="combobox"], textarea')).map(el => ({
      tag: el.tagName,
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      placeholder: el.getAttribute('placeholder') || '',
      value: el.value || '',
      visible: el.offsetParent !== null,
      id: el.id || '',
      className: (el.className || '').toString().slice(0, 80),
      role: el.getAttribute('role') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      parentText: (el.parentElement?.textContent || '').trim().slice(0, 60),
    }));
  });

  for (const inp of inputs) {
    if (!inp.visible) continue;
    console.log(`  [${inp.tag}] name="${inp.name}" placeholder="${inp.placeholder}" type="${inp.type}" value="${inp.value}" id="${inp.id}" role="${inp.role}" aria="${inp.ariaLabel}"`);
  }

  console.log(`\n  Total visíveis: ${inputs.filter(i => i.visible).length}`);

  await page.screenshot({ path: './teste-e2e-screenshots/debug-inputs.png', fullPage: true });
  await browser.close();
  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
