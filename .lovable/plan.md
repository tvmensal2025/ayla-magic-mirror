## 1. UI de Mídias no mobile (MediaColumn)

Hoje a lista cabe em ~80 px de altura visível por causa do dropzone enorme + barra de armazenamento + abas, e o usuário precisa rolar dentro de uma área pequena. Vou:

- Tornar o dropzone **colapsável no mobile** (`< md`): quando recolhido vira um botão compacto "+ Enviar mídia" no topo. Expande só ao tocar.
- Mover **Armazenamento** para uma linha fina única (texto + barra de 4 px) dentro do header, eliminando o bloco grande.
- Aumentar a thumb dos itens para `w-14 h-14` no mobile (com `Play` overlay maior, melhor para tocar) e dar `min-h-[64px]` por linha.
- Tornar o painel **`flex-1` com `max-h-[calc(100dvh-...)]`** e `overflow-y-auto` só na lista, garantindo que a lista cresça e a rolagem fique dentro dela (não da página).
- Sticky no topo: abas Minhas/Públicas + busca opcional, para o usuário sempre ver onde está.

Resultado: no celular a maior parte da tela passa a ser a lista de vídeos, com thumbs grandes e botão de Pré-visualizar (`Eye`) bem alcançável.

## 2. Vídeo principal de explicação

Hoje em `ai-sales-agent/index.ts` (linha 892) o "intro video" é selecionado por regex `conex[aã]o green.*apresenta`, e o prompt do Gemini não tem hierarquia clara entre vídeos. Vou:

- Adicionar uma **flag** `is_primary_explainer` (boolean) na coluna `ai_media_library` (nova migration), com 1 vídeo primário por consultor (constraint parcial unique).
- Na UI de Mídias, adicionar um ícone ⭐ ao lado do Switch para marcar/desmarcar "Vídeo principal de explicação" (apenas para `kind=video`). Tooltip: "Este será o vídeo enviado quando o lead pedir explicação."
- No backend:
  - `introVideo` passa a ser `freshMedia.find(m => m.is_primary_explainer && m.kind==='video')`, com fallback para o regex atual.
  - No system prompt do Gemini, listar mídias com etiqueta `[PRINCIPAL]` no vídeo marcado e instruir: **"Use o vídeo [PRINCIPAL] como primeira opção sempre que o lead pedir 'como funciona' ou tiver dúvida geral. Os outros vídeos só se o lead disser que não entendeu ou pedir mais detalhes."**
  - Manter cooldown de 6h e bloqueio de vídeo consecutivo já existentes.

## 3. Indicador "digitando…" real (humanização Whapi)

A Whapi tem o endpoint `PUT /presences/{ChatID}` com body `{ presence: "typing" | "recording" | "paused", delay: <segundos> }` — a Whapi mantém o status "digitando" no WhatsApp do lead pelo tempo do `delay` e depois para sozinha. (Já existe lógica equivalente no caminho Evolution via `sender.n(...)`.)

Vou:

- Adicionar `case "send_presence"` no `whapi-proxy/index.ts`:
  ```
  PUT /presences/{to}  body: { presence, delay }
  ```
  Aceita `presence: "typing" | "recording" | "paused"` e `delay` em segundos (cap 25s, mínimo 1s).
- Adicionar `whapiSendPresence(to, presence, delay)` em `src/services/whapiApi.ts`.
- Adicionar helper `presence()` no `_shared/human-pace.ts` que chama a Evolution OU Whapi conforme flag `isWhapi`, calcula o delay em função do tamanho do texto (mesmo cálculo do `humanPace`) e dispara o presence ANTES do `humanPace` aguardar.
- No fluxo de envio de bot (`whapi-webhook` e `evolution-webhook` bot-flow):
  - Texto: presence `typing` por `min(humanDelay, 15s)` antes do `send_text`.
  - Áudio: presence `recording` antes do `send_audio`.
  - Mídia (vídeo/imagem): presence `typing` curto (3-5s) antes de enviar como cue de "estou mandando algo".
  - Após enviar, presence `paused` (delay 1s) para apagar o indicador imediatamente.

Assim o lead vê "digitando…" / "gravando áudio…" de verdade durante a pausa humana, eliminando a sensação robótica.

## Detalhes técnicos

**Arquivos a alterar:**
- `src/components/admin/AIAgentTab/MediaColumn.tsx` — layout mobile, colapso do dropzone, marcação ⭐ vídeo principal.
- `supabase/migrations/<new>.sql` — `alter table ai_media_library add column is_primary_explainer boolean default false;` + índice parcial único `(consultant_id) where is_primary_explainer`.
- `src/integrations/supabase/types.ts` — regenerado.
- `supabase/functions/whapi-proxy/index.ts` — novo `case "send_presence"`.
- `src/services/whapiApi.ts` — `whapiSendPresence`.
- `supabase/functions/_shared/human-pace.ts` — helper `presence(sender, jid, kind, ms)` agnóstico a Evolution/Whapi.
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (ou equivalente) e `evolution-webhook` — chamar presence antes de `humanPace`/envio.
- `supabase/functions/ai-sales-agent/index.ts` — usar `is_primary_explainer` para escolher `introVideo` e marcar `[PRINCIPAL]` no prompt.

**Sem mudanças** em: schemas de chat, RLS, lógica de extração de memória, cooldown.

## Pergunta antes de implementar

Confirma os 3 itens? Algum em especial você quer começar primeiro (ex.: só o "digitando…" real) ou faço todos juntos?