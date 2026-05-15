## O que vai mudar (em linguagem simples)

Hoje, no Fluxo da Camila, cada passo só consegue decidir o próximo passo se o cliente disser **sim** ou **não**. Se ele mandar o nome, o valor da conta, ou qualquer coisa diferente, a Camila trava ou repete o passo.

Vou deixar cada passo com **3 blocos visuais bem separados**, fáceis de entender:

```
┌─ PASSO 1 ─────────────────────────────────┐
│ 📝 Mensagem da Camila (texto que ela manda)│
├───────────────────────────────────────────┤
│ 🎯 REGRAS — "Se o cliente disser..."      │
│   • SIM / quero  →  Passo 3                │
│   • NÃO / depois →  Passo 5                │
│   • mandar valor (R$) → Passo 3            │
│   [+ adicionar regra]                      │
├───────────────────────────────────────────┤
│ 💾 CAPTURAR DADOS do que o cliente mandou │
│   ☑ Nome do cliente   → salva em {{nome}} │
│   ☑ Valor da conta    → salva em {{valor_conta}}│
│   ☐ Telefone          → salva em {{telefone}}│
│   ☐ CPF               → salva em {{cpf}}  │
├───────────────────────────────────────────┤
│ 🤖 PLANO B — "Se nada acima funcionar"    │
│   ◉ Repetir o passo                        │
│   ○ Ir para passo: [Passo 2 ▾]            │
│   ○ Deixar a IA decidir (Gemini)          │
│      └ Instrução: "Se parecer interessado,│
│         vá pro Passo 3. Se confuso, repita."│
└───────────────────────────────────────────┘
```

### Como cada bloco ajuda você

**🎯 REGRAS** — continua como já é, só com mais opções no menu de gatilhos:
- `Disse SIM` / `Disse NÃO` (já existe)
- `Mandou valor (R$)` — detecta "350", "R$ 450", "minha conta é 600"
- `Mandou nome próprio` — detecta "Maria Silva", "sou João"
- `Mandou telefone` / `Mandou CPF`
- `Palavra específica` — você digita as palavras

**💾 CAPTURAR** — checkboxes simples. Marcando "Valor da conta", se o cliente mandar "minha conta vem 380", o sistema extrai `380`, salva no cadastro dele e passa a estar disponível como `{{valor_conta}}` em mensagens futuras. Mesma coisa pra nome, telefone, CPF.

**🤖 PLANO B** — substitui a regra "Qualquer outra coisa" de hoje. Em vez de uma única opção, você escolhe entre:
- Repetir o passo (padrão seguro)
- Pular pra um passo específico
- **Deixar a IA decidir** — você escreve em português o que ela deve fazer ("se o cliente parecer interessado, vá pro Passo 3; se tiver dúvida, repita") e a Gemini lê a mensagem e decide.

## Visual

- Cada bloco com fundo levemente diferente e ícone na esquerda (🎯 💾 🤖) pra você bater o olho e saber o que é.
- Tipografia clara, tudo em português, zero jargão técnico ("intent", "regex", etc.).
- Tooltips curtos no `?` ao lado de cada bloco explicando o que faz.
- Cores do design system (verde primário, glassmorphism dark) — mantém a identidade.

## Detalhes técnicos

**Banco** — adicionar coluna `captures jsonb default '[]'` em `bot_flow_steps`. Cada item: `{ field: 'electricity_bill_value' | 'name' | 'phone' | 'cpf', enabled: true }`.

**Frontend** (`src/pages/FluxoCamila.tsx`):
- Quebrar `TransitionRow` em 3 sub-componentes: `<RulesBlock>`, `<CaptureBlock>`, `<FallbackBlock>`.
- Novos `INTENT_OPTIONS`: `valor_brl`, `nome_proprio`, `telefone_br`, `cpf_br`, `palavra_chave`, `ai_decide`.
- `FallbackBlock` com radio group (repetir / pular / IA) + textarea pra prompt da IA.

**Backend** (`supabase/functions/whapi-webhook/handlers/conversational/index.ts`):
- Nova função `extractCaptures(step, messageText)` que roda regex antes da classificação:
  - valor: `/R?\$?\s*(\d{2,5}([.,]\d{2})?)/`
  - telefone: `/(\d{2})\s?9?\s?\d{4}-?\d{4}/`
  - CPF: `/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/`
  - nome: heurística (2+ palavras capitalizadas após "sou/me chamo/nome é")
- Salva os capturados em `customers` (`electricity_bill_value`, `name`, `phone`, `cpf`).
- Quando o intent matcher reconhece `valor_brl`/`nome_proprio`/etc., usa a transição correspondente.
- Quando cai no Plano B com `ai_decide`, chama Gemini com o prompt do usuário + lista de passos válidos e pega o `step_key` de retorno.

**Migração** — adiciona `captures` com default `[]`. Zero impacto em fluxos existentes.

## O que NÃO muda

- Cadastro (OCR + portal) — intacto.
- Biblioteca de mídia — intacta.
- Atalhos globais (`quero cadastrar` / `quero humano`) — intactos.
- Fluxos já criados continuam funcionando (Plano B vazio = repete passo, igual hoje).

## Entrega

Tudo numa parte só (UI + backend + migração). Aprovando, sigo.
