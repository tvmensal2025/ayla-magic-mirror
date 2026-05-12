import { chromium } from 'playwright-chromium';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
await page.goto('https://digital.igreenenergy.com.br/?id=124170&sendcontract=true', { waitUntil: 'networkidle', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
console.log('=== TELA 1: SIMULADOR ===');
const inputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input, [role="combobox"], select, textarea, button')).filter(el => el.offsetParent !== null).map(el => ({
    tag: el.tagName, type: el.type||'', name: el.name||'', placeholder: el.getAttribute('placeholder')||'', text: (el.textContent||'').trim().slice(0,50), value: el.value||''
  }));
});
for (const i of inputs) console.log(JSON.stringify(i));
await browser.close();
