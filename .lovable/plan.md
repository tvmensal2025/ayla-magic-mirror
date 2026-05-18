# Unificar as duas FAQs em uma central de conhecimento

## O que existe hoje (e por que parece duplicado)

| Item | Tabela | Onde está | O que faz | Mídia |
|---|---|---|---|---|
| **"FAQ do fluxo"** | `bot_flow_qa` (+ `_triggers`, `_media`) | `/admin/fluxos` → âncora `#faq-section` (`FaqSection.tsx`) | Match **exato** por frase-gatilho. Responde texto fixo + áudio/vídeo. Escopo: por `flow_id`. | ✅ áudio/vídeo |
| **"FAQ da IA"** | `ai_knowledge_sections` | `/admin/faq` (`AdminFaq.tsx`) | A IA **lê e parafraseia** com travas (`is_critical`, persona, threshold). Escopo: global. | ❌ só texto |

Cascata real no `whapi-webhook` (não muda):
```text
mensagem fora do passo
  └─ 1º tenta bot_flow_qa (match exato + mídia)
       └─ não achou → ai-faq-answerer (RAG em ai_knowledge_sections)
            └─ confiança baixa / crítico → pausa + handoff humano
```

**As duas tabelas têm propósitos diferentes e ambas são úteis.** O problema é só de **nomenclatura, navegação e mental model**. Fundir as tabelas seria perda de funcionalidade (mídia de um lado, IA do outro). A solução certa é **unificar a UI** mantendo as duas tabelas.

## Plano definitivo

### 1. Nova página `/admin/conhecimento` com 2 abas

`src/pages/AdminKnowledge.tsx` — wrapper com `<Tabs>`:

```text
┌─────────────────────────────────────────────────────────┐
│ ← Conhecimento do bot                                   │
│   Como o bot responde dúvidas fora do fluxo            │
├─────────────────────────────────────────────────────────┤
│ Banner explicativo da cascata (3 linhas, com ícones):   │
│  1️⃣ Atalhos rápidos → 2️⃣ Base IA → 3️⃣ Handoff humano  │
├─────────────────────────────────────────────────────────┤
│ [ ⚡ Atalhos rápidos (5) ]  [ 🧠 Base da IA (23) ]      │
│                                                         │
│ Conteúdo da aba ativa                                   │
└─────────────────────────────────────────────────────────┘
```

- **Aba 1 — "Atalhos rápidos"**: embute `<FaqSection flowId={flowId}>` (componente existente, sem mudanças de lógica). Subtítulo: *"Resposta exata por palavra-chave, com áudio/vídeo opcional. É a primeira coisa que o bot tenta."*
- **Aba 2 — "Base da IA"**: embute o miolo de `AdminFaq.tsx` (sem o header próprio, pra não duplicar). Subtítulo: *"Conteúdo livre que a IA lê e adapta. Usada quando nenhum atalho casar."*
- Badge de contagem em cada aba.
- Query string sincroniza aba (`?tab=atalhos` / `?tab=ia`) pra deep-link.

### 2. Refatorar `AdminFaq.tsx`

- Extrair o conteúdo (filtros + lista + modais) para `src/components/admin/knowledge/AiKnowledgePanel.tsx` (sem header/voltar).
- `AdminFaq.tsx` vira **redirect** para `/admin/conhecimento?tab=ia` (mantém URL antiga funcionando).

### 3. Simplificar `FluxoCamila.tsx`

- Remover os 2 botões atuais ("FAQ da IA" + "FAQ do fluxo").
- Substituir por **um botão único**: `[📚 Conhecimento do bot]` → navega `/admin/conhecimento`.
- Remover a renderização inline do `<FaqSection>` ao final da página (linha 538) e o anchor `#faq-section`. O componente continua existindo, só é montado dentro da nova página.
- Remover import não usado de `HelpCircle` / `BookOpen` se ficarem órfãos.

### 4. Sidebar / navegação admin

- Item único na sidebar: **"Conhecimento do bot"** com ícone `BrainCircuit` ou `BookOpen`.
- Remover qualquer link antigo para `/admin/faq` (vira redirect).

### 5. Banner de cascata reutilizável

`src/components/admin/knowledge/CascadeBanner.tsx` — bloco visual de 3 passos numerados (Atalho → IA → Humano) com cores e ícones. Aparece no topo da nova página. Substitui o banner azul atual do `AdminFaq` (que só explica metade da história).

### 6. Sandbox de teste compartilhado

Hoje o `AdminFaq` tem um "Preview tester" que chama `igreen-chat`. Mover para o topo da página unificada (fora das abas), pra você poder digitar uma pergunta de cliente e ver:
- Qual camada respondeu (atalho exato? IA? handoff?)
- Qual seção/QA foi usada
- Texto final que iria pro WhatsApp

Isso é o que **realmente** prova que "a IA não vai bagunçar".

### 7. Ajustes pequenos no FaqSection (cosméticos)

- Trocar título interno de "Perguntas & Respostas" para **"Atalhos rápidos"** pra alinhar.
- Adicionar 1 linha: *"Tentado antes da base da IA. Use pra respostas com áudio/vídeo ou texto que precisa ser literal."*
- Nada de lógica muda.

### 8. Fix runtime quieto

Erro `BookOpen is not defined` na rota `/admin/faq` — `AdminFaq.tsx` já importa BookOpen na linha 17, então o erro vem provavelmente de outro arquivo (a investigar na hora da implementação, possivelmente HMR stale). Verificar e corrigir junto.

## Arquivos

**Novos**
- `src/pages/AdminKnowledge.tsx`
- `src/components/admin/knowledge/AiKnowledgePanel.tsx` (extração do AdminFaq)
- `src/components/admin/knowledge/CascadeBanner.tsx`
- `src/components/admin/knowledge/PreviewTester.tsx` (extração do AdminFaq)

**Editados**
- `src/App.tsx` — adicionar rota `/admin/conhecimento`, deixar `/admin/faq` como redirect
- `src/pages/FluxoCamila.tsx` — botão único, remover FaqSection inline + anchor
- `src/pages/AdminFaq.tsx` — virar redirect simples
- `src/components/admin/fluxo/FaqSection.tsx` — copy do título/subtítulo
- Sidebar do admin (se existir um arquivo central de navegação)

**Não muda**
- Tabelas (`bot_flow_qa*`, `ai_knowledge_sections`) — zero migration
- Edge functions (`whapi-webhook`, `ai-faq-answerer`, `faq-organizer`, `igreen-chat`)
- Lógica da cascata, prompts, thresholds, handoff
- RLS

## Resultado final

- **1 botão**, **1 rota**, **1 página**, **2 abas claramente nomeadas**.
- A pessoa que edita entende em 5 segundos: *"Atalhos = resposta fixa rápida; Base da IA = conhecimento que a IA usa quando precisa pensar."*
- O sandbox no topo elimina a dúvida "será que vai bagunçar?".
- Zero risco no bot — só UI.
