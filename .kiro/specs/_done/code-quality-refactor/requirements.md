# Documento de Requisitos — Refatoração de Qualidade de Código

## Introdução

Este documento define os requisitos para melhorias críticas de segurança, type safety e logging do codebase iGreen (React + TypeScript + Supabase + Evolution API/WhatsApp). Foco em resolver problemas reais: chave de API exposta no frontend, casts `as any` que mascaram bugs, e console.logs que expõem dados de usuários em produção.

## Princípio Fundamental: Zero Breaking Changes

Toda refatoração DEVE preservar 100% do comportamento funcional existente. Nenhuma funcionalidade visível ao usuário pode ser alterada, removida ou degradada. Cada requisito inclui critérios de preservação que garantem retrocompatibilidade.

## Glossário

- **Sistema**: A aplicação web iGreen (frontend React + backend Supabase Edge Functions)
- **Frontend**: O bundle JavaScript/TypeScript servido ao navegador do usuário
- **Edge_Function**: Função serverless executada no Supabase Edge Functions (Deno)
- **Evolution_API**: API externa de integração com WhatsApp (Evolution API)
- **Proxy_Edge_Function**: Edge Function que atua como intermediário entre o Frontend e a Evolution_API
- **Logger**: Módulo utilitário centralizado para logging configurável

## Requisitos

### Requisito 1: Proxy de Segurança para Chaves de API

**User Story:** Como desenvolvedor, eu quero que a chave da Evolution API não seja exposta no bundle do frontend, para que credenciais sensíveis fiquem protegidas no servidor.

#### Critérios de Aceitação

1. THE Sistema SHALL armazenar a chave `EVOLUTION_API_KEY` exclusivamente em variáveis de ambiente das Edge Functions do Supabase (secrets), sem prefixo `VITE_`.
2. WHEN o Frontend precisar chamar a Evolution_API, THE Frontend SHALL enviar a requisição para uma Proxy_Edge_Function em vez de chamar a Evolution_API diretamente.
3. THE Proxy_Edge_Function SHALL encaminhar a requisição para a Evolution_API adicionando o header `apikey` com o valor da variável de ambiente `EVOLUTION_API_KEY`.
4. THE Proxy_Edge_Function SHALL validar que a requisição contém um token de autenticação Supabase válido antes de encaminhar para a Evolution_API.
5. IF a requisição não contiver um token Supabase válido, THEN THE Proxy_Edge_Function SHALL retornar status HTTP 401 com mensagem de erro descritiva.
6. THE Frontend SHALL remover todas as referências a `VITE_EVOLUTION_API_KEY` e `VITE_EVOLUTION_API_URL` do código-fonte.
7. WHEN a Proxy_Edge_Function receber uma resposta da Evolution_API, THE Proxy_Edge_Function SHALL retransmitir o status HTTP e o corpo da resposta ao Frontend.

#### Critérios de Preservação

8. THE `evolutionApi.ts` SHALL manter exatamente as mesmas funções exportadas com as mesmas assinaturas (createInstance, connectInstance, getConnectionState, deleteInstance, findChats, findContacts, findMessages, sendTextMessage, sendMedia, sendAudio, sendDocument, markAsRead, getProfilePicture, getBase64FromMediaMessage), alterando apenas a implementação interna para chamar a Proxy_Edge_Function.
9. THE Proxy_Edge_Function SHALL retornar respostas no mesmo formato JSON que a Evolution_API retorna, para que nenhum componente consumidor precise ser alterado.
10. WHEN a Proxy_Edge_Function estiver indisponível, THE Sistema SHALL exibir a mesma mensagem de erro de conexão que já existe ("Erro de conexão. Verifique sua internet.").
11. THE Edge Function `crm-auto-progress` SHALL continuar chamando a Evolution_API diretamente via secrets, sem alteração.

### Requisito 2: Type Safety e Eliminação de `as any`

**User Story:** Como desenvolvedor, eu quero que o código use tipos TypeScript corretos em vez de casts `as any`, para que erros de tipo sejam detectados em tempo de compilação.

#### Critérios de Aceitação

1. THE Sistema SHALL gerar tipos TypeScript a partir do schema do Supabase usando `supabase gen types typescript`.
2. THE Sistema SHALL utilizar os tipos gerados do Supabase em todas as queries e mutations, eliminando casts `as any` e `as unknown`.
3. THE KanbanBoard SHALL definir interfaces tipadas para os dados de `kanban_stages` e `crm_deals` baseadas nos tipos gerados do Supabase.
4. THE Sistema SHALL configurar a regra `@typescript-eslint/no-explicit-any` como `error` no ESLint para prevenir novos usos de `any`.
5. WHEN o Supabase client for inicializado, THE Sistema SHALL passar o tipo `Database` gerado como parâmetro genérico para `createClient<Database>()`.

#### Critérios de Preservação

6. THE tipos gerados SHALL ser compatíveis com os dados já existentes no banco, incluindo colunas que foram adicionadas via migrations mas não estão no schema original (ex: `licenciada_cadastro_url`, `auto_message_enabled`, `auto_message_type`, `auto_message_media_url`, `approved_at`).
7. THE `createClient<Database>()` já está configurado em `src/integrations/supabase/client.ts` — a atualização SHALL apenas regenerar o tipo `Database` sem alterar a inicialização do client.
8. WHEN um cast `as any` for removido, THE código resultante SHALL compilar sem erros TypeScript e manter o mesmo comportamento em runtime.

### Requisito 3: Logging Configurável para Produção

**User Story:** Como desenvolvedor, eu quero um sistema de logging centralizado e configurável, para que logs de debug não apareçam em produção mas estejam disponíveis em desenvolvimento.

#### Critérios de Aceitação

1. THE Sistema SHALL implementar um módulo Logger com níveis: debug, info, warn e error.
2. THE Logger SHALL ser configurável via variável de ambiente `VITE_LOG_LEVEL`, com valor padrão "warn" em produção e "debug" em desenvolvimento.
3. WHEN o nível configurado for "warn", THE Logger SHALL suprimir mensagens de nível "debug" e "info".
4. THE Sistema SHALL substituir todas as chamadas `console.log` e `console.error` existentes no código por chamadas ao Logger.
5. THE Logger SHALL incluir timestamp e contexto (nome do módulo/componente) em cada mensagem de log.
6. IF o ambiente for produção (`import.meta.env.PROD`), THEN THE Logger SHALL desabilitar automaticamente logs de nível "debug" independente da configuração.

#### Critérios de Preservação

7. THE Logger SHALL usar `console.log`, `console.warn` e `console.error` internamente, garantindo que logs de nível "error" continuem aparecendo no console do browser para debugging em produção.
8. THE substituição de console.log/error SHALL ser puramente mecânica — o conteúdo e contexto das mensagens de log existentes SHALL ser preservado.
