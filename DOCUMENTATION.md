# Documentação Completa — iGreen Energy

> Documentação exaustiva para que qualquer IA ou desenvolvedor entenda **todas** as páginas, botões, funções, hooks, serviços, edge functions, tabelas e fluxos do sistema.

---

## Sumário

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Página de Autenticação](#2-página-de-autenticação-auth)
3. [Painel Admin](#3-painel-admin-admin)
4. [Módulo WhatsApp](#4-módulo-whatsapp-sub-abas)
5. [Landing Pages](#5-landing-pages)
6. [Hooks Customizados](#6-hooks-customizados)
7. [Serviços](#7-serviços)
8. [Edge Functions](#8-edge-functions-supabase)
9. [Banco de Dados](#9-banco-de-dados-12-tabelas)
10. [Variáveis de Ambiente](#10-variáveis-de-ambiente)
11. [Fluxos Críticos](#11-fluxos-críticos)
12. [Tipos TypeScript](#12-tipos-typescript)
13. [Utilitários](#13-utilitários)

---

## 1. Visão Geral do Projeto

### Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite 5 + TypeScript 5 |
| Estilização | Tailwind CSS v3 + shadcn/ui |
| Estado | React Query (TanStack) + useState/useEffect |
| Roteamento | React Router DOM v6 |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| WhatsApp | Evolution API v2 (via proxy) |
| Storage de Mídia | MinIO (via edge function upload-media) |
| Gráficos | Recharts |
| QR Code | qrcode.react |
| Excel | xlsx (SheetJS) |

### Arquitetura

```
┌──────────────────────────┐
│    SPA React (Vite)      │
│    Todas as rotas SPA    │
└──────────┬───────────────┘
           │ fetch / supabase-js
           ▼
┌──────────────────────────┐
│  Supabase                │
│  ├─ Auth (JWT)           │
│  ├─ PostgreSQL (RLS)     │
│  └─ Edge Functions       │
│     ├─ evolution-proxy   │──► Evolution API (WhatsApp)
│     ├─ upload-media      │──► MinIO (S3-compatible)
│     ├─ sync-igreen       │──► Portal iGreen API
│     └─ crm-auto-progress │
└──────────────────────────┘
```

### Rotas

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/` | Index | Redireciona para /auth |
| `/auth` | Auth | Login / Cadastro |
| `/admin` | Admin | Painel do consultor (protegido) |
| `/:licenca` | ConsultantPage | Landing page do cliente |
| `/licenciada/:licenca` | LicenciadaPage | Landing page da licenciada |
| `/licenciada/preview` | LicenciadaPreview | Preview da landing licenciada |
| `*` | NotFound | Página 404 |

---

## 2. Página de Autenticação (`/auth`)

**Arquivo:** `src/pages/Auth.tsx`

Formulário de login/cadastro com toggle entre os dois modos.

### Campos
- **Email** — Input do tipo email
- **Senha** — Input do tipo password

### Botões e Ações
| Botão | Ação |
|-------|------|
| "Entrar" / "Criar conta" | Login via `supabase.auth.signInWithPassword` ou cadastro via `supabase.auth.signUp` |
| "Não tem conta? Cadastre-se" | Toggle para modo cadastro |
| "Já tem conta? Faça login" | Toggle para modo login |

### Comportamento
- Ao detectar sessão ativa (`onAuthStateChange`), redireciona para `/admin`
- Exibe toast de erro ou sucesso
- Botão desabilitado durante loading com spinner

---

## 3. Painel Admin (`/admin`)

**Arquivo:** `src/pages/Admin.tsx`

Painel principal com **5 abas**. Protegido por autenticação.

### Header Fixo
- Logo iGreen Energy
- Botão **"Sair"** — `supabase.auth.signOut()` e redireciona para `/auth`

### 3.1 Aba "Dashboard"

#### Cards KPI
| Card | Dado | Fonte |
|------|------|-------|
| Visualizações | Total page views (30 dias) | page_views |
| Página Cliente | Views tipo "client" | page_views filtrado |
| Página Licenciado | Views tipo "licenciada" | page_views filtrado |
| Cliques | Total eventos "click" | page_events |

#### Cards Clientes
| Card | Dado |
|------|------|
| Total Clientes | Contagem de customers |
| kW Consumo | Soma de media_consumo |
| Taxa Conversão | (totalClicks / totalViews) * 100% |

#### Filtro
- **Select "Filtrar por licenciado"** — filtra por `registered_by_name`

#### Botão "Sincronizar iGreen"
- Se credenciais não configuradas → dialog para inserir email/senha
- Se configuradas → invoca edge function `sync-igreen-customers`

#### Gráficos (Recharts)
| Gráfico | Tipo | Dados |
|---------|------|-------|
| Cliques por Botão | BarChart horizontal | clicksByPage separado client/licenciada |
| Top Licenciados | BarChart horizontal | topLicenciados (top 10) |
| Status dos Clientes | PieChart (donut) + badges | customersByStatus |
| Novos Clientes por Semana | AreaChart | weeklyNewCustomers (4 semanas) |
| Visualizações 30 dias | AreaChart 2 linhas | daily (client + licenciada) |
| Horários de Pico | BarChart | hourly (0-23h) |
| Dispositivos | Barras de progresso | devices |
| Origem do Tráfego | PieChart donut | utmSources |
| Comparativo Diário | BarChart agrupado | daily |

### 3.2 Aba "Preview"
- Botão "Abrir Página Cliente" — nova aba
- Botão "Abrir Página Licenciado" — nova aba
- iframe com preview

### 3.3 Aba "WhatsApp"
Renderiza `WhatsAppTab` — ver [Seção 4](#4-módulo-whatsapp-sub-abas).

### 3.4 Aba "Links"

#### LinkCards Principais
- Landing Cliente e Landing Licenciado com botão Copiar

#### Links UTM
Para cada rede social (WhatsApp, Instagram, Facebook, YouTube, TikTok, Google) × 2 páginas:
- Botão **"Copiar"** e Botão **"QR Code"**

#### Modal QR Code
- QR visual, botão "Copiar link", botão "Baixar PNG"

### 3.5 Aba "Dados"

| Campo | Tipo | Notas |
|-------|------|-------|
| Foto | Upload imagem | Supabase Storage |
| Nome | Input text | Gera slug automático |
| Licença | Input readonly | |
| WhatsApp | Input text | |
| ID iGreen | Input text | |
| Facebook Pixel ID | Input text | |
| Google Analytics ID | Input text | |
| Email Portal iGreen | Input text | |
| Senha Portal iGreen | Input password (toggle) | |

Botão **"Salvar dados"** — atualiza consultants no Supabase

---

## 4. Módulo WhatsApp (sub-abas)

**Arquivo:** `src/components/whatsapp/WhatsAppTab.tsx`

6 sub-abas: Conversas, CRM, Envio em Massa, Templates, Agendamentos, Clientes.

### 4.1 Sub-aba "Conversas"

#### Se DESCONECTADO → ConnectionPanel
- QR Code com timer (60s)
- Logs diagnósticos
- Botões: Conectar, Reconectar, Desconectar (com confirmação)

#### Se CONECTADO → ChatSidebar + ChatView

**ChatSidebar:** busca, lista de chats com avatar, nome, última msg, timestamp, unread badge.

**ChatView header:** avatar, nome, telefone, botão "Adicionar Cliente" / badge "Cliente", select CRM.

**Área de Mensagens (MessageBubble):** texto, imagem (auto-load, expandir fullscreen), áudio (player), vídeo, documento (PDF iframe), sticker. Status: ⏰→✓→✓✓→✓✓azul.

**MessageComposer:**
- Botão Quick Reply (💬), Botão Anexar (📎, max 100MB), Textarea ("/" para quick reply), Botão Enviar/Gravar
- Preview de arquivo e imagem pendente
- Modo gravação: indicador pulsante, cronômetro, cancelar/enviar

**Ordem de envio com template áudio+imagem+texto:**
1. Áudio → `sendAudio`
2. Imagem → `sendMedia`
3. Texto → `sendTextMessage`

### 4.2 Sub-aba "CRM" (Kanban)

- Badge "Auto-progressão ativa"
- Botão "Configurar Colunas" → dialog com edição de label/cor, toggle auto-mensagem, StageAutoMessageConfig
- StageAutoMessageConfig: tipo, upload mídia, upload imagem, textarea com formatação, preview, botões Remover/Cancelar/Salvar
- Colunas com drag & drop. Stages padrão: Novo Lead, Aprovado, Reprovado, 30/60/90/120 DIAS
- Ao mover deal → atualiza stage + envia auto-mensagem se habilitada

### 4.3 Sub-aba "Envio em Massa"

- Checkbox "Selecionar Todos" + lista de clientes
- Select de template + textarea (variáveis: `{{nome}}`, `{{valor_conta}}`)
- Intervalo 20s entre envios (proteção anti-bloqueio com countdown)
- Ordem: áudio → imagem → texto (quando template áudio)
- Resultado: X enviadas / X falhas

### 4.4 Sub-aba "Templates"

- Lista com ícone/badge de tipo, preview, botões Preview (👁) e Excluir (🗑)
- Formulário: seletor tipo (Texto/Imagem/Áudio/Documento), nome, conteúdo, upload mídia, gravar áudio, upload imagem opcional
- Variáveis: `{{nome}}`, `{{valor_conta}}`

### 4.5 Sub-aba "Agendamentos"

- Stats: pendentes, enviados, falhas
- Formulário: telefone, mensagem, data/hora → insere em scheduled_messages
- Lista com status badges, botão excluir (apenas pendentes)

### 4.6 Sub-aba "Clientes"

- Botões: Sincronizar iGreen, Importar Excel, Adicionar
- Busca por nome/telefone, filtros por status com contagem
- Lista expansível com avatar, nome, telefone, CPF, status badge
- Ações: WhatsApp (mensagem sugerida), copiar telefone, editar, excluir
- Dialog edição com campos completos + busca CEP
- Dialog importação Excel com preview

---

## 5. Landing Pages

### 5.1 Página do Cliente (`/:licenca`)
Componentes: SEOHead, PixelInjector, HeroSection, AboutSection, AdvantagesSection, HowItWorksSection, SolarPlantsSection, StatesSection, TestimonialsSection, ClubSection, ReferralSection, ConsultantSection, WhatsAppFloat.

### 5.2 Página da Licenciada (`/licenciada/:licenca`)
Componentes específicos no namespace `licenciada/`.

### 5.3 Tracking
- `useTrackView` → page_views ao montar
- `trackClickEvent` → page_events ao clicar
- `PixelInjector` → Facebook Pixel + Google Analytics

### 5.4 Componentes Compartilhados
ScrollReveal, SEOHead, WhatsAppFloat, LoadingScreen, NavLink, PixelInjector.

---

## 6. Hooks Customizados

### 6.1 `useWhatsApp(consultantId)`
Gerencia conexão WhatsApp. Retorna: status, instanceName, qrCode, phoneNumber, isLoading, error, connectionLogs, createAndConnect, disconnect, reconnect, refreshQr. Polling 10s, timeout 45s, recovery automático.

### 6.2 `useTemplates(consultantId)`
Retorna: templates, isLoading, createTemplate, deleteTemplate, applyTemplate. `applyTemplate` substitui `{{nome}}` e `{{valor_conta}}`.

### 6.3 `useChats(instanceName)`
Retorna: chats (ChatItem[]), isLoading, error, refetch. Polling 15s, cache de fotos (TTL 10min), filtra grupos, resolve LID.

### 6.4 `useMessages(instanceName, remoteJid, preferredSendTargetJid)`
Retorna: messages (ChatMessage[]), isLoading, sendMessage, loadMedia, refetch. Polling 5s, 100 msgs, markAsRead, resolve LID, optimistic update.

### 6.5 `useConsultant(license)`
React Query → busca consultants por license.

### 6.6 `useAnalytics(consultantId)`
React Query → views, events, deals, clientes (paginado >1000). Retorna: totalClient, totalLicenciada, totalClicks, clicksByTarget, clicksByPage, daily, hourly, devices, utmSources, totalCustomers, customersByStatus, totalKw, avgKw, topLicenciados, weeklyNewCustomers, conversionRate, allCustomers.

### 6.7 `useTrackView(consultantId, pageType)`
Insere em page_views ao montar. Captura device_type, UTM params.

### 6.8 `trackClickEvent(consultantId, eventTarget, pageType)`
Função standalone. Insere em page_events com tipo "click".

### 6.9 `useIsMobile()`
Retorna boolean (viewport < 768px).

### 6.10 `useToast()`
Toast/notificação via Radix. Variants: "default", "destructive".

---

## 7. Serviços

### 7.1 Evolution API (`src/services/evolutionApi.ts`)

Todas chamadas passam por `evolution-proxy`. Função interna `request<T>(path, method, body?)` com auth JWT.

#### Instância
| Função | Descrição |
|--------|-----------|
| createInstance | Cria instância + gera QR |
| connectInstance | Solicita QR |
| getConnectionState | Estado: "open"/"close"/"connecting" |
| deleteInstance | Exclui instância |
| logoutInstance | Desconecta |
| fetchInstances | Lista instâncias |

#### Chat
| Função | Descrição |
|--------|-----------|
| findChats | Lista conversas |
| findMessages | Busca mensagens |
| findContacts | Lista contatos |
| getBase64FromMediaMessage | Baixa mídia como base64 |
| markAsRead | Marca como lida |
| getProfilePicture | URL da foto de perfil |

#### Envio
| Função | Descrição |
|--------|-----------|
| sendTextMessage | Envia texto |
| sendMedia | Envia imagem/vídeo/documento |
| sendAudio | Envia áudio (voz) |
| sendDocument | Envia documento com nome |

#### Erros
- 401 → autenticação, 504 → timeout graceful, TypeError → conexão

### 7.2 MinIO Upload (`src/services/minioUpload.ts`)

| Função | Descrição |
|--------|-----------|
| uploadMedia | Upload para MinIO via edge function |
| getAcceptString | Accept string por tipo |
| formatFileSize | Formata B/KB/MB |

---

## 8. Edge Functions (Supabase)

### 8.1 `evolution-proxy`
Proxy autenticado para Evolution API. Valida JWT, retry (até 3x), timeout configurável (15-50s), graceful timeout para connect/create.

### 8.2 `sync-igreen-customers`
Sincroniza clientes do portal iGreen. Autentica, pagina, transforma 30+ campos, upsert em batches.

### 8.3 `upload-media`
Upload para MinIO. Max 100MB. Tipos: image, audio, video, document.

### 8.4 `crm-auto-progress`
Auto-progressão de deals: ≥30d→30_dias, ≥60d→60_dias, ≥90d→90_dias, ≥120d→120_dias. Envia auto-mensagem se habilitada.

---

## 9. Banco de Dados (12 tabelas)

### 9.1 `consultants`
Dados dos consultores. PK=id (auth.users). RLS: Public read, Owner insert/update, no DELETE.

### 9.2 `customers`
Clientes com 50+ campos. RLS: Owner-only (consultant_id = auth.uid()).

### 9.3 `conversations`
Histórico chatbot. RLS: Public.

### 9.4 `crm_deals`
Deals CRM/Kanban. Campos: stage, notes, approved_at, remote_jid. RLS: Owner-only.

### 9.5 `customer_tags`
Tags de contatos. RLS: Owner-only.

### 9.6 `kanban_stages`
Config das colunas Kanban com auto_message_*. RLS: Owner-only (consultant_id::text).

### 9.7 `message_templates`
Templates reutilizáveis com media_type, media_url, image_url. RLS: All auth read, Owner write.

### 9.8 `page_views`
Views das landing pages. RLS: Public INSERT, Owner SELECT.

### 9.9 `page_events`
Cliques nas landing pages. RLS: Public INSERT, Owner SELECT.

### 9.10 `scheduled_messages`
Mensagens agendadas. Status: pending/sent/failed. RLS: Owner-only.

### 9.11 `settings`
Chave-valor global. RLS: Public.

### 9.12 `whatsapp_instances`
Instâncias WhatsApp. RLS: Owner-only.

---

## 10. Variáveis de Ambiente

### Frontend (.env)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_LOG_LEVEL`

### Edge Functions (Secrets)
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` — evolution-proxy, crm-auto-progress
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` — upload-media
- `SUPABASE_SERVICE_ROLE_KEY` — crm-auto-progress

---

## 11. Fluxos Críticos

### 11.1 Conexão WhatsApp
Conectar → createInstance → QR → polling 10s → state "open" → conectado → polling chats 15s

### 11.2 Envio Texto
Digitar → Enter → sendMessage → resolve LID → sendTextMessage → evolution-proxy → optimistic update

### 11.3 Envio Template (Áudio + Imagem + Texto)
"/" → seleciona template → handleTemplateSelect → setText + setAttachedFile(audio) + setPendingImageUrl → Enviar → sendAudio → sendMedia(imagem) → sendTextMessage

### 11.4 Envio em Massa
Selecionar clientes → template → Enviar → loop: aplica variáveis → sendAudio/sendMedia/sendText → delay 20s → resultado

### 11.5 CRM Auto-Progressão
Edge function → busca deals aprovados → calcula dias → move stage → envia auto-mensagem se habilitada

### 11.6 Sincronização iGreen
Credenciais → edge function → autentica API iGreen → pagina clientes → buildRecord → upsert batches

---

## 12. Tipos TypeScript

### `src/types/whatsapp.ts`
- `WhatsAppInstance` — id, consultant_id, instance_name, created_at
- `TemplateMediaType` — "text" | "image" | "audio" | "document"
- `MessageTemplate` — id, consultant_id, name, content, media_type, media_url, image_url, created_at
- `ConnectionStatus` — "disconnected" | "connecting" | "connected"
- `BulkSendProgress` — total, sent, failed, inProgress

### `src/types/consultant.ts`
- `Consultant` — id, name, license, phone, cadastro_url, photo_url, igreen_id, facebook_pixel_id, google_analytics_id, etc.

---

## 13. Utilitários

### `src/lib/logger.ts`
`createLogger(module)` → Logger com debug/info/warn/error. Em produção debug suprimido. Configurável via VITE_LOG_LEVEL.

### `src/lib/utils.ts`
`cn(...inputs)` → merge de classes Tailwind (clsx + tailwind-merge).

---

## 14. Bot Flow Engine — Contrato

O motor `supabase/functions/whapi-webhook/handlers/bot-flow.ts` é orientado por dados na tabela `bot_flow_steps`. Quem chegar depois deve respeitar este contrato pra evitar regressões.

### Tipos de step (`step_type`)

| Tipo | Quando usar | Precisa `captures`? | Precisa `transitions`? |
|---|---|---|---|
| `message` | Mensagem informativa sem esperar resposta específica | Não (mas pode capturar texto livre se terminar com `?`) | Sim, ao menos `default` → próximo |
| `question` | Pergunta que aguarda resposta categorizada | **Sim** | **Sim** |
| `media_request` | Pede foto/PDF (conta de luz, doc) | **Sim** (`kind: media`) | **Sim** (`media_received`) |
| `capture_conta` | Captura foto da conta de luz | **Sim** (`name: imagem_conta`) | Sim |
| `capture_documento` | Captura RG/CNH/selfie | **Sim** (`name: documento_cliente`) | Sim |
| `cadastro` / `finalizar_cadastro` | Aciona pipeline interno (OCR, portal iGreen) | **Sim** (`kind: system`) | Não — fallback handoff |

### Schema de `captures` (jsonb array)

```json
[{
  "name": "valor_conta",          // identificador interno
  "kind": "currency|text|media|system",
  "regex": "(?:r\\$\\s*)?\\d+(?:[.,]\\d{1,2})?",  // opcional, valida formato
  "accepts": ["image","document"],                // opcional, para kind=media
  "required": true,
  "retry_text": "Não entendi, manda só o número 😊",
  "enabled": true
}]
```

### Schema de `transitions` (jsonb array)

```json
[{
  "trigger_intent": "afirmacao|negacao|tem_duvida|media_received|default",
  "trigger_phrases": ["sim","quero","manda"],
  "goto_step_id": "uuid-do-proximo-passo",
  "goto_special": null            // ou "cadastro", "repeat", "handoff"
}]
```

Toda regra que não casa cai no `default` ou no `fallback`.

### Schema de `fallback` (jsonb object)

```json
{
  "mode": "retry|advance|goto|repeat|handoff|ai",
  "max_retries": 2,
  "on_fail": "handoff|next|repeat",
  "goto_step_id": null,
  "handoff_reason": "step_misconfigured_or_lead_off_topic"
}
```

### Anti-loop (engine)

Quando um lead manda resposta inválida em um passo com `transitions` (sem `default`):

1. **1ª tentativa**: repete a pergunta com texto suave (`"Desculpa, não entendi 🙈"`)
2. **2ª tentativa**: versão ainda mais curta (`"Pra eu te ajudar, só sim ou não 😊"`)
3. **3ª+**: pausa o bot (`bot_paused=true`, `bot_paused_reason='custom_step_no_match_retries_exhausted'`), cria `bot_handoff_alerts` e notifica o consultor via `notifyHandoff`.

Contadores: `customers.custom_step_retries` (int) + `customers.custom_step_retries_step` (texto). Resetam quando o lead avança de passo.

### Auto-reparo (`repair_bot_flow` RPC)

Função SECURITY DEFINER que conserta passos quebrados de um fluxo em um clique:
- Preenche `captures` default por tipo (currency p/ valor, media p/ conta/doc, text p/ pergunta)
- Cria `transitions` para o próximo passo quando não há (`default` ou `media_received`)
- Define `fallback` com `mode=retry, max_retries=2, on_fail=handoff`
- **Não sobrescreve** o que o consultor já configurou.

Disponível no botão "Reparar automaticamente" do `FlowAuditPanel` em `/admin/fluxos`.

### Watchdog (`bot-loop-watchdog` edge function)

Cron `*/15 * * * *` que roda `lint_bot_flow_consistency()`. Para cada `possible_loop` (5+ msgs no mesmo step em 24h) ou `orphan_flow_step` (lead em passo deletado):

1. Pausa o bot (`bot_paused_reason='auto_loop_detected'`)
2. Cria registro em `bot_handoff_alerts` com `metadata.detected_by='bot-loop-watchdog'`
3. Dispara `notifyHandoff` ao consultor
4. Anti-spam: pula se já houve alerta nas últimas 6h pra esse customer

### Painel "Saúde do bot" (`/admin/saude-bot`)

Onde o consultor vê tudo que precisa de atenção:
- Alertas de handoff abertos com botões "Reativar bot" e "Resolvi"
- Leads parados +24h no mesmo step
- Distribuição atual de leads por passo (gargalos visuais)

Atua como UI única pra escala — em 100+ consultores, ninguém precisa olhar log SQL.
