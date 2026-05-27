# Requirements Document

## Introduction

Adicionar uma **visualização em diagrama (canvas tipo Typebot/n8n)** ao editor de fluxo de conversação existente em `/admin/fluxo` (`src/pages/FluxoBuilder.tsx`), coexistindo com a lista vertical drag-and-drop atual. O diagrama exibe os passos do `bot_flow_steps` como nós conectados, mostrando transições explícitas, fallback, sequência por posição, botões interativos do WhatsApp e pontos onde a IA (Gemini) toma decisões. Os dois modos (lista e diagrama) compartilham o mesmo dado e qualquer edição reflete em tempo real no outro modo.

O objetivo é reduzir a carga cognitiva ao trabalhar com fluxos longos (38 ou mais passos) e múltiplas variantes A/B/C/D/E, sem alterar o engine de runtime nem quebrar compatibilidade com os provedores Whapi e Evolution API. A funcionalidade deve ser usável tanto por administradores técnicos quanto por consultores menos técnicos.

## Glossary

- **Sistema**: Conjunto do painel React + Vite + TypeScript + Shadcn/ui, banco PostgreSQL via Supabase e Edge Functions Deno que compõem o ayla-magic-mirror
- **Editor_de_Fluxo**: Página `/admin/fluxo` (`FluxoBuilder.tsx`) que permite ao consultor montar o fluxo de conversação do bot
- **Modo_Lista**: Visualização atual em lista vertical drag-and-drop com cards (`StepCard.tsx`) e linhas de conexão indentadas
- **Modo_Diagrama**: Nova visualização em canvas livre baseada em React Flow (`@xyflow/react`), com nós e arestas posicionáveis
- **Diagrama**: Componente React Flow que renderiza o canvas do Modo_Diagrama
- **No_Diagrama**: Representação visual de um registro `bot_flow_steps` no Diagrama, equivalente a um `StepCard` da lista
- **Aresta**: Conexão visual entre dois Nós_Diagrama representando uma transição, fallback ou sequência por posição
- **Passo**: Registro da tabela `bot_flow_steps` (id, position, step_type, step_key, title, message_text, transitions, captures, fallback, etc.)
- **Transition**: Item do array jsonb `bot_flow_steps.transitions` no formato `{ trigger_phrases, trigger_intent, goto_step_id, goto_special }`
- **Fallback**: Conteúdo do campo jsonb `bot_flow_steps.fallback` no formato `{ mode: "repeat" | "goto" | "ai_answer" | "ai_limit", goto_step_id?, ai_prompt?, max_questions?, then? }`
- **Goto_Special**: Destino especial de uma Transition (`"cadastro" | "humano" | "repeat"`) que não aponta para outro Passo do mesmo fluxo, conforme valores reconhecidos pelo runtime atual (`evolution-webhook/handlers/conversational/index.ts` e `whapi-webhook/handlers/conversational/index.ts`)
- **Sequencia_Por_Posicao**: Próximo Passo seguido pelo runtime quando não há Transition correspondente nem Fallback do tipo `goto`, determinado por `position + 1` entre passos com `is_active = true`
- **Botao_Interativo**: Botão definido em `captures._buttons` no formato `{ id, title }`, enviado ao usuário via Whapi (interactive `quick_reply`) ou Evolution API (`message/sendButtons`); ambos os adapters declaram `maxButtons = 3` em `_shared/channels/{whapi,evolution}.ts`
- **Passo_IA**: Passo cuja decisão de próximo passo depende da IA (Gemini), classificado por `isAiAnswerStep()` definido em `flow-builder/flowTypes.ts` (retorna `true` quando `slot_key === "esclarecer_duvidas"` ou quando `slot_key`/`step_key` contém `"duvid"` exceto literalmente `"duvidas_pos_club"`)
- **Passo_OCR**: Passo que processa imagem via Gemini Vision (`isOcrStep()` retorna `"conta"` ou `"documento"`), classificado pelo `step_type` igual a `capture_conta`/`capture_documento` ou pelo `step_key` contendo `conta`/`fatura`/`luz`/`document`/`rg`/`cnh`
- **Trigger_Determinístico**: Transition cujo `trigger_intent` pertence ao conjunto reconhecido pelo runtime sem invocar IA: `"default"`, `"palavra_chave"`, `"media_received"`, ou cujas `trigger_phrases` casam por igualdade textual normalizada com a entrada do lead
- **Trigger_Semantico**: Transition cujo `trigger_intent` é não-vazio e não pertence ao conjunto Trigger_Determinístico, sendo resolvido em runtime por classificação semântica via Gemini (visto em `flow-router.ts` e nos handlers conversational)
- **Variante**: Letra A/B/C/D/E de teste A/B associada a um `bot_flows.variant`; o Diagrama exibe uma única Variante por vez
- **Layout**: Conjunto de coordenadas `{x, y}` por Passo no Diagrama, mais zoom e pan do canvas
- **Auto_Layout**: Algoritmo dagre (primário) ou elkjs (alternativo) que calcula posições iniciais dos Nós_Diagrama em direção horizontal (`rankdir = "LR"`) com espaçamento de 80 px horizontal e 60 px vertical, expressos em coordenadas do canvas (px no espaço pré-zoom)
- **Funil_Metricas**: Dados expostos pela view `v_flow_step_funnel` (taxa de abandono, confiança média da IA, tempo médio por passo) usados como sobreposição opcional nos Nós_Diagrama
- **Inspector**: Componente `StepInspector` (Sheet lateral) já existente que edita o Passo selecionado em detalhe
- **Toggle_Modo**: Controle no header do Editor_de_Fluxo que alterna entre Modo_Lista e Modo_Diagrama
- **Aresta_Solida**: Aresta que representa uma Transition explícita com `goto_step_id` ou `goto_special` resolvido e `trigger_intent` Trigger_Determinístico
- **Aresta_Tracejada**: Aresta cor âmbar que representa um Fallback do tipo `goto`
- **Aresta_Pontilhada**: Aresta cor cinza que representa Sequencia_Por_Posicao (sem Transition explícita aplicável)
- **Aresta_Erro**: Aresta cor vermelha que representa Transition ou Fallback `goto` com destino removido ou inativo
- **Aresta_IA**: Aresta cor roxa com tracejado curto que representa Transition Trigger_Semantico ou Fallback com `mode = "ai_answer"` ou `mode = "ai_limit"`
- **No_Terminal**: Nó sintético do diagrama que representa um destino `goto_special`; existem três Nós_Terminais por Variante: 📝 Cadastro (`goto_special = "cadastro"`), 👤 Humano (`goto_special = "humano"`), 🔁 Repetir (`goto_special = "repeat"`); Nós_Terminais não correspondem a registros de `bot_flow_steps`
- **ConsultantSlug**: Identificador URL-safe do Consultor usado no nome de arquivos exportados, derivado em ordem: (1) `consultants.slug` quando preenchido, (2) `consultants.name` aplicado a normalização Unicode NFD removendo acentos, convertido para minúsculas e substituindo qualquer caractere fora de `[a-z0-9]` por `-` com colapso de hífens consecutivos e remoção de hífens nas extremidades, (3) os 8 primeiros caracteres do `consultants.id` quando os dois anteriores resultam em string vazia
- **Consultor**: Usuário autenticado dono do `bot_flows` em edição
- **Persistencia_Layout**: Armazenamento das coordenadas manuais dos Nós_Diagrama no banco, em coluna `layout` jsonb adicionada à tabela `bot_flow_steps`
- **Hardware_Referencia**: Estação desktop com CPU de 4 núcleos a 2,0 GHz ou superior, 8 GB de RAM ou mais, navegador Chromium moderno (Chrome/Edge última versão estável) e tela 1920×1080 ou maior

## Requirements

### Requirement 1: Alternância entre Modo Lista e Modo Diagrama

**User Story:** Como Consultor editando um fluxo, quero alternar entre visualização em lista e em diagrama no mesmo header, para escolher a representação que melhor se adapta à tarefa atual sem perder o contexto.

#### Acceptance Criteria

1. O Editor_de_Fluxo DEVE exibir um Toggle_Modo no header com exatamente duas opções mutuamente exclusivas rotuladas "Lista" e "Diagrama", com uma e apenas uma opção marcada como ativa a qualquer momento.
2. QUANDO o Consultor seleciona "Diagrama" no Toggle_Modo, O Editor_de_Fluxo DEVE substituir a área principal pelo Modo_Diagrama em até 500 ms, mantendo visíveis e inalterados o mesmo header, a mesma `VariantDistributionBar` e o mesmo Inspector.
3. QUANDO o Consultor seleciona "Lista" no Toggle_Modo, O Editor_de_Fluxo DEVE restaurar a visualização em lista vertical drag-and-drop em até 500 ms, preservando o Passo selecionado (`selectedId`), a Variante em edição e a posição de rolagem da lista anteriores à última troca para Modo_Diagrama.
4. QUANDO o Consultor seleciona uma opção do Toggle_Modo, O Editor_de_Fluxo DEVE persistir o valor escolhido (`"lista"` ou `"diagrama"`) em `localStorage` antes do fim da transição de modo.
5. QUANDO o Consultor recarrega a página, O Editor_de_Fluxo DEVE abrir no modo correspondente ao valor persistido em `localStorage` quando este for igual a `"lista"` ou `"diagrama"`, e DEVE abrir em Modo_Lista quando o valor estiver ausente, vazio ou for diferente desses dois valores.
6. O Editor_de_Fluxo DEVE manter inalterados o Passo selecionado (`selectedId`) e o estado do Inspector (`inspectorId`) ao alternar entre Modo_Lista e Modo_Diagrama, sem fechar o Inspector nem limpar a seleção.
7. SE o acesso ao `localStorage` falhar ao ler ou gravar a preferência de Toggle_Modo, ENTÃO O Editor_de_Fluxo DEVE aplicar Modo_Lista como fallback para a sessão atual e prosseguir com a alternância em memória, sem bloquear a interação do Consultor nem exibir erro modal.

### Requirement 2: Renderização do Canvas em Diagrama

**User Story:** Como Consultor, quero visualizar todos os passos do fluxo como nós conectados em um canvas livre, para enxergar a estrutura geral e ramificações sem precisar rolar uma lista longa.

#### Acceptance Criteria

1. QUANDO o Modo_Diagrama é aberto ou os dados do fluxo são atualizados, O Modo_Diagrama DEVE renderizar exatamente um No_Diagrama para cada registro de `bot_flow_steps` da Variante em edição (incluindo Passos com `is_active = false`), suportando até 200 Nós_Diagrama por Variante.
2. Cada No_Diagrama DEVE exibir o número de posição (`position`), o emoji do `step_type` (mapeamento de `STEP_TYPE_OPTIONS`), o título (`title`) truncado em até 60 caracteres com reticências, e um trecho de até 80 caracteres do `message_text` com variáveis substituídas pelo helper `renderVarsPreview`.
3. SE `title` estiver vazio ou nulo, ENTÃO O No_Diagrama DEVE exibir o texto "sem título" no lugar do título; SE `message_text` estiver vazio ou nulo, ENTÃO o trecho de mensagem DEVE ser omitido sem espaço reservado.
4. ENQUANTO um Passo tiver `is_active = false`, O No_Diagrama correspondente DEVE ser renderizado com opacidade entre 40% e 60% (faixa "inativa") e exibir um badge com o texto "inativo".
5. QUANDO existem Passos `is_active = false` e algum outro No_Diagrama está selecionado, O Modo_Diagrama DEVE aplicar a regra de menor opacidade entre a faixa "inativa" do Critério 4 e a faixa de atenuação por seleção definida no Requisito 3.7, sem multiplicar as duas reduções.
6. O Modo_Diagrama DEVE oferecer controles de zoom com mínimo de 25%, máximo de 200% e incremento de 10% por clique.
7. O Modo_Diagrama DEVE aceitar pan via mouse (arrasto), trackpad (gesto de dois dedos) e touchpad (gesto equivalente).
8. QUANDO o Consultor aciona o controle "Centralizar", O Modo_Diagrama DEVE ajustar zoom e pan para enquadrar todos os Nós_Diagrama da Variante atual com margem mínima de 40 px (em coordenadas da viewport, pós-zoom) nas bordas da viewport visível.
9. O Modo_Diagrama DEVE oferecer um minimapa que destaca a área visível atual com um retângulo de borda contrastante, permite reposicionar a viewport ao clicar em qualquer ponto do minimapa e permite arrastar o retângulo para deslocar a viewport continuamente.
10. SE o fluxo da Variante atual não tiver nenhum Passo, ENTÃO O Modo_Diagrama DEVE exibir um estado vazio com o mesmo texto e ações usados pelo estado vazio do Modo_Lista, incluindo o atalho para adicionar o primeiro Passo.

### Requirement 3: Renderização das Arestas

**User Story:** Como Consultor, quero distinguir visualmente os tipos de conexão entre passos, para entender rapidamente o que é Transition explícita, fallback, sequência por posição e o que é destino quebrado.

#### Acceptance Criteria

1. PARA CADA Transition de um Passo com `goto_step_id` apontando para outro Passo da mesma Variante existente e com `is_active = true`, O Modo_Diagrama DEVE renderizar uma Aresta_Solida entre o No_Diagrama de origem e o de destino, rotulada com o primeiro `trigger_phrase` quando não vazio, ou com `trigger_intent` quando o array de phrases estiver vazio, ou com o literal "transition" quando ambos estiverem vazios; o rótulo DEVE ser truncado em até 40 caracteres com reticências, e ao passar o mouse o tooltip DEVE exibir o valor completo.
2. PARA CADA Transition com `goto_special ∈ {"cadastro", "humano", "repeat"}`, O Modo_Diagrama DEVE renderizar uma Aresta_Solida que termina em um No_Terminal nomeado e iconificado conforme o `goto_special` (📝 Cadastro, 👤 Humano, 🔁 Repetir); existirá exatamente um No_Terminal por valor de `goto_special` por Variante, compartilhado por todas as Transitions com aquele valor; SE uma Transition contém um valor de `goto_special` fora desse conjunto, ENTÃO O Modo_Diagrama DEVE renderizar Aresta_Erro vermelha com rótulo "goto_special inválido: {valor}" e nenhum No_Terminal novo DEVE ser criado.
3. QUANDO o Fallback de um Passo tem `mode = "goto"` e `goto_step_id` aponta para um Passo da mesma Variante existente e com `is_active = true`, O Modo_Diagrama DEVE renderizar uma Aresta_Tracejada na cor âmbar entre origem e destino, rotulada como "fallback".
4. QUANDO um Passo não tem nenhuma Transition cujo destino (`goto_step_id` ou `goto_special`) seja resolvido conforme Critério 1 ou Critério 2, e seu Fallback não é do tipo `goto` ou tem destino não resolvido, e existe um próximo Passo por Sequencia_Por_Posicao na mesma Variante, O Modo_Diagrama DEVE renderizar uma Aresta_Pontilhada cinza ligando-o a esse próximo Passo, rotulada como "sequência"; SE não existir próximo Passo (último da sequência), ENTÃO nenhuma Aresta_Pontilhada DEVE ser renderizada para esse Passo.
5. SE uma Transition tem `goto_step_id` apontando para um Passo removido ou com `is_active = false`, OU SE um Fallback do tipo `goto` aponta para um Passo removido ou com `is_active = false`, ENTÃO O Modo_Diagrama DEVE renderizar uma Aresta_Erro vermelha terminada em um nó-warning visível, rotulada com a mensagem do warning gerada por `useFlowValidation` truncada em até 80 caracteres com reticências e tooltip exibindo o texto completo.
6. O Modo_Diagrama DEVE expor um controle global com dois estados (visível/oculto, padrão visível) que alterna a visibilidade exclusivamente das Arestas_Pontilhadas, sem afetar Arestas_Solidas, Arestas_Tracejadas, Arestas_IA, Arestas_Erro, arestas saindo de handles de Botões_Interativos do Requisito 7.2, nem Nós_Terminais.
7. QUANDO um No_Diagrama é selecionado, O Modo_Diagrama DEVE manter as Arestas que entram ou saem dele com 100% de opacidade e atenuar as demais Arestas e Nós_Diagrama para no máximo 30% de opacidade; QUANDO a seleção é removida, O Modo_Diagrama DEVE restaurar todas as Arestas e Nós_Diagrama para 100% de opacidade; QUANDO um No_Diagrama atenuado também tem `is_active = false`, a opacidade aplicada DEVE ser a menor entre 30% e a faixa "inativa" do Requisito 2.4, conforme Requisito 2.5.
8. QUANDO existem múltiplas Transitions do mesmo Passo de origem para o mesmo Passo de destino, O Modo_Diagrama DEVE colapsar essas Transitions em uma única Aresta cuja categoria visual (Aresta_Solida ou Aresta_IA) é determinada pela Transition de menor índice no array, cujo rótulo concatena os triggers separados por vírgula respeitando o limite de 40 caracteres com reticências e tooltip com a lista completa.
9. PARA CADA No_Diagrama cuja origem ou destino tem warnings reportados por `useFlowValidation`, O No_Diagrama DEVE exibir um indicador "⚠" no canto superior esquerdo com cor destrutiva (vermelha) e tooltip ao foco ou hover por pelo menos 300 ms exibindo a lista de warnings (até 5, com indicador "+N restantes" quando houver mais), em texto em português brasileiro.

### Requirement 4: Sincronização Bidirecional de Dados com a Lista

**User Story:** Como Consultor, quero que qualquer alteração feita no diagrama apareça na lista e vice-versa em tempo real, para confiar que estou sempre vendo e editando o mesmo fluxo.

#### Acceptance Criteria

1. O Modo_Diagrama e o Modo_Lista DEVEM ler exclusivamente o mesmo array `steps` em estado React do Editor_de_Fluxo, sem caches paralelos, proveniente da consulta `select * from bot_flow_steps where flow_id = $1 order by position`.
2. QUANDO o Consultor edita um Passo no Inspector aberto a partir do Modo_Diagrama, O Sistema DEVE persistir a alteração via `update bot_flow_steps` e atualizar o array `steps` em até 1 segundo após a confirmação do banco, refletindo a mudança no Modo_Lista, no Modo_Diagrama e no `WhatsAppPreview` simultaneamente.
3. SE a operação de `update bot_flow_steps` originada pelo Inspector falhar, ENTÃO O Sistema DEVE manter o array `steps` no estado anterior, exibir mensagem de erro para o Consultor com indicação da operação falha e oferecer retry ou descartar a edição, sem propagar o estado parcial ao Modo_Lista nem ao Modo_Diagrama.
4. QUANDO o Consultor adiciona, duplica ou remove um Passo no Modo_Diagrama, O Sistema DEVE executar exatamente as mesmas operações de banco que o Modo_Lista executa hoje (`insert bot_flow_steps`, `delete bot_flow_steps`, e limpeza de `transitions` órfãs definidas como itens cujo `goto_step_id` aponta para Passos removidos).
5. SE qualquer operação de `insert`, `delete` ou limpeza de Transitions órfãs originada pelo Modo_Diagrama falhar, ENTÃO O Sistema DEVE reverter o estado local do array `steps` para o estado anterior à operação, exibir mensagem de erro identificando a operação e o Passo afetado e não atualizar o Modo_Lista nem o Modo_Diagrama com estado parcial.
6. QUANDO o Consultor altera a posição de um Passo via reorder no Modo_Lista, O Modo_Diagrama DEVE refletir a nova `position` em até 1 segundo após a confirmação do banco, sem exigir reload manual.
7. QUANDO o Consultor cria, edita ou remove uma Transition pelo Inspector ou pelo Modo_Diagrama, AS Arestas correspondentes nos dois modos DEVEM ser recalculadas em até 1 segundo após a confirmação do banco.
8. O Modo_Diagrama DEVE invocar a mesma rotina `useFlowValidation` usada pelo Modo_Lista sobre o mesmo array `steps`, e o contador de alertas exibido no header DEVE refletir o resultado dessa invocação independentemente do modo ativo.
9. QUANDO o botão "Auto-corrigir" é acionado em qualquer um dos modos, O Sistema DEVE aplicar os mesmos `autoFixablePatches` ao array `steps`; QUANDO as operações de persistência concluírem com sucesso, ambos os modos DEVEM refletir o resultado em até 1 segundo após a confirmação do banco.

### Requirement 5: Edição via Diagrama — Abrir Inspector e Reordenar

**User Story:** Como Consultor, quero poder editar um passo direto pelo diagrama sem alternar para a lista, para manter o fluxo de trabalho contínuo dentro do canvas.

#### Acceptance Criteria

1. QUANDO o Consultor clica uma vez sobre um No_Diagrama, O Modo_Diagrama DEVE marcar o Passo correspondente como `selectedId` e atualizar o painel de preview WhatsApp à direita em até 200 ms.
2. QUANDO o Consultor dá duplo-clique em um No_Diagrama, O Sistema DEVE abrir o Inspector (`StepInspector`) com o Passo correspondente carregado, com o mesmo conteúdo, mesma ordem de seções e mesmas ações habilitadas que ao clicar em "Editar" no Modo_Lista.
3. O Modo_Diagrama DEVE oferecer um menu de contexto acionável por clique direito sobre cada No_Diagrama, contendo as opções "Editar", "Duplicar", "Ativar/Desativar" e "Remover", e cada opção DEVE executar exatamente a mesma rotina equivalente do Modo_Lista, sem comportamento adicional.
4. QUANDO o Consultor escolhe "Remover" no menu de contexto, O Sistema DEVE exibir o mesmo `confirm` usado no Modo_Lista (mesmo título, mesma descrição, mesmo texto de botão e mesmo tom) antes de executar `delete from bot_flow_steps`; SE o Consultor cancelar, NENHUMA operação de banco DEVE ser executada.
5. QUANDO o Consultor aciona o botão "Adicionar passo" no Modo_Diagrama, O Sistema DEVE inserir um novo Passo com `position = max(position) + 1` usando a mesma rotina do Modo_Lista, e DEVE posicionar o novo No_Diagrama em coordenadas do canvas (px no espaço pré-zoom) dentro da viewport visível atual; O Sistema DEVE buscar uma posição com offset de pelo menos 40 px no espaço do canvas em relação a qualquer No_Diagrama existente; SE não houver área disponível na viewport visível com esse offset, ENTÃO O Sistema DEVE posicionar o novo No_Diagrama no centro da viewport visível, mesmo que isso resulte em sobreposição visual.
6. SE a operação de adição de Passo originada pelo Modo_Diagrama falhar, ENTÃO O Sistema DEVE não modificar o array `steps`, exibir mensagem de erro identificando a falha e oferecer retry, sem deixar nó-fantasma no canvas.

### Requirement 6: Edição de Transitions Arrastando Arestas

**User Story:** Como Consultor familiarizado com Typebot/n8n, quero poder arrastar uma seta de um nó para outro para criar uma transition sem abrir o Inspector, para acelerar a montagem do fluxo.

#### Acceptance Criteria

1. O Modo_Diagrama DEVE expor em cada No_Diagrama um handle de saída visualmente identificável (área de pelo menos 12×12 px) que permite iniciar o arrasto de uma nova Aresta.
2. QUANDO o Consultor arrasta uma Aresta a partir do handle de um No_Diagrama de origem e solta sobre um No_Diagrama de destino válido (mesma Variante), O Sistema DEVE abrir um popover compacto em até 200 ms posicionado próximo ao ponto de soltura, contendo um campo de texto para `trigger_phrase` (até 60 caracteres) ou um seletor de `trigger_intent` populado com a lista existente em `flowTypes` (mínimo de 5 presets) e botões "Confirmar" e "Cancelar".
3. QUANDO o Consultor confirma o popover de criação de Transition com `trigger_phrase` ou `trigger_intent` não vazio, O Sistema DEVE persistir a nova Transition no array `transitions` do Passo de origem com `goto_step_id` igual ao Passo de destino e exibir a Aresta_Solida correspondente em até 1 segundo após a confirmação do banco; SE ambos os campos estiverem vazios, ENTÃO O Sistema DEVE manter o popover aberto e exibir mensagem de validação sem persistir.
4. SE o Consultor solta a Aresta arrastada sobre o canvas vazio (não sobre um No_Diagrama nem sobre um nó-terminal especial), ENTÃO O Modo_Diagrama DEVE cancelar a operação sem persistir nada e sem abrir popover.
5. QUANDO o Consultor clica sobre uma Aresta_Solida ou Aresta_IA existente, O Modo_Diagrama DEVE exibir um popover em até 200 ms com o trigger atual editável, opção "Remover" e seletor de redirecionamento listando todos os Passos da Variante atual; SE outro popover (criação ou edição) já estiver aberto, ENTÃO O Modo_Diagrama DEVE fechar o popover anterior antes de abrir o novo, sem persistir o conteúdo do anterior.
6. QUANDO o Consultor confirma a remoção de uma Aresta via popover, O Sistema DEVE remover o item correspondente do array `transitions` do Passo de origem e persistir via `update bot_flow_steps` em até 1 segundo após a confirmação do banco.
7. SE o Consultor tenta criar uma Aresta cujo destino é o próprio Passo de origem (laço), ENTÃO O Sistema DEVE permitir a operação e renderizar uma Aresta auto-referente desenhada como loop curvo visível com diâmetro mínimo de 40 px, sem reportar warning em `useFlowValidation`.
8. O Modo_Diagrama DEVE permitir criar Arestas com destino especial `goto_special ∈ {"cadastro", "humano", "repeat"}` arrastando para o No_Terminal correspondente; QUANDO o Consultor confirma, O Sistema DEVE persistir a Transition com `goto_special` preenchido com o valor do No_Terminal, `goto_step_id = null` e o `trigger` digitado no popover; O Modo_Diagrama NÃO DEVE oferecer No_Terminal nem permitir criação de Aresta com `goto_special` fora desse conjunto.
9. SE qualquer operação de criação, edição ou remoção de Aresta originada pelo Modo_Diagrama falhar ao persistir, ENTÃO O Sistema DEVE manter o estado anterior do array `steps` e do canvas, exibir mensagem de erro identificando a operação e oferecer retry, sem deixar Aresta-fantasma renderizada.

### Requirement 7: Suporte a Botões Interativos do WhatsApp

**User Story:** Como Consultor que usa botões interativos no fluxo, quero ver no diagrama um nó visualmente diferente quando o passo envia botões e arestas saindo de cada botão para seu destino, para entender exatamente para onde cada clique do lead leva o fluxo.

#### Acceptance Criteria

1. PARA CADA Passo cujo `captures._buttons` contém entre 1 e 3 Botões_Interativos (limite efetivo para ambos os adapters Whapi e Evolution, conforme `_shared/channels/{whapi,evolution}.ts` declaram `maxButtons = 3`), O No_Diagrama DEVE exibir uma área inferior listando os títulos dos botões com cada título truncado em até 20 caracteres com reticências e tooltip exibindo o texto completo (truncamento de 20 caracteres é o mesmo aplicado pelo runtime em `applyVarsBtn(b.title).slice(0, 20)`).
2. SE o array `captures._buttons` contiver mais de 3 botões, ENTÃO O No_Diagrama DEVE exibir os 3 primeiros e um indicador de warning "mais de 3 botões — runtime usa apenas os 3 primeiros" com tooltip, refletindo o `slice(0, capabilities.maxButtons)` aplicado em `_shared/channels/dispatch-choice.ts`.
3. PARA CADA Botão_Interativo cujo `title` (comparação case-insensitive) ou `id` (comparação exata) corresponde a algum elemento de `trigger_phrases` ou ao `trigger_intent` de uma Transition do mesmo Passo, O Modo_Diagrama DEVE renderizar uma Aresta_Solida saindo do handle correspondente ao botão dentro do No_Diagrama até o Passo de destino.
4. QUANDO múltiplas Transitions correspondem ao mesmo botão, O Modo_Diagrama DEVE renderizar a Aresta para o destino da Transition de menor índice no array (mesma regra aplicada por `flow-router.ts`) e exibir indicador de warning "múltiplos destinos para o mesmo botão" no botão.
5. SE um Botão_Interativo não possui Transition correspondente, ENTÃO O No_Diagrama DEVE exibir um indicador de warning ao lado do botão com tooltip contendo exatamente a mensagem usada por `buildWarnings` no `StepCard.tsx`: `Botão "{title}" sem regra de destino`.
6. O Modo_Diagrama DEVE exibir Botões_Interativos com o mesmo conjunto de elementos visuais (handle, rótulo, indicadores de warning, área de listagem) independentemente de o canal de saída do Passo ser Whapi ou Evolution API, e NÃO DEVE ler nenhum campo do `bot_flow_steps` específico do provedor.
7. QUANDO o Consultor cria uma Aresta arrastando do handle de um Botão_Interativo até um No_Diagrama de destino válido, O Sistema DEVE persistir uma Transition com `trigger_phrases = [button.title, button.id]`, `trigger_intent = "palavra_chave"`, `goto_step_id` igual ao Passo de destino e `goto_special = null` em até 2 segundos após a confirmação do banco; este formato espelha o produzido por `StepInspector.tsx` ao mapear botão para destino, garantindo que `flow-router.ts` reconheça a regra como Trigger_Determinístico.
8. SE a operação de criação de Transition originada por arrasto de handle de botão falhar ao persistir, ENTÃO O Sistema DEVE manter o estado anterior do array `steps` e do canvas, exibir mensagem de erro identificando o botão e o destino, e oferecer retry sem deixar Aresta-fantasma renderizada.
9. O Sistema NÃO DEVE alterar o formato do payload enviado pelo runtime aos provedores Whapi e Evolution API ao introduzir o Modo_Diagrama, preservando integralmente o comportamento de `_shared/channels/dispatch-choice.ts`, `_shared/channels/whapi.ts` e `_shared/channels/evolution.ts`.

### Requirement 8: Visualização e Respeito da Decisão da IA

**User Story:** Como Consultor, quero identificar no diagrama quais passos são decididos pela IA (Gemini) e quais são determinísticos, para confiar que o diagrama não esconde nem sobrescreve a lógica que a IA executa em runtime.

#### Acceptance Criteria

1. PARA CADA Passo classificado como Passo_IA por `isAiAnswerStep()` definido em `flow-builder/flowTypes.ts`, O No_Diagrama DEVE exibir um badge visível em qualquer zoom entre 50% e 200% com o texto "IA livre · Gemini", o ícone Sparkles e cor roxa, idêntico ao badge usado em `StepCard.tsx`, posicionado no canto superior direito do No_Diagrama.
2. QUANDO um Passo é classificado como Passo_OCR por `isOcrStep()` e tem `auto_detect_doc_type !== false`, O No_Diagrama DEVE exibir um badge "OCR conta" ou "OCR documento" conforme o retorno de `isOcrStep()`, com ícone ScanLine e cor verde.
3. SE um Passo é classificado como Passo_OCR por `isOcrStep()` e tem `auto_detect_doc_type === false`, ENTÃO O No_Diagrama DEVE exibir um badge "OCR conta (desligado)" ou "OCR documento (desligado)" com ícone ScanLine e cor cinza, distinguível visualmente do estado ativo do Critério 2.
4. PARA CADA Transition cujo `trigger_intent` é Trigger_Semantico (não vazio e fora do conjunto `{"default", "palavra_chave", "media_received"}`), OU PARA CADA Fallback com `mode ∈ {"ai_answer", "ai_limit"}`, O Modo_Diagrama DEVE renderizar a Aresta correspondente como Aresta_IA (cor roxa, tracejado curto) em vez de Aresta_Solida ou Aresta_Tracejada.
5. QUANDO o Consultor passa o mouse sobre o badge "IA livre · Gemini" e mantém por pelo menos 300 ms, O Modo_Diagrama DEVE exibir um tooltip com o `ai_prompt` configurado no `fallback` do Passo truncado em 200 caracteres com reticências "…", ou exibir o texto padrão "Sem prompt customizado" quando `ai_prompt` for nulo, vazio, string contendo apenas espaços em branco, ou quando o `fallback.mode` do Passo não for `"ai_answer"` nem `"ai_limit"`.
6. ONDE o `Funil_Metricas` da view `v_flow_step_funnel` retorna o campo `avg_confidence` para um Passo_IA, O No_Diagrama DEVE exibir o valor numérico com exatamente uma casa decimal e codificação cromática: verde quando o valor for maior ou igual a 0,8; âmbar quando o valor for entre 0,5 inclusivo e 0,79 inclusivo; vermelho quando o valor for menor que 0,5.
7. SE o `Funil_Metricas` não retorna `avg_confidence` para um Passo_IA (campo nulo, ausente, ou Variante sem dados na janela de 30 dias usada pela view), ENTÃO O No_Diagrama DEVE exibir o placeholder "—" no lugar do valor numérico, sem aplicar codificação cromática.
8. O Modo_Diagrama NÃO DEVE permitir que a edição via Diagrama de um Passo_IA modifique qualquer campo do `bot_flow_steps` que não seja editável pelo `StepInspector` atual; SE a interface tentar enviar um campo fora desse conjunto, ENTÃO O Sistema DEVE rejeitar a operação e exibir indicação de erro ao Consultor.
9. QUANDO um Passo possui simultaneamente Transitions Trigger_Determinístico e Trigger_Semantico que poderiam levar a destinos diferentes, O Modo_Diagrama DEVE renderizar as Arestas Trigger_Determinístico (Aresta_Solida) com peso de linha pelo menos 2 vezes maior que as Arestas Trigger_Semantico (Aresta_IA) e renderizá-las com z-order superior, refletindo a precedência aplicada por `flow-router.ts` (que tenta `trigger_phrases` literais antes de Trigger_Semantico).

### Requirement 9: Métricas de Funil Sobrepostas nos Nós

**User Story:** Como Consultor, quero ativar uma camada de métricas de funil sobre o diagrama, para identificar visualmente onde os leads abandonam o fluxo ou onde a IA tem baixa confiança.

#### Acceptance Criteria

1. O Modo_Diagrama DEVE oferecer um Toggle "Métricas" no header do canvas com dois estados (ligado/desligado) e estado padrão desligado.
2. QUANDO o Toggle "Métricas" passa para ligado, O Modo_Diagrama DEVE consultar a view `v_flow_step_funnel` filtrando por `consultant_id` da Variante atual em até 2 segundos.
3. O Modo_Diagrama DEVE exibir, próximo ao Toggle "Métricas", um indicador informativo "últimos 30 dias" refletindo a janela aplicada pela view (`WHERE t.created_at > now() - interval '30 days'`).
4. QUANDO a consulta a `v_flow_step_funnel` retorna `abandonment_rate_pct` para um No_Diagrama (correspondência por `step_key`), O No_Diagrama DEVE exibir a taxa em percentual com exatamente uma casa decimal (faixa válida de 0,0% a 100,0%) enquanto o Toggle "Métricas" estiver ligado.
5. QUANDO a consulta retorna `avg_confidence` para um Passo_IA, O No_Diagrama DEVE exibir o valor adicional com codificação cromática conforme Requisito 8.6 enquanto o Toggle "Métricas" estiver ligado.
6. QUANDO a consulta retorna `avg_duration_ms` para um Passo, O No_Diagrama DEVE exibir o tempo convertido para segundos (`avg_duration_ms / 1000`) com exatamente uma casa decimal (mínimo 0,0 s) enquanto o Toggle "Métricas" estiver ligado.
7. SE a consulta a `v_flow_step_funnel` falha com erro de rede ou banco, ENTÃO O Modo_Diagrama DEVE renderizar todos os Nós_Diagrama sem indicadores de métrica, exibir notificação não modal informando a falha em até 1 segundo e manter o Toggle "Métricas" no estado ligado para permitir nova tentativa.
8. SE a consulta a `v_flow_step_funnel` retorna sucesso mas sem linha para um Passo específico (Passo sem `step_key`, Passo sem decisões na janela de 30 dias, ou `step_key` ausente da view), ENTÃO O No_Diagrama desse Passo DEVE renderizar normalmente sem indicadores de métrica e sem mensagem de erro.
9. QUANDO o Consultor troca de Variante pela `VariantDistributionBar` enquanto o Toggle "Métricas" está ligado, O Modo_Diagrama DEVE recarregar as métricas para a nova Variante em até 2 segundos.
10. O Modo_Diagrama DEVE oferecer um botão "Atualizar métricas" que dispara nova consulta a `v_flow_step_funnel` somente quando acionado, sem polling automático em segundo plano.

### Requirement 10: Auto-Layout Inicial e Persistência de Posições Manuais

**User Story:** Como Consultor abrindo o diagrama pela primeira vez em um fluxo de muitos passos, quero ver um layout legível automaticamente e poder ajustar manualmente as posições dos nós para refletir a topologia real.

#### Acceptance Criteria

1. QUANDO o Modo_Diagrama é renderizado e nenhum Passo da Variante atual tem Layout salvo, O Sistema DEVE executar Auto_Layout em direção horizontal (`rankdir = "LR"`) com dagre como algoritmo primário e elkjs como alternativo, usando espaçamento de 80 px horizontal e 60 px vertical (em coordenadas do canvas, pré-zoom), e DEVE usar as coordenadas calculadas como posição inicial dos Nós_Diagrama.
2. O Sistema DEVE posicionar os três Nós_Terminais (📝 Cadastro, 👤 Humano, 🔁 Repetir) em uma coluna fixa à direita do conteúdo do Auto_Layout, com x igual a `max(x_passo) + 240` e y distribuído com espaçamento vertical de 100 px começando em y igual a `min(y_passo)`; Nós_Terminais NÃO DEVEM ter coordenadas persistidas em `bot_flow_steps.layout` (são sintéticos).
3. ENQUANTO o Consultor arrasta um No_Diagrama, O Modo_Diagrama DEVE atualizar a posição local em até 100 ms a cada movimento do cursor.
4. QUANDO o Consultor solta o No_Diagrama (release do drag), O Sistema DEVE persistir a coordenada final via `update bot_flow_steps.layout` aplicando debounce de 500 ms; SE o Consultor inicia um novo drag do mesmo nó antes do debounce expirar, ENTÃO o timer DEVE ser reiniciado e somente a coordenada do último release DEVE ser persistida.
5. O Sistema DEVE persistir a Persistencia_Layout na coluna `layout` jsonb da tabela `bot_flow_steps` no formato `{"x": number, "y": number}` por Passo, com `x` e `y` no intervalo `[-100000, 100000]`; valores fora desse intervalo, NaN, Infinity ou tipos não-numéricos DEVEM ser tratados como inválidos.
6. QUANDO o Consultor recarrega o Modo_Diagrama, O Sistema DEVE ler a coluna `layout` de cada Passo e usar os valores salvos como posições iniciais sempre que `{x, y}` for válido conforme Critério 5.
7. SE o valor de `layout` está ausente, nulo ou inválido para um Passo específico, ENTÃO O Sistema DEVE aplicar Auto_Layout apenas para esse Passo, preservando as posições válidas dos demais.
8. QUANDO o Consultor reordena um Passo no Modo_Lista (alteração apenas de `position`), O Sistema NÃO DEVE alterar nem invalidar o valor de `layout` desse Passo nem dos demais; o Auto_Layout NÃO DEVE ser reaplicado por consequência de mudança de `position`.
9. QUANDO o Consultor aciona o botão "Reorganizar automaticamente", O Modo_Diagrama DEVE exibir modal com botões "Confirmar" e "Cancelar" e mensagem indicando que as posições manuais da Variante atual serão descartadas; QUANDO o Consultor confirma, O Sistema DEVE limpar os valores de `layout` (set para `null`) de todos os Passos da Variante em uma única transação `update bot_flow_steps set layout = null where flow_id = $1` e reaplicar Auto_Layout; QUANDO o Consultor cancela, NENHUMA alteração DEVE ser persistida.
10. SE a transação do Critério 9 falhar parcialmente ou totalmente, ENTÃO O Sistema DEVE reverter o estado local para o último Layout válido conhecido, exibir mensagem de erro identificando o "Reorganizar automaticamente" como operação falha e oferecer retry, sem deixar a Variante em estado de Layout misto.
11. QUANDO um Passo é criado pelo Consultor pelo Modo_Diagrama, O Sistema DEVE inicializar `layout` com a coordenada onde o nó foi inserido visualmente.
12. QUANDO um Passo é criado pelo Consultor pelo Modo_Lista, O Sistema DEVE deixar `layout` nulo para que o próximo render do Modo_Diagrama aplique Auto_Layout apenas ao Passo novo.
13. SE a operação de `update bot_flow_steps.layout` para um único nó (Critério 4) falhar com erro de rede ou banco, ENTÃO O Sistema DEVE preservar o estado local da posição arrastada, exibir indicador de falha e tentar novamente respeitando o debounce de 500 ms até obter sucesso ou até o Consultor sair da página.
14. O Sistema DEVE manter o zoom (no intervalo `[0,25, 2,0]`) e o pan do canvas em `localStorage` por par `(consultantId, variant)`, sem persistir esses valores no banco.

### Requirement 11: Suporte a Variantes A/B/C/D/E

**User Story:** Como Consultor que mantém múltiplas variantes do fluxo para teste A/B, quero que o diagrama mostre apenas a variante em edição, para não confundir os passos de variantes diferentes em uma mesma tela.

#### Acceptance Criteria

1. ENQUANTO o Modo_Diagrama está ativo, O Modo_Diagrama DEVE exibir exclusivamente os Passos cujo `flow_id` em `bot_flows` corresponde à Variante identificada por `editingVariant`, ocultando todos os Passos de qualquer outra Variante.
2. QUANDO o Consultor troca de Variante via `VariantDistributionBar`, O Modo_Diagrama DEVE, em até 2 segundos, descartar todos os Nós_Diagrama e Arestas atualmente renderizados, recarregar os Passos da nova Variante e aplicar o Layout salvo dessa Variante; SE a nova Variante não tem nenhum Layout salvo (todos os Passos com `layout = null`), ENTÃO O Sistema DEVE aplicar Auto_Layout conforme Requisito 10.1.
3. SE o recarregamento dos Passos da nova Variante falhar, ENTÃO O Modo_Diagrama DEVE preservar o estado anterior da tela, exibir mensagem de erro indicando falha ao carregar a Variante e oferecer ação de nova tentativa.
4. O Sistema DEVE escopar a Persistencia_Layout pelo `flow_id` da Variante em edição, garantindo que operações de salvar e carregar Layout de uma Variante não leiam nem sobrescrevam os dados de Layout de qualquer outra Variante.
5. QUANDO a Variante selecionada em `editingVariant` não possui nenhum Passo associado, O Modo_Diagrama DEVE exibir o estado vazio definido no Requisito 2.10 contendo um atalho que abre o `CreateFlowFromTemplateDialog` pré-selecionado para a Variante atual.
6. SE o Consultor tentar mover um Passo para outra Variante ou criar uma Aresta cuja origem e destino pertençam a `flow_id` distintos, ENTÃO O Modo_Diagrama DEVE rejeitar a operação, manter o estado anterior do diagrama e exibir mensagem de erro indicando que conexões entre Variantes não são permitidas.
7. O Modo_Diagrama DEVE garantir que toda Aresta persistida tenha origem e destino com o mesmo `flow_id` da Variante em edição.

### Requirement 12: Performance com Fluxos Grandes

**User Story:** Como Consultor com fluxo de 38 ou mais passos, quero que o diagrama abra e responda rapidamente, para não tornar a edição visualmente lenta.

#### Acceptance Criteria

1. ENQUANTO o Modo_Diagrama está ativo com até 200 Nós_Diagrama em Hardware_Referencia, O Sistema DEVE manter a resposta de pan, zoom e drag de nó com latência percebida abaixo de 100 ms para até 100 nós; ENTRE 101 e 200 nós, a latência percebida DEVE permanecer abaixo de 200 ms.
2. O Modo_Diagrama DEVE virtualizar a renderização de nós e arestas fora da viewport visível usando os mecanismos de viewport do React Flow, processando ativamente apenas os elementos visíveis ou parcialmente visíveis.
3. QUANDO o Modo_Diagrama é aberto pela primeira vez em uma Variante com 38 a 200 Passos em Hardware_Referencia, O Sistema DEVE concluir o primeiro render (incluindo Auto_Layout quando aplicável) em até 1500 ms, considerando que os dados de `bot_flow_steps` já estão carregados em memória.
4. ENQUANTO o Consultor arrasta um No_Diagrama continuamente, O Sistema DEVE limitar a frequência de chamadas `update bot_flow_steps.layout` a no máximo uma chamada por nó a cada 500 ms, e DEVE garantir que a coordenada final do drag seja persistida ao soltar o nó.
5. SE a Variante atual contém mais de 200 Passos, ENTÃO O Modo_Diagrama DEVE exibir um aviso visível e dispensável recomendando ao Consultor segmentar o fluxo, sem prescrever a forma exata da segmentação.
6. ENQUANTO o aviso de mais de 200 Passos do Critério 5 está visível, O Modo_Diagrama DEVE continuar renderizando todos os Nós_Diagrama e permitindo todas as interações suportadas (pan, zoom, drag, abrir Inspector, criar Aresta, exportar), sem bloquear o canvas.

### Requirement 13: Tratamento de Loops e Ciclos

**User Story:** Como Consultor, quero ver claramente quando o fluxo tem ciclos (passos que voltam para passos anteriores), para identificar potenciais loops infinitos ou padrões intencionais como "esclarecer dúvidas".

#### Acceptance Criteria

1. O Modo_Diagrama DEVE renderizar Arestas que apontam para Passos com `position` menor com curvatura suficiente para que o caminho desenhado não cruze visualmente o No_Diagrama de origem nem o de destino, mantendo distância mínima de 20 px do contorno de cada nó.
2. QUANDO o Consultor passa o mouse sobre qualquer No_Diagrama que pertence a pelo menos um ciclo no grafo de transitions explícitas (origem → ... → origem usando apenas Arestas_Solidas) com até 50 Passos no ciclo, O Modo_Diagrama DEVE realçar visualmente todos os Nós_Diagrama do ciclo em até 200 ms com indicador "ciclo".
3. QUANDO o Consultor cria ou edita uma Aresta auto-referente (Passo apontando para si mesmo), O Sistema DEVE persistir a Aresta normalmente e `useFlowValidation` NÃO DEVE reportar essa Aresta como erro nem como warning.
4. O Sistema NÃO DEVE bloquear a criação, persistência ou execução em runtime de ciclos, sejam eles auto-referentes ou multi-nó, em nenhum dos modos do Editor_de_Fluxo.
5. SE um grafo da Variante atual contém mais de 50 ciclos distintos detectados, ENTÃO O Modo_Diagrama DEVE limitar o realce visual descrito no Critério 2 aos primeiros 50 ciclos por ordem de detecção e exibir indicador informativo de que ciclos adicionais existem mas não estão visualmente destacados.

### Requirement 14: Acessibilidade e Internacionalização

**User Story:** Como Consultor que utiliza recursos de acessibilidade ou navega por teclado, quero conseguir operar o diagrama sem mouse e com leitor de tela, para garantir uso inclusivo do editor.

#### Acceptance Criteria

1. CADA No_Diagrama DEVE ser focalizável via tecla `Tab`, na ordem crescente de `position`, com indicador de foco visível e contraste mínimo de 3:1 contra o fundo do canvas.
2. QUANDO um No_Diagrama está focado e o Consultor pressiona `Enter`, O Modo_Diagrama DEVE marcar o Passo correspondente como `selectedId` em até 200 ms, equivalente ao clique único.
3. QUANDO um No_Diagrama está focado e o Consultor pressiona `F2` ou dá duplo-clique, O Sistema DEVE abrir o Inspector com o Passo correspondente carregado em até 200 ms.
4. ENQUANTO um No_Diagrama está focado e o Consultor pressiona uma tecla de seta, O Modo_Diagrama DEVE mover o foco para o No_Diagrama mais próximo na direção pressionada, definido como o nó cujo centro geométrico está dentro de um cone de 90° na direção pressionada e tem a menor distância euclidiana ao centro do nó atual.
5. SE não existe nenhum No_Diagrama na direção pressionada (cone vazio), ENTÃO o foco DEVE permanecer no No_Diagrama atual.
6. CADA No_Diagrama DEVE expor `role="button"` e `aria-label` em português brasileiro no formato "Passo {position}: {title}, tipo {step_type_label}"; SE `title` estiver vazio ou nulo, ENTÃO o aria-label DEVE usar "sem título" no lugar de `{title}`.
7. O Toggle "Métricas", o controle "Centralizar", o controle de zoom, o botão "Reorganizar automaticamente", o botão "Atualizar métricas", o botão "Exportar" e o Toggle de visibilidade de Arestas_Pontilhadas DEVEM ser focalizáveis via `Tab`, ativáveis via `Enter` ou `Espaço` e expor `aria-label` em português brasileiro descritivo da ação.
8. O Modo_Diagrama DEVE manter contraste mínimo WCAG 2.1 AA (4.5:1) entre texto dos rótulos das Arestas e o fundo do canvas, considerando os temas claro e escuro do `tailwind`.
9. TODOS os textos visíveis introduzidos pelo Modo_Diagrama (rótulos de Aresta, badges, mensagens vazias, tooltips, popovers de criação de Transition, mensagens de erro, modal de confirmação) DEVEM ser escritos em português brasileiro.

### Requirement 15: Comportamento em Telas Pequenas

**User Story:** Como Consultor, quero saber claramente que o Modo_Diagrama é desenhado para desktop, para não ficar frustrado ao tentar usá-lo em um smartphone.

#### Acceptance Criteria

1. ENQUANTO a largura da viewport for inferior a 1024 px e maior ou igual a 768 px, O Editor_de_Fluxo DEVE manter o Toggle_Modo visível com a opção "Diagrama" exibindo, ao foco ou hover por pelo menos 300 ms, um tooltip com o texto "Melhor visualização em desktop".
2. SE o Consultor seleciona "Diagrama" enquanto a largura da viewport for inferior a 768 px, ENTÃO O Modo_Diagrama DEVE entrar em modo somente leitura em até 500 ms: pan e zoom DEVEM permanecer habilitados; criar Aresta arrastando handle, arrastar No_Diagrama, abrir menu de contexto, criar/editar/remover Transition pelo canvas, "Adicionar passo" e "Reorganizar automaticamente" DEVEM ficar desabilitados.
3. ENQUANTO o Modo_Diagrama está em modo somente leitura por viewport pequena, O Modo_Diagrama DEVE exibir uma mensagem persistente e dispensável com o texto "Edição via canvas indisponível em telas estreitas — use a Lista para editar" e DEVE permitir abrir o Inspector via duplo-clique em até 200 ms.
4. QUANDO a largura da viewport cresce de menos que 768 px para 768 px ou mais enquanto o Modo_Diagrama está ativo, O Modo_Diagrama DEVE sair do modo somente leitura em até 500 ms restaurando todas as ações de edição via canvas; QUANDO a largura encolhe de 768 px ou mais para menos que 768 px, O Modo_Diagrama DEVE entrar em modo somente leitura conforme Critério 2.
5. O Modo_Lista DEVE permanecer com todas as suas funcionalidades existentes (drag-and-drop, edição via Inspector, Adicionar/Duplicar/Remover passo, preview WhatsApp) habilitadas em qualquer largura de viewport.

### Requirement 16: Exportação do Diagrama

**User Story:** Como Consultor, quero exportar o diagrama como imagem para compartilhar com a equipe ou anexar à documentação interna, para discutir alterações sem dar acesso direto ao painel.

#### Acceptance Criteria

1. ENQUANTO o Modo_Diagrama está ativo e a Variante atual contém pelo menos 1 Passo, O Modo_Diagrama DEVE exibir um botão "Exportar" no header do canvas com opções "PNG" e "SVG" habilitadas.
2. SE a Variante atual não contém nenhum Passo, ENTÃO o botão "Exportar" DEVE estar visível porém desabilitado, com tooltip ao foco ou hover indicando que não há conteúdo para exportar.
3. QUANDO o Consultor seleciona "PNG", O Sistema DEVE gerar uma imagem PNG da Variante atual contendo todos os Nós_Diagrama, Nós_Terminais e Arestas visíveis, calculando o enquadramento via `getNodesBounds()` do `@xyflow/react` e `getViewportForBounds()` com padding mínimo equivalente a 20 px na imagem final, em resolução de pelo menos 2× a viewport visível (via `pixelRatio: 2` no `html-to-image`), e iniciar download local com nome `fluxo-{ConsultantSlug}-variante-{variant}-{YYYYMMDD}.png` em até 10 segundos em Hardware_Referencia.
4. QUANDO o Consultor seleciona "SVG", O Sistema DEVE gerar um arquivo SVG equivalente com a mesma área de enquadramento e mesma margem do Critério 3 usando `html-to-image.toSvg()`, e iniciar download local com nome `fluxo-{ConsultantSlug}-variante-{variant}-{YYYYMMDD}.svg` em até 10 segundos em Hardware_Referencia.
5. O Sistema DEVE aplicar `renderVarsPreview` aos textos de `message_text` exibidos no arquivo exportado de forma idêntica à exibição no canvas, e NÃO DEVE incluir os valores brutos de variáveis substituíveis (e-mail, telefone, CPF e demais campos sensíveis) no arquivo gerado.
6. O Sistema NÃO DEVE realizar upload do arquivo exportado a nenhum servidor remoto e NÃO DEVE gerar link público compartilhável; a exportação DEVE ser exclusivamente download local pelo navegador.
7. SE a geração do arquivo falhar ou exceder 10 segundos, ENTÃO O Sistema DEVE cancelar a operação, exibir mensagem de erro identificando a falha e preservar o estado do canvas inalterado.
8. ENQUANTO a exportação está em andamento, O Modo_Diagrama DEVE exibir um indicador de progresso e DEVE bloquear novos cliques no botão "Exportar" até a conclusão ou falha.

### Requirement 17: Compatibilidade Backward com Engine de Runtime

**User Story:** Como Engenheiro de plataforma, quero garantir que a introdução do Modo_Diagrama não altera a forma como o engine de runtime lê os passos, para evitar regressões em produção nos provedores Whapi e Evolution API.

#### Acceptance Criteria

1. O Sistema NÃO DEVE alterar a estrutura, tipo, nome ou semântica das colunas existentes `transitions`, `captures`, `fallback`, `step_type`, `step_key`, `slot_key` ou `position` da tabela `bot_flow_steps`.
2. A única alteração de schema permitida por essa funcionalidade na tabela `bot_flow_steps` DEVE ser a adição da coluna nullable `layout` jsonb via migração `ALTER TABLE bot_flow_steps ADD COLUMN layout jsonb DEFAULT NULL`, e essa migração DEVE ser executável em base existente sem necessidade de backfill nem janela de manutenção.
3. O Sistema NÃO DEVE alterar o comportamento, parâmetros, retorno ou seed gerado por `seed_default_camila_flow`, nem o conteúdo dos templates expostos por `FlowTemplatesDialog` e `CreateFlowFromTemplateDialog`.
4. SE a coluna `layout` é nula para todos os Passos de uma Variante, ENTÃO o engine de runtime DEVE produzir as mesmas decisões e a mesma ordem de mensagens enviadas ao Consultor que produzia antes da introdução desta funcionalidade, dado o mesmo conjunto de eventos de entrada.
5. O Sistema NÃO DEVE adicionar novos campos a `transitions` ou `fallback` jsonb que não estejam previamente suportados pelo engine atual; o conjunto de chaves válidas em cada um desses jsonb permanece idêntico ao atual.
6. SE o Consultor abre um fluxo criado antes desta funcionalidade pela primeira vez no Modo_Diagrama, ENTÃO o Modo_Diagrama DEVE renderizar todos os Passos via Auto_Layout sem solicitar migração de dados nem alterar campos do `bot_flow_steps` que não sejam `layout`.

### Requirement 18: Preservação do Inspector e Preview WhatsApp Existentes

**User Story:** Como Consultor já familiarizado com o `StepInspector` e o `WhatsAppPreview` atuais, quero continuar usando esses componentes inalterados quando edito pelo diagrama, para não precisar reaprender a edição detalhada.

#### Acceptance Criteria

1. QUANDO o Consultor dá duplo-clique em um No_Diagrama, pressiona `F2` com nó focado ou seleciona "Editar" no menu de contexto, O Modo_Diagrama DEVE abrir o componente `StepInspector` existente recebendo as mesmas props, exibindo as mesmas seções na mesma ordem, com os mesmos campos editáveis e as mesmas ações habilitadas que ao abrir o Inspector pelo Modo_Lista.
2. ENQUANTO um No_Diagrama está marcado como `selectedId`, O Modo_Diagrama DEVE renderizar o componente `WhatsAppPreview` existente com o mesmo Passo de entrada, mesmo conteúdo e mesma ordem de elementos visuais que o Modo_Lista renderiza para a mesma seleção.
3. SE `selectedId` é nulo no Modo_Diagrama, ENTÃO o `WhatsAppPreview` DEVE exibir o mesmo estado vazio renderizado pelo Modo_Lista quando nenhum Passo está selecionado.
4. ENQUANTO o Inspector está aberto sobre o Modo_Diagrama, O Modo_Diagrama DEVE manter pan e zoom habilitados no canvas; o Sheet lateral DEVE ocupar entre 30% e 50% da largura da viewport, sem cobrir totalmente o canvas.
5. QUANDO o Consultor fecha o Inspector pelo botão de fechar, pela tecla `Esc` ou clicando fora do Sheet, O Modo_Diagrama DEVE manter a seleção atual de `selectedId` e DEVE preservar o centro e o nível de zoom da viewport sem aplicar animação de movimento.

### Requirement 19: Busca por Passo no Canvas

**User Story:** Como Consultor com fluxo de 38 ou mais passos, quero buscar um passo pelo título ou pela `step_key` direto no diagrama, para encontrar rapidamente o nó que preciso editar sem rolar o canvas.

#### Acceptance Criteria

1. O Modo_Diagrama DEVE oferecer um campo de busca no header do canvas com placeholder "Buscar por título ou step_key" e tecla de atalho `Ctrl+K` (Windows/Linux) ou `Cmd+K` (macOS) que coloca o foco no campo.
2. ENQUANTO o Consultor digita no campo de busca, O Modo_Diagrama DEVE filtrar Nós_Diagrama em até 200 ms cuja `title` ou `step_key` contém a substring digitada (comparação case-insensitive, com normalização Unicode NFD removendo acentos), realçando os nós correspondentes com borda colorida e atenuando os demais para no máximo 30% de opacidade.
3. QUANDO o Consultor pressiona `Enter` no campo de busca com pelo menos um Nó_Diagrama correspondente, O Modo_Diagrama DEVE centralizar a viewport no primeiro nó correspondente em ordem de `position` ascendente em até 500 ms, sem alterar o zoom atual.
4. QUANDO o Consultor pressiona `Enter` repetidamente com a mesma busca ativa, O Modo_Diagrama DEVE ciclar pelos nós correspondentes em ordem de `position` ascendente, retornando ao primeiro após o último.
5. QUANDO o Consultor pressiona `Esc` no campo de busca, OU QUANDO o campo de busca é esvaziado, O Modo_Diagrama DEVE restaurar a opacidade de todos os Nós_Diagrama e Arestas para 100% e remover o realce.
6. SE nenhum Nó_Diagrama corresponde à busca, ENTÃO o campo de busca DEVE exibir o texto auxiliar "Nenhum passo encontrado" e nenhum nó DEVE ser realçado nem atenuado.
