## O que vai mudar (em linguagem simples)

Hoje o Fluxo da Camila mostra 6 passos fixos (vêm do código). Você só edita o **texto** de cada um — não dá pra adicionar passo novo, reordenar, desativar ou mudar para qual passo cada resposta leva. O bot no WhatsApp também segue essas regras fixas.

Vou trocar isso por um **construtor de fluxo**, onde você decide tudo:

- ✅ Editar/apagar texto de qualquer passo (já funciona, vai continuar)
- ✅ **Adicionar passos novos** (ex.: Passo 7 — "Reforço de prova social")
- ✅ **Reordenar** arrastando ou com setas pra cima/baixo
- ✅ **Desativar** um passo sem apagar
- ✅ **Escolher pra onde cada resposta leva** — ex.: se o lead diz "sim", você escolhe se vai pro Passo 4, 5 ou pro Cadastro
- ✅ **Mídia (áudio/imagem/vídeo)** continua linkada por passo, da Biblioteca que você já tem

E o mais importante: **a Camila no WhatsApp passa a obedecer o seu fluxo** em vez do fluxo fixo do código.

## Como vai ficar a tela

Cada passo vira um cartão com:

1. Cabeçalho: número, título editável, botão de ⬆️⬇️ pra reordenar, switch pra ativar/desativar, ✏️ renomear, 🗑️ apagar
2. Mídias do passo (do StepMediaPanel que já existe)
3. Texto da mensagem (editável, com sugestão automática como já faz hoje)
4. **"Para onde vai depois"** — uma lista de regras tipo:
   - `Se o lead disser "sim/quero/vamos"` → vai para `Passo X`
   - `Se o lead disser "não/depois"` → vai para `Passo Y`
   - `Qualquer outra coisa` → vai para `Passo Z` (ou repete)
   
   Cada regra tem: gatilho (palavras/intenção) + destino (dropdown com os passos existentes + "Cadastro" + "Aguardando humano").
5. Botão grande "+ Adicionar passo" no fim da lista.

Os 2 atalhos globais ("quero cadastrar" e "quero falar com humano") continuam fixos no topo, como hoje.

## Detalhes técnicos

**Banco de dados** — já existem as tabelas `bot_flows`, `bot_flow_steps` e `bot_flow_qa` (do FlowBuilder antigo). Vou:

- Adicionar colunas faltantes em `bot_flow_steps`: `title`, `summary`, `icon`, `is_active`, `media_order` (jsonb), `transitions` (jsonb com `[{trigger_intent, trigger_phrases[], goto_step_id}]`).
- Criar 1 fluxo "Camila" por consultor automaticamente (seed do fluxo atual hardcoded).
- O texto da mensagem do passo passa a viver em `bot_flow_steps.message_text` (já existe). Mantém `bot_messages` só pra fallback global e mensagens de sistema.

**Frontend** — refatorar `src/pages/FluxoCamila.tsx`:
- Carregar passos de `bot_flow_steps` em vez do array `FLUXO` hardcoded.
- Componentes novos: `<StepCard>`, `<TransitionRow>`, `<AddStepButton>`.
- Reordenação otimista (UI reordena na hora, salva `position` em background).
- StepMediaPanel continua igual (já está bom).

**Backend (bot do WhatsApp)** — `supabase/functions/whapi-webhook/handlers/conversational/state-machine.ts`:
- Trocar a função `decideTransition` hardcoded por uma versão que carrega o fluxo do consultor de `bot_flow_steps` + `transitions` e decide o próximo passo a partir disso.
- Manter os 2 overrides globais (`quero_cadastrar`, `quero_humano`) e a entrada do Cadastro (que continua intacto).
- Fallback: se o consultor ainda não tem fluxo customizado, usa o seed padrão (mesmo conteúdo de hoje) — ninguém quebra.

**Migração de dados** — criar uma migration que, pra cada consultor existente, semeia um `bot_flows` ativo + 6 `bot_flow_steps` espelhando o fluxo atual + transitions equivalentes ao state-machine atual. Ninguém perde nada.

## O que **não** muda

- Cadastro (OCR + portal iGreen) continua intocado.
- Biblioteca de áudios/vídeos/imagens (`ai_media_library`) continua igual — só passa a ser linkada via `bot_flow_steps.id` em vez de `slot_key` fixo.
- Atalhos globais continuam funcionando em qualquer passo.

## Entrega em 3 partes (pra você ir validando)

1. **Migração + seed** do banco com o fluxo atual replicado (você não vê diferença, mas a base já tá pronta).
2. **Tela nova de edição** do Fluxo da Camila (você já consegue mexer, mas o bot ainda usa o código antigo).
3. **Bot passa a ler do banco** — aí suas mudanças passam a valer pra valer no WhatsApp.

Aprovando, começo pela parte 1.