## Diagnóstico expandido — agora 7 problemas

Os 5 anteriores (20%, nome sobrescrito, menus de edição, QA semântico vazando, ordem texto→áudio→vídeo) **+ 2 novos** descobertos analisando como o bot lida com pergunta/mudança de assunto:

### 6. (NOVO) Pergunta durante edição/coleta = "❌ Inválido"
Hoje, em `bot-flow.ts:822`, a IA de vendas (`ai-sales-agent`) só é acionada quando o step está em `conversationalSteps` (welcome, menu_inicial, pos_video, checkin_pos_video, qualificacao, duvidas_pos_club, aguardando_humano) ou em `collectionSteps` **muito limitado** (`aguardando_conta`, `coleta_doc`, `ask_email`, `ask_cep`).

Resultado: se o cliente está em `editing_conta_valor`, `ask_cpf`, `ask_rg`, `ask_phone`, `confirmando_dados_conta`, etc., e digita **"quanto vou economizar?"** ou **"isso é seguro?"** ou **"quanto tempo demora?"**, o switch trata como entrada inválida e responde "❌ CPF inválido" / "❌ Valor inválido". Isso é grosseiro e quebra confiança — exatamente o oposto de "vendedor humano".

### 7. (NOVO) Mudança de assunto não tem rota de volta
Quando a IA é chamada e responde uma dúvida off-topic, **nada lembra o lead do que estava sendo perguntado**. Se ele estava em `ask_cpf`, depois de responder a dúvida o bot fica calado esperando o CPF que nunca vem (e o `bot-stuck-recovery` só age 5–15 min depois).

---

## Plano final (revisado, 7 itens)

Tudo em **`supabase/functions/whapi-webhook/handlers/bot-flow.ts`**.

### A. "até 20%" (não promessa fixa)
- `~1352`: `💚 Economia estimada: *até* R$ {mensal}/mês • *até* R$ {anual}/ano (até 20%)`
- `~1375`: trocar "20% de desconto fixo" → "desconto de *até* 20%", prefixar valores com "até".

### B. `safeAssignName()` blinda nome contra OCR de doc
Helper com 5 checks (≥5 chars, ≥2 palavras, sem dígitos, sem termos de cabeçalho RG, similaridade Levenshtein ≥0.7 com o nome atual). Se `name_source === 'user_confirmed'` e nome ≥3 chars: nunca sobrescreve. Aplicar nas 3 chamadas (linhas 1599, 1696, 1774). Marcar `name_source='user_confirmed'` em `editing_conta_nome`, `editing_doc_nome`, `ask_name`, e nos ramos SIM de `confirmando_dados_conta`/`confirmando_dados_doc`.

### C. Anti-alucinação no OCR da conta (~1326)
Reusar `safeAssignName` para validar `d.nome` — se inválido força `editing_conta_nome`. Validar `numero_instalacao` (≥7 dígitos) e `cep` (8 dígitos) — se inválidos abrir as edições correspondentes.

### D. Menus de edição completos + Cancelar + palavras-chave
**`editing_conta_menu`**: opções 1-6 + `0️⃣ Cancelar`. Aceitar `"0"|"cancelar"|"voltar"` → volta a `confirmando_dados_conta` reenviando a tela completa. Aceitar palavras-chave (`nome|valor|rua|endereço|instalação|cep|distribuidora`).

**`editing_doc_menu`**: 1-4 + `0️⃣ Cancelar`. Idem com palavras-chave (`nome|cpf|rg|nascimento|data`).

Após salvar em qualquer `editing_*`, **reenviar a tela de confirmação completa** (helper `buildConfirmacaoConta(merged)` / `buildConfirmacaoDoc(merged)`).

### E. Bypassar QA semântico em passos de cadastro/edição
No início de `runFlowQAIntercept` (e antes de `trySendConfiguredQa()`), retornar `null` se `step ∈ NO_QA_STEPS` (todos `editing_*`, `ask_*`, `confirmando_*`, `aguardando_*`, `processando_*`, `finalizando`, `portal_*`, `validando_*`, `complete`).

### F. Ordem texto → áudio → vídeo no QA
Refatorar `bot-flow.ts:380-440`: tratar texto como item ordenável (`items = [...media, {kind:'text'}]`), ordenar pela sequência configurada (default `["text","audio","image","video"]`), enviar em ordem com `sleepForMedia` entre mídias. Remover `sendText` final isolado.

### G. (NOVO) Pergunta/mudança de assunto durante coleta
Antes de cair no switch determinístico, em qualquer step `ask_*`, `editing_*`, `confirmando_*`, **detectar se a mensagem é pergunta off-topic** (`looksLikeQuestion` regex já existe + heurística "não parece com a entrada esperada"). Se sim:

```ts
const ASK_OR_EDIT_STEPS = /^(ask_|editing_|confirmando_|aguardando_(conta|doc))/;
if (ASK_OR_EDIT_STEPS.test(step) && messageText && !isButton && !isFile) {
  const looksLikeAnswer = isExpectedShape(step, messageText);  // CPF tem 11 dígitos, valor é número, etc.
  if (!looksLikeAnswer && (looksLikeQuestion || messageText.length > 25)) {
    // Responde a dúvida via SalesAI (ou QA configurada se houver)
    const aiAnswer = await callSalesAi(customer, messageText, /*keepStep=*/true);
    if (aiAnswer) {
      await sendText(remoteJid, aiAnswer);
      // 🪄 ROTA DE VOLTA: lembra o lead do que estava sendo pedido
      const reentryPrompt = getReentryPromptForStep(step, customer);
      // Ex.: "Voltando ao seu cadastro: qual é o seu CPF? (apenas números)"
      await sendText(remoteJid, reentryPrompt);
      return { reply: "", updates: { __inline_sent: true } as any };
      // ⚠️ NÃO muda step — fica esperando o dado certo.
    }
  }
}
```

Implementar:
1. **`isExpectedShape(step, text)`** — heurísticas baratas: `ask_cpf` → ≥11 dígitos; `ask_cep` → ≥8 dígitos; `editing_conta_valor` → contém número decimal/inteiro; `ask_birth_date` → padrão DD/MM/AAAA; etc.
2. **`getReentryPromptForStep(step, customer)`** — mapa `step → prompt` reaproveitando os textos já existentes em cada `case`. Prefixar com "📋 *Voltando ao seu cadastro:* ".
3. **`callSalesAi(customer, text, keepStep)`** — extrair a chamada já existente para `ai-sales-agent` numa função, passando `keepStep=true` para que a IA não tente avançar fluxo (prompt do agent precisa receber instrução: "responda à dúvida, sem mudar o estado do cadastro").
4. Fallback: se `ai-sales-agent` não estiver habilitado (`use_sales_ai !== true`), usar `trySendConfiguredQa()` e, mesmo assim, enviar o `reentryPrompt`.

---

## Por que isso resolve "100%"
- **Cadastro determinístico** segue intacto — números/datas continuam validados.
- **Pergunta off-topic** é tratada com a IA mas **sem perder o passo** — vendedor humano faz exatamente isso.
- **Atalhos de QA por áudio** ficam confinados aos passos conversacionais (welcome, qualificacao, duvidas).
- **Handoff humano/cancelar/reset** continua funcionando em qualquer step (intent-override roda antes de tudo).

## Validação extra (G)
1. Em `ask_cpf`, digitar "isso é seguro?" → IA responde sobre segurança + bot reenvia "📋 Voltando: digite seu CPF (11 números)". Step continua `ask_cpf`.
2. Em `editing_conta_valor`, digitar "quanto eu economizo?" → IA responde com cálculo + reenvia "📋 Voltando: digite o valor da conta (ex: 350,50)".
3. Em `ask_cpf`, digitar "12345678901" → switch processa normal (CPF válido), IA não é chamada.
4. Em `confirmando_dados_conta`, digitar "vai cair na minha conta?" → IA responde + reenvia botões SIM/NÃO/EDITAR.
5. Em `editing_conta_valor`, digitar "390.90" → não dispara QA (E), valida e salva (F já garantiu que o switch roda).

## Arquivos tocados
Apenas `supabase/functions/whapi-webhook/handlers/bot-flow.ts`.

Sem migration. Redeploy do `whapi-webhook` ao final.