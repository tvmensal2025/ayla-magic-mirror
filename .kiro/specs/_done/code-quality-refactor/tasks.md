# Plano de Implementação: Refatoração de Qualidade de Código

## Visão Geral

Implementação incremental de três melhorias de qualidade: Logger configurável (risco zero), Type Safety (risco baixo) e Proxy de Segurança para API (risco mais alto). Cada bloco é independente e validado antes de avançar. Linguagem: TypeScript. Testes: Vitest + fast-check.

## Tarefas

- [x] 1. Implementar módulo Logger configurável
  - [x] 1.1 Criar `src/lib/logger.ts` com `createLogger(module)`
    - Implementar tipo `LogLevel` ("debug" | "info" | "warn" | "error") e mapa de prioridades
    - Implementar função `createLogger(module: string): Logger` que retorna objeto com métodos debug/info/warn/error
    - Nível configurável via `import.meta.env.VITE_LOG_LEVEL` (padrão: "warn" em produção, "debug" em dev)
    - Em produção (`import.meta.env.PROD`), desabilitar "debug" independente da config
    - Cada mensagem deve incluir timestamp ISO e nome do módulo: `[timestamp] [module] mensagem`
    - Internamente usar `console.log` (debug/info), `console.warn` (warn), `console.error` (error)
    - _Requisitos: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7_

  - [ ]* 1.2 Escrever teste de propriedade para filtragem de nível do Logger
    - **Propriedade 5: Logger filtra mensagens conforme nível configurado**
    - Gerar combinações aleatórias de (nível config, nível mensagem) com fast-check
    - Verificar: mensagem emitida ⟺ prioridade(msg) ≥ prioridade(config)
    - Verificar: em produção, "debug" nunca é emitido
    - **Valida: Requisitos 3.2, 3.3, 3.6**

  - [ ]* 1.3 Escrever teste de propriedade para metadata do Logger
    - **Propriedade 6: Logger inclui timestamp e contexto do módulo**
    - Gerar nomes de módulo e mensagens aleatórias com fast-check
    - Verificar: output contém timestamp ISO 8601 e nome do módulo
    - **Valida: Requisitos 3.5**

  - [x] 1.4 Substituir console.log/error existentes pelo Logger
    - Substituir 4 chamadas em `src/hooks/useMessages.ts` (2x debug, 2x error)
    - Substituir 2 chamadas em `src/components/whatsapp/ChatView.tsx` (2x error)
    - Substituir 1 chamada em `src/components/whatsapp/MessageComposer.tsx` (1x error)
    - Substituir 1 chamada em `src/services/minioUpload.ts` (1x error)
    - Substituir 1 chamada em `src/pages/NotFound.tsx` (1x warn)
    - Preservar conteúdo e contexto das mensagens existentes
    - _Requisitos: 3.4, 3.8_

- [x] 2. Checkpoint — Logger
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Type Safety e eliminação de `as any`
  - [x] 3.1 Regenerar tipos TypeScript do Supabase
    - Executar `npx supabase gen types typescript --project-id zlzasfhcxcznaprrragl > src/integrations/supabase/types.ts`
    - Verificar que o tipo `Database` inclui todas as colunas atuais (auto_message_enabled, auto_message_type, auto_message_media_url, approved_at, licenciada_cadastro_url)
    - Confirmar que `createClient<Database>()` em `src/integrations/supabase/client.ts` continua compatível
    - _Requisitos: 2.1, 2.5, 2.6, 2.7_

  - [x] 3.2 Eliminar `as any` e `as unknown` em `KanbanBoard.tsx`
    - Definir tipos `KanbanStageRow`, `KanbanStageInsert`, `KanbanStageUpdate` derivados de `Database["public"]["Tables"]["kanban_stages"]`
    - Definir tipo `CrmDealRow` derivado de `Database["public"]["Tables"]["crm_deals"]`
    - Remover 5 casts `as any` e 2 casts `as unknown as KanbanStage` usando os tipos gerados
    - Remover interfaces locais `Deal` e `KanbanStage` se redundantes com os tipos gerados
    - _Requisitos: 2.2, 2.3, 2.8_

  - [x] 3.3 Eliminar `as any` em `CustomerManager.tsx`
    - Remover cast `as any` no `.update()` usando tipo `Database["public"]["Tables"]["customers"]["Update"]`
    - Tipar corretamente o retorno de `getProfilePicture` para eliminar `(result as any).profilePictureUrl`
    - _Requisitos: 2.2, 2.8_

  - [x] 3.4 Eliminar `as any` em `AddCustomerDialog.tsx`
    - Remover cast `as any` no `.insert()` usando tipo `Database["public"]["Tables"]["customers"]["Insert"]`
    - _Requisitos: 2.2, 2.8_

  - [x] 3.5 Eliminar `as any` em `Admin.tsx`, `useWhatsApp.ts` e `PixelInjector.tsx`
    - `Admin.tsx`: remover `(c as any).licenciada_cadastro_url` — resolvido pela regeneração de tipos
    - `useWhatsApp.ts`: tipar resposta de `createInstance` para eliminar `(response?.qrcode as any)?.pairingCode`
    - `PixelInjector.tsx`: substituir `noscript as any` por cast para `Node`
    - _Requisitos: 2.2, 2.8_

  - [x] 3.6 Configurar regra ESLint `no-explicit-any`
    - Adicionar `"@typescript-eslint/no-explicit-any": "error"` em `eslint.config.js`
    - Verificar que o build compila sem erros TypeScript (`tsc --noEmit`)
    - _Requisitos: 2.4_

- [x] 4. Checkpoint — Type Safety
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implementar Proxy de Segurança para Evolution API
  - [x] 5.1 Criar Edge Function `evolution-proxy`
    - Criar `supabase/functions/evolution-proxy/index.ts`
    - Implementar interface `ProxyRequest { path, method, body? }`
    - Validar token Supabase via `supabase.auth.getUser()`
    - Ler `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` dos secrets
    - Encaminhar requisição para `${EVOLUTION_API_URL}/${path}` com header `apikey`
    - Retransmitir status HTTP e corpo JSON da resposta
    - Retornar 401 para token inválido, 400 para path ausente, 502 para erro de conexão
    - Incluir CORS headers
    - _Requisitos: 1.2, 1.3, 1.4, 1.5, 1.7, 1.9_

  - [ ]* 5.2 Escrever teste de propriedade: proxy adiciona apikey
    - **Propriedade 2: Proxy adiciona apikey em todas as requisições encaminhadas**
    - Gerar paths e bodies aleatórios com fast-check
    - Verificar: header apikey presente, path e body preservados
    - **Valida: Requisitos 1.3**

  - [ ]* 5.3 Escrever teste de propriedade: proxy rejeita sem token
    - **Propriedade 3: Proxy rejeita requisições sem token Supabase válido**
    - Gerar requisições com tokens inválidos/ausentes
    - Verificar: status 401, nenhuma chamada à Evolution API
    - **Valida: Requisitos 1.4, 1.5**

  - [ ]* 5.4 Escrever teste de propriedade: proxy retransmite respostas
    - **Propriedade 4: Proxy retransmite respostas da Evolution API sem alteração**
    - Gerar status codes e corpos JSON aleatórios
    - Verificar: resposta do proxy === resposta da Evolution API
    - **Valida: Requisitos 1.7, 1.9**

  - [x] 5.5 Refatorar `evolutionApi.ts` para usar o proxy
    - Alterar função interna `request()` para chamar `evolution-proxy` via fetch com token Supabase
    - Remover funções `getBaseUrl()`, `getApiKey()`, `getHeaders()`
    - Importar `supabase` de `@/integrations/supabase/client` para obter session token
    - Construir URL: `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/evolution-proxy`
    - Manter todas as funções exportadas com mesmas assinaturas
    - Manter tipos exportados: `EvolutionChat`, `EvolutionMessage`, `EvolutionContact`
    - _Requisitos: 1.2, 1.6, 1.8_

  - [ ]* 5.6 Escrever teste de propriedade: frontend roteia via proxy
    - **Propriedade 1: Frontend roteia todas as chamadas via proxy**
    - Gerar nomes de instância e payloads aleatórios com fast-check
    - Verificar: URL da requisição aponta para proxy, header Authorization presente
    - **Valida: Requisitos 1.2**

  - [x] 5.7 Atualizar testes existentes em `evolutionApi.test.ts`
    - Atualizar mocks para refletir novo formato de chamada (POST para proxy em vez de chamadas diretas)
    - Verificar que todos os testes existentes passam com a nova implementação
    - _Requisitos: 1.8, 1.10_

  - [x] 5.8 Remover variáveis de ambiente do frontend
    - Remover `VITE_EVOLUTION_API_URL` e `VITE_EVOLUTION_API_KEY` do `.env`
    - Verificar que nenhum arquivo referencia essas variáveis
    - Confirmar que `crm-auto-progress` continua usando secrets diretamente (sem alteração)
    - _Requisitos: 1.1, 1.6, 1.11_

- [x] 6. Checkpoint final — Todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Testes de propriedade validam propriedades universais de corretude com fast-check
- Testes unitários validam exemplos específicos e edge cases
- A ordem de implementação (Logger → Types → Proxy) vai do menor ao maior risco
