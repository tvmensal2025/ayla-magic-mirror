## Novo modelo: tudo centralizado na sua BM

Decisão do owner: **todos os consultores usam a mesma Business Manager, Página, Conta de Anúncios e Pixel**. A única coisa que muda por consultor é o **número de WhatsApp Business** que recebe a conversa. Você bancará o saldo da conta de anúncios, e o aprendizado fica concentrado num único pixel `igreen-tag-site`.

Isso simplifica MUITO o app: a maior parte da lógica multi-tenant de Facebook (conexão por consultor, validação de token por consultor, pixel por consultor, wallet por consultor) deixa de existir e é substituída por **uma configuração global**.

## Correção do erro "Falha ao criar campanha"

A mensagem é literal do Meta:

> *"The requested file could not be read, typically due to permission problems that have occurred after a recent change in permissions."*

É o `error_user_msg` do `/adimages`. No nosso código (`facebook-create-campaign/index.ts` linhas 411-432) mandamos a imagem em **base64** via `bytes` num corpo `application/x-www-form-urlencoded` — corpo gigante, CPU alto, Meta às vezes rejeita.

**Fix**: trocar `bytes` → `url`. As fotos já estão em URL pública do Supabase Storage, o Meta baixa sozinho.

```ts
body: new URLSearchParams({ url, access_token: conn.token })
```

Com fallback para `bytes` se o Meta não conseguir buscar a URL. E quando todas as imagens falharem, propagar a mensagem real do Meta no throw (em vez do genérico "Nenhuma imagem pôde ser carregada").

## Arquitetura nova: "Plataforma Global iGreen Ads"

### 1. Nova tabela `platform_facebook_config` (linha única, só owner edita)

```text
platform_facebook_config
- id (singleton)
- business_id              (sua BM)
- ad_account_id            (sua única conta de anúncios)
- page_id                  (sua única Página)
- ig_account_id            (seu Instagram, opcional)
- pixel_id                 (id do pixel igreen-tag-site)
- pixel_name               ("igreen-tag-site")
- system_user_token        (token longo de System User da BM — nunca expira)
- token_encrypted          (criptografado igual ao fb_connections atual)
- default_currency
- updated_at
```

RLS: SELECT/UPDATE só para `is_super_admin(auth.uid())`. Edge functions usam service role.

### 2. Tabela `facebook_connections` é simplificada

Vira só uma referência **"qual número de WhatsApp esse consultor usa"**:

- Mantém `consultant_id`, `whatsapp_destination_number`, `whatsapp_display_number`.
- Marca como deprecated/ignored: `business_id`, `ad_account_id`, `page_id`, `pixel_id`, `token` (não usados mais para campanhas — só leitura histórica).
- Estado novo: `status='ready'` quando o consultor tem `whatsapp_destination_number` salvo.

### 3. Nova UI: card "Meu número de WhatsApp para anúncios"

Substitui o `ConnectFacebookCard` na aba Anúncios. O consultor não conecta mais Facebook. Ele só:

1. Cola o número da WhatsApp Business dele (formato `+55 11 99999-9999`).
2. Confirma que esse número está vinculado como WhatsApp Business **na sua Página** (o owner adicionou ele no Meta Business Suite → Página → Configurações de WhatsApp).
3. Salva — UI mostra "Pronto para publicar anúncios".

### 4. Novo card só-owner: "Configuração global do iGreen Ads"

Em `/admin/super` (`PlatformFacebookCard.tsx` já existe — vamos expandir):

- Botão "Conectar minha BM" → OAuth normal, salva em `platform_facebook_config`.
- Mostra: conta de anúncios, página, pixel selecionado, saldo da carteira Meta.
- Lista os números de WhatsApp vinculados à Página (`GET /{page_id}?fields=whatsapp_business_account{phone_numbers}`) — owner vê quais já estão prontos pra ser distribuídos aos consultores.
- Botão "Criar/Garantir pixel igreen-tag-site" → cria se não existir, atualiza `pixel_id` na config.
- Status do saldo: `GET /{ad_account_id}?fields=balance,amount_spent,spend_cap`.

### 5. Edge functions reescritas

Atualizar para ler de `platform_facebook_config` (single source of truth) e usar `whatsapp_destination_number` do consultor:

- `**facebook-create-campaign**`: deixa de chamar `loadCampaignConnection(consultantId)`. Passa a chamar `loadPlatformConfig()` + `loadConsultantPhone(consultantId)`. Tag de campanha continua tendo o `consultantTag` pra você saber depois quem gerou.
  - Bonus: fix do `bytes`→`url` já entra aqui.
- `**facebook-validate-account**`: valida a config global (não a do consultor). O check de consultor vira só "tem número WhatsApp configurado?".
- `**facebook-metrics-sync**`: continua igual, mas usa o token global.
- `**facebook-capi**`: continua mandando pro pixel global; o `consultant_id` vira `custom_data` pra você atribuir conversões internamente.
- `**facebook-list-pages**`, `**facebook-list-ad-accounts**`, `**facebook-oauth-callback**`: só fazem sentido no fluxo do owner.

### 6. Wallet/Stripe (`consultant_wallet`)

Você disse que **bancará o saldo**. Então: O SALDO Ẽ OBRIGATORIO PARA ELE, VAI USAR APENAS OQUE TEM DISPONIVEL NA CARTEIRA DELE, ELES IRAO USAR MINHA PAGINA MEU PIXEL TUDO MEU, MAS IRAO PAGAR TUDO 100% OQUE USAR SEM DEIXAR NADA, TAXAS , NAO PODE FICAR NADA PARA EU, TUDO VAI SER COMPUTADO DE SEU SALDO

- A wallet por consultor **VAI obrigatória** para publicar. e o `facebook-auto-pause` pausa ao estourar A CARTEIRA

Vou implementar a opção B (menor risco), com flag `platform_facebook_config.wallet_mode = 'shared' | 'per_consultant_limit'`.

### 7. Dashboard de anúncios — mantém

O Dashboard que reformulamos no plano anterior continua funcionando — só passa a usar a config global por baixo.

## Arquivos a tocar

**Backend (edge functions):**

- `supabase/functions/facebook-create-campaign/index.ts` — usar `platform_facebook_config` + fix `bytes`→`url`.
- `supabase/functions/_shared/fb-graph.ts` — adicionar `loadPlatformConfig()` e ajustar `loadCampaignConnection` para preferir a config global.
- `supabase/functions/facebook-validate-account/index.ts` — validar global + checar `whatsapp_destination_number` do consultor.
- `supabase/functions/facebook-ensure-pixel/index.ts` (novo) — cria/garante pixel `igreen-tag-site` na conta global.
- `supabase/functions/facebook-list-page-whatsapp-numbers/index.ts` (novo) — lista números WABA da Página global para o owner distribuir.

**DB:**

- Migration: criar `platform_facebook_config` + RLS.
- Migration: marcar colunas obsoletas em `facebook_connections` como nullable (já são).

**Frontend:**

- `src/hooks/usePlatformFacebookConfig.ts` (novo) — lê a config global.
- `src/components/admin/super/PlatformFacebookCard.tsx` — expande pra ter OAuth, pixel, lista de números WABA.
- `src/components/admin/ads/ConnectFacebookCard.tsx` — vira `WhatsAppNumberCard.tsx`: só pede/salva o número do consultor.
- `src/components/admin/ads/CreateCampaignWizard.tsx` — remove validações de pixel/página por consultor; mostra "Pixel: igreen-tag-site (compartilhado)" no resumo.
- `src/pages/ConsultantPage.tsx` — `PixelInjector` passa a usar `platform_facebook_config.pixel_id` em vez do pixel do consultor.

## Análise: o que mais dá pra evoluir junto

- **CAPI server-side com `consultant_id` em custom_data**: você consegue atribuir cada conversão `Lead/Purchase` ao consultor correto mesmo com pixel único — usando custom_data no evento. Já temos `facebook-capi` — só adicionar o campo.
- **Custom Audience compartilhada**: como todos os leads passam pelo seu pixel, dá pra criar **uma única Lookalike** com todos os clientes ativos. O `facebook-sync-audiences` passa a rodar global, não por consultor — aprende mais rápido.
- **Auto-pause centralizado**: já existe, vai ficar mais fácil de configurar regras globais (ex: pausar criativo com CPL > X).
- **Branding único nos anúncios**: como tudo sai da sua Página, todos os anúncios mostram a mesma marca — ganho de confiança e CPL menor.

## Fora do escopo

- Não vou implementar o cadastro de números WhatsApp na Meta (você faz no Business Suite manualmente, depois cola o número no app).
- Não vou tocar no fluxo de WhatsApp/CRM dos consultores — só na parte de anúncios.

## Plano de execução resumido

1. Migration `platform_facebook_config`.
2. Card de owner em `/admin/super` para conectar BM + criar pixel + listar números WABA.
3. Edge functions migradas para a config global + fix do upload de imagem.
4. Card de consultor reduzido a "informe seu número WhatsApp".
5. Wizard de campanha sem etapas de conexão FB do consultor.
6. PixelInjector global na LP.
7. CAPI com `consultant_id` em custom_data.