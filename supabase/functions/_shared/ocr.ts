import { fetchWithTimeout, withRetry, TIMEOUT_FETCH_IMAGE, TIMEOUT_GEMINI } from "./utils.ts";
import { normalizarRG, validarDataNascimento, validarNomeOCR, validarCPFDigitos } from "./conversation-helpers.ts";
import { captureError } from "./sentry.ts";

// ─── Baixar imagem (Evolution API ou URL direta) ────────────────────
export async function baixarImagem(
  url: string | null,
  base64FromEvolution?: string,
  mediaMessage?: any
): Promise<{ b64: string; mime: string } | null> {
  // Tentativa 1: Base64 já fornecido pela Evolution API
  if (base64FromEvolution) {
    try {
      console.log("📥 Usando base64 da Evolution API");
      const mime = mediaMessage?.mimetype || "image/jpeg";
      console.log(`📥 Imagem Evolution: b64 len: ${base64FromEvolution.length}, tipo: ${mime}`);
      
      // Verificar se é PDF
      if (mime === "application/pdf" || mime.includes("pdf")) {
        console.log("📄 Detectado PDF - Gemini suporta PDF diretamente");
        // Gemini suporta PDF diretamente, não precisa converter
        return { b64: base64FromEvolution, mime: "application/pdf" };
      }
      
      return { b64: base64FromEvolution, mime };
    } catch (e: any) {
      console.error("⚠️ Erro ao processar base64 Evolution:", e.message);
    }
  }

  // Tentativa 2: URL direta (se disponível)
  if (url) {
    try {
      console.log("📥 Baixando imagem via URL direta:", url.substring(0, 100));
      
      // Verificar se é data URL (data:mime;base64,...)
      if (url.startsWith("data:")) {
        console.log("📥 Detectado data URL");
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mime = match[1];
          const b64 = match[2];
          console.log(`📥 Data URL: tipo: ${mime}, b64 len: ${b64.length}`);
          
          // Se for PDF, retornar diretamente
          if (mime === "application/pdf" || mime.includes("pdf")) {
            console.log("📄 Data URL é PDF - usando diretamente");
            return { b64, mime: "application/pdf" };
          }
          
          return { b64, mime };
        }
      }
      
      const imgRes = await fetchWithTimeout(url, { timeout: TIMEOUT_FETCH_IMAGE });
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const u8 = new Uint8Array(buf);
        const mime = imgRes.headers.get("content-type") || "image/jpeg";
        console.log(`📥 Imagem baixada: ${u8.length} bytes, tipo: ${mime}`);
        
        if (u8.length < 1000) {
          console.warn("⚠️ Imagem muito pequena (<1KB), pode ser preview ou erro");
        }
        
        // Se for PDF, verificar tamanho
        if (mime === "application/pdf" || mime.includes("pdf")) {
          const sizeMB = u8.length / (1024 * 1024);
          console.log(`📄 PDF baixado: ${sizeMB.toFixed(2)} MB`);
          
          if (sizeMB > 20) {
            console.warn(`⚠️ PDF muito grande (${sizeMB.toFixed(2)} MB), pode falhar no Gemini`);
          }
        }
        
        let bin = "";
        for (let i = 0; i < u8.length; i += 8192) {
          bin += String.fromCharCode(...u8.subarray(i, Math.min(i + 8192, u8.length)));
        }
        return { b64: btoa(bin), mime };
      }
      console.error("⚠️ URL direta falhou:", imgRes.status);
    } catch (e: any) {
      console.error("⚠️ Erro URL direta:", e.message);
    }
  }

  console.error("❌ Não conseguiu baixar imagem. url:", url, "base64:", !!base64FromEvolution);
  return null;
}

// ─── OCR Conta de Energia via Gemini 2.5 Flash ──────────────────────────
export async function ocrContaEnergia(
  imagemUrl: string | null,
  geminiApiKey: string,
  base64FromEvolution?: string,
  mediaMessage?: any
): Promise<{ sucesso: boolean; dados?: any; erro?: string }> {
  try {
    if (!geminiApiKey) return { sucesso: false, erro: "GEMINI_API_KEY não configurada" };

    const img = await baixarImagem(imagemUrl, base64FromEvolution, mediaMessage);
    if (!img) return { sucesso: false, erro: "Não conseguiu baixar imagem da conta" };
    console.log(`🔍 OCR Conta - Imagem OK: ${img.mime}, b64 len: ${img.b64.length}`);

    const prompt = `Você é um especialista em extrair dados de contas de energia elétrica brasileiras.
ANALISE ESTA IMAGEM DE CONTA DE ENERGIA e extraia os dados do CLIENTE (não da distribuidora).
IMPORTANTE: NÃO extraia CPF - o CPF será obtido do documento de identidade separadamente.

Extraia:
1. NOME do TITULAR da conta
2. ENDEREÇO DE INSTALAÇÃO (rua/avenida, sem número)
3. NÚMERO do endereço
4. BAIRRO
5. CEP (8 dígitos)
6. CIDADE
7. ESTADO (sigla UF, ex: SP, MG, RJ)
8. DISTRIBUIDORA (nome da empresa de energia)
9. NÚMERO DA INSTALAÇÃO (campo "Seu Código" na CPFL, "Nº do Cliente" na Enel, geralmente 7-12 dígitos)
10. VALOR TOTAL A PAGAR (em reais)

Retorne APENAS JSON válido:
{"nome":"","endereco":"","numero":"","bairro":"","cep":"","cidade":"","estado":"","distribuidora":"","numeroInstalacao":"","valorConta":""}

Se não encontrar um campo, use "". NÃO invente dados.`;

    console.log("🔍 OCR Conta - Chamando Gemini 2.5 Flash...");
    const gemRes = await withRetry(
      () =>
        fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: img.mime, data: img.b64 } }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json" },
            }),
            timeout: TIMEOUT_GEMINI,
          }
        ),
      {
        maxAttempts: 2,
        retryOn: (e) => {
          const msg = String(e);
          return msg.includes("429") || msg.includes("500") || msg.includes("timeout") || msg.includes("abort");
        },
      }
    );

    const gemData = await gemRes.json();
    console.log("🔍 OCR Conta - Gemini status:", gemRes.status);
    if (!gemRes.ok) {
      console.error("❌ Gemini erro:", JSON.stringify(gemData).substring(0, 500));
      return { sucesso: false, erro: `Gemini ${gemRes.status}: ${gemData?.error?.message || "erro"}` };
    }

    if (!gemData.candidates?.length) {
      console.error("❌ Gemini sem candidates:", JSON.stringify(gemData).substring(0, 500));
      return { sucesso: false, erro: "Gemini sem candidates (imagem ilegível?)" };
    }

    const text = gemData.candidates[0]?.content?.parts?.[0]?.text || "";
    console.log("🔍 OCR Conta - resposta:", text.substring(0, 300));
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { sucesso: false, erro: "Não extraiu JSON" };

    const dados = JSON.parse(match[0]);
    if (dados.cep) { const c = dados.cep.replace(/\D/g, ""); dados.cep = c.length === 8 ? c : ""; }
    if (dados.numeroInstalacao) { const n = dados.numeroInstalacao.replace(/\D/g, ""); dados.numeroInstalacao = (n.length >= 7 && n.length <= 12) ? n : ""; }
    if (dados.valorConta) { const v = parseFloat(String(dados.valorConta).replace(/[^\d.,]/g, "").replace(",", ".")); dados.valorConta = (!isNaN(v) && v > 0) ? v.toFixed(2) : ""; }

    // Score de confiança: % de campos críticos preenchidos.
    const criticos = [dados.nome, dados.endereco, dados.cidade, dados.estado, dados.distribuidora, dados.valorConta];
    const preenchidos = criticos.filter((v: any) => v && String(v).trim().length > 0).length;
    dados.confianca = Math.round((preenchidos / criticos.length) * 100);

    console.log(`✅ OCR Conta OK (confiança ${dados.confianca}%):`, JSON.stringify(dados).substring(0, 400));
    return { sucesso: true, dados };
  } catch (e: any) {
    console.error("❌ OCR Conta erro:", e.message || e);
    captureError(e, { tags: { module: "ocr", phase: "conta" } });
    return { sucesso: false, erro: e.message || String(e) };
  }
}

// ─── OCR Documento de Identidade via Gemini 2.5 Flash ───────────────────
// Prompts específicos para RG e CNH (frente e verso) para extração correta
export function buildPromptDocumento(tipo: string, isVerso = false): string {
  const isCNH = /cnh/i.test(tipo);
  if (isVerso && !isCNH) {
    return `Você é um especialista em extrair dados do VERSO do REGISTRO GERAL (RG) brasileiro.
ESTA IMAGEM É DO VERSO (COSTAS) DO RG.

No verso do RG costumam aparecer:
- NÚMERO DO RG (Registro Geral): campo "RG", "Número" ou "Identidade" — apenas dígitos (7 a 12).
- CPF: 11 dígitos (campo "CPF" ou "Cadastro de Pessoa Física").
- NOME COMPLETO: se estiver legível.
- DATA DE NASCIMENTO: DD/MM/AAAA.
- FILIAÇÃO: Nome do Pai e Nome da Mãe (podem estar abreviados).

REGRAS:
- Extraia SOMENTE o que estiver ESCRITO e LEGÍVEL. NUNCA invente.
- CPF: exatamente 11 dígitos (sem pontos/traços).
- RG: só números; remova pontos, traços e espaços (7 a 12 dígitos).
- Data: estritamente DD/MM/AAAA. Se não encontrar, use "".

Retorne APENAS um JSON válido, sem markdown e sem texto antes ou depois:
{"nome":"","rg":"","cpf":"","dataNascimento":"","nomePai":"","nomeMae":""}`;
  }
  if (isCNH) {
    return `Você é um especialista em extrair dados da CARTEIRA NACIONAL DE HABILITAÇÃO (CNH) brasileira.
ANALISE ESTA IMAGEM DA FRENTE da CNH.

Na CNH (frente) os campos estão em posições padrão:
- NOME: nome do titular em destaque (geralmente no topo, em maiúsculas).
- CPF: exatamente 11 dígitos (campo "CPF" ou ao lado do número do documento).
- DATA DE NASCIMENTO: DD/MM/AAAA — fica perto do nome do titular, normalmente rotulada como "DATA NASCIMENTO" ou "NASCIMENTO".
- RG / IDENTIDADE: número do documento de identidade (pode aparecer como "Identidade" ou "RG"); retorne APENAS os dígitos (7 a 12 números).

⚠️ ATENÇÃO CRÍTICA — DATA DE NASCIMENTO:
A CNH tem VÁRIAS datas. Você DEVE extrair APENAS a data rotulada como "NASCIMENTO" / "DATA NASCIMENTO" / "DATA DE NASC.".
NUNCA confunda com:
  ❌ "DATA EMISSÃO" / "DATA DE EMISSÃO" / "EMITIDO EM"
  ❌ "VALIDADE" / "VÁLIDA ATÉ" / "VENCIMENTO"
  ❌ "1ª HABILITAÇÃO" / "PRIMEIRA HABILITAÇÃO" / "DATA 1ª HAB"
  ❌ Datas no verso ou no canto da página
Regra de plausibilidade: a data de nascimento DEVE ser anterior à data atual e o titular deve ter entre 18 e 100 anos (ano entre 1920 e ${new Date().getFullYear() - 17}).
Se houver QUALQUER dúvida sobre qual data é o nascimento, retorne "" em dataNascimento e marque dataNascimentoConfianca como "baixa".

Adicione um campo extra "dataNascimentoConfianca" com valor "alta" (rótulo "Nascimento" claramente visível ao lado), "media" (inferida pela posição perto do nome) ou "baixa" (sem rótulo claro ou ambígua).

REGRAS OBRIGATÓRIAS:
- Extraia APENAS o que está ESCRITO e LEGÍVEL. NUNCA invente ou adivinhe.
- Se um campo estiver ilegível, borrado ou cortado, use "" para esse campo.
- CPF: exatamente 11 dígitos numéricos (sem pontos, traços ou espaços).
- RG: apenas números (entre 7 e 12 dígitos); remova pontos, traços e qualquer letra.
- Data: estritamente DD/MM/AAAA.

Retorne APENAS este JSON, sem markdown e sem texto antes ou depois:
{"nome":"","rg":"","cpf":"","dataNascimento":"","dataNascimentoConfianca":"","nomePai":"","nomeMae":""}`;
  }
  // RG FRENTE (novo ou antigo)
  return `Você é um especialista em extrair dados da FRENTE do REGISTRO GERAL (RG) brasileiro.
ANALISE ESTA IMAGEM DA FRENTE do RG (pode ser RG novo ou RG antigo).

Na frente do RG brasileiro:
- NOME COMPLETO: nome do titular (campo "Nome", "Nome do Titular" ou no topo).
- RG (Registro Geral): número do documento no formato XX.XXX.XXX-X ou só dígitos (campo "RG", "Número" ou "Número do Documento"). Retorne APENAS os dígitos (7 a 12).
- CPF: 11 dígitos (pode estar na frente ou só no verso; se não estiver visível use "").
- DATA DE NASCIMENTO: DD/MM/AAAA (campo "Nascimento", "Data de Nasc." ou "Nascimento").
- NOME DO PAI e NOME DA MÃE: se aparecerem na frente.

REGRAS OBRIGATÓRIAS:
- Extraia SOMENTE o que está ESCRITO e LEGÍVEL. NUNCA invente.
- CPF: exatamente 11 dígitos (sem pontos/traços).
- RG: apenas números (7 a 12 dígitos); remova pontos, traços e espaços.
- Data: estritamente DD/MM/AAAA.

Retorne APENAS este JSON, sem markdown e sem texto antes ou depois:
{"nome":"","rg":"","cpf":"","dataNascimento":"","nomePai":"","nomeMae":""}`;
}

export async function ocrDocumento(imagemUrl: string | null, geminiApiKey: string, tipo: string = "RG", whapiToken?: string, mediaId?: string, isVerso = false): Promise<{ sucesso: boolean; dados?: any; erro?: string }> {
  try {
    if (!geminiApiKey) return { sucesso: false, erro: "GEMINI_API_KEY não configurada" };

    const img = await baixarImagem(imagemUrl, whapiToken, mediaId);
    if (!img) return { sucesso: false, erro: "Não conseguiu baixar imagem do documento" };
    console.log(`🔍 OCR Doc - Imagem OK: ${img.mime}, tipo: ${tipo}, lado: ${isVerso ? "verso" : "frente"}`);

    const prompt = buildPromptDocumento(tipo, isVerso);

    console.log("🔍 OCR Doc - Chamando Gemini 2.5 Flash...");
    const gemRes = await withRetry(
      () =>
        fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: img.mime, data: img.b64 } }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json" },
            }),
            timeout: TIMEOUT_GEMINI,
          }
        ),
      {
        maxAttempts: 2,
        retryOn: (e) => {
          const msg = String(e);
          return msg.includes("429") || msg.includes("500") || msg.includes("timeout") || msg.includes("abort");
        },
      }
    );

    const gemData = await gemRes.json();
    console.log("🔍 OCR Doc - Gemini status:", gemRes.status);
    if (!gemRes.ok) {
      console.error("❌ Gemini erro:", JSON.stringify(gemData).substring(0, 500));
      return { sucesso: false, erro: `Gemini ${gemRes.status}: ${gemData?.error?.message || "erro"}` };
    }

    if (!gemData.candidates?.length) {
      console.error("❌ Gemini sem candidates:", JSON.stringify(gemData).substring(0, 500));
      return { sucesso: false, erro: "Gemini sem candidates (imagem ilegível?)" };
    }

    const text = gemData.candidates[0]?.content?.parts?.[0]?.text || "";
    console.log("🔍 OCR Doc - resposta:", text.substring(0, 350));
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { sucesso: false, erro: "Não extraiu JSON" };

    const dados = JSON.parse(match[0]);
    const cpfLimpo = dados.cpf ? dados.cpf.replace(/\D/g, "") : "";
    dados.cpf = cpfLimpo.length === 11 && validarCPFDigitos(cpfLimpo) ? cpfLimpo : "";
    if (dados.rg) {
      const rgDig = dados.rg.replace(/\D/g, "");
      dados.rg = normalizarRG(dados.rg) || (rgDig.length >= 7 && rgDig.length <= 12 ? rgDig : "");
    }
    if (dados.dataNascimento) {
      const validada = validarDataNascimento(dados.dataNascimento);
      // Validação de plausibilidade extra: ano entre 1920 e (hoje - 17 anos)
      if (validada) {
        const m = validada.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
          const year = parseInt(m[3], 10);
          const maxYear = new Date().getFullYear() - 17;
          if (year < 1920 || year > maxYear) {
            console.warn(`⚠️ Data nasc fora do plausível (${year}): descartando`);
            dados.dataNascimento = "";
            dados.dataNascimentoConfianca = "baixa";
          } else {
            dados.dataNascimento = validada;
          }
        } else {
          dados.dataNascimento = validada;
        }
      } else {
        dados.dataNascimento = "";
      }
    }
    // Para CNH, se confiança não veio do modelo, marcar como "media" por padrão
    const isCNH = /cnh/i.test(tipo);
    if (isCNH && dados.dataNascimento && !dados.dataNascimentoConfianca) {
      dados.dataNascimentoConfianca = "media";
    }
    if (dados.nome) dados.nome = validarNomeOCR(dados.nome);

    // Score de confiança: campos críticos do documento (nome, cpf, rg, nascimento)
    const criticos = [dados.nome, dados.cpf, dados.rg, dados.dataNascimento];
    const preenchidos = criticos.filter((v: any) => v && String(v).trim().length > 0).length;
    dados.confianca = Math.round((preenchidos / criticos.length) * 100);

    console.log(`✅ OCR Doc OK (confiança ${dados.confianca}%):`, JSON.stringify(dados).substring(0, 400));
    return { sucesso: true, dados };
  } catch (e: any) {
    console.error("❌ OCR Doc erro:", e.message || e);
    captureError(e, { tags: { module: "ocr", phase: "documento" } });
    return { sucesso: false, erro: e.message || String(e) };
  }
}

/**
 * OCR frente e verso do documento.
 * Parâmetros renomeados para clareza:
 *   frenteBase64 = base64 da frente (obtido via Evolution downloadMedia)
 *   frenteMediaMsg = mediaMessage da frente (para mime type)
 *   versoBase64 = base64 do verso
 */
export async function ocrDocumentoFrenteVerso(
  frenteUrl: string | null, versoUrl: string | null, tipo: string,
  geminiApiKey: string, frenteBase64?: string, frenteMediaMsg?: any, versoBase64?: string
): Promise<{ sucesso: boolean; dados?: any; erro?: string }> {
  console.log(`🔍 ocrDocumentoFrenteVerso: frenteB64=${!!frenteBase64}, versoB64=${!!versoBase64}, frenteUrl=${frenteUrl?.substring(0,60)}, versoUrl=${versoUrl?.substring(0,60)}`);

  // OCR da frente — passa frenteBase64 e frenteMediaMsg
  const ocrFrente = await ocrDocumento(frenteUrl, geminiApiKey, tipo, frenteBase64, frenteMediaMsg);
  if (!ocrFrente.sucesso || !ocrFrente.dados) return ocrFrente;

  const d = ocrFrente.dados;
  const temVerso = !!(versoUrl || versoBase64);

  if (!temVerso) {
    console.log("✅ OCR Doc (só frente) OK:", JSON.stringify(d).substring(0, 400));
    return { sucesso: true, dados: d };
  }

  // OCR do verso — usa versoBase64 (NÃO frenteBase64!)
  console.log("🔍 OCR Doc - frente OK, extraindo VERSO com base64 do verso...");
  const ocrVerso = await ocrDocumento(versoUrl, geminiApiKey, tipo, versoBase64, undefined, true);
  if (!ocrVerso.sucesso || !ocrVerso.dados) {
    console.log("⚠️ OCR verso falhou ou sem dados, usando só frente");
    return { sucesso: true, dados: d };
  }

  const v = ocrVerso.dados;
  if (!validarNomeOCR(d.nome) && validarNomeOCR(v.nome)) d.nome = v.nome;
  if ((!d.cpf || d.cpf.length !== 11) && v.cpf && v.cpf.length === 11) d.cpf = v.cpf;
  if (!normalizarRG(d.rg) && v.rg) {
    const rgVerso = normalizarRG(v.rg) || (v.rg.replace(/\D/g, "").length >= 7 && v.rg.replace(/\D/g, "").length <= 12 ? v.rg.replace(/\D/g, "") : "");
    if (rgVerso) d.rg = rgVerso;
  }
  if (!validarDataNascimento(d.dataNascimento) && validarDataNascimento(v.dataNascimento)) d.dataNascimento = validarDataNascimento(v.dataNascimento);
  if (!d.nomePai && v.nomePai) d.nomePai = v.nomePai;
  if (!d.nomeMae && v.nomeMae) d.nomeMae = v.nomeMae;

  d.nome = validarNomeOCR(d.nome) || d.nome;
  if (d.rg) d.rg = normalizarRG(d.rg) || (d.rg.replace(/\D/g, "").length >= 7 && d.rg.replace(/\D/g, "").length <= 12 ? d.rg.replace(/\D/g, "") : "");
  if (d.dataNascimento) d.dataNascimento = validarDataNascimento(d.dataNascimento);

  console.log("✅ OCR Doc (frente+verso) OK:", JSON.stringify(d).substring(0, 400));
  return { sucesso: true, dados: d };
}
