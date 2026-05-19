---
name: A/B Test Audio vs Text
description: Fluxo A (com áudio) e Fluxo B (sem áudio) por consultor; B envia o transcript do áudio como mensagem de texto na mesma posição
type: feature
---
Fluxo A e B por consultor (bot_flows.variant). customers.flow_variant alterna 1=A, 2=B via assign_flow_variant quando consultants.ab_test_enabled=true.

Variante B: o dispatcher (whapi-webhook, evolution-webhook, manual-step-send) NÃO descarta áudios — chama `ensureAudioTranscript` (em `_shared/audio-transcript.ts`) que reutiliza `ai_media_library.transcript`; se vazio, baixa o áudio e invoca `ai-transcribe-media`, salva e usa. O item é então empurrado na sequência como `{ kind: 'text', text: transcript }` na MESMA posição que o áudio ocuparia (slot "audio" do media_order).

Admin (FluxoCamila + StepMediaPanel): prop `variant` controla a UI. Em B, cada áudio mostra `AudioTranscriptEditor` (textarea + botão Transcrever) que persiste em `ai_media_library.transcript`. Texto/imagem/vídeo são compartilhados entre A e B.
