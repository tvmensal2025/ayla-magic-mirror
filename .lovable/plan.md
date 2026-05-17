# Notificações e Pausa Inteligente do Bot

## Visão geral

Três mudanças conectadas:

1. **Cadastro de número de notificação** — cada consultor terá 2 números: o que opera o WhatsApp (com a IA Camila) e um separado pra receber alertas.
2. **Alerta bonito de novo lead** — sempre que um lead novo entrar, o número de notificação recebe uma mensagem formatada.
3. **Pausa imediata quando a dúvida não está no FAQ** — hoje só pausa depois de 5 perguntas; passa a pausar na 1ª pergunta sem resposta e dispara alerta pro humano assumir.

---

## 1. Cadastro do número de notificação

Adicionar coluna `notification_phone` em `consultants` (texto, formato `5511989000650`, nullable).

Em `/admin/fluxos` → aba **Dados**, dentro da seção "Informações", adicionar campo logo abaixo do WhatsApp atual:

```text
WhatsApp principal (IA + divulgação)   [+55] [11989000650]
WhatsApp para alertas (humano)         [+55] [11989000650]
  ↳ "Receberá notificações de novos leads e pedidos de atendimento humano"
```

Mesma máscara/validação do telefone existente. Persistido junto no `onSave` da DadosTab.

## 2. Alerta de novo lead

Disparado no `whapi-webhook/index.ts` logo após o `INSERT` em `customers` bem-sucedido (linha ~319, antes do `customer = newCustomer`).

- Chama nova edge function `notify-consultant` (fire-and-forget, não bloqueia o fluxo).
- A function busca `consultants.notification_phone` do `consultant_id` do lead e envia via Evolution API usando a mesma instância do consultor.
- Se `notification_phone` for nulo → não faz nada (silencioso).
- Cooldown de 30s por telefone do lead (evita duplicar se INSERT falhar e cair no fallback).

**Template da mensagem:**

```text
🎉 *NOVO LEAD CHEGOU!*
━━━━━━━━━━━━━━━━━━
👤 *Nome:* {nome ou "(sem nome)"}
📱 *WhatsApp:* {telefone formatado}
🕐 *Entrou em:* {hora BRT}

🤖 A IA Camila já iniciou o atendimento.
Acompanhe em: {link do CRM}
```

## 3. Pausa imediata em dúvida fora do FAQ

Editar `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (bloco midflow QA, linhas 609-677):

**Hoje:** pergunta sem FAQ → ignora, fluxo segue (cliente sente que o bot ignorou).
**Novo comportamento:**

- Pergunta casa com FAQ → responde + gancho (como já é). `detour_count` segue até 5 antes de pausar (mantém).
- Pergunta **não casa** com FAQ:
  1. Tenta primeiro continuar o fluxo (deixar o capture/transition do step atual processar — pode ser que a mensagem ainda seja uma resposta válida que só parece pergunta).
  2. Se o step atual rejeitar (cair em `fallback.mode = "repeat"` ou validação falhar) → marca `bot_paused = true`, `bot_paused_reason = "duvida_fora_faq"`, insere `bot_handoff_alerts` e dispara alerta pro `notification_phone`.

**Template do alerta de handoff:**

```text
🆘 *LEAD PRECISA DE VOCÊ*
━━━━━━━━━━━━━━━━━━
👤 {nome} — 📱 {telefone}
📍 *Passo:* {step_key humanizado}

💬 *Última pergunta:*
"{messageText}"

⚠️ A IA pausou porque não soube responder.
Assuma a conversa em: {link CRM}
```

Implementação: detectar "step rejeitou" significa que após `handleBotFlow` retornar, se a mensagem foi pergunta + sem FAQ match + step não avançou → pausa e notifica. Mais simples: fazer no próprio bloco midflow QA, no branch `else` do `if (qa && ...)`, marcando o customer como "pendente de validação" e checando ao final do fluxo se o step manteve.

Versão pragmática (mais segura): no bloco midflow QA, quando `hit=false` E `detectQuestionIntent=true`, pausar imediatamente. Razão: se o cliente fez pergunta e o consultor não cadastrou no FAQ, é exatamente o caso que o humano deve assumir. Removemos o threshold de 5 (era proteção pra detecção ruim, mas hoje confunde).

## 4. Migration

```sql
ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS notification_phone text;
```

## 5. Arquivos afetados

- **Migration:** `consultants.notification_phone`
- **`src/components/admin/DadosTab.tsx`** — novo campo
- **`src/pages/Admin.tsx`** ou hook que persiste — incluir `notification_phone` no form/save
- **`src/hooks/useConsultantForm.ts`** — incluir campo no estado
- **Nova edge function:** `supabase/functions/notify-consultant/index.ts` — recebe `{ consultant_id, type: "new_lead" | "handoff", customer_id }`, busca dados, envia via Evolution
- **`supabase/functions/whapi-webhook/index.ts`** — chamar `notify-consultant` após criar customer
- **`supabase/functions/whapi-webhook/handlers/bot-flow.ts`** — bloco midflow QA: no `hit=false`, pausar e notificar

## 6. Detalhes técnicos

- `notify-consultant` usa `SUPABASE_SERVICE_ROLE_KEY` internamente, é chamada via `supabase.functions.invoke` com fire-and-forget (`.catch(() => {})`).
- Para enviar via Evolution, busca a `whatsapp_instances` do consultor (mesma instância usada pra falar com leads) — não precisa de instância separada.
- Cooldown anti-duplicata: tabela leve ou cache em memória da function (suficiente — duplicatas são raras).
- Se a instância do consultor estiver desconectada, log de warning e desiste silenciosamente.

## 7. Validação

1. Cadastrar `notification_phone` em /admin/fluxos → Dados.
2. Mandar mensagem nova de número desconhecido → deve chegar alerta de "NOVO LEAD" no número cadastrado.
3. Dentro do fluxo, mandar pergunta que está no FAQ → bot responde, segue.
4. Mandar pergunta que **não** está no FAQ → bot pausa, chega alerta "LEAD PRECISA DE VOCÊ", e mensagens seguintes ficam para o humano responder.
