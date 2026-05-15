## Objetivo

Mostrar e gerenciar **TODAS as mídias** (áudio, imagem, vídeo) que a Camila envia em cada passo do fluxo, direto na página `/admin/fluxos`. Cada passo vira o "centro de comando" das mídias daquele momento da conversa, com upload, troca, exclusão e ordem de envio configurável.

## O que muda na página Fluxo da Camila

Cada cartão de passo passa a ter, abaixo das mensagens de texto, uma seção **"Mídias deste passo"** com:

- **Áudios** ligados ao passo — player + botão "Trocar" / "Excluir" / "Adicionar áudio"
- **Imagens** ligadas ao passo — thumb + "Trocar" / "Excluir" / "Adicionar imagem"
- **Vídeos** ligados ao passo — preview + "Trocar" / "Excluir" / "Adicionar vídeo"
- **Ordem de envio** (drag-and-drop simples ou setas ↑↓) — define em que sequência Áudio/Imagem/Vídeo/Texto saem naquele passo. Mostra uma "régua" do tipo `🎙 Áudio → 🖼 Imagem → 🎬 Vídeo → 💬 Texto` que o consultor reorganiza.

Nada de abrir outra tela: tudo acontece dentro do passo (resposta à pergunta 1).

## Mapeamento de passo → slot_key

A `ai_media_library` já usa `slot_key` para amarrar mídia a um momento. Faço o `de/para` direto:

| Passo do fluxo | slot_key (já existe / criar) |
|---|---|
| Boas-vindas | `boas_vindas` (já existe) |
| Vídeo + qualificação | `explainer` (vídeo) + `como_funciona` (áudio, já existe) |
| Check-in pós-vídeo | `checkin` |
| Pitch Conexão Club | `club` |
| Tirar dúvidas | `duvidas` (+ áudios de objeção já existentes: `objecao_preco`, `objecao_distribuidora`, `prova_social`, `fazenda_solar`) |
| Cadastro | `cadastro_pedir_conta` |

A constante `FLUXO` no `FluxoCamila.tsx` ganha um campo `slots: string[]` por passo, listando os slots aceitos.

## Ordem de envio configurável

Adiciono uma coluna `send_order` (int, default 100) em `ai_media_library` e uma coluna `media_order` (jsonb, ex.: `["audio","image","video","text"]`) por passo, salva em **`consultants.flow_step_media_order`** (jsonb com chave = step_key).

Quando a Camila for enviar mensagens daquele passo, a edge function lê essa ordem e respeita. Se nada for definido, usa o padrão atual da memória (Áudio → Imagem → Vídeo → Texto).

> Nota: a alteração da edge function fica fora deste PR de UI (o usuário pediu UI agora). Já deixo o esquema gravando e a página funcional. Em PR seguinte, o `whapi-webhook` lê a ordem e aplica. Posso fazer junto se preferir — diga "fazer tudo".

## Uploads

- Componente único `<MediaUploader slotKey="..." kind="audio|image|video" />` reutilizado nos 3 tipos.
- Áudio: input `accept="audio/*"` + gravação inline opcional (já existe `useAudioRecorder`).
- Imagem: `accept="image/*"`.
- Vídeo: `accept="video/*"` (limite 50MB com aviso).
- Upload vai pro bucket existente **`ai-agent-media`** em `consultants/{userId}/{slot_key}/{uuid}.{ext}` e cria linha em `ai_media_library`.

## Detalhes técnicos

- **Tabelas afetadas**:
  - `ai_media_library`: adicionar `send_order int default 100` (migração).
  - `consultants`: adicionar `flow_step_media_order jsonb default '{}'::jsonb` (migração).
- **Storage**: bucket `ai-agent-media` (já existe e é público).
- **RLS**: `ai_media_library` já tem RLS por `consultant_id`; só confirmar policy de INSERT/DELETE pro próprio user.
- **UI components novos**:
  - `src/components/admin/fluxo/StepMediaPanel.tsx` — painel das mídias por passo
  - `src/components/admin/fluxo/MediaUploader.tsx` — upload + lista + delete
  - `src/components/admin/fluxo/MediaOrderEditor.tsx` — reorder drag/setas
- **Página alterada**: `src/pages/FluxoCamila.tsx` — adiciona `slots` em cada passo da constante `FLUXO` e renderiza `<StepMediaPanel>` dentro do cartão.
- **Hooks**: novo `useStepMedia(slotKeys: string[])` agrupando por slot+kind.

## Fora do escopo

- Editar a edge function `whapi-webhook` para ler `media_order` (mencionado acima — me avise se quer junto).
- Métricas por mídia (já temos `sent_count`/`reply_count`, posso expor depois).
- Biblioteca global de mídias — continua na página Assistente IA; aqui é a visão **por passo**.

## Pergunta final antes de implementar

Faço **só a UI** (gravando ordem no banco) ou **UI + edge function** que respeita a ordem na hora de enviar? A primeira é mais segura (não toca o bot que está rodando hoje); a segunda fecha o ciclo todo.