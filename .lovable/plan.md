## Diagnóstico

No screenshot, o dialog **"Enviar passo do fluxo"** mostra "Nenhum passo configurado", mesmo o consultor Rafael Ferreira (`0c2711ad-…`) tendo fluxo ativo. Confirmei no banco:

- Esse consultor tem **2 `bot_flows` ativos** ao mesmo tempo (variant **A** e variant **B**, do teste A/B/C).
- `ManualStepDialog.tsx` carrega o fluxo assim:
  ```ts
  supabase.from("bot_flows").select("id")
    .eq("consultant_id", …).eq("is_active", true).maybeSingle()
  ```
  Sem filtrar por `variant` e sem `limit(1)` → `maybeSingle()` quebra (multiple rows) e retorna `flow=null` → lista vazia.
- `FlowQuickBar.tsx` tem o mesmo bug parcial: usa `limit(1)` mas ignora `variant`, então pode listar o fluxo **errado** (passos da variante A enquanto o cliente está na B).

A pausa do bot **não é o problema** — o backend `manual-step-send` já ignora o pause (e o usuário quer manter esse comportamento: "individual sempre funciona").

## Correção (somente frontend)

### 1. `src/components/admin/AIAgentTab/ManualStepDialog.tsx`
- Buscar `customers.flow_variant` (já carregado em outros pontos) ou ler do próprio `customer` se vier por prop.
- Carregar bot_flow assim:
  ```ts
  .eq("consultant_id", consultantId).eq("is_active", true)
  .eq("variant", customer.flow_variant ?? "A")
  .order("created_at", { ascending: false }).limit(1).maybeSingle()
  ```
- Fallback: se nada vier com a variante do cliente, tentar **qualquer** variante ativa (`order().limit(1)`).
- Mensagem de erro mais clara quando realmente não houver passos: distinguir "consultor sem fluxo ativo" de "fluxo ativo, mas sem passos".

### 2. `src/components/whatsapp/FlowQuickBar.tsx`
- Aceitar `flow_variant` (buscar da tabela `customers` quando `customerId` mudar, ou receber via prop).
- Mesma lógica de query: filtrar por `variant`, fallback para qualquer ativa.
- Garantir que a lista exibida corresponda ao fluxo que o cliente está realmente vivendo.

### 3. Reforço UX
- Tornar explícito no header do popover/dialog que o envio funciona **mesmo com bot pausado** ("✓ Envio manual ignora a pausa do bot").
- Não há mudança de backend — `manual-step-send` já bypassa pause e está deployado.

## Fora de escopo
- Mexer em `manual-step-send` (já funciona).
- Mexer no comportamento global do bot pausado.
- Alterar o motor de A/B/C.
