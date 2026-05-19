## Resposta rápida

**Sim, tudo vai dar certo** — desde que o Pixel `1521037349653769` (igreen-app-oficial) esteja **vinculado** à conta de anúncios `act_317035519061535` (Rafael Ferreira). Isso é configurado uma vez no Business Manager (`Fontes de dados → Pixel → Atribuir ativos → Conta de anúncios`). Se ainda não tiver vinculado, os eventos CAPI vão chegar mas **não** vão aparecer nas métricas de campanha.

## Plano de sincronização (4 edge functions já existentes, vou orquestrar todas)

```text
1. facebook-list-assets        → confirma que o Pixel 1521037349653769 aparece na lista da conta
                                  (se não aparecer, vinculação no BM é necessária — te aviso)

2. facebook-platform-balance   → atualiza saldo da ad account em platform_facebook_account
                                  (gasto total, saldo, moeda)

3. facebook-sync-metrics       → puxa últimos 7 dias de impressões / cliques / leads / spend
                                  por campanha de TODOS os consultores

4. facebook-sync-audiences     → faz upload dos customers (emails+telefones hasheados)
                                  pra Custom Audience compartilhada + cria/atualiza Lookalike 1%
                                  (Meta leva ~6h pra ficar pronta)
```

Cada step roda em sequência, capturo erros individualmente, e ao final mostro um **relatório**:

| Step | Status | Resultado |
|---|---|---|
| Lista de assets | ✅/❌ | Pixel encontrado? |
| Saldo | ✅/❌ | R$ X gastos, R$ Y saldo |
| Métricas | ✅/❌ | N campanhas atualizadas |
| Audiências | ✅/❌ | N clientes enviados, Lookalike status |

## Detalhes técnicos

- Todas as funções já existem e já usam `platform_facebook_account` (token OAuth do Rafael).
- Vou criar **uma nova edge function `facebook-platform-sync-all`** que apenas chama as 4 acima em sequência usando `supabase.functions.invoke` interno (com `SUPABASE_SERVICE_ROLE_KEY`) e retorna o relatório agregado.
- Adiciono um botão **"Sincronizar tudo"** no card do super admin (`PlatformFacebookCard.tsx`) que dispara a função e mostra o relatório em toast/modal.
- **Não toco nas funções existentes** — só orquestro.

## O que NÃO posso resolver via código (você precisa checar no BM)

Vinculação `Pixel 1521037349653769 ↔ Ad Account act_317035519061535`:
- Abra https://business.facebook.com/settings/pixels/1521037349653769
- Em "Contas de anúncios atribuídas", confirme que `act_317035519061535` está lá
- Se não estiver, clique **Adicionar ativos → Conta de anúncios** e adicione

Sem isso, eventos CAPI chegam (você vê em Test Events) mas não atribuem conversão. Vou te avisar no relatório se isso for o caso.

**Posso seguir?**
