## Memória Longa para a IA de Vendas

Hoje a IA tem **memória curta** (últimas ~20 mensagens) + **resumo rolante** (`conversation_summary` que sobrescreve a cada 10 msgs). Isso é bom pra economizar tokens, mas **esquece histórico antigo**: se o lead voltou depois de 30 dias, a IA não lembra que ele já recusou por preço, já recebeu o vídeo X, ou que o nome do filho é Pedro.

### O que vou adicionar

**1. Tabela `customer_memory` (fatos persistentes por lead)**
Cada fato é uma linha curta, categorizada, com timestamp e fonte. Nunca é sobrescrita — só adicionada/desativada.

| campo | exemplo |
|---|---|
| `customer_id` | uuid |
| `category` | `preferencia`, `objecao`, `dado_pessoal`, `historico_compra`, `contexto_familiar`, `dor`, `midia_enviada` |
| `key` | `melhor_horario`, `motivo_recusa_anterior`, `nome_conjuge` |
| `value` | `"manhã"`, `"achou caro em 2024"`, `"Maria"` |
| `confidence` | 0.0–1.0 |
| `source` | `lead_disse`, `ocr`, `consultor`, `inferido` |
| `last_confirmed_at`, `expires_at` (opcional), `active` |

Index em `(customer_id, active, category)` pra busca rápida.

**2. Extração automática de fatos (`ai-extract-memory`)**
Edge function nova. Roda em background junto com o `ai-summarize-conversation` (a cada 10 msgs OU quando o lead manda info nova). Usa Gemini Flash-Lite com schema JSON estruturado pra extrair fatos novos da conversa recente e fazer upsert na `customer_memory`. Deduplica por `(customer_id, category, key)`.

**3. Injeção no prompt do `ai-sales-agent`**
No `loadContext`, além do `conversation_summary` atual, carrego os top 15 fatos ativos do lead (priorizando `objecao` e `preferencia` recentes) e injeto num bloco `[MEMÓRIA LONGA — fatos confirmados sobre este lead]`. Custo: ~200-400 tokens extras, vale muito.

**4. Memória cruzada (opcional, fase 2)**
Tabela `consultant_memory` com padrões aprendidos por consultor: "leads de Goiás respondem melhor ao vídeo X", "objeção 'já tenho solar' resolve com o áudio Y". Alimentada pelo `ai-learn-feedback` que já existe. Já temos `ai_learned_patterns` — só preciso ampliar o que a IA registra.

**5. Decay e privacidade**
- Fatos com `category=dado_pessoal` nunca expiram.
- Fatos com `category=preferencia` ou `objecao` decay de confidence em 90 dias.
- View `customer_memory_active` filtra `active=true AND (expires_at IS NULL OR expires_at > now())`.
- RLS: consultor lê só seus leads (igual `customers`).

### Arquivos

**Migration:**
- `customer_memory` (tabela + RLS + indexes + trigger updated_at)
- View `customer_memory_active`
- (Já temos `ai_learned_patterns` — sem mudanças)

**Edge functions novas:**
- `supabase/functions/ai-extract-memory/index.ts` — extrator JSON estruturado

**Edge functions editadas:**
- `supabase/functions/ai-sales-agent/index.ts` — `loadContext` carrega memória e injeta no prompt; após resposta, dispara `ai-extract-memory` em background a cada 10 msgs
- `supabase/functions/ai-summarize-conversation/index.ts` — passa a chamar também o extrator (1 trigger só)

**UI (opcional, posso fazer depois):**
- Aba "Memória" no modal do lead no CRM mostrando os fatos pra consultor revisar/editar/apagar

### Não toco em

- Botões do operador (`src/components/whatsapp/**`)
- `services/messageSender.ts`
- Tabelas existentes de credenciais
- `customers.conversation_summary` continua funcionando (resumo curto + memória estruturada = combo)

### Ordem

1. Migration (`customer_memory` + view + RLS)
2. Edge function `ai-extract-memory`
3. Editar `ai-sales-agent` pra ler e injetar
4. Trigger de extração junto do summarize
5. Teste com 2-3 conversas reais

Posso começar pela migration agora?
