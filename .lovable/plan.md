## Situação atual (já verifiquei no banco)

A tabela `platform_facebook_account` **já tem tudo configurado** com o token OAuth do Rafael (ainda válido até 17/jul/2026):

| Campo | Valor atual |
|---|---|
| `ad_account_id` | `act_317035519061535` (Rafael Ferreira, BRL) |
| `access_token_encrypted` | ✅ Token OAuth válido (lê custo/saldo/campanhas) |
| `pixel_id` | `708759256921383` ❌ **PRECISA TROCAR** |
| `pixel_name` | `Pixel de Rafael Ferreira` ❌ **PRECISA TROCAR** |

**Não precisamos** criar System User nem descobrir Ad Account ID — já existe e funciona.

## O que vou ajustar

### 1. Migration (UPDATE direto)
Trocar o pixel da plataforma para o que você quer que todos usem:
```sql
UPDATE platform_facebook_account
SET pixel_id = '1521037349653769',
    pixel_name = 'igreen-app-oficial',
    updated_at = now()
WHERE id = true;
```
Isso faz **todos os consultores** passarem a usar o Pixel `igreen-app-oficial` automaticamente em:
- CAPI server-side (Lead, Contact, Purchase)
- Pixel no navegador (PageView, ViewContent)
- Métricas de campanhas
- Saldo da conta

### 2. Edge function `facebook-capi`
Já refatorada antes — usa `FACEBOOK_CAPI_PIXEL_ID` + `FACEBOOK_CAPI_ACCESS_TOKEN` (globais) como fallback. Vou ajustar para **priorizar** o token global (não o OAuth do consultor), já que o modelo agora é centralizado.

### 3. Edge function `facebook-ensure-pixel`
Tem um bug menor (`UPDATE ... WHERE id = true` está ok pois `id` é boolean singleton, mas a checagem de admin bloqueia quem não é o Rafael). Como vamos setar o pixel direto via migration, **não precisamos chamar essa função** — fica intacta para uso futuro.

### 4. Frontend (`PixelInjector.tsx` + LP)
Hoje injeta o `facebook_pixel_id` do consultor (que pode estar vazio). Vou criar um hook `usePlatformPixel()` que lê o `pixel_id` global de `platform_facebook_account` e injeta esse em **todas as landing pages**, ignorando o do consultor.

### 5. Card admin "Conectar Facebook" (`ConnectFacebookCard.tsx`)
Vou esconder/desabilitar para consultores comuns — só super admin vê. Para consultores comuns, mostrar badge "✅ Pixel da plataforma ativo" sem botão de ação.

## Resultado final

| Recurso | Status após mudanças |
|---|---|
| Pixel `1521037349653769` carregado em TODAS LPs | ✅ Automático |
| CAPI envia Leads para esse Pixel | ✅ Via secret global |
| Métricas de gasto/saldo no admin | ✅ Via OAuth do Rafael (já cadastrado) |
| Consultores precisam fazer algo | ❌ Não — tudo plug-and-play |

## Detalhes técnicos

- A migration usa `INSERT tool` (é UPDATE de dado, não schema).
- Vou rodar a migration, depois deployar `facebook-capi` ajustada e editar 3 arquivos frontend (`PixelInjector.tsx`, hook novo `usePlatformPixel.ts`, `ConnectFacebookCard.tsx`).
- Nenhuma quebra para consultores existentes — eles continuam vendo dashboards normalmente, só o pixel renderizado muda.

**Posso seguir?**
