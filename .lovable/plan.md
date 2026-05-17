# Plano: Corrigir ordem dos primeiros passos do fluxo

## Diagnóstico

Olhei o fluxo do consultor `0c2711ad-…` (lead +55 11 96407-9473). A ordem configurada no `/admin/fluxos` está assim:

| position | título | tipo | captura |
|---|---|---|---|
| 2 | **Nome do cliente** ("Qual seu nome…") | message | `name` |
| 3 | **Boas Vindas** (áudio `boas_vindas`) | message | — |
| 4 | Valor da conta | message | `electricity_bill_value` |
| 5–7 | Como funciona / explicação | message | — |
| 8 | Conta de energia | capture_conta | — |
| 9 | Cadastro | capture_documento | — |

O bot lê por `ORDER BY position ASC`. Então, quando o lead **não** tem nome confiável, ele envia primeiro "Qual seu nome?" (pos 2) e só depois "Boas Vindas" (pos 3) — ordem invertida do que faz sentido. Quando o lead **já** tem nome (caso atual: `name_source=user_confirmed`), o `resolveLandingStep` pula a pos 2 e cai direto na pos 3 (Boas Vindas) — aí parece "passo 2 vindo antes do 1".

Em resumo: **as posições estão trocadas no banco**. Boas Vindas deveria ser a pos 2 (sempre primeiro) e Nome a pos 3 (pulado se já tiver nome).

## O que fazer

### 1. Trocar posições no `bot_flow_steps` (migration)
- `Boas Vindas` (`6226f6f3-…`) → position **2**
- `Nome do cliente` (`passo_mp8yc0bp`) → position **3**

Demais posições (4..N) ficam como estão. O `resolveLandingStep` já cuida de pular o passo de nome quando o nome já está capturado (`name_source ∈ {ocr, user_confirmed, self_introduced, manual}`), então o comportamento desejado fica:
- Sem nome → Boas Vindas → pergunta Nome → Valor → …
- Com nome → Boas Vindas → (pula Nome) → Valor → …

### 2. (Defensivo, opcional) Em `conversational/index.ts`, no `resolveLandingStep`
Garantir que, ao escolher `firstActive`, se o primeiro passo ativo for um "ask de nome puro" sem mídia/texto de boas-vindas, ele continue a busca pelo próximo passo com `slot_key`/`message_text` antes de cair na pergunta. Isso protege contra futuras reordenações erradas no admin. Sem alterar nenhum comportamento já existente para outros campos.

## Arquivos

- `supabase/migrations/<timestamp>_reorder_boas_vindas_first.sql` — UPDATE das duas posições (com `WHERE flow_id=... AND step_key=...`).
- (opcional) `supabase/functions/whapi-webhook/handlers/conversational/index.ts` — pequeno reforço no `resolveLandingStep`.

## Validação

- Disparar mensagem de teste para o consultor `0c2711ad-…` com lead **novo** → primeira mensagem deve ser **Boas Vindas**, depois "Qual seu nome?".
- Repetir com lead que já tem `name_source=user_confirmed` → deve enviar **Boas Vindas** e pular direto pra "Valor da conta".
- Conferir nos `conversations` (outbound) a ordem temporal.

## Observações

Se você quer que esse reordenamento valha para **todos** os consultores (não só o `0c2711ad-…`), me confirma e eu generalizo a migration buscando todo flow ativo onde um passo com `captures.name` aparece antes de um passo com `slot_key='boas_vindas'`.
