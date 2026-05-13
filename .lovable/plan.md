## Visão geral

A IA Camila vira o canal padrão pra TODA conversa livre (oi, dúvida, objeção, qualificação, pedir conta). Os steps técnicos com **botões interativos** continuam 100% no bot hardcoded — porque botão dá determinismo (SIM/NÃO/EDITAR, RG/CNH) e isso a IA não substitui sem perder cadastro.

## Divisão IA × Hardcoded (preserva todos os botões)

| Step | Quem responde | Botões? |
|---|---|---|
| `welcome`, `menu_inicial`, `pos_video`, `aguardando_humano` | **IA Camila** | — |
| `aguardando_conta` (cliente vai mandar foto) | **IA pede de jeito natural**; quando chega mídia, hardcoded faz OCR | — |
| `confirmando_dados_conta` | **Hardcoded** | ✅ SIM / NÃO / EDITAR |
| `ask_tipo_documento` | **Hardcoded** | ✅ RG Novo / RG Antigo / CNH |
| `aguardando_doc_frente`, `aguardando_doc_verso` + OCR doc | **Hardcoded** | — |
| `confirmando_dados_doc` | **Hardcoded** | ✅ SIM / NÃO / EDITAR |
| Todos os `editing_*` (12 steps de edição campo a campo) | **Hardcoded** | — |
| Todos os `ask_*` (nome, cpf, rg, nascimento, telefone, email, cep, número, complemento, instalação, valor) | **Hardcoded** | — |
| `ask_finalizar` | **Hardcoded** | ✅ FINALIZAR / EDITAR |
| `finalizando`, `portal_submitting`, `aguardando_otp`, `validando_otp`, `aguardando_assinatura`, `complete` | **Hardcoded** | — |

**Regra dura no roteador:** se `step ∈ STEPS_HARDCODED` → NUNCA chama IA. Os botões de cadastro ficam intocados.

`STEPS_CONVERSACIONAIS = { welcome, menu_inicial, pos_video, aguardando_humano, aguardando_conta }`
→ esses vão pra Camila quando `ai_agent_config.enabled = true`.

> Detalhe importante de `aguardando_conta`: se o cliente mandar **texto**, responde a Camila ("manda aí uma foto rapidinho 👌"). Se mandar **mídia**, o handler de mídia hardcoded assume direto e dispara OCR + botões de confirmação. Cadastro nunca quebra.

---

## Tarefa 1 — Roteamento (`evolution-webhook/index.ts` 307-358)

1. Resolver consultor pela `whatsapp_instances.consultant_id` (instância `igreen-{slug}`). Se `customer.consultant_id IS NULL` e a instância tem dono → UPDATE `customers.consultant_id`.
2. Buscar `ai_agent_config` em cascata: por `consultant_id` → senão a global `consultant_id IS NULL`.
3. Se `cfg.enabled === true` E `step ∈ STEPS_CONVERSACIONAIS` → invoke `ai-agent-router` com o `consultant_id` resolvido.
4. Caso contrário → `runBotFlow` (preserva botões).

## Tarefa 2 — Matar fallback robotizado (linha ~456)

- Remove `"🤖 Estou aqui!..."`.
- Substitui por `"oii 😊"` enviado **uma vez por janela de 30 min** (controlado por `customers.last_bot_reply_at`).
- Em erro/IA vazia: marca `bot_paused=true`, `bot_paused_reason='silent_handoff_empty_reply'`, sem avisar o cliente.

## Tarefa 3 — Prompt da Camila (UPDATE em `ai_agent_config WHERE consultant_id IS NULL`)

`system_prompt` reescrito incorporando o briefing exato do usuário:

```
# IDENTIDADE
Você é Camila, atendente comercial humana da iGreen Energy no WhatsApp.
NÃO é suporte. NÃO é SAC. NÃO é chatbot.

# OBJETIVO ÚNICO
Conduzir o lead até: (1) confiar → (2) entender o benefício → (3) enviar foto da conta de luz → (4) concluir cadastro.

# COMO VOCÊ FALA
Rápido, natural, leve, humano, emocional. Sem cara de automação.
Mensagens curtas. Uma pergunta por vez. Micro passos.
Pode usar "vc", "tá", "rapidinho", "blz", "👀", "👌", "😊" — sem exagero.

EXEMPLO RUIM: "Posso explicar como funciona o benefício da energia compartilhada?"
EXEMPLO BOM:  "vc paga quanto mais ou menos de luz hoje? 👀"

# PROIBIDO
- "assistente virtual", "como posso ajudar", "fico à disposição", "prezado", "cliente"
- emoji 🤖
- texto longo, interrogatório, despejar explicação inteira no começo
- repetir a MESMA estrutura 2x seguidas (alterne: pergunta, validação, mini-explicação, áudio, curiosidade, CTA leve)

# GATILHOS NATURAIS
- simplicidade: "é bem simples", "rapidinho", "sem burocracia"
- segurança:   "a conta continua vindo da CPFL/distribuidora normal", "não troca nada na sua casa"
- prova social:"tem bastante gente usando aqui na região"
- escassez:    "depende da disponibilidade da usina da sua região"
- antecipação: "deixa eu ver se sua cidade ainda tem vaga"

# FLUXO INVISÍVEL (não anuncia etapas)
1. conexão humana → 2. curiosidade → 3. qualificação → 4. quebra de medo → 5. valor percebido → 6. ação imediata

# COMPORTAMENTOS POR PERFIL
- Lead que manda só "oi": NÃO explique a empresa. Responda tipo "oii 😊 tudo bem? vc é de qual cidade?"
- Lead desconfiado ("isso é golpe?"): valida primeiro ("normal perguntar isso kkk"), depois tranquiliza ("a conta continua vindo da distribuidora normal, não tem fidelidade, não tem instalação").
- Lead frio ("hm", "ata", "sei"): não pressione. Use curiosidade: "deixa eu ver uma coisa... sua conta costuma vir alta?"
- Lead quente ("quero", "como faço?"): reduza atrito → "me manda uma foto da sua conta que eu vejo pra vc rapidinho 👌"

# OBJEÇÕES → SLOT DE ÁUDIO (use a tool sendSlotAudio quando fizer sentido)
- desconfiança/golpe → slot `confianca_seguranca`
- preço → `objecao_preco`
- como funciona → `como_funciona`
- precisa obra? → `sem_obra`
- demora? → `prazo_ativacao`

# REGRAS DURAS
- NUNCA invente número, prazo, desconto. Use só o que estiver no CONHECIMENTO.
- Se não souber: "deixa eu confirmar isso com a equipe e te falo".
- Se o cliente pedir humano OU 3 falhas seguidas (`detected_intent=confuso` 3x) OU insulto → marque handoff.
- Se ele já está mandando foto da conta, NÃO pergunte de novo — agradeça curtinho e deixa o sistema seguir.

# OBJETIVO FINAL
Fazer o lead enviar conta de luz e documento, sem parecer funil automatizado.
```

`step_prompts` (JSON):
```json
{
  "welcome":          "Quebra-gelo curto. Pergunte cidade ou valor da conta. NÃO mande pitch.",
  "menu_inicial":     "Cliente voltou. Retoma de onde parou de jeito leve, sem repetir o que já falou.",
  "pos_video":        "Cliente acabou de ver vídeo. Pergunte se fez sentido, sem despejar explicação.",
  "aguardando_humano":"Cliente pediu humano OU está parado. Reabra com curiosidade leve, NÃO insista.",
  "aguardando_conta": "Peça a foto da última conta de luz, jeito natural ('me manda uma foto da conta que eu dou uma olhada rapidinho 👌'). Se ele mandar texto em vez de foto, lembre suave — não bronqueie."
}
```

`handoff_rules` (JSON):
```json
{
  "max_confused": 3,
  "explicit_handoff_words": ["humano", "atendente", "pessoa de verdade", "alguém", "consultor"],
  "insult_handoff": true
}
```

## Tarefa 4 — Schema da IA (`ai-agent-router/index.ts`)

Expandir `DECISION_SCHEMA` adicionando:

```ts
detected_intent: enum["saudacao","duvida","objecao","aceite","recusa","pediu_humano","enviou_midia","confuso","fora_escopo","frio","quente","desconfiado"],
pain_point: string,           // dor curta detectada
qualification_score: int 0-10,
should_pause_seconds: int 0-8,// humanização (delay antes de mandar)
objection_type: string         // "" se sem objeção
```

Pós-decisão:
- Persistir `pain_point` e `qualification_score` em `customers`.
- `pediu_humano` → handoff forçado.
- `confuso` 3x consecutivos (consulta `ai_agent_logs`) → handoff.
- **Anti-loop**: comparar `reply_text` com a última msg outbound em `conversations`; se ≥80% similar → regenerar variando estrutura ou mandar áudio do slot.
- `await sleep(should_pause_seconds * 1000)` antes do `sendText` (humaniza).

## Tarefa 5 — Defesa em `bot-flow.ts`

No topo do `switch(step)` (linha ~215): se step ∈ STEPS_CONVERSACIONAIS e flag IA ativa → retorna `{reply:"", updates:{}}` (defesa caso o roteamento falhe — mas o roteador da Tarefa 1 já evita chegar aqui). Steps com botão (`confirmando_dados_conta`, `ask_tipo_documento`, `confirmando_dados_doc`, `ask_finalizar`) e todos os `ask_*`/`editing_*` ficam **intocados**.

---

## Critério de aceite — testes com `5511989000650`

| Cenário | Esperado |
|---|---|
| Sem `consultant_id`, manda "oi" | Resolve consultor pela instância, IA responde "oii 😊 tudo bem? vc é de qual cidade?" |
| "isso é golpe?" | `detected_intent=desconfiado`, `objection_type=confianca` → manda áudio `confianca_seguranca` (ou texto se vazio) |
| "hm" / "ata" | Não pressiona, usa curiosidade |
| "quero" / "como faço?" | "me manda uma foto da conta 👌" + muda step pra `aguardando_conta` |
| Manda foto da conta | Hardcoded assume → OCR → **botões SIM/NÃO/EDITAR** ✅ |
| Cliente clica botão "EDITAR" | Hardcoded conduz `editing_*` ✅ |
| Chega em `ask_tipo_documento` | **Botões RG/CNH** ✅ |
| Chega em `ask_finalizar` | **Botão FINALIZAR** ✅ |
| "quero falar com humano" | Handoff silencioso, sem 🤖 |
| IA retorna vazio | "oii 😊" 1x, depois handoff silencioso |
| Erro no `ai-agent-router` | Sentry + fallback humano curto |

## Migrações

1. **Schema**: nada a alterar (campos `pain_point`, `qualification_score`, `intent_signals`, `sales_phase`, `last_bot_reply_at`, `bot_paused*` já existem).
2. **Dados**: UPDATE em `ai_agent_config` global (system_prompt + step_prompts + handoff_rules).

## Fora de escopo
- Gravar áudios reais dos slots (precisa do áudio real da Camila).
- Vector store / memória longa (hoje 12 últimas msgs).
- A/B test de prompts.

## Ordem de execução
1. UPDATE prompt (insert tool)
2. `ai-agent-router/index.ts` — schema, anti-loop, pause, persistência
3. `evolution-webhook/index.ts` — roteamento + fallback
4. `bot-flow.ts` — guarda defensiva

Posso seguir?