## Diagnóstico — por que a imagem saiu "meme"

Examinei `supabase/functions/ad-creative-image-generator/index.ts` e os componentes `CreativeImageGenerator.tsx` + `CreateCampaignExpress.tsx`. Encontrei três causas combinadas:

1. **Modelo errado para texto em PT-BR.** Estamos usando `google/gemini-2.5-flash-image` (Nano Banana 1). Esse modelo é rápido mas notoriamente fraco em renderizar texto, principalmente acentos e palavras em português → gera "ATÈ 20% MENNOS", "ECONOMlA", letras invertidas.
2. **O próprio prompt PEDE texto na imagem.** Linhas 159–166 mandam o modelo "escrever headline curta tipo 'ATÉ 20% MENOS'" e "selo verde com R$ ou %". Toda vez que o modelo tem que escrever, ele erra. Não dá para corrigir prompt — é limitação do modelo.
3. **Não tem validação nem preview obrigatório.** A imagem é salva direto no MinIO e mostrada na galeria. Quem publica no Express também não vê preview do criativo IA acoplado ao texto final do anúncio.

E sobre o fluxo de publicar: hoje o **Modo Fácil exige upload manual de foto**. A imagem gerada por IA só entra se o usuário clicar "Usar neste anúncio" no card da galeria, abre o express, e ainda assim sobe como foto comum (sem regenerar, sem ajustar). Não dá pra "gerar e publicar de uma vez".

## Plano

### 1. Imagem SEM texto + texto sobreposto deterministicamente (regra de ouro)

A regra clara é: **o modelo NUNCA escreve texto na imagem**. Ele gera só o fundo fotográfico. Headline, selo e CTA viram **overlay HTML/Canvas** renderizado no navegador (ou via SVG no servidor). Texto perfeito em PT-BR, garantido, sempre.

- Reescrever o prompt para proibir explicitamente: "no text, no letters, no words, no numbers, no signs, no logos with text, no UI elements, no captions, no watermarks, no infographics".
- Composição passa a ser puramente fotográfica: pessoa real brasileira segurando conta de luz, mãos com calculadora, casa simples — com **espaço negativo** (área lisa) em posição definida pelo formato, onde o overlay vai entrar.
- Adicionar uma camada `CreativeOverlay.tsx`: renderiza headline + selo de % + logo iGreen sobre a imagem, em fonte do design system, com posicionamento por formato (feed/story/reels/carrossel). O usuário vê o resultado final no preview e baixa um PNG já compositado (via `html2canvas` ou um endpoint `composite-creative`).
- Headline e selo vêm do `generateCopy` (já existe), não da IA de imagem — texto controlado, sem erro.

### 2. Modelo melhor (mas opcional, só se algum cenário pedir texto)

Mesmo sem texto na imagem, vou trocar o default para **`google/gemini-3.1-flash-image-preview` (Nano Banana 2)** — qualidade de Pro com latência similar à Flash 1. Isso resolve também os artefatos de mãos/rostos/conta de luz que ficam bizarros no Nano 1.

Fallback: se a Flash 2 falhar (preview pode oscilar), tenta `google/gemini-2.5-flash-image`.

### 3. QA automático antes de salvar

Antes de gravar no MinIO e expor na galeria:
- Pedir pro Gemini text-only (`google/gemini-3-flash-preview`) avaliar a imagem gerada com 4 critérios objetivos: (a) tem texto/letra visível? (b) tem painel solar no telhado? (c) parece stock photo americana? (d) tem mão/rosto deformado? Se qualquer um for SIM, **regenera automaticamente** (até 2 tentativas) com seed/variação diferente.
- Se as 3 tentativas falharem, retorna erro claro pro usuário em vez de salvar lixo.

### 4. Publicar com criativo gerado na hora (Express)

Adicionar no `CreateCampaignExpress` uma 4ª opção no passo 2 ("Adicionar fotos"):

```
[ Enviar minhas fotos ]   [ ✨ Gerar criativo com IA ]
```

Ao clicar em "Gerar com IA":
- Modal mostra os 4 ângulos (já existem em `ANGLES`) + escolha do formato sugerido pelo Meta (default `feed_1x1`).
- Chama `ad-creative-image-generator` (com QA da etapa 3).
- Mostra **preview já com overlay de headline/selo aplicado** (composição final exata do anúncio).
- Botão "Regenerar" (até 3x) ou "Usar este criativo".
- Quando aprovado, o PNG compositado entra no array `files` como se fosse upload normal — segue o fluxo de `uploadAdPhotos` + `createCampaign` sem mudar mais nada.

Resultado: o usuário não sai do modal Express, não precisa upload de foto própria, e o criativo final é exatamente o que ele aprovou.

### 5. Pequenos ajustes no fluxo atual

- `CreativeImageGenerator` mostra preview com overlay aplicado também na galeria (assim a galeria reflete o anúncio real, não só o fundo).
- Salvar no banco (`ad_generated_creatives`) **duas** URLs: `image_url` (fundo puro) e `composite_url` (com overlay) — a `composite_url` é a que vai pro Meta.
- Adicionar coluna `headline_used`, `badge_text`, `overlay_layout` em `ad_generated_creatives` para reproduzir o overlay igual quando o usuário baixa de novo.

## Mudanças técnicas resumidas

```text
DB (migration):
  ad_generated_creatives: + composite_url text, + headline_used text,
                          + badge_text text, + overlay_layout jsonb

Edge functions:
  ad-creative-image-generator:
    - prompt reescrito (proíbe texto, exige espaço negativo)
    - default model = google/gemini-3.1-flash-image-preview
    - chama nova fn ad-creative-qa (até 3 tentativas)
    - retorna {image_url, headline, badge, overlay_layout}

  ad-creative-qa (novo):
    - recebe URL da imagem, devolve {has_text, has_panel,
      looks_stock, has_deformed_face} via gemini-3-flash-preview

  composite-creative (novo, opcional, server-side fallback):
    - renderiza overlay com canvas (deno-canvas) e devolve PNG final
      pra quem não puder fazer no client

Frontend:
  src/components/admin/ads/CreativeOverlay.tsx (novo)
    - desenha overlay com html2canvas no preview e ao "baixar"

  CreativeImageGenerator.tsx
    - mostra preview com overlay
    - botão "Regenerar"

  CreateCampaignExpress.tsx
    - botão "Gerar criativo com IA" no passo 2
    - sub-modal com escolha de ângulo + preview + regerar
    - PNG compositado entra direto em `files`
```

## O que NÃO vou mexer

- Lógica de cidades, preflight, `createCampaign`, `generateCopy` (texto do anúncio).
- Migração MinIO já em curso.
- Estrutura de pastas do MinIO.
