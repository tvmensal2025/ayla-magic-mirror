# Auditoria — Conversas do Bot (últimas 24h)

Analisei 3 conversas reais ativas (Oiii, Franciele, Lucas) + a estrutura do fluxo ativo (`bot_flow_steps`) + FAQ (`bot_flow_qa`). Há problemas reais que estão afundando a taxa de conversão.

## Problemas encontrados

### 1. FAQ vazia — perguntas do lead caem no vazio
A tabela `bot_flow_qa` tem intents cadastradas ("Como funciona", "Quanto custa", "Tem fidelidade?" etc.) mas **`text_response` é NULL** em quase todas. Resultado:
- Franciele perguntou *"O que é isso imposto?"*, *"Não tem custo mesmo?"*, *"Não consigo ver vídeo"* → bot ignorou e seguiu empurrando o roteiro.
- Só "Boas-vindas" tem resposta preenchida.

### 2. FAQ duplicado por consultor
Há **12 cópias** idênticas de cada intent (uma por flow ativo). Quando o admin edita uma, as outras ficam desatualizadas. Vira ruído operacional.

### 3. Fluxo avança sem capturar resposta
Step 4 ("Qual o valor da conta") tem `capture electricity_bill_value` mas `fallback.mode = goto`. Quando Franciele respondeu *"Queria saber um pouco mais sobre essa questão"*, o bot:
- respondeu *"Pode me responder, por favor? 🙂"* (genérico, sem entender a dúvida);
- depois avançou mesmo assim, ignorando "100/150" e a pergunta sobre imposto.

Devia ser `fallback: repeat` + roteamento por intenção (dúvida → FAQ; valor → capturar).

### 4. Pergunta sem ramo de negação
Step 6 ("posso estar explicando abaixo?") tem só `trigger_intent: afirmacao` (ok/sim/pode/claro/manda/beleza). Se o lead responde "não", "ainda não", "espera" → fica travado em `repeat` e o bot insiste.

### 5. Steps "fantasma" sendo pulados
Steps 5 (`80188e5f` "Valor da conta") e 6 (`bdc7ebb3`) têm `message_text` vazio/quase vazio. Lucas pulou direto de pos 4 → pos 7 sem passar pelo "posso explicar?". O resolver custom está saltando passos com texto vazio mesmo quando eles têm propósito (gate/transição).

### 6. Texto com erro no step de explicação
Step 7 (`a71ba814` "Como funciona"): *"É simples, mas vou mandar um audio e um  para ficar mais facil de entender"* — falta a palavra ("um vídeo"/"uma imagem"), espaço duplo, sem pontuação. É a primeira impressão técnica que o lead recebe.

### 7. Sem debounce/agrupamento de inbound
Franciele mandou 4 mensagens em ~80s; o bot reagiu à 1ª e ignorou as outras 3. O processamento é por mensagem individual, sem aguardar fim da rajada.

### 8. Bot não detecta objeção real ("Não consigo ver vídeo", "Não tem custo mesmo?")
Não há regras em `bot_flow_rules` cobrindo esses casos comuns nem handoff para humano configurado.

---

## Plano de correção (priorizado)

### Fase 1 — Quick wins (impacto alto, baixo risco)
1. **Preencher `text_response` de todas as intents de FAQ** (Como funciona, Quanto custa, Tem fidelidade, Tem multa, Como cancelar, Não consigo ver vídeo, etc.). Entregar 1 resposta canônica por intent.
2. **Consolidar FAQ duplicado**: manter 1 conjunto global (consultant_id null) ou de-duplicar para o flow ativo principal. Reduz manutenção e divergência.
3. **Corrigir texto do step "Como funciona"** ("É simples, vou te mandar um áudio e uma imagem rapidinha pra ficar mais fácil 👇").
4. **Adicionar ramo de negação** no step 6 → vai para step de "quebra de objeção" em vez de repetir.

### Fase 2 — Lógica de fluxo
5. **Mudar fallback do step 4 (valor da conta) para `repeat`** + adicionar transição por intent (`pergunta`/`duvida` → roteia ao FAQ, mantém step).
6. **Não pular steps com `message_text` vazio** se eles têm `transitions` por intent (servem de gate). Ajustar resolver em `bot-flow.ts` para tratar texto vazio como "não emite, mas aguarda input".
7. **Agrupar inbound em rajada** (debounce 8–12s): juntar mensagens consecutivas do mesmo lead antes de processar — usa `whatsapp_message_buffer` que já existe.

### Fase 3 — Cobertura de objeções
8. **Criar `bot_flow_rules` globais** para intents recorrentes: "não tem custo", "não consigo ver vídeo/áudio", "vou pensar", "depois te falo", "é golpe?", "preciso instalar?". Cada uma com resposta + comportamento (`stay` ou `goto`).
9. **Handoff automático** quando lead manda 2+ perguntas seguidas sem o bot conseguir responder → pausa bot + `notifyHandoff` ao consultor (mecanismo já existe).

### Fase 4 — Observabilidade
10. **Dashboard de "perguntas não respondidas"**: agregar inbound em `aguardando_*` que não bateu em nenhuma rule/FAQ, ordenado por frequência, para alimentar Fase 3 continuamente.

---

## O que eu preciso de você para começar

Posso seguir direto com **Fase 1 + 4** (correções de conteúdo + texto + ramo de negação) sem risco, ou prefere que eu mostre antes as respostas que vou escrever em cada intent de FAQ pra você validar o tom?

Também: quer que eu **consolide o FAQ duplicado** em um único conjunto global (recomendado) ou mantenho um por consultor?
