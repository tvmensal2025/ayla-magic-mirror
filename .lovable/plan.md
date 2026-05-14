## Objetivo

Cadastrar todas as perguntas e respostas que você enviou como uma seção fixa de conhecimento da IA — algo que ela carrega em toda conversa e nunca "esquece". Por enquanto fica em texto; depois você grava os áudios e liga cada um na pergunta correspondente pelo Construtor de Fluxos (Q&A).

## Como vai ficar

1. **Nova seção "FAQ — Perguntas Frequentes do Cliente"** dentro do painel de Conhecimento da IA (`AIKnowledgePanel`, em SuperAdmin), com todas as ~60 perguntas/respostas que você listou, organizadas por tema:
   - Como funciona / energia continua igual
   - Pagamento e boleto
   - Aplicativo iGreen e Clube de Benefícios
   - Cancelamento, fidelidade e cadastro
   - Economia, prazo e ativação
   - Casa, apartamento, empresa
   - Suporte, distribuidora e segurança

2. **A IA passa a receber esse FAQ em toda resposta** — tanto no chat web (`igreen-chat`) quanto no WhatsApp (`ai-agent-router`), porque ambos já leem `ai_knowledge_sections` ativos. Ou seja, ela vai responder usando exatamente esse texto, sem inventar.

3. **Editável a qualquer momento** pelo painel — você pode corrigir uma resposta, adicionar pergunta nova, desativar etc., sem precisar mexer em código.

4. **Pronto para virar áudio depois**: cada pergunta dessa lista pode futuramente ser cadastrada no Construtor de Fluxos (`/admin/fluxos`) como uma Q&A com áudio anexado. Quando você fizer isso, o áudio toma prioridade e a IA envia o áudio gravado em vez do texto. Enquanto não houver áudio, ela responde no texto do FAQ.

## Detalhes técnicos

**Migração** (`supabase/migrations/...`):
- `INSERT INTO public.ai_knowledge_sections (title, content, position, is_active)` com `title = 'FAQ — Perguntas Frequentes do Cliente'`, `position = 999` (vai pro fim, sem afetar ordem das seções existentes), `is_active = true`.
- `content` = markdown formatado com todas as perguntas no padrão:
  ```
  ## Como funciona
  **Vou continuar recebendo energia normalmente?**
  Sim. A energia continua chegando normalmente pela distribuidora da sua região.
  ...
  ```
- Idempotente: usa `ON CONFLICT` por título único — se já existir uma seção com esse título, faz `UPDATE` do content (re-rodar a migração não duplica).
- Adiciona índice único parcial em `lower(title)` se ainda não existir (necessário pro `ON CONFLICT`).

**Backend (sem alterações de código necessárias)**:
- `supabase/functions/ai-agent-router/index.ts` (linha 175-180) já carrega `ai_knowledge_sections` ativos e injeta no prompt do Gemini.
- `supabase/functions/igreen-chat/index.ts` (linha 20-29) idem.
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` continua tratando o fluxo determinístico (abertura, qualificação, upload de conta). Quando a mensagem do cliente não casar com nenhuma Q&A nem com um passo do flow, ele já delega pro `ai-agent-router`, que agora terá o FAQ no prompt.

**Frontend**: nenhuma mudança. O `AIKnowledgePanel.tsx` já lista, edita e desativa seções da `ai_knowledge_sections`, então a nova entrada aparece automaticamente no SuperAdmin.

## Fora de escopo

- Gravação dos áudios (você fará depois e cadastra como Q&A no Construtor de Fluxos).
- Match semântico via embeddings — a IA já casa as perguntas do FAQ pelo prompt; não precisa de busca vetorial agora.
- Mudança no `bot-flow.ts` do Whapi — o fluxo determinístico continua igual.

## Entregável

1 migração SQL inserindo a seção "FAQ — Perguntas Frequentes do Cliente" com todo o conteúdo formatado em markdown, idempotente.
