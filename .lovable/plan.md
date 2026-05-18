## Análise do erro com a Simone

Linha do tempo real (cliente `fd51f071-...`, telefone 5519995904388):

| Hora | Direção | Texto | Step |
|---|---|---|---|
| 16:36:59 | in | "Olá! Tenho interesse…" | welcome |
| 16:37:33 | in | "Simone" | flow:33be68c1 |
| 16:37:36 | in | "Tudo bem" | flow:33be68c1 |
| 16:37:47 | **out** | "Simone, qual o valor médio da sua conta de luz?" | `3e7fb4cd` (sem prefixo `flow:`) |
| 16:37:55 | **out** | "Boa! Me ajuda voltando aqui: **{{nome}}**, qual o valor médio da sua conta de luz?" | `flow:3e7fb4cd` |
| 16:38:38 | in | "Depende esse mês veio 170" | flow:3e7fb4cd |
| 16:39:23 | out | "Simone, posso estar explicando abaixo como funciona?" | flow:bdc7ebb3 |

### Bugs identificados

**Bug 1 — `{{nome}}` enviado cru ao lead (crítico).**
Em `supabase/functions/whapi-webhook/handlers/conversational/index.ts`:

```ts
// linha 790
_setTurnStepQuestion(currentStep?.message_text || "");
```

Guarda o `message_text` **bruto** do step. Depois, `_finalize` (linhas 572-584) usa esse texto direto na reentrada `"Boa! Me ajuda voltando aqui: ${tail}"` sem passar por `renderTemplate(...)`. Resultado: o lead recebeu literalmente `{{nome}}`. O mesmo arquivo espelhado em `evolution-webhook/handlers/conversational/index.ts` tem o bug idêntico.

**Bug 2 — duas perguntas iguais em 8 s (dispatch duplicado).**
A primeira resposta (16:37:47) saiu pelo caminho legado (step salvo sem prefixo `flow:`), e logo em seguida (16:37:55) o caminho conversacional disparou o `_finalize` reentry para o mesmo step `3e7fb4cd`. Sinaliza que dois engines (`sys` legacy e `flow` conversational) processaram o mesmo inbound `"Tudo bem"`, provavelmente porque `routeEngine` não respeitou o `flow:` prefixo após a transição welcome → flow.

### Plano de correção

1. **Renderizar variáveis na reentrada (`_finalize`)**
   - Trocar a string global `_currentTurnStepQuestion` por um objeto `{ raw, vars }` populado em `runConversationalFlow` com as `vars` que já são montadas (nome, representante, valor_conta, telefone, cpf).
   - Em `_finalize`, antes de compor a reentrada, rodar `renderTemplate(tail, vars)` (import já existe em `./templates.ts`).
   - Replicar a mudança em `whapi-webhook` e `evolution-webhook` (arquivos espelhados).

2. **Evitar dispatch duplicado welcome → flow**
   - Em `index.ts` do webhook, garantir que após `runConversationalFlow` retornar com `updates.conversation_step = "flow:..."`, o caminho `sys` (`runBotFlow` legacy) seja curto-circuitado no mesmo turno.
   - Checar `routeEngine`: se `customer.conversation_step` começa com `flow:` OU `currentStep` resolvido é custom, **não** chamar o engine `sys` no mesmo webhook. Hoje há uma janela onde o step salvo é `3e7fb4cd` (sem prefixo) e o roteador chama os dois.
   - Adicionar log `[route] engine=flow|sys reason=...` para auditar.

3. **Sanity test**
   - Test Deno em `conversational/index_test.ts`: dado `currentStep.message_text = "Olá {{nome}}, tudo bem?"` e `reply` vazio, `_finalize` retorna `"Boa! Me ajuda voltando aqui: Olá Simone, tudo bem?"` — nunca contém `{{`.
   - Test em `routeEngine`: dado `conversation_step = "flow:xxx"`, retorna `engine=flow` e não invoca `runBotFlow` sys.

4. **Validação manual pós-deploy**
   - Reabrir conversa de teste no Camila, mandar "Tudo bem" no step que tem `{{nome}}` no `message_text` e confirmar:
     - apenas **um** outbound por turno;
     - nenhum `{{...}}` literal no texto enviado.

### Fora de escopo
- Refatorar a unificação dos engines `sys`/`flow` (já planejado em `mem/whatsapp/evolution-parity.md`).
- Tocar UI/CRM/LP/Anúncios.

### Arquivos a editar
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- `supabase/functions/evolution-webhook/handlers/conversational/index.ts`
- `supabase/functions/whapi-webhook/index.ts` e `evolution-webhook/index.ts` (curto-circuito do engine)
- Novos: `*_test.ts` para `_finalize` e `routeEngine`
