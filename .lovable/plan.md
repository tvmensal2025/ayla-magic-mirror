
## Decisão de stack
**Tudo via API direta do Google (`generativelanguage.googleapis.com`)** com `GEMINI_API_KEY` (já configurada). Zero migração para Lovable AI Gateway. Cria um helper único `_shared/gemini.ts` para padronizar chamadas, retry e logs.

## Estado atual (auditoria)
| Função | Modo hoje | Modelo |
|---|---|---|
| `ai-sales-agent` | Gateway Lovable | `google/gemini-3-flash-preview` |
| `ai-agent-router` | Gateway Lovable | `google/gemini-3-flash-preview` |
| `ai-transcribe-media` | Gateway Lovable | `google/gemini-3-flash-preview` |
| `ad-creative-builder` | **Google direto** | `gemini-2.5-flash` |
| `ad-creative-learner` | Gateway Lovable | `google/gemini-3-flash-preview` |
| `ad-creative-qa` | Gateway Lovable | `google/gemini-2.5-flash` |
| `ad-image-validator` | Gateway Lovable | `google/gemini-2.5-flash` |
| `ai-resize-image` | Gateway Lovable | `google/gemini-2.5-flash-image-preview` |
| `_shared/ocr.ts` | **Google direto** | `gemini-2.5-flash` |
| `_shared/image-validator.ts` | **Google direto** | `gemini-2.5-flash` |
| `igreen-chat`, `support-chat`, `extract-pdf-text` | Mistos | `gemini-2.5-flash` |

Todos serão padronizados para chamada **direta na API do Google**.

---

## Plano em camadas

### Camada 0 — Helper único `_shared/gemini.ts` (base de tudo)
Funções:
- `geminiGenerate({ model, system, contents, tools, toolChoice, temperature, maxOutputTokens, responseMimeType, responseSchema, thinkingBudget, signal })` → resposta normalizada `{text, toolCall, usage, raw}`.
- `geminiMultimodal({ model, prompt, parts: [{inlineData|fileData}], ... })` → vision/áudio.
- `geminiStream(...)` → SSE para chat.
- Retry com backoff exponencial em 429/5xx (3 tentativas).
- Fallback automático: se modelo Pro retornar 429, cai para Flash equivalente e marca `degraded:true` no resultado.
- Lê `GEMINI_API_KEY` (com fallback para `GOOGLE_AI_API_KEY`).
- Log estruturado opcional em `ai_usage_log` (modelo, tokens, latência, função, custo estimado).
- Zero dependência do Lovable AI Gateway.

### Camada 1 — Modelo certo por tarefa
| Função | Novo modelo Google | Por quê |
|---|---|---|
| `ai-sales-agent` (decisão de turno) | **`gemini-2.5-pro`** com `thinkingBudget: 2048` | Vende melhor: planeja, lê sinal de compra, escolhe tool certa |
| `ai-sales-agent` (`mode:rescue`) | `gemini-2.5-flash` | Texto curto, baixa latência |
| `ai-agent-router` | `gemini-2.5-flash-lite` | Roteamento simples e barato |
| `ad-creative-builder` | `gemini-2.5-pro` (thinking on) | Headlines/copies muito melhores |
| `ad-creative-learner` | `gemini-2.5-pro` (thinking high) | Aprende padrão de criativos vencedores |
| `ad-creative-qa` | `gemini-2.5-pro` | Pega política Meta — flash deixava passar |
| `ad-image-validator` | manter `gemini-2.5-flash` | Visão simples |
| `ai-resize-image` | manter `gemini-2.5-flash-image` | Edição de imagem |
| `_shared/ocr.ts` | `gemini-2.5-flash` + retry para `pro` se confiança < 0.7 | OCR mais preciso quando duvidar |
| `ai-transcribe-media` | `gemini-2.5-flash` | Transcrição rápida |
| `igreen-chat` / `support-chat` | `gemini-2.5-flash` | Chat usuário-final |

### Camada 2 — `ai-sales-agent` "100% vendendo no automático"
Mudanças no `index.ts` da função:
1. **Migrar do gateway Lovable para Google direto** via `geminiGenerate`. Tools ficam no formato `functionDeclarations` do Google (mapeio 1:1 com o `tools` atual).
2. **Thinking ativado** (`thinkingBudget: 2048`) — Gemini 2.5 Pro pensa antes de escolher a tool, corrige escolhas absurdas (mandar vídeo quando lead disse "cadastrar").
3. **Histórico subir 20 → 60 mensagens** (Supabase pago aguenta payload maior).
4. **System prompt em camadas** (fixo + dinâmico) para Gemini cachear o fixo.
5. **Novas tools**:
   - `update_lead_field` — IA corrige nome/distribuidora/valor de conta de forma estruturada quando o lead falar (ex: "minha conta vem 480 reais"), em vez de só responder em texto.
   - `confirm_and_handoff` — combina "confirma dados + passa pro humano" em **1 turno** (hoje precisa 2).
6. **Self-check barato**: depois do tool_call, 1 chamada `gemini-2.5-flash-lite` (max 30 tokens) recebe `{tool, args, ultimo_input}` e responde `OK | RISCO_<motivo>`. Se RISCO, força `send_text` neutro. Custa centavos e elimina alucinação.
7. **Few-shot positivo + negativo**: hoje só `feedback.rating=up`. Adicionar 3 exemplos `down` rotulados como "NÃO FAZER ASSIM".
8. **Score determinístico de intenção**: regex já existem (`RE_INTENT_CADASTRAR`); expandir e gravar `intent_detected` em `ai_decisions` para medir.

### Camada 3 — Fechamento automático ponta-a-ponta
- Quando OCR concluir + `name_source=ocr` + score ≥ 80 → webhook chama `ai-sales-agent` em modo novo `mode:"closer"` que **sempre** dispara `confirm_and_handoff` com mensagem padrão "Confirma {nome}, {distribuidora}, conta de R${valor}? Vou abrir seu cadastro."
- Nova edge function `ai-closer-cron` (a cada 10min): pega leads em `sales_phase='fechamento'` parados >30min sem resposta humana → manda resgate via `ai-sales-agent` em `mode:"rescue"`. Aproveita o headroom do Supabase pago.

### Camada 4 — Anúncios (`ad-creative-builder` + `learner` + `qa`)
- **Builder** já é Google direto — só upgrade para `gemini-2.5-pro` + `responseSchema` validado (em vez de `responseMimeType:json` solto).
- **Learner** vira job recorrente (a cada 6h via pg_cron): lê últimos 30d de `facebook_sync_metrics` filtrando CTR top decil → gera "playbook" salvo em `ad_playbooks`. Builder lê playbook do consultor antes de gerar.
- **QA** com `gemini-2.5-pro` direto: bloqueia publish se score < 0.7, devolve sugestão estruturada de fix.
- Nova função `ad-creative-rewriter`: pega criativo com CTR < média e reescreve usando playbook.

### Camada 5 — Observabilidade (essencial agora que vai gastar mais com Google)
- Tabela nova `ai_usage_log`: `function`, `model`, `tokens_in`, `tokens_out`, `latency_ms`, `cost_estimate_cents`, `outcome`, `degraded`, `created_at`.
- Painel Super Admin: card "Gasto Google IA hoje / 7d / 30d" + p95 latência por função + taxa de fallback.
- Alerta se `media_fallback_rate > 30%` em 1h ⇒ algo quebrado no prompt.

### Camada 6 — Robustez e custo
- `temperature` por tarefa: vendas 0.5, ad copy 0.8, QA 0.1, OCR 0.0, router 0.0.
- Embeddings via `text-embedding-004` (Google direto) para RAG simples: quando lead manda objeção, achar resposta vencedora histórica em `ai_decisions` (cosine similarity em memória, top-3). Helper em `_shared/rag.ts`.
- Timeout 25s, cap 3 tentativas. Se Pro 429 → Flash automático (e marca log).

### Camada 7 — Validação antes de fechar
1. `curl ai-sales-agent` com 5 conversas reais (cadastrar, "quanto economizo?", "não tenho interesse", áudio, foto) → snapshot da decisão antes/depois.
2. A/B 24h: 50% leads novos com `gemini-2.5-pro`, 50% mantém Flash. Comparar `qualification_score` médio e taxa de chegada em `fechamento`.
3. Builder: gerar 10 criativos antes/depois e rodar pelo `ad-creative-qa` → score médio precisa subir ≥ 15%.
4. Conferir `ai_usage_log` para garantir custo/lead < R$ 0,15.

---

## Arquivos que serão tocados
- `supabase/functions/_shared/gemini.ts` — **novo** (helper Google direto, retry, fallback, log)
- `supabase/functions/_shared/rag.ts` — **novo** (embeddings)
- `supabase/functions/_shared/ai-gateway.ts` — manter por compatibilidade, mas marcado deprecated
- `supabase/functions/ai-sales-agent/index.ts` — Pro + thinking + history 60 + self-check + novas tools + modo `closer` (Google direto)
- `supabase/functions/ai-agent-router/index.ts` — Flash-lite via Google direto
- `supabase/functions/ad-creative-builder/index.ts` — Pro + responseSchema (já é Google direto)
- `supabase/functions/ad-creative-learner/index.ts` — Google direto + Pro thinking
- `supabase/functions/ad-creative-qa/index.ts` — Google direto + Pro
- `supabase/functions/ad-creative-rewriter/index.ts` — **nova**
- `supabase/functions/ai-closer-cron/index.ts` — **nova**
- `supabase/functions/ai-transcribe-media/index.ts` — Google direto
- `supabase/functions/ad-image-validator/index.ts` — Google direto
- `supabase/functions/ai-resize-image/index.ts` — Google direto
- `supabase/functions/igreen-chat/index.ts` — já parcialmente Google direto, padronizar
- `supabase/functions/_shared/ocr.ts` — usar helper, fallback Pro
- migration: tabelas `ai_usage_log`, `ad_playbooks`; índice `customers(sales_phase, updated_at)`; cron `ai-closer-cron` cada 10min e `ad-creative-learner` cada 6h
- `src/components/superadmin/SystemHealthPanel.tsx` — card de custo/latência IA

## Riscos
- Gemini 2.5 Pro custa ~10× mais que Flash na API do Google. Mitigado por self-check em Flash-lite, prompts cacheáveis, e usar Pro só onde compensa (vendas + anúncios). Estimativa: +R$ 0,08 por lead.
- `thinkingBudget` adiciona 1–3s de latência. Para WhatsApp é aceitável (já responde em ~5s).
- `GEMINI_API_KEY` precisa de cota suficiente — confirmar no Google Cloud Console antes de subir Pro em produção.

## Pergunta antes de implementar
Quer que eu execute **tudo** acima, ou prefere fasear?
- **Fase A (vendas)**: Camadas 0–3, 6 — IA captando e fechando no automático.
- **Fase B (anúncios)**: Camada 4 — Builder/Learner/QA/Rewriter no Pro.
- **Fase C (observabilidade)**: Camada 5 — painel de gasto e latência.

Recomendo Fase A primeiro (resolve a dor imediata: vender sozinho), validar 48h, depois B e C juntas.
