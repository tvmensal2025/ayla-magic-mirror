# Regras de envio de vídeo e áudio para a IA

## Problema

A IA mandou vídeo de "benefícios" sem o lead pedir e nunca manda áudio. O prompt atual só tem regra forte para vídeo (item 4 do funil) e o ⭐ (`is_primary_explainer`) só vale para vídeo. Não existe gatilho claro de áudio nem matriz de "quando usar cada tipo".

## Solução: 3 camadas de regra

### 1. Marcar a mídia "principal" também para áudio (DB + UI)

Hoje `is_primary_explainer` só faz sentido para vídeo. Vou:

- Reaproveitar a mesma coluna `is_primary_explainer` em `ai_media_library`, mas trocar o índice único para `(consultant_id, kind) WHERE is_primary_explainer = true` — assim cada consultor pode marcar 1 vídeo principal **e** 1 áudio principal (e opcionalmente 1 imagem).
- `MediaColumn.tsx`: o ⭐ aparece para qualquer `kind`, com tooltip "Mídia principal deste tipo (vídeo/áudio/imagem)".

### 2. Matriz de gatilhos no system prompt (`ai-sales-agent/index.ts`)

Substituir o item 4 do funil por uma seção dedicada **QUANDO ENVIAR MÍDIA** com regras determinísticas que a IA aplica em toda decisão:

```text
═══ MATRIZ DE MÍDIA — quando enviar cada tipo ═══

VÍDEO (send_media kind=video) — APENAS se TODAS verdadeiras:
  a) lead fez pergunta de DÚVIDA GERAL: "como funciona", "é golpe",
     "é seguro", "é confiável", "tem custo", "explica melhor", OU
     pediu explicitamente "manda um vídeo".
  b) ainda não enviamos vídeo nas últimas 6h (CADÊNCIA confirma).
  c) existe vídeo [PRINCIPAL] em [MÍDIAS DISPONÍVEIS].
  → use o vídeo PRINCIPAL. Outros vídeos só se ele disser que
     "ainda não entendeu" depois do principal.
  PROIBIDO mandar vídeo de "benefícios", "club", "depoimento" sem
  o lead ter pedido explicitamente OU sem ter visto o principal antes.

ÁUDIO (send_media kind=audio) — envie quando:
  a) lead mandou ÁUDIO na última mensagem (espelho — CADÊNCIA mostra
     "Última msg do lead: audio"), OU
  b) lead pediu "manda áudio", "prefiro áudio", "explica por voz", OU
  c) é a 1ª resposta a uma objeção emocional ("tô com medo", "já me
     enganaram", "não confio") E existe áudio [PRINCIPAL].
  Use SEMPRE o áudio [PRINCIPAL] da lista. Nunca prometa áudio sem
  send_media. Nunca mande áudio depois que a conta já foi recebida.

IMAGEM — só se o lead pedir comprovação visual (print, tabela, etc).

TEXTO (send_text) — DEFAULT. Use sempre que nenhuma regra acima
disparar. Em dúvida, texto.

REGRAS DURAS:
  - Nunca 2 mídias seguidas (CADÊNCIA bloqueia).
  - Nunca mídia depois de "CONTA JÁ RECEBIDA".
  - Nunca cite mídia que não está em [MÍDIAS DISPONÍVEIS].
  - Se a mídia [PRINCIPAL] já foi enviada (sumiu da lista), responda
    por texto curto — NÃO substitua por outra do mesmo tipo.
```

A label de cada item da lista de mídias passa a mostrar:
`[PRINCIPAL-VÍDEO]`, `[PRINCIPAL-ÁUDIO]`, `[PRINCIPAL-IMAGEM]` em vez do genérico `[PRINCIPAL]`.

### 3. Reforço determinístico no código (não só no prompt)

Já existe `auto-send` do vídeo principal quando `isDoubtIntent`. Adiciono espelho equivalente:

- **Auto-áudio quando o lead mandou áudio**: se `lastInboundKind === "audio"`, `recentMediaCount === 0`, há áudio `is_primary_explainer` em `freshMedia`, e a IA escolheu `send_text`, faço override para `send_media` com o áudio principal.
- **Bloqueio anti-vídeo-de-benefícios**: se a IA escolher `send_media` com um vídeo que NÃO é o principal E o vídeo principal ainda não foi enviado a este lead, faço fallback para o principal (ou para `send_text` se cooldown ativo).

## Arquivos a tocar

- `supabase/migrations/<novo>.sql` — drop do índice único atual de `is_primary_explainer`, recria como `(consultant_id, kind) WHERE is_primary_explainer`.
- `src/components/admin/AIAgentTab/MediaColumn.tsx` — ⭐ disponível para qualquer `kind`; tooltip ajustada.
- `supabase/functions/ai-sales-agent/index.ts`:
  - novo bloco "MATRIZ DE MÍDIA" no system prompt (substitui o item 4).
  - label da lista mostra `[PRINCIPAL-{KIND}]`.
  - lógica de auto-áudio + bloqueio de vídeo-fora-do-principal.

## Fora do escopo

- Sem mudança em RLS, schema de mensagens, cooldown atual (6h vídeo) ou handoff.
- Sem mudar UI mobile de mídias (já feito na rodada anterior).

## Próximo passo

Se aprovar, implemento os 3 itens juntos. Depois você marca no painel de Mídias: 1 ⭐ no vídeo de apresentação **e** 1 ⭐ no áudio principal — pronto, a IA passa a respeitar.
