## Diagnóstico — o que falta para resultados reais

**Já está 100% funcional (backend):**
- ✅ Scraper de concorrentes rodando + cron semanal (38 anúncios populados de 10 marcas)
- ✅ Learner diário gerando padrões vencedores/perdedores
- ✅ Rotator diário pausando criativos perdedores
- ✅ Builder com 6 ângulos obrigatórios + image briefs
- ✅ Gemini 2.5-flash atualizado

**O que falta para você acompanhar e ter resultados:**
1. **UI ausente**: as tabelas `ad_competitor_creatives` e `ad_creative_insights` existem, mas **nenhuma tela mostra esses dados** hoje. Você não consegue ver os concorrentes nem os insights da IA pelo painel.
2. **Geração de imagem com 1 clique**: hoje o builder gera só *briefs textuais* das imagens. Não existe botão que transforme o brief em imagem real pronta para subir no Meta.
3. **Acompanhamento histórico**: insights e mudanças de concorrentes não têm timeline visível.

---

## Plano

### 1. Nova aba "Inteligência" dentro de Anúncios
Adicionar 4ª aba (`Resultados | Campanhas | Modelos | **Inteligência** 🧠`) em `AdsTab.tsx`.

A aba terá 3 cards verticais:

```text
┌────────────────────────────────────────────────────┐
│ 📊 INSIGHTS DA IA (sua performance)                │
│  • Padrões vencedores: "número específico", ...    │
│  • Padrões perdedores: "tom genérico", ...         │
│  • Resumo: "Headlines com cidade convertem 2x"     │
│  Atualizado há 4h · [Atualizar agora]              │
├────────────────────────────────────────────────────┤
│ 🕵️ CONCORRENTES ATIVOS (10 marcas)                 │
│  Filtro: [Todas ▾] [Ângulo ▾] [Formato ▾]          │
│  Tabela: Marca | Headline | Ângulo | Formato | Dias│
│  Top 5 com mais dias no ar = ★ destaque verde      │
│  Última atualização: hoje · [Re-escanear agora]    │
├────────────────────────────────────────────────────┤
│ 📅 TIMELINE DE ATUALIZAÇÕES                        │
│  • 13/05 09:14 — Learner rodou (3 ads avaliados)   │
│  • 13/05 09:11 — Scraper +38 ads de 10 marcas      │
│  • Cron: scraper toda 2ª 06h, learner diário 07h   │
└────────────────────────────────────────────────────┘
```

**Componentes novos:**
- `src/components/admin/ads/CompetitorsPanel.tsx` — lê `ad_competitor_creatives`, agrupa por marca, ordena por `active_days` desc, mostra top 5 com badge "Top conversor". Botão "Re-escanear" invoca `ad-competitor-scraper`.
- `src/components/admin/ads/InsightsPanel.tsx` — lê `ad_creative_insights` do consultor. Botão "Atualizar agora" invoca `ad-creative-learner`. Vazio-estado: "Rode 3+ campanhas para insights".
- `src/components/admin/ads/IntelligenceTab.tsx` — agrupa os 2 acima + timeline simples lendo `created_at`/`updated_at` dessas tabelas.

### 2. Botão "Gerar criativo perfeito (1 clique)"

Nova edge function `ad-creative-image-generator`:
- **Entrada**: `consultant_id`, `format` (`feed_1x1` | `story_9x16` | `reels_9x16` | `carousel_4x5`), opcional `angle`
- **Lógica**:
  1. Lê insights do consultor + top concorrentes (`ad_competitor_creatives` ordenado por `active_days`)
  2. Pega o `image_brief` correspondente ao ângulo vencedor (ou gera um novo via Gemini)
  3. Chama **Lovable AI Gateway** com `google/gemini-2.5-flash-image` (Nano Banana) — prompt enriquecido com:
     - Padrões vencedores próprios
     - Brand voice iGreen (cores oficiais, tom)
     - Especificação técnica do formato (ratio exato, área segura para texto, foco do anúncio)
     - Anti-padrões dos perdedores ("evite stock photo genérico de painel solar")
  4. Salva o resultado no bucket `IMAGE` do Supabase
  5. Retorna URL + brief usado

- **UI**: dentro do `IntelligenceTab` (e também na galeria de modelos), botão grande:
  ```
  ✨ Gerar criativo perfeito
  [ Feed 1:1 ] [ Story 9:16 ] [ Reels 9:16 ] [ Carrossel 4:5 ]
  ```
  Cada clique gera 1 imagem nas dimensões corretas. Mostra preview + botão "Usar em campanha" e "Baixar".

**Tamanhos exatos (especificação Meta):**
- Feed 1:1 → 1080×1080
- Story/Reels 9:16 → 1080×1920
- Carrossel 4:5 → 1080×1350

O Nano Banana respeita aspect ratio quando incluído explicitamente no prompt; o pós-processamento normaliza para o tamanho final.

### 3. Migração de DB
- Nova tabela `ad_generated_creatives` (consultant_id, format, image_url, brief_used, angle, created_at) — para histórico/galeria de imagens geradas com RLS owner-read/write.

### Arquivos a criar/editar
**Criar:**
- `src/components/admin/ads/IntelligenceTab.tsx`
- `src/components/admin/ads/CompetitorsPanel.tsx`
- `src/components/admin/ads/InsightsPanel.tsx`
- `src/components/admin/ads/CreativeImageGenerator.tsx`
- `supabase/functions/ad-creative-image-generator/index.ts`

**Editar:**
- `src/components/admin/ads/AdsTab.tsx` — adicionar 4ª aba "Inteligência"
- Migração SQL para `ad_generated_creatives`

### Validação final (após implementar)
- Disparar scraper de novo → ver concorrentes na UI
- Disparar learner → ver insights na UI
- Clicar "Gerar Feed 1:1" → imagem aparece em <30s, dimensões corretas

### Observação importante
Insights da IA só aparecem para consultores com **histórico real de campanhas** (mínimo ~3 anúncios com gasto). Hoje o learner avaliou apenas 3 anúncios. Para validar a feature antes de ter volume real, posso adicionar **modo "demo"** que mostra os padrões agregados de TODOS os concorrentes como insight inicial — confirma se quer.