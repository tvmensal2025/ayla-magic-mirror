## Objetivo

Parar de "disparar tudo" e rodar o fluxo como cliente real: cada passo de captura só avança quando o lead responde de verdade no WhatsApp.

## Diagnóstico do problema atual

O `dev-fire-all-steps` simula os passos em sequência sem esperar inbound. Resultado no run do JOSINETE:
- 01:33:23 → bot pediu a conta
- 01:33:38 → bot já pediu o documento (15s depois, sem cliente responder)

Isso é "bagunça" porque pula o OCR real e empilha perguntas. O bot de produção (`whapi-webhook`) já faz a transição correta sozinho quando recebe a mídia.

## Plano

### 1. Novo modo no `dev-fire-all-steps`: `mode: "real"`

- Reset opcional do customer (mesmas flags que hoje: `bill_*`, `doc_*`, `last_inbound_media_*`, conversation history).
- Dispara **somente o primeiro passo** do fluxo (welcome / saudação) com `continueFlow: true`.
- Encerra a execução. A partir daí, **quem avança é o `whapi-webhook`** com base nas respostas reais que você mandar pelo WhatsApp.
- Retorna no JSON o `run_id`, o próximo passo esperado e instruções curtas ("Responda seu nome → envie valor → envie foto da conta → envie foto do documento").

### 2. Botão/ação no `/admin/fluxos` (ou onde está hoje)

- Renomear "Disparar todos" para deixar 2 opções claras:
  - **Simular tudo (debug)** → comportamento atual.
  - **Iniciar teste real** → chama novo modo `real`.
- Mostra um painel pequeno com o status do customer atualizado a cada 10s (passo atual, última mensagem in/out) lendo `customers` + `conversations`, para você acompanhar o avanço sem abrir o DB.

### 3. Watchdog leve (opcional, default ON)

- Se passar > 10min sem inbound do lead de teste, marca o run como `idle` no painel — não força nada, só sinaliza.

## Detalhes técnicos

- Arquivo: `supabase/functions/dev-fire-all-steps/index.ts` — adicionar branch `if (mode === "real")` que executa apenas o primeiro passo via `manual-step-send` com `continueFlow: true` e sai.
- Frontend: ajustar o componente que hoje chama `dev-fire-all-steps` para passar `mode` e renderizar o painel de acompanhamento (poll simples no Supabase JS).
- Sem mudanças em `whapi-webhook`, `manual-step-send` ou no engine de fluxo — eles já tratam o avanço real.

## Fora de escopo

- Mudar a lógica de OCR / captura.
- Alterar o fluxo A/B/C ou o resolver de passos custom.
