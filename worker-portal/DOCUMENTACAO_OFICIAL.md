# DOCUMENTAÇÃO OFICIAL — WORKER PORTAL iGREEN v11.5

> Testado e validado em 19/04/2026 contra o portal real  
> ZERO erros no teste completo end-to-end

---

## FLUXO COMPLETO DO PORTAL (ORDEM EXATA)

```
[1] Abrir portal → https://digital.igreenenergy.com.br/?id={consultorId}&sendcontract=true
[2] CEP + Valor da conta → Calcular
[3] Garantir desconto
[4] CPF → auto-fill Nome + Data Nascimento (Receita Federal, 8s)
[5] WhatsApp + Confirme celular
[6] Email + Confirme email
[7] Número do endereço (rua/bairro/cidade auto-preenchidos pelo CEP)
[8] Número da instalação
[9] Tipo documento (CNH / RG Novo / RG Antigo)
[10] Upload documento frente (CNH = só frente, RG = frente + verso)
[11] Procurador → NÃO
[12] Upload conta de energia
[13] Débitos → NÃO
[14] Finalizar → OTP via WhatsApp → Link assinatura facial
```

---

## SELETORES REAIS CONFIRMADOS (TESTE 19/04/2026)

| Campo | Seletor | Método |
|-------|---------|--------|
| CEP | `input[name="cep"]` | fill |
| Valor conta | `input[name="consumption"]` | fill |
| Calcular | `button[type="submit"]` | click |
| Garantir | `button:has-text("Garantir")` | click |
| CPF | `input[name="documentNumber"]` | type (delay:100) |
| Nome | `input[name="name"]` | AUTO-FILL (não preencher) |
| Data Nasc | `input[name="birthDate"]` | AUTO-FILL (não preencher) |
| WhatsApp | `input[name="phone"]` | type (delay:80) |
| Confirme cel | `input[name="phoneConfirm"]` | type (delay:80) |
| Email | `input[name="email"]` | type (delay:60) |
| Confirme email | `input[name="emailConfirm"]` | type (delay:60) |
| Endereço | `input[name="address"]` | AUTO-FILL pelo CEP |
| Número | `input[name="number"]` | type (delay:80) |
| Bairro | `input[name="neighborhood"]` | AUTO-FILL pelo CEP |
| Cidade | `input[name="city"]` | AUTO-FILL pelo CEP |
| Estado | `input[name="state"]` | AUTO-FILL pelo CEP |
| Complemento | `input[name="complement"]` | OPCIONAL |
| Instalação | `input[name="installationNumber"]` | type (delay:80) |
| Tipo doc | `[role="combobox"]` contexto "Tipo documento" | click → option |
| Doc frente | `#personalDocumentFileFront` | setInputFiles |
| Doc verso | `#personalDocumentFileBack` | setInputFiles (só RG) |
| Procurador | `input[name="hasProcurator"][value="false"]` | click |
| Senha PDF | `input[name="energyBillPassword"]` | OPCIONAL (pular) |
| Conta energia | `#energyBillFile` | setInputFiles |
| Débitos | `input[name="hasPendingDebts"][value="false"]` | click |
| Finalizar | `button:has-text("Finalizar")` | click |

---

## REGRAS CRÍTICAS (NUNCA VIOLAR)

### 1. NUNCA usar placeholder= como seletor primário
O portal iGreen usa labels flutuantes MUI. Os inputs NÃO têm placeholder.
Sempre usar `input[name="..."]` como seletor primário.

### 2. NUNCA sobrescrever Nome e Data de Nascimento
O portal consulta a Receita Federal via CPF e auto-preenche.
Esses valores são a FONTE DA VERDADE. Aguardar 8-10s após digitar CPF.

### 3. NUNCA clicar em "clique aqui"
É um link de ajuda sobre instalação, NÃO um botão de avançar.
O formulário é uma página única — não tem "próximo".

### 4. CNH = só frente, RG = frente + verso
- CNH: 1 input file (`#personalDocumentFileFront`)
- RG Novo/Antigo: 2 inputs file (frente + `#personalDocumentFileBack`)

### 5. Perguntas usam value="false", NÃO value="nao"
- `input[name="hasProcurator"][value="false"]` → Não possui procurador
- `input[name="hasPendingDebts"][value="false"]` → Não possui débitos

### 6. Upload conta usa input hidden
O `#energyBillFile` é hidden mas `setInputFiles` funciona direto.
NÃO precisa de fileChooser para a conta.

### 7. Campos opcionais que podem ficar vazios
- `input[name="complement"]` → Complemento
- `input[name="energyBillPassword"]` → Senha do PDF
Esses NÃO devem ser contados como "campos vazios obrigatórios".

### 8. Fallbacks obrigatórios
- Email vazio → `tvmensal11@gmail.com`
- Telefone vazio → `11971254913`
- Email duplicado → `{cpf}@igreen.temp.com.br`

---

## ORDEM DE PREENCHIMENTO (CRÍTICA)

O portal iGreen renderiza campos dinamicamente. Se preencher fora de ordem, campos não aparecem.

```
ORDEM OBRIGATÓRIA:
1. CEP + Valor → Calcular (abre tela de economia)
2. Garantir (abre formulário)
3. CPF → Tab → aguardar 8s (auto-fill nome + data)
4. WhatsApp (aparece APÓS auto-fill)
5. Confirme celular (aparece APÓS WhatsApp)
6. Email (aparece APÓS confirme celular)
7. Confirme email (aparece APÓS email)
8. Scroll → Número endereço (endereço auto-preenchido pelo CEP)
9. Scroll → Instalação
10. Scroll → Tipo documento (dropdown MUI)
11. Upload doc frente (aparece APÓS tipo doc)
12. Procurador → NÃO (aparece APÓS upload doc)
13. Upload conta energia (aparece APÓS procurador)
14. Débitos → NÃO (aparece APÓS upload conta)
15. Scroll → Finalizar
```

---

## TIMING (DELAYS OBRIGATÓRIOS)

| Momento | Delay | Motivo |
|---------|-------|--------|
| Após goto portal | 3000ms | SPA React carregando |
| Após Calcular | 4000ms | Cálculo de economia |
| Após Garantir | 4000ms | Transição de tela |
| Após CPF + Tab | 8000ms | Consulta Receita Federal |
| Após auto-fill | 1200ms | React re-render |
| Após cada campo | 500-800ms | React processar |
| Após tipo doc | 2000ms | Renderizar upload |
| Após upload doc | 3000ms | Processar arquivo |
| Após upload conta | 2000ms | Processar arquivo |
| Antes de Finalizar | 2000ms | Scroll + verificação |

---

## FLUXO PÓS-FINALIZAR (OTP + LINK FACIAL)

```
[14] Worker clica "Finalizar"
  ↓
[15] Portal envia OTP via WhatsApp OFICIAL da iGreen para o telefone do cliente
     (NÃO é SMS — é mensagem WhatsApp do canal oficial iGreen)
  ↓
[16] Cliente recebe código no WhatsApp e digita na conversa com o consultor
  ↓
[17] Evolution webhook captura mensagem automaticamente
     extrairOTP("123456") → "123456"
  ↓
[17] Salva no Supabase: customers.otp_code = "123456"
  ↓
[18] Notifica Worker: POST /confirm-otp { customer_id, otp_code }
  ↓
[19] Worker recebe OTP via aguardarOTP() (polling 1.5s, timeout 3min)
     Busca: 1) memória local  2) Supabase
  ↓
[20] Worker digita OTP no campo do portal
     Seletores: input[name="otp"] → input[maxlength="6"] → input[placeholder*="código"]
  ↓
[21] Worker clica "Confirmar" / "Verificar"
  ↓
[22] Portal confirma → mostra link de assinatura facial
  ↓
[23] Worker captura link:
     a[href*="certisign"] → a[href*="facial"] → a[href*="sign"] → URL atual
  ↓
[24] Salva no banco: customers.link_assinatura + status: awaiting_signature
  ↓
[25] Envia link via WhatsApp (Evolution API):
     "📲 Validação Facial - Abra o link no celular: https://..."
  ↓
[26] Cliente faz selfie + foto documento no celular
  ↓
[27] Status final: registered_igreen ✅
```

### CAMPO OTP — SELETORES (ordem de prioridade)
```
1. input[name="otp"]
2. input[name="otpCode"]
3. input[name="code"]
4. input[name="verificationCode"]
5. input[maxlength="6"]
6. input[maxlength="4"]
7. input[placeholder*="código"]
8. input[placeholder*="OTP"]
9. Último input visível vazio (fallback)
```

### OTP — COMO CHEGA AO WORKER
```
WhatsApp do cliente → Evolution API → Supabase Edge Function
  ↓
evolution-webhook detecta padrão OTP (4-8 dígitos)
  ↓
Salva: customers.otp_code + customers.otp_received_at
  ↓
POST https://portal-worker.easypanel.host/confirm-otp
  Headers: Authorization: Bearer {WORKER_SECRET}
  Body: { customer_id: "uuid", otp_code: "123456" }
  ↓
Worker armazena em memória (Map) + Supabase (redundância)
  ↓
aguardarOTP() faz polling a cada 1.5s:
  1. GET /otp/{customer_id} (memória local)
  2. SELECT otp_code FROM customers WHERE id = {id} (Supabase)
```

---

## VARIÁVEIS DE AMBIENTE OBRIGATÓRIAS

```env
# Supabase
SUPABASE_URL=https://zlzasfhcxcznaprrragl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Evolution API (WhatsApp)
EVOLUTION_API_URL=https://evolution.seudominio.com
EVOLUTION_API_KEY=sua-chave

# Gemini (OCR)
GEMINI_API_KEY=AIzaSy...

# MinIO (documentos)
MINIO_SERVER_URL=https://minio.seudominio.com
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=senha
MINIO_BUCKET=igreen

# Worker
WORKER_SECRET=igreen-worker-secret-2024
WORKER_PORTAL_URL=https://portal-worker.easypanel.host
PORT=3100
HEADLESS=1

# Fallbacks
FALLBACK_EMAIL=tvmensal11@gmail.com
FALLBACK_PHONE=11971254913
```

---

## ESTRUTURA DE ARQUIVOS

```
worker-portal/
├── Dockerfile              # Container com Playwright + Xvfb + noVNC
├── package.json            # playwright-chromium + express + supabase
├── server.mjs              # HTTP server (fila, OTP, health check)
├── playwright-automation.mjs # Automação completa do portal
├── phase-logger.mjs        # Log de fases no Supabase
├── start.sh                # Inicializa Xvfb + x11vnc + noVNC + Node
├── entrypoint.sh           # Cria diretórios + inicia Node
└── DOCUMENTACAO_OFICIAL.md # ESTE ARQUIVO
```

---

## ENDPOINTS DO WORKER

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | /submit-lead | Bearer | Adiciona lead na fila |
| POST | /confirm-otp | Bearer | Recebe OTP do WhatsApp |
| POST | /clear-queue | Bearer | Zera fila |
| POST | /force-submit | Bearer | Força reenvio ignorando retry |
| GET | /otp/:id | Não | Playwright busca OTP |
| GET | /health | Não | Health check |
| GET | /status | Não | JSON com fila + atividades |
| GET | /dashboard | Não | HTML com status visual |
| GET | /queue | Não | Status da fila |
| POST | /webhook/whapi | Não | Webhook Whapi (OTP) |

---

## TRATAMENTO DE ERROS

| Erro | Causa | Ação |
|------|-------|------|
| CPF duplicado | Já cadastrado | Clicar "novo cadastro" |
| Email duplicado | Já usado | Fallback: cpf@igreen.temp.com.br |
| Instalação duplicada | Já cadastrada | Status: installation_duplicate |
| OTP timeout (3min) | Cliente não respondeu | Retry automático |
| Campo não encontrado | Portal mudou | Log + continuar (nunca travar) |
| Upload falhou | Arquivo inválido | Tentar fileChooser como fallback |
| Browser crash | Memória | Retry até 3x com delay 5s |

---

## UPLOAD DE DOCUMENTOS NO MINIO

```
documentos/
└── {consultor_igreen_id}/
    ├── {nome}_{sobrenome}_{datanasc}_doc_frente.jpg
    ├── {nome}_{sobrenome}_{datanasc}_doc_verso.jpg  (só RG)
    └── {nome}_{sobrenome}_{datanasc}_conta.pdf
```

Exemplo: `documentos/124170/humberto_vieira_22071964_doc_frente.jpg`

---

**Versão:** 11.5  
**Testado:** 19/04/2026  
**Status:** ✅ ZERO ERROS NO TESTE REAL
