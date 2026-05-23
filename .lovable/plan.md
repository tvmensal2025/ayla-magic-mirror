## Objetivo

1. Corrigir o erro de build do `LiveConversationsPanel.tsx` (faltam entradas `D` e `E` no `Record<Variant, FlowBundle>`).
2. Ajustar o disparo manual do Fluxo D para **apenas iniciar** — sem rajada sequencial. O resto do fluxo segue automático conforme o cliente clica nos botões (lógica já existente no `whapi-webhook`).

## Passos

### 1. Fix build — LiveConversationsPanel
- Adicionar `D: { name: null, steps: [] }` e `E: { name: null, steps: [] }` nas duas inicializações (linhas 60-63 e 87-90) do `Record<Variant, FlowBundle>`.

### 2. Comportamento do Fluxo D no envio manual
Hoje `FlowQuickBar` e `ManualStepDialog` listam todos os passos da variante e o consultor escolhe qual mandar (já é 1-a-1, não em rajada). Mas o D foi pensado para ser **só iniciado**:

- Quando o consultor selecionar variante **D** nos chips:
  - `FlowQuickBar`: esconder a lista de passos e mostrar **um único botão grande "▶ Iniciar fluxo D (automático)"** que dispara o **primeiro passo ativo** (menor `position`) via `manual-step-send` com `part: "all"`. Depois disso o webhook assume.
  - `ManualStepDialog`: mesmo tratamento — auto-seleciona o primeiro passo e mostra CTA "Iniciar fluxo D".
- Mensagem auxiliar curta: *"O Fluxo D segue automático conforme o cliente responde aos botões. Você só precisa iniciar."*
- A/B/C/E mantêm o comportamento atual (lista de passos).

### 3. Sem mudanças no backend
`manual-step-send` já aceita D (corrigido no turno anterior). O `whapi-webhook/handlers/bot-flow.ts` já roteia respostas de botões pela variante do customer. Nada a alterar lá.

## Arquivos
- `src/components/admin/AIAgentTab/LiveConversationsPanel.tsx` (fix build)
- `src/components/whatsapp/FlowQuickBar.tsx` (UI condicional para D)
- `src/components/admin/AIAgentTab/ManualStepDialog.tsx` (UI condicional para D)

## Critério de sucesso
- Build limpo.
- Ao escolher chip **D** no popover de envio, o consultor vê só um botão "Iniciar fluxo D" + nota explicativa, em vez da lista de 10 passos.
- Clicar dispara o 1º passo; webhook conduz o resto automaticamente via botões.
- A/B/C/E inalterados.