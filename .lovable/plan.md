Diagnóstico: o áudio/vídeo está indo 2x por dois motivos combinados:

1. O fluxo está em um passo sem transição ampla. Quando o cliente manda algo longo ou áudio transcrito que não bate exatamente com as palavras-chave, o fallback `goto` manda para o próximo passo com mídia de novo.
2. A proteção de “não enviar a mesma mídia duas vezes” não está gravando nada: a tabela `ai_slot_dispatch_log` exige a coluna `variant`, mas a função `try_log_media_send` insere sem `variant`. O RPC falha silenciosamente no caminho `conversational`, então o log fica vazio e a mídia passa de novo.

Plano de correção:

1. Corrigir a função do banco `try_log_media_send`
   - Inserir `variant` com valor padrão seguro, por exemplo `personal`.
   - Tornar a função atômica: tentar inserir e retornar `false` quando já existir `(customer_id, media_id)`.
   - Garantir que o índice único atual continue bloqueando duplicidade real.

2. Corrigir o código do fluxo `conversational`
   - Trocar os RPCs manuais por um helper único de deduplicação, igual ao caminho legado.
   - Registrar erro de dedupe no log quando acontecer, em vez de deixar passar invisível.
   - Aplicar isso tanto em mídia do passo quanto em mídia de Q&A.

3. Ajustar comportamento do fallback para não parecer repetição
   - Quando o usuário está no mesmo passo e manda dúvida longa/áudio, evitar reenviar áudio/vídeo do próximo passo se a mesma mídia já foi enviada.
   - Manter o texto/resposta normal, mas bloquear apenas áudio/vídeo repetido.

4. Validar com dados reais
   - Conferir que `ai_slot_dispatch_log` passa a registrar a mídia enviada para a Viviane.
   - Simular duas mensagens seguidas no mesmo passo e confirmar que o segundo evento não reenvia o mesmo áudio/vídeo.
   - Deploy da edge function `whapi-webhook` após a correção.