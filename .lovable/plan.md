Plano para fazer exatamente o fluxo completo, do primeiro passo ao último:

1. Ajustar `dev-fire-all-steps`
   - O modo de simulação vai parar de depender do `continueFlow`, porque ele interrompe quando encontra pergunta/captura.
   - Em vez disso, ele vai percorrer todos os passos ativos do Fluxo 1/variante A por `position`, do início ao fim.
   - Para cada passo, vai chamar `manual-step-send` com `part: "all"`, `force: true`, `skipNameGuard: true` e `continueFlow: false`.

2. Disparar a sequência completa
   - Vai enviar nesta ordem real do fluxo atual:
     - 1. Captura do nome
     - 2. Boas-vindas
     - 3. Pergunta valor da conta
     - 4. Explica o desconto
     - 5. Pede permissão para explicar
     - 6. Como funciona
     - 7. Convite para o cadastro
     - 8. Conta de luz
     - 9. Documento com foto
     - 10. Confirmação e envio
   - Não vai esperar resposta real no meio.
   - Não vai deixar o bot decidir o próximo passo.
   - Não vai pular para código/conta/documento sozinho por webhook.

3. Corrigir os resets para teste do zero
   - Ao iniciar com `fresh/reset`, limpar estado anterior do lead.
   - Forçar `flow_variant = "A"`, `bot_paused = false`, `capture_mode = "auto"` ou neutro conforme necessário.
   - Limpar histórico de conversas quando for teste do zero.

4. Melhorar o retorno do teste
   - A resposta da função vai mostrar o plano completo com todos os passos.
   - Cada passo terá status individual: enviado, ignorado por estar vazio, erro ou debounce.
   - Logs vão mostrar claramente `position`, `step_type`, `step_key` e resultado.

Detalhes técnicos:
- A mudança principal será em `supabase/functions/dev-fire-all-steps/index.ts`.
- `manual-step-send` será reutilizado para manter a mesma lógica de envio de texto, áudio, vídeo, imagem e prompts automáticos de captura.
- Não vou mexer no `whapi-webhook` agora, porque esse teste deve ser um disparo completo controlado, não uma conversa real orientada por respostas.