## Objetivo

Eliminar os 4 riscos identificados no Fluxo da Camila, deixando o sistema robusto contra entradas inesperadas e fluxos antigos.

---

## 1. Regex de captura — cobrir casos reais

**Problema hoje:** só pega "R$ 380", "minha conta vem 450", CPF/telefone formatados. Falha em "trezentos reais", "quinhentos e cinquenta", "minha conta tá vindo uns quatrocentos", nome em minúsculas ("sou joão silva"), telefone sem DDD.

**Solução em camadas (cascata, do mais barato para o mais caro):**

1. **Regex expandido** (grátis, instantâneo):
   - Valor: aceita "380", "R$380", "R$ 380,50", "380 reais", "uns 400", "umas 500 pila"
   - Nome: aceita minúsculas após "sou/me chamo/meu nome é/aqui é", capitaliza automático
   - Telefone: aceita 8, 9, 10, 11 dígitos com/sem DDD, com/sem 9
   - CPF: 11 dígitos com qualquer pontuação

2. **Tabela de números por extenso** (grátis):
   - Mapa "cem→100, duzentos→200, trezentos→300...mil→1000"
   - Combina com "e cinquenta", "e poucos" → 350
   - Cobre 95% dos casos brasileiros sem chamar IA

3. **Fallback IA só se regex falhar E o campo está marcado para captura** (Gemini Flash, ~150 tokens):
   - Prompt curto: "Extraia {nome|valor|telefone|cpf} desta mensagem. Responda só JSON ou null."
   - Cache de 1h por (telefone + mensagem) para não gastar à toa
   - Timeout 3s — se falhar, segue sem capturar (não trava o fluxo)

**Validação pós-captura:**
- Valor entre R$ 30 e R$ 50.000 (descarta "1" ou "999999")
- Telefone com DDD válido brasileiro (lista DDDs)
- CPF com dígito verificador correto
- Nome com 2+ palavras, sem números, sem palavrão

Se inválido → ignora e loga, não salva lixo no `customers`.

---

## 2. Gemini no Plano B — blindar contra falha

**Problema hoje:** se Gemini falha, retorna formato estranho ou demora, o passo só repete sem aviso.

**Solução:**

1. **Schema rígido com `jsonSchema`** no `aiChat`:
   ```
   { next_step_key: enum[lista_de_steps_válidos], reason: string }
   ```
   Modelo é forçado a devolver um step que existe — impossível devolver "passo 99".

2. **Timeout de 4s + 1 retry** com prompt encurtado.

3. **Cascata de fallback explícita:**
   - IA falha/timeout → vai pro step configurado em "se IA falhar" (novo campo no Plano B)
   - Esse campo defaulta pra "repetir passo"
   - UI mostra checkbox: "Se a IA der erro, [repetir | ir pro passo X]"

4. **Rate limit awareness:** se vier 429 da gateway, marca conversa com flag e usa só regex+fallback fixo pelos próximos 60s (evita cascata de erros).

5. **Log visível no Admin:** painel "Decisões da IA" mostra últimas 50 chamadas com input, output, latência, erro. Já temos `ai_decisions` no banco — só precisa expor.

---

## 3. Conflito de regras — UI que avisa

**Problema hoje:** se o usuário cria 2 regras que pegam a mesma coisa (ex: "disse SIM" + "palavra-chave: sim"), a primeira ganha silenciosamente.

**Solução (frontend, sem mudança de backend):**

1. **Validação ao salvar o passo:**
   - Detecta intents duplicados (mesmo `intent` em 2 regras)
   - Detecta palavras-chave que sobrepõem ("sim" em palavra-chave + intent "afirmacao")
   - Mostra aviso amarelo: "⚠️ Estas 2 regras podem competir. A regra de cima sempre ganha."

2. **Botão de reordenar (drag handle)** já existe no array — adicionar dica visual: "↑ regras do topo têm prioridade".

3. **Simulador inline:** input "testar mensagem" no topo do passo. Usuário digita "sim quero", vê qual regra dispara. Roda o mesmo matcher do backend (extrair pra um util compartilhado).

4. **Bloqueio de regras impossíveis:**
   - "Plano B = repetir" + nenhuma regra → aviso vermelho "este passo nunca avança"
   - 2 regras 100% idênticas → impede salvar

---

## 4. Migração de fluxos antigos — converter sem trabalho manual

**Problema hoje:** fluxos criados antes da mudança têm regra "default" que virou "repetir" no Plano B. Usuário precisa abrir cada passo e reconfigurar.

**Solução (migração SQL única, idempotente):**

1. **Detectar transições antigas com `intent: "default"`:**
   - Se existe → mover o `to_step` dela pro `fallback.mode = "goto"` + `fallback.target_step`
   - Remover a regra "default" do array `transitions`
   - Roda em todos os `bot_flow_steps` existentes

2. **Detectar passos sem nenhuma regra E sem fallback configurado:**
   - Setar `fallback = {"mode": "ai", "prompt": "Decida o melhor próximo passo baseado no contexto da conversa."}`
   - Só pra fluxos com `is_active=true` (ativos)

3. **Banner no FluxoCamila** (mostrado uma vez, dismissível):
   > "Atualizamos o sistema de regras. Seus fluxos foram convertidos automaticamente. [Ver o que mudou] [Entendi]"

4. **Backup antes da migração:** copiar `transitions` atual pra coluna nova `transitions_backup_pre_v2 jsonb` — permite rollback se algo quebrar.

---

## Detalhes técnicos

**Backend** (`supabase/functions/whapi-webhook/handlers/conversational/index.ts`):
- Novo arquivo `_shared/captureExtractors.ts` com regex + tabela de extenso + validadores
- `extractCaptures()` chama cascata: regex → extenso → IA (se habilitado)
- `aiDecideFallback()` usa `jsonSchema` com enum de step_keys válidos + timeout 4s
- Wrapper `withAIFallback(fn, fallbackStep)` pra qualquer chamada de IA

**Frontend** (`src/pages/FluxoCamila.tsx`):
- `validateStepRules(step)` retorna array de warnings/errors
- `<RuleConflictBadge>` em cada regra duplicada
- `<StepSimulator>` collapsible no header do StepCard
- Banner de migração em `<FlowsList>` lendo flag em localStorage

**Migração** (SQL):
- Função `migrate_default_to_fallback()` rodada uma vez
- Coluna `transitions_backup_pre_v2` adicionada com cópia
- Adicionar `fallback.on_ai_error jsonb` (default `{"mode":"repeat"}`)

**Sem mudança em:**
- Cadastro / OCR / portal worker
- Mídia / atalhos globais
- Estrutura de `customers`

---

## Entrega

Migração SQL → backend (extractors + IA blindada) → frontend (validação + simulador + banner). Tudo numa parte. Aprovando, sigo.
