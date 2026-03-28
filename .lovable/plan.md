

## Plano: Pixel de Rastreamento por Consultor + Melhorias Extras

### O que muda para o consultor
Cada consultor poderá, no painel Admin (aba Dados), colar seu **Facebook/Meta Pixel ID** e **Google Analytics ID (GA4)**. Esses pixels serão carregados automaticamente nas páginas públicas dele (cliente e licenciada).

### 1. Banco de Dados — Migration

Adicionar duas colunas à tabela `consultants`:

```sql
ALTER TABLE public.consultants
  ADD COLUMN facebook_pixel_id text,
  ADD COLUMN google_analytics_id text;
```

### 2. Tipo TypeScript

Atualizar `src/types/consultant.ts` para incluir os novos campos:
- `facebook_pixel_id: string | null`
- `google_analytics_id: string | null`

### 3. Painel Admin — Aba Dados

Adicionar dois campos de input no formulário:
- **Facebook Pixel ID** — placeholder: "Ex: 123456789012345"
- **Google Analytics ID (GA4)** — placeholder: "Ex: G-XXXXXXXXXX"

Salvar junto com os demais dados no upsert.

### 4. Componente `PixelInjector`

Criar `src/components/PixelInjector.tsx` que recebe `facebookPixelId` e `googleAnalyticsId` como props e:
- Injeta o script do **Meta Pixel** (`fbq('init', id)` + `fbq('track', 'PageView')`) no `<head>`
- Injeta o script do **Google Analytics** (`gtag.js`) no `<head>`
- Remove os scripts ao desmontar (cleanup)

### 5. Páginas Públicas

Adicionar `<PixelInjector>` em:
- `src/pages/ConsultantPage.tsx`
- `src/pages/LicenciadaPage.tsx`

Passando os IDs do consultor carregado.

### 6. Outras melhorias possíveis (sugestões)

| Ideia | Descrição |
|-------|-----------|
| **TikTok Pixel** | Mesmo padrão — campo extra + injeção de script |
| **Cor personalizada** | Consultor escolhe cor primária da página |
| **Mensagem WhatsApp customizada** | Consultor edita o texto padrão do WhatsApp |
| **Domínio personalizado** | Consultor usa seu próprio domínio apontando para a página |

### Arquivos a criar/editar

| Ação | Arquivo |
|------|---------|
| Migration | Adicionar colunas `facebook_pixel_id`, `google_analytics_id` |
| Editar | `src/types/consultant.ts` |
| Criar | `src/components/PixelInjector.tsx` |
| Editar | `src/pages/Admin.tsx` (formulário) |
| Editar | `src/pages/ConsultantPage.tsx` |
| Editar | `src/pages/LicenciadaPage.tsx` |

