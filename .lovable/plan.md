## Diagnóstico

Reli `supabase/functions/ai-sales-agent/index.ts` (905 linhas), o `systemPrompt`, o bloco de contexto e a biblioteca `ai_media_library`. Problemas concretos encontrados:

### 1. Pede cidade sem necessidade
- `systemPrompt` linha 247: "ABERTURA — Olá neutro + UMA pergunta de qualificação (cidade/distribuidora)".
- `sanitizeHumanMessage` linha 354 fallback: `"Olá! Tudo bem? Você é de qual cidade?"`.
- Self-check linha 830 também devolve: `"qual a sua cidade e qual a média da sua conta de luz?"`.
- O `[Contexto do lead]` linha 572 ainda imprime `Cidade: ?/?` reforçando ao modelo que falta esse dado.

### 2. Re-pergunta dados que já estão salvos
- O contexto envia todos os campos com `?` quando vazios, mas **não diz ao modelo o que NÃO perguntar**. Falta a regra explícita: "campos com valor preenchido = NÃO repergunte; campos com `?` = pode perguntar UM por vez, na ordem distribuidora → valor".
- Não há lista negativa de perguntas já feitas (poderíamos derivar do histórico recente).

### 3. Vídeo curto não é regra para dúvidas
- O vídeo "1. Conexão Green – Apresentação (1min)" hoje está em `step_tags=[descoberta, pitch, any]` e `intent_tags=[any]`.
- Para objeções/dúvidas (`"como funciona"`, `"é golpe?"`, `"tem custo?"`) o sistema só lista reportagens de TV — sem garantia de enviar o explicador de 1 min.
- Falta uma regra de prioridade: "se intent = informacao | objecao_confianca | objecao_custo e ainda não enviei o vídeo de 1min, envie ele primeiro".

### 4. Outros pontos que ainda travam a IA
a. **Self-check força mensagem ruim** (linha 830) sempre que bloqueia — mensagem genérica pede cidade+valor.  
b. **Score+modelo**: `phase==="objecao"` força Pro (latência +1-2s), mas a maioria das objeções é resolvida com 1 vídeo + 1 frase — Flash basta.  
c. **`mode==="closer"` sempre dispara `confirm_and_handoff`** mesmo se OCR ainda não confirmou nome confiável — precisa exigir `nameSourceTrusted`.  
d. **`bill_requested_recently`** usa janela de 10 min — se o lead demora 12 min para mandar a foto e a IA é chamada de novo, ela repede. Subir para 60 min.  
e. **Few-shot positivo/negativo** roda em TODA chamada (2 queries extras a cada resposta). Cachear por consultor/15min ou só carregar quando phase ∈ {objecao, fechamento}.  
f. **`ask_for_name`** dispara mesmo quando o lead acabou de mandar foto (OCR vai trazer o nome). Bloquear `ask_for_name` se `bill_requested_at` recente OU `electricity_bill_photo_url` presente.  
g. **`update_lead_field` sem next_phase** não avança fase — schema marca `next_phase` como opcional. Tornar obrigatório.

---

## Plano de execução

Tudo em **`supabase/functions/ai-sales-agent/index.ts`** (1 arquivo) + 1 update SQL na `ai_media_library`.

### Passo 1 — Remover pergunta de cidade
- `systemPrompt` linha 247: trocar para `"ABERTURA — Olá neutro. UMA pergunta: distribuidora OU valor médio da conta. NÃO pergunte cidade — já sabemos pela campanha."`.
- `sanitizeHumanMessage` fallbacks: trocar `"Você é de qual cidade?"` por `"Qual a média da sua conta de luz?"`.
- Self-check fallback (linha 830): trocar para `"Para eu te dar o número certo: qual a média da sua conta de luz?"`.
- `contextLine`: omitir a linha `Cidade:` quando vazia (só mostrar quando preenchida pelo OCR).
- Remover `address_city` do enum de `update_lead_field` (continua sendo gravado pelo OCR, mas a IA não pergunta).

### Passo 2 — Não repetir dados já preenchidos
- No `contextLine`, separar em dois blocos:
  - `[JÁ SABEMOS — não pergunte de novo]`: lista só os campos preenchidos.
  - `[FALTA DESCOBRIR — pergunte UM por vez, nesta ordem]`: lista só os campos vazios, na ordem `distribuidora → valor → dor`.
- Adicionar ao prompt: "Se um campo está em [JÁ SABEMOS], use-o livremente, NUNCA pergunte de novo. Se a conta foi recebida, todos os campos vêm dela — pule direto para confirmação."

### Passo 3 — Vídeo de 1min como regra para dúvidas
- **SQL update** (insert tool) em `ai_media_library` para o vídeo `"1. Conexão Green – Apresentação (1min)"`:
  - `step_tags = ['abertura','descoberta','pitch','objecao','any']`
  - `intent_tags = ['any','informacao','objecao_confianca','objecao_custo','duvida']`
  - `priority = 100` (puxar para o topo da lista candidata).
- No prompt, adicionar regra explícita: "Quando o lead demonstrar dúvida/objeção sobre como funciona, confiança ou custo, e o vídeo 'Conexão Green – Apresentação (1min)' ainda não foi enviado neste lead, **prefira `send_media` com ele em vez de explicar por texto**."
- No backend, calcular `mustSendIntroVideo = intentDetected ∈ {informacao, objecao_confianca, objecao_custo} && !sentMediaIds.has(introVideoId)` e, se verdadeiro, **forçar** decisão como `send_media` desse vídeo (mesmo que o LLM tenha escolhido `send_text`), com caption curta gerada pelo modelo.

### Passo 4 — Correções pontuais
- `useProModel`: remover `phase === "objecao"` da condição (manter só `closer`, `fechamento`, `score>=70`, `billAlreadyReceivedEarly`).
- `mode === "closer"`: só executar se `nameSourceTrusted && ocrDone`. Caso contrário cair em modo `reply` normal.
- Subir `bill_requested_recently` de 10 min para 60 min.
- Few-shot: carregar `positive`/`negative` apenas quando `phase ∈ {objecao, fechamento}`.
- Bloquear `ask_for_name` se `customer.electricity_bill_photo_url` ou `bill_requested_at` < 60 min (forçar fallback `send_text` neutro).
- `update_lead_field`: marcar `next_phase` como `required` no schema da tool.

### Passo 5 — Validação
- `supabase functions deploy ai-sales-agent` (automático).
- `supabase--curl_edge_functions` simulando 3 cenários: (a) primeira mensagem → não pede cidade, (b) lead diz "como funciona?" → retorna `send_media` com o vídeo de 1min, (c) lead com `electricity_bill_value=350` salvo → IA não pergunta valor de novo.
- Inspecionar `ai_decisions` recentes para confirmar que `intent_detected` e `tool_called` batem com o esperado.

---

## Detalhes técnicos (resumo das edições)

| Local | Mudança |
|---|---|
| `systemPrompt` | Reescrever bloco "FUNIL DE VENDAS" para remover cidade; adicionar regra do vídeo de 1min |
| `sanitizeHumanMessage` fallbacks | Trocar mensagem padrão de abertura |
| `contextLine` | Dividir em `[JÁ SABEMOS]` / `[FALTA DESCOBRIR]`; omitir cidade |
| `tools[update_lead_field]` | Remover `address_city` do enum; tornar `next_phase` obrigatório |
| Após `toolCallG` resolvido | Forçar `send_media` do intro video quando intent indicar dúvida/objeção e ainda não enviado |
| `useProModel` | Tirar `phase==="objecao"` |
| `mode==="closer"` guard | Exigir `nameSourceTrusted && ocrDone` |
| `billRequestedRecently` | 10 min → 60 min |
| Few-shot queries | Só rodar em phase objecao/fechamento |
| `ask_for_name` guard | Bloquear se foto/pedido recente |
| SQL `ai_media_library` | Re-tagear vídeo de 1min para `objecao` + `informacao` + priority 100 |

Sem mudanças de UI nem em outros arquivos. Tudo concentrado em 1 edge function + 1 update de dados.
