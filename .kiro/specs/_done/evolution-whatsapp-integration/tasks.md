# Plano de Implementação: Integração WhatsApp via Evolution API

## Visão Geral

Implementação incremental da integração WhatsApp no Painel do Consultor, começando pela camada de serviço e modelos de dados, seguido pelos hooks React, componentes de UI, e finalizando com a integração na aba existente do Admin. Todos os exemplos de código usam TypeScript + React.

## Tarefas

- [x] 1. Configurar variáveis de ambiente e camada de serviço da Evolution API
  - [x] 1.1 Adicionar variáveis de ambiente `VITE_EVOLUTION_API_URL` e `VITE_EVOLUTION_API_KEY` ao arquivo `.env`
    - Adicionar as duas variáveis com os valores da Evolution API
    - _Requisitos: 1.1, 7.1_

  - [x] 1.2 Criar o serviço `src/services/evolutionApi.ts`
    - Implementar funções: `createInstance`, `connectInstance`, `getConnectionState`, `deleteInstance`, `sendTextMessage`
    - Cada função deve usar `fetch` com header `apikey` para autenticação
    - Implementar tratamento de erros para respostas 401 (API Key inválida) e falhas de rede
    - _Requisitos: 1.1, 1.2, 1.6, 3.3, 3.5_

  - [x] 1.3 Criar tipos TypeScript em `src/types/whatsapp.ts`
    - Definir interfaces: `WhatsAppInstance`, `MessageTemplate`, `ConnectionStatus`, `BulkSendProgress`
    - _Requisitos: 1.1, 5.1_

- [x] 2. Criar tabelas no Supabase e hooks de dados
  - [x] 2.1 Criar tabelas `whatsapp_instances` e `message_templates` no Supabase
    - Executar SQL para criar tabela `whatsapp_instances` com colunas: `id`, `consultant_id`, `instance_name`, `created_at`
    - Executar SQL para criar tabela `message_templates` com colunas: `id`, `consultant_id`, `name`, `content`, `created_at`
    - Configurar RLS policies para que cada consultor acesse apenas seus próprios registros (`auth.uid() = consultant_id`)
    - Atualizar `src/integrations/supabase/types.ts` com os novos tipos das tabelas
    - _Requisitos: 7.1, 5.1, 5.4_

  - [x] 2.2 Criar hook `src/hooks/useWhatsApp.ts`
    - Implementar gerenciamento de estado: `connectionStatus`, `instanceName`, `qrCode`, `isLoading`, `error`
    - Implementar `createAndConnect`: cria instância na Evolution API + salva no Supabase + retorna QR Code
    - Implementar `disconnect`: deleta instância na Evolution API + remove do Supabase
    - Implementar `reconnect`: gera novo QR Code para instância existente
    - Implementar polling de status a cada 30 segundos com `setInterval`
    - Ao carregar, verificar se já existe instância salva no Supabase e consultar status na Evolution API
    - Se instância salva não existir na Evolution API, remover registro local e exibir tela de nova conexão
    - _Requisitos: 1.1, 1.2, 1.4, 1.5, 1.7, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3_

  - [x] 2.3 Criar hook `src/hooks/useTemplates.ts`
    - Implementar CRUD de templates no Supabase: `createTemplate`, `deleteTemplate`, listagem automática
    - Implementar função `applyTemplate` que substitui `{{nome}}` e `{{valor_conta}}` pelos dados do cliente
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 3. Checkpoint — Validar camada de serviço e hooks
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 4. Implementar componentes de UI do WhatsApp
  - [x] 4.1 Criar componente `src/components/whatsapp/ConnectionPanel.tsx`
    - Exibir QR Code (imagem base64) quando `connectionStatus` é "disconnected" ou "connecting"
    - Exibir indicador de carregamento com mensagem "Aguardando leitura do QR Code..." quando "connecting"
    - Exibir botão "Gerar novo QR Code" quando QR expirado
    - Exibir número conectado + badge verde + botão "Desconectar" quando "connected"
    - Exibir botão "Reconectar" quando desconectado com instância existente
    - Exibir mensagem de erro + botão "Tentar novamente" em caso de falha
    - _Requisitos: 1.2, 1.3, 1.5, 1.6, 1.7, 6.2, 6.3, 6.4_

  - [x] 4.2 Criar componente `src/components/whatsapp/MessagePanel.tsx`
    - Lista de clientes (da tabela `customers`) com nome e número de WhatsApp
    - Campo de busca que filtra clientes por nome ou telefone em tempo real
    - Ao selecionar cliente, exibir campo de texto para compor mensagem
    - Seletor de template de mensagem com substituição automática de placeholders
    - Botão "Enviar" desabilitado quando mensagem vazia
    - Toast de sucesso com nome do cliente após envio confirmado
    - Toast de erro com descrição da falha em caso de erro
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.3, 5.6_

  - [ ]* 4.3 Escrever teste de propriedade para filtro de clientes
    - **Propriedade 1: Filtro de clientes retorna apenas resultados correspondentes**
    - **Valida: Requisito 3.6**

  - [ ]* 4.4 Escrever teste de propriedade para substituição de placeholders
    - **Propriedade 2: Substituição de placeholders em templates**
    - **Valida: Requisitos 5.2, 5.3**

  - [x] 4.5 Criar componente `src/components/whatsapp/BulkSendPanel.tsx`
    - Lista de clientes com checkboxes para seleção múltipla
    - Checkbox "Selecionar Todos" para selecionar/desselecionar todos
    - Exibir contagem de destinatários selecionados
    - Campo de mensagem + seletor de template
    - Aviso "Selecione pelo menos um destinatário" se tentar enviar sem seleção
    - Envio sequencial com delay de 2 segundos entre cada mensagem
    - Barra de progresso durante envio (enviadas/total)
    - Resumo ao final com contagem de sucesso e falhas
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 4.6 Escrever teste de propriedade para seleção de clientes
    - **Propriedade 5: Selecionar todos e contagem de selecionados**
    - **Valida: Requisitos 4.3, 4.4**

  - [ ]* 4.7 Escrever teste de propriedade para completude do envio em massa
    - **Propriedade 6: Completude do envio em massa**
    - **Valida: Requisitos 4.5, 4.7**

  - [x] 4.8 Criar componente `src/components/whatsapp/TemplateManager.tsx`
    - Lista de templates salvos pelo consultor
    - Formulário para criar novo template com campos nome e conteúdo
    - Suporte a placeholders `{{nome}}` e `{{valor_conta}}` com dica visual
    - Botão "Excluir" com diálogo de confirmação antes de remover
    - _Requisitos: 5.1, 5.2, 5.4, 5.5, 5.6_

  - [ ]* 4.9 Escrever teste de propriedade para persistência de templates
    - **Propriedade 3: Persistência round-trip de templates**
    - **Valida: Requisitos 5.1, 5.4**

- [x] 5. Integrar aba WhatsApp no Painel do Consultor
  - [x] 5.1 Criar componente container `src/components/whatsapp/WhatsAppTab.tsx`
    - Renderizar `ConnectionPanel` sempre visível
    - Renderizar `MessagePanel`, `BulkSendPanel` e `TemplateManager` apenas quando `connectionStatus === "connected"`
    - Usar hooks `useWhatsApp` e `useTemplates` para gerenciar estado
    - _Requisitos: 2.2, 2.3, 2.4_

  - [x] 5.2 Modificar `src/pages/Admin.tsx` para adicionar aba "WhatsApp"
    - Adicionar "whatsapp" ao tipo do `activeTab` e ao array `tabs` com ícone `MessageSquare` do lucide-react
    - Renderizar `WhatsAppTab` quando `activeTab === "whatsapp"`
    - Passar `userId` como prop para o `WhatsAppTab`
    - _Requisitos: 2.1, 2.2_

  - [ ]* 5.3 Escrever teste de propriedade para persistência de instância
    - **Propriedade 4: Persistência round-trip de instância WhatsApp**
    - **Valida: Requisito 7.1**

- [x] 6. Checkpoint final — Validar integração completa
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.
  - Verificar que a aba WhatsApp aparece corretamente no painel
  - Verificar que o fluxo de conexão via QR Code funciona
  - Verificar que o envio de mensagens individual e em massa funciona

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Testes de propriedade validam propriedades universais de corretude
- A biblioteca `fast-check` será usada para os testes de propriedade com Vitest
