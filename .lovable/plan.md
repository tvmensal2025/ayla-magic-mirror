Plano para corrigir o problema mostrado no WhatsApp mobile:

1. Corrigir o auto-scroll do ChatView
- Trocar o `scrollIntoView` do sentinel por rolagem direta no container (`scrollTop = scrollHeight`), porque no mobile/com browser embutido o `scrollIntoView` pode tentar rolar a página/ancestrais em vez da lista de mensagens.
- Rodar a rolagem em múltiplos momentos seguros: imediatamente, em `requestAnimationFrame`, após pequeno timeout e quando a altura mudar.
- Manter a proteção de não puxar o usuário se ele rolou para cima, mas resetar essa proteção ao trocar de conversa e ao enviar mensagem.

2. Corrigir a ordem das mensagens no WhatsApp
- Ajustar `useMessages` para normalizar `messageTimestamp` com segurança e ordenar de forma estável.
- Para mensagens no mesmo segundo, preservar uma ordem confiável baseada na posição original do retorno da API, sem inverter incorretamente sequências de áudio/vídeo/texto.
- Evitar que mensagens otimistas (`temp-*`) ou mensagens recém-carregadas do servidor fiquem fora de lugar quando têm o mesmo horário.

3. Corrigir também o feed “Conversa ao vivo” da Captação
- Aplicar a mesma rolagem direta no `CaptureConversationFeed`.
- Ordenar as mensagens por `created_at` crescente na consulta e manter o feed realtime reordenado após inserts, para não depender só de append.

4. Verificação
- Conferir no viewport mobile 429x853 se a lista abre no fim, se novas mensagens mantêm o final visível e se áudio/vídeo/texto aparecem na sequência correta.