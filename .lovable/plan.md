## Objetivo

Simplificar o Construtor de Fluxos para o modelo "Pergunta do cliente → Resposta da IA". O usuário cadastra perguntas que clientes costumam fazer e, para cada uma, a resposta (áudio, vídeo, texto, ou combinação). A IA continua conduzindo a conversa, mas sempre usando essas respostas pré-aprovadas quando a pergunta bater.

## Como vai ficar (visão do usuário)

Página `/admin/fluxos` reformulada em **lista de "Perguntas & Respostas"** — cada item é um cartão simples:

```text
┌─────────────────────────────────────────────────┐
│ ❓ Pergunta do cliente                          │
│ [Quanto custa?  /  É caro?  /  Tem taxa?]      │ ← variações
│                                                 │
│ 💬 Como a IA responde                           │
│ ☑ Enviar áudio:  [▶ audio_preco.mp3]  [trocar] │
│ ☑ Enviar vídeo:  [▶ explicacao.mp4]   [trocar] │
│ ☐ Enviar texto:  [_________________________]   │
│                                                 │
│ Ordem: 1) Áudio  2) Vídeo                       │
│                                                 │
│              [Excluir]  [Salvar]                │
└─────────────────────────────────────────────────┘
```

No topo:

- **Abertura da conversa** (uma seção fixa) — qual áudio/vídeo a IA envia no primeiro contato e a primeira pergunta que ela faz (ex.: "Qual seu nome?").
- **Encerramento** (seção fixa) — quando enviar o link de cadastro e o que falar junto.
- Botão **"+ Nova pergunta"** para adicionar mais Q&A.
- Toggle **"IA segue 100% essas respostas"** — quando ligado, se o cliente perguntar algo que case com uma pergunta cadastrada, a IA usa exatamente aquela resposta. Quando desligado, a IA usa como sugestão.

Cada cartão de Q&A tem:

1. **Variações da pergunta** (chips editáveis) — ex.: "Quanto custa", "É caro", "Tem taxa". A IA reconhece qualquer variação como a mesma intenção.
2. **Mídias da resposta** — checkbox + seletor de mídia da biblioteca já existente (`ai_media_library` / `ai_agent_slots`):
   - Áudio (opcional)
   - Vídeo (opcional)
   - Texto (opcional)
3. **Ordem de envio** — drag simples para definir se manda áudio antes do vídeo, etc.
4. **Botão "Testar"** — abre simulação: digita a pergunta de teste e mostra o que a IA enviaria.

## Como está hoje

A página atual (`src/pages/FlowBuilder.tsx`) usa **passos sequenciais drag-and-drop** com tipos abstratos (`audio_slot`, `message`, `question`, `media_request`, `cadastro`). Para um usuário não-técnico isso é confuso: precisa entender a ordem global, slots, "wait_for", etc. O modelo Q&A é mais natural — ele pensa "se o cliente perguntar X, eu quero responder Y".

## Detalhes técnicos

### Banco

Reaproveita `bot_flows` (mantém `is_active`, `strict_mode`). Substitui `bot_flow_steps` por uma estrutura Q&A:

- `bot_flow_qa` — `id`, `flow_id`, `position`, `intent_name` (label curto, ex.: "preço"), `is_opening` (bool), `is_closing` (bool), `text_response`, `created_at`, `updated_at`.
- `bot_flow_qa_triggers` — `id`, `qa_id`, `phrase` (uma variação por linha, ex.: "quanto custa").
- `bot_flow_qa_media` — `id`, `qa_id`, `position`, `media_kind` (`audio`|`video`|`image`), `media_id` (FK opcional para `ai_media_library`), `slot_key` (FK opcional para `ai_agent_slots`).

RLS: dono do `bot_flows.consultant_id` gerencia tudo via EXISTS.

Migração faz seed: para cada `bot_flows` existente, cria 1 abertura ("Boas-vindas") + 4 Q&A padrão ("Como funciona", "Quanto custa", "Sou de qual distribuidora", "Quero me cadastrar") apontando para os slots já existentes em `ai_agent_slots`.

A tabela antiga `bot_flow_steps` é mantida (não dropada) para não quebrar nada que já leia dela; o novo construtor ignora ela.

### Frontend

- `src/pages/FlowBuilder.tsx` reescrito do zero (componente único, sem drag-and-drop global; só drag dentro das mídias de cada Q&A).
- Componentes:
  - `OpeningCard` — abertura fixa (áudio/vídeo + texto da primeira pergunta).
  - `QACard` — um por pergunta, com chips de variações (input + Enter), checkboxes de mídia, mini-player inline.
  - `MediaPicker` — modal que lista áudios/vídeos da `ai_agent_slots` e `ai_media_library` do usuário com preview.
  - `ClosingCard` — encerramento (mensagem + link de cadastro).
- Hook `useBotFlowQA(flowId)` para CRUD com cache local + autosave debounce 800 ms.
- Toast em cada salvamento.

### Backend (`ai-agent-router`)

- Carrega Q&A do fluxo ativo do consultor.
- Antes de chamar o LLM, faz **match de intenção** simples: normaliza a mensagem do cliente (lowercase, sem acento) e procura por substring contra `bot_flow_qa_triggers.phrase`. Se bater:
  - Se `strict_mode=true`: envia exatamente as mídias da Q&A na ordem definida e retorna.
  - Se `strict_mode=false`: passa as mídias como "resposta sugerida" no prompt do LLM (que pode adaptar o texto, mas mantém as mídias).
- Abertura (`is_opening=true`) é usada no primeiro contato em vez do slot `boas_vindas` quando existir.
- Encerramento (`is_closing=true`) dispara quando o cliente confirma interesse final, junto com o link `/cadastro/{licenca}`.

### Validações & UX

- Não pode salvar Q&A sem pelo menos uma variação e uma mídia/texto.
- Aviso visual se a mesma frase aparecer em duas Q&A diferentes.
- Botão "Testar pergunta" usa edge function existente para simular sem disparar WhatsApp.

## Entregáveis

1. Migração: 3 tabelas novas + RLS + seed para fluxos existentes.
2. `FlowBuilder.tsx` reescrito no modelo Q&A.
3. `MediaPicker` reutilizando bibliotecas existentes.
4. Atualização do `ai-agent-router` para casar pergunta → resposta.
5. Tabela antiga `bot_flow_steps` mantida intocada (rollback fácil).

## Fora de escopo

- Match semântico via embeddings (por ora só substring + sinônimos manuais nas variações).
- Ramificações condicionais ("se cliente disse X antes, responder Y").
- Importar/exportar Q&A em CSV.