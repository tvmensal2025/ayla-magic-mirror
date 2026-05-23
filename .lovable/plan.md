# Fix: IA ligada mas fluxo não reinicia após inatividade

## Problema confirmado
Lead Rafael (`55d3c89f...`) parou no passo 4 (capture `electricity_bill_value`) às 04:46. Voltou 9h depois mandando "oi" e o bot ficou mudo — cada mensagem caía no `manual-capture-stop` ("texto salvo sem avanço") porque não era número. Não existe regra que detecte reentrada longa e reinicie o welcome.

## Mudanças

### 1. Regra de **re-welcome** em `whapi-webhook/handlers/bot-flow.ts`
Adicionar no início do pipeline, antes de qualquer lógica de capture/custom step:

```ts
// Re-welcome: lead voltou após inatividade longa
const lastOutboundAt = (customer as any).last_bot_reply_at || (customer as any).updated_at;
const hoursSinceBot = lastOutboundAt
  ? (Date.now() - new Date(lastOutboundAt).getTime()) / 3_600_000
  : 0;
const isGreeting = /^(oi+|olá+|ola+|opa+|bom dia|boa tarde|boa noite|eai|e aí|hey|hello|hi+)\W*$/i
  .test(String(inboundText || "").trim());

const shouldRewelcome =
  (hoursSinceBot >= 4 && isGreeting) || hoursSinceBot >= 24;

if (shouldRewelcome && customer.conversation_step) {
  console.log(`[re-welcome] inatividade=${hoursSinceBot.toFixed(1)}h step_anterior=${customer.conversation_step} greeting=${isGreeting}`);
  await supabase
    .from("customers")
    .update({
      conversation_step: null,
      capture_mode: null,
      custom_step_retries: 0,
      custom_step_retries_step: null,
      last_custom_prompt_at: null,
      ai_followups_count: 0,
      previous_conversation_step: customer.conversation_step,
    })
    .eq("id", customer.id);
  customer.conversation_step = null as any;
  // Cai no welcome do fluxo ativo normalmente
}
```

Aplicar mesma lógica em `evolution-webhook/handlers/bot-flow.ts`.

### 2. Fallback de retry após 3 capturas mudas
No bloco `manual-capture-stop` (whapi + evolution): incrementar `custom_step_retries` quando salvar texto sem avanço. Ao atingir 3 numa janela de 10 min, enviar:
> *"Não consegui entender, {{nome}} 😅 Pode me mandar só o valor médio da sua conta de luz? (ex: 250)"*
(usar `retry_text` do step se houver). Resetar contador ao avançar ou ao captar valor válido.

### 3. Limpar o lead Rafael (one-shot)
```sql
UPDATE customers
SET conversation_step = NULL,
    capture_mode = NULL,
    custom_step_retries = 0,
    last_custom_prompt_at = NULL,
    ai_followups_count = 0
WHERE id = '55d3c89f-2557-4864-988d-91ee48e643f8';
```

### 4. Memória nova
`mem://whatsapp/re-welcome-rule` — registra que reentrada ≥4h com saudação ou ≥24h reseta `conversation_step` e dispara welcome do fluxo ativo.

## Arquivos
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — itens 1 e 2
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts` — espelho
- Migração de dados — item 3
- `mem://whatsapp/re-welcome-rule` + atualizar `mem://index.md`

## Critério de sucesso
- Próximo "oi" do Rafael → bot manda welcome do fluxo A novamente.
- Lead parado em qualquer capture por ≥4h que mandar saudação → reinicia welcome.
- Lead que insiste com texto inválido em capture → recebe retry humanizado após 3 tentativas, nunca mudo.
- Leads com `bot_paused=true` ou `assigned_human_id` continuam silenciados (regra existente preservada).
