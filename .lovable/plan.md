# Diagnóstico: por que o cliente não recebeu a msg do OTP nem o link da facial

## O que aconteceu (lead `c52d49af...` - MÁRCIA RECHE MARFIL)

1. ✅ Playwright preencheu o portal iGreen perfeitamente (passos 1→11).
2. ✅ Portal redirecionou para `/validacao-codigo/...` (tela de OTP de 6 dígitos).
3. ❌ Worker tentou avisar o cliente no WhatsApp:
   ```
   ⚠️  Falha ao notificar cliente sobre OTP: 500
   ```
4. ⏳ Worker entrou em polling de OTP por 300s.
5. Cliente acabou em `status=awaiting_signature` (OTP processado por outro caminho, mas a msg pedindo nunca chegou).

## Causa raiz

A função `notificarClienteOTP` (worker-portal/playwright-automation.mjs:497) busca a instância do consultor **sem filtrar por status**:

```js
.from('whatsapp_instances').select('instance_name')
.eq('consultant_id', customer.consultant_id).limit(1).single();
```

Consulta no banco para o consultor `0c2711ad-4836-41e6-afba-edd94f698ae3`:

| instance_name | status |
|---|---|
| `igreen-0c2711ad4836` | **`needs_reconnect`** |

A instância existe mas está desconectada do Evolution → POST `/message/sendText/igreen-0c2711ad4836` retorna **HTTP 500**.

A função `sendFacialLinkToCustomer` (linha 544) tem **o mesmo bug** → quando o portal liberar o link facial, a msg também vai falhar silenciosamente.

## Fix proposto (worker-portal/playwright-automation.mjs)

### 1. Filtrar instância conectada nas duas funções

Substituir as duas queries por:
```js
const { data: inst } = await supabase
  .from('whatsapp_instances')
  .select('instance_name, status')
  .eq('consultant_id', customer.consultant_id)
  .in('status', ['connected', 'open'])
  .order('updated_at', { ascending: false })
  .limit(1)
  .maybeSingle();
instanceName = inst?.instance_name || null;
```

### 2. Quando não houver instância conectada, registrar alerta e seguir

- Log claro: `⚠️ Instância desconectada (needs_reconnect) — cliente não notificado, manter polling`
- Inserir em `bot_handoff_alerts` com `reason='whatsapp_instance_offline'`, `customer_id`, `consultant_id` para o painel mostrar.
- Atualizar `customers.error_message` com texto curto (`"Instância WhatsApp desconectada ao pedir OTP"`) para visibilidade no CRM, **sem mudar `status`** (segue `awaiting_otp` / `portal_submitting`).

### 3. Tratar HTTP 500 do Evolution como sinal de instância caída

Em ambas as funções, após `res.status >= 400`:
- Marcar instância como `needs_reconnect` em `whatsapp_instances` se estava `connected`.
- Mesmo registro em `bot_handoff_alerts`.

### 4. Fallback opcional (a confirmar com o usuário)

Se quiser, adicionar fallback para enviar via **qualquer outra instância conectada do mesmo tenant/super-admin** quando a do consultor estiver offline — útil para não perder o cliente. Pode usar a instância de uma outra licenciada do mesmo grupo.

## Fora do escopo

- Reconexão automática da instância (já tratada em `whatsapp/connection-management`).
- Mudanças no fluxo Playwright/portal.
- UI nova (apenas o alerta em `bot_handoff_alerts` que já é renderizado).

## Arquivos afetados

- `worker-portal/playwright-automation.mjs` (funções `notificarClienteOTP` e `sendFacialLinkToCustomer`)
- Sem migration; usa tabelas já existentes (`whatsapp_instances`, `bot_handoff_alerts`, `customers`).

## Validação

1. Forçar `notificarClienteOTP(customerId_test)` com instância offline → deve logar warning + criar `bot_handoff_alerts`, sem 500 não tratado.
2. Reconectar a instância e reexecutar lead → msg do OTP chega no WhatsApp do cliente.
3. Verificar painel admin mostra o alerta novo.
