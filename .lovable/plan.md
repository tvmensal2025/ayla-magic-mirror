## Objetivo

Hoje, na variante B, o dispatcher simplesmente **descarta** todos os áudios. O usuário quer que o Fluxo B fique "100%": o conteúdo dos áudios precisa ser **enviado como texto** (transcrição), na **mesma posição** em que o áudio seria enviado no Fluxo A. Assim B = A, só que falado vira escrito.

Como cada áudio em `ai_media_library` já tem uma coluna `transcript`, vamos reutilizá-la e garantir que toda áudio do consultor tenha transcrição revisada antes de B sair.

---

## Comportamento final

- **Fluxo A**: continua igual (Áudio → Imagem → Vídeo → Texto, ou ordem configurada).
- **Fluxo B**: para cada passo, **cada áudio vira uma mensagem de texto** com a transcrição, exatamente na posição em que o áudio sairia. Imagem/vídeo/texto do passo seguem normalmente.
- Se um áudio não tem `transcript` salvo no momento do envio, o dispatcher chama `ai-transcribe-media` on-demand, salva em `ai_media_library.transcript` e usa.
- A consultora pode editar o texto transcrito no admin (Fluxo B) — isso atualiza `ai_media_library.transcript` (compartilhado, então não polui o A; o A nunca lê o transcript).

---

## Mudanças nas Edge Functions

Arquivos: `supabase/functions/whapi-webhook/handlers/conversational/index.ts`, `supabase/functions/evolution-webhook/handlers/conversational/index.ts`, `supabase/functions/manual-step-send/index.ts`.

1. Em `sendStepMedia`, substituir o filtro atual:
   ```
   if (variant === 'B') medias = medias.filter(m => kind !== 'audio')
   ```
   por uma transformação:
   - Para cada áudio: garantir `transcript` (se vazio, baixar bytes do `url`, chamar `ai-transcribe-media` com `kind:"audio"`, salvar `transcript` na tabela).
   - Trocar o item de `kind:"audio"` por um **item virtual** `{ kind:"text", text: transcript, delayMs }` na sequência.
2. Ajustar o builder de sequência: hoje ele agrupa por kind (`audio|video|image|text`). Vamos permitir múltiplos itens text no meio da sequência preservando ordem original do áudio (slot "audio" do `media_order` passa a despejar textos transcritos um a um, com `delay_before_ms` herdado).
3. Helper novo `ensureAudioTranscript(supabase, mediaRow)` em `_shared/` para evitar duplicação entre os 3 arquivos.
4. Logs claros: `[variant=B] replaced audio "<label>" with transcript (N chars)` ou `[variant=B] audio "<label>" sem transcript e falhou transcrição → pulado`.

---

## Mudanças no admin (`src/pages/FluxoCamila.tsx` + `StepMediaPanel.tsx`)

1. No seletor "Editando: Fluxo B", a seção "ÁUDIOS" deixa de ficar oculta. Em vez disso, vira **"Áudios (enviados como texto no B)"**:
   - Lista os mesmos áudios do A.
   - Para cada um: mostra player do áudio + `textarea` editável com `transcript`.
   - Botão **"Transcrever / Re-transcrever"** que chama `ai-transcribe-media` (já existe) e salva em `ai_media_library.transcript`.
   - Botão **"Transcrever todos pendentes"** no topo do card, para popular tudo de uma vez.
2. Banner no topo da variante B: "No Fluxo B, cada áudio é enviado como mensagem de texto usando a transcrição abaixo. Edite o texto para refinar."
3. Indicador por áudio: badge verde "transcrito" ou amarelo "sem transcrição".

---

## Banco

Nenhuma migração estrutural — `ai_media_library.transcript` já existe. Apenas usaremos/atualizaremos esse campo.

---

## Critérios de aceite

- Lead em variante B recebe, na ordem certa, todos os textos dos áudios do A como mensagens normais — mais imagem/vídeo/texto.
- Editar a transcrição no admin reflete no próximo envio de B.
- Áudio sem transcript é transcrito on-demand na primeira vez que B precisa dele e persiste para próximos leads.
- A continua intacto: nunca envia o `transcript`, sempre o `url` do áudio.
- `manual-step-send` (re-enviar passo manualmente do `LiveConversationsPanel`) respeita a mesma regra.

---

## Perguntas

1. Quando um áudio **não tiver** transcript e a transcrição on-demand falhar (rate limit, erro), você prefere (a) **pular o áudio** e seguir o passo, ou (b) **pausar o lead** e notificar? Plano usa (a) com log de erro.
2. Quer um botão "Transcrever todos" no topo da página que processa todos os áudios do consultor de uma vez (mais rápido para popular), ou só transcrever sob demanda quando abrir cada passo?
