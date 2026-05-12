/**
 * TESTE END-TO-END COM DADOS FICTÍCIOS
 * ======================================
 * Objetivo: Rodar a automação completa no portal iGreen com dados
 * NÃO verídicos para ver até onde chega antes de travar.
 *
 * O portal vai rejeitar em algum ponto (CPF inválido, Receita Federal
 * não retorna dados, etc). O teste registra EXATAMENTE onde travou.
 *
 * Uso: node teste-e2e-ficticio.mjs
 *
 * Resultado: screenshots em ./teste-e2e-screenshots/ + relatório no console
 */

import { chromium } from 'playwright-chromium';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SCREENSHOTS = './teste-e2e-screenshots';
if (!existsSync(SCREENSHOTS)) mkdirSync(SCREENSHOTS, { recursive: true });

const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── DADOS FICTÍCIOS (vão travar em algum ponto) ─────────────────────────────
const CLIENTE = {
  cpf:              '43728802867',       // CPF real
  nome:             'RAFAEL FERREIRA DIAS',
  dataNascimento:   '15/03/1990',
  whatsapp:         '11999887766',
  email:            'teste.ficticio@email.com',
  cep:              '13323072',
  cepFormatted:     '13323-072',
  numeroEndereco:   '100',
  complemento:      'Apto 1',
  distribuidora:    'CPFL Piratininga',
  numeroInstalacao: '9999999999',
  valorConta:       '350',
  consultorId:      '124170',            // ID padrão
};

const PORTAL_URL = `https://digital.igreenenergy.com.br/?id=${CLIENTE.consultorId}&sendcontract=true`;

// ─── TRACKING ─────────────────────────────────────────────────────────────────
const fases = [];
let faseAtual = '';
let step = 0;

function iniciarFase(nome) {
  faseAtual = nome;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ FASE: ${nome}`);
  console.log(`${'─'.repeat(60)}`);
}

function registrar(status, msg) {
  const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️ ' : status === 'block' ? '🛑' : '❌';
  const entry = { fase: faseAtual, status, msg, timestamp: new Date().toISOString() };
  fases.push(entry);
  console.log(`  ${icon} ${msg}`);
  return entry;
}

async function shot(page, nome) {
  step++;
  const prefix = String(step).padStart(2, '0');
  const file = join(SCREENSHOTS, `${prefix}-${nome}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  📸 ${prefix}-${nome}.png`);
  } catch (e) {
    console.log(`  📸 Screenshot falhou: ${e.message}`);
  }
  return file;
}

// ─── HELPERS DE PREENCHIMENTO ─────────────────────────────────────────────────
async function preencherCampo(page, seletores, valor, label, opts = {}) {
  const { digitarSoNumeros = false, timeout = 8000 } = opts;
  const valorFinal = digitarSoNumeros ? String(valor).replace(/\D/g, '') : String(valor);
  const sels = Array.isArray(seletores) ? seletores : [seletores];

  for (const sel of sels) {
    try {
      const loc = page.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout: timeout / sels.length }).catch(() => {});
      if (await loc.count() === 0 || !await loc.isVisible().catch(() => false)) continue;

      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ force: true });
      await delay(100);
      await loc.fill(valorFinal);
      await delay(100);
      await loc.dispatchEvent('input');
      await loc.dispatchEvent('change');

      const filled = await loc.inputValue().catch(() => '');
      const filledDigits = filled.replace(/\D/g, '');
      const expectedDigits = valorFinal.replace(/\D/g, '');

      if (filled === valorFinal || filledDigits === expectedDigits || filledDigits.length >= expectedDigits.length) {
        registrar('ok', `${label}: "${filled}"`);
        return true;
      }
      if (filledDigits.length > 0) {
        registrar('warn', `${label}: "${filled}" (esperado: "${valorFinal}")`);
        return true;
      }
    } catch (_) {}
  }

  registrar('block', `${label}: campo não encontrado ou não preencheu`);
  return false;
}

async function clicarBotao(page, textos, label, timeout = 15000) {
  for (const texto of (Array.isArray(textos) ? textos : [textos])) {
    try {
      const btn = page.locator(`button:has-text("${texto}")`).first();
      if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click();
        registrar('ok', `${label}: clicou "${texto}"`);
        return true;
      }
    } catch (_) {}
  }
  registrar('warn', `${label}: botão não encontrado`);
  return false;
}

async function selecionarCombo(page, contextoRegex, opcaoRegex, label) {
  const combos = await page.locator('[role="combobox"], .MuiSelect-select, select').all();
  for (const combo of combos) {
    if (!await combo.isVisible().catch(() => false)) continue;
    const ctx = await combo.evaluate(el => {
      const p = el.closest('.MuiFormControl-root') || el.parentElement?.parentElement;
      return (p?.textContent || '').toLowerCase();
    }).catch(() => '');
    if (!contextoRegex.test(ctx)) continue;

    await combo.click({ force: true });
    await delay(800);

    const opts = await page.locator('li[role="option"], [role="option"]').all();
    for (const opt of opts) {
      const txt = (await opt.textContent().catch(() => '')).trim();
      if (opcaoRegex.test(txt)) {
        await opt.click({ force: true });
        registrar('ok', `${label}: "${txt}"`);
        return true;
      }
    }
    // Selecionar primeira opção como fallback
    if (opts.length > 0) {
      const txt = (await opts[0].textContent().catch(() => '')).trim();
      await opts[0].click({ force: true });
      registrar('warn', `${label}: primeira opção "${txt}" (não encontrou match)`);
      return true;
    }
    // Fechar dropdown sem selecionar
    await page.keyboard.press('Escape');
    break;
  }
  registrar('block', `${label}: combo não encontrado`);
  return false;
}

// ─── Detectar bloqueios/erros na página ───────────────────────────────────────
async function detectarBloqueio(page) {
  const texto = await page.textContent('body').catch(() => '');
  const lower = texto.toLowerCase();

  const bloqueios = [
    { regex: /cpf.*inv[áa]lid|inv[áa]lid.*cpf/i, msg: 'CPF inválido detectado pelo portal' },
    { regex: /cpf.*n[ãa]o.*encontrad/i, msg: 'CPF não encontrado na Receita Federal' },
    { regex: /n[ãa]o.*tem.*autoriza[çc][ãa]o/i, msg: 'Consultor sem autorização' },
    { regex: /erro|error/i, msg: 'Erro genérico na página' },
    { regex: /j[áa].*cadastrad/i, msg: 'Dados já cadastrados' },
    { regex: /tente.*novamente/i, msg: 'Portal pediu para tentar novamente' },
    { regex: /c[óo]digo.*verifica|otp|token/i, msg: 'OTP/Código de verificação solicitado' },
  ];

  const encontrados = [];
  for (const b of bloqueios) {
    if (b.regex.test(texto)) {
      encontrados.push(b.msg);
    }
  }
  return encontrados;
}


// ─── TESTE PRINCIPAL ──────────────────────────────────────────────────────────
async function testar() {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 TESTE E2E COM DADOS FICTÍCIOS — PORTAL IGREEN');
  console.log('═'.repeat(70));
  console.log(`  CPF:        ${CLIENTE.cpf} (FICTÍCIO)`);
  console.log(`  Nome:       ${CLIENTE.nome}`);
  console.log(`  WhatsApp:   ${CLIENTE.whatsapp}`);
  console.log(`  Email:      ${CLIENTE.email}`);
  console.log(`  CEP:        ${CLIENTE.cepFormatted} (real — Praça da Sé)`);
  console.log(`  Portal:     ${PORTAL_URL}`);
  console.log(`  Objetivo:   Ver até onde chega antes de travar`);
  console.log('═'.repeat(70));

  const startTime = Date.now();

  const browser = await chromium.launch({
    headless: process.env.HEADLESS === '1',
    slowMo: 100,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  let ultimaFaseOk = '';
  let motivoParada = '';

  try {
    // ══════════════════════════════════════════════════════════════════
    // FASE 1: ABRIR PORTAL
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('1. Abrir Portal');
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(2000);
    await shot(page, 'portal-aberto');

    const bloqueiosInicio = await detectarBloqueio(page);
    if (bloqueiosInicio.some(b => b.includes('autorização'))) {
      registrar('block', `Portal bloqueou: ${bloqueiosInicio.join(', ')}`);
      motivoParada = 'Consultor sem autorização no portal';
      throw new Error(motivoParada);
    }

    const temCEP = await page.locator('input[name="cep"], input[placeholder*="CEP" i]').count();
    if (temCEP > 0) {
      registrar('ok', 'Portal carregado — tela inicial com CEP');
      ultimaFaseOk = 'Portal aberto';
    } else {
      registrar('warn', 'Portal carregado mas estrutura diferente do esperado');
    }

    // ══════════════════════════════════════════════════════════════════
    // FASE 2: CEP + VALOR DA CONTA
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('2. CEP + Valor da Conta');
    await preencherCampo(page,
      ['input[name="cep"]', 'input[placeholder="CEP"]', 'input[placeholder*="CEP" i]'],
      CLIENTE.cep, 'CEP', { digitarSoNumeros: true }
    );
    await preencherCampo(page,
      ['input[name="consumption"]', 'input[placeholder*="conta" i]', 'input[placeholder*="valor" i]'],
      CLIENTE.valorConta, 'Valor da conta'
    );
    await shot(page, 'cep-valor');

    // Botão Calcular
    if (await clicarBotao(page, ['Calcular', 'calcular'], 'Calcular')) {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await delay(2000);
      ultimaFaseOk = 'CEP + Valor + Calcular';
    }
    await shot(page, 'apos-calcular');

    // ══════════════════════════════════════════════════════════════════
    // FASE 3: GARANTIR DESCONTO
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('3. Garantir Desconto');
    if (await clicarBotao(page, ['Garantir meu desconto', 'Garantir desconto', 'Garantir'], 'Garantir desconto')) {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await delay(2000);
      ultimaFaseOk = 'Garantir desconto';
    }
    await shot(page, 'apos-garantir');

    // ══════════════════════════════════════════════════════════════════
    // FASE 4: CPF (AQUI PROVAVELMENTE TRAVA)
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('4. CPF (dados fictícios — pode travar aqui)');
    const cpfOk = await preencherCampo(page,
      ['input[name="documentNumber"]', 'input[placeholder*="CPF" i]', 'input[placeholder*="CNPJ" i]'],
      CLIENTE.cpf, 'CPF', { digitarSoNumeros: true, timeout: 20000 }
    );

    if (cpfOk) {
      registrar('warn', 'CPF digitado — aguardando resposta da Receita Federal...');
      await delay(8000); // Receita Federal demora
      await shot(page, 'apos-cpf-aguardando');

      // Verificar se travou
      const bloqueiosCpf = await detectarBloqueio(page);
      if (bloqueiosCpf.length > 0) {
        for (const b of bloqueiosCpf) registrar('block', b);
        if (bloqueiosCpf.some(b => b.includes('inválido') || b.includes('não encontrado'))) {
          motivoParada = 'CPF fictício rejeitado pela Receita Federal';
          registrar('block', `🛑 PARADA ESPERADA: ${motivoParada}`);
          ultimaFaseOk = 'CPF digitado (rejeitado)';
          // Não throw — continua tentando para ver se o portal permite prosseguir
        }
      }

      // Verificar auto-fill (nome/data nascimento)
      const autoFill = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        let nome = '', nasc = '';
        for (const inp of inputs) {
          const ph = (inp.getAttribute('placeholder') || '').toLowerCase();
          if (/nome/i.test(ph) && inp.value.length > 3) nome = inp.value;
          if (/nascim|birth/i.test(ph) && inp.value.length > 3) nasc = inp.value;
        }
        return { nome, nasc };
      });

      if (autoFill.nome) {
        registrar('ok', `Auto-fill nome: "${autoFill.nome}"`);
        ultimaFaseOk = 'CPF validado + auto-fill';
      } else {
        registrar('warn', 'Receita não retornou dados (CPF fictício)');
      }

      // Tratar "CPF já cadastrado"
      const novoCad = page.locator('button:has-text("novo cadastro"), button:has-text("Continuar com um novo")').first();
      if (await novoCad.count() > 0) {
        await novoCad.click();
        await delay(2000);
        registrar('warn', 'CPF já cadastrado — clicou "novo cadastro"');
      }
    }
    await shot(page, 'apos-cpf');

    // ══════════════════════════════════════════════════════════════════
    // FASE 5: WHATSAPP
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('5. WhatsApp');
    await page.evaluate(() => window.scrollBy(0, 200));
    const waOk = await preencherCampo(page,
      ['input[placeholder*="WhatsApp"]', 'input[placeholder*="whatsapp" i]', 'input[type="tel"]'],
      CLIENTE.whatsapp, 'WhatsApp', { digitarSoNumeros: true, timeout: 10000 }
    );
    if (waOk) ultimaFaseOk = 'WhatsApp preenchido';
    await delay(300);

    // Confirme celular
    await preencherCampo(page,
      ['input[placeholder*="Confirme seu celular"]', 'input[placeholder*="onfirme" i]'],
      CLIENTE.whatsapp, 'Confirme celular', { digitarSoNumeros: true, timeout: 8000 }
    );
    await shot(page, 'apos-whatsapp');

    // ══════════════════════════════════════════════════════════════════
    // FASE 6: EMAIL
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('6. Email');
    await preencherCampo(page,
      ['input[placeholder*="E-mail"]', 'input[placeholder*="mail" i]', 'input[type="email"]'],
      CLIENTE.email, 'Email', { timeout: 8000 }
    );
    await delay(300);

    // Confirme email
    await preencherCampo(page,
      ['input[placeholder*="Confirme seu E-mail"]', 'input[placeholder*="onfirme" i][placeholder*="mail" i]'],
      CLIENTE.email, 'Confirme Email', { timeout: 8000 }
    );
    if (fases.filter(f => f.fase.includes('Email') && f.status === 'ok').length > 0) {
      ultimaFaseOk = 'Email preenchido';
    }
    await delay(500);
    await shot(page, 'apos-email');

    // ══════════════════════════════════════════════════════════════════
    // FASE 7: ENDEREÇO
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('7. Endereço');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(1500); // Aguardar auto-fill do CEP

    await preencherCampo(page,
      ['input[placeholder="Número"]', 'input[placeholder*="úmero" i]'],
      CLIENTE.numeroEndereco, 'Número', { timeout: 10000 }
    );

    if (CLIENTE.complemento) {
      await preencherCampo(page,
        ['input[placeholder*="omplemento" i]'],
        CLIENTE.complemento, 'Complemento', { timeout: 5000 }
      );
    }
    await shot(page, 'apos-endereco');

    // ══════════════════════════════════════════════════════════════════
    // FASE 8: NÚMERO DA INSTALAÇÃO
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('8. Número da Instalação');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(500);
    const instOk = await preencherCampo(page,
      ['input[placeholder="Número da instalação"]', 'input[placeholder*="instalação" i]', 'input[placeholder*="Código" i]'],
      CLIENTE.numeroInstalacao, 'Nº Instalação', { timeout: 10000 }
    );
    if (instOk) ultimaFaseOk = 'Nº Instalação preenchido';
    await delay(500);
    await shot(page, 'apos-instalacao');

    // ══════════════════════════════════════════════════════════════════
    // FASE 9: DISTRIBUIDORA
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('9. Distribuidora');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(500);
    const distOk = await selecionarCombo(page, /distribuidora/i, /cpfl|CPFL/i, 'Distribuidora');
    if (distOk) ultimaFaseOk = 'Distribuidora selecionada';
    await delay(500);
    await shot(page, 'apos-distribuidora');

    // ══════════════════════════════════════════════════════════════════
    // FASE 10: TIPO DE DOCUMENTO
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('10. Tipo de Documento');
    await page.evaluate(() => window.scrollBy(0, 300));
    await delay(500);
    await selecionarCombo(page, /tipo.*doc|documento/i, /^cnh$/i, 'Tipo documento');
    await delay(500);
    await shot(page, 'apos-tipo-doc');

    // ══════════════════════════════════════════════════════════════════
    // FASE 11: PERGUNTAS (todas "Não")
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('11. Perguntas');
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(500);

    // Tentar radios "Não"
    const naoRadios = await page.locator('input[type="radio"][value="nao" i]:visible, input[type="radio"][value="false" i]:visible, input[type="radio"][value="Não"]:visible').all();
    let respondidas = 0;
    for (const r of naoRadios) {
      await r.click({ force: true }).catch(() => {});
      respondidas++;
    }
    // Fallback: labels com "Não"
    if (respondidas === 0) {
      const naoLabels = await page.locator('label:has-text("Não"):visible, [role="radio"]:has-text("Não"):visible').all();
      for (const l of naoLabels) {
        await l.click({ force: true }).catch(() => {});
        respondidas++;
      }
    }
    registrar(respondidas > 0 ? 'ok' : 'warn', `${respondidas} perguntas respondidas com "Não"`);
    await shot(page, 'apos-perguntas');

    // ══════════════════════════════════════════════════════════════════
    // FASE 12: BOTÃO FINALIZAR (NÃO CLICA — só verifica se existe)
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('12. Verificar botão Finalizar');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(500);

    const finalizarBtn = page.locator('button:has-text("Finalizar"), button:has-text("Enviar"), button[type="submit"]').first();
    if (await finalizarBtn.count() > 0 && await finalizarBtn.isVisible().catch(() => false)) {
      const enabled = await finalizarBtn.isEnabled().catch(() => false);
      if (enabled) {
        registrar('ok', 'Botão Finalizar encontrado e HABILITADO (não clicou — teste seguro)');
        ultimaFaseOk = 'Formulário completo — botão Finalizar disponível';
      } else {
        registrar('warn', 'Botão Finalizar encontrado mas DESABILITADO (campos faltando?)');
        ultimaFaseOk = 'Formulário quase completo — botão desabilitado';
      }
    } else {
      registrar('warn', 'Botão Finalizar não encontrado');
    }
    await shot(page, 'formulario-final');

    // ══════════════════════════════════════════════════════════════════
    // FASE 13: SCAN FINAL — campos vazios
    // ══════════════════════════════════════════════════════════════════
    iniciarFase('13. Scan Final');
    const camposVazios = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'));
      const vazios = [];
      for (const inp of inputs) {
        if (inp.offsetParent === null) continue; // não visível
        if (inp.value && inp.value.trim()) continue; // tem valor
        vazios.push({
          placeholder: inp.getAttribute('placeholder') || '',
          name: inp.getAttribute('name') || '',
          type: inp.getAttribute('type') || 'text',
        });
      }
      return vazios;
    });

    if (camposVazios.length === 0) {
      registrar('ok', 'Todos os campos visíveis estão preenchidos!');
    } else {
      registrar('warn', `${camposVazios.length} campo(s) ainda vazio(s):`);
      for (const c of camposVazios) {
        console.log(`    ⬜ placeholder="${c.placeholder}" name="${c.name}" type="${c.type}"`);
      }
    }

    // Detectar bloqueios finais
    const bloqueiosFinais = await detectarBloqueio(page);
    if (bloqueiosFinais.length > 0) {
      for (const b of bloqueiosFinais) registrar('warn', `Alerta na página: ${b}`);
    }

  } catch (err) {
    if (!motivoParada) motivoParada = err.message;
    registrar('block', `ERRO: ${err.message}`);
    await shot(page, 'ERRO').catch(() => {});
  }

  // ══════════════════════════════════════════════════════════════════
  // RELATÓRIO FINAL
  // ══════════════════════════════════════════════════════════════════
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n\n' + '═'.repeat(70));
  console.log('📊 RELATÓRIO DO TESTE E2E — DADOS FICTÍCIOS');
  console.log('═'.repeat(70));

  const oks = fases.filter(f => f.status === 'ok');
  const warns = fases.filter(f => f.status === 'warn');
  const blocks = fases.filter(f => f.status === 'block');

  console.log(`\n  ⏱️  Tempo total: ${elapsed}s`);
  console.log(`  ✅ Sucesso:  ${oks.length}`);
  console.log(`  ⚠️  Avisos:   ${warns.length}`);
  console.log(`  🛑 Bloqueios: ${blocks.length}`);
  console.log(`\n  📍 Última fase OK: ${ultimaFaseOk || 'nenhuma'}`);
  if (motivoParada) console.log(`  🛑 Motivo da parada: ${motivoParada}`);

  console.log('\n  DETALHES:');
  for (const f of fases) {
    const icon = f.status === 'ok' ? '✅' : f.status === 'warn' ? '⚠️ ' : '🛑';
    console.log(`    ${icon} [${f.fase}] ${f.msg}`);
  }

  console.log(`\n  📸 Screenshots em: ${SCREENSHOTS}/`);

  // Resumo executivo
  console.log('\n' + '─'.repeat(70));
  console.log('📋 CONCLUSÃO:');
  if (blocks.length === 0) {
    console.log('  ✅ O fluxo chegou até o final sem bloqueios!');
    console.log('  O portal aceitou os dados fictícios (ou ignorou validações).');
  } else if (blocks.some(b => b.msg.includes('CPF'))) {
    console.log('  🛑 O portal TRAVOU no CPF (esperado com dados fictícios).');
    console.log('  A Receita Federal rejeitou o CPF — o portal não permite continuar.');
    console.log('  Com dados REAIS, o fluxo continuaria normalmente.');
  } else {
    console.log(`  🛑 O portal travou em: ${blocks[0]?.fase || 'desconhecido'}`);
    console.log(`  Motivo: ${blocks[0]?.msg || motivoParada}`);
  }
  console.log('─'.repeat(70));

  await browser.close().catch(() => {});
  console.log('\n🏁 Teste finalizado.\n');
}

testar().catch(err => {
  console.error('\n💥 ERRO FATAL:', err.message);
  process.exit(1);
});
