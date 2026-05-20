---
name: A/B/C Test Audio vs Text vs Video
description: Fluxo A (com áudio), B (sem áudio, texto direto), C (com vídeo inicial) por consultor; round-robin 1=A, 2=B, 3=C
type: feature
---
Fluxos A, B e C por consultor (bot_flows.variant). `customers.flow_variant` alterna via `assign_flow_variant` quando `consultants.ab_test_enabled=true`: contador % 3 → 1=A, 2=B, 0=C.

**Variante A**: fluxo original, envia tudo (áudio + texto + mídias).

**Variante B (texto puro)**: dispatchers (whapi-webhook, evolution-webhook, manual-step-send) **simplesmente descartam áudios** (`kind === 'audio'`). O consultor escreve a versão em texto direto no campo `message_text` do passo da variante B em `/admin/fluxos`. Nada de transcrição automática nem fallback para `ai_media_library.transcript`. Se o passo B não tiver `message_text` configurado, o cliente recebe só as mídias não-áudio (imagem/vídeo) — vazio se não houver nenhuma.

**Variante C**: cópia independente do A criada por `clone_bot_flow_as_c` RPC. Tratada como A pelos dispatchers (sem lógica especial). Consultor adiciona um vídeo no primeiro passo via admin para iniciar a conversa com apresentação em vídeo.

Admin (`/admin/fluxos` em `FluxoCamila.tsx`): seletor de 3 abas A/B/C; botões "Criar Fluxo B" e "Criar Fluxo C" chamam `clone_bot_flow_as_b` / `clone_bot_flow_as_c`. Switch só liga A/B/C test quando ambos B e C existem.

`_shared/audio-transcript.ts` permanece no repo para outras features (search/analytics), mas NÃO é mais chamado por nenhum dispatcher.
