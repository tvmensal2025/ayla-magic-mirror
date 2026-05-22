## Problema
O feed "Conversa ao Vivo" abaixo dos passos tem altura fixa pequena (`max-h-56` = ~224px), apertando as mensagens do cliente. Quer mais espaço pra leitura.

## Mudança
### `src/components/captacao/CaptureConversationFeed.tsx`
- Trocar `max-h-56` por `h-[clamp(280px,38vh,520px)]` no container de scroll (linha 135) — área cresce com a tela e nunca fica espremida.
- Aumentar `text-[10px]` das bolhas para `text-xs` e `p-2` para `p-3` para melhor legibilidade.

### `src/components/captacao/CaptacaoPanel.tsx`
- Garantir que o feed ocupe o espaço sobrando: o wrapper `flex-1 overflow-y-auto` envolve passos + feed. Vou trocar a estrutura interna pra: passos com altura natural e o feed `flex-1` ocupando todo o restante (`min-h-0`), eliminando a barra de rolagem externa quando possível.

## Fora de escopo
- Lógica de mensagens, envio, OCR — nada muda.

## Arquivos editados
- `src/components/captacao/CaptureConversationFeed.tsx`
- `src/components/captacao/CaptacaoPanel.tsx` (só ajuste de flex no wrapper interno)
