# Página dedicada de FAQ (`/admin/faq`)

Hoje a base de conhecimento que a IA usa pra responder dúvidas (`ai_knowledge_sections`) só aparece dentro do **Super Admin → aba "IA"**, escondida. Vou criar uma página própria, completa, fácil de editar.

## O que muda

### 1. Nova rota `/admin/faq`
- Link no menu lateral do admin (ícone livro/help).
- Acesso restrito a admin/super_admin (mesma proteção das outras rotas /admin).

### 2. Tela completa de gestão
Lista todas as seções de `ai_knowledge_sections` com:
- Busca por título/conteúdo/palavra-chave
- Filtros: persona (lead / cliente / ambos), crítico (sim/não), ativo/inativo
- Drag-and-drop pra reordenar (atualiza `position`)
- Cards expansíveis mostrando preview do conteúdo
- Botões: **Editar**, **Duplicar**, **Ativar/Desativar**, **Excluir**, **Marcar como crítico**

### 3. Editor de seção (modal/drawer)
Campos:
- Título
- Conteúdo (textarea grande com markdown leve)
- Persona alvo (lead / cliente / ambos)
- Crítico (resposta exata, não pode ser parafraseada pela IA)
- Palavras-chave (chips)
- Ativo (toggle)

### 4. Adicionar conteúdo de 3 formas
- **Manual** — formulário direto
- **Upload de PDF/TXT/DOCX** — extrai texto (já existe a função de PDF no `AIKnowledgePanel`)
- **Cola um texto bruto** — IA quebra automaticamente em seções

### 5. "Auto-organizar com IA" (botão no topo)
Edge function `faq-organizer` que:
- Lê todas as seções ativas
- Pede pra IA: deduplicar, consolidar temas parecidos, sugerir títulos melhores, gerar palavras-chave, marcar críticas, ordenar por relevância pro funil
- Retorna um **diff preview** (antes/depois) — admin aprova antes de salvar
- Nada é sobrescrito sem confirmação

### 6. Preview "Como a IA responderia"
Caixinha onde admin digita uma pergunta de cliente e vê:
- Qual(is) seção(ões) a IA usaria
- Resposta que sairia no WhatsApp
- Confiança e se faria handoff
Usa a mesma função `ai-faq-answerer` que já roda em produção.

---

## Sobre "não bagunçar o fluxo com perguntas do cliente"

**Sim, já é seguro.** A arquitetura atual já protege isso:

1. Durante o fluxo, se o cliente pergunta algo, o webhook tenta primeiro `bot_flow_qa` (perguntas cadastradas no fluxo).
2. Se não bater, chama `ai-faq-answerer` usando a base de conhecimento (essa nova página).
3. A IA **responde a dúvida mas mantém o passo atual** — não avança nem volta o funil. Termina convidando: *"Quer que eu siga com seu cadastro?"*
4. Se a confiança for baixa ou for pergunta sensível (cancelamento, reclamação, pedido de humano), o bot **pausa e notifica o consultor** (handoff), sem responder besteira.

Vou adicionar na nova página um banner curto explicando esse comportamento, pra ficar claro que mexer no FAQ **não quebra o fluxo** — só melhora as respostas paralelas.

---

## Detalhes técnicos

- Página: `src/pages/AdminFaq.tsx`
- Componentes: `src/components/admin/faq/{FaqList,FaqEditor,FaqAutoOrganize,FaqPreview,FaqUpload}.tsx`
- Reaproveita extração de PDF do `AIKnowledgePanel` (move pra util compartilhado `src/lib/extract-text.ts`)
- Nova edge function `faq-organizer` (chama Lovable AI Gateway, retorna proposta JSON)
- Tabela `ai_knowledge_sections` já tem todos os campos necessários (`title`, `content`, `position`, `is_active`, `persona`, `is_critical`, `keywords`) — **sem migration**
- RLS já permite admin gerenciar (`Admins manage knowledge`)
- Adiciona item "FAQ da IA" no `AdminLayout` sidebar
- Mantém o painel atual no Super Admin (compatibilidade)

Quer que eu siga com essa estrutura?
