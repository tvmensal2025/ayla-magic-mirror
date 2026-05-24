## Daria bom?

Sim — e é exatamente o padrão que grandes operações de chat usam: **um modelo "cabeça" (orquestrador) decide o que fazer; modelos "mão" (especialistas) executam**. OpenAI GPT-5.5 é hoje o melhor em raciocínio passo-a-passo e tool-calling; Gemini 3.1 Pro é o melhor em respostas longas com base em conhecimento + multimodal (lê PDF da conta, foto do documento). Combinar os dois cobre os dois eixos sem depender de um único fornecedor.

A única coisa que não pode acontecer é colocar OpenAI em cada turno de conversa — fica caro e lento. A solução é uma **cascata por intenção**: triagem barata → orquestrador GPT-5.5 só quando precisa decidir → especialista (Gemini Pro) executa.

---

## Arquitetura proposta

```text
                  ┌─────────────────────────────────────┐
inbound msg ───►  │ 1. Triagem (gemini-3-flash-preview) │  classifica: botão? mídia?
                  │    custo ~$0.0001/turno              │  pergunta? saudação? objeção?
                  └────────────────┬─────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
              ▼                                         ▼
   ┌─────────────────────┐                ┌──────────────────────────┐
   │ Caminho determinístico│              │ 2. Orquestrador           │
   │ (botão/mídia/passo   │               │    GPT-5.5 (reasoning med)│
   │ esperado) — sem IA    │              │    Tool-calling:          │
   └─────────────────────┘                │    - answer_faq           │
                                          │    - escalate_human       │
                                          │    - update_lead_field    │
                                          │    - advance_step         │
                                          │    - request_media        │
                                          └─────────────┬─────────────┘
                                                        │
                            ┌───────────────────────────┼──────────────────────────┐
                            ▼                           ▼                          ▼
              ┌──────────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
              │ 3a. Gemini 3.1 Pro       │  │ 3b. Gemini 2.5 Flash │  │ 3c. Ações diretas    │
              │     answer_faq + RAG     │  │     extract_field    │  │     (SQL, send_text) │
              │     (knowledge sections, │  │     (CPF, valor, CEP)│  │                      │
              │     histórico, persona)  │  │                      │  │                      │
              └──────────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

**Quem faz o quê:**

| Camada | Modelo | Quando dispara | Custo relativo |
|--------|--------|----------------|----------------|
| 1. Triagem | `google/gemini-3-flash-preview` | Todo turno texto livre | 1× |
| 2. Orquestrador | `openai/gpt-5.5` (reasoning=medium) | Triagem indicou ambiguidade / pergunta complexa / objeção | 30× |
| 3a. FAQ deep | `google/gemini-3.1-pro-preview` | Orquestrador chamou `answer_faq` | 15× |
| 3b. Extração | `google/gemini-2.5-flash` | Orquestrador chamou `extract_field` (CPF, valor da conta, etc) | 2× |
| OCR | `google/gemini-2.5-flash` (multimodal) | Foto/PDF chegou | 3× |
| Geração de copy passo (admin) | `openai/gpt-5.5-pro` | Botão "Gerar texto (IA)" no /admin/fluxos | sob demanda |

Resultado: a IA "pensa" como GPT-5.5 em todo turno que importa, mas só paga GPT em ~15-25% dos turnos (o resto é botão ou Flash). Estimativa: hoje gastamos ~X em IA → com cascata fica ~1.6–1.8× o atual, com qualidade muito maior.

---

## Plano de implementação

### Fase 1 — Fundação (sem mudança visível, mas destrava tudo)
1. **Novo helper `_shared/ai-orchestrator.ts`** com `runOrchestrator({ message, customer, step, history, tools })` que:
   - Roda a triagem (Flash) primeiro.
   - Se triagem retorna `route="deterministic"` → devolve direto sem chamar GPT.
   - Caso contrário chama GPT-5.5 com tools registradas.
   - Loga tudo em `ai_decisions` (modelo, latência, tool chamada, confiança, custo estimado).
2. **Cascata de fallback automática**: 429/402/timeout em qualquer camada → tenta o próximo modelo da mesma família (Gemini 3.1 Pro → 2.5 Pro → 2.5 Flash; GPT-5.5 → 5.4 → 5-mini). Sem quebrar conversa.
3. **Tabela `ai_costs`** (consultant_id, day, calls, input_tokens, output_tokens, usd_est) atualizada pelo helper — relatório semanal por consultor.

### Fase 2 — Substituir os pontos de IA atuais pelo orquestrador
4. `bot-flow.ts` linhas 1010 e 1822 (passos `duvidas_*`) → trocam para `runOrchestrator`. Resposta sai melhor sem mudar UX.
5. `intent-classifier.ts` (hoje OpenAI direto) → vira ferramenta do orquestrador (`classify_intent`).
6. `ai-button-intent.ts` → vira ferramenta `match_button`.
7. Novo gancho: quando o lead manda **texto livre num passo `message`/`capture_*`** sem casar transição, chama o orquestrador antes do "não entendi". (Resolve o sintoma de "bot ignora pergunta do meio do fluxo".)

### Fase 3 — Memória e personalização (tira o tom genérico)
8. `consultants.ai_persona text` — 3-5 frases que o próprio consultor escreve em `/admin/saude-bot` ("Sou Rafael, piauiense, falo direto, sempre cito CEPISA"). Injetado no system prompt do orquestrador.
9. **Resumo persistente da conversa** em `customers.conversation_summary` (já existe a coluna!) atualizado a cada 6 mensagens pelo Gemini 2.5 Flash. O orquestrador recebe resumo + últimas 8 msgs em vez de truncar histórico cru. Bot lembra o que o lead falou ontem.
10. **Memória de objeção**: `customer_objections (customer_id, objection_type, raised_at, resolved_at)` — orquestrador consulta antes de responder; se já foi resolvida, não repete o discurso.

### Fase 4 — Painel de tunagem (admin/saude-bot)
11. Aba "Cérebro": vê últimas 50 decisões IA, com filtro por `confidence<0.6` (= candidatos a melhorar conhecimento), botão "👎 Marcar resposta ruim" → vira backlog de fine-tune da base.
12. Aba "Custos": gráfico diário por consultor, breakdown por modelo, alerta quando passar de R$ X/dia.
13. Modo "Sandbox": consultor digita uma frase → vê exatamente qual modelo foi chamado, qual ferramenta, qual resposta, em quanto tempo. Sem mandar pro lead.

---

## Arquivos afetados

```text
Novos:
  supabase/functions/_shared/ai-orchestrator.ts
  supabase/functions/_shared/ai-cost-tracker.ts
  supabase/functions/_shared/ai-summary.ts

Editados:
  supabase/functions/_shared/ai-gateway.ts             (cascata de fallback)
  supabase/functions/_shared/ai-faq-answerer.ts        (wrapper, mantém compat)
  supabase/functions/whapi-webhook/handlers/bot-flow.ts (2 chamadas + novo gancho)
  supabase/functions/whapi-webhook/handlers/conversational/intent-classifier.ts
  supabase/functions/whapi-webhook/handlers/conversational/index.ts
  supabase/functions/_shared/ai-button-intent.ts
  src/pages/SaudeBot.tsx                                (aba Cérebro + Sandbox + Custos)

Migrations:
  ai_costs (tabela)
  customer_objections (tabela)
  consultants.ai_persona text
  ai_decisions: índice (customer_id, created_at desc)
```

---

## Pontos a confirmar antes de eu codar

1. **Custo OK?** Estimativa: ~R$30–80/mês por consultor ativo no plano (vs hoje ~R$10). Top em qualidade.
2. **GPT-5.5 ou GPT-5.4 como orquestrador?** GPT-5.5 é o melhor; GPT-5.4 é 40% mais barato e quase tão bom. Posso deixar configurável por consultor.
3. **Implementa tudo ou só Fase 1+2?** Fase 1+2 já entrega "IA não fica burra"; Fase 3+4 é polimento que dá pra fazer depois.

Quer que eu siga com Fase 1+2 com GPT-5.5 como orquestrador padrão?