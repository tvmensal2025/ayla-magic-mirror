## Problema

Na tela "Nova campanha — Passo 4 de 4" aparece:
- ⚠ **Pixel ausente** — mas o pixel está travado e ativo na conta da plataforma (`REQUIRED_PIXEL_ID=1521037349653769`).
- ✗ **WABA não detectado** — `facebook-detect-waba` retorna 401 (`OAuthException 190/460` — token do consultor invalidado por troca de senha).
- 🔴 **Falha ao criar campanha**: `Invalid parameter | A programação da campanha é muito curta | subcode=1487793 | code=100` — adsets com orçamento diário precisam de **≥ 24 h** de janela.

### Causa raiz

1. **Pré-voo lê da conta errada.** Migramos para conta Facebook única (`platform_facebook_account`) + telefone WA por consultor (`consultant_ad_settings`). Mas `useCtwaPreflight` e `facebook-detect-waba` ainda leem `facebook_connections` do consultor — que pode estar vazia (sem pixel) ou ter token quebrado (190/460).
2. **Janela do adset < 24 h.** Em `facebook-create-campaign`: `start_time = now + 60s`, `end_time = now + duration_days * 24h`. Com `duration_days = 1` a janela fica em ~23 h 59 min — Meta rejeita.

## Plano

### 1. `supabase/functions/facebook-detect-waba/index.ts`
- Passar a usar `platform_facebook_account` (page_id + token descriptografado da plataforma) em vez de `facebook_connections` do consultor. O telefone para comparação continua vindo de `consultant_ad_settings.whatsapp_destination_number` (com fallback de `whatsapp_instances`/`consultants.phone`, igual `loadConsultantAdSettings`).
- Auto-upsert do número detectado em `consultant_ad_settings` permanece (não toca mais `facebook_connections`).

### 2. `src/hooks/useCtwaPreflight.ts`
- Em vez de `facebook_connections`, chamar uma nova edge leve `ctwa-status` (ou reusar `facebook-preflight-check` em modo "summary") que devolve:
  - `facebook`: status da plataforma (token válido, page_id presente).
  - `pixel`: status do `REQUIRED_PIXEL_ID` travado (sempre OK quando a plataforma está conectada).
  - `whatsapp_number`: número resolvido em `consultant_ad_settings`.
- O hook só monta os cards a partir do retorno; some o fetch direto a `facebook_connections`.
- Mantém o `setWaba` via `facebook-detect-waba` (já corrigido no passo 1).

Caminho mais barato e suficiente: criar `supabase/functions/ctwa-status/index.ts` que devolve `{ facebook, pixel, whatsapp_number, page_id }` consolidado (sem chamar Meta), e o hook usa só essa edge + `facebook-detect-waba`.

### 3. `supabase/functions/facebook-create-campaign/index.ts` (linha 377/385-387)
Trocar:
```ts
start_time: new Date(Date.now() + 60_000).toISOString(),
...
if (body.duration_days && body.duration_days > 0) {
  adsetParams.end_time = new Date(Date.now() + body.duration_days * 86400_000).toISOString();
}
```
Por:
```ts
const startAt = Date.now() + 60_000;
adsetParams.start_time = new Date(startAt).toISOString();
const days = Math.max(1, body.duration_days ?? 7);
// Buffer de 1 h pra garantir janela > 24 h e absorver clock skew do Meta.
adsetParams.end_time = new Date(startAt + days * 86400_000 + 3_600_000).toISOString();
```

### 4. Validação
- Republicar `facebook-detect-waba`, `facebook-create-campaign` e nova `ctwa-status`.
- Testar: abrir wizard → confirmar Pixel ✅ e WABA ✅; publicar campanha com 1 dia e checar logs sem `subcode=1487793`.

## Fora de escopo
- Reconectar o token quebrado do consultor (não é mais usado).
- Reescrever `facebook-preflight-check` (já usa `loadCampaignConnection`/plataforma).
- Ajustes visuais no wizard.
