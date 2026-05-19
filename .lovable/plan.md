## Objetivo

Garantir que todos os anúncios da conta `act_317035519061535` usem o Pixel correto (`1521037349653769` — `igreen-app-oficial`):
1. **Diagnosticar** todos os adsets ativos e mostrar qual Pixel cada um está usando.
2. **Migrar** adsets que estão com pixel errado para o pixel correto.
3. **Travar** o pixel correto no código de criação de novos anúncios.

## O que será feito

### 1. Nova Edge Function: `facebook-diagnose-pixels`
Lista todas as campaigns → adsets ativos da conta, e para cada adset retorna:
- `campaign_name`, `adset_id`, `adset_name`, `status`, `effective_status`
- `current_pixel_id` (extraído de `promoted_object.pixel_id` e/ou `tracking_specs[].fb_pixel`)
- `current_pixel_name`
- `is_correct` (true se já está no `1521037349653769`)
- `created_by_platform` (heurística: se o nome bate com o padrão `[license] - ...` usado por `facebook-create-campaign`)

Restrita a `admin` / `super_admin`.

### 2. Nova Edge Function: `facebook-migrate-adset-pixel`
Recebe `{ adset_id }` e migra para o Pixel correto:
- Como Meta **não** permite trocar pixel em adset com entrega ativa, a função:
  1. Pausa o adset original.
  2. Duplica o adset (`/copies`) com o mesmo targeting/budget.
  3. No novo adset, atualiza `promoted_object.pixel_id` e `tracking_specs` para `1521037349653769`.
  4. Copia os ads (criativos) do adset antigo para o novo.
  5. Ativa o novo adset; mantém o antigo pausado para histórico.
- Retorna `{ ok, old_adset_id, new_adset_id, warnings[] }`.
- Aviso claro no retorno: **reseta aprendizado**.

### 3. UI no `PlatformFacebookCard.tsx`
- Novo botão **"Diagnosticar Pixels"** → abre um dialog com tabela:
  - Colunas: Campanha · Adset · Status · Pixel atual · Correto? · Ação
  - Linhas com pixel errado mostram botão **"Migrar para pixel correto"** (chama `facebook-migrate-adset-pixel`).
  - Botão **"Migrar tudo que está errado"** no topo (loop sequencial com feedback por linha).

### 4. Travar pixel nos novos anúncios
Em `supabase/functions/facebook-create-campaign/index.ts`:
- Constante `REQUIRED_PIXEL_ID = "1521037349653769"`.
- No bloco onde monta `conn` (linha ~219), substituir `pixel_id: platform.pixel_id` por `pixel_id: REQUIRED_PIXEL_ID` (com warning no log se `platform.pixel_id` divergir).
- Garante que **todo novo adset** já nasce com `promoted_object.pixel_id` e `tracking_specs.fb_pixel` corretos.

### 5. (Opcional, recomendado) Migration
Adicionar `platform_facebook_account.pixel_id_locked boolean default true` só pra deixar registrado que o pixel é travado por código — informativo, não usado em lógica.

## Detalhes técnicos

- **Endpoints Meta usados:**
  - `GET /{ad_account_id}/campaigns?fields=id,name,status,effective_status&effective_status=['ACTIVE']`
  - `GET /{campaign_id}/adsets?fields=id,name,status,effective_status,promoted_object,tracking_specs,daily_budget,targeting,billing_event,optimization_goal,bid_strategy,start_time,end_time`
  - `GET /{pixel_id}?fields=name`
  - `POST /{adset_id}` com `status=PAUSED`
  - `POST /{adset_id}/copies` com `deep_copy=true, status_option=PAUSED`
  - `POST /{new_adset_id}` para atualizar `promoted_object` + `tracking_specs`
- **Permissões:** ambas as funções exigem role `admin`/`super_admin` via `has_role`.
- **Idempotência:** `facebook-diagnose-pixels` é read-only; pode ser chamado quantas vezes quiser. `facebook-migrate-adset-pixel` valida se o adset já está com pixel correto antes de duplicar.
- **Sem mudanças de schema obrigatórias** (a migration do item 5 é opcional).

## Fora de escopo

- Anúncios criados direto no Gerenciador da Meta (você confirmou que são pela plataforma).
- Mudar pixel em adsets já encerrados/arquivados.
- Refatorar `facebook-ensure-pixel` (continua válido para criar/garantir o pixel na conta).