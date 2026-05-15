## Objetivo
Trocar a página `/admin/fluxos` por uma **visão clara e linear** do novo fluxo conversacional, mostrando cada passo do início ao fim, qual é a mensagem que sai e o que o lead pode responder. Tudo editável em um clique, sem precisar entender de "máquina de estados".

## Como vai parecer (página única, scroll vertical)

```
┌──────────────────────────────────────────────────────────┐
│  Fluxo da Camila — passo a passo                         │
│  [● Ativo para todos]  [○ Só leads de teste]             │
└──────────────────────────────────────────────────────────┘

(0) ENTRADA — Lead manda 1ª mensagem
        │
        ▼
┌─ Passo 1 · Boas-vindas ──────────────────────────────────┐
│ 💬 "Oi! Aqui é a Camila…"                    [Editar]    │
│ Se o lead disser "oi" / "sim"  → vai para Passo 2        │
│ Se disser "quero cadastrar"    → pula para CADASTRO      │
│ Se disser "quero humano"       → vai para Atendimento    │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Passo 2 · Vídeo explicativo + qualificação ─────────────┐
│ 🎥 Manda o vídeo "explainer"                 [Trocar]    │
│ 💬 "Qual o valor médio da sua conta?"        [Editar]    │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Passo 3 · Check-in pós-vídeo ──────────────────────────┐
│ 💬 "Conseguiu ver? Ficou alguma dúvida?"     [Editar]    │
│ "Sim, gostei"  → Passo 4                                 │
│ "Tenho dúvida" → Passo 5                                 │
│ "Não / depois" → repete reforço                          │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Passo 4 · Pitch do Conexão Club ───────────────────────┐
│ 🎥 Vídeo "club"                              [Trocar]    │
│ 💬 "Olha o cashback…"                        [Editar]    │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Passo 5 · Tirar dúvidas ───────────────────────────────┐
│ 💬 "Pode perguntar à vontade"                [Editar]    │
│ "Quero seguir" → CADASTRO                                │
│ "Não quero"    → mensagem de reforço final               │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌─ FIM · Vai para o Cadastro (fluxo antigo, intacto) ─────┐
│ Pede a foto da conta de luz e segue normalmente.         │
└──────────────────────────────────────────────────────────┘

╔═ Atalhos sempre disponíveis ═════════════════════════════╗
║ Em QUALQUER passo, se o lead disser:                     ║
║  • "quero cadastrar" → pula direto pro cadastro          ║
║  • "quero falar com humano" → marca Aguardando humano    ║
╚══════════════════════════════════════════════════════════╝
```

## O que cada cartão de passo permite fazer

- Ver a **mensagem atual** que a Camila vai mandar (texto cru com `{{nome}}`/`{{representante}}`).
- Botão **Editar** abre um modal simples com: textarea da mensagem, dica das variáveis, botão Salvar (grava em `bot_messages`).
- Quando o passo dispara um vídeo, mostra o vídeo atual e botão **Trocar** (lista os vídeos da `ai_media_library` por slot).
- Setas/legendas explicam **para onde vai cada resposta** — em linguagem humana, sem jargão.

## Cabeçalho da página (1 linha de configuração)

- Switch "Ativar para TODOS os meus leads" → liga `consultants.conversational_flow_enabled` do usuário logado.
- Link discreto "Testar com 1 número" → abre modal pra colar o telefone e ligar só pra aquele `customers.conversational_flow_enabled`.
- Selo "Em teste com X números" mostrando quantos overrides estão ativos.

## O que NÃO muda

- O fluxo de cadastro (foto da conta, OCR, portal) continua exatamente como está.
- O `FlowBuilder.tsx` antigo (que edita `bot_flows`/`bot_flow_qa`) sai do menu mas o arquivo fica no repo por enquanto, pra não quebrar nada que dependa dele.
- Nenhuma mudança em edge function — tudo já está pronto pra ler de `bot_messages`.

## Detalhes técnicos

- Nova página: `src/pages/FluxoCamila.tsx` montada em `/admin/fluxos` (substitui o FlowBuilder no router).
- Componente `<StepCard>` reutilizável para cada passo (props: título, ícone, mensagens dessa etapa, vídeo opcional, lista de "se responder X → vai para Y").
- A lista de passos e suas regras vem de uma constante TS no front (`FLUXO_CAMILA`) que **espelha 1-para-1** o `state-machine.ts` — escrita uma vez, fácil de revisar lado a lado.
- Modais usam `Dialog` do shadcn já existente. Toasts via `sonner` (já no projeto).
- Queries: `select` em `bot_messages` filtrando por `step_key`, `update` por id. RLS atual já permite super-admin gerenciar.
- Switches do header chamam `update` em `consultants` (RLS owner) e `customers` (precisa ser super-admin pra mexer em qualquer lead — usar a sessão atual).

## Fora do escopo (proposta separada se quiser depois)

- Métricas por passo (taxa de avanço, drop-off) — a tabela `bot_step_transitions` já guarda os dados, então dá pra plotar depois.
- Editor visual de novos passos (drag-and-drop). Hoje os passos são fixos em código pra garantir que o cadastro nunca quebre; só o **texto e os vídeos** são editáveis pela tela.

Quer que eu siga com esse plano ou prefere ajustar algo (ex.: incluir métricas já agora, ou deixar o FlowBuilder antigo acessível em outro link)?