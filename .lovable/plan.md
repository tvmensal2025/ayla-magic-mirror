## Problema

A Captação no mobile abre em **fullscreen (`h-[100dvh]`)** e tampa o chat do WhatsApp. Só existe o botão "Minimizar" (vira barrinha) — não dá pra ver o chat e a captação ao mesmo tempo, e não tem botão de **expandir** pra alternar entre meia-tela e tela cheia.

## Objetivo

A sheet de Captação no mobile passa a ter **3 estados** controlados pelo consultor, todos adaptáveis a qualquer altura de celular (uso de `dvh` + `safe-area-inset`):

1. **Meia-tela (padrão)** — ocupa ~60% da viewport, deixa o chat e o input do WhatsApp visíveis em cima. Header da Captação + lista de passos rolável + footer "FINALIZAR".
2. **Tela cheia (expandida)** — ocupa `100dvh` (comportamento atual), pra quem quer focar só na captação.
3. **Minimizada** — barrinha flutuante de 44px no rodapé (já existe).

## Mudanças

### `src/components/captacao/CaptureSheet.tsx`

- Adicionar estado `expanded: boolean` (default `false` = meia-tela).
- Trocar `h-[100dvh]` por classe condicional:
  - expanded → `h-[100dvh]`
  - default → `h-[62dvh] min-h-[420px] max-h-[100dvh] rounded-t-2xl`
- No header, ao lado do botão "Minimizar", adicionar botão **Expandir/Recolher** com ícone `Maximize2` / `Minimize2` (lucide-react), alternando `expanded`.
- Garantir que o `SheetContent` use `side="bottom"` e que o overlay (`SheetOverlay`) **não bloqueie o chat**: usar `pointer-events-none` no overlay quando não-expanded, e deixar o conteúdo da sheet com `pointer-events-auto`. Isso permite tocar no chat por cima do overlay.
- Padding-bottom já usa `env(safe-area-inset-bottom)` — manter. Adicionar `dvh` em todos os limites para se adaptar a celulares com barra dinâmica do navegador (iOS Safari, Chrome Android).
- Resetar `expanded = false` ao trocar de cliente e ao fechar.

### `src/components/ui/sheet.tsx` (ajuste pontual)

- Permitir prop opcional `overlayClassName` em `SheetContent` para que a Captação consiga deixar o overlay clicável-através (`pointer-events-none bg-transparent`) quando estiver em modo meia-tela. Sem isso o Radix bloqueia clicks no chat.
  - Alternativa mais simples: dentro do `CaptureSheet` usar `<Dialog>` modal=false do Radix para meia-tela. Vou usar a primeira (overlayClassName) para manter a API consistente.

### Botões no header

```
[avatar] Nome do lead         [⛶ expandir] [⌄ minimizar] [✕ fechar]
```

Quando `expanded === true` o ícone vira `Minimize2` e o tooltip vira "Recolher".

## Fora de escopo

- Lógica de envio de passos, OCR, A/B/C — sem mudanças.
- Layout da aba "Ficha" — segue como está, só herda a altura nova.
- Desktop continua igual (sheet de fundo já usa `h-[100dvh]` e não atrapalha — manter `md:` no estado expandido por padrão? Não, vou manter o mesmo comportamento mobile/desktop, simplifica).

## Validação

1. Mobile 390x844: abrir Captação → sheet ocupa ~60% inferior, chat e input do WhatsApp visíveis em cima e clicáveis.
2. Clicar no botão ⛶ → vira tela cheia. Clicar de novo → volta pra meia-tela.
3. Clicar em ⌄ → vira barrinha de 44px no rodapé. Tocar nela → volta pro último estado (meia-tela).
4. Testar em 320x568 (iPhone SE) e 360x800 (Android pequeno): sem corte do botão FINALIZAR, footer respeita safe-area.
5. Trocar de cliente reseta o estado pra meia-tela.