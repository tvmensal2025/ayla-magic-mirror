## Diagnóstico

### 1. Fluxo segue os passos e regras?
Hoje o motor v3 (`_shared/flow-engine/v3-loader.ts` + `v3-dispatcher.ts`) está correto: carrega passos por variante A/B/C, resolve mídia por `slot_key` filtrando `active=true`, respeita ordem e regra "nunca repetir áudio/vídeo".

Porém o **caminho legado** ainda ativo em `whapi-webhook/handlers/bot-flow.ts` (e espelho em `evolution-webhook/handlers/bot-flow.ts`) tem brechas:

- **Linhas 1548-1554** (e 1411): quando o passo tem `media_id` salvo no JSON do fluxo, a query busca `ai_media_library` por id **sem filtrar `active=true`** → mídia "removida" continua sendo enviada.
- Mistura de fontes: alguns trechos filtram `active=true` + `is_draft=false` (1562, 1572, 1706, 1721), outros não. Inconsistência por passo.
- `bot_paused` / `assigned_human_id` já são respeitados (memória human-takeover-silence), ok.
- Re-welcome rule (≥4h reseta capture_*) ok.

### 2. Por que excluir mídia não some
`StepMediaPanel.removeMedia` faz **soft delete** (`active=false`) + remove do storage. Funciona para v3-loader, mas o webhook legado lê pelo `media_id` **sem checar `active`**, então o cliente continua recebendo o arquivo até o cache do CDN expirar (e mesmo assim a URL pública continua válida).

### 3. IA "não está sendo inteligente indo em conhecimento"
- `ai-orchestrator.ts` já existe (Triagem Gemini Flash → GPT-5.5 → Gemini 3.1 Pro RAG via `answerFaqWithAI`) — mas é chamado **só em um único ponto** (`bot-flow.ts:1916`, fallback global).
- O passo `esclarecer_duvidas` (`bot-flow.ts:1077`) chama `answerFaqWithAI` **direto**, pulando a triagem/orquestrador, então perde contexto da conversa, persona do consultor, resumo persistente e roteamento (handoff, clarify, etc.).
- A RAG (`ai-faq-answerer.ts` + `ai_knowledge_sections`) só busca por similaridade dentro de um único turno — sem expansão de query nem reranking → respostas genéricas quando a pergunta é fora do FAQ.

---

## Plano de correção

### Parte A — Bug "mídia excluída continua sendo enviada" (rápido, alto impacto)

1. **`whapi-webhook/handlers/bot-flow.ts`** linha ~1549 e ~1411: na query `.from("ai_media_library").select(...).eq("id", m.media_id)`, adicionar `.eq("active", true).eq("is_draft", false)`. Se vier nulo, cair no fallback por `slot_key` (que já filtra correto).
2. Mesma correção no espelho **`evolution-webhook/handlers/bot-flow.ts`** (linhas equivalentes ~1411, ~1550, ~1688).
3. Em `StepMediaPanel.saveAllChanges` (linhas 332-369): após `update active=false`, **também** zerar `media_id` em `flow_steps`/JSON que apontem para essa mídia (defesa em profundidade), e invalidar o cache do CDN MinIO renomeando para `…/_deleted/…` (opcional).
4. Migration de saneamento: `UPDATE ai_media_library SET active=false WHERE active IS NULL;` e adicionar índice parcial `(consultant_id, slot_key) WHERE active=true`.

### Parte B — Auditoria de fluxo (garantir que sempre segue regras)

Adicionar suíte de testes E2E em Deno (`supabase/functions/whapi-webhook/handlers/bot-flow_test.ts`) cobrindo:
- A vs B vs C (áudio / texto / vídeo) — ordem text→audio→video→image.
- Cliente envia foto da conta no meio do `capture_*` → OCR + revisão.
- Cliente faz pergunta fora do FAQ no meio do fluxo → orquestrador, **não** legacy welcome.
- Mídia marcada `active=false` não chega ao cliente.
- Reentrada ≥4h reseta corretamente.
- `bot_paused=true` silencia tudo (já coberto, validar).

E um painel novo em **`/admin/saude-bot`** com lista das últimas 50 conversas mostrando: passo atual, última mídia enviada, se a IA foi acionada e modelo usado (já temos `ai_decisions` — só renderizar).

### Parte C — Cérebro IA "melhor": dois modelos cooperando

Manter a arquitetura já existente, mas **ampliar e plugar em todos os pontos**:

```
                ┌─────────────────────┐
 mensagem  ───▶│ TRIAGEM             │   Gemini 3 Flash (barata, <300ms)
                │ classifica rota     │
                └──────┬──────────────┘
                       │ needs_orchestrator?
                ┌──────▼──────────────┐
                │ ORQUESTRADOR        │   GPT-5.5 (raciocínio, tool-calling)
                │ decide ação + tom   │   - injeta resumo + persona + memórias
                │ tool: use_rag?      │     do cliente (customer_memory_active)
                └──────┬──────────────┘
                       │ use_rag=true
                ┌──────▼──────────────┐
                │ ESPECIALISTA RAG    │   Gemini 3.1 Pro
                │ responde com fontes │   - busca híbrida (vetor + keyword)
                │ ai_knowledge_…      │   - reranking top-8 → top-3
                └─────────────────────┘
```

Mudanças concretas:
1. **`ai-orchestrator.ts`**: adicionar tool `search_knowledge(query, expand=true)` que faz query expansion (GPT reescreve a pergunta em 3 variações antes de buscar) — resolve "IA não vai em conhecimento".
2. **`ai-faq-answerer.ts`**: adicionar etapa de **reranking** com Gemini Flash (pega top-8 por similaridade, reordena por relevância antes de mandar pro Pro). Tabela já existe.
3. Substituir chamada direta a `answerFaqWithAI` no passo `esclarecer_duvidas` (linha 1077) por `runOrchestrator(...)` — mesmo cérebro em todo lugar.
4. **Persona por consultor** (`consultants.ai_persona` já existe — memória ai-orchestrator) é injetada no system prompt do GPT-5.5; expor edição no `/admin/saude-bot`.
5. **Memória persistente** (`customers.conversation_summary` já existe, atualizada via `ai-summary.ts`) — confirmar que está rodando a cada 6 turnos e injetada no orquestrador.
6. **Custo/observabilidade**: `ai_costs` já existe; adicionar alerta no `/admin/saude-bot` se custo/dia > X.

### Parte D — Fallback e segurança

- Cascata já configurada em `ai-gateway.ts` (GPT-5.5 → 5.4 → 5-mini; Gemini 3.1 Pro → 2.5 Pro → 2.5 Flash). Validar com teste forçando 429.
- Anti-loop: `ai_followups_count >= 3` → handoff (já existe). Confirmar no painel.

---

## Ordem de execução sugerida

1. **Hoje (crítico)**: Parte A.1 + A.2 (4 linhas de código por arquivo) — para a mídia excluída sumir já.
2. **Esta semana**: Parte C.3 (orquestrador no `esclarecer_duvidas`) + C.1 (query expansion) — IA fica realmente inteligente.
3. **Próxima**: Parte B (testes + painel) + Parte C.2 (reranking) + Parte D (validar fallback).
4. **Opcional**: Parte A.3/A.4 (defesa em profundidade) + C.4/C.5 painel persona/memória.

## Detalhes técnicos relevantes

- Modelos disponíveis no Lovable AI Gateway: `openai/gpt-5.5`, `openai/gpt-5.5-pro`, `google/gemini-3.1-pro-preview`, `google/gemini-3-flash-preview` — combinação **GPT-5.5 orquestrador + Gemini 3.1 Pro especialista** é exatamente o que você pediu e já está parcialmente em produção.
- Não cria tabelas novas. Usa: `ai_media_library`, `ai_knowledge_sections`, `customer_memory_active`, `customers.conversation_summary`, `consultants.ai_persona`, `ai_decisions`, `ai_costs` — todas já existem.
- Caminho legacy (whapi/evolution) continua em paralelo ao v3; correções precisam acontecer nos dois até o rollout v3 100% (memória flow-engine-v3-rollout).

Posso começar pela Parte A (correção da mídia) e Parte C.3 (orquestrador unificado) — é o que entrega mais valor por hora investida.
