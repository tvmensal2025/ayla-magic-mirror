# Plano — Fluxos: IA em dúvidas, Avançado oculto, atalho Captar luz

## 1) Dúvida do lead deve cair na IA (não no Rafael)

Hoje no passo **#6 Esclarecer dúvidas**, quando o lead manda algo fora do FAQ (ou clica "Ainda tenho dúvida"), a regra cai em **handoff humano** e notifica o Rafael. O correto é: bot pausa só quando o lead **pede humano explicitamente**; qualquer outra dúvida deve ser respondida pela IA conversacional que já existe (`handlers/conversational`, Gemini livre).

Mudanças:
- Em `StepInspector` (aba **Regras**), adicionar nova opção no dropdown "Quando casar, vai para:"
  - `🤖 Responder com IA` (além de "Falar com humano", "Pular para cadastro", passos…)
  - Persistir como `next_action = "ai_reply"` numa coluna nova `bot_flow_rules.next_action` (ou reaproveitar `target_step_key = "__ai_reply__"`).
- Em `whapi-webhook/handlers/bot-flow.ts`, ao resolver transição:
  - Se `next_action === "ai_reply"` → não faz handoff, chama o pipeline `conversational/index.ts` com o texto do lead, mantém `conversation_step` no passo atual.
  - Handoff só dispara se intent = `quer_humano` (regex já existente) OU regra explícita "Falar com humano".
- Atualizar regras default do passo #6 nos templates: "Ainda tenho dúvida" → `ai_reply` em vez de handoff.

## 2) Avançado só para SuperAdmin

`src/components/admin/flow-builder/StepInspector.tsx` linhas 339-379: bloco "Avançado" (step_key, slot_key, text_delay_ms) fica visível pra qualquer consultor.

- Ler `useUserRole()` no `StepInspector`.
- Renderizar o toggle/painel "Avançado" **apenas se `role === "super_admin"`**.
- Consultores comuns continuam vendo Básico/Mídias/Botões/Regras normalmente. `slot_key` segue editável só via SuperAdmin (consultor herda do template).
- Mesma regra na mensagem placeholder da aba **Mídias** ("Defina uma slot_key em Básico → Avançado…") — trocar copy pra "Peça ao SuperAdmin liberar este slot".

## 3) Atalho "Captar luz" no Simulador (modo real)

Hoje o simulador exige digitar manualmente "oi", "quero simular", "350", upload de imagem etc. Pra validar rápido o fluxo principal (captação da conta de luz), adicionar **quick-actions** no header do `FlowSimulator`:

- Botões prontos: `👋 oi` · `💡 Captar luz` · `📸 Mandar conta (fixture)` · `📄 Mandar RG (fixture)` · `🙋 Falar com humano`
- `💡 Captar luz` envia a mensagem `"quero economizar na conta de luz 350"` — força o regex de valor + intent `quer_cadastrar`, já avançando para `aguardando_conta`.
- `📸 Mandar conta` reaproveita `fixtures/conta-energia.pdf` e dispara OCR real (Gemini) em Modo Real.

Assim, com 2 cliques o operador valida ABCD inteiro (texto sempre reflete o fluxo, independente da variante de áudio).

### Auditoria dos testes anteriores (erros observados)
- `welcome → welcome` ficava em loop quando variante D (custom) não tinha resolver — **já corrigido** (router multi-variant).
- Delays artificiais de áudio (até 90s) travavam UI — **já corrigido** com `x-bot-fast-clock`.
- Quiet hours bloqueavam simulação 21:30-08:00 — **já corrigido** com `x-bot-bypass-quiet-hours`.
- Resta: dúvidas caindo em handoff (item 1) e falta de atalhos (item 3).

## Detalhes técnicos

- Migração: `ALTER TABLE bot_flow_rules ADD COLUMN next_action text;` (ou enum `flow_rule_action`).
- Edge: `bot-flow.ts` precisa importar handler conversational e expor função `respondWithAI(customer, message)` que retorna sem mover `conversation_step`.
- `FlowSimulator.tsx`: array `QUICK_ACTIONS` com label/payload; botões logo acima do input de mensagem.
- Tipos Supabase regerados após migração.

## Validação
- Simular: clica `Captar luz` → bot pede foto da conta → upload fixture → OCR → confirma valor.
- Simular: passo #6, digita "isso é golpe?" → IA responde (não notifica Rafael).
- Simular: digita "quero falar com humano" → ainda pausa bot + notifica.
- Logar como consultor comum → aba Básico não mostra "Avançado".
