# Remover transcrição automática na variante B

Hoje só dois lugares ainda traduzem áudio→texto: `manual-step-send` e o preview `CaptureStepPreview`. Os webhooks de produção (whapi-webhook e evolution-webhook) já simplesmente **descartam** o áudio na variante B e enviam apenas o `message_text` configurado para o fluxo B. Vou alinhar o resto com esse comportamento.

## Mudanças

### 1. `supabase/functions/manual-step-send/index.ts`

- Remover import e uso de `ensureAudioTranscript`.
- Variante B: apenas filtrar `kind === "audio"` (igual ao bot-flow). Nada de transcrição.
- Limpar o segundo trecho idêntico em `sendConfiguredStep` (encadeamento de passos).

### 2. `src/components/captacao/CaptureStepPreview.tsx`

- Variante B: filtrar áudios diretamente (sem fallback para transcript).
- Remover bloco `kind === "text"` que renderizava `"transcrição do áudio"`.
- Substituir o aviso "X áudios sem transcrição" por uma nota informativa:
  > "Variante B (texto puro): áudios são ignorados. Use o campo de texto do passo para escrever a versão escrita."

### 3. Memória

- Atualizar `mem://features/ab-test-audio-vs-text.md`: remover qualquer menção a transcript-fallback; variante B = áudios são pulados, sem tradução.

## Fora do escopo

- Schema de banco (`ai_media_library.transcript` continua existindo, só não é mais usado nessa pipeline — útil em outras features).
- Botão "Gerar texto (IA)" do `/admin/fluxos` para preencher o `message_text` da variante B (já existe).
- whapi-webhook / evolution-webhook (já estão corretos, só descartam áudio).

Quer que eu aplique? sim