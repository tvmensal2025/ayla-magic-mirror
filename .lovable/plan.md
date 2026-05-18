## Diagnóstico do loop de e-mail no print

Cliente HUSSAM (5511971254913), consultor Rafael (`rafael.ids@icloud.com`):

1. OCR puxou da conta um e-mail acadêmico (`rafael.dias993@cs.ceunsp.edu.br`) e salvou em `customer.email`.
2. Cliente toca "1 Finalizar" → entra em `finalizando` → `validateCustomerForPortal` dispara `"Email do consultor não pode ser usado..."` (provavelmente porque `isSameContact` casou pelos primeiros dígitos comuns ou porque `consultant_email` veio sujo em outro fluxo).
3. Sistema responde com aviso + pede e-mail (linha 3972 do `bot-flow.ts`).
4. Cliente envia `Tvmensal08@gmail.com`.
5. No `case "ask_email"` o e-mail passa todas as validações, é salvo, e `autoResolveCepIfNeeded` decide o próximo passo. Mas a função `nextStep` em `conversation-helpers.ts` linha 66 tem regex `/^tvmensal/i.test(c.email)` que **considera "tvmensal..." como placeholder** → devolve `"ask_email"` de novo.
6. Como `next === "ask_email"`, o `getReplyForStep` devolve o texto genérico:
   > 📧 Informe seu e-mail para finalizarmos seu cadastro no portal iGreen (ex: joao.silva@gmail.com). Se não tiver e-mail, crie um agora em gmail.com — leva 1 minuto.
7. Cliente reenvia o **mesmo** e-mail → mesmo loop → mensagem genérica de novo, sem explicar por que.

São, portanto, **dois bugs combinados** + um problema de copy:

- **Bug A**: `/^tvmensal/i` no `nextStep` rejeita todo e-mail que comece com "tvmensal" como placeholder. É uma regra antiga (provavelmente do consultor "Tv Mensal" que foi usada como exemplo) e hoje bloqueia clientes legítimos cujo e-mail real começa assim.
- **Bug B**: quando o `case "ask_email"` salva o e-mail mas o próximo passo volta a ser `ask_email`, o bot devolve a pergunta inicial sem nenhuma indicação de erro. O cliente acha que a mensagem dele não chegou e reenvia o mesmo dado.
- **Copy ruim**: várias mensagens citam "Gmail" / "gmail.com" como exemplo principal, fazendo o cliente acreditar que precisa criar um Gmail.

## Plano de correção

### 1. Remover regra que bloqueia "tvmensal" como placeholder

Arquivo: `supabase/functions/_shared/conversation-helpers.ts` linha 66.

- Apagar `/^tvmensal/i.test(c.email)` da lista de placeholders dentro de `nextStep`.
- Manter os demais (`@lead.igreen`, `@teste`, `teste@`, `noreply@`, `sem_email`).
- O bloqueio de placeholders reais já está centralizado em `_shared/validators.ts` (`isPlaceholderEmail`), que **não** contém essa regra — então remover não cria buraco de segurança.

### 2. Eliminar menção a "Gmail" e "gmail.com" como exemplo único

Reescrever todas as mensagens para deixar claro: **qualquer e-mail vale, e tem que ser o que o cliente usa de verdade**. Sem indicar provedor.

Arquivos e linhas:

- `supabase/functions/_shared/conversation-helpers.ts:112`  
  De: `"📧 Informe seu *e-mail* para finalizarmos seu cadastro no portal iGreen (ex: joao.silva@gmail.com)\n\n_Se não tiver e-mail, crie um agora em *gmail.com* — leva 1 minuto._"`  
  Para: `"📧 Qual é o seu *e-mail*?\n\nPrecisa ser um e-mail *seu, que você usa de verdade* — qualquer provedor (Outlook, iCloud, Yahoo, Gmail, do trabalho...). É por ele que o portal manda o código de acesso."`

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts:355` (introdução conversacional)  
  Substituir lista de provedores por copy curta: `"${v}me passa seu *e-mail* 📧 (qualquer um que você usa no dia a dia)"`.

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts:3593` (cliente disse "não tenho")  
  Para: `"📧 Preciso de um *e-mail* pra liberar seu cadastro no portal iGreen.\n\nPode ser qualquer e-mail seu — do trabalho, pessoal, antigo, novo. Se não tiver nenhum agora, crie um rapidinho (leva 1 minuto) em qualquer provedor.\n\nQuando tiver, é só mandar aqui."`

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts:3598` (formato inválido)  
  Para: `"❌ Não consegui ler esse e-mail. Confere se digitou certinho (precisa ter @ e o domínio, ex: *seunome@dominio.com*) e me manda de novo:"`

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts:3602` (placeholder)  
  Para: `"❌ Esse e-mail parece de teste. Me manda o e-mail *que você usa de verdade* — é por ele que o portal vai mandar o código:"`

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts:3613` (é o do consultor)  
  Para: `"❌ Esse é o e-mail do consultor. Preciso de um e-mail *seu, diferente desse* — pode ser qualquer provedor:"`

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts:3972` (rejeição na validação final)  
  Para: `\`⚠️ ${err}\n\nMe manda um e-mail *seu*, diferente do consultor — pode ser qualquer provedor:\``

Aplicar a mesma reescrita no espelho `supabase/functions/evolution-webhook/handlers/bot-flow.ts` (linhas equivalentes ~1153-1165 e o handler de `ask_email`) para manter os dois webhooks consistentes.

### 3. Evitar a "pergunta repetida" no `case "ask_email"`

Arquivo: `supabase/functions/whapi-webhook/handlers/bot-flow.ts` linhas 3617-3622.

Hoje o handler salva e chama `getReplyForStep(next, merged)`. Se o `next` voltou a ser `ask_email` (porque algum validador secundário rejeitou) o cliente recebe a pergunta genérica de novo, sem motivo. Mudar para:

```ts
updates.email = txt.toLowerCase();
const merged = { ...customer, ...updates };
const next = await autoResolveCepIfNeeded(merged, updates);
updates.conversation_step = next;
if (next === "ask_email") {
  // Algum validador secundário ainda recusa esse e-mail. Em vez de repetir
  // a pergunta padrão, explicar e pedir um e-mail diferente.
  reply = "❌ Esse e-mail não foi aceito pelo sistema. Me manda um *outro e-mail seu* — qualquer provedor (Outlook, iCloud, Yahoo, Gmail...):";
} else {
  reply = getReplyForStep(next, merged);
}
```

Replicar no `evolution-webhook` se o caminho for idêntico.

### 4. Limpar o e-mail incorreto da Hussam para destravar o teste

O cliente atual (`b4c08ce2-...`) ainda tem `rescue_attempts=1` e `conversation_step=portal_submitting` com e-mail acadêmico do consultor. Quando o usuário pedir, executo migration que **zera o e-mail e reabre `ask_email`** apenas desse customer, para validar a correção em produção. (Fora do escopo dessa entrega se o usuário não quiser tocar nos dados — só sinalizo.)

## Fora do escopo

- Não mexer no `validateCustomerForPortal` em si — a regra "email do consultor" continua valendo, só a redação melhora.
- Não mexer no fluxo do dispatch de mídia/áudio dos passos.
- Não tocar nas etapas anteriores (cadastro, conta, OTP).

## Resultado esperado

- Cliente que envia `Tvmensal08@gmail.com` (ou qualquer e-mail real começando com qualquer prefixo) é aceito de primeira.
- Quando o e-mail é rejeitado, a mensagem explica claramente o motivo e pede um e-mail diferente — sem repetir a pergunta padrão.
- Nenhuma mensagem do bot induz o cliente a achar que precisa ser Gmail.
