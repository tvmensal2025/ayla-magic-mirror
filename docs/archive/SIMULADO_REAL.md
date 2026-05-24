# 🎯 SIMULADO COMPLETO END-TO-END — HUMBERTO VIEIRA E SILVA
> Todas as funções mapeadas com dados reais dos documentos enviados

---

## 📄 DADOS REAIS EXTRAÍDOS DOS DOCUMENTOS

### CNH (Carteira Nacional de Habilitação):
| Campo | Valor |
|-------|-------|
| Nome | HUMBERTO VIEIRA E SILVA |
| CPF | 332.773.541-72 |
| RG | 55480061 SSP/SP |
| Data Nascimento | 22/07/1964 |
| Tipo Doc | CNH (não precisa verso) |
| Validade | 27/05/2028 |
| Categoria | AB |
| Pai | GILBERTO VIEIRA E SILVA |
| Mãe | TEREZINHA DE JESUS VIEIRA |

### Conta CPFL Energia:
| Campo | Valor |
|-------|-------|
| Titular | HUMBERTO VIEIRA E SILVA |
| Endereço | R GAL EPAMINONDAS TEIXEIRA GUIMAHAES, 182 |
| Bairro | VL GARDIMAN |
| CEP | 13309-410 |
| Cidade/UF | ITU / SP |
| Distribuidora | CPFL ENERGIA |
| Nº Instalação | 2095855190 |
| Valor | R$ 205,04 |
| Vencimento | 02/03/2026 |
| Consumo | 209 kWh |

---

## 🔄 FLUXO COMPLETO — FUNÇÃO POR FUNÇÃO

### FASE 0: RECEBIMENTO VIA WHATSAPP
```
Cliente envia CNH (PDF) → Evolution API recebe
  ↓
downloadMedia(key, message) → base64 da CNH
  ↓
uploadMediaToMinio({
  fileBase64: "JVBERi...",
  mimeType: "application/pdf",
  consultantFolder: "124661",
  customerName: "humberto_vieira",
  kind: "doc_frente"
})
  ↓
MinIO salva em: documentos/124661/humberto_vieira_22071964_doc_frente.pdf
  ↓
ocrDocumentoFrenteVerso(url, null, "CNH", GEMINI_KEY, base64)
  ↓
Gemini extrai:
  {
    nome: "HUMBERTO VIEIRA E SILVA",
    cpf: "33277354172",
    rg: "55480061",
    dataNascimento: "22/07/1964",
    dataNascimentoConfianca: "alta"
  }
```

### FASE 1: OCR CONTA DE ENERGIA
```
Cliente envia conta CPFL (PDF) → Evolution API recebe
  ↓
downloadMedia(key, message) → base64 da conta
  ↓
uploadMediaToMinio({
  kind: "conta",
  consultantFolder: "124661",
  customerName: "humberto_vieira"
})
  ↓
MinIO salva em: documentos/124661/humberto_vieira_22071964_conta.pdf
  ↓
ocrContaEnergia(url, GEMINI_KEY, base64, mediaMessage)
  ↓
Gemini extrai:
  {
    nome: "HUMBERTO VIEIRA E SILVA",
    endereco: "R GAL EPAMINONDAS TEIXEIRA GUIMAHAES",
    numero: "182",
    bairro: "VL GARDIMAN",
    cep: "13309410",
    cidade: "ITU",
    estado: "SP",
    distribuidora: "CPFL ENERGIA",
    numeroInstalacao: "2095855190",
    valorConta: "205.04",
    confianca: 100
  }
```

### FASE 2: BANCO DE DADOS (Supabase)
```
supabase.from('customers').update({
  name: "HUMBERTO VIEIRA E SILVA",
  cpf: "33277354172",
  rg: "55480061",
  data_nascimento: "22/07/1964",
  document_type: "cnh",
  address_street: "R GAL EPAMINONDAS TEIXEIRA GUIMAHAES",
  address_number: "182",
  address_neighborhood: "VL GARDIMAN",
  cep: "13309410",
  address_city: "ITU",
  address_state: "SP",
  distribuidora: "CPFL ENERGIA",
  numero_instalacao: "2095855190",
  electricity_bill_value: 205.04,
  document_front_url: "https://minio.../documentos/124661/humberto_vieira_22071964_doc_frente.pdf",
  electricity_bill_photo_url: "https://minio.../documentos/124661/humberto_vieira_22071964_conta.pdf",
  status: "data_complete",
  conversation_step: "complete"
})
```

### FASE 3: DISPARO PARA WORKER PORTAL
```
supabase.from('customers').update({ status: 'portal_submitting' })
  ↓
fetch('https://portal-worker.easypanel.host/submit-lead', {
  method: 'POST',
  headers: { Authorization: 'Bearer igreen-worker-secret-2024' },
  body: JSON.stringify({ customer_id: "uuid-do-humberto" })
})
  ↓
addToQueue("uuid-do-humberto", { headless: true })
  ↓
processNextInQueue() → executarAutomacao("uuid-do-humberto")
```

### FASE 4: AUTOMAÇÃO PLAYWRIGHT — PASSO A PASSO

#### 4.1 buscarCliente(customerId)
```javascript
// Busca dados do Humberto + consultor
const cliente = {
  name: "HUMBERTO VIEIRA E SILVA",
  cpf: "33277354172",
  cep: "13309410",
  electricity_bill_value: 205.04,
  document_type: "cnh",
  consultants: { igreen_id: "124661", name: "Consultor X" }
}
const PORTAL_URL = "https://digital.igreenenergy.com.br/?id=124661&sendcontract=true"
```

#### 4.2 formatarDados(cliente)
```javascript
{
  nomeCompleto: "HUMBERTO VIEIRA E SILVA",
  cpfDigits: "33277354172",
  cpfFormatted: "332.773.541-72",
  cepFormatted: "13309-410",
  whatsapp: "11999999999",  // telefone do cliente
  email: "humberto@email.com",
  endereco: "R GAL EPAMINONDAS TEIXEIRA GUIMAHAES",
  numeroEndereco: "182",
  bairro: "VL GARDIMAN",
  cidade: "ITU",
  estadoSigla: "SP",
  distribuidora: "CPFL ENERGIA",
  numeroInstalacao: "2095855190",
  electricity_bill_value: 205.04,
  dataNascimento: "22/07/1964",
  documentType: "cnh"  // normalizeDocType("cnh") → "cnh"
}
```

#### 4.3 prepararDocumento(url, 'doc-frente', cliente)
```javascript
// Hierarquia de fontes:
// 1. URL MinIO → baixa PDF da CNH
// 2. convertPdfToJpg("cnh.pdf") → "cnh.jpg"  (portal só aceita image/*)
// Resultado: "/app/tmp/doc-frente-1234567890.jpg"
```

#### 4.4 prepararContaEnergia(cliente)
```javascript
// Baixa PDF da conta CPFL do MinIO
// Resultado: "/app/tmp/conta-1234567890.pdf"
// (conta pode ser PDF, portal aceita)
```

#### 4.5 chromium.launch()
```javascript
browser = await chromium.launch({
  headless: true,  // HEADLESS=1 no Easypanel
  args: ['--no-sandbox', '--disable-setuid-sandbox']
})
page.goto("https://digital.igreenenergy.com.br/?id=124661&sendcontract=true")
```

#### 4.6 FASE 1 — CEP + Valor
```javascript
// input[placeholder="CEP"]
await cepInput.type("13309-410", { delay: 80 })
// ✅ CEP: 13309-410

// input[placeholder="Valor da conta"]
await valorInput.type("205.04", { delay: 80 })
// ✅ Valor: 205.04

// button:has-text("Calcular")
await clickText('Calcular')
// ✅ Calcular clicado → portal mostra economia estimada
```

#### 4.7 FASE 2 — Garantir Desconto
```javascript
await clickText('Garantir meu desconto')
// ✅ Abre formulário de cadastro
// waitForLoadState('networkidle')
```

#### 4.8 FASE 3 — CPF
```javascript
// input[placeholder="CPF ou CNPJ"]
await cpfInput.type("33277354172", { delay: 100 })
// ✅ CPF digitado: 332.773.541-72

// Portal consulta Receita Federal...
// waitForAutoFill(page, 10000)
// ✅ Portal preencheu: Nome="HUMBERTO VIEIRA E SILVA" DataNasc="22/07/1964"
// REGRA: NUNCA sobrescrever esses valores!
```

#### 4.9 FASE 4 — WhatsApp (bulletproofType)
```javascript
// bulletproofType(page, 'Número do seu WhatsApp', "11999999999")
// → Re-resolve input a cada tentativa (React re-renders)
// → Foca via click(force) + focus()
// → Digita via page.keyboard.type("11999999999", { delay: 60 })
// → Verifica: filled.replace(/\D/g,'') === "11999999999"
// ✅ WhatsApp: 11999999999

// bulletproofType(page, 'Confirme seu celular', "11999999999")
// ✅ Confirme celular: 11999999999
```

#### 4.10 FASE 5 — Email
```javascript
// input[placeholder="E-mail"]
await fillRequiredField(emailField, "humberto@email.com", 'Email')
// ✅ Email: humberto@email.com

// Verificar duplicata: "Este email já está cadastrado"
// Se duplicado → fallback: "33277354172@temp.igreen.com.br"

// input[placeholder="Confirme seu E-mail"]
await fillRequiredField(confirmEmail, "humberto@email.com", 'Confirmação Email')
// ✅ Confirmação Email: humberto@email.com
```

#### 4.11 FASE 6 — Endereço
```javascript
// CEP auto-preencheu: rua, bairro, cidade, estado
// Só precisa preencher o NÚMERO

// getByLabel('Número', { exact: true })
await fillRequiredField(numField, "182", 'Número endereço')
// ✅ Número endereço: 182

// Complemento (opcional) → pular se vazio
```

#### 4.12 FASE 7 — Número da Instalação
```javascript
// getByLabel(/Número da instalação/i)
await fillRequiredField(instField, "2095855190", 'Número da instalação', 'digits')
// ✅ Número da instalação: 2095855190

// Verificar duplicata: "Número de instalação já cadastrado"
// Se duplicado → status: 'installation_duplicate' → ABORT
```

#### 4.13 FASE 8 — Distribuidora (MUI Select)
```javascript
// findComboboxByContext(/distribuidora/i)
await distCombo.click()
// Abre dropdown MUI

// Buscar opção "CPFL ENERGIA"
const opt = page.locator('li[role="option"]:has-text("CPFL")')
await opt.click()
// ✅ Distribuidora selecionada: CPFL ENERGIA
```

#### 4.14 FASE 9 — Tipo de Documento
```javascript
// normalizeDocType("cnh") → "cnh"
// portalDocLabel("cnh") → "CNH"

// findComboboxByContext(/tipo\s*documento/i)
await combobox.click()
// Abre dropdown

// li[role="option"]:text-is("CNH")
await opt.click()
// ✅ Tipo documento: CNH
// (CNH = sem verso, portal esconde campo verso)
```

#### 4.15 FASE 10 — Upload Documentos
```javascript
// CNH = só frente, sem verso

// Estratégia 0: ID real do portal
// #file_input_frente_documento_pessoal
await page.locator('#file_input_frente_documento_pessoal')
  .setInputFiles("/app/tmp/doc-frente-1234567890.jpg")
// ✅ Documento FRENTE enviado

// CNH → SKIP verso
// [FASE_UPLOAD_DOC] [SUMMARY] docsEnviados=1 (esperado=1)
```

#### 4.16 FASE 11 — Perguntas
```javascript
// Responder TODAS as perguntas com "Não":
// - Possui procurador? → Não
// - PDF protegido por senha? → Não
// - Possui débitos em aberto? → Não

// input[type="radio"][value="nao"]:visible
for (const radio of allNaoRadios) {
  await radio.click({ force: true })
}
// ✅ 3 perguntas respondidas com "Não"
```

#### 4.17 FASE 12 — Upload Conta de Energia
```javascript
// Estratégia: 3º input[type="file"] ou fileChooser
await allFileInputs[2].setInputFiles("/app/tmp/conta-1234567890.pdf")
// ✅ Conta enviada
```

#### 4.18 FASE 13 — Verificação Pré-Submit
```javascript
// Scroll ao final
// Re-clicar radios "Não" que apareceram
// Verificar campos vazios
// ✅ Todos os campos preenchidos
```

#### 4.19 FASE 14 — FINALIZAR
```javascript
// button:has-text("Finalizar")
await btn.click()
// waitForLoadState('networkidle')

// Verificar se apareceu OTP:
// /código|OTP|verificação|whatsapp|token/i.test(pageText)
```

### FASE 5: OTP VIA WHATSAPP
```
Portal iGreen envia código via WhatsApp oficial
  ↓
Cliente recebe: "Seu código é: 123456"
  ↓
Evolution webhook captura mensagem
  ↓
extrairOTP("Seu código é: 123456") → "123456"
  ↓
supabase.from('customers').update({
  otp_code: "123456",
  otp_received_at: "2026-04-18T..."
})
  ↓
fetch('https://portal-worker.../confirm-otp', {
  body: JSON.stringify({ customer_id: "uuid", otp_code: "123456" })
})
  ↓
Worker recebe OTP → aguardarOTP() retorna "123456"
  ↓
otpField.type("123456", { delay: 100 })
await clickText('Confirmar')
// ✅ OTP confirmado
```

### FASE 6: PÓS-SUBMIT
```
Após OTP confirmado:
  ↓
Buscar link de assinatura/facial na página:
  - a[href*="certisign"]
  - a[href*="assinatura"]
  - a[href*="facial"]
  ↓
Se encontrou link:
  supabase.update({ status: 'awaiting_signature', link_assinatura: url })
  sendFacialLinkToCustomer(customerId, facialLink)
  → WhatsApp: "Acesse o link para validação facial: https://..."
  ↓
Se não encontrou link mas página diz "sucesso":
  supabase.update({ status: 'portal_submitted' })
  ↓
atualizarStatus(customerId, 'registered_igreen')
```

### FASE 7: UPLOAD FINAL MINIO
```
uploadMediaUnified({
  fileBase64: base64_cnh,
  mimeType: "application/pdf",
  consultantFolder: "124661",
  customerName: "humberto_vieira",
  customerBirth: "22071964",
  kind: "doc_frente"
})
  ↓
Estrutura final no MinIO:
documentos/
└── 124661/
    ├── humberto_vieira_22071964_doc_frente.pdf  ← CNH
    └── humberto_vieira_22071964_conta.pdf       ← Conta CPFL
```

---

## ✅ RESULTADO FINAL ESPERADO

```
Status no banco: registered_igreen
Portal URL: https://digital.igreenenergy.com.br/?id=124661&...
Tempo total: ~90 segundos
Documentos no MinIO: 2 arquivos
WhatsApp enviado: Link de assinatura
```

---

## ⚠️ PONTOS QUE PODEM FALHAR

| Ponto | Causa | Solução |
|-------|-------|---------|
| OCR confiança < 70% | Imagem borrada | Pedir reenvio |
| CPF duplicado no portal | Já cadastrado | Clicar "novo cadastro" |
| Instalação duplicada | Já cadastrado | Status: installation_duplicate |
| Email duplicado | Já usado | Fallback: cpf@temp.igreen.com.br |
| OTP timeout (3 min) | Cliente não respondeu | Retry automático |
| PDF não converte | poppler-utils ausente | Já instalado no Dockerfile |
| MinIO offline | Servidor fora | Fallback: Supabase Storage |
| Playwright crash | Memória insuficiente | Retry até 3x |

---

## 🔧 VARIÁVEIS NECESSÁRIAS PARA FUNCIONAR

```env
SUPABASE_URL=https://zlzasfhcxcznaprrragl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
EVOLUTION_API_URL=https://evolution.seudominio.com
EVOLUTION_API_KEY=sua-chave-evolution
GEMINI_API_KEY=AIzaSy...
MINIO_SERVER_URL=https://minio.seudominio.com
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=senha-segura
MINIO_BUCKET=igreen
WORKER_SECRET=igreen-worker-secret-2024
WORKER_PORTAL_URL=https://portal-worker.easypanel.host
```

---

**Versão:** 2.0.0 — Dados reais: Humberto Vieira e Silva  
**Data:** 18 de abril de 2026
