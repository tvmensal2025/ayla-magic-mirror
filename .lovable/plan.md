
# Pacote completo: IA que escolhe áudio/vídeo/texto sozinha

A tabela `ai_media_library` já tem tudo que precisamos (`kind`, `step_tags`, `intent_tags`, `priority`, `is_public`, `consultant_id`). Não precisa criar tabelas novas — só UI, lógica do agente e um campo de feedback.

---

## 1. UI do consultor — aba "Agente & Mídias"

Substituir o uploader genérico por um **card por mídia** com 3 dropdowns simples (sem jargão):

- **Tipo** (auto-detectado pelo arquivo): Áudio / Vídeo / Imagem / Texto
- **Quando enviar?** (multi-select, grava em `step_tags`):
  - Boas-vindas
  - Apresentar economia (pitch)
  - Prova social / depoimento
  - Objeção: preço / desconto
  - Objeção: confiança / "é golpe?"
  - Objeção: burocracia
  - Pedir documento
  - Fechamento
  - Follow-up (lead sumiu)
- **Para qual perfil?** (multi-select, grava em `intent_tags`):
  - Todos
  - Conta alta (>R$500)
  - Conta média (R$200–500)
  - Conta baixa (<R$200)
  - Lead frio (>3 dias sem responder)

Botão **"Usar kit padrão iGreen"** no topo: copia mídias com `is_public=true` para o consultor (fork como já existe em `message_templates`).

Upload em massa: arrastar vários arquivos → modal pede só os 2 dropdowns para cada um. Em ~2min o consultor configura toda a biblioteca.

## 2. Kit padrão iGreen (mídias suas)

Novo subpainel admin "Biblioteca pública iGreen" (super_admin only):
- Upload das suas mídias para `ai-agent-media` bucket
- Marca `is_public=true`, `consultant_id=null`
- Aparece automaticamente para todo consultor com botão "Adicionar à minha biblioteca"

Você sobe os arquivos uma vez, todos os consultores herdam.

## 3. Lógica do agente — escolha automática de mídia

Atualizar `supabase/functions/ai-sales-agent/index.ts`:

**Antes da chamada ao LLM**, carregar mídias candidatas para a fase atual:
```ts
const candidatas = await supabase
  .from('ai_media_library')
  .select('id,kind,label,url,step_tags,intent_tags,priority')
  .eq('active', true)
  .or(`consultant_id.eq.${consultantId},is_public.eq.true`)
  .contains('step_tags', [salesPhase])
  .order('priority', { ascending: false });
```

Filtrar por perfil do lead (conta alta/baixa/frio) e injetar no prompt como lista numerada. A tool `send_media` recebe só o `media_id` — o LLM escolhe **qual** das opções, mas só pode escolher entre as que existem (zero alucinação).

**Regras de cadência** (hard-coded, fora do LLM, em `bot-flow.ts`):
- Máx 1 áudio a cada 3 mensagens da IA
- Máx 1 vídeo por conversa até o cliente responder
- Nunca 2 mídias seguidas sem texto do cliente entre elas
- Se cliente mandou áudio → próxima resposta deve ser áudio (espelho)
- Se cliente mandou texto curto (<20 chars) → resposta texto curto

Tracking via `ai_decisions.ai_output` (já existe) — campo `media_sent_id` + `cadence_state`.

## 4. Painel "Decisões da IA" — botão "Ensinar a IA"

No `AIDecisionsPanel.tsx` existente, adicionar em cada decisão:
- Preview da mídia enviada (player inline)
- Botão 👍 "Foi perfeito" / 👎 "Não era hora"
- Quando 👎: modal pede "o que era melhor?" (dropdown das outras mídias da fase)

Feedback grava em nova coluna `ai_decisions.feedback` (jsonb: `{rating, suggested_media_id, note}`). Os 10 últimos feedbacks 👍 viram exemplos few-shot no system prompt do consultor → IA aprende o estilo dele sem o consultor escrever uma linha.

## 5. Para o cliente final — experiência previsível

Regras aplicadas no envio (em `bot-flow.ts`):
- Áudios cortados a >30s → recusados no upload com aviso
- Vídeos sem legenda → aviso amarelo no card ("recomendado adicionar legenda")
- Toda mídia enviada vem acompanhada de 1 linha de texto-âncora gerada pela IA ("🎥 Veja em 40s como funciona")

---

## Detalhes técnicos

**Migration nova** (apenas 1 coluna):
```sql
ALTER TABLE ai_decisions ADD COLUMN feedback jsonb;
ALTER TABLE ai_decisions ADD COLUMN media_sent_id uuid;
CREATE INDEX idx_ai_media_step_tags ON ai_media_library USING gin(step_tags);
CREATE INDEX idx_ai_media_intent_tags ON ai_media_library USING gin(intent_tags);
```

**Função RPC** para fork do kit público:
```sql
CREATE FUNCTION fork_public_ai_media(_media_id uuid) RETURNS uuid ...
```
(mesma lógica de `fork_message_template` que já existe).

**Arquivos a editar/criar:**
- `supabase/functions/ai-sales-agent/index.ts` — carregar candidatas + injetar no prompt + nova tool `send_media_from_library`
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts` — regras de cadência (mirror, anti-spam)
- `src/components/admin/AIAgentTab/MediaLibrary.tsx` — novo: cards com 2 dropdowns + upload em massa
- `src/components/admin/AIAgentTab/PublicMediaKit.tsx` — novo: ver/adicionar mídias do kit iGreen
- `src/components/admin/AIAgentTab/AIDecisionsPanel.tsx` — adicionar preview + botões 👍/👎
- `src/pages/SuperAdmin/PublicMediaManager.tsx` — novo: você gerencia o kit público
- 1 migration: 2 colunas + 2 índices + 1 função RPC

**Storage:** bucket `ai-agent-media` já existe e é público — pronto para uso.

---

## Resumo para você

Você sobe seus áudios/vídeos uma única vez no painel super-admin (kit iGreen). Cada consultor abre a aba Agente, clica "Usar kit padrão" e em 1 clique tem 20+ mídias rotuladas. A IA escolhe sozinha qual mandar baseado na fase da venda e no perfil do lead, respeitando regras anti-spam. Consultor vê tudo em "Decisões da IA" e ensina com 👍/👎 — sem nunca tocar em prompt.
