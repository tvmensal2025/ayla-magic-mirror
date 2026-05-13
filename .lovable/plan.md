
## Problema real

Hoje a campanha é criada com:
```
destination_type: "WHATSAPP"
promoted_object: { page_id, whatsapp_phone_number }
optimization_goal: "CONVERSATIONS"
objective: "OUTCOME_ENGAGEMENT"
```

O Meta exige que o `whatsapp_phone_number` seja um número **verificado dentro de uma WABA (WhatsApp Business Account)** vinculada à mesma Página/Business Manager. Por isso o erro `subcode 1487246 — This WhatsApp phone number is not linked to your account`.

**Não é possível vincular automaticamente** um número novo à WABA via API. O Meta obriga:
- OTP por SMS/voz para o dono da linha
- Aprovação dentro do Embedded Signup (modal oficial do Facebook)

Ou seja, "consultor digita o número em Dados e tudo funciona sozinho" só é possível se mudarmos a arquitetura da campanha.

## Solução proposta: Click-to-WhatsApp via link `wa.me` (sem WABA)

Trocar o tipo de campanha de **CTWA-com-WABA** para **Tráfego com CTA WhatsApp via `wa.me`**. Esse formato:
- Aceita **qualquer número de WhatsApp** (pessoal ou business), sem WABA, sem vínculo, sem Embedded Signup
- É o formato usado por milhões de pequenos anunciantes
- Continua direcionando o lead direto pra conversa no WhatsApp do consultor
- Mantém tracking por UTM (já implementado no `waLink`)

### Alterações em `supabase/functions/facebook-create-campaign/index.ts`

1. **Campanha:**
   - `objective: "OUTCOME_TRAFFIC"` (em vez de `OUTCOME_ENGAGEMENT`)

2. **Adset:**
   - Remover `destination_type: "WHATSAPP"`
   - Remover `promoted_object` inteiro (não há mais WABA envolvida)
   - `optimization_goal: "LINK_CLICKS"` (Meta otimiza pra cliques no link `wa.me`)
   - Resto (targeting, lookalike, frequency cap, labels) fica igual

3. **Creative:** já está correto — usa `call_to_action.type: "WHATSAPP_MESSAGE"` com `link: waLink` (`https://wa.me/{numero}?text=...&utm_*`). Só confirmar que continua funcionando sem `promoted_object`.

4. **Validação local:** antes de criar a campanha, validar que `whatsapp_destination_number` tem 12 ou 13 dígitos e começa com `55`. Se não, devolver erro claro pedindo pra arrumar em Dados (já existe parcialmente — só reforçar).

5. **Remover bloco de tratamento do subcode 1487246** (não vai mais acontecer).

### Alterações em `src/components/admin/ads/ConnectFacebookCard.tsx`

- Remover o **fallback hardcoded `5511971254913`** das linhas 91 e 99. Deixar `setWaNumber(connection?.whatsapp_destination_number || "")`.
- Se não houver número salvo, mostrar campo vazio com placeholder e mensagem "Digite o WhatsApp que vai receber os leads (formato 55 + DDD + número)".
- Validação já existe (12-13 dígitos).

### Resultado

- Consultor digita `5511990092401` em Dados → salva em `consultant_ad_settings`
- Clica em "Publicar campanha" → tudo funciona, sem nenhum passo manual no Meta Business Manager
- Lead clica no anúncio → abre conversa no WhatsApp do consultor com mensagem inicial pré-preenchida
- UTMs caem na conversa pra o bot identificar origem

## Tradeoff (importante)

| | CTWA com WABA (hoje) | wa.me link (proposta) |
|---|---|---|
| Setup | Vincular número no Meta BM (manual) | Zero, qualquer número |
| Otimização Meta | "Conversas iniciadas" (mais preciso) | "Cliques no link" (menos preciso) |
| CPL típico | ~10-20% mais barato | Ligeiramente mais caro |
| Funciona com WhatsApp pessoal | ❌ Não | ✅ Sim |
| Funciona com WhatsApp Business app | ❌ Não (só WABA API) | ✅ Sim |

Para o seu caso (consultores usando WhatsApp pessoal/Business via Whapi), **wa.me é a única opção viável** — CTWA-com-WABA está fora porque exige API oficial do WhatsApp, que é outro produto pago à parte.

## Plano alternativo (futuro, opcional)

Se quiser otimização CTWA real um dia: implementar **Embedded Signup do WhatsApp** — botão "Conectar WhatsApp" em Dados que abre modal do Meta, consultor faz OTP e linka o número à WABA da plataforma. Requer aprovação do app como Tech Provider no Meta. Recomendo deixar pra depois.

## Arquivos afetados

- `supabase/functions/facebook-create-campaign/index.ts` — mudar objective, adset, remover promoted_object
- `src/components/admin/ads/ConnectFacebookCard.tsx` — remover fallback hardcoded
