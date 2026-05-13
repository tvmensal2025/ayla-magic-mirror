## Objetivo

Tornar a aba **Inteligência** um ciclo completo: ver o anúncio "perfeito" do concorrente → gerar criativo otimizado → publicá-lo como anúncio em 1 clique. Toda mídia (imagem/vídeo/áudio) passa a ser armazenada no **MinIO** (bucket `igreen`), e cada criativo gerado pode ser marcado como **público** (visível para todos os consultores) ou **privado** (apenas dono).

---

## 1. Padronizar storage em MinIO

Hoje o `ad-creative-image-generator` salva no bucket Supabase `IMAGE`. Vou trocar para MinIO usando o helper já existente (`_shared/minio-upload.ts`), criando uma variante `uploadCreativeToMinio()` com pasta `creativos/{consultor_slug}/{yyyymmdd}_{angle}_{format}.png`.

Outros pontos de upload de mídia gerada por IA (futuro: vídeo/áudio) também usarão esse helper. Mídias dinâmicas do WhatsApp continuam no Supabase Storage (regra de memória já existente).

---

## 2. Toggle público/privado nos criativos gerados

**Migração:**
- Adicionar coluna `is_public boolean default false` em `ad_generated_creatives`.
- Política RLS adicional: `SELECT` permitido a todos `authenticated` quando `is_public = true`.

**UI (`CreativeImageGenerator.tsx`):**
- Cada card de criativo gerado recebe um switch "Público / Privado" (com ícone de cadeado/globo).
- Ao alternar, faz `update` na linha do criativo.
- Filtro na galeria: "Meus criativos" / "Galeria pública".

---

## 3. "Anúncio perfeito do concorrente" em destaque

No `CompetitorsPanel.tsx`:
- Card de destaque **"Anúncio Campeão da Semana"** no topo, escolhido por score: `active_days DESC` + presença em múltiplos formatos + recência.
- Mostra thumbnail grande, headline, primary_text, CTA, dias ativo, marca, formato e link para o original na Meta Ad Library.
- Botão **"Inspirar criativo nele"** → abre o gerador já pré-preenchido com o ângulo, copy e visual desse anúncio (passa `inspired_by` para a edge function, que injeta no prompt do Gemini).
- Lista secundária: top 5 anúncios por marca (Solfácil, Reverde, Matrix...) com mesmo botão.

---

## 4. Fluxo "Gerar → Anunciar" em 1 clique

Após gerar a imagem, cada card de criativo ganha botão **"Usar neste anúncio"**:
- Abre `CreateCampaignExpress` já pré-preenchido com a imagem gerada (URL MinIO), headline e primary_text sugeridos pelo brief, e ângulo.
- Salva `used_in_campaign_id` em `ad_generated_creatives` para rastrear ROI por criativo gerado.

---

## 5. Análise: o que ainda falta para "100% funcional"

| Item | Status | Ação |
|---|---|---|
| Scraper de concorrentes (semanal) | OK via pg_cron | manter |
| Learner de padrões | OK | manter |
| Rotator de losers | OK | manter |
| Gerador de imagem 1-clique | Existe, salvando no Supabase | **migrar para MinIO** |
| Validação técnica da imagem (safe area, aspect, legibilidade) | parcial (`ad_image_validations`) | rodar automaticamente após geração e exibir score |
| Público/privado | não existe | **adicionar** |
| Anúncio campeão em destaque | não existe | **adicionar** |
| Atalho gerar→campanha | não existe | **adicionar** |
| Re-scrape sob demanda | botão existe | manter |
| Vídeo/áudio gerados por IA | não existe | (fora de escopo deste plano, anotar como próxima fase) |

---

## 6. "Melhor forma de anúncio" (resumo do que o sistema vai aplicar)

Padrões extraídos dos concorrentes ativos há 30+ dias (sinal de que converte):
- **Formato dominante:** Reels 9:16 + Feed 1:1 (carrossel em 2º lugar).
- **Ângulos vencedores:** "economia comprovada na conta" (prova social com print da fatura), "sem obra/sem placa", "cashback mensal", "urgência regional" (cidade do lead).
- **Visual:** rosto humano sorrindo + número grande de % de desconto + logo da distribuidora local + CTA verde.
- **Copy:** primeira linha começa com pergunta ou número ("Pagou R$ 480 de luz?"), CTA "Falar no WhatsApp".
- **Safe area:** título nos 60% centrais (Story/Reels), CTA acima do fold no 1:1.

O gerador já injeta tudo isso no prompt do Gemini; vou reforçar com os dados do **anúncio campeão** quando o usuário clicar em "Inspirar".

---

## Arquivos a alterar/criar

- `supabase/migrations/...` — `is_public` em `ad_generated_creatives` + policy.
- `supabase/functions/_shared/minio-upload.ts` — adicionar `uploadCreativeBytesToMinio()`.
- `supabase/functions/ad-creative-image-generator/index.ts` — usar MinIO; aceitar `inspired_by_ad_id`.
- `src/components/admin/ads/CreativeImageGenerator.tsx` — switch público/privado, botão "Usar neste anúncio", filtro galeria.
- `src/components/admin/ads/CompetitorsPanel.tsx` — card "Campeão da semana" + botão "Inspirar".
- `src/components/admin/ads/CreateCampaignExpress.tsx` — aceitar criativo pré-selecionado via prop/URL state.

---

## Validação

1. Gerar uma imagem nos 4 formatos → confirmar URL `https://minio.../igreen/creativos/...`.
2. Tornar pública e abrir em outra conta → deve aparecer na galeria pública.
3. Clicar em "Inspirar" no campeão concorrente → prompt enriquecido, imagem coerente.
4. Clicar em "Usar neste anúncio" → wizard abre com imagem e copy carregadas.
