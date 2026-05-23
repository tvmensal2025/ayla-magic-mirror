# Diagnóstico

Na aba **WhatsApp → Conversas**, o `ChatView` está sem altura constrita, então:

- A área de mensagens (`flex-1 overflow-y-auto`) cresce até caber **todas** as mensagens em vez de scrollar dentro de uma janela fixa.
- O **`MessageComposer`** (campo de digitar + botão `/` de atalhos + anexos + áudio) fica empurrado para **abaixo do viewport** — por isso "não dá para escrever mensagem ou enviar atalhos".
- Os players de áudio/vídeo parecem gigantes porque, sem limite de altura na área de mensagens, eles renderizam o tamanho natural e nada faz scroll interno.

## Causa raiz

Em `src/components/whatsapp/WhatsAppTab.tsx`, os dois wrappers que envolvem o `ChatView` são apenas `flex-1` sem `flex flex-col`:

```text
main (Admin)              h-[100dvh] flex flex-col          OK
 └ <main>                 flex-1 min-h-0 ... flex flex-col  OK
   └ Suspense → WhatsAppTab  flex-1 min-h-0 flex flex-col   OK
     └ "Content area"     flex-1 ... (sem flex-col)         ❌
       └ conversas wrap   flex flex-col h-full              OK
         └ resize-scope   flex flex-1 min-h-0 (row)         OK
           └ wrapper      flex-1 min-w-0 (sem flex-col)     ❌  ← quebra aqui
             └ ChatView   flex-1 flex flex-col min-h-0      OK (mas pai não propaga altura)
```

Sem `flex flex-col` (ou `h-full overflow-hidden`) no wrapper imediato, o `ChatView` cai em altura `auto` e o `flex-1` interno não tem efeito → mensagens empilham e o composer some.

# O que vou mudar (1 arquivo)

`src/components/whatsapp/WhatsAppTab.tsx`

1. Conteúdo da aba (linha ~231): trocar `flex-1 border ... overflow-hidden bg-background` por o mesmo + `flex flex-col` para garantir que cada sub-aba ocupe a altura disponível.
2. Wrapper do `ChatView` no desktop (linha 308): `flex-1 min-w-0` → `flex-1 min-w-0 min-h-0 flex flex-col`.
3. Wrapper do `ChatView` no mobile (linha 273): `flex-1 min-h-0` → `flex-1 min-h-0 flex flex-col`.

Isso devolve a altura para o `ChatView`, que então:
- Limita a área de mensagens (scroll interno volta a funcionar).
- Mantém o `MessageComposer` fixo na base, visível.
- Faz os players de áudio/vídeo respeitarem o `max-w-[75%]` da bolha + `max-h-60` do vídeo — sem mais "esticão".

# O que NÃO vou mudar

- `MessageBubble` / players de mídia — o tamanho fica bom sozinho assim que o container parar de crescer.
- Modo Performance da Captação, Kanban, Envio em massa, Fluxos.
- Lógica de envio, hooks, edge functions.

# Verificação

Depois do fix, no preview em `/admin → WhatsApp → Conversas`:
- Campo "Mensagem (use "/" para respostas rápidas)" visível na base.
- `/` abre menu de atalhos.
- Botão de áudio/anexo/IA visíveis.
- Scroll de mensagens funciona dentro da área, sem empurrar a página.
