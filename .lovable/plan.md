## Plano de correção

### Objetivo
Garantir que o lead `11971254913` receba todos os passos corretamente, sem duplicar mensagens/mídias, com tempo realista entre envios e com variáveis como telefone e CPF funcionando em todos os caminhos: manual, bot, fluxo customizado, A/B/C e atalhos.

### Correções propostas

1. **Unificar variáveis de template**
   - Expandir o helper `renderTemplateVars` para suportar `cpf`, `documento`, `telefone`, `valor_conta`, economia e extras.
   - Usar esse helper também no `manual-step-send` em vez de mapas locais incompletos.
   - Garantir que `{cpf}`, `{{cpf}}`, `{telefone}`, `{{telefone}}`, `{phone}` e variações com maiúsculas/espaços funcionem igualmente.

2. **Corrigir o número de destino em todos os caminhos**
   - Padronizar o telefone do cliente como destino do envio, sempre derivado de `customers.phone_whatsapp`.
   - Validar o caso `11971254913` para sair como `5511971254913@s.whatsapp.net`.
   - Evitar que atalhos, envio manual, continuação e bot usem número do consultor por engano.

3. **Eliminar duplicação de envio manual e continuação**
   - Reforçar debounce por customer + step + tipo + conteúdo, não só por `conversation_step`.
   - Fazer `continueFlow` não reenviar o mesmo step quando ele acabou de ser enviado.
   - Aplicar anti-duplicação também em mídias no `manual-step-send`, como já existe parcialmente no bot (`canSendMediaOnce`).

4. **Ajustar o tempo entre mensagens/mídias**
   - Substituir delays fixos muito curtos (`1200ms`, `2500ms`, `4500ms`) por cálculo baseado em tipo e duração real da mídia.
   - Áudio/vídeo devem esperar proporcionalmente à duração antes do próximo item, evitando sobreposição e duplicação percebida.
   - Texto deve usar tempo humano mínimo, sem estourar o timeout do client.

5. **Aplicar em todos os fluxos A/B/C**
   - Respeitar a variante do lead em bot e dispatch customizado.
   - Manter o comportamento atual: variante B remove áudio no bot; envio manual continua podendo mandar áudio se o consultor escolher.
   - Garantir que fallback C→B não reenvie mídia já entregue.

6. **Validar com logs e teste focado**
   - Conferir nos logs do `manual-step-send` e `whapi-webhook` se não há novo `vars is not defined`.
   - Testar o fluxo do cliente `11971254913` com um envio manual + seguir fluxo e verificar que não duplica.
   - Confirmar que mensagens com CPF/telefone renderizam sem deixar `{cpf}` ou `{telefone}` no texto.

### Arquivos principais a alterar
- `supabase/functions/_shared/render-vars.ts`
- `supabase/functions/manual-step-send/index.ts`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- Possivelmente `supabase/functions/_shared/whapi-api.ts` / `evolution-api.ts` apenas se o ajuste de tempo precisar ficar no sender compartilhado.

### Resultado esperado
O envio manual, o bot automático, o fluxo customizado, as variantes A/B/C e os atalhos passam a usar a mesma renderização de dados, o mesmo destino do cliente e travas consistentes contra reenvio duplicado.