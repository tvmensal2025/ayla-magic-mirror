## Objetivo

Criar uma página dedicada (`/admin/fluxos`) para montar visualmente o fluxo de conversa do bot do início ao fim — desde o áudio de boas-vindas até o cadastro final. Hoje a configuração é fragmentada em "slots" soltos (boas_vindas, como_funciona, fazenda_solar, chamada_cadastro…) sem ordem explícita. O construtor vai amarrar tudo em uma sequência clara, fácil de editar, e permitir marcar o fluxo como "100% obrigatório" (o bot segue exatamente aquela ordem).

## Como está hoje

- Tabela `ai_agent_slots` com 8 slots independentes (boas_vindas, confirma_recebimento, como_funciona, fazenda_solar, objecao_preco, objecao_distribuidora, prova_social, chamada_cadastro), cada um com áudio/vídeo/texto e `position` (mas sem agrupamento por fluxo).
- O LLM em `ai-agent-router` escolhe o slot livremente conforme contexto; só `boas_vindas` é forçado no primeiro contato.
- Cadastro acontece fora do fluxo (página `/cadastro/:licenca`), sem estar representado como passo do bot.

## Como vai ficar

Nova página com:

1. **Lista de fluxos** (sidebar esquerda) — ex.: "Fluxo Padrão", "Fluxo Curioso", "Fluxo Direto". Botão "+ Novo fluxo".
2. **Editor do fluxo selecionado** (centro) — sequência vertical de cards (passos), reordenável por drag-and-drop.
3. Cada **passo** tem:
   - Tipo: `audio_slot` (reutiliza um slot existente) | `mensagem_texto` | `pergunta` (espera resposta do lead) | `pedir_midia` (foto da conta / documento) | `cadastro` (envia link `/cadastro/:licenca`).
   - Quando avançar: "após resposta do lead" | "após X segundos" | "após confirmação".
   - Condição opcional (ex.: "se lead disser 'como funciona'") — para ramificações simples.
4. **Switch "Seguir 100% este fluxo"** no topo do fluxo. Quando ligado, o bot ignora a escolha livre do LLM e segue passo a passo. Quando desligado, o LLM escolhe (comportamento atual).
5. **Botão "Ativar fluxo"** — só um fluxo fica ativo por tenant por vez.
6. **Visualização "Antes → Depois"** no topo da primeira vez: coluna esquerda mostra os 8 slots soltos atuais, coluna direita mostra a proposta sequencial sugerida (boas_vindas → pergunta_nome → pergunta_valor_conta → como_funciona → fazenda_solar → prova_social → pedir_conta_luz → confirma_recebimento → pedir_documento → chamada_cadastro → cadastro). Botão "Aplicar como meu fluxo".

### Fluxo padrão pré-montado (sugerido)

```text
1. Áudio: boas_vindas                    (espera resposta = nome)
2. Texto: "{nome}, qual o valor médio da sua conta de luz?"  (espera resposta)
3. Áudio: como_funciona                  (auto-avança)
4. Áudio: fazenda_solar                  (auto-avança)
5. Áudio: prova_social                   (auto-avança)
6. Pedir mídia: foto da conta de luz     (espera upload)
7. Áudio: confirma_recebimento           (auto-avança)
8. Pedir mídia: documento com foto       (espera upload)
9. Áudio: chamada_cadastro               (auto-avança)
10. Cadastro: envia link /cadastro/{licenca} + acompanha conclusão
```

## Detalhes técnicos

### Banco

Migração nova:

- `bot_flows` — `id`, `tenant_id` (consultant), `name`, `is_active boolean`, `strict_mode boolean` (o "100%"), `created_at`.
- `bot_flow_steps` — `id`, `flow_id`, `position int`, `step_type` (`audio_slot`|`message`|`question`|`media_request`|`cadastro`), `slot_key` (FK opcional para `ai_agent_slots`), `message_text`, `wait_for` (`reply`|`media`|`timer`|`none`), `wait_seconds int`, `condition_text`, `next_step_id` (opcional para ramificação), `created_at`.
- RLS: tenant lê/escreve seus próprios fluxos; super-admin lê tudo.
- Índice em (`tenant_id`, `is_active`).

### Frontend

- Nova rota `/admin/fluxos` em `App.tsx`, link no menu do `Admin.tsx`.
- Página `src/pages/FlowBuilder.tsx` com:
  - `FlowList` (sidebar) — lista, criar, duplicar, deletar.
  - `FlowEditor` — header (nome editável, switch strict, botão Ativar/Salvar), `StepList` com `@dnd-kit/sortable` para reordenar.
  - `StepCard` — editor inline por tipo (select de slot, textarea de mensagem, etc.).
  - `BeforeAfterDiff` — modal/aba mostrando estado atual vs. fluxo sugerido, com botão "Aplicar".
- Hook `useBotFlows(tenantId)` para CRUD + cache.
- Reaproveita `ai_agent_slots` no select de `audio_slot`.

### Backend (edge function)

- `ai-agent-router/index.ts`: no início, buscar fluxo ativo do tenant. Se existir e `strict_mode=true`, calcular passo atual a partir de `customer.conversation_step` (já existe coluna), executar exatamente aquele step e avançar. Se `strict_mode=false`, manter LLM livre mas usar a ordem do fluxo como dica de prioridade.
- Novo helper `getCurrentFlowStep(customer, flow)` que devolve `{ step, isLast }`.
- Quando step = `cadastro`, enviar link personalizado e marcar `customer.cadastro_link_sent_at`.

### Validações

- Não permitir ativar dois fluxos ao mesmo tempo (constraint parcial unique em `is_active where is_active=true`).
- Salvar com debounce; toast de confirmação.
- Botão "Testar fluxo" que abre uma simulação textual passo a passo (sem disparar WhatsApp).

## Entregáveis

1. Migração com as duas tabelas + RLS.
2. Página `/admin/fluxos` totalmente funcional (CRUD, drag-and-drop, strict toggle, ativar).
3. Fluxo padrão pré-populado para tenants existentes (seed na migração).
4. Atualização do `ai-agent-router` para respeitar fluxo ativo + strict_mode.
5. Link no menu admin.

## Fora de escopo (próxima iteração)

- Ramificações condicionais visuais (if/else gráfico) — por ora só `condition_text` em texto livre.
- A/B testing entre fluxos.
- Importar/exportar fluxo em JSON.
