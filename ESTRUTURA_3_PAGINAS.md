# 📄 ESTRUTURA DAS 3 PÁGINAS - iGreen Energy

> **Sistema completo com 3 páginas distintas por consultor**
> 
> **Cada usuário é único** - URLs personalizadas

---

## 🎯 VISÃO GERAL

### **3 Páginas Independentes:**

```
1. Landing Page Cliente    → igreen.institutodossonhos.com.br/ana-giulia
2. Landing Page Licenciado  → igreen.institutodossonhos.com.br/licenciado/ana-giulia
3. Página de Cadastro       → igreen.institutodossonhos.com.br/cadastro/ana-giulia
```

---

## 📱 PÁGINA 1: LANDING PAGE CLIENTE

### **URL:**
```
https://igreen.institutodossonhos.com.br/{licenca}
Exemplo: https://igreen.institutodossonhos.com.br/ana-giulia
```

### **Objetivo:**
Captar clientes que querem desconto na conta de luz

### **Componentes:**
```
1. HeroSection - Vídeo + CTAs
2. AboutSection - Sobre a iGreen
3. HowItWorksSection - Como funciona
4. SolarPlantsSection - Usinas solares
5. StatesSection - Estados atendidos
6. ReferralSection - Indicação
7. TestimonialsSection - Depoimentos
8. NewsSection - Na mídia
9. ClubSection - Clube iGreen
10. AdvantagesSection - Vantagens
11. ConsultantSection - Consultor
12. WhatsAppFloat - Botão flutuante
```

### **CTAs Principais:**
- ⚡ Faça seu cadastro → Link do portal iGreen
- 💬 Atendimento no WhatsApp → WhatsApp do consultor

### **Tracking:**
- `page_type: "client"`
- Eventos de clique rastreados

---

## 🏢 PÁGINA 2: LANDING PAGE LICENCIADO

### **URL:**
```
https://igreen.institutodossonhos.com.br/licenciado/{licenca}
Exemplo: https://igreen.institutodossonhos.com.br/licenciado/ana-giulia
```

### **Objetivo:**
Recrutar novos licenciados para a rede

### **Componentes:**
```
1. HeroSection (Licenciado) - Seja um licenciado
2. BenefitsSection - Benefícios
3. HowToStartSection - Como começar
4. EarningsSection - Ganhos
5. TestimonialsSection - Depoimentos de licenciados
6. ConsultantSection - Consultor recrutador
```

### **CTAs Principais:**
- 🚀 Quero ser licenciado → Link de cadastro licenciado
- 💬 Falar com recrutador → WhatsApp do consultor

### **Tracking:**
- `page_type: "licenciada"`
- Eventos de clique rastreados

---

## 📋 PÁGINA 3: CADASTRO (NOVA)

### **URL:**
```
https://igreen.institutodossonhos.com.br/cadastro/{licenca}
Exemplo: https://igreen.institutodossonhos.com.br/cadastro/ana-giulia
```

### **Objetivo:**
Cadastro rápido via WhatsApp com QR Code

### **Estrutura:**

#### **1. Header**
```
┌─────────────────────────────────────┐
│ [Logo iGreen]    [Ana Giulia]      │
│                  Seu consultor      │
└─────────────────────────────────────┘
```

#### **2. Hero Section com QR Code (Verde)**
```
┌─────────────────────────────────────────────┐
│  [Gradiente Verde]                          │
│                                             │
│  🔴 Cadastro 100% Automático               │
│                                             │
│  ⚡ Cadastro em 3 Minutos                  │
│                                             │
│  Escaneie o QR Code, envie seus            │
│  documentos pelo WhatsApp e pronto!        │
│                                             │
│  ┌──────────────┐  ┌──────────────────┐   │
│  │              │  │ 1. 📷 Escaneie   │   │
│  │  QR CODE     │  │    o QR Code     │   │
│  │   AQUI       │  │                   │   │
│  │              │  │ 2. 📄 Envie      │   │
│  │ [Abrir       │  │    Documentos    │   │
│  │  WhatsApp]   │  │                   │   │
│  │              │  │ 3. ✅ Pronto!    │   │
│  │ Ana Giulia   │  │    Cadastro      │   │
│  │ ID: 124170   │  │    Completo      │   │
│  └──────────────┘  │                   │   │
│                     │ [100%] [3min]    │   │
│                     └──────────────────┘   │
│                                             │
│  🔒 Seus dados estão seguros               │
└─────────────────────────────────────────────┘
```

#### **3. Benefits Section**
```
Por que fazer seu cadastro agora?

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ⚡ Economia  │ │ ⏱️ Rápido    │ │ 🔒 Seguro    │ │ 👥 600mil+   │
│   Garantida  │ │   e Fácil    │ │   100%       │ │   Clientes   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

#### **4. How it Works**
```
Como funciona o processo?

1. Escaneie o QR Code
2. Converse com o Bot
3. Envie RG (frente e verso)
4. Envie a Conta de Energia
5. Confirme os Dados
6. Receba o Link
```

#### **5. CTA Final**
```
Pronto para economizar?

[📷 Voltar ao QR Code]
```

#### **6. Footer**
```
[Logo iGreen]
ANA GIULIA | CONSULTORA IGREEN ENERGY ID 124170
© 2026 iGreen Energy
```

### **Tracking:**
- `page_type: "cadastro"`
- Eventos de clique rastreados

---

## 🔗 LINKS ENTRE AS PÁGINAS

### **Da Landing Cliente para Cadastro:**

**Opção 1:** Botão "Faça seu cadastro" pode apontar para:
- Portal iGreen direto (atual)
- Página de cadastro (novo)

**Opção 2:** Adicionar botão extra:
```html
<a href="/cadastro/ana-giulia">
  📱 Cadastro Rápido via WhatsApp
</a>
```

### **Da Página de Cadastro para Landing:**

Não há link direto, mas o cliente pode:
- Voltar pelo navegador
- Acessar a landing original

---

## 📊 COMPARAÇÃO DAS 3 PÁGINAS

| Característica | Landing Cliente | Landing Licenciado | Página Cadastro |
|----------------|-----------------|-------------------|-----------------|
| **Objetivo** | Captar clientes | Recrutar licenciados | Cadastro rápido |
| **Público** | Pessoas físicas | Empreendedores | Clientes interessados |
| **CTA Principal** | Cadastro portal | Ser licenciado | QR Code WhatsApp |
| **Conteúdo** | Benefícios energia | Oportunidade negócio | Processo cadastro |
| **Tamanho** | Longa (scroll) | Média | Média |
| **Foco** | Informação | Conversão | Ação imediata |

---

## 🎨 DESIGN DA PÁGINA DE CADASTRO

### **Paleta de Cores:**

```css
/* Hero Section */
background: linear-gradient(135deg, 
  hsl(130, 100%, 36%) 0%, 
  hsl(130, 80%, 28%) 100%
);

/* Cards */
background: white;
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

/* Badges */
background: rgba(255, 255, 255, 0.2);
backdrop-filter: blur(10px);
border: 1px solid rgba(255, 255, 255, 0.3);
```

### **Tipografia:**

```css
/* Título principal */
font-size: 3rem; /* 48px desktop */
font-size: 2rem; /* 32px mobile */
font-weight: 900;
color: white;

/* Subtítulos */
font-size: 1.25rem; /* 20px */
font-weight: 700;
color: white;

/* Texto */
font-size: 1rem; /* 16px */
font-weight: 400;
color: rgba(255, 255, 255, 0.9);
```

### **Responsividade:**

**Desktop (>1024px):**
- QR Code: 240px
- Grid: 2 colunas (50% / 50%)
- Padding: 80px vertical

**Tablet (768px - 1024px):**
- QR Code: 220px
- Grid: 2 colunas
- Padding: 60px vertical

**Mobile (<768px):**
- QR Code: 200px
- Grid: 1 coluna
- Padding: 48px vertical
- Botão "Abrir WhatsApp" visível

---

## 🔧 CONFIGURAÇÃO NO PAINEL ADMIN

### **Aba "Links" - Adicionar novo link:**

```
┌─────────────────────────────────────────────┐
│ 📋 Links Principais                         │
├─────────────────────────────────────────────┤
│                                             │
│ 🏠 Landing Page — Cliente                  │
│ igreen.institutodossonhos.com.br/ana-giulia│
│ [Copiar] [QR Code]                         │
│                                             │
│ 🏢 Landing Page — Licenciado               │
│ igreen.institutodossonhos.com.br/          │
│ licenciado/ana-giulia                      │
│ [Copiar] [QR Code]                         │
│                                             │
│ 📱 Página de Cadastro (NOVO)               │
│ igreen.institutodossonhos.com.br/          │
│ cadastro/ana-giulia                        │
│ [Copiar] [QR Code]                         │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 📱 FLUXO DO USUÁRIO

### **Cenário 1: Cliente vê anúncio**

```
Anúncio no Instagram/Facebook
    ↓
Landing Page Cliente (/ana-giulia)
    ↓
Lê sobre os benefícios
    ↓
Clica "Faça seu cadastro"
    ↓
Portal iGreen (formulário tradicional)
```

### **Cenário 2: Cliente recebe link direto**

```
Consultor envia link de cadastro
    ↓
Página de Cadastro (/cadastro/ana-giulia)
    ↓
Escaneia QR Code
    ↓
WhatsApp abre automaticamente
    ↓
Envia documentos
    ↓
Cadastro completo em 3 minutos ✅
```

### **Cenário 3: Cliente quer ser licenciado**

```
Vê post sobre oportunidade
    ↓
Landing Page Licenciado (/licenciado/ana-giulia)
    ↓
Lê sobre ganhos e benefícios
    ↓
Clica "Quero ser licenciado"
    ↓
Portal iGreen (cadastro licenciado)
```

---

## 🎯 QUANDO USAR CADA PÁGINA

### **Landing Page Cliente:**
✅ Campanhas de marketing  
✅ Anúncios pagos  
✅ Posts em redes sociais  
✅ Link na bio do Instagram  
✅ Quando precisa explicar o que é iGreen  

### **Landing Page Licenciado:**
✅ Recrutamento de licenciados  
✅ Apresentações de negócio  
✅ Eventos de networking  
✅ Quando quer expandir a rede  

### **Página de Cadastro:**
✅ Link direto para cadastro rápido  
✅ WhatsApp do consultor (enviar link)  
✅ QR Code impresso em materiais  
✅ Quando o cliente já decidiu se cadastrar  
✅ Eventos presenciais (QR Code em banner)  

---

## 📊 MÉTRICAS POR PÁGINA

### **Landing Cliente:**
- Visualizações
- Tempo na página
- Cliques em "Cadastro"
- Cliques em "WhatsApp"
- Taxa de conversão

### **Landing Licenciado:**
- Visualizações
- Tempo na página
- Cliques em "Ser licenciado"
- Cliques em "Falar com recrutador"
- Taxa de conversão

### **Página Cadastro:**
- Visualizações
- QR Codes escaneados (via tracking)
- Cliques em "Abrir WhatsApp"
- Cadastros iniciados no WhatsApp
- Cadastros completos
- Tempo médio de cadastro

---

## 🚀 IMPLEMENTAÇÃO

### **Arquivos Criados:**

```
src/pages/
├── ConsultantPage.tsx      (Landing Cliente - já existe)
├── LicenciadaPage.tsx      (Landing Licenciado - já existe)
└── CadastroPage.tsx        (Página Cadastro - NOVO ✅)

src/App.tsx                 (Rotas atualizadas ✅)
```

### **Rotas Configuradas:**

```typescript
<Route path="/:licenca" element={<ConsultantPage />} />
<Route path="/licenciado/:licenca" element={<LicenciadaPage />} />
<Route path="/cadastro/:licenca" element={<CadastroPage />} />
```

### **Dependências:**

```bash
bun add qrcode.react lucide-react
```

---

## 🎉 RESULTADO FINAL

### **3 Páginas Independentes:**

✅ **Landing Cliente** - Informação e captação  
✅ **Landing Licenciado** - Recrutamento  
✅ **Página Cadastro** - Ação rápida via WhatsApp  

### **Cada uma com:**

✅ URL única por consultor  
✅ Design responsivo  
✅ Tracking independente  
✅ CTAs específicos  
✅ Conteúdo otimizado  

### **Benefícios:**

📈 **Mais conversões** - Página específica para cada objetivo  
⚡ **Cadastro rápido** - 3 minutos via WhatsApp  
🎯 **Segmentação** - Conteúdo certo para público certo  
📊 **Métricas claras** - Tracking separado por página  

---

**🎨 Sistema completo com 3 páginas profissionais e funcionais!**

---

**Versão:** 1.0.0  
**Data:** 12 de abril de 2026  
**Status:** Implementado ✅
