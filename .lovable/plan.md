## O que vou fazer

Duas frentes em paralelo: **(A)** card de template muito mais informativo, **(B)** corrigir a causa raiz de "0 conversas" e métricas zeradas.

---

## A) Cards de Template — SuperAdmin + Galeria do Consultor

Hoje o card mostra só: 3 miniaturas, título, headline truncada (2 linhas), R$/dia, usos. Você quer mais.

### Novo card (mesmo componente, 2 modos: compacto / expandido)

**Topo visual**
- Carrossel das fotos no formato real (1:1, 4:5, 9:16) com pílula do formato em cada uma, em vez de 3 thumbs cortadas no mesmo aspect-video.
- Selo de status: `Publicado` / `Rascunho` / `Arquivado` + selo de aprovação Meta (quando houver `meta_review_status`).

**Bloco "Copy completa"** (expansível, default fechado)
- Headline completa.
- Texto principal inteiro (sem line-clamp).
- Descrição.
- Lista de variantes A/B: `N headlines × M textos principais` com botão "Ver variantes" abrindo accordion.

**Bloco "Segmentação"** (sempre visível, denso)
- Chips de distribuidoras alvo (ou "Todas").
- Cidades alvo (ou "Todas as cidades das distribuidoras").
- Faixa etária `age_min–age_max` + gênero.
- Idiomas / país se houver.

**Bloco "Performance real" (últimos 30d)** — novo
- Agrega `facebook_metrics_daily` de TODAS as `facebook_campaigns` cujo `template_id = t.id`.
- Mostra: Gasto, Impressões, Cliques, CTR, **Conversas WhatsApp**, Leads, CPL médio, Clientes fechados (`customers_acquired`), Frequência média.
- Se `usage_count = 0` → estado vazio claro: "Nenhum consultor publicou esse modelo ainda" (em vez de "0" mudo).
- Se `usage_count > 0` mas métricas = 0 → "Aguardando primeiros dados da Meta (até 24h após publicar)".
- Sparkline 30d de gasto + conversas (opcional, leve, com `recharts` já no projeto).

**Bloco "Score de qualidade IA"**
- Lê `ad_image_validator` cacheado por foto: pior caso (erro / atenção / aprovada) com tooltip.
- Score médio de qualidade da copy (se já existir em `ad_creative_qa`).

**Rodapé de ações (já existe + 1 novo)**
- Editar, Publicar/Despublicar, Apagar.
- **Novo**: "Duplicar" (cria cópia como rascunho — útil pra A/B no nível do template).
- **Novo**: "Ver campanhas" — abre modal listando todas as campanhas reais ativas criadas a partir desse template, com performance individual.

### Galeria do consultor (`AdTemplatesGallery`)
Mesmo card, mas sem ações de SuperAdmin e com performance filtrada **apenas pelas campanhas dele**.

---

## B) Diagnóstico "0 conversas" e dados zerados

Encontrei a causa provável lendo `supabase/functions/facebook-sync-metrics/index.ts`:

### Bug 1 — action_type único e desatualizado
A sync só lê:
```ts
a.action_type === "onsite_conversion.messaging_conversation_started_7d"
```
A Meta retorna conversas CTWA em **vários** action_types dependendo da campanha:
- `onsite_conversion.messaging_conversation_started_7d` (legado)
- `onsite_conversion.messaging_first_reply`
- `onsite_conversion.total_messaging_connection`
- `messaging_conversation_started_7d` (sem prefixo, em alguns formatos)

Se sua campanha for CTWA moderna, a Meta provavelmente devolve `messaging_first_reply` ou `total_messaging_connection` e o sync ignora → **0 conversas**.

**Fix**: helper `sumActions(actions, types[])` que soma TODOS os action_types relevantes, e o mesmo helper aplicado ao breakdown por placement.

### Bug 2 — `leads` só conta `action_type === "lead"`
Para campanhas CTWA (objetivo MESSAGES) não existe action `lead` — o equivalente é a própria conversa iniciada. Por isso `leads = 0` e `CPL = 0` mesmo com gasto rodando.

**Fix**: quando a campanha for CTWA (`destination_type = WHATSAPP` ou `objective = OUTCOME_ENGAGEMENT/MESSAGES`), usar `messaging_conversations_started` como denominador do CPL.

### Bug 3 — `customers_acquired` reconciliação
A função reconcilia `customers_acquired` lendo `deals` aprovados nos últimos 7d filtrados por consultor — vou verificar se ela está fazendo o `match` por `attribution_source = 'meta_ads'` corretamente; se não, todos zerados.

### Bug 4 — Estado vazio enganoso
Vários painéis mostram "0" quando deveriam mostrar "Sem dados ainda" ou "Aguardando Meta". Vou trocar por estados claros com instrução (CTA "Forçar sync agora" reaproveitando `SyncMetricsButton`).

### Diagnóstico rápido antes do fix (1 query)
Vou rodar um `SELECT` em `facebook_metrics_daily` dos últimos 3 dias para confirmar se `spend_cents > 0` mas `messaging_conversations_started = 0` — confirma o bug do action_type. E vou logar o `actions[]` cru da Meta numa execução manual da edge function pra ver quais action_types ela está devolvendo no seu caso real.

---

## Detalhes técnicos

**Arquivos a editar**
- `src/components/superadmin/AdTemplatesPanel.tsx` — novo card expansível, blocos descritos.
- `src/components/admin/ads/AdTemplatesGallery.tsx` — mesmo card, modo consultor.
- `src/services/adTemplates.ts` — novo método `getTemplateAggregatedMetrics(templateId, scope)` que agrega `facebook_metrics_daily` por template.
- `supabase/functions/facebook-sync-metrics/index.ts` — helper `sumActions`, suportar 4 action_types, CPL inteligente por objetivo, log dos action_types crus para diagnóstico.

**Novo (se necessário)**
- Componente `TemplatePerformanceBlock.tsx` reutilizado nos dois cards.
- Migração leve: índice em `facebook_campaigns(template_id)` se ainda não existir, pra agregar rápido.

**Sem mudança de schema** salvo o índice acima.

---

## Ordem de execução
1. Diagnóstico via SQL + log de action_types da Meta (5 min).
2. Fix do `facebook-sync-metrics` (action_types + CPL CTWA) e re-sync.
3. Novo card de template no SuperAdmin.
4. Galeria do consultor reutilizando o card.
5. Validar com você: abrir um template real e conferir números batendo com o Ads Manager.