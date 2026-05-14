## Objetivo

Manter 100% do fluxo determinístico que já funciona (boas-vindas com áudio/vídeo, captura de nome, valor da conta, OCR, cadastro com botão, OTP) e dar ao bot um **cérebro inteligente** que responde QUALQUER pergunta fora do script usando o FAQ + biblioteca de áudios/vídeos, sem nunca quebrar a jornada de cadastro.

## Como vai ficar (na prática)

**Cliente entra primeira vez** → áudio de boas-vindas + botões (Quero saber mais / Cadastrar / Humano). Igual hoje.

**Cliente segue o caminho feliz** → vídeo Green_Energy → cadastro → conta → docs → portal + OTP. Igual hoje.

**Cliente sai do script** ("e em apartamento funciona?", "vou pagar duas contas?", "tem fidelidade?", "minha conta cai?") → o cérebro entra e:
1. Tenta achar a pergunta no Q&A configurado no Construtor de Fluxos (áudio gravado tem prioridade).
2. Se não achou, consulta o FAQ (~60 perguntas) e responde curto e humano usando exatamente as respostas oficiais.
3. Se houver áudio/vídeo na biblioteca pra esse tema, manda a mídia em vez do texto.
4. **Sempre devolve o cliente pro próximo passo do script** ("...mas voltando, me manda a foto da conta 📸").

**Quando o cliente está pronto** → manda a foto da conta → OCR + docs → o sistema dispara o **botão de cadastro** automático (já existe).

**Anti-erro**:
- Anti-loop: se a IA quiser repetir a mesma frase do último outbound (≥80% similar), o sistema apaga e volta pro determinístico.
- 3x "confuso" seguidos → handoff humano.
- Pediu humano em qualquer momento → handoff humano.
- LLM caiu/timeout → cai pro fallback determinístico (nunca silêncio quebrado).
- Toda decisão da IA é logada em `ai_decisions` e `ai_agent_logs`.

## Detalhes técnicos

### 1. `ai-sales-agent` ganha o FAQ no system prompt

Hoje o `ai-sales-agent/index.ts` (linha ~431) carrega `persona_name`, `tone`, `system_prompt` mas **NÃO** carrega `ai_knowledge_sections`. Vou adicionar:

```ts
const { data: knowledge } = await supabase
  .from("ai_knowledge_sections")
  .select("title, content")
  .eq("is_active", true)
  .order("position");

const knowledgeBlock = (knowledge || [])
  .map((k) => `## ${k.title}\n${k.content}`)
  .join("\n\n")
  .slice(0, 6000);
```

Injetado na seção `CONHECIMENTO OFICIAL iGREEN` do prompt, com regra explícita: *"Use APENAS o que está aqui pra responder dúvidas factuais. Não invente preço, prazo, comissão, lei, link. Se a pergunta não está no FAQ, use a tool `request_handoff`."*

### 2. Q&A configurado tem prioridade absoluta

Em `bot-flow.ts` o `trySendConfiguredQa` já roda antes do switch (linha 435). Vou fortalecer para também rodar dentro dos steps de coleta (`aguardando_conta`, `coleta_doc`) — assim, se o cliente fizer uma pergunta no meio do upload, a Q&A responde primeiro e depois o bot pede a foto/doc novamente.

### 3. Cérebro (sales-AI) ativo em mais steps

Hoje (`bot-flow.ts` linha 489): `conversationalSteps = {welcome, menu_inicial, pos_video, aguardando_humano}`. Vou expandir para incluir `qualificacao` e tornar o sales-AI o "responder de dúvidas" mesmo durante coleta — mas só se a mensagem for claramente uma pergunta (heurística: tem `?`, ou começa com "como/quanto/quando/onde/quem/posso/preciso/funciona/é"). Caso contrário, segue determinístico para captura de nome/valor.

### 4. Após o AI responder, devolve pro fluxo

No `ai-sales-agent`, quando a tool é `send_text` ou `send_media` em resposta a uma pergunta off-script, o `args` ganha um campo `return_to_step` opcional. O `bot-flow.ts` lê esse campo e, se preenchido, anexa um lembrete curto no fim ("...então, voltando: me manda a foto da sua conta 📸").

### 5. Anti-loop e safety nets (portados do `ai-agent-router`)

Adiciona em `bot-flow.ts` antes de `await sendText(reply)`:
```ts
// trigrama similarity vs último outbound
if (reply && lastOutbound && similarity(reply, lastOutbound) >= 0.8) {
  reply = ""; // não repetir
  // se a AI já mandou mídia/áudio inline, não precisa texto mesmo
}
```
Helper `similarity()` copiado de `ai-agent-router/index.ts`.

### 6. Logging unificado

`ai-sales-agent` já loga em `ai_decisions`. Vou garantir que TODA decisão (inclusive fallback / Q&A configurado / opening flow) também grave em `ai_agent_logs` com `step_before`, `step_after`, `media_sent_id` para o painel SuperAdmin enxergar tudo.

### 7. Sem mudanças destrutivas

- Schema do banco: zero alteração.
- Áudios, vídeos, slots: ficam como estão (a IA escolhe da biblioteca, não cria nada novo).
- Cadastro com botão (`aguardando_conta` → `cadastro_portal` → portal-worker): rota intocada.
- `ai_agent_config.handoff_rules.use_sales_ai = true` já está ativo (verificado).

## Arquivos editados

1. `supabase/functions/ai-sales-agent/index.ts` — injeta FAQ no prompt; adiciona `return_to_step` opcional na tool `send_text`/`send_media`.
2. `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — expande `conversationalSteps`; roda `trySendConfiguredQa` em mais steps; aplica anti-loop e lembrete `return_to_step`.
3. `supabase/functions/_shared/conversation-helpers.ts` — exporta helper `similarity()` (mover de `ai-agent-router`).

## Fora de escopo

- Mudanças visuais no painel.
- Embeddings/RAG (FAQ direto no prompt já cabe — ~6 KB).
- Reescrita do `bot-flow.ts` (foco cirúrgico, sem refatoração).
- Treinar modelo próprio.

## Resultado esperado

- Cliente segue o fluxo perfeito quando cooperar.
- Qualquer pergunta da lista do FAQ tem resposta correta, curta, humana.
- Áudios gravados (quando você gravar) tomam o lugar do texto automaticamente.
- Bot nunca repete frase, nunca trava, nunca inventa.
- Tudo auditável em `ai_decisions` + `ai_agent_logs`.
