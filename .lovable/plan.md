## Objetivo

Eliminar a página antiga `/admin/fluxos-antigo` (que confunde por ter duas UIs de fluxo) e trazer a seção de **Perguntas & Respostas (FAQ)** para dentro do `/admin/fluxos` (FluxoCamila), mantendo o mesmo comportamento do midflow QA do webhook.

## O que muda

### 1. Remover fluxo antigo

- Deletar `src/pages/FlowBuilder.tsx`.
- Em `src/App.tsx`, remover o `lazy import` de `FlowBuilder` e a rota `/admin/fluxos-antigo`.
- Nenhum outro arquivo referencia o `FlowBuilder` (verificado).

### 2. Adicionar seção "Perguntas & Respostas" no FluxoCamila

Nova seção, posicionada **após o último passo** e antes do rodapé da página, com o mesmo visual dos cards de passo atuais (glassmorphism, badges verdes, dark mode).

Estrutura:

```text
┌─ ❓ Perguntas & Respostas ─────────────────────────┐
│  Quando o lead perguntar algo no meio do cadastro,│
│  a IA responde isto e volta para o passo atual.   │
│                                                    │
│  [Card FAQ]                                        │
│    Título: "Preço"                                 │
│    Quando o cliente disser: [tag] [tag] [+ Enter] │
│    Resposta: [textarea]                            │
│    Mídias opcionais: 🎙️ Áudio  🎬 Vídeo            │
│    [↑] [↓] [🗑️]                                    │
│                                                    │
│  [+ Nova dúvida]                                   │
└────────────────────────────────────────────────────┘
```

Reaproveita exatamente as 3 tabelas já existentes (sem migration):
- `bot_flow_qa` — pergunta + texto da resposta
- `bot_flow_qa_triggers` — palavras‑chave/frases
- `bot_flow_qa_media` — áudio/vídeo opcional (slot_key ou media_id da biblioteca)

Operações: load, addQA, updateQA, deleteQA, moveQA, addTrigger, removeTrigger, addMedia, updateMedia, removeMedia — portadas do `FlowBuilder` antigo, sem mudar o schema nem o webhook.

### 3. Pré‑popular FAQs comuns (opcional, mesmo passo)

Após criar a UI, abrir os 10 itens base já no banco para o fluxo da Camila, prontos para o usuário editar:

- Preço / mensalidade
- É seguro / é golpe
- Como funciona o desconto
- Preciso trocar de empresa
- Quanto tempo pra ativar
- Posso cancelar / multa
- Continuo recebendo conta da concessionária
- Qual o desconto exato
- Atende minha cidade
- Preciso instalar placa

(Só inserir se o usuário confirmar; caso contrário ele cadastra os dele.)

## Comportamento no WhatsApp (já existe, sem mudanças)

`supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linhas 609‑677) já faz:
1. Detecta pergunta no meio do cadastro.
2. Busca match em `bot_flow_qa` via `matchQA`.
3. Envia mídias + texto da FAQ + "gancho" (`getReentryPromptForStep`) repetindo o passo.
4. **Não altera `conversation_step`** — lead continua exatamente onde estava.
5. Em 5+ dúvidas seguidas, pausa bot e cria `bot_handoff_alerts`.

## Arquivos tocados

- `src/App.tsx` — remove import + rota antiga
- `src/pages/FlowBuilder.tsx` — **deletar**
- `src/pages/FluxoCamila.tsx` — adiciona seção FAQ + `QACard` interno

## Confirmação necessária

Quer que eu também já insira os 10 FAQs base no banco depois de criar a UI, ou prefere cadastrar tudo do zero pela tela?
