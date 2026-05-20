## Objetivo
Trocar o favicon pelo logo verde "G+folha+lâmpada" enviado, com tamanho correto (com margem interna pra não ficar colado nas bordas), e garantir que o título no topo da aba continue **IGREEN-SUPORTE** — tanto pro consultor logado quanto pra qualquer visitante.

## O que vou fazer

1. **Processar o logo** (`Cópia_de_G_-_Verde.png`, vertical 808×1080)
   - Copiar para `/tmp` e usar ImageMagick para:
     - Gerar quadrado **512×512** com ~12% de padding e fundo transparente → `public/favicon.png` (substitui o atual)
     - Gerar **180×180** → `public/apple-touch-icon.png` (iPhone/iPad)
     - Gerar **32×32** e **16×16** → `public/favicon-32.png` e `public/favicon-16.png` (Chrome/Firefox tab)

2. **Atualizar `index.html`**
   - Adicionar as três tags de `<link rel="icon">` com `sizes` apropriados + `apple-touch-icon`
   - Manter `<title>IGREEN-SUPORTE</title>` e `theme-color #22c55e` (verde combina com a logo)
   - Limpar o comentário `<!-- TODO -->` antigo

3. **Manifest** (`public/manifest.json`)
   - Atualizar os ícones do PWA para apontar para o novo favicon, mantendo "IGREEN-SUPORTE" como nome curto e longo.

## Arquivos afetados

```text
NOVO   public/favicon.png            (512×512, substitui)
NOVO   public/apple-touch-icon.png   (180×180)
NOVO   public/favicon-32.png
NOVO   public/favicon-16.png
EDIT   index.html                    (links de ícone + limpeza TODO)
EDIT   public/manifest.json          (ícones e nome)
```

## Fora de escopo
- Logo dentro da aplicação (header/sidebar) — mexer só se você pedir.
- Geração de `.ico` multi-tamanho (PNGs já cobrem todos os navegadores modernos).
