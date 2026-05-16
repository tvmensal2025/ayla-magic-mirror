## Plano

1. **Corrigir a ordem real de envio no motor do WhatsApp**
   - Ajustar `sendStepMedia`/`emitStep` no fluxo conversacional para tratar `text` como parte da ordem configurada.
   - Hoje o código envia todas as mídias primeiro e só depois o texto, então mesmo quando a UI mostra `Text → Audio → Video`, o backend manda `Audio/Video → Text`.
   - Depois da correção, a ordem salva na tela será respeitada exatamente: texto, áudio, vídeo, imagem.

2. **Preservar os delays configurados**
   - Manter `text_delay_ms` como atraso antes do texto.
   - Manter `delay_before_ms` de cada mídia como atraso antes daquela mídia.
   - Evitar esperas duplicadas ou longas que façam o envio sair fora de ordem.

3. **Garantir compatibilidade com cascata e anti-duplicação**
   - Manter o controle que evita reenviar áudio/vídeo duplicado.
   - Manter `__inline_sent` quando o passo enviar texto/mídia diretamente.
   - Não mexer no conteúdo do passo, nem trocar mídias, apenas corrigir a ordem de envio.

4. **Validar o passo da tela enviada**
   - Conferir o passo “Como funciona” do consultor atual, que está salvo com ordem `text → audio → video → image`.
   - Testar a função/fluxo para confirmar que o texto sai antes do áudio e do vídeo.