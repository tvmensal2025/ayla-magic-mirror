# 📱 FLUXO COMPLETO - WhatsApp com QR Code e OCR

> **Sistema de cadastro automatizado via WhatsApp com extração de dados por OCR**
> 
> **Cada usuário é único** - Sistema personalizado por consultor

---

## 🎯 VISÃO GERAL

### **Objetivo**
Permitir que o cliente faça o cadastro completo enviando apenas fotos dos documentos pelo WhatsApp. O sistema extrai os dados automaticamente usando OCR e preenche o portal iGreen.

### **Fluxo Resumido**
```
Cliente → QR Code → WhatsApp → Envia Fotos → OCR → Dados Extraídos → Portal Worker → Cadastro Completo
```

---

## 📋 COMPONENTES DO SISTEMA

### **1. QR Code na Landing Page**

**Localização:** Topo da página (antes do HeroSection)

**Características:**
- ✅ QR Code único por consultor
- ✅ Link direto para WhatsApp do consultor
- ✅ Mensagem inicial pré-configurada
- ✅ Design responsivo (mobile + desktop)
- ✅ Animações suaves

**URL do QR Code:**
```
https://api.whatsapp.com/send?phone={PHONE}&text={MESSAGE}
```

**Exemplo:**
```
https://api.whatsapp.com/send?phone=5514988377804&text=Olá!%20Gostaria%20de%20fazer%20meu%20cadastro%20na%20iGreen%20Energy%20e%20enviar%20meus%20documentos.
```

---

### **2. Bot WhatsApp (Evolution API)**

**Instância:** Única por consultor

**Configuração:**
```javascript
{
  instanceName: "ana-giulia-124170",
  phone: "5514988377804",
  consultantId: "uuid-do-consultor",
  igreenId: "124170"
}
```

---

## 🔄 FLUXO DETALHADO DE MENSAGENS

### **ETAPA 1: BOAS-VINDAS**

**Trigger:** Cliente escaneia QR Code ou envia primeira mensagem

**Mensagem do Bot:**
```
👋 Olá! Seja bem-vindo(a) à iGreen Energy!

Sou o assistente virtual da Ana Giulia e vou te ajudar a fazer seu cadastro de forma rápida e fácil.

✨ *Como funciona:*

1️⃣ Você envia fotos dos seus documentos
2️⃣ Eu extraio os dados automaticamente
3️⃣ Você confirma as informações
4️⃣ Pronto! Cadastro completo em 3 minutos

📸 *Documentos necessários:*
• RG (frente e verso)
• Conta de energia (última fatura)

Vamos começar? 🚀

Digite *SIM* para iniciar ou *AJUDA* se tiver dúvidas.
```

**Status no banco:** `conversation_step: "welcome"`

---

### **ETAPA 2: SOLICITAR NOME**

**Trigger:** Cliente responde "SIM"

**Mensagem do Bot:**
```
Perfeito! Vamos começar. 😊

Para personalizar seu atendimento, qual é o seu *nome completo*?

(Digite exatamente como está no RG)
```

**Status no banco:** `conversation_step: "ask_name"`

**Validação:**
- Mínimo 3 caracteres
- Pelo menos nome e sobrenome

**Resposta do Cliente:** "João Silva Santos"

**Confirmação do Bot:**
```
Prazer em conhecê-lo, João! 👋

Agora vamos para os documentos.
```

**Salva no banco:**
```sql
UPDATE customers SET
  name = 'João Silva Santos',
  conversation_step = 'ask_rg_front',
  updated_at = NOW()
WHERE id = 'customer-uuid';
```

---

### **ETAPA 3: SOLICITAR RG FRENTE**

**Mensagem do Bot:**
```
📸 *Documento 1 de 3*

Por favor, envie uma foto do seu *RG (FRENTE)*.

⚠️ *Dicas para uma boa foto:*
• Tire em um local bem iluminado
• Evite reflexos e sombras
• Certifique-se que todos os dados estão legíveis
• Não precisa ser escaneado, foto do celular está ótimo!

Aguardo sua foto... 📷
```

**Status no banco:** `conversation_step: "ask_rg_front"`

**Cliente envia foto**

**Processamento:**
1. Bot recebe imagem
2. Baixa via Whapi
3. Salva temporariamente
4. Chama OCR (Tesseract ou API externa)
5. Extrai dados:
   - Nome completo
   - RG (número)
   - CPF
   - Data de nascimento
   - Filiação (opcional)

**Mensagem do Bot:**
```
✅ Foto recebida!

Estou processando os dados... ⏳

*Dados extraídos:*
📋 Nome: João Silva Santos
🆔 RG: 12.345.678-9
📄 CPF: 123.456.789-00
🎂 Data Nasc: 15/01/1990

Os dados estão corretos?

Digite *SIM* para confirmar ou *NÃO* para corrigir.
```

**Status no banco:** `conversation_step: "confirm_rg_front"`

**Salva no banco:**
```sql
UPDATE customers SET
  rg_number = '12.345.678-9',
  cpf = '123.456.789-00',
  data_nascimento = '1990-01-15',
  rg_front_url = 'https://storage.url/rg-front.jpg',
  conversation_step = 'confirm_rg_front',
  updated_at = NOW()
WHERE id = 'customer-uuid';
```

---

### **ETAPA 4: SOLICITAR RG VERSO**

**Trigger:** Cliente confirma dados do RG frente

**Mensagem do Bot:**
```
Perfeito! ✅

📸 *Documento 2 de 3*

Agora envie uma foto do seu *RG (VERSO)*.

Mesmas dicas de antes:
• Boa iluminação
• Sem reflexos
• Dados legíveis

Aguardo sua foto... 📷
```

**Status no banco:** `conversation_step: "ask_rg_back"`

**Cliente envia foto**

**Processamento:**
1. Bot recebe imagem
2. Baixa e salva
3. Chama OCR
4. Extrai dados:
   - Filiação (pai/mãe)
   - Naturalidade
   - Data de emissão

**Mensagem do Bot:**
```
✅ Foto recebida e processada!

Ótimo, João! Seus documentos pessoais estão completos. 👍

Agora vamos para o último documento...
```

**Salva no banco:**
```sql
UPDATE customers SET
  rg_back_url = 'https://storage.url/rg-back.jpg',
  conversation_step = 'ask_energy_bill',
  updated_at = NOW()
WHERE id = 'customer-uuid';
```

---

### **ETAPA 5: SOLICITAR CONTA DE ENERGIA**

**Mensagem do Bot:**
```
📸 *Documento 3 de 3*

Por favor, envie uma foto da sua *CONTA DE ENERGIA* (última fatura).

📋 *O que vou extrair:*
• Número da instalação
• Distribuidora (ex: CPFL, Enel)
• Valor da conta
• Endereço completo
• CEP

⚠️ *Importante:*
• Envie a página com os dados completos
• Certifique-se que está legível

Aguardo sua foto... 📷
```

**Status no banco:** `conversation_step: "ask_energy_bill"`

**Cliente envia foto**

**Processamento:**
1. Bot recebe imagem
2. Baixa e salva
3. Chama OCR especializado em contas de energia
4. Extrai dados:
   - Número de instalação
   - Distribuidora
   - Valor da conta (kWh e R$)
   - Endereço completo
   - CEP
   - Cidade/Estado

**Mensagem do Bot:**
```
✅ Conta de energia recebida!

Processando os dados... ⏳

*Dados extraídos:*
🏠 Endereço: Rua das Flores, 123 - Centro
📍 CEP: 12345-678
🏙️ Cidade: São Paulo - SP
⚡ Distribuidora: CPFL
🔢 Nº Instalação: 987654321
💰 Valor médio: R$ 350,00

Os dados estão corretos?

Digite *SIM* para confirmar ou *NÃO* para corrigir.
```

**Status no banco:** `conversation_step: "confirm_energy_bill"`

**Salva no banco:**
```sql
UPDATE customers SET
  address_street = 'Rua das Flores',
  address_number = '123',
  address_neighborhood = 'Centro',
  cep = '12345-678',
  address_city = 'São Paulo',
  address_state = 'SP',
  distribuidora = 'CPFL',
  numero_instalacao = '987654321',
  electricity_bill_value = 350.00,
  energy_bill_url = 'https://storage.url/conta-energia.jpg',
  conversation_step = 'confirm_energy_bill',
  updated_at = NOW()
WHERE id = 'customer-uuid';
```

---

### **ETAPA 6: SOLICITAR DADOS COMPLEMENTARES**

**Trigger:** Cliente confirma dados da conta de energia

**Mensagem do Bot:**
```
Excelente! Seus documentos estão completos. ✅

Agora preciso de mais algumas informações para finalizar:

📧 *Qual é o seu e-mail?*

(Digite um e-mail válido para receber atualizações)
```

**Status no banco:** `conversation_step: "ask_email"`

**Cliente responde:** "joao@email.com"

**Validação:**
- Formato de e-mail válido
- Não pode estar vazio

**Mensagem do Bot:**
```
✅ E-mail registrado: joao@email.com

📱 *Qual é o seu WhatsApp?*

(Digite com DDD, exemplo: 11987654321)
```

**Status no banco:** `conversation_step: "ask_phone"`

**Cliente responde:** "11987654321"

**Validação:**
- Mínimo 10 dígitos (DDD + número)
- Apenas números

**Mensagem do Bot:**
```
✅ WhatsApp registrado: (11) 98765-4321

Perfeito! Agora só falta um detalhe...

🏠 *Qual é o número do seu endereço?*

(Apenas o número, exemplo: 123)
```

**Status no banco:** `conversation_step: "ask_address_number"`

**Cliente responde:** "123"

**Mensagem do Bot:**
```
✅ Número registrado: 123

🏢 *Tem complemento? (Apto, Bloco, etc)*

Digite o complemento ou *PULAR* se não tiver.
```

**Status no banco:** `conversation_step: "ask_complement"`

**Cliente responde:** "Apto 45" ou "PULAR"

---

### **ETAPA 7: RESUMO E CONFIRMAÇÃO FINAL**

**Mensagem do Bot:**
```
🎉 *Cadastro Completo!*

Vamos revisar todas as informações:

👤 *DADOS PESSOAIS*
Nome: João Silva Santos
RG: 12.345.678-9
CPF: 123.456.789-00
Data Nasc: 15/01/1990
E-mail: joao@email.com
WhatsApp: (11) 98765-4321

🏠 *ENDEREÇO*
Rua das Flores, 123 - Apto 45
Centro - São Paulo/SP
CEP: 12345-678

⚡ *CONTA DE ENERGIA*
Distribuidora: CPFL
Nº Instalação: 987654321
Valor médio: R$ 350,00

━━━━━━━━━━━━━━━━━━━━

Tudo certo? 

Digite *CONFIRMAR* para finalizar ou *CORRIGIR* para alterar algum dado.
```

**Status no banco:** `conversation_step: "final_confirmation"`

---

### **ETAPA 8: PROCESSAMENTO FINAL**

**Trigger:** Cliente digita "CONFIRMAR"

**Mensagem do Bot:**
```
✅ *Confirmado!*

Estou processando seu cadastro... ⏳

Isso pode levar alguns minutos. Aguarde...
```

**Processamento:**
1. Atualiza status no banco: `data_complete`
2. Chama POST `/submit-lead` no Portal Worker
3. Portal Worker adiciona na fila
4. Automação Playwright inicia
5. Navegador abre e preenche portal iGreen
6. Sistema aguarda OTP (se necessário)

**Status no banco:**
```sql
UPDATE customers SET
  status = 'data_complete',
  conversation_step = 'processing',
  updated_at = NOW()
WHERE id = 'customer-uuid';
```

---

### **ETAPA 9: AGUARDANDO OTP (SE NECESSÁRIO)**

**Mensagem do Bot:**
```
📱 *Código de Verificação*

O portal iGreen enviou um código de verificação para o seu WhatsApp.

Por favor, *envie o código* que você recebeu.

(Geralmente são 6 dígitos)
```

**Status no banco:** `status: "awaiting_otp"`

**Cliente envia:** "123456"

**Processamento:**
1. Bot extrai código
2. Salva no banco: `otp_code = "123456"`
3. Portal Worker detecta código
4. Preenche automaticamente no portal
5. Finaliza cadastro

**Mensagem do Bot:**
```
✅ Código recebido!

Finalizando seu cadastro... ⏳
```

---

### **ETAPA 10: CADASTRO FINALIZADO**

**Trigger:** Portal Worker conclui automação

**Mensagem do Bot:**
```
🎉 *CADASTRO FINALIZADO COM SUCESSO!*

Parabéns, João! Seu cadastro na iGreen Energy foi concluído. ✅

📋 *Próximos passos:*

1️⃣ Você receberá um link para assinar o contrato
2️⃣ Após a assinatura, seu desconto será ativado
3️⃣ A economia começa na próxima fatura!

🔗 *Link para continuar:*
https://digital.igreenenergy.com.br/assinatura/abc123

━━━━━━━━━━━━━━━━━━━━

💰 *Economia estimada:*
Até 20% de desconto = R$ 70,00/mês

📊 *Seu consultor:*
Ana Giulia - ID 124170

📞 *Dúvidas?*
Estou sempre à disposição! 😊

Obrigado por escolher a iGreen Energy! 🌱⚡
```

**Status no banco:** `status: "registered_igreen"`

**Salva no banco:**
```sql
UPDATE customers SET
  status = 'registered_igreen',
  portal_submitted_at = NOW(),
  igreen_link = 'https://digital.igreenenergy.com.br/assinatura/abc123',
  conversation_step = 'completed',
  updated_at = NOW()
WHERE id = 'customer-uuid';
```

---

## 🎨 DESIGN DAS MENSAGENS

### **Características**

✅ **Emojis:** Tornam as mensagens mais amigáveis e visuais  
✅ **Formatação:** Uso de *negrito* e _itálico_ para destacar  
✅ **Estrutura:** Mensagens curtas e objetivas  
✅ **Feedback:** Sempre confirma o que foi recebido  
✅ **Progressão:** Mostra "X de Y" para dar noção de progresso  
✅ **Personalização:** Usa o nome do cliente  

### **Tom de Voz**

- 🤝 Amigável e acolhedor
- 💼 Profissional mas descontraído
- ⚡ Rápido e eficiente
- 🎯 Direto ao ponto
- 😊 Positivo e motivador

---

## 🔧 IMPLEMENTAÇÃO TÉCNICA

### **1. OCR - Extração de Dados**

**Biblioteca:** Tesseract.js ou API externa (Google Vision, AWS Textract)

**Código exemplo:**
```javascript
async function extractDataFromRG(imageUrl) {
  const { data: { text } } = await Tesseract.recognize(imageUrl, 'por');
  
  // Regex para extrair dados
  const rgMatch = text.match(/RG[:\s]*(\d{1,2}\.?\d{3}\.?\d{3}-?\d{1})/i);
  const cpfMatch = text.match(/CPF[:\s]*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  
  return {
    rg: rgMatch ? rgMatch[1] : null,
    cpf: cpfMatch ? cpfMatch[1] : null,
    dataNascimento: dateMatch ? dateMatch[1] : null,
  };
}
```

---

### **2. Fluxo de Estados**

**Estados possíveis:**
```javascript
const CONVERSATION_STEPS = {
  WELCOME: 'welcome',
  ASK_NAME: 'ask_name',
  ASK_RG_FRONT: 'ask_rg_front',
  CONFIRM_RG_FRONT: 'confirm_rg_front',
  ASK_RG_BACK: 'ask_rg_back',
  ASK_ENERGY_BILL: 'ask_energy_bill',
  CONFIRM_ENERGY_BILL: 'confirm_energy_bill',
  ASK_EMAIL: 'ask_email',
  ASK_PHONE: 'ask_phone',
  ASK_ADDRESS_NUMBER: 'ask_address_number',
  ASK_COMPLEMENT: 'ask_complement',
  FINAL_CONFIRMATION: 'final_confirmation',
  PROCESSING: 'processing',
  AWAITING_OTP: 'awaiting_otp',
  COMPLETED: 'completed',
};
```

---

### **3. Validações**

**Nome:**
```javascript
function validateName(name) {
  if (!name || name.trim().length < 3) {
    return { valid: false, error: 'Nome muito curto' };
  }
  if (name.split(' ').length < 2) {
    return { valid: false, error: 'Digite nome e sobrenome' };
  }
  return { valid: true };
}
```

**CPF:**
```javascript
function validateCPF(cpf) {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  
  // Validação de dígitos verificadores
  // ... (algoritmo completo)
  
  return true;
}
```

**E-mail:**
```javascript
function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}
```

---

## 📊 BANCO DE DADOS

### **Tabela: customers**

**Campos adicionais para OCR:**
```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rg_front_url TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rg_back_url TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS energy_bill_url TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rg_number VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS conversation_step VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(5,2);
```

---

## 🎯 REGRAS IMPORTANTES

### **1. Cada Usuário é Único**

✅ Cada consultor tem sua própria instância WhatsApp  
✅ QR Code único por consultor  
✅ Dados salvos com `consultant_id`  
✅ Link do portal personalizado com `IGREEN_CONSULTOR_ID`  

### **2. Privacidade e Segurança**

✅ Imagens armazenadas com criptografia  
✅ Dados sensíveis (CPF, RG) protegidos  
✅ Acesso restrito por RLS (Row Level Security)  
✅ Logs de auditoria  

### **3. Fallback Manual**

Se OCR falhar:
- Bot pergunta os dados manualmente
- Cliente digita as informações
- Sistema valida e continua

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Criar componente QRCodeSection
2. ✅ Documentar fluxo completo
3. ⏳ Implementar OCR no webhook
4. ⏳ Criar edge function para processar imagens
5. ⏳ Testar fluxo completo end-to-end
6. ⏳ Ajustar mensagens baseado em feedback

---

**Versão:** 1.0.0  
**Data:** 12 de abril de 2026  
**Autor:** Sistema iGreen Energy
