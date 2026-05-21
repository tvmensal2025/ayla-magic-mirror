
# Plano: deixar o "Captura conta → … → Finalizar" 100% conectado

Objetivo: clicar em **qualquer passo de captura** no painel `/admin` (Captura conta, Captura documento, Captura email, Finalizar cadastro) e o fluxo seguir sozinho até o portal iGreen. As únicas interações manuais permitidas são:
- Consultor: **SIM / EDITAR / NÃO** no card de confirmação de dados extraídos.
- Cliente: digitar valores (email, CPF, CEP, etc.) ou enviar foto/PDF/documento.

Tudo o que estiver entre essas interações deve ser automático.

---

## 1. Diagnóstico do bug que vi no print do Lucas

- Cliente mandou o PDF da conta **antes** de o consultor clicar em qualquer passo. Na época, o gate `globalAiDisabled` antigo só salvava `[arquivo]` em `conversations` e não rodava OCR. Resultado: `customers.electricity_bill_photo_url`, `bill_message_id`, `bill_holder_name`, `distribuidora`, `cep`, etc. ficaram **vazios** — por isso a Ficha aparece praticamente em branco e o card "Dados lidos da CONTA" não renderiza (ele exige pelo menos 1 campo preenchido via `hasAny`).
- Mesmo após o deploy de ontem (que liga silentMode + runBotFlow para arquivos), o PDF antigo se perdeu porque a URL/base64 não foi armazenada na época.
- Hoje, se o consultor clicar em "Captura conta", `manual-step-send` apenas manda o prompt "me manda foto/PDF" e seta `aguardando_conta`. **Não reaproveita** o PDF que o cliente já tinha enviado.

---

## 2. Mudanças necessárias

### 2.1 Garantir que TODO arquivo inbound seja persistido

Arquivo: `supabase/functions/whapi-webhook/index.ts`

Logo após `let fileUrl / fileBase64` serem resolvidos (~ linha 670), e **antes** de qualquer return precoce (gate de IA manual, bot pausado, etc.), persistir em `customers`:

```ts
if (isFile && fileUrl) {
  await supabase.from("customers").update({
    last_inbound_media_url: fileUrl,
    last_inbound_media_mime: imageMessage?.mimetype || documentMessage?.mimetype,
    last_inbound_media_kind: hasDocument ? "document" : hasImage ? "image" : "other",
    last_inbound_media_message_id: messageId || null,
    last_inbound_media_at: new Date().toISOString(),
  }).eq("id", customer.id);
}
```

Migração:
```sql
alter table public.customers
  add column if not exists last_inbound_media_url text,
  add column if not exists last_inbound_media_mime text,
  add column if not exists last_inbound_media_kind text,
  add column if not exists last_inbound_media_message_id text,
  add column if not exists last_inbound_media_at timestamptz;
```

Isso garante que, mesmo com IA manual, qualquer foto/PDF pode ser reaproveitado depois.

---

### 2.2 `manual-step-send` reaproveita arquivo já recebido

Arquivo: `supabase/functions/manual-step-send/index.ts`

No bloco que detecta passos `capture_conta` e `capture_documento` (antes de mandar prompt), checar se já existe arquivo:

```ts
if (stepType === "capture_conta") {
  const billUrl = (customer as any).electricity_bill_photo_url || (customer as any).last_inbound_media_url;
  const hasFile = !!billUrl;
  if (hasFile) {
    // Dispara reprocess via edge function dedicada (ver 2.3).
    await supabase.functions.invoke("reprocess-capture", {
      body: { customerId: customer.id, kind: "bill" },
    });
    // Pula prompt — o card SIM/EDITAR/NÃO vai aparecer na ficha do consultor.
    return json({ ok: true, reused_existing_file: true, kind: "bill" });
  }
}
```

Mesmo padrão para `capture_documento` com `document_front_url` / `last_inbound_media_url`.

Quando NÃO houver arquivo: mantém o comportamento atual (manda prompt pedindo o arquivo).

---

### 2.3 Nova edge function `reprocess-capture`

Arquivo novo: `supabase/functions/reprocess-capture/index.ts`

Função única: dado `customer_id` + `kind` ("bill" | "doc_front" | "doc_back"), baixa a URL salva, monta `fileBase64`, força `conversation_step` no valor certo (`aguardando_conta`, `ask_doc_frente_manual`, `ask_doc_verso_manual`), e chama internamente `runBotFlow` com `silentMode=true` no sender (sem outbound — quem dispara mensagem ao cliente é o card "Pedir ao cliente" ou a confirmação do consultor).

Resultado: OCR roda, campos do `customer` são preenchidos (`bill_holder_name`, `distribuidora`, `cep`, `address_*`, `electricity_bill_value`, `ocr_confianca` etc.), `CaptureDataConfirmCard` aparece com SIM/EDITAR/NÃO no painel.

---

### 2.4 SIM do consultor avança automaticamente o fluxo

Arquivo: `src/components/captacao/CaptureDataConfirmCard.tsx`

Hoje `confirmSelf()` só seta `bill_data_confirmed_at`. Adicionar, logo depois do update, uma chamada para avançar o fluxo:

```ts
await supabase.functions.invoke("manual-step-send", {
  body: {
    consultantId: customer.consultant_id,
    customerId: customer.id,
    stepKey: kind === "bill" ? "capture_email" : "finalizar_cadastro",
    part: "all",
    continueFlow: true,
    skipNameGuard: true,
  },
});
```

Para `kind="doc"` (documento confirmado) → próximo passo é `finalizar_cadastro`.
Para `kind="bill"` → próximo passo configurável (padrão `capture_email`, depois `capture_documento`).

A chave do próximo passo deve vir da config do fluxo (lookup em `bot_flow_steps` pela `position` posterior ao step de captura atual) — não hard-coded. Adicionar helper que faz esse lookup no servidor (`manual-step-send` já tem `buildContinuationPatch` com lógica parecida — reutilizar).

Versão pragmática: o frontend chama `manual-step-send` com `continueFlow=true` e sem `stepKey`, e o backend descobre o passo atual do customer e avança para o próximo de captura/finalização.

---

### 2.5 `manual-step-send` quando `step_type = finalizar_cadastro`

Arquivo: `supabase/functions/manual-step-send/index.ts` (e/ou novo helper).

Hoje só manda um prompt "Tô finalizando…". Precisa, em vez disso, executar o pipeline real:
1. Setar `customer.conversation_step = "finalizando"`.
2. Invocar internamente `runBotFlow` (ou função extraída do bloco `finalizando` em `bot-flow.ts`) que:
   - Valida via `validateCustomerForPortal`.
   - Se faltar campo → redireciona pro passo certo e dispara prompt pro cliente.
   - Se tudo OK → marca `status=portal_submitting`, envia "✅ Todos os dados coletados…" ao cliente, dispara `POST {portal_worker_url}/submit-lead` com retries.
3. Cliente recebe o OTP no WhatsApp e segue o ciclo `aguardando_otp → validando_otp → cadastro_completo`.

Isso já existe em `bot-flow.ts` linhas 4080-4290. Extrair para `_shared/finalizing.ts` para que `manual-step-send` chame sem duplicar.

---

### 2.6 Cobertura de cliente que confere via WhatsApp (botão "Pedir ao cliente")

Já existe (`bill_data_confirmation_by='awaiting_client'` + handler "SIM/OK" em `whapi-webhook/index.ts` ~ linha 520). Manter como está — está alinhado com a regra "cliente pode confirmar".

Adicionar só: quando esse confirmation por cliente acontece, **também** disparar o avanço do fluxo (2.4) — atualmente só agradece e fica parado.

---

## 3. Resumo das mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| migração SQL | Adiciona 5 colunas `last_inbound_media_*` em `customers` |
| `whapi-webhook/index.ts` | Persiste mídia inbound em `customers.last_inbound_media_*` antes de qualquer return precoce |
| `whapi-webhook/index.ts` (handler `capture-confirm` ~ linha 530) | Após `bill_data_confirmed_at` setado pelo cliente, dispara `manual-step-send` continuFlow |
| `manual-step-send/index.ts` | Para `capture_conta`/`capture_documento`: se já há arquivo, chama `reprocess-capture` e pula prompt. Para `finalizar_cadastro`: invoca pipeline `finalizando` extraído. |
| `reprocess-capture/index.ts` (novo) | Baixa URL salva, base64, força step legacy, chama `runBotFlow` em silentMode |
| `_shared/finalizing.ts` (novo, opcional) | Extrai o bloco `finalizando` de `bot-flow.ts` para ser chamado também pelo `manual-step-send` |
| `CaptureDataConfirmCard.tsx` | Após `confirmSelf`, dispara `manual-step-send` `continueFlow=true` para próximo passo do fluxo |

---

## 4. Critério de aceite (replicar o caso Lucas)

1. Cliente novo manda PDF da conta com IA manual ligada. → `electricity_bill_photo_url` e `last_inbound_media_*` salvos.
2. Consultor abre Lucas em `/admin`, clica em "Captura conta". → backend reprocessa o PDF, Ficha preenche (titular, distribuidora, CEP, valor, etc.) sem mandar nova mensagem ao cliente.
3. Card "Dados lidos da CONTA" aparece com SIM/EDITAR/NÃO. Consultor clica "Eu confirmo". → `manual-step-send` avança para `capture_email` e o bot pergunta "Qual seu melhor e-mail?" no WhatsApp do cliente.
4. Cliente responde email. → bot avança para `capture_documento` e pede RG/CNH.
5. Cliente manda foto do documento. → OCR roda, card "Dados lidos do DOCUMENTO" aparece com SIM/EDITAR/NÃO.
6. Consultor confirma documento. → `manual-step-send` invoca pipeline `finalizando`, valida tudo, manda "✅ Todos os dados coletados…" ao cliente e dispara `POST /submit-lead` no portal worker.
7. Cliente recebe OTP, digita, fluxo completa (`validando_otp → cadastro_completo`).

Em **nenhum momento** o consultor precisa digitar texto livre ou mandar mídia manualmente — só clica em SIM/EDITAR/NÃO ou aciona algum passo do menu. O cliente só envia o que for solicitado pelo bot.

---

## 5. Notas

- Para evitar loop, `manual-step-send` `continueFlow` precisa detectar se o próximo passo é o MESMO passo atual e abortar (já tem debounce `last_custom_prompt_at` de 20s).
- `silentMode` no `whapi-webhook` continua valendo para mídia inbound recebida fora de passo ativo — preserva o comportamento "OCR roda mas sem outbound".
- Botão "Pedir ao cliente" do card permanece como alternativa para deixar o cliente confirmar pelo WhatsApp em vez do consultor.
