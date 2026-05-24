# 🗺️ MAPA VISUAL DO PROJETO IGREEN

> **Representação visual completa do sistema**
> 
> **Use este mapa para entender a arquitetura de forma visual**

---

## 🌐 VISÃO GERAL DO SISTEMA

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PROJETO IGREEN ENERGY                            │
│                  Sistema de Captação e Cadastro Automático              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  LANDING  │   │   ADMIN   │   │ WHATSAPP  │
            │   PAGES   │   │   PANEL   │   │ AUTOMATION│
            │  (3 tipos)│   │ (10 tabs) │   │ (38 steps)│
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                                    ▼
                        ┌───────────────────┐
                        │  PORTAL WORKER    │
                        │  (Cadastro Auto)  │
                        └───────────────────┘
                                    │
                                    ▼
                        ┌───────────────────┐
                        │  PORTAL IGREEN    │
                        │  (Cadastro Final) │
                        └───────────────────┘
```

---

## 🎯 FLUXO COMPLETO DO CLIENTE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        JORNADA DO CLIENTE                                │
└─────────────────────────────────────────────────────────────────────────┘

1. DESCOBERTA
   │
   ├─► Landing Page Cliente (/:licenca)
   │   • Hero com vídeo
   │   • Calculadora de economia
   │   • Benefícios
   │   • Depoimentos
   │   • FAQ
   │   • Formulário de contato
   │
   └─► Página de Cadastro (/cadastro/:licenca)
       • QR Code único
       • 3 passos visuais
       • Benefícios destacados
       │
       ▼
2. ESCANEAMENTO
   │
   └─► Cliente escaneia QR Code
       • Abre WhatsApp automaticamente
       • Mensagem pré-pronta
       │
       ▼
3. CONVERSA WHATSAPP (38 STEPS)
   │
   ├─► Fase 1: Boas-vindas
   │   └─► Bot: "Olá! Envie foto da conta de energia"
   │
   ├─► Fase 2: Conta de Energia
   │   ├─► Cliente: Envia foto
   │   ├─► Bot: OCR Gemini extrai dados
   │   └─► Bot: Mostra dados + botões (SIM/NÃO/EDITAR)
   │
   ├─► Fase 3: Documento
   │   ├─► Bot: "Qual documento? RG Novo/Antigo/CNH"
   │   ├─► Cliente: Escolhe
   │   ├─► Cliente: Envia frente
   │   ├─► Cliente: Envia verso (se RG)
   │   ├─► Bot: OCR Gemini extrai dados
   │   └─► Bot: Mostra dados + botões
   │
   ├─► Fase 4: Perguntas Complementares
   │   ├─► Bot: Pergunta dados faltantes
   │   └─► Cliente: Responde
   │
   └─► Fase 5: Finalização
       ├─► Bot: Botão "Finalizar"
       ├─► Cliente: Clica
       └─► Bot: "Processando..."
       │
       ▼
4. PORTAL WORKER (AUTOMAÇÃO)
   │
   ├─► Recebe customer_id
   ├─► Busca dados no Supabase
   ├─► Abre navegador Chromium
   ├─► Acessa portal iGreen (link único)
   ├─► Preenche 24 campos
   ├─► Envia formulário
   └─► Portal iGreen: Envia código via WhatsApp
       │
       ▼
5. CÓDIGO OTP
   │
   ├─► Cliente: Recebe código no WhatsApp
   ├─► Cliente: Digita código no WhatsApp
   ├─► Bot: Recebe código
   ├─► Bot: Envia para Portal Worker
   ├─► Worker: Digita código no portal
   └─► Portal iGreen: Valida código
       │
       ▼
6. ASSINATURA DIGITAL
   │
   ├─► Cliente: Recebe link assinatura
   ├─► Cliente: Abre link
   ├─► Cliente: Tira selfie
   ├─► Cliente: Assina digitalmente
   └─► Portal iGreen: Valida assinatura
       │
       ▼
7. CADASTRO COMPLETO ✅
   │
   └─► Status: complete
       └─► Consultor visualiza no admin
```

---

## 🏗️ ARQUITETURA TÉCNICA

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAMADA FRONTEND                                │
│                         (React + Vite + Tailwind)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ Landing   │   │  Admin    │   │ WhatsApp  │
            │ Cliente   │   │  Panel    │   │ Clients   │
            │ /:licenca │   │  /admin   │   │  Page     │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ Landing   │   │ Customer  │   │  Filtro   │
            │Licenciado │   │  Manager  │   │ WhatsApp  │
            │/licenciado│   │           │   │    💬     │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Página   │   │   CRM     │   │ Export/   │
            │ Cadastro  │   │  Kanban   │   │ Import    │
            │ /cadastro │   │           │   │   CSV     │
            └───────────┘   └───────────┘   └───────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAMADA BACKEND                                 │
│                    (Supabase Edge Functions + Deno)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ evolution │   │  _shared  │   │ whatsapp  │
            │  webhook  │   │  helpers  │   │    bot    │
            │ (38 steps)│   │           │   │           │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    │       ┌───────┼───────┐       │
                    │       │       │       │       │
                    │       ▼       ▼       ▼       │
                    │   ┌───────────────────┐       │
                    │   │ evolution-api.ts  │       │
                    │   │ ocr.ts (Gemini)   │       │
                    │   │ validators.ts     │       │
                    │   │ utils.ts          │       │
                    │   │ conversation-     │       │
                    │   │   helpers.ts      │       │
                    │   └───────────────────┘       │
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CAMADA DE DADOS                                  │
│                    (Supabase PostgreSQL + RLS)                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │consultants│   │ customers │   │ whatsapp_ │
            │           │   │           │   │ instances │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │conversa-  │   │ settings  │   │   deals   │
            │   tions   │   │           │   │           │
            └───────────┘   └───────────┘   └───────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CAMADA DE AUTOMAÇÃO                               │
│                    (Portal Worker + Playwright)                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │   Fila    │   │   Retry   │   │   Auto    │
            │Processing │   │ Automático│   │Recuperação│
            │  (1 vez)  │   │   (3x)    │   │ (5s poll) │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                                    ▼
                        ┌───────────────────┐
                        │   Playwright      │
                        │   • Abre browser  │
                        │   • Preenche 24   │
                        │   •   campos      │
                        │   • Envia form    │
                        │   • Aguarda OTP   │
                        │   • Finaliza      │
                        └───────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      INTEGRAÇÕES EXTERNAS                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ Evolution │   │  Gemini   │   │  ViaCEP   │
            │    API    │   │    AI     │   │           │
            │ (WhatsApp)│   │   (OCR)   │   │ (Endereço)│
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Portal   │   │   MinIO   │   │           │
            │  iGreen   │   │ (Storage) │   │           │
            │(Cadastro) │   │           │   │           │
            └───────────┘   └───────────┘   └───────────┘
```

---

## 📊 FLUXO DE DADOS

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FLUXO DE DADOS                                   │
└─────────────────────────────────────────────────────────────────────────┘

1. CLIENTE ESCANEIA QR CODE
   │
   └─► QRCodeSection.tsx
       └─► Gera QR Code único: wa.me/{phone}?text=Olá
           │
           ▼
2. WHATSAPP ABRE
   │
   └─► Cliente envia "Olá"
       │
       ▼
3. EVOLUTION API RECEBE
   │
   └─► POST /webhook
       └─► body.instance = "nome-instancia"
           └─► body.data.message.conversation = "Olá"
               │
               ▼
4. WEBHOOK PROCESSA
   │
   ├─► Busca instância no banco
   │   └─► whatsapp_instances.instance_name = "nome-instancia"
   │
   ├─► Busca/cria cliente
   │   └─► customers.phone_whatsapp = "5511999998888"
   │
   ├─► Identifica step
   │   └─► customers.conversation_step = "welcome"
   │
   ├─► Processa step
   │   └─► switch (step) { case "welcome": ... }
   │
   ├─► Atualiza banco
   │   └─► UPDATE customers SET conversation_step = "aguardando_conta"
   │
   └─► Envia resposta
       └─► sendText(remoteJid, "Envie foto da conta")
           │
           ▼
5. CLIENTE ENVIA FOTO
   │
   └─► Evolution API recebe
       └─► body.data.message.imageMessage.url = "https://..."
           │
           ▼
6. OCR GEMINI PROCESSA
   │
   ├─► downloadMedia(key, message)
   │   └─► Baixa imagem em base64
   │
   ├─► ocrContaEnergia(fileUrl, GEMINI_API_KEY)
   │   └─► POST https://generativelanguage.googleapis.com/...
   │       └─► Extrai: nome, endereço, CEP, distribuidora, etc
   │
   └─► UPDATE customers SET
       └─► name = "João Silva"
       └─► address_street = "Rua das Flores"
       └─► cep = "12345678"
       └─► distribuidora = "CPFL"
       └─► ...
           │
           ▼
7. BOT CONFIRMA DADOS
   │
   └─► sendButtons(remoteJid, "Dados corretos?", [
       └─► { id: "sim_conta", title: "✅ SIM" },
       └─► { id: "nao_conta", title: "❌ NÃO" },
       └─► { id: "editar_conta", title: "✏️ EDITAR" }
       ])
           │
           ▼
8. CLIENTE CLICA "SIM"
   │
   └─► body.data.message.buttonsResponseMessage.selectedButtonId = "sim_conta"
       │
       ▼
9. BOT PEDE DOCUMENTO
   │
   └─► sendButtons(remoteJid, "Qual documento?", [
       └─► { id: "tipo_rg_novo", title: "📄 RG Novo" },
       └─► { id: "tipo_rg_antigo", title: "📄 RG Antigo" },
       └─► { id: "tipo_cnh", title: "🪪 CNH" }
       ])
           │
           ▼
10. CLIENTE ESCOLHE E ENVIA FOTOS
    │
    └─► OCR Gemini processa novamente
        └─► Extrai: nome, CPF, RG, data nascimento
            │
            ▼
11. BOT FAZ PERGUNTAS COMPLEMENTARES
    │
    └─► Preenche dados faltantes
        │
        ▼
12. CLIENTE CLICA "FINALIZAR"
    │
    └─► validateCustomerForPortal(customer)
        ├─► Valida todos os campos obrigatórios
        └─► Se OK:
            ├─► UPDATE customers SET status = "portal_submitting"
            └─► POST {PORTAL_WORKER_URL}/submit-lead
                └─► body = { customer_id: "uuid" }
                    │
                    ▼
13. PORTAL WORKER PROCESSA
    │
    ├─► Adiciona na fila
    ├─► Abre navegador Chromium
    ├─► Acessa: https://digital.igreenenergy.com.br/?id={CONSULTOR_ID}
    ├─► Preenche 24 campos
    ├─► Envia formulário
    └─► Portal iGreen: Envia código via WhatsApp
        │
        ▼
14. CLIENTE DIGITA OTP
    │
    └─► Bot recebe código
        └─► POST {SUPABASE_URL}/functions/v1/submit-otp
            └─► body = { customer_id: "uuid", otp_code: "123456" }
                └─► POST {PORTAL_WORKER_URL}/confirm-otp
                    └─► Worker digita código no portal
                        │
                        ▼
15. PORTAL IGREEN VALIDA
    │
    └─► Envia link assinatura
        └─► Cliente assina digitalmente
            └─► UPDATE customers SET status = "complete"
                │
                ▼
16. CONSULTOR VISUALIZA
    │
    └─► /admin → Tab "Clientes" → Filtro "💬 WhatsApp"
        └─► Lista todos os clientes via WhatsApp
            └─► Exporta CSV se necessário
```

---

## 🎯 COMPONENTES PRINCIPAIS

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      COMPONENTES REACT                                   │
└─────────────────────────────────────────────────────────────────────────┘

LANDING PAGES
├─► ConsultantPage.tsx (/:licenca)
│   ├─► HeroSection.tsx
│   ├─► BenefitsSection.tsx
│   ├─► CalculatorSection.tsx
│   ├─► TestimonialsSection.tsx
│   ├─► FAQSection.tsx
│   └─► ContactSection.tsx
│
├─► LicenciadaPage.tsx (/licenciado/:licenca)
│   ├─► LicHeroSection.tsx
│   ├─► LicBenefitsSection.tsx
│   ├─► LicCareerSection.tsx
│   ├─► LicWhySection.tsx
│   └─► LicFormSection.tsx
│
└─► CadastroPage.tsx (/cadastro/:licenca)
    ├─► QRCodeSection.tsx ⭐
    │   └─► QRCode único por consultor
    └─► SolarPanelDecoration.tsx

ADMIN PANEL
└─► Admin.tsx (/admin)
    ├─► DashboardTab.tsx (📊 Dashboard)
    ├─► PreviewTab.tsx (👁️ Preview)
    ├─► KanbanBoard.tsx (📋 CRM)
    ├─► CustomerManager.tsx (👥 Clientes) ⭐
    │   ├─► Filtro WhatsApp 💬
    │   ├─► Busca avançada
    │   ├─► Filtros múltiplos
    │   ├─► Sincronização iGreen
    │   └─► Export/Import CSV
    ├─► NetworkPanel.tsx (🌐 Rede)
    ├─► WhatsAppTab.tsx (💬 WhatsApp)
    ├─► HistoryTab.tsx (📜 Histórico)
    ├─► LinksTab.tsx (🔗 Links)
    ├─► DadosTab.tsx (⚙️ Dados)
    └─► MaterialsTab.tsx (📚 Materiais)

WHATSAPP CLIENTS
└─► WhatsAppClientsPage.tsx (/admin/whatsapp-clients) ⭐
    ├─► Estatísticas (Total, Completos, Pendentes, Falhas)
    ├─► Busca em tempo real
    ├─► Filtros por status
    └─► Exportação CSV

UI COMPONENTS
├─► Button.tsx
├─► Input.tsx
├─► Card.tsx
├─► Badge.tsx
├─► Select.tsx
├─► Dialog.tsx
├─► Tabs.tsx
├─► Toast.tsx
└─► ... (40+ componentes)
```

---

## 🔐 SEGURANÇA E VALIDAÇÕES

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CAMADAS DE SEGURANÇA                                  │
└─────────────────────────────────────────────────────────────────────────┘

1. AUTENTICAÇÃO
   │
   ├─► Supabase Auth (JWT)
   ├─► Email verification
   ├─► Password reset
   └─► Session management
       │
       ▼
2. AUTORIZAÇÃO
   │
   ├─► Row Level Security (RLS)
   │   └─► Cada consultor vê apenas seus clientes
   │
   ├─► Filtros automáticos
   │   └─► WHERE consultant_id = auth.uid()
   │
   └─► Validação de permissões
       │
       ▼
3. VALIDAÇÕES
   │
   ├─► CPF
   │   └─► validarCPFDigitos(cpf)
   │       └─► Verifica dígitos verificadores
   │
   ├─► CEP
   │   └─► 8 dígitos + ViaCEP
   │       └─► Valida se existe
   │
   ├─► Email
   │   └─► /^[^\s@]+@[^\s@]+\.[^\s@]+$/
   │
   ├─► Telefone
   │   └─► DDD + 8/9 dígitos
   │
   ├─► Data nascimento
   │   └─► DD/MM/AAAA
   │
   └─► Campos obrigatórios
       └─► validateCustomerForPortal(customer)
           │
           ▼
4. SANITIZAÇÃO
   │
   ├─► Remove caracteres especiais
   ├─► Normaliza telefones
   ├─► Formata CPF/CEP
   └─► Trim strings
       │
       ▼
5. HTTPS
   │
   └─► Todas as comunicações criptografadas
```

---

## 📈 PERFORMANCE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      OTIMIZAÇÕES                                         │
└─────────────────────────────────────────────────────────────────────────┘

FRONTEND
├─► Lazy loading
│   └─► const Component = lazy(() => import('./Component'))
│
├─► Code splitting
│   └─► Vite automático
│
├─► Imagens otimizadas
│   └─► WebP, lazy loading
│
├─► Caching
│   └─► React Query
│
├─► Debounce
│   └─► Busca em tempo real
│
└─► Paginação
    └─► 50 itens por página

BACKEND
├─► Edge Functions
│   └─► Deploy global (baixa latência)
│
├─► Connection pooling
│   └─► Supabase automático
│
├─► Timeout configurável
│   └─► fetchWithTimeout(url, { timeout: 5000 })
│
└─► Retry automático
    └─► withRetry(fn, { maxAttempts: 3 })

PORTAL WORKER
├─► Fila sequencial
│   └─► 1 lead por vez
│
├─► Mutex real
│   └─► Sem processamento paralelo
│
├─► Cooldown
│   └─► 5 minutos anti-duplicata
│
└─► Auto-recuperação
    └─► Polling a cada 5 segundos
```

---

## 🎉 RESUMO VISUAL

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROJETO IGREEN ENERGY                                 │
│                                                                          │
│  📊 282 arquivos | 30.483 linhas | 38 steps | 100% automatizado        │
│                                                                          │
│  🌐 3 Landing Pages → 💬 WhatsApp (38 steps) → 🤖 Portal Worker        │
│                                                                          │
│  ⏱️ 3-5 minutos por cliente | 📉 70-80% redução de tempo               │
│                                                                          │
│  ✅ OCR Gemini | ✅ Validações | ✅ Retry automático | ✅ RLS          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

**Versão:** 1.0.0  
**Data:** 12 de abril de 2026  
**Status:** ✅ 100% OPERACIONAL

🗺️ **MAPA VISUAL COMPLETO!** 🗺️
