/**
 * SIMULAÇÃO COMPLETA DO PORTAL IGREEN
 * =====================================
 * Dados: Humberto Vieira e Silva (CNH + Conta CPFL)
 * Email: tvmensal11@gmail.com
 * Telefone: 11971254913
 *
 * Este script abre o portal real e preenche TODOS os campos,
 * fazendo screenshot de cada etapa para mapear o que existe.
 *
 * Uso: node simulate-form.mjs
 */

import { chromium } from 'playwright-chromium';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ─── DADOS REAIS DO CLIENTE ───────────────────────────────────────────────────
const CLIENTE = {
  // Portal URL (consultor 124661)
  portalUrl: 'https://digital.igreenenergy.com.br/?id=124661&sendcontract=true',

  // Tela 1: CEP + Valor
  cep: '13309-410',
  valorConta: '205',

  // Tela 2: CPF (auto-preenche nome + data nascimento via Receita)
  cpf: '33277354172',

  // Tela 3: Dados pessoais
  whatsapp: '11971254913',       // FALLBACK FIXO
  email: 'tvmensal11@gmail.com', // FALLBACK FIXO

  // Tela 4: Endereço (auto-preenchido pelo CEP, só precisa do número)
  numeroEndereco: '182',
  complemento: '',

  // Tela 5: Instalação + Distribuidora
  numeroInstalacao: '2095855190',
  distribuidora: 'CPFL',

  // Tela 6: Documento
  tipoDoc: 'CNH',  // CNH = só frente, sem verso

  // Tela 7: Perguntas (todas Não)
  possuiProcurador: false,
  pdfProtegido: false,
  debitosAberto: false,
  placasSolares: false,
};

const SCREENSHOTS_DIR = './screenshots/simulacao';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function screenshot(page, nome) {
  try {
    if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const path = join(SCREENSHOTS_DIR, `${String(Date.now()).slice(-6)}-${nome}.png`);
    await page.screenshot({ path, fullPage: true });
    // Salvar HTML também para inspecionar campos
    const htmlPath = join(SCREENSHOTS_DIR, `${String(Date.now()).slice(-6)}-${nome}.html`);
    writeFileSync(htmlPath, await page.content());
    console.log(`  📸 ${nome}`);
    return path;
  } catch (e) {
    console.warn(`  ⚠️  Screenshot falhou: ${e.message}`);
  }
}

async function scanAllFields(page, etapa) {
  const fields = await page.evaluate(() => {
    const result = [];
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const label = (() => {
        const id = el.id;
        if (id) {
          const lbl = document.querySelector(`label[for="${id}"]`);
          if (lbl) return lbl.textContent.trim();
        }
        const parent = el.closest('.MuiFormControl-root, .form-group, label');
        if (parent) return parent.textContent.replace(el.value || '', '').trim().slice(0, 60);
        return '';
      })();
      result.push({
        tag: el.tagName,
        type: el.type || '',
        placeholder: el.placeholder || '',
        name: el.name || '',
        id: el.id || '',
        value: el.value || '',
        label: label.slice(0, 60),
        visible: rect.width > 0,
        required: el.required,
      });
    });
    return result;
  });

  console.log(`\n  📋 CAMPOS ENCONTRADOS — ${etapa}:`);
  fields.forEach((f, i) => {
    const status = f.value ? '✅' : (f.required ? '❌' : '⬜');
    console.log(`    ${status} [${i}] ${f.tag}[${f.type}] ph="${f.placeholder}" name="${f.name}" label="${f.label}" val="${f.value}"`);
  });
  return fields;
}

async function typeInField(page, selector, value, label) {
  try {
    const el = page.locator(selector).first();
    if (await el.count() === 0 || !await el.isVisible().catch(() => false)) {
      console.log(`  ⚠️  Campo não encontrado: ${label} (${selector})`);
      return false;
    }
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click({ force: true });
    await el.evaluate(e => e.focus());
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await delay(80);
    await page.keyboard.type(String(value).replace(/\D/g, '').length > 0 && /cpf|cep|tel|phone|whats|celular/i.test(selector + label)
      ? String(value).replace(/\D/g, '')
      : String(value), { delay: 60 });
    await el.evaluate(e => e.dispatchEvent(new Event('blur', { bubbles: true })));
    await delay(200);
    const filled = await el.inputValue().catch(() => '');
    console.log(`  ✅ ${label}: "${filled}"`);
    return true;
  } catch (e) {
    console.warn(`  ❌ Erro ao preencher ${label}: ${e.message}`);
    return false;
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function simular() {
  console.log('\n' + '='.repeat(70));
  console.log('🎯 SIMULAÇÃO COMPLETA — PORTAL IGREEN');
  console.log('   Cliente: HUMBERTO VIEIRA E SILVA');
  console.log(`   Email: ${CLIENTE.email}`);
  console.log(`   Telefone: ${CLIENTE.whatsapp}`);
  console.log('='.repeat(70));

  const browser = await chromium.launch({
    headless: false, // VISÍVEL para mapear
    slowMo: 200,
    args: ['--no-sandbox', '--start-maximized'],
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 1: ABRIR PORTAL
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[1/14] Abrindo portal...');
    await page.goto(CLIENTE.portalUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(2000);
    await screenshot(page, '01-portal-aberto');
    await scanAllFields(page, 'TELA INICIAL');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 2: CEP + VALOR — usa name= (descoberto na simulação)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[2/14] CEP + Valor da conta...');

    // REAL: name="cep" e name="consumption" (sem placeholder)
    const cepOk = await typeInField(page, 'input[name="cep"]', CLIENTE.cep, 'CEP')
      || await typeInField(page, 'input[placeholder="CEP"]', CLIENTE.cep, 'CEP (ph)');

    const valorOk = await typeInField(page, 'input[name="consumption"]', CLIENTE.valorConta, 'Valor conta')
      || await typeInField(page, 'input[placeholder="Valor da conta"]', CLIENTE.valorConta, 'Valor conta (ph)');

    await delay(500);
    await screenshot(page, '02-cep-valor');

    // Botão Calcular
    console.log('  🖱️  Clicando Calcular...');
    const calcBtn = page.locator('button:has-text("Calcular")').first();
    if (await calcBtn.count() > 0) {
      await calcBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(3000);
    }
    await screenshot(page, '03-apos-calcular');
    await scanAllFields(page, 'APÓS CALCULAR');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 3: GARANTIR DESCONTO
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[3/14] Garantir desconto...');
    const garantirBtn = page.locator('button:has-text("Garantir meu desconto"), button:has-text("Garantir desconto")').first();
    if (await garantirBtn.count() > 0) {
      await garantirBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await delay(3000);
    }
    await screenshot(page, '04-apos-garantir');
    await scanAllFields(page, 'APÓS GARANTIR');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 4: CPF — usa name="documentNumber"
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[4/14] CPF...');
    await page.waitForSelector('input[name="documentNumber"]', { timeout: 15000 }).catch(() => {});
    await typeInField(page, 'input[name="documentNumber"]', CLIENTE.cpf, 'CPF')
      || await typeInField(page, 'input[placeholder*="CPF" i]', CLIENTE.cpf, 'CPF (ph)');

    console.log('  ⏳ Aguardando auto-fill Receita Federal (10s)...');
    await delay(10000);
    await screenshot(page, '05-apos-cpf-autofill');
    await scanAllFields(page, 'APÓS CPF + AUTO-FILL');

    // Tratar CPF já cadastrado
    const novoCadBtn = page.locator('button:has-text("novo cadastro"), button:has-text("Continuar com um novo")');
    if (await novoCadBtn.count() > 0) {
      console.log('  ⚠️  CPF já cadastrado — clicando novo cadastro');
      await novoCadBtn.first().click();
      await delay(3000);
    }

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 5: WHATSAPP + CONFIRMAÇÃO
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[5/14] WhatsApp...');
    await page.waitForSelector('input[placeholder*="WhatsApp" i], input[placeholder*="celular" i]', { timeout: 20000 }).catch(() => {});
    await delay(500);

    // WhatsApp
    await typeInField(page, 'input[placeholder="Número do seu WhatsApp"]', CLIENTE.whatsapp, 'WhatsApp')
      || await typeInField(page, 'input[placeholder*="WhatsApp" i]', CLIENTE.whatsapp, 'WhatsApp (fallback)')
      || await typeInField(page, 'input[type="tel"]', CLIENTE.whatsapp, 'WhatsApp (tel)');
    await delay(600);

    // Confirme celular
    await page.waitForSelector('input[placeholder*="onfirme" i]', { timeout: 10000 }).catch(() => {});
    await delay(400);
    await typeInField(page, 'input[placeholder="Confirme seu celular"]', CLIENTE.whatsapp, 'Confirme celular')
      || await typeInField(page, 'input[placeholder*="onfirme" i][placeholder*="celular" i]', CLIENTE.whatsapp, 'Confirme celular (fallback)');

    await delay(800);
    await screenshot(page, '06-whatsapp');
    await scanAllFields(page, 'APÓS WHATSAPP');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 6: EMAIL + CONFIRMAÇÃO
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[6/14] Email...');
    await page.waitForSelector('input[placeholder*="mail" i], input[type="email"]', { timeout: 15000 }).catch(() => {});
    await delay(500);

    // Email
    await typeInField(page, 'input[placeholder="E-mail"]', CLIENTE.email, 'Email')
      || await typeInField(page, 'input[type="email"]', CLIENTE.email, 'Email (type)')
      || await typeInField(page, 'input[placeholder*="mail" i]', CLIENTE.email, 'Email (fallback)');
    await delay(800);

    // Verificar duplicata
    const dupEmail = await page.locator('text=/já está cadastrado/i').count().catch(() => 0);
    if (dupEmail > 0) {
      const emailFallback = `${CLIENTE.cpf}@igreen.temp.com.br`;
      console.log(`  ⚠️  Email duplicado — usando: ${emailFallback}`);
      await typeInField(page, 'input[placeholder="E-mail"]', emailFallback, 'Email (dup fallback)');
    }

    // Confirme email
    await page.waitForSelector('input[placeholder*="onfirme" i][placeholder*="mail" i], input[placeholder*="Confirme" i]', { timeout: 10000 }).catch(() => {});
    await delay(400);
    const emailAtual = dupEmail > 0 ? `${CLIENTE.cpf}@igreen.temp.com.br` : CLIENTE.email;
    await typeInField(page, 'input[placeholder="Confirme seu E-mail"]', emailAtual, 'Confirme Email')
      || await typeInField(page, 'input[placeholder*="onfirme" i][placeholder*="mail" i]', emailAtual, 'Confirme Email (fallback)');

    await delay(2500);
    await screenshot(page, '07-email');
    await scanAllFields(page, 'APÓS EMAIL');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 7: ENDEREÇO (auto-preenchido pelo CEP, só número)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[7/14] Endereço...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(3000); // Aguardar auto-fill do CEP

    await screenshot(page, '08-endereco-autofill');
    await scanAllFields(page, 'ENDEREÇO AUTO-FILL');

    // Número
    const numOk = await typeInField(page, 'input[placeholder="Número"]', CLIENTE.numeroEndereco, 'Número')
      || await typeInField(page, 'input[aria-label*="úmero" i]:not([aria-label*="instalação" i])', CLIENTE.numeroEndereco, 'Número (aria)');

    if (!numOk) {
      // Scan manual: encontrar input de número pelo contexto
      const allInputs = await page.locator('input:visible').all();
      for (const inp of allInputs) {
        const ph = await inp.getAttribute('placeholder').catch(() => '');
        const ctx = await inp.evaluate(el => {
          const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
          return p?.textContent || '';
        }).catch(() => '');
        if (/^n[uú]mero$/i.test(ph) || (/n[uú]mero/i.test(ctx) && !/instalação|whatsapp|celular/i.test(ctx))) {
          await inp.click({ force: true });
          await inp.fill(CLIENTE.numeroEndereco);
          console.log(`  ✅ Número (scan): ${CLIENTE.numeroEndereco}`);
          break;
        }
      }
    }

    if (CLIENTE.complemento) {
      await typeInField(page, 'input[placeholder*="omplemento" i]', CLIENTE.complemento, 'Complemento');
    }

    await delay(1500);
    await screenshot(page, '09-numero-endereco');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 8: NÚMERO DA INSTALAÇÃO
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[8/14] Número da instalação...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);

    const instOk = await typeInField(page, 'input[placeholder="Número da instalação"]', CLIENTE.numeroInstalacao, 'Nº Instalação')
      || await typeInField(page, 'input[placeholder*="instalação" i]', CLIENTE.numeroInstalacao, 'Nº Instalação (fallback)')
      || await typeInField(page, 'input[placeholder*="Código" i]', CLIENTE.numeroInstalacao, 'Nº Instalação (código)');

    if (!instOk) {
      // Scan por label
      const allInputs = await page.locator('input:visible').all();
      for (const inp of allInputs) {
        const ctx = await inp.evaluate(el => {
          const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
          return p?.textContent || '';
        }).catch(() => '');
        if (/instalação|código/i.test(ctx) && !/whatsapp|celular/i.test(ctx)) {
          await inp.click({ force: true });
          await inp.fill(CLIENTE.numeroInstalacao);
          console.log(`  ✅ Nº Instalação (scan): ${CLIENTE.numeroInstalacao}`);
          break;
        }
      }
    }

    await delay(2000);
    await screenshot(page, '10-instalacao');
    await scanAllFields(page, 'APÓS INSTALAÇÃO');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 9: DISTRIBUIDORA (MUI Select)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[9/14] Distribuidora...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);

    // Encontrar combobox de distribuidora
    const combos = await page.locator('[role="combobox"], .MuiSelect-select, select').all();
    for (const combo of combos) {
      if (!await combo.isVisible().catch(() => false)) continue;
      const ctx = await combo.evaluate(el => {
        const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
        return p?.textContent || '';
      }).catch(() => '');
      if (/distribuidora/i.test(ctx)) {
        await combo.click({ force: true });
        await delay(800);
        // Selecionar CPFL
        const opts = await page.locator('li[role="option"], [role="option"]').all();
        let selecionou = false;
        for (const opt of opts) {
          const txt = await opt.textContent().catch(() => '');
          if (/cpfl/i.test(txt)) {
            await opt.click({ force: true });
            console.log(`  ✅ Distribuidora: ${txt.trim()}`);
            selecionou = true;
            break;
          }
        }
        if (!selecionou && opts.length > 0) {
          const txt = await opts[0].textContent().catch(() => '');
          await opts[0].click({ force: true });
          console.log(`  ✅ Distribuidora (1ª opção): ${txt.trim()}`);
        }
        break;
      }
    }

    await delay(1200);
    await screenshot(page, '11-distribuidora');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 10: PLACAS SOLARES
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[10/14] Placas solares...');
    const placasText = page.getByText(/placas solares/i).first();
    if (await placasText.count() > 0) {
      const radioNao = page.locator('input[type="radio"][value="nao" i], input[type="radio"][value="false" i], label:has-text("Não") input[type="radio"]').first();
      if (await radioNao.count() > 0) {
        await radioNao.check({ force: true }).catch(() => {});
        console.log('  ✅ Placas solares: Não');
      }
    }
    await delay(1000);

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 11: TIPO DE DOCUMENTO
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[11/14] Tipo de documento (CNH)...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(1500);

    const docCombos = await page.locator('[role="combobox"], .MuiSelect-select, select').all();
    for (const combo of docCombos) {
      if (!await combo.isVisible().catch(() => false)) continue;
      const ctx = await combo.evaluate(el => {
        const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
        return p?.textContent || '';
      }).catch(() => '');
      if (/tipo.*doc|documento/i.test(ctx)) {
        await combo.click({ force: true });
        await delay(800);
        const opts = await page.locator('li[role="option"], [role="option"]').all();
        for (const opt of opts) {
          const txt = await opt.textContent().catch(() => '');
          if (/^cnh$/i.test(txt.trim())) {
            await opt.click({ force: true });
            console.log(`  ✅ Tipo documento: CNH`);
            break;
          }
        }
        break;
      }
    }

    await delay(1500);
    await screenshot(page, '12-tipo-documento');
    await scanAllFields(page, 'APÓS TIPO DOCUMENTO');

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 12: UPLOAD DOCUMENTOS
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[12/14] Upload documentos...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await screenshot(page, '13-upload-area');
    await scanAllFields(page, 'ÁREA DE UPLOAD');

    // Listar todos os inputs file
    const fileInputs = await page.locator('input[type="file"]').all();
    console.log(`  📁 Inputs file encontrados: ${fileInputs.length}`);
    for (let i = 0; i < fileInputs.length; i++) {
      const accept = await fileInputs[i].getAttribute('accept').catch(() => '');
      const name = await fileInputs[i].getAttribute('name').catch(() => '');
      const id = await fileInputs[i].getAttribute('id').catch(() => '');
      console.log(`    [${i}] id="${id}" name="${name}" accept="${accept}"`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 13: PERGUNTAS
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[13/14] Perguntas...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(2000);
    await screenshot(page, '14-perguntas');
    await scanAllFields(page, 'PERGUNTAS');

    // Clicar em todos os "Não" visíveis
    const naoRadios = await page.locator('input[type="radio"][value="nao" i]:visible, input[type="radio"][value="false" i]:visible').all();
    console.log(`  📋 Radios "Não" encontrados: ${naoRadios.length}`);
    for (const r of naoRadios) {
      const name = await r.getAttribute('name').catch(() => '');
      await r.click({ force: true }).catch(() => {});
      console.log(`  ✅ Radio Não: ${name}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // ETAPA 14: SCROLL FINAL + MAPEAMENTO COMPLETO
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n[14/14] Mapeamento final...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
    await screenshot(page, '15-formulario-completo');
    const camposFinais = await scanAllFields(page, 'FORMULÁRIO COMPLETO');

    // Relatório de campos vazios
    const vazios = camposFinais.filter(f =>
      f.type !== 'file' && f.type !== 'radio' && f.type !== 'checkbox' && f.type !== 'hidden'
      && !f.value && f.visible
    );
    if (vazios.length > 0) {
      console.log('\n  ❌ CAMPOS AINDA VAZIOS:');
      vazios.forEach(f => console.log(`    - ph="${f.placeholder}" name="${f.name}" label="${f.label}"`));
    } else {
      console.log('\n  ✅ TODOS OS CAMPOS PREENCHIDOS!');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ SIMULAÇÃO CONCLUÍDA');
    console.log(`📁 Screenshots em: ${SCREENSHOTS_DIR}`);
    console.log('🔍 Inspecione os HTMLs para ver os campos exatos do portal');
    console.log('='.repeat(70));

    // Manter browser aberto para inspeção manual
    console.log('\n⏸️  Browser aberto para inspeção. Pressione Ctrl+C para fechar.\n');
    await new Promise(() => {}); // Aguarda indefinidamente

  } catch (e) {
    console.error('\n❌ ERRO:', e.message);
    await screenshot(page, 'ERROR-final').catch(() => {});
    await browser.close();
    process.exit(1);
  }
}

simular();

