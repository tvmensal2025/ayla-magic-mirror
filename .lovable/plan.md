# Fluxo IA para Fechar a Venda — Camila 2.0

## Diagnóstico do fluxo atual

Hoje o `evolution-webhook/handlers/bot-flow.ts` é uma **máquina de estados determinística de 38 steps**, focada em coletar documentos e jogar no portal iGreen. Problemas para conversão:

1. **Não vende, só formulariza.** Pula da boas-vindas direto para "manda foto da conta". Sem qualificação, sem benefício, sem prova social.
2. **Sem decisão contextual.** Não diferencia lead frio (anúncio Facebook) de lead quente (indicação), nem trata objeção ("é golpe?", "preciso pensar").
3. **Tudo ou nada.** Se o lead não manda a conta na hora, vira `aguardando_humano` ou trava — sem follow-up, sem rota alternativa.
4. **Sem memória de intenção.** O `ai_agent_config.system_prompt` existe mas o bot-flow ignora — só usa LLM em casos pontuais (OCR Gemini).
5. **Saldo zerado / pause já existe** — bom. Falta usar a IA para **resgatar leads pausados** quando há saldo.

---

## Proposta: funil de venda em 5 fases com decisão híbrida

```text
┌─────────────────────────────────────────────────────────────────────┐
│  FASE 1: ABERTURA       → quebra de gelo + qualificação rápida     │
│  FASE 2: DESCOBERTA     → dor, valor da conta, distribuidora        │
│  FASE 3: PITCH          → economia personalizada + prova social     │
│  FASE 4: OBJEÇÃO        → IA decide: responder, mídia, ou humano    │
│  FASE 5: FECHAMENTO     → coleta documentos no momento certo        │
└─────────────────────────────────────────────────────────────────────┘
       ↑                                                          ↓
       └────────── follow-up automático (T+30min, T+24h) ─────────┘
```

**Arquitetura híbrida:** estados rígidos só para coleta de dados sensíveis (CPF, conta, doc). Tudo antes e entre coletas é **LLM com tool-calling** decidindo a próxima ação.

---

## Detalhamento por fase

### Fase 1 — Abertura (substitui `welcome` e `menu_inicial`)
- **Decisão da IA:** detecta origem do lead (`customers.lead_source.utm_source`).
  - `facebook_ads` → "Vi que você se interessou pelo anúncio de economia na conta de luz…"
  - `indicacao` → usa nome do indicador (já em `customer_referred_by_name`).
  - `organico` → abertura neutra + qualificação.
- **Pergunta única:** "Sua conta de luz vem por qual distribuidora? (CPFL, Enel, Cemig…)"
- **Saída:** `qualified_distribuidora` ou `out_of_area` (se distribuidora não atendida → mensagem honesta + tag no CRM).

### Fase 2 — Descoberta
- Pergunta o **valor médio da conta** (sem pedir foto ainda — barreira menor).
- IA classifica:
  - `< R$ 200` → ticket baixo, oferta resumida + 1 tentativa.
  - `R$ 200–600` → fluxo padrão.
  - `> R$ 600` → marca `high_value`, prioriza no CRM, oferece falar com humano se quiser.
- Pergunta a dor: "O que mais te incomoda na conta hoje?" → grava em `customers.pain_point` (campo novo).

### Fase 3 — Pitch personalizado
- IA calcula economia estimada (12% × valor informado) e responde:
  > "Com R$ {valor}, você economizaria cerca de R$ {valor*0.12}/mês = R$ {valor*0.12*12}/ano. Sem obra, sem mudança de fiação, mesma energia da rede."
- **Mídia inteligente:** consulta `ai_media_library` por `intent_tags=['pitch','prova']` filtrando por `step_tags=['fase_pitch']` e envia o vídeo/áudio mais relevante (ex: depoimento de cliente da mesma distribuidora).

### Fase 4 — Tratamento de objeção (coração da decisão)
LLM com tool-calling. Tools disponíveis:

| Tool                       | Quando usar                                  |
|----------------------------|----------------------------------------------|
| `send_media(intent)`       | Pediu prova → manda depoimento/print         |
| `send_text(message)`       | Resposta simples                             |
| `request_handoff(reason)`  | Lead quente confuso, pediu humano, ou irritado |
| `schedule_followup(hours)` | "Depois eu vejo" → agenda mensagem em N horas|
| `advance_to_closing()`     | Sinais de compra detectados                  |
| `mark_lost(reason)`        | "Não quero", bloqueio, fora do perfil        |

Sinais de compra que a IA deve reconhecer: "como faço?", "quanto demora?", "preciso de quê?", "quero entrar", "vamos lá".

### Fase 5 — Fechamento (volta ao state machine atual)
Só agora pede conta de luz + documento + CPF. Aproveita os 38 steps atuais **inalterados** — eles funcionam para coleta. Mudança: ao concluir, IA envia áudio de parabéns personalizado.

### Follow-up automático (novo)
Cron `pg_cron` a cada 15 min:
- Lead em fase 1–4 sem resposta há **30 min** → 1 mensagem de resgate (IA escolhe ângulo).
- Sem resposta há **24 h** → 2ª mensagem com mídia diferente.
- Sem resposta há **72 h** → marca `lost_no_response`, libera saldo de campanha.
Limite: máx 2 resgates (`customers.rescue_attempts` já existe).

---

## Decisão híbrida: quando IA, quando script

| Situação                              | Quem decide        |
|---------------------------------------|--------------------|
| Coleta de CPF, RG, conta, OTP         | State machine      |
| OCR + validação de documento          | Gemini (já existe) |
| Resposta livre, objeção, pitch        | **LLM com tools**  |
| Escolha de mídia para enviar          | **LLM (busca por tags)** |
| Quando pausar bot e chamar humano     | **LLM**            |
| Follow-up de resgate                  | **LLM + cron**     |

---

## Detalhes técnicos

**Mudanças de schema (1 migration):**
- `customers`: `pain_point text`, `qualification_score int`, `intent_signals jsonb`, `next_followup_at timestamptz`.
- Nova tabela `ai_decisions` (audit): `customer_id`, `phase`, `tool_called`, `reasoning`, `created_at` — para você ver **por que** a IA tomou cada decisão (resolve a queixa de "não dá pra entender").

**Edge functions:**
- `ai-sales-agent` (nova) — recebe contexto do customer + histórico recente de `conversations` + media library disponível, chama Lovable AI Gateway (`google/gemini-3-flash-preview`) com tool-calling, retorna ação. Chamada pelo `evolution-webhook` nas fases 1–4.
- `ai-followup-cron` (nova) — invocada por `pg_cron` a cada 15 min, varre `customers.next_followup_at <= now()`, dispara `ai-sales-agent` em modo "resgate".

**evolution-webhook/handlers/bot-flow.ts:**
- Adicionar branch no topo: se `conversation_step` ∈ {`welcome`, `menu_inicial`, `pos_video`, `objection`, `nurturing`} → delega para `ai-sales-agent` em vez de switch hard-coded.
- Steps de coleta (aguardando_conta em diante) ficam como estão.

**UI nova em `AIAgentTab`:**
- Aba "Decisões da IA" mostrando timeline por lead: fase, ferramenta usada, justificativa (texto da IA), resultado. Resolve diretamente a dor de transparência.
- Configuração de tom/estilo por consultor (já existe `ai_agent_config.tone`, `system_prompt`) — adicionar campo "objetivo de venda" e "objeções frequentes".

**Custo/observabilidade:**
- Cada turno custa ~1 chamada Gemini Flash (~R$ 0,001). Lead típico: 5–10 turnos = R$ 0,01.
- Logar em `ai_agent_logs` (já existe) com `latency_ms`, `llm_output`, `handoff_reason`.

---

## Métricas de sucesso

| KPI                                | Hoje (estimado) | Meta |
|------------------------------------|-----------------|------|
| Lead → conta enviada               | ~25%            | 45%  |
| Conta enviada → cadastro completo  | ~40%            | 65%  |
| Tempo médio até fechamento         | 3 dias          | 1 dia|
| % handoff para humano              | ~30%            | 12%  |

---

## Entregáveis (ordem de implementação)

1. **Migration** — campos novos em `customers` + tabela `ai_decisions`.
2. **Edge function `ai-sales-agent`** com tool-calling.
3. **Refator `bot-flow.ts`** — delegação para IA nas fases conversacionais; manter coleta determinística.
4. **Edge function `ai-followup-cron`** + agendamento `pg_cron`.
5. **UI "Decisões da IA"** em `AIAgentTab` (timeline + config de objetivo/objeções).
6. **A/B test** — 50% leads no fluxo novo vs antigo por 7 dias, comparar conversão.

Posso começar pelo passo 1+2 (base mínima funcional) ou montar tudo de uma vez. Recomendo passo a passo — entrega valor já no item 2.