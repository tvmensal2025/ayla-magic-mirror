## Problemas identificados

Pela screenshot e leitura do código:

1. **Captação cobre o composer (digitação difícil)** — `CaptureSheet` abre automaticamente em `h-[44dvh]` (≈ 380px de 853px) por cima do `MessageComposer`. No mobile, o textarea fica espremido/escondido e, ao tocar pra digitar, o teclado virtual sobe e tampa ainda mais.
2. **Auto-scroll não acontece** — em `ChatView.tsx` o efeito faz `scrollTop = scrollHeight` no dep `[messages]`, mas:
   - quando o `CaptureSheet` abre/fecha, a altura do container muda DEPOIS do scroll já ter rodado;
   - mídias (áudio, vídeo, imagem) carregam assíncronas e empurram o conteúdo pra baixo sem disparar novo scroll;
   - a primeira renderização tem `messages=[]` e quando chega o lote, o effect roda antes do layout pintar.
3. **`MessageComposer` recebe `templates` indefinido** — em `ChatView` o prop `templates` não é passado (a interface exige). O menu `/` quebra silenciosamente.

## Mudanças

### 1) Não deixar a Captação tampar o chat (mobile)
Em `src/components/captacao/CaptureSheet.tsx`:
- Ao abrir, em viewport `< 768px` iniciar **minimizado** (já existe a barra-pílula em `bottom-3`) em vez do bottom-sheet de 44dvh.
- Reduzir o sheet compacto pra `h-[38dvh]` no desktop e manter pílula no mobile.
- Em `ChatView.tsx`, no auto-open por lead novo, em mobile abrir já em `minimized=true`.

### 2) Composer sempre acessível
Em `src/components/whatsapp/ChatView.tsx`:
- Passar `templates={templates}` para o `MessageComposer` (bug atual).
- Garantir que a área `Messages` use `pb` igual à altura do composer e que o composer fique colado no rodapé usando `mt-auto` (já está em flex column — confirmar que o pai do `ChatView` tem `min-h-0` no caminho todo).

### 3) Auto-scroll robusto
Em `src/components/whatsapp/ChatView.tsx`:
- Trocar o efeito atual por um padrão "sentinel + ResizeObserver":
  - Adicionar um `<div ref={bottomRef} />` no fim da lista.
  - Efeito que faz `bottomRef.current?.scrollIntoView({ block: "end" })` quando `messages.length` muda OU quando um `ResizeObserver` no container detecta crescimento de altura (mídias que terminaram de carregar).
  - Só auto-scrolla se o usuário já está perto do fim (threshold 120px) — assim não atrapalha quem rolou pra cima pra ler histórico.
- Aplicar o mesmo padrão em `src/components/captacao/CaptureConversationFeed.tsx` (sentinel + ResizeObserver), substituindo o `scrollTop = scrollHeight` no `[rows.length]`.

### 4) Pequenos ajustes UX
- No header do chat, esconder o botão "Captação X/Y" quando o sheet estiver minimizado-pílula (a pílula já mostra o contador, evita ruído visual).
- Garantir `scroll-padding-bottom` na área de mensagens pra que, com o teclado virtual aberto, a última bolha não fique colada na borda.

## Arquivos tocados
- `src/components/whatsapp/ChatView.tsx` — passar `templates`, novo auto-scroll, abrir captação minimizada em mobile.
- `src/components/whatsapp/MessageComposer.tsx` — nenhum (só consumir o `templates` que volta a chegar).
- `src/components/captacao/CaptureSheet.tsx` — default minimizado em mobile, altura compacta reduzida no desktop.
- `src/components/captacao/CaptureConversationFeed.tsx` — auto-scroll com sentinel + ResizeObserver.

## Fora de escopo
Não mexer em envio, fluxos, banco, ou nas Edge Functions. Mudança puramente de UI/UX.