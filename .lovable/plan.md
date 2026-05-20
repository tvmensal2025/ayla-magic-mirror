## Diagnóstico

**1. Por que foi para Campinas em vez de Uberlândia**

As 2 campanhas mais recentes do `rafael.ids@icloud.com` foram salvas no DB com **apenas** `[{key: 247071, name: "Campinas"}]` e o nome segue o padrão do **smartPublish** (`"…CPFL Paulista (Campinas)…"`), não do wizard.

O fluxo `smartPublish` (`src/services/smartPublish.ts`) detecta a região pelo DDD do WhatsApp do consultor, escolhe um preset de distribuidora compatível e pega a **1ª cidade do preset** (Campinas no CPFL Paulista). Ele ignora qualquer seleção manual de cidade — o botão "Publicar inteligente" do card de template dispara isso.

Ou seja: o usuário clicou em **"Publicar com 1 clique"** num template (que vai pro smartPublish), e não no wizard "Nova campanha" onde ele realmente escolheu Uberlândia. Como o DDD do telefone dele é SP, caiu no CPFL Paulista → Campinas.

**2. Raio de 25km**

`supabase/functions/facebook-create-campaign/index.ts` linha 316 envia hardcoded:
```ts
cities: body.cities.map((c) => ({ key: c.key, radius: 25, distance_unit: "kilometer" }))
```
Meta interpreta `radius=25km` como "cidade + entorno". Para anunciar **só na cidade**, basta omitir `radius`/`distance_unit` (default = município).

**3. Excluir campanha**

Não existe edge function de delete. Precisa:
- Edge `facebook-delete-campaign` que valida SuperAdmin, chama `DELETE /{fb_campaign_id}` no Graph, marca `status=deleted` em `facebook_campaigns` (ou faz `DELETE` físico) e loga em `admin_audit_log`.
- Botão na `CampaignsList` visível só para SuperAdmin.

## Plano

### 1. `supabase/functions/facebook-create-campaign/index.ts`
- Linha 316: trocar para `cities: body.cities.map((c) => ({ key: c.key }))` — sem `radius`, sem `distance_unit`.
- Ajustar comentário das linhas 309-315 explicando que agora é só município.

### 2. `src/services/smartPublish.ts` (corrigir desvio Uberlândia→Campinas)
- Em vez de derivar a cidade só pelo DDD, **preferir a cidade conectada ao perfil do consultor** quando houver (`consultants.city` / `consultant_ad_settings.city`, se existir). Se não houver, manter fallback atual por DDD.
- Adicionar log claro no `onProgress` mostrando qual cidade foi escolhida (ex.: "Publicando em Uberlândia (CEMIG)…") para o consultor perceber antes do `done`.

Observação: alternativa mais radical seria abrir um confirm/seletor de cidade antes de publicar no smartPublish. Posso fazer isso se preferir.

### 3. Nova edge `supabase/functions/facebook-delete-campaign/index.ts`
- Valida JWT, checa `is_super_admin(user_id)`.
- Recebe `{ campaign_id }`, carrega row de `facebook_campaigns`.
- Chama `DELETE https://graph.facebook.com/v21.0/{fb_campaign_id}?access_token=…` (token vem de `platform_facebook_account`).
- Em caso de sucesso (ou se `fb_campaign_id` já era nulo), faz `DELETE FROM facebook_campaigns WHERE id = …`.
- Loga em `admin_audit_log` (`action='facebook_campaign_deleted'`).

### 4. `src/components/admin/ads/CampaignsList.tsx`
- Receber/usar `isSuperAdmin` (via `useUserRole` ou prop).
- Adicionar botão `Trash2` no cabeçalho de cada card, **só visível quando `isSuperAdmin`**.
- Confirm dialog antes de excluir (`AlertDialog`).
- Após sucesso, remover item da lista local e mostrar toast.

### 5. Onde renderiza `CampaignsList`
- Passar `isSuperAdmin` derivado do hook `useUserRole` (ou consultar lá dentro com `useAdminAuth`).

## Fora de escopo
- Reescrever o wizard.
- Mexer em saldo/carteira.
- Alterar lógica de detecção de distribuidora por DDD (apenas adicionar fallback por cidade configurada).

## Pergunta
Confirma que (a) o "Publicar 1 clique" deve **respeitar a cidade configurada no perfil do consultor** quando houver, e (b) o delete é permanente (apaga row do DB) e não soft-delete?
