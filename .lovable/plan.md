
# Dois Kanbans + Melhorias no Bot/IA

## Diagnóstico atual

**Hoje só existe 1 Kanban** (`crm_deals` + `kanban_stages`), confundindo dois ciclos diferentes:

| Tipo de lead | Onde vive hoje | Problema |
|---|---|---|
| Lead novo do anúncio (ainda em conversa com o bot) | Cai em `novo_lead` mas fica misturado com clientes em pós-venda | Sem visibilidade da **fase de venda** (abertura/descoberta/pitch/objeção/fechamento) |
| Cliente já cadastrado (status=approved/active) | Stages 30/60/90/120 dias | OK, funcionando |

**Boa notícia:** a coluna `customers.sales_phase` **já existe** e o `ai-sales-agent` já atualiza ela com as 5 fases do funil. Só falta o **board visual**.

---

## O que vamos fazer

### 1. Separar em 2 Kanbans (abas no `/whatsapp`)

```
┌───────────────────────────────────────────────────────┐
│  [ 🔥 Funil de Vendas ]  [ 👥 Pós-Venda / Clientes ]  │
└───────────────────────────────────────────────────────┘
```

**Aba A — 🔥 Funil de Vendas (NOVO Kanban)**
- Fonte: `customers` onde `status = 'pending'` e bot ainda ativo
- Colunas baseadas em `sales_phase`:

```
┌─────────┐ ┌────────────┐ ┌────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐
│ABERTURA │→│ DESCOBERTA │→│ PITCH  │→│ OBJEÇÃO  │→│FECHAMENTO  │→│ GANHOU   │
│(novo)   │ │(qualif.)   │ │(oferta)│ │(dúvidas) │ │(pediu foto)│ │(virou    │
│         │ │            │ │        │ │          │ │            │ │ cliente) │
└─────────┘ └────────────┘ └────────┘ └──────────┘ └────────────┘ └──────────┘
                                                          ↓
                                                   ┌─────────────┐
                                                   │   PERDIDO   │
                                                   │ (handoff/   │
                                                   │  desistiu)  │
                                                   └─────────────┘
```

Cada card mostra: nome, telefone, valor da conta, distribuidora, **score de qualificação**, último contato, badge de origem (FB/Insta/orgânico via `lead_source`).

**Aba B — 👥 Pós-Venda (Kanban ATUAL, intacto)**
- Fonte: `crm_deals` (já existe)
- Colunas: novo_lead → aprovado → reprovado → 30/60/90/120 dias
- Não muda nada, continua com mensagens automáticas por stage.

### 2. Transição automática entre os 2 boards

Quando o bot chega em `sales_phase = 'fechamento'` **e** o cliente envia a foto da conta → automaticamente:
- Move pro "GANHOU" no Kanban A
- Cria o card em `novo_lead` no Kanban B (Pós-Venda)

Trigger SQL novo: `customers.status = 'pending' → 'approved'` cria deal em `crm_deals`.

### 3. Melhorias no prompt da IA (`ai-sales-agent`)

Análise do prompt atual (linha 125 de `ai-sales-agent/index.ts`):

✅ **Bom:** estrutura de 5 fases, persona Camila, regras de tool-calling.

⚠️ **A melhorar:**
1. **Sem cálculo concreto na fase PITCH** — falar "12% de R$ 350 = R$ 42/mês = R$ 504/ano" converte muito mais que "você economiza ~12%".
2. **Sem prova social específica** — citar nomes de cidades/quantidade de clientes da região (`get_coverage_summary` já existe).
3. **Tratamento fraco de objeção "é golpe?"** — falta script pronto mencionando ANEEL + 8 anos no mercado.
4. **Sem urgência ética no fechamento** — "ainda dá pra pegar a fatura deste mês se mandar a foto agora".
5. **Sem regra de áudio** — humanizar respondendo com áudio quando o lead manda áudio.
6. **Sem `qualification_score`** sendo atualizado a cada turno (já existe a coluna).

### 4. Score de qualificação (lead heat)

Cada card no Kanban A mostra emoji 🔥🟡🔵 baseado em `qualification_score`:
- 🔥 80–100: respondeu rápido + valor conta > R$ 200 + sem objeção forte
- 🟡 40–79: engajado mas com hesitação
- 🔵 0–39: respondeu pouco / só "oi"

Ajuda o Rafael a saber **onde investir tempo manual** quando entra muito lead do anúncio.

---

## Arquivos a criar/editar

```
NOVOS:
  src/components/whatsapp/SalesFunnelBoard.tsx     # Kanban A (funil)
  src/components/whatsapp/SalesFunnelCard.tsx      # card com score
  src/hooks/useSalesFunnel.ts                      # busca customers por sales_phase
  supabase/migrations/<ts>_funnel_to_crm_trigger.sql  # auto-cria deal quando vira approved

EDITAR:
  src/components/whatsapp/WhatsAppDashboard.tsx    # adicionar Tabs (Funil / Pós-venda)
  src/components/whatsapp/KanbanBoard.tsx          # rename interno: "Pós-Venda"
  supabase/functions/ai-sales-agent/index.ts       # prompt v2 + score update
```

---

## Detalhes técnicos

**Drag-and-drop no Funil de Vendas:** ao arrastar manualmente (override do bot), atualiza `customers.sales_phase` e dispara webhook pra registrar em `bot_step_transitions` (auditoria já existe).

**Performance:** query única com índice em `(consultant_id, status, sales_phase)` — adicionar índice na migration.

**RLS:** já coberto pelas policies existentes de `customers`.

**Tempo estimado:** 1 sessão de build (~6 arquivos novos/editados + 1 migration).

---

## Próximo passo

Aprove o plano e eu implemento na ordem:
1. Migration (índice + trigger funnel→crm)
2. Hook `useSalesFunnel` + componentes do board
3. Tabs no WhatsAppDashboard
4. Prompt v2 da IA com cálculos + prova social + urgência

Quer que eu inclua algo a mais antes de implementar (ex: filtro por origem do anúncio, alertas sonoros pra lead novo)?

