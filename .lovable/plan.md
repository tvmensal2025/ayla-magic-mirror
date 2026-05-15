## Diagnóstico (a partir dos logs reais do último teste)

Olhei os logs do webhook e o código dos handlers. Encontrei **3 falhas reais** e **1 melhoria pedida**:

### 1. Valor da conta vira "1,69" (deveria ser R$ 1.688,15)
O Gemini extraiu corretamente `valorConta: "1.688,15"`. O bug está em `supabase/functions/_shared/ocr.ts:171`:

```ts
parseFloat(String(dados.valorConta).replace(/[^\d.,]/g, "").replace(",", "."))
// "1.688,15" → "1.688.15" → parseFloat = 1.688 → toFixed(2) = "1.69"
```

Como `1.69 < 30`, o `bot-flow.ts:1310` zera o valor e mostra `R$ ❌`. Por isso o lead viu valor errado e clicou em "EDITAR".

**Correção**: detectar o formato brasileiro — se houver `,` decimal, remover `.` (milhar) antes de trocar `,` por `.`.

### 2. Bot "esquece" o passo ao tentar editar (volta pro início do fluxo)
Os logs mostram exatamente:
```
[conversational] unknown step="editing_conta_menu" → restart at firstActive
```
O dispatcher em `supabase/functions/whapi-webhook/index.ts:333-342` (`CADASTRO_OR_SYSTEM`) **não inclui** os passos `editing_conta_*`, `editing_doc_*` e `aguardando_doc_auto`. Resultado: quando o lead clica "✏️ EDITAR", o `conversation_step` vira `editing_conta_menu`, mas a próxima mensagem é roteada para o **conversational** (motor novo), que não conhece esse passo e reinicia o fluxo do zero. O `bot-flow.ts` (que tem todos os cases de edição entre as linhas 1822-1990) nunca é chamado.

**Correção**: incluir todos os passos `editing_conta_*`, `editing_doc_*` e `aguardando_doc_auto` no set `CADASTRO_OR_SYSTEM` do dispatcher e no `CADASTRO_STEPS` do guard do conversational.

### 3. Nome e Valor podem aparecer como ❌ mesmo com OCR OK
Hoje, se o Gemini falhar em extrair `nome` ou se o valor for parseado errado, a confirmação mostra `❌` e segue. Pedido: **nunca falhar nesses dois campos**.

**Correção**: se após o OCR `nome` ou `valor` vierem vazios/inválidos, **não enviar a tela de confirmação** — direcionar a Camila a perguntar especificamente o campo faltante (`editing_conta_nome` ou `editing_conta_valor`) antes de seguir. Manter o resto dos dados já extraídos.

### 4. Mostrar a economia em número (R$/ano com 20%)
Hoje a mensagem só diz "até 20%". Vamos calcular e exibir:

```
Economia estimada: 20% ao mês
→ R$ {valor*0.20} por mês
→ R$ {valor*0.20*12} por ano
```

Aplicar em `bot-flow.ts:1375-1377` (mensagem após "✅ SIM" na confirmação) e também na tela de confirmação dos dados (`bot-flow.ts:1320-1329`), substituindo a linha do valor por algo do tipo:

```
💰 Valor: R$ 1.688,15
💚 Economia: 20% ao mês = R$ 337,63/mês ou R$ 4.051,56/ano
```

---

## Plano de implementação

### Arquivo 1 — `supabase/functions/_shared/ocr.ts`
Substituir o normalizador do `valorConta` (linha 171) por um parser que entende formato BR (`1.688,15`), formato US (`1688.15`) e número puro (`1688`).

### Arquivo 2 — `supabase/functions/whapi-webhook/index.ts`
Adicionar ao `CADASTRO_OR_SYSTEM` (linha 333):
- `editing_conta_menu`, `editing_conta_nome`, `editing_conta_endereco`, `editing_conta_cep`, `editing_conta_distribuidora`, `editing_conta_instalacao`, `editing_conta_valor`
- `editing_doc_menu`, `editing_doc_nome`, `editing_doc_cpf`, `editing_doc_rg`, `editing_doc_nascimento`, `editing_doc_pai`, `editing_doc_mae`
- `aguardando_doc_auto`
- `aguardando_humano`

### Arquivo 3 — `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
Espelhar a mesma lista no `CADASTRO_STEPS` (linha 62) — assim o guard defensivo no topo do `runConversationalFlow` devolve `{reply:""}` e libera o `bot-flow.ts` para processar.

### Arquivo 4 — `supabase/functions/whapi-webhook/handlers/bot-flow.ts`

**a) Blindagem nome/valor após OCR (~linha 1298)**: depois do `criticos.length < 3` check, adicionar:
- Se `!d.nome` → `conversation_step = "editing_conta_nome"`, perguntar nome.
- Se `nome` ok mas `valor` ausente/inválido → `conversation_step = "editing_conta_valor"`, perguntar valor.
- Só então mostrar a tela de confirmação completa.

**b) Mensagem de confirmação (linhas 1320-1329)**: trocar a linha do valor por:
```
💰 Valor: R$ {valor formatado pt-BR}
💚 Economia: ~20% = R$ {valor*0.20}/mês • R$ {valor*0.20*12}/ano
```
Helper inline `formatBRL(n)` para `n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})`.

**c) Mensagem após "✅ SIM" (linhas 1375-1377)**: trocar o texto por algo concreto:
```
Show, {nome}! Sua conta de R$ {valor}/mês cabe certinho na economia 💚
→ Você economiza ~R$ {mensal} por mês
→ R$ {anual} por ano sem mexer em nada na sua casa

E ainda entra no Conexão Club: até 70% de desconto em farmácia, mercado, posto e várias parceiras.
```

### Arquivo 5 (opcional) — `supabase/migrations/...sql`
Resetar de novo os dois leads de teste (`5511971254913`, `5511989000650`) para começar do zero após o deploy.

---

## Validação

1. Reset dos 2 leads de teste.
2. Mandar "oi" → fluxo visual da Camila (já validado).
3. Enviar a foto da conta → OCR vem com `valorConta: "1.688,15"` → tela de confirmação mostra `R$ 1.688,15` e linha de economia (`R$ 337,63/mês`).
4. Clicar "✏️ EDITAR" → menu numerado aparece → digitar "5" → bot pede o número da instalação (sem reiniciar o fluxo).
5. Confirmar com "✅ SIM" → mensagem do Conexão Club já com R$ economizados/ano.
6. Conferir nos logs do `whapi-webhook` que **não aparece mais** `unknown step="editing_conta_..." → restart`.

Pronto pra implementar — me dá o ok e eu faço as edições + deploy + reset dos leads.
