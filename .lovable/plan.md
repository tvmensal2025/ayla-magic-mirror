## Problemas identificados nos cards de Passos (Captação)

1. **Botões bloqueados em todos os cards quando 1 está enviando** — `disabled={!!sending}` desabilita todos. Deve desabilitar só o card em envio.
2. **Títulos cortados** — `line-clamp-2 min-h-[2rem]` corta "Pergunta valor da conta" → "Pergunt..." e força altura fixa mesmo com título curto.
3. **Grid rígido** — `grid-cols-2 sm:3 md:5 xl:6` quebra em telas intermediárias; cards ficam estreitos demais e o botão "Ver e enviar" corta.
4. **Preview da mensagem em 2 linhas** com fonte `text-[10px]` — fica ilegível.
5. **Altura desigual** — cards com título curto + sem preview ficam menores que os outros.

## Mudanças (`src/components/captacao/CaptureStepsGrid.tsx`)

- Grid `grid-cols-[repeat(auto-fill,minmax(180px,1fr))]` → auto-fit, cada card no mínimo 180px, sempre ocupa a linha inteira.
- Cards `flex flex-col` com `h-full` para igualar altura na mesma linha; preview e ações alinhados.
- Título: `line-clamp-3` em vez de 2; remover `min-h-[2rem]` (deixa o flex igualar).
- Preview: `text-xs leading-snug line-clamp-3` (era `text-[10px] line-clamp-2`).
- Botão: passa a desabilitar apenas o card em envio (`disabled={isSending}` em vez de `!!sending`); texto fica `"Enviar"` quando largura < ~190px usando `truncate` + `<span className="truncate">`; ícone Eye sempre visível.
- Ação secundária (Editar) já é `w-8`, mantém; troco `flex-1` por `min-w-0 flex-1` no botão principal para nunca empurrar a edição pra fora.

## Fora de escopo
- Lógica de envio, variantes, OCR — sem mudança.
- Outras abas — só este grid.

## Arquivos
- `src/components/captacao/CaptureStepsGrid.tsx`
