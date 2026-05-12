## Objetivo

Tornar a carteira de anúncios totalmente compreensível: cada linha de gasto explica o que aconteceu (qual campanha, distribuidora, impressões, cliques, leads do período) e o saldo nunca mente — se ficou negativo, mostra "Em débito" e pausa imediatamente as campanhas no Meta.

---

## 1. Movimentações com resumo do dia + drill-down

**UI (`src/components/admin/ads/WalletCard.tsx`)**

Substituir a lista atual de "Últimas movimentações" por um agrupamento por **data + campanha**:

```
▸ Hoje · CPFL Paulista                      − R$ 6,43
   318 impressões · 0 cliques · 0 leads · CPL —
   16 sincronizações nas últimas horas
```

Cada grupo é expansível (acordeão). Ao abrir, lista as sincronizações individuais que existem hoje (ex.: "20:00 · −R$ 0,31 · Meta R$ 0,26 + 20%"), agora com contexto do que foi pago **(impressões/cliques entre as duas sincronizações, calculado a partir do delta da metric daily quando disponível, ou apenas o horário+valor quando não tiver delta de período)**.

Topups e refunds aparecem como linhas próprias (sem agrupamento).

**Dados**: já temos `wallet_transactions.metadata.date`, `metadata.fb_campaign_id` e join com `facebook_campaigns` (nome, distribuidora) + `facebook_metrics_daily` (impressões/cliques/leads do dia). Tudo somado no cliente — nenhuma migração necessária.

**Service (`src/services/facebookAds.ts`)**

Adicionar `getWalletTransactionsEnriched(consultantId, days)` que:
- Busca últimas N transações de `wallet_transactions` (já existe).
- Busca campanhas referenciadas em batch (`in("id", ids)`) → nome + distribuidora.
- Busca `facebook_metrics_daily` para os pares (campaign_id, date) presentes → impressões/cliques/leads agregados do dia.
- Devolve estrutura agrupada `{ groups: [{date, campaign, totals, items}], topups: [...] }`.

---

## 2. Descrição mais humana ao gravar o débito

**`supabase/functions/facebook-sync-metrics/index.ts`** (linha ~114)

Trocar `_description` para algo legível:
```
"CPFL Paulista · 12/05 14:30 · 23 impressões, 1 clique, 0 leads"
```
Calculado a partir do delta entre a leitura anterior e a atual (já temos `prev` carregado para o cálculo de `deltaSpend`). E enriquecer `_metadata` com `delta_impressions`, `delta_clicks`, `delta_leads`, `campaign_name`, `distribuidora` para poder mostrar sem joins extras.

---

## 3. Saldo "Em débito" + auto-pause imediato

### Migração (estrutura)

Adicionar à `consultant_wallet`:
- `debt_cents bigint NOT NULL DEFAULT 0` — quanto a plataforma adiantou.

Atualizar `debit_consultant_wallet(...)` para:
- Se `balance_cents >= amount_cents`: comportamento atual.
- Se faltar saldo: zera `balance_cents`, soma a diferença em `debt_cents`, registra a transação normalmente (com `metadata.debt_added_cents`), retorna 0.

E nova função `settle_consultant_debt(_consultant_id, _amount_cents)` chamada por `credit_consultant_wallet` no início: abate primeiro o débito, só o que sobra vira saldo.

### Auto-pause real no Meta

No `facebook-sync-metrics`, **antes** de processar cada campanha, verificar saldo:
- Se `balance_cents <= 0` (com ou sem débito): chamar Graph API `POST /{campaign_id}?status=PAUSED&access_token=...` e atualizar `facebook_campaigns.status='paused'`. Hoje só faz isso quando hits regras adaptativas (frequência, CPL, etc.) — falta esse caso "saldo zerado".

### UI da carteira

No bloco de saldo:
- Se `debt_cents > 0`: linha vermelha **"Em débito: R$ X,XX — recarregue para regularizar e reativar campanhas"**.
- Se `balance_cents <= 0` E há campanha pausada por saldo: badge laranja **"Campanhas pausadas por saldo zerado"** + botão de recarga em destaque.

---

## Detalhes técnicos

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/<novo>.sql` | Adiciona `debt_cents` em `consultant_wallet`; recria `debit_consultant_wallet` (mantém assinaturas); adiciona `settle_consultant_debt`; ajusta `credit_consultant_wallet` para abater débito antes. |
| `supabase/functions/facebook-sync-metrics/index.ts` | (a) descrição/metadata humanizada com deltas; (b) checagem de saldo no início do loop por campanha → pausa no Meta + update DB; (c) invalida cache de wallet após debit. |
| `supabase/functions/_shared/fb-graph.ts` | (se necessário) helper `pauseFbCampaign(token, fbCampaignId)`. |
| `src/services/facebookAds.ts` | Novo `getWalletTransactionsEnriched`; tipo `WalletBalance` ganha `debt_cents`. |
| `src/components/admin/ads/WalletCard.tsx` | UI de débito + lista agrupada com acordeão (usa `<details>` ou `Collapsible` do shadcn). |
| `src/integrations/supabase/types.ts` | Regenera após migração (automático). |

Sem mudanças de RLS — `consultant_wallet` e `wallet_transactions` já estão protegidos por owner/admin.

Nada quebra para quem já tinha transações antigas: a descrição nova vale só para futuras sincronizações; as antigas continuam como estão na lista do drill-down.