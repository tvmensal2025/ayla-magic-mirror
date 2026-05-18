## Ajustes finos de copy + botão no fluxo WhatsApp

Apenas alterações em `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (strings + 1 chamada de envio). Sem mudança de lógica.

### 1. `ask_email` — aceitar qualquer provedor

Hoje a copy reforça Gmail e dá impressão de que só Gmail serve. Ajustar:

- **Linha 355** (`getReplyForStep` → `ask_email`):
  - Antes: `qual é o seu *e-mail*?`
  - Depois: `me passa seu *e-mail* (pode ser de qualquer provedor — Gmail, Outlook, iCloud, Yahoo, etc.) 📧`
- **Linha 3286** (fallback "não tenho"): remover a indicação exclusiva de Gmail; trocar por algo neutro tipo `pode criar um agora em qualquer serviço (Gmail, Outlook, iCloud...) — leva 1 minuto`.
- **Linhas 3291, 3295, 3306** (mensagens de erro): manter exemplo, mas adicionar texto deixando claro "qualquer provedor serve" e variar exemplo (`maria@outlook.com`, `joao@hotmail.com`).

Também atualizar o texto inicial em `conversational/index.ts:1263` (`📧 Qual seu *e-mail*?`) para a mesma copy nova.

### 2. Aviso de nome — só quando há divergência real entre conta e documento

Hoje a tela de confirmação pós-OCR do documento mostra os dados extraídos sem contexto. O aviso de "tem que ser titular da conta" **só deve aparecer quando há mismatch** entre nome da conta de luz e nome do documento (já existe `name_mismatch_flag`).

- **Linha 2791** (`mismatchWarn`): trocar a copy atual por uma versão mais bonita/clara, mantendo a condição `updates.name_mismatch_flag`:
  ```
  ⚠️ *Atenção: notei uma diferença de nome*

  📄 Conta de luz: *{bill_holder}*
  🪪 Documento:   *{doc_nome}*

  Para o cadastro funcionar, o documento precisa ser do *mesmo titular da conta de luz*. 


  ```
- **Não adicionar nenhum aviso quando os nomes batem** (já é o comportamento atual, manter).

### 3. Finalizar cadastro — usar botão de verdade, não "digite 1"

Existem dois pontos em que o texto pede para "digitar 1":

**3a. `FINAL_FALLBACK` (linha 2423)** — usado pelo `post-confirm-conta` quando o passo de finalização não tem dispatch:

- Hoje: `✅ *Todos os dados foram preenchidos!*\n\n1️⃣ Finalizar\n\n_Digite *1* ou *FINALIZAR* para concluir:_`
- Trocar `sendFallback(FINAL_FALLBACK, ...)` por um envio com botão, igual ao `ask_finalizar`:
  ```ts
  await sendOptions(remoteJid, "✅ *Tudo pronto!*\n\nSeus dados foram preenchidos. Vamos finalizar seu cadastro no portal iGreen?", [
    { id: "btn_finalizar", title: "✅ Finalizar cadastro" },
  ]);
  ```
  E gravar o outbound em `conversations` (manter o pattern do `sendFallback`). Definir o próximo step como `ask_finalizar` (não `finalizar_cadastro` direto) para que o clique no botão seja capturado pelo handler existente na linha 3443.

**3b. Fallback de erro em `ask_finalizar` (linha 3453)** — usado quando `sendOptions` falha:

- Hoje: `Digite *FINALIZAR* ou *1* para confirmar o cadastro:`
- Trocar para: `Toque no botão *✅ Finalizar* acima — ou responda *FINALIZAR* para concluir.` (remover o "1", deixar mais natural já que botão é a via primária).

### Arquivos afetados

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linhas 355, 2422-2446, 2791, 3286, 3291, 3295, 3306, 3453)
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (linha 1263)

### Deploy

Após a aprovação: deploy de `whapi-webhook`.