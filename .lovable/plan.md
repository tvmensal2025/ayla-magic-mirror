## Análise final e ajustes da biblioteca de mídias da IA

### Diagnóstico
A IA já consulta `ai_media_library` com filtros por `step_tags` (fase do funil), `intent_tags` (perfil) e `priority`. Hoje temos 15 vídeos públicos (14 + Conexão Green 1min), mas:
1. **Prioridades estão bagunçadas** — vários empatados, sem hierarquia clara por funil.
2. **Nomes técnicos** (ex: `Green_Energy.mp4`, `Casa_Sustentavel_v2`) atrapalham leitura no painel.
3. **Tela "Mídias" não permite renomear** — só editar tags/ativar/desativar/excluir.
4. **Falta upload com classificação assistida** — hoje todo upload entra como `step_tags=['any']`, sem perfil.

---

### O que vou fazer

**1. Reorganizar prioridades + renomear (migração de UPDATE)**

Nova ordem por fase do funil (priority decrescente = enviado primeiro quando elegível):

| # | Nome novo (label) | Fase (step_tags) | Perfil | Prio |
|---|---|---|---|---|
| 1 | Conexão Green – Apresentação (1min) | descoberta, pitch, any | any | 100 |
| 2 | Como Funciona a Economia | descoberta | any | 95 |
| 3 | Cashback iGreen Club | pitch | conta_alta, conta_media | 92 |
| 4 | Casa Sustentável – Cliente Real | prova_social, objecao_confianca | any | 90 |
| 5 | Depoimento – Conta Alta Aprovada | prova_social | conta_alta | 88 |
| 6 | iGreen Club – Lojas Parceiras | pitch | any | 85 |
| 7 | Indicações & Cashback Recorrente | pitch | any | 82 |
| 8 | Reportagem TV – Energia Limpa | objecao_confianca, prova_social | any | 80 |
| 9 | Reportagem – Mais de 600 mil clientes | objecao_confianca | any | 78 |
| 10 | Conexão Telecom (bônus) | pitch | any | 60 |
| 11 | Conexão Expansão (bônus licenciado) | licenciado | any | 55 |
| 12 | Plano de Carreira – Licenciada | licenciado | any | 50 |
| 13 | Conexão Solar / Placas | licenciado | any | 45 |
| 14 | Conexão Livre | licenciado | any | 40 |
| 15 | Conexão PJ – Empresarial | descoberta, pitch | conta_alta | 70 |

(Ajusto labels por SQL `UPDATE` — sem mexer em URL/storage.)

**2. UI "Mídias" — adicionar renomear inline**
- Em `src/components/admin/AIAgentTab/MediaColumn.tsx`: clique no nome abre input de edição (Enter salva, Esc cancela), com `UPDATE ai_media_library SET label`.
- Adicionar campo de **prioridade** (input numérico compacto) ao lado do switch Ativo, para o consultor reordenar suas próprias mídias.
- Ordenar lista por `priority DESC, created_at DESC` em vez de só `created_at`.

**3. Upload já existe (botão "Nova" + drag&drop)** — só vou:
- Aumentar texto auxiliar para "Após enviar, defina **quando** e **para quem**" (lembrete).
- Default ao enviar: `priority=10` (em vez de 0) para novas mídias aparecerem acima das antigas zeradas.

**4. Validação**
- Confirmar via `supabase.read_query` que os 15 registros foram atualizados com novos labels/prioridades.
- Conferir no preview (`/admin` aba IA) que renomear, editar prioridade e reordenar funcionam.

---

### Detalhes técnicos
- 1 migração `UPDATE` (não cria tabela; usa tool de insert/update).
- 1 edição em `MediaColumn.tsx` (~40 linhas: input editável + campo priority + sort).
- Nenhuma mudança em `ai-sales-agent` — a lógica já respeita `priority` e tags.