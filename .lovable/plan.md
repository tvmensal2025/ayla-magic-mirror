## Bug: bot re-envia áudio de boas-vindas após o cadastro estar finalizado

### Causa raiz (confirmada no código)

Em `supabase/functions/whapi-webhook/index.ts:253-298`:

```ts
const statusFinalizados = [
  "data_complete", "portal_submitting", "awaiting_otp", "validating_otp",
  "awaiting_manual_submit", "portal_submitted", "registered_igreen",
  "awaiting_signature", "complete",
];

// Busca customer EXCLUINDO esses status
let { data: activeRecords } = await supabase
  .from("customers")
  .select("*")
  .eq("phone_whatsapp", phone)
  .eq("consultant_id", superAdminConsultantId)
  .not("status", "in", `(${statusFinalizados.join(",")})`)
  ...
let customer = activeRecords?.[0] || null;
...
if (!customer) {
  // 🚨 cria customer NOVO com conversation_step: "welcome"
}
```

Quando o `worker-callback` marca `status=registered_igreen` (ou `awaiting_signature`, `awaiting_otp`, etc.) e o lead manda qualquer mensagem depois:

1. A query exclui o customer (status está na lista de "finalizados").
2. `customer = null` → cai no `if (!customer)` e **cria um customer NOVO** com `conversation_step: "welcome"`.
3. O welcome dispara o áudio inicial → exatamente o bug que a Fran viu.

Isso afeta TODOS os leads em qualquer estado pós-portal: `awaiting_otp`, `awaiting_signature`, `registered_igreen`, `portal_submitting`, `complete`, etc.

### Correção

#### 1. `whapi-webhook/index.ts` — nunca recriar customer com status pós-cadastro

Trocar a lógica de busca + criação:

- **Buscar sempre o customer mais recente desse telefone** (sem filtrar por status). Se existir, usa ele.
- Só criar customer novo se realmente não existir nenhum registro para o telefone.
- Se o customer encontrado estiver em estado pós-finalização (`awaiting_otp`, `validating_otp`, `awaiting_signature`, `awaiting_facial`, `portal_submitting`, `portal_submitted`, `registered_igreen`, `complete`, `data_complete`, ou step `complete`/`cadastro_em_analise`/`aguardando_otp`/`aguardando_assinatura`/`aguardando_facial`), **mantém o step atual** — não reseta para `welcome`. O bot-flow já tem handlers polidos para cada um deles (linhas 3467, 3472, 3510, 3528, 3536) que apenas respondem com status/aviso sem disparar mídia.
- Manter o caso `automation_failed` (já existe — esse pode resetar para `welcome` porque é falha técnica que precisa recomeçar).
- Manter `RESUMABLE_STATUSES` (`abandoned`, `stuck_finalizar`, `stuck_contact`, `email_pendente_revisao`) — esses são leads travados que devem retomar.

Resultado: lead pós-portal manda mensagem → cai no handler de `aguardando_otp`/`aguardando_assinatura`/`cadastro_em_analise`/`complete`, que responde com texto educado e sem mídia.

#### 2. `worker-callback/index.ts:148-159` — alinhar com o handler existente

Hoje, em `registration_complete`, o worker:
- Seta `status = "registered_igreen"`, `conversation_step = "complete"`.
- Envia direto via WhatsApp uma mensagem "🎉 Parabéns..."

Trocar `conversation_step` por `cadastro_em_analise` (que tem handler educado no bot-flow para mensagens subsequentes) — mantém a mensagem de parabéns enviada uma única vez no callback.

#### 3. Remover "Obrigado pela confiança! ☀️🌱"

Em `bot-flow.ts:3739`, apagar a última linha do bloco `await sendText(remoteJid, ...)`:

```ts
await sendText(remoteJid,
  "✅ *Todos os dados coletados com sucesso!* 🎉\n\n" +
  "⏳ Estamos processando seu cadastro no portal...\n\n" +
  "📱 Em breve você receberá um *código de verificação no WhatsApp*. Quando receber, *digite aqui*!"
);
```

(Apenas remoção da linha — sem mexer em mais nada.)

### Verificação

Após o deploy, simular o caso: setar manualmente um customer de teste com `status=registered_igreen` e `conversation_step=complete`/`cadastro_em_analise`, mandar mensagem pelo WhatsApp e confirmar nos logs do `whapi-webhook` que:
- Nenhum customer novo é inserido.
- A resposta vem do handler `cadastro_em_analise` (texto educado, sem áudio).

### Arquivos afetados

- `supabase/functions/whapi-webhook/index.ts` (linhas 253-328 — refator da lógica find-or-create)
- `supabase/functions/worker-callback/index.ts` (linha 150 — trocar step para `cadastro_em_analise`)
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linha 3739 — remover "Obrigado pela confiança")

Deploy: `whapi-webhook` e `worker-callback`.
