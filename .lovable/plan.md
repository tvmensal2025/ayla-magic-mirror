## Problema

No modal "Enviar daqui em diante?" (e nos diálogos vizinhos do `FlowQuickBar`), a lista de 10 passos em accordion estoura a tela, exigindo scroll pesado para chegar até o botão "Enviar sequência". Os botões de ação ficam fora do viewport e o visual é denso/cinza.

## Escopo (somente UI)

Arquivo único: `src/components/whatsapp/FlowQuickBar.tsx`

Sem mudanças em lógica de envio, edge functions, banco ou contratos de dados.

## Mudanças propostas

### 1. Layout do diálogo "Enviar daqui em diante" (sticky footer + lista rolável interna)
- `DialogContent` passa a usar grid de 3 linhas: header / lista / footer, com `max-h-[90vh]` e `p-0` para colar o footer no fundo.
- Header com gradiente sutil verde (token `primary`) + ícone `FastForward` em chip; mostra "X de Y passos" e nome do lead em destaque.
- Lista (accordion) vira o único bloco `overflow-y-auto` com `min-h-0`, dentro do grid — assim o footer fica sempre visível independentemente do número de passos.
- Footer sticky com `border-t`, fundo `bg-card`, botões "Cancelar" (ghost) à esquerda e "Enviar sequência" (primary, full-height) à direita, padding consistente. Em telas estreitas (≤640px) os botões viram `flex-col` full-width.

### 2. Densidade e hierarquia dos itens
- AccordionItem mais compacto: altura ~40px, número do passo dentro de um chip circular `bg-primary/10 text-primary`, título com truncamento e tooltip.
- Badge de "N partes" passa a usar ícone (texto/áudio/vídeo/imagem) com contagem agregada por tipo, em vez de "1 parte".
- Estado expandido com `bg-muted/30` para reforçar o foco.

### 3. Modal "Pré-visualizar antes de enviar" (mesmo padrão)
- Mesmo grid sticky (header/scroll/footer) e mesmo header com chip de ícone `Eye`.
- Cards de partes ganham borda mais suave (`border-border/60`) e leve sombra (`shadow-sm`).

### 4. Popover de seleção de passos
- Aumenta `w-80` → `w-[22rem]`; lista interna `max-h-72` → `max-h-[50vh]` para evitar corte em telas curtas.
- Linha de cada passo com chip numérico igual ao accordion (consistência visual).
- Rodapé do popover com legenda de ícones mais clara (chips ao invés de texto solto).

### 5. Tokens e responsividade
- Todas as cores via tokens (`primary`, `muted`, `card`, `border`, `destructive`) — sem hex novos.
- Breakpoint mobile: padding reduzido, fontes mantidas, botões full-width no footer.
- Sem alterar comportamento de envio nem dependências.

## Fora de escopo
- Nenhuma mudança no `manual-step-send`, `whapi-webhook`, no preview de mídia (`StepPartPreview`) ou no `ManualStepDialog`.
- Nenhum ajuste de cópia além de pequenos ajustes de microtexto se necessário.
