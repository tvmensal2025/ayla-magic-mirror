## Diagnóstico — por que os números estão "errados"

Comparando o que aparece na tela com `useAnalytics.ts`:

| KPI topo | Valor exibido | Origem real | Problema |
|---|---|---|---|
| Visitas | 16 | últimos **7 dias** | Ignora o seletor "Últimos 30 dias" → funil mostra 39 |
| Cliques | 0 | últimos 7 dias | Mesma janela fixa; funil mostra 3 cliques CTA em 30d |
| Novos Leads | 10 | `customer_origin = whatsapp_lead/manual`, últimos 7 dias | Coincide com funil só por acaso |
| Aprovados | 24 | `walletCustomers` aprovados com `created_at >= 7d` | Usa data de **sincronização** da carteira iGreen, não a data real de aprovação → todo sync inicial vira "aprovado essa semana" |

**Causa raiz:** `HeroKpis` está hardcoded em "7d vs 7d anteriores" enquanto o resto do dashboard respeita `periodDays`. E "Aprovados" usa `created_at` do registro sincronizado (não `approved_at`).

---

## Plano

### 1. Corrigir dados (useAnalytics.ts)

- `heroKpis` passa a respeitar `periodDays` (compara período atual vs período anterior de mesmo tamanho).
- Renomear card "Aprovados" para **"Carteira iGreen"** com o total real de `walletCustomers` aprovados (snapshot atual, não delta por janela) — é o número que o consultor quer ver de verdade.
- Adicionar KPI novo de **"Receita potencial"** = soma de `electricity_bill_value` da carteira aprovada (formato BRL).
- "Cliques" passa a contar só CTAs de conversão (`whatsapp*`, `cadastro*`), alinhado ao funil.
- Subtítulo do hero passa a refletir o período real ("Últimos 30 dias vs. 30 anteriores").

### 2. Redesign visual — Editorial high-contrast

Direção: preto puro, tipografia gigante, accent verde esmeralda + amarelo âmbar, sem glow/glass.

**Hero KPIs (refeito)**
- Grid 4 colunas, fundo `#0a0a0a`, borda fina `#1f1f1f`.
- Número em **font-heading 5xl-6xl**, tracking apertado.
- Label minúscula em maiúsculas com tracking largo (estilo NYT).
- Sparkline maior (110×36) na lateral direita.
- Delta como pill outline (verde/âmbar/cinza), não preenchido.
- Separadores verticais finos entre cards (não quatro caixas isoladas).

**Valor de cada clique (ClickValueGrid)**
- Vira tabela editorial com ranking numerado (#1, #2…).
- Número grande do total + sparkline inline + delta.
- Linha do CTA com mais cliques recebe fundo `#111` e barra âmbar à esquerda.

**Funil de Conversão**
- Cascata visual (cada etapa mais estreita, alinhada ao centro), no estilo Linear.
- Mostra `count`, `% do topo`, e `% da etapa anterior` em colunas tipográficas.
- Linhas conectoras tracejadas entre etapas indicando drop-off.

**Gráficos novos (substituem o bloco "Tráfego LP" colapsável)**
- **Tendência diária** (AreaChart minimalista, sem gradiente espesso): Visitas + Cliques no período inteiro.
- **Heatmap hora × dia da semana**: identifica horários quentes (substitui o bar chart de weekday).
- **Top origens de tráfego**: mantém tabela mas com barra horizontal embutida na linha.

### 3. Componentes afetados

- `src/hooks/useAnalytics.ts` — refatorar `heroKpis` e `weekComparison` por `periodDays`; novo campo `walletSnapshot`.
- `src/components/admin/dashboard/HeroKpis.tsx` — redesign completo.
- `src/components/admin/dashboard/ClickValueGrid.tsx` — redesign tabela editorial.
- `src/components/admin/PerformanceCharts.tsx` — funil em cascata + heatmap novo.
- `src/components/admin/dashboard/Sparkline.tsx` — variante "large" sem fill.
- `src/components/admin/DashboardTab.tsx` — limpar bloco "Tráfego detalhado" colapsável (passa para dentro do redesign).

### 4. Fora do escopo

- Aba "Anúncios & Origem" e "Clientes iGreen" — só "Visão Geral" é redesenhada agora.
- Toolbar e WalletChip permanecem.

---

## Detalhes técnicos

- Mantém Tailwind tokens (sem cores hardcoded fora de variáveis HSL no `index.css`).
- Adiciona tokens `--editorial-ink: 0 0% 4%`, `--editorial-line: 0 0% 12%`, `--editorial-amber: 38 92% 50%`.
- Recharts: tooltip black/border-amber, grid praticamente invisível, sem axisLine.
- Heatmap construído como grid CSS (`grid-cols-25`) com células `bg-primary/X` por intensidade — sem libs novas.
- `framer-motion` (já no projeto) para fade-in dos números no mount.
