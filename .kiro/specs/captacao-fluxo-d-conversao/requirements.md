# Requirements Document

## Introduction

Esta feature reúne quatro frentes complementares que aumentam a conversão de leads vindos de Meta Ads no sistema iGreen:

1. **Captação otimizada com Fluxo D**: consolidar Fluxo D (botões, sem áudio, ritmo rápido) como o caminho de conversão pura, com template "Captação Meta Ads" pronto no editor visual e cascata correta do OCR ao portal.
2. **Simulador embutido no editor de fluxos**: tela onde o consultor "roda" um lead fake antes de salvar/publicar, validando transições, loops e botões sem enviar nada via WhatsApp real.
3. **Tracking detalhado de campanhas Meta Ads**: painel campanha → leads → conversões → CAC, com cadastro manual + import via Meta Marketing API e match preciso por `initial_message`.
4. **Painel de Reaquecimento (24h+)**: lista de leads parados há mais de 24h em algum passo, com edição e envio manual ou em lote da mensagem de reaquecimento, templates por passo e tracking do resultado.

A feature deve preservar a compatibilidade com Fluxos A/B/C e o `capture_mode='manual'` que é default. Está fora de escopo: alterações no pipeline determinístico (`bot-flow.ts`), webhooks (`evolution-webhook`, `whapi-webhook`), OCR e billing.

## Glossary

- **Fluxo_D**: Variante de fluxo de captação por botões, sem áudio, ritmo rápido, voltada à conversão pura. Já existe via `seed_flow_d()` com 8 passos (welcome, captura conta, como funciona, resultado, captura documento, dúvidas, handoff, finalizar).
- **Editor_de_Fluxos**: Página `/admin/fluxos` (componente `FluxoBuilder`) onde o consultor monta visualmente os passos do bot.
- **Template_Captacao_Meta**: Template novo do `FlowTemplatesDialog` que cria um Fluxo D completo otimizado para anúncios Meta Ads (welcome com botão "Quero simular" → captura conta → OCR → simulação com economia → CTA "Finalizar" → captura documento → finalizar portal).
- **Simulador_de_Fluxo**: Componente novo, acessível por botão "🎬 Testar fluxo" no header do `FluxoBuilder`, que executa o fluxo localmente sem enviar mensagens via WhatsApp.
- **Lead_Fake**: Conjunto de dados em memória usado pelo Simulador_de_Fluxo (nome, telefone, valor de conta, etc.) para emular um cliente sem persistir no banco.
- **Motor_de_Fluxo**: Lógica de transição entre passos que recebe um passo atual + entrada do lead e retorna o próximo passo + mídia/mensagem a exibir, sem efeitos colaterais externos.
- **Painel_Meta_Ads**: Aba do `/admin/ads` (`AdsCentralTab`) que mostra métricas por campanha: leads recebidos, conversões, CAC.
- **Campanha_Meta**: Registro em `facebook_campaigns` representando uma campanha do Meta Ads (campaign_id, nome, initial_message, custo).
- **Match_de_Campanha**: Atribuição de um lead a uma `Campanha_Meta` via `customers.source_campaign_id`, baseada em `externalAdReply.ctwaClid` (Evolution payload) ou comparação da primeira mensagem do lead com `facebook_campaigns.initial_message`.
- **CAC**: Custo de Aquisição de Cliente, calculado por `total_gasto_campanha / total_leads_convertidos` para uma `Campanha_Meta` em um intervalo de datas.
- **Lead_Parado**: Lead cuja coluna `customers.conversation_step` não mudou nas últimas 24 horas (ou mais), com `status` ainda em qualificação (não `approved`, não `cancelled`).
- **Painel_de_Reaquecimento**: Página/aba nova que lista `Lead_Parado` com paginação, agrupados por `conversation_step`, e permite envio de mensagem de reaquecimento.
- **Template_de_Reaquecimento**: Mensagem reutilizável associada a um `conversation_step` específico (ex: msg X para `aguardando_conta`, msg Y para `aguardando_doc`).
- **Envio_em_Lote**: Operação que envia o `Template_de_Reaquecimento` correspondente a múltiplos `Lead_Parado` selecionados de uma vez, respeitando o intervalo entre envios da Evolution_API.
- **Resultado_de_Reaquecimento**: Registro de tracking que indica, para cada envio, se o lead respondeu, avançou de passo, ou abandonou após 7 dias.
- **Consultor**: Usuário autenticado dono dos leads e campanhas. Cada consultor vê apenas seus próprios dados (multi-tenant via RLS).

## Requirements

### Requirement 1: Template "Captação Meta Ads" no editor de fluxos

**User Story:** Como consultor, quero aplicar um template "Captação Meta Ads" no editor de fluxos, para que eu tenha um Fluxo_D otimizado para anúncios pronto em um clique.

#### Acceptance Criteria

1. THE Editor_de_Fluxos SHALL exibir o Template_Captacao_Meta na lista do `FlowTemplatesDialog` com nome único de até 60 caracteres, descrição de até 200 caracteres e emoji distinto dos demais templates.
2. WHEN o Consultor aplica o Template_Captacao_Meta a um fluxo da variante D, THE Editor_de_Fluxos SHALL inserir os passos nesta ordem: (1) welcome com botão "Quero simular", (2) captura conta de luz, (3) simulação com economia, (4) captura documento, (5) finalizar portal.
3. WHEN o Template_Captacao_Meta é aplicado, THE Editor_de_Fluxos SHALL gerar pelo menos 1 botão CTA por passo `message` posicionado entre `capture_conta` e `capture_documento`, com label de até 40 caracteres e `next_step_id` apontando para um passo existente do fluxo.
4. WHEN o Consultor aplica o Template_Captacao_Meta a um fluxo de variante diferente de D, THE Editor_de_Fluxos SHALL exibir um diálogo de confirmação com as opções "Prosseguir" e "Cancelar".
5. IF o Consultor escolhe "Cancelar" no diálogo de confirmação, THEN THE Editor_de_Fluxos SHALL manter o fluxo inalterado, sem inserir nenhum passo novo.
6. WHEN o Consultor aplica o Template_Captacao_Meta, THE Editor_de_Fluxos SHALL preservar todos os passos existentes do fluxo e anexar os novos passos a partir da próxima posição livre.
7. WHEN a aplicação do Template_Captacao_Meta é concluída, THE Editor_de_Fluxos SHALL executar `useFlowValidation` no fluxo resultante e SHALL garantir zero erros do tipo `conversion_step_no_cta`.

### Requirement 2: Cascata correta do Fluxo D após OCR

**User Story:** Como lead que veio de anúncio, quero que o bot continue conversando comigo após o OCR ler minha conta, para que eu termine o cadastro sem ficar parado.

#### Acceptance Criteria

1. WHEN o OCR conclui com sucesso a leitura da conta de luz de um Lead em Fluxo_D, THE Sistema SHALL avançar `customers.conversation_step` para o passo de resultado da simulação dentro do mesmo fluxo em até 5 segundos.
2. WHEN o passo de resultado da simulação é exibido, THE Sistema SHALL incluir no mínimo 3 botões CTA clicáveis ("Cadastrar agora", "Tenho dúvidas", "Falar com humano") configurados no passo.
3. WHEN o Lead clica em "Cadastrar agora" no passo de resultado, THE Sistema SHALL atualizar `customers.conversation_step` para `capture_documento` em até 5 segundos.
4. WHEN o passo `capture_documento` recebe o documento e o OCR conclui com sucesso, THE Sistema SHALL atualizar `customers.conversation_step` para `finalizar_cadastro` em até 5 segundos.
5. IF a transição entre dois passos consecutivos do Fluxo_D não ocorre em até 30 segundos após a entrada do Lead, THEN THE Sistema SHALL registrar um alerta em `bot_handoff_alerts` com tipo `flow_d_stuck`, `customer_id` do Lead e `conversation_step` atual.
6. IF o OCR da conta de luz falha em um Lead em Fluxo_D, THEN THE Sistema SHALL manter `customers.conversation_step` no passo de captura da conta e SHALL registrar um alerta em `bot_handoff_alerts` com tipo `flow_d_ocr_failed_bill`.
7. IF o OCR do documento falha no passo `capture_documento`, THEN THE Sistema SHALL manter `customers.conversation_step` em `capture_documento` e SHALL registrar um alerta em `bot_handoff_alerts` com tipo `flow_d_ocr_failed_doc`.
8. THE Sistema SHALL preservar o comportamento atual dos Fluxos A, B e C sem alterações de schema ou lógica de transição.

### Requirement 3: Acesso ao simulador no editor de fluxos

**User Story:** Como consultor, quero abrir um simulador a partir do editor de fluxos, para que eu possa testar o fluxo antes de publicar.

#### Acceptance Criteria

1. WHILE a página `/admin/fluxos` está carregada, THE Editor_de_Fluxos SHALL exibir um botão rotulado "🎬 Testar fluxo" no header.
2. WHEN o Consultor clica no botão "🎬 Testar fluxo" e o fluxo tem ao menos 1 passo, THE Editor_de_Fluxos SHALL abrir o Simulador_de_Fluxo em um modal sobreposto em até 2 segundos, sem perder o estado de edição não salvo.
3. WHILE o fluxo em edição não tem nenhum passo definido, THE Editor_de_Fluxos SHALL desabilitar o botão "🎬 Testar fluxo" e impedir cliques.
4. WHEN o Consultor passa o cursor sobre o botão "🎬 Testar fluxo" desabilitado por mais de 500 ms, THE Editor_de_Fluxos SHALL exibir um tooltip explicando que é necessário ao menos um passo no fluxo.
5. WHEN o Consultor fecha o Simulador_de_Fluxo, THE Editor_de_Fluxos SHALL retornar ao estado anterior em até 2 segundos, preservando passos, conexões e configurações não salvos.
6. IF o Simulador_de_Fluxo falha em carregar em até 10 segundos após o clique no botão "🎬 Testar fluxo", THEN THE Editor_de_Fluxos SHALL exibir uma mensagem de erro, preservar o estado de edição e oferecer opção de tentar novamente.

### Requirement 4: Execução local do fluxo no simulador

**User Story:** Como consultor, quero rodar um Lead_Fake pelos passos do fluxo, para que eu valide transições, loops e botões sem enviar nada pelo WhatsApp.

#### Acceptance Criteria

1. WHEN o Simulador_de_Fluxo é aberto, THE Simulador_de_Fluxo SHALL iniciar a execução no primeiro passo ativo do fluxo atualmente em edição (não da versão salva no banco).
2. THE Simulador_de_Fluxo SHALL exibir, para o passo atual, o `step_key`, o `title`, o `message_text` (com variáveis `{{nome}}`, `{{valor_conta}}`, `{{economia_range}}` substituídas por valores do Lead_Fake) e a lista de botões/transições disponíveis.
3. WHERE o passo atual tem mídia anexada (áudio, imagem, vídeo), THE Simulador_de_Fluxo SHALL exibir um indicador visual da mídia (ex: "🎵 Áudio: nome.mp3") sem reproduzir o arquivo.
4. WHEN o Consultor seleciona uma mensagem pré-definida ou digita uma mensagem livre, THE Simulador_de_Fluxo SHALL aplicar o Motor_de_Fluxo e avançar para o próximo passo conforme as transições configuradas em até 1 segundo.
5. WHEN o Motor_de_Fluxo executa uma transição, THE Simulador_de_Fluxo SHALL exibir o histórico cronológico dos passos visitados, mensagens do Lead_Fake e respostas do bot, com timestamp relativo à abertura da sessão.
6. THE Simulador_de_Fluxo SHALL NOT chamar a Evolution_API nem o Whapi-API em nenhum momento.
7. THE Simulador_de_Fluxo SHALL NOT criar nem modificar registros em `customers`, `conversations`, `bot_flows`, `bot_flow_steps` ou qualquer outra tabela do banco.
8. IF o Motor_de_Fluxo detecta um loop (passo atual já visitado nesta sessão de simulação), THEN THE Simulador_de_Fluxo SHALL exibir um aviso visual destacando o loop e o caminho que o causou, sem encerrar a sessão.
9. WHEN o Consultor clica em "Reiniciar simulação", THE Simulador_de_Fluxo SHALL voltar ao primeiro passo ativo e limpar o histórico em até 1 segundo.
10. IF um passo referenciado por uma transição não existe ou está inativo, THEN THE Simulador_de_Fluxo SHALL exibir um erro indicando o `step_key` ausente sem encerrar a sessão.

### Requirement 5: Mensagens pré-definidas no simulador

**User Story:** Como consultor, quero escolher entre mensagens pré-definidas (ou digitar a minha), para que eu teste rapidamente as principais respostas que um lead real envia.

#### Acceptance Criteria

1. THE Simulador_de_Fluxo SHALL oferecer um conjunto de pelo menos 5 mensagens pré-definidas: "Quero simular", "Tenho dúvida", "Não tenho conta", "Falar com humano", "Outra coisa".
2. WHEN o passo atual tem botões definidos em `captures._buttons`, THE Simulador_de_Fluxo SHALL exibir esses botões como opções rápidas além das mensagens pré-definidas.
3. THE Simulador_de_Fluxo SHALL aceitar entrada de texto livre de até 1000 caracteres como alternativa às mensagens pré-definidas.
4. WHEN o Consultor envia uma mensagem livre que não dispara nenhuma transição configurada, THE Simulador_de_Fluxo SHALL aplicar o `fallback` configurado no passo (`mode: repeat` ou `goto`) e SHALL exibir qual fallback foi acionado.
5. IF o Consultor envia uma mensagem vazia, THEN THE Simulador_de_Fluxo SHALL exibir uma validação informando que a mensagem não pode ser vazia, sem avançar de passo.

### Requirement 6: Cadastro manual de campanhas Meta Ads

**User Story:** Como consultor, quero cadastrar campanhas Meta Ads manualmente, para que eu vincule leads a anúncios mesmo sem integração com a Meta Marketing API.

#### Acceptance Criteria

1. THE Painel_Meta_Ads SHALL oferecer um formulário para criar uma Campanha_Meta com os campos: nome (1-100 chars), `campaign_id` (Meta, 1-100 chars), `initial_message` (5-1000 chars), custo total (numérico ≥ 0) e status (enum: `active`, `paused`, `archived`).
2. WHEN o Consultor submete o formulário com `initial_message` em branco ou com menos de 5 caracteres, THE Painel_Meta_Ads SHALL exibir uma validação informando que `initial_message` é obrigatório (mín. 5 chars) para o Match_de_Campanha por texto, sem persistir.
3. WHEN o Consultor submete o formulário com `campaign_id` que já existe para o mesmo Consultor, THE Painel_Meta_Ads SHALL exibir um erro informando duplicidade, sem persistir.
4. THE Painel_Meta_Ads SHALL permitir editar `initial_message` e custo total de uma Campanha_Meta existente, aplicando as mesmas validações da criação.
5. WHEN uma Campanha_Meta é criada ou atualizada com sucesso, THE Sistema SHALL persistir os dados em `facebook_campaigns` aplicando RLS de forma que apenas o Consultor dono acessa o registro, e SHALL exibir confirmação visual em até 2 segundos.
6. IF a persistência em `facebook_campaigns` falha, THEN THE Painel_Meta_Ads SHALL exibir uma mensagem de erro, preservar os dados do formulário e oferecer opção de tentar novamente.

### Requirement 7: Importação de campanhas via Meta Marketing API

**User Story:** Como consultor, quero importar minhas campanhas Meta automaticamente, para que eu não precise cadastrá-las manualmente uma a uma.

#### Acceptance Criteria

1. WHEN o Consultor possui uma conta Meta conectada e clica em "Importar campanhas", THE Painel_Meta_Ads SHALL chamar a Meta Marketing API e listar as campanhas com status `ACTIVE` ou `PAUSED` cuja data de início esteja nos últimos 90 dias corridos, com timeout de 30 segundos.
2. WHEN uma campanha importada possui `campaign_id` que já existe em `facebook_campaigns` para o Consultor, THE Painel_Meta_Ads SHALL atualizar custo total, impressões e cliques sem sobrescrever `initial_message`, status manual ou outros campos editáveis pelo Consultor.
3. WHEN uma campanha importada não existe em `facebook_campaigns`, THE Painel_Meta_Ads SHALL inserir um novo registro com `initial_message` em branco e SHALL exibir um aviso solicitando ao Consultor preencher essa coluna para habilitar Match_de_Campanha.
4. IF a Meta Marketing API retorna erro de autenticação (401/403), THEN THE Painel_Meta_Ads SHALL exibir uma mensagem instruindo o Consultor a reconectar a conta Facebook em `/admin/ads` e SHALL preservar os registros existentes em `facebook_campaigns`.
5. IF a Meta Marketing API atinge o timeout de 30 segundos ou retorna erro 5xx, THEN THE Painel_Meta_Ads SHALL aplicar até 3 tentativas com backoff exponencial (1s, 2s, 4s) e SHALL exibir mensagem de indisponibilidade ao Consultor sem alterar `facebook_campaigns` se todas as tentativas falharem.
6. WHEN a importação é concluída com sucesso, THE Painel_Meta_Ads SHALL armazenar custos diários em `facebook_metrics_daily` com 1 registro por (campanha, dia) dentro da janela de 90 dias.

### Requirement 8: Match preciso de leads a campanhas

**User Story:** Como consultor, quero que cada lead seja atribuído à campanha correta, para que minhas métricas reflitam a realidade.

#### Acceptance Criteria

1. WHEN um Lead chega via Evolution_API com `externalAdReply.ctwaClid` no payload (1-255 chars), THE Sistema SHALL setar `customers.source_ctwa_clid` em até 2 segundos e SHALL tentar resolver `customers.source_campaign_id` consultando o mapping `ctwa_clid → campaign_id` mantido pelo sistema.
2. IF um Lead chega com `ctwaClid` válido mas o mapping não retorna campanha correspondente, THEN THE Sistema SHALL deixar `customers.source_campaign_id` nulo e SHALL prosseguir para o método de match por mensagem.
3. WHEN um Lead chega sem `ctwaClid` mas a primeira mensagem do Lead corresponde após normalização (trim + lowercase + remoção de emojis aplicada a ambos os lados) a uma `facebook_campaigns.initial_message`, THE Sistema SHALL setar `customers.source_campaign_id` com a campanha correspondente em até 2 segundos.
4. WHEN nenhuma campanha tem `initial_message` correspondente exato, THE Sistema SHALL aplicar busca textual usando o índice GIN sobre `to_tsvector('portuguese', initial_message)` e SHALL atribuir a campanha com maior similaridade desde que esta seja ≥ 0.7. WHEN há empate de similaridade entre múltiplas campanhas, THE Sistema SHALL escolher a de `created_at` mais recente.
5. IF a similaridade textual é menor que 0.7 para todas as campanhas OU a primeira mensagem do Lead não tem texto (apenas mídia), THEN THE Sistema SHALL deixar `customers.source_campaign_id` nulo e SHALL marcar `customers.lead_source` como `organic` ou `unknown` conforme regex de detecção existente.
6. THE Sistema SHALL registrar em uma tabela de log cada decisão de Match_de_Campanha com `customer_id`, `campaign_id` resolvida (ou nula), método (`ctwa_clid`, `exact_message`, `tsvector`, `unmatched`), score de similaridade quando aplicável, e timestamp em UTC com precisão de milissegundos, em até 2 segundos após a decisão.
7. IF a escrita no log de match falha, THEN THE Sistema SHALL persistir os campos `customers.source_*` normalmente e SHALL registrar erro em log de aplicação para retry posterior, sem bloquear a entrada do Lead.

### Requirement 9: Painel de métricas por campanha

**User Story:** Como consultor, quero ver leads recebidos, conversões e CAC por campanha, para que eu saiba quais anúncios trazem retorno.

#### Acceptance Criteria

1. THE Painel_Meta_Ads SHALL exibir uma tabela com 1 linha por Campanha_Meta contendo: nome (até 100 chars), status (enum: `active`, `paused`, `archived`), leads recebidos (inteiro ≥ 0), leads convertidos (inteiro ≥ 0), taxa de conversão (% com 2 decimais entre 0 e 100), CAC (numérico ≥ 0).
2. THE Painel_Meta_Ads SHALL permitir filtrar a tabela por intervalo de datas com presets (últimos 7 dias, 30 dias, 90 dias) e intervalo customizado entre `01/01/2020` e a data atual, com duração máxima de 365 dias.
3. WHEN o Consultor seleciona um intervalo de datas válido, THE Painel_Meta_Ads SHALL recalcular leads recebidos pelos `customers.created_at` no intervalo, custo somando `facebook_metrics_daily` no intervalo, e CAC pela divisão custo / conversões, em até 5 segundos.
4. IF o Consultor seleciona um intervalo customizado inválido (data inicial > data final OU duração > 365 dias), THEN THE Painel_Meta_Ads SHALL exibir uma validação e SHALL preservar a última seleção válida sem recalcular.
5. WHEN o Consultor clica em uma linha da tabela, THE Painel_Meta_Ads SHALL exibir a lista de leads atribuídos àquela Campanha_Meta com nome, telefone, `conversation_step`, `status` e `created_at` em UTC.
6. WHEN o Consultor clica em um Lead na lista de detalhes da campanha, THE Painel_Meta_Ads SHALL exibir o estágio atual do funil e o custo atribuído (custo da campanha / leads da campanha no intervalo).
7. WHERE uma Campanha_Meta tem zero leads convertidos, THE Painel_Meta_Ads SHALL exibir CAC como "—" em vez de divisão por zero. WHERE uma Campanha_Meta tem zero leads recebidos, THE Painel_Meta_Ads SHALL exibir custo por lead como "—".
8. THE Painel_Meta_Ads SHALL paginar a lista de leads por campanha com 50 leads por página, ordenados por `created_at` descendente e tie-break por `id` descendente.

### Requirement 10: Listagem de leads parados

**User Story:** Como consultor, quero ver os leads parados há mais de 24 horas, para que eu possa reativá-los antes que abandonem de vez.

#### Acceptance Criteria

1. THE Painel_de_Reaquecimento SHALL listar leads onde `customers.updated_at` foi há 24 horas ou mais, `customers.status` não é `approved` nem `cancelled`, e `customers.conversation_step` não é nulo.
2. THE Painel_de_Reaquecimento SHALL exibir, para cada Lead_Parado: nome (até 100 chars), telefone mascarado nos últimos 4 dígitos (formato `(XX) XXXX-1234`), `conversation_step`, tempo desde a última atividade em formato `Xh Ymin` ou `Xd Yh`, e variante de fluxo (A, B, C, D ou E).
3. THE Painel_de_Reaquecimento SHALL agrupar leads por `conversation_step` e SHALL exibir contagem total por grupo.
4. THE Painel_de_Reaquecimento SHALL paginar a lista com 50 leads por página, ordenados por tempo parado descendente e tie-break por `customers.id` descendente.
5. THE Painel_de_Reaquecimento SHALL aplicar RLS de forma que cada Consultor vê apenas leads onde `consultant_id = auth.uid()`.
6. WHEN o Consultor seleciona um filtro de `conversation_step`, THE Painel_de_Reaquecimento SHALL exibir apenas leads parados naquele passo em até 2 segundos.
7. THE Painel_de_Reaquecimento SHALL retornar a primeira página em até 2 segundos para um Consultor com até 5000 leads parados.
8. WHERE o Consultor não tem nenhum Lead_Parado, THE Painel_de_Reaquecimento SHALL exibir um estado vazio com mensagem informativa e nenhuma chamada de paginação.

### Requirement 11: Visualização do histórico do lead

**User Story:** Como consultor, quero ver as últimas mensagens trocadas com um lead parado, para que eu personalize a mensagem de reaquecimento.

#### Acceptance Criteria

1. WHEN o Consultor clica em um Lead_Parado na lista, THE Painel_de_Reaquecimento SHALL exibir as últimas 20 mensagens da tabela `conversations` para aquele Lead em até 2 segundos, ordenadas por `created_at` ascendente.
2. THE Painel_de_Reaquecimento SHALL exibir, para cada mensagem, um label textual de origem: "Cliente", "Bot" ou "Consultor".
3. THE Painel_de_Reaquecimento SHALL aplicar RLS verificando que `consultant_id = auth.uid()` para o Lead, retornando zero registros para outros consultores.
4. WHILE o histórico é carregado, THE Painel_de_Reaquecimento SHALL exibir um indicador de carregamento e SHALL desabilitar a seleção de outro Lead até que o carregamento termine.
5. WHERE o Lead_Parado não tem nenhuma mensagem em `conversations`, THE Painel_de_Reaquecimento SHALL exibir um estado vazio com mensagem informativa.
6. IF a query de histórico falha ou ultrapassa 10 segundos, THEN THE Painel_de_Reaquecimento SHALL exibir uma mensagem de erro e oferecer opção de tentar novamente.

### Requirement 12: Templates de reaquecimento por passo

**User Story:** Como consultor, quero definir templates de reaquecimento por passo, para que cada lead receba a mensagem certa para o estágio em que está parado.

#### Acceptance Criteria

1. THE Painel_de_Reaquecimento SHALL armazenar Template_de_Reaquecimento na tabela nova `reactivation_templates` com `consultant_id` (UUID), `conversation_step` (texto), `message_text` (1-4096 chars), `is_active` (boolean), e `created_at` (timestamp UTC).
2. WHEN um usuário autenticado executa SELECT, INSERT, UPDATE ou DELETE em `reactivation_templates`, THE Painel_de_Reaquecimento SHALL aplicar RLS retornando ou aceitando apenas linhas onde `consultant_id = auth.uid()` (ou `has_role(auth.uid(), 'admin')`), rejeitando demais operações.
3. WHEN o Consultor abre o painel de envio para um Lead_Parado e existe um Template_de_Reaquecimento ativo correspondente ao `conversation_step` do Lead, THE Painel_de_Reaquecimento SHALL pré-popular o campo de mensagem em até 2 segundos.
4. IF não existe Template_de_Reaquecimento ativo para o `conversation_step` do Lead, THEN THE Painel_de_Reaquecimento SHALL exibir o campo de mensagem vazio com placeholder informativo, sem bloquear o envio manual.
5. WHEN o Consultor edita a mensagem antes do envio, THE Painel_de_Reaquecimento SHALL persistir somente a versão editada no envio, mantendo o registro original em `reactivation_templates` inalterado.
6. WHEN o Painel_de_Reaquecimento exibe a prévia do template, THE Painel_de_Reaquecimento SHALL substituir as variáveis `{{nome}}`, `{{valor_conta}}` e `{{representante}}` pelos dados do Lead.
7. IF dados do Lead estão ausentes para alguma variável, THEN THE Painel_de_Reaquecimento SHALL substituir a variável por string vazia e SHALL exibir um aviso visual indicando o campo faltante.
8. WHEN o Consultor cria, edita ou desativa um Template_de_Reaquecimento com sucesso, THE Painel_de_Reaquecimento SHALL persistir a alteração e SHALL exibir confirmação visual em até 2 segundos.
9. IF a persistência de Template_de_Reaquecimento falha, THEN THE Painel_de_Reaquecimento SHALL preservar o estado anterior do template e SHALL exibir uma mensagem de erro com opção de tentar novamente.

### Requirement 13: Envio de mensagem de reaquecimento

**User Story:** Como consultor, quero enviar a mensagem de reaquecimento agora ou agendá-la, para que o lead receba no momento ideal.

#### Acceptance Criteria

1. WHEN o Consultor clica em "Enviar agora" no painel de envio, THE Painel_de_Reaquecimento SHALL enviar a mensagem ao Lead via Evolution_API usando a instância WhatsApp do Consultor com timeout de 30 segundos.
2. WHEN o Consultor escolhe agendar para um horário futuro válido (entre 1 minuto e 90 dias no futuro), THE Painel_de_Reaquecimento SHALL criar um registro em `scheduled_messages` reusando o sistema de mensagens agendadas existente.
3. IF o horário agendado é no passado ou maior que 90 dias no futuro, THEN THE Painel_de_Reaquecimento SHALL exibir uma validação e SHALL impedir o envio.
4. WHEN o envio é confirmado pela Evolution_API, THE Painel_de_Reaquecimento SHALL registrar o envio em `reactivation_sends` com `customer_id`, `consultant_id`, `conversation_step` no momento do envio, `template_id` (nullable se editado), `message_text` final, `sent_at` (UTC) e `status='sent'`.
5. IF o envio para a Evolution_API falha ou ultrapassa o timeout, THEN THE Painel_de_Reaquecimento SHALL registrar `status='failed'` em `reactivation_sends` com `error_reason` e SHALL exibir o erro ao Consultor com opção de retry.
6. WHEN o registro em `reactivation_sends` é confirmado, THE Painel_de_Reaquecimento SHALL exibir uma confirmação visual com nome do Lead e horário em até 2 segundos.

### Requirement 14: Envio de reaquecimento em lote

**User Story:** Como consultor, quero enviar reaquecimento para todos os leads parados em um mesmo passo de uma vez, para que eu poupe tempo em listas grandes.

#### Acceptance Criteria

1. WHEN o Consultor seleciona entre 2 e 500 Lead_Parado e clica em "Enviar em lote", THE Painel_de_Reaquecimento SHALL exibir um diálogo de confirmação com a contagem de leads, o template a ser aplicado e botões "Confirmar" e "Cancelar".
2. IF o Consultor seleciona menos de 2 ou mais de 500 leads, THEN THE Painel_de_Reaquecimento SHALL exibir validação e impedir abertura do diálogo de confirmação.
3. THE Painel_de_Reaquecimento SHALL respeitar um intervalo mínimo de 2 segundos entre envios consecutivos para evitar bloqueio pela Evolution_API.
4. WHILE o Envio_em_Lote está em andamento, THE Painel_de_Reaquecimento SHALL exibir uma barra de progresso com leads enviados, leads com falha e tempo estimado restante, atualizada a cada 1 segundo.
5. IF o envio para um lead específico falha, THEN THE Painel_de_Reaquecimento SHALL registrar o erro em `reactivation_sends` com `status='failed'` e SHALL prosseguir com os demais leads sem interromper o lote.
6. IF o Consultor clica em "Cancelar lote" durante o envio, THEN THE Painel_de_Reaquecimento SHALL interromper novos envios em até 5 segundos, preservando os já enviados, e SHALL registrar interrupção no audit log.
7. WHEN o Envio_em_Lote termina, THE Painel_de_Reaquecimento SHALL exibir um resumo com total enviado, total com falha e link para revisar os leads que falharam.
8. IF o Consultor seleciona apenas leads de um mesmo `conversation_step`, THEN THE Painel_de_Reaquecimento SHALL aplicar o Template_de_Reaquecimento desse passo automaticamente.
9. IF o Consultor seleciona leads de múltiplos `conversation_step`, THEN THE Painel_de_Reaquecimento SHALL aplicar o Template_de_Reaquecimento correspondente ao passo de cada Lead individualmente.

### Requirement 15: Modo automático opcional por passo

**User Story:** Como consultor, quero habilitar reaquecimento automático para passos específicos, para que leads parados nesses passos sejam reativados sem que eu precise abrir o painel.

#### Acceptance Criteria

1. THE Painel_de_Reaquecimento SHALL oferecer uma flag `auto_reactivate` (boolean, default `false`) por Template_de_Reaquecimento que controla se o cron automático envia ou não.
2. WHILE `auto_reactivate=true` para um Template_de_Reaquecimento, THE cron SHALL processar a cada 1 hora um batch de até 500 Lead_Parado cujo `conversation_step` corresponde ao template, que tenham menos de 3 envios automáticos prévios e que não tenham envio em `reactivation_sends` nas últimas 48 horas.
3. WHEN o cron envia uma mensagem automática, THE Sistema SHALL registrar `reactivation_sends.trigger_type='auto'` (versus `manual` para envios pelo Painel_de_Reaquecimento).
4. IF o horário atual no fuso do Consultor está fora da janela 09:00–20:00 OU é sábado ou domingo, THEN THE cron SHALL pular o envio mantendo o Lead elegível para a próxima execução dentro da janela permitida.
5. IF `auto_reactivate=false` ou nulo, THEN THE cron SHALL NOT enviar mensagens automaticamente para aquele template.
6. WHERE o Consultor não tem fuso configurado em `consultants.timezone`, THE cron SHALL usar o fuso padrão do sistema (`America/Sao_Paulo`).
7. IF o envio automático para um Lead falha (Evolution_API erro/timeout), THEN THE Sistema SHALL registrar `status='failed'` sem incrementar o contador de tentativas válidas, permitindo retry na próxima execução do cron.

### Requirement 16: Tracking de resultado do reaquecimento

**User Story:** Como consultor, quero saber se o lead respondeu ao reaquecimento ou abandonou de vez, para que eu meça a eficácia das minhas mensagens.

#### Acceptance Criteria

1. WHEN o Lead envia uma mensagem após receber um envio em `reactivation_sends`, THE Sistema SHALL atualizar `reactivation_sends.lead_responded_at` com o `created_at` da primeira `conversations` recebida do Lead após o envio, em até 5 segundos.
2. WHEN `customers.conversation_step` muda após um envio em `reactivation_sends`, THE Sistema SHALL setar `reactivation_sends.lead_advanced_at` com o timestamp da mudança, em até 5 segundos.
3. WHEN passam 168 horas (7 dias) após `sent_at` sem `lead_responded_at`, THE Sistema SHALL marcar `reactivation_sends.outcome='abandoned'` em batch processado a cada 1 hora.
4. WHEN `lead_responded_at` é registrado dentro de 168 horas E `lead_advanced_at` também está preenchido, THE Sistema SHALL marcar `reactivation_sends.outcome='advanced'`.
5. WHEN `lead_responded_at` é registrado dentro de 168 horas E `lead_advanced_at` está nulo, THE Sistema SHALL marcar `reactivation_sends.outcome='responded'`.
6. THE Painel_de_Reaquecimento SHALL exibir um dashboard com taxa de resposta, taxa de avanço e taxa de abandono (% com 2 decimais) agrupadas por Template_de_Reaquecimento, com seleção de período (últimos 7, 30 ou 90 dias).
7. IF a atualização de `lead_responded_at`, `lead_advanced_at` ou `outcome` falha, THEN THE Sistema SHALL aplicar até 3 retries com backoff de 5 minutos e SHALL registrar erro em log de aplicação se todas falharem, sem bloquear o fluxo do Lead.

### Requirement 17: Compatibilidade com fluxos existentes

**User Story:** Como consultor de fluxos A/B/C, quero que minhas configurações continuem funcionando, para que esta nova feature não quebre minha operação atual.

#### Acceptance Criteria

1. THE Sistema SHALL preservar o schema existente de `bot_flows`, `bot_flow_steps`, `customers`, `facebook_campaigns`, `conversations` e `bot_handoff_alerts` sem remover colunas nem alterar tipos de colunas existentes; apenas adições de colunas nullable ou com default são permitidas.
2. WHEN um Consultor tem `consultants.active_variants` contendo variantes A, B ou C, THE função `assign_flow_variant` SHALL atribuir essas variantes em round-robin com distribuição equivalente (±5% de tolerância em amostra de 1000 atribuições) ao comportamento pré-feature.
3. IF `consultants.active_variants` está vazio ou nulo, THEN `assign_flow_variant` SHALL retornar a variante padrão `A` sem erro.
4. THE Sistema SHALL preservar `customers.capture_mode='manual'` como default em novos leads conforme trigger `customers_default_capture_mode` existente.
5. WHILE `customers.capture_mode='manual'` para um Lead, THE cron de reaquecimento automático SHALL NOT enviar mensagens, exceto quando o Consultor explicitamente marca uma flag `manual_override_reactivate=true` no Lead.
6. THE Editor_de_Fluxos SHALL preservar mensagens de validação do `useFlowValidation` para fluxos A/B/C/E com texto e severidade idênticos aos pré-feature; apenas a regra `conversion_step_no_cta` (já existente) e novas regras específicas para Fluxo_D podem ser adicionadas sem afetar A/B/C/E.

### Requirement 18: Performance e privacidade do painel

**User Story:** Como consultor com muitos leads, quero que o painel carregue rápido e proteja dados sensíveis, para que eu use a ferramenta no dia a dia.

#### Acceptance Criteria

1. WHEN o Consultor carrega a listagem principal do Painel_de_Reaquecimento com até 5000 leads, THE Painel_de_Reaquecimento SHALL retornar o resultado em até 2 segundos (medidos do recebimento da requisição até o envio da resposta), utilizando índices em `customers (consultant_id, updated_at, status, conversation_step)`.
2. WHEN um usuário autenticado consulta `reactivation_templates` ou `reactivation_sends`, THE Painel_de_Reaquecimento SHALL aplicar RLS retornando somente linhas onde `consultant_id = auth.uid()` ou `has_role(auth.uid(), 'admin')`, rejeitando qualquer outra leitura, escrita ou exclusão.
3. WHILE um Lead está exibido na lista do Painel_de_Reaquecimento, THE Painel_de_Reaquecimento SHALL mascarar o telefone preservando o DDD (2 primeiros dígitos) e os 4 últimos dígitos, substituindo os intermediários por `*` (exemplo: `(11) 9****-1234`).
4. WHEN o Consultor expande o detalhe de um Lead, THE Painel_de_Reaquecimento SHALL exibir o número completo sem mascaramento.
5. THE Painel_Meta_Ads SHALL aplicar RLS de forma que cada Consultor visualize apenas registros onde `consultant_id = auth.uid()` em `facebook_campaigns` e `facebook_metrics_daily`, e administradores visualizem todos.
6. WHEN um Template_de_Reaquecimento é criado, editado ou excluído, THE Sistema SHALL registrar no audit log uma entrada com `consultant_id`, tipo da ação, identificador do template e timestamp UTC com precisão de milissegundos, retida por no mínimo 365 dias.
7. WHEN um Envio_em_Lote é executado, THE Sistema SHALL registrar no audit log uma entrada com `consultant_id`, identificador do lote, quantidade de destinatários e timestamp UTC com precisão de milissegundos, retida por no mínimo 365 dias.
