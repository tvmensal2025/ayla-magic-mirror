## Auditoria — Evolution (consultores) vs. Whapi (super admin) + FB Ads

### TL;DR

- **Evolution NÃO está 100% pronto pra outros consultores.** Funcionalmente a engine de fluxo roda, mas **2 pontos travam ou degradam a experiência hoje**: (1) o fluxo ainda chama `sendButtons` em 2 lugares (telefone / endereço) — no Evolution isso cai pra fallback de texto numerado (não quebra, mas não é o que você pediu); (2) **nenhum consultor está com instância conectada** no banco (`whatsapp_instances` só tem 2 registros, ambos `unknown`/`needs_reconnect`).
- **Conectar WhatsApp Business pelo Facebook ≠ conectar Evolution.** São fluxos diferentes. Hoje, pra rodar **anúncio CTWA + bot Evolution**, o consultor precisa **das duas coisas**, e o sistema **não amarra uma à outra**.

---

## 1. Engine do bot — paridade Whapi vs Evolution


| Item                         | Whapi                                 | Evolution                                                | Status                 |
| ---------------------------- | ------------------------------------- | -------------------------------------------------------- | ---------------------- |
| Webhook orchestrator         | `whapi-webhook/index.ts` (856 linhas) | `evolution-webhook/index.ts` (681 linhas)                | OK                     |
| Handler de fluxo             | `handlers/bot-flow.ts` 4292 linhas    | `handlers/bot-flow.ts` 4226 linhas                       | ~98% paridade          |
| Conversational flow          | ✅                                     | ✅                                                        | OK                     |
| OTP intercept                | ✅                                     | ✅                                                        | OK                     |
| CRM sync, notify lead, audit | ✅                                     | ✅                                                        | OK                     |
| Dedup, rate-limit            | ✅                                     | ✅                                                        | OK                     |
| Botões nativos               | ✅ (`/messages/interactive`)           | ⚠️ tenta `/message/sendButtons` e cai pra texto numerado | Você pediu "sem botão" |


**Onde o código ainda manda botão no Evolution** (`evolution-webhook/handlers/bot-flow.ts`):

- linha 836 — wrapper `sendOptions` que delega pra `sendButtons`
- linha 4204 — confirmação de telefone (`ask_phone_confirm`)
- linha 4210 — pergunta de complemento de endereço (`ask_complement`)

No Evolution o `sendButtons` (`_shared/evolution-api.ts:113-148`) tenta a API e, falhando, faz fallback pra texto numerado. **Cliente recebe, mas é fluxo "1. Sim / 2. Outro número" — gambiarra.**

### O que vamos fazer (próxima execução)

1. Criar flag interna `WHATSAPP_PROVIDER = "whapi" | "evolution"` no shared, derivada do `instance` no momento do envio.
2. No `evolution-webhook/handlers/bot-flow.ts`:
  - substituir os 3 pontos acima por `sendText` direto com prompt em linguagem natural ("Esse número que você está me mandando mensagem agora é o mesmo onde você quer receber o cadastro? Pode responder *sim* ou me mandar o outro número.")
  - manter `sendButtons` no arquivo (não remover) — só não chamar.
3. No `whapi-webhook/handlers/bot-flow.ts`: **mantém botão idêntico**.
4. Capturar entrada como texto livre nos passos `ask_phone_confirm` / `ask_complement` — já existe parser, só ampliar regex pra aceitar "sim/é meu/pode usar/troca pra…".

---

## 2. Conexão WhatsApp do consultor

Hoje:

- Frontend (`useWhatsApp.ts` + `whatsappStateChecks.ts` + `useWhatsAppInstanceDb.ts`) cria instância **Evolution** automática `igreen-<8charsConsultantId>`, registra webhook `/functions/v1/evolution-webhook`, pede QR.
- `whatsapp_instances` no banco: **2 registros, ambos não conectados**. → Hoje só o super admin (Whapi) está realmente operando.

### Pré-condições pro Evolution rodar pra um consultor novo

1. `EVOLUTION_API_URL` + `EVOLUTION_API_KEY` configurados como secrets (✅ existem — referenciados em `evolution-webhook/index.ts:36-37` e `evolution-proxy/index.ts:312-313`).
2. Servidor Evolution alvo aceitando criar instância + retornando QR. **Não validado nesta auditoria — recomendado rodar smoke test via `code--exec curl` no `EVOLUTION_API_URL`.**
3. Consultor escanear o QR → `CONNECTION_UPDATE` no webhook grava `connected_phone`.

### Gaps identificados


| #   | Gap                                                                                                                                     | Severidade |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| G1  | Sem health-check exibido pro consultor após o "conectado" — não dá pra distinguir "tá conectado mas servidor Evolution caiu"            | Média      |
| G2  | `connected_phone` não é sincronizado pra `consultant_ad_settings.whatsapp_destination_number` quando vem por QR (só pelo form de Dados) | Alta       |
| G3  | Nada bloqueia o consultor de tentar publicar anúncio sem ter conectado WhatsApp / Facebook                                              | Alta       |


---

## 3. Conectar **WhatsApp Business no Facebook** (CTWA)

**Esse é o ponto mais confuso e onde você pode perder o consultor.** Existem 3 coisas diferentes que o sistema chama de "WhatsApp":

1. **WhatsApp do bot (Evolution)** — número que recebe lead, roda o fluxo, manda áudio, faz cadastro.
  - Conexão: QR Code via Evolution API.
  - Onde aparece: `whatsapp_instances`.
2. **WhatsApp Business "comum"** (app verde do celular) — não tem API, não conecta no FB pra rodar ad CTWA oficial.
3. **WhatsApp Business API / WABA** — número registrado na Meta Business Suite, **vinculado à Página do Facebook**, com pixel + CAPI. **Esse é o número que vai em `whatsapp_destination_number` e que o anúncio CTWA vai usar** (`facebook-create-campaign/index.ts:285-360` exige).

### O que está implementado hoje

- `useConsultantForm.ts:111` — quando o consultor preenche `whatsapp_principal` no form, faz upsert em `consultant_ad_settings.whatsapp_destination_number`. ✅
- `facebook-create-campaign/index.ts:285` — bloqueia criação de campanha sem `whatsapp_destination_number`. ✅
- `useFacebookConnection.ts` — lê a conexão OAuth da Meta com pixel/page/account/IG. ✅

### O que ainda NÃO está coberto


| #   | Item                                                                                                                                                                                                                       | Risco |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| F1  | Sistema não valida se o número que o consultor digitou está **realmente registrado como WABA na Página dele**. Se ele digitar o número do WhatsApp comum, o `facebook-create-campaign` vai dar erro só na hora de publicar | Alto  |
| F2  | Não há fluxo guiado "conecte sua Página → conecte seu WABA → autorize pixel". Hoje o consultor precisa saber o que fazer no Meta Business Suite                                                                            | Alto  |
| F3  | Mesmo consultor pode acabar com **número do bot ≠ número do anúncio** (bot QR em um chip, WABA registrada em outro) e ninguém avisa                                                                                        | Médio |
| F4  | `facebook-oauth-callback` salva pixel/page/ad_account, mas **não detecta automaticamente o WABA da Página** via `/{page_id}/whatsapp_business_account`                                                                     | Médio |


### Plano de fix (próxima execução)

1. **Edge function nova `facebook-detect-waba**`: dado `page_id` + token, chama `GET /{page_id}?fields=connected_whatsapp_business_account` na Graph e devolve número. Auto-preenche `whatsapp_destination_number` se vazio e marca `consultant_ad_settings.waba_verified=true`.
2. **Card de pré-checagem** no `/admin/anuncios` (componente `HealthSummaryCard.tsx` já existe — estender):
  - ✅/❌ WhatsApp do bot conectado (Evolution)
  - ✅/❌ Facebook conectado (OAuth válido + token não expirado)
  - ✅/❌ Pixel configurado
  - ✅/❌ WABA registrado na Página + bate com `whatsapp_destination_number`
  - ✅/❌ Onboarding completo (já existe `OnboardingGate.tsx`)
3. **Bloquear o botão "Publicar anúncio"** enquanto os 4 itens acima não estiverem verdes. Mensagem clara: "Antes de anunciar, conecte seu WhatsApp Business à sua Página do Facebook — [passo a passo]".
4. **Sincronizar QR conectado → `whatsapp_destination_number**`: no `evolution-webhook/handlers/connection.ts`, quando `CONNECTION_UPDATE` setar `connected_phone`, fazer `upsert` em `consultant_ad_settings.whatsapp_destination_number` SE o consultor ainda não tiver WABA configurado (resolve G2 e F3 para o caso comum).

---

## 4. Resposta direta às suas perguntas

> **"O sistema da Evolution com o fluxo sem botão (porque botão é só Whapi), para outros consultores está 100%?"**

Não. Hoje:

- Engine roda, mas **3 chamadas de `sendButtons` ainda estão ativas** no fluxo Evolution (telefone + endereço). Caem pra texto numerado quando o Evolution não suporta — funciona mas não é o "sem botão" que você quer.
- **Nenhum consultor está com instância Evolution conectada** no banco no momento.
- Fix é cirúrgico: remover as 3 chamadas e substituir por `sendText` em linguagem natural + ampliar o parser de resposta.

> **"Se ele conectar, ele vai poder fazer tudo conectando o WhatsApp Business dele no Facebook?"**

Não automaticamente. Hoje conectar o Facebook (OAuth) **não vincula sozinho** o WhatsApp Business do consultor à Página. Ele precisa:

1. Conectar Evolution (QR) → bot funciona.
2. Conectar Facebook (OAuth) → pixel, page, ad_account ficam disponíveis.
3. **Manualmente** ir no Meta Business Suite e amarrar o número WABA dele à Página, e
4. **Manualmente** digitar esse número no form de Dados (que sincroniza pra `whatsapp_destination_number`).

Se ele pular o passo 3, a campanha CTWA dele vai falhar na publicação (`WHATSAPP_BUSINESS_REQUIRED`).

---

## 5. Próximas execuções recomendadas (em ordem)

1. **[Bot Evolution sem botão]** Remover `sendButtons` dos 3 pontos de `evolution-webhook/handlers/bot-flow.ts`, manter Whapi intacto.
2. **[Sync número]** No `evolution-webhook/handlers/connection.ts`, quando QR conectar, fazer upsert do `connected_phone` em `consultant_ad_settings.whatsapp_destination_number`.
3. **[Pré-flight CTWA]** Estender `HealthSummaryCard` com os 4 checks + bloqueio do botão "Publicar".
4. **[WABA auto-detect]** Nova edge `facebook-detect-waba` + integração no `facebook-oauth-callback`.
5. **[Doc consultor]** Tooltip / wizard de 4 passos no `/admin` explicando "conectar bot ≠ conectar Página ≠ conectar WABA".

Quer que eu já comece pelo item 1 e faca o 112345 todos

&nbsp;