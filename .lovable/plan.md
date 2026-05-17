## Diagnóstico do caso MARCIA

O link facial foi gerado corretamente pelo portal:

```text
https://digital.igreenenergy.com.br/validacao-codigo/1460976?id=139114&sendcontract=true
```

Ele também foi salvo no cliente no banco:

```text
conversation_step = aguardando_facial
status = awaiting_signature
link_facial = link correto
link_assinatura = link correto
```

O problema foi no envio pelo WhatsApp:

1. O worker tentou avisar o cliente sobre OTP e retornou falha 500.
2. Depois do OTP, o worker encontrou o link facial, mas o envio também retornou 500.
3. A instância do consultor ficou marcada como `needs_reconnect`.
4. Como o envio falhou, `facial_link_sent_at` ficou nulo e não há mensagem outbound do link facial no histórico.
5. Existe ainda um bug de automação: `clickText is not defined` ao confirmar OTP. Apesar disso, o portal mudou para a URL facial e o link foi capturado, então este bug não impediu a geração do link neste caso, mas precisa ser corrigido para não quebrar em outros cadastros.

## Causa raiz

O fluxo de geração funcionou. O que falhou foi a entrega da mensagem pelo canal WhatsApp:

```text
Evolution falhou: 500
Não foi possível enviar link facial via WhatsApp
```

Mesmo o projeto usando Whapi como canal principal no código atual, este log mostra que a versão em execução no worker ainda caiu no envio Evolution/instância desconectada, ou que o worker na VPS não está com a versão mais recente/variáveis Whapi corretas em runtime.

## Plano de correção

### 1. Corrigir envio imediato do link facial
- Ajustar `sendFacialLinkToCustomer` para só marcar `facial_link_sent_at` quando o envio realmente retornar sucesso.
- Se Whapi/Evolution falhar, manter `facial_link_sent_at = null` e gravar `error_message` claro no cliente.
- Registrar no histórico `conversations` uma tentativa `facial_link_failed`, para o CRM mostrar por que o link não chegou.

### 2. Fazer reenvio automático real
- Hoje o reenvio de 30s roda dentro do processo do job; se o worker terminar/reiniciar, esse timer pode não executar.
- Criar endpoint/rotina de recuperação no worker para buscar clientes com:

```text
conversation_step = aguardando_facial
link_facial preenchido
facial_link_sent_at nulo
```

- Reenviar o link pelo WhatsApp e só marcar `facial_link_sent_at` após sucesso.

### 3. Padronizar canal Whapi como principal
- Garantir que OTP e link facial usem primeiro Whapi (`/messages/text`).
- Evolution fica apenas como fallback.
- Se Evolution retornar 500, marcar a instância como `needs_reconnect`, mas não considerar o fluxo concluído sem tentar Whapi.

### 4. Corrigir bug do OTP
- Implementar helper `clickText` ou trocar por um clique direto em botões `Confirmar`, `Verificar`, `Enviar`.
- Isso elimina o erro:

```text
OTP falhou: clickText is not defined
```

### 5. Reenviar agora para a cliente afetada
- Após a correção, disparar o reenvio do link já salvo para o customer:

```text
06a3ed56-f980-4d3c-93d0-a69a4061004b
```

- Confirmar no banco:

```text
facial_link_sent_at preenchido
conversations com outbound do link facial
whatsapp_instances não bloqueando o envio
```

## Arquivos a alterar

- `worker-portal/playwright-automation.mjs`
- `worker-portal/server.mjs`
- Possivelmente `supabase/functions/worker-callback/index.ts` para manter o mesmo padrão Whapi-first no callback legado.

## Resultado esperado

- Link facial nunca fica apenas salvo no banco sem tentativa rastreável de envio.
- Se o WhatsApp falhar, o sistema tenta novamente e mostra o motivo no CRM.
- O fluxo não marca a etapa facial como enviada se a mensagem não chegou.
- O caso atual da MARCIA recebe o link de assinatura/facial automaticamente.