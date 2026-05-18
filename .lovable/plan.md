## Diagnóstico

Olhei os logs do webhook e fiz uma query nos últimos 14 dias de leads:

- **7 leads novos hoje** (18/05) entraram com a frase: `"Olá! Tenho interesse e queria mais informações, por favor."`
- **Todos com `lead_source = NULL`** → nenhum foi marcado como `meta_ads`.

Essa frase é o **texto pré-preenchido padrão do Click-to-WhatsApp (CTWA) do Meta Ads em PT-BR**. Ou seja, esses leads vieram do anúncio, mas o regex atual no `whapi-webhook/index.ts` (linha 485) não detecta esse padrão — ele só procura palavras como "anúncio", "facebook", "instagram", "patrocinado", "reels", "stories". A frase padrão do CTWA não bate em nada disso.

## Solução

Duas camadas de detecção, em ordem de confiabilidade:

### 1. Detectar via `referral` / `context` do Whapi (mais confiável)
O Whapi entrega no payload da mensagem CTWA um objeto `referral` (ou `context.referred_product`) contendo `source_url`, `source_id`, `ctwa_clid`, `headline`, `body`. Quando esse campo existe, é prova de que veio de anúncio Meta — marca `lead_source = "meta_ads"` independente do texto.

Precisamos:
- Inspecionar 1-2 payloads reais do Whapi (logs) para confirmar o nome exato do campo (`referral` vs `context.referred_product`).
- Logar o payload bruto se nenhum campo for encontrado, para iterar.

### 2. Ampliar o regex de texto (fallback)
Adicionar ao regex existente os padrões pré-preenchidos do CTWA:
- `tenho interesse.*mais informa[çc][õo]es`
- `gostaria de saber mais sobre`
- `quero saber mais`
- `vi seu an[uú]ncio`

Isso pega os 7 leads de hoje (e os históricos com a mesma frase).

### 3. Backfill dos leads históricos
Rodar uma migration única que marca `lead_source = 'meta_ads'` para todos `customers` onde:
- `lead_source IS NULL`
- A primeira mensagem inbound bate com a frase padrão do CTWA

Isso reidrata o dashboard de Performance com os ~7 leads de hoje e qualquer outro histórico antes de a correção entrar.

## Mudanças

**`supabase/functions/whapi-webhook/index.ts`** (linha ~480-497)
- Antes do regex de texto, checar `msg.referral` / `msg.context?.referred_product` no payload Whapi. Se existir → `lead_source = "meta_ads"` + log do `source_id`/`ctwa_clid`.
- Ampliar regex com os padrões CTWA pré-preenchidos.
- Manter o `.is("lead_source", null)` para não sobrescrever.

**Migration**
```sql
UPDATE customers SET lead_source = 'meta_ads'
WHERE lead_source IS NULL
  AND id IN (
    SELECT DISTINCT customer_id FROM conversations
    WHERE message_direction = 'inbound'
      AND message_text ~* 'tenho interesse.*mais informa[çc][õo]es|gostaria de saber mais|vi seu an[uú]ncio|do an[uú]ncio'
  );
```

## Resultado esperado

- Leads CTWA passam a ser marcados automaticamente no primeiro inbound.
- Dashboard de Performance volta a mostrar números reais (leads, aprovados, CPL, CPA) só de Meta Ads.
- Histórico recente recuperado pelo backfill.