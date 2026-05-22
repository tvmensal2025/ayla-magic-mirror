# Templates com gravador inline + Slots livres na Voz Personalizada

## 1. Templates (aba "Templates") — gravador ao lado do "selecionar arquivo"

**Onde:** `src/components/whatsapp/templates/TemplateListItem.tsx` (modo edição)

Hoje, ao editar um template existente, só dá pra trocar o áudio via Upload. Vou colocar **dois botões lado a lado** (quando `editMediaType === "audio"`):

- 📁 **Upload mídia** (já existe)
- 🎤 **Gravar com minha voz** (novo — usando o mesmo recorder do `TemplateCreateForm`)

Resultado: o consultor abre um template padrão da iGreen (ou seu fork pessoal), clica em "Gravar com minha voz", grava ali mesmo, e o áudio sobe pro MinIO substituindo o `media_url`. O texto/legenda/imagem ficam iguais — só a voz muda.

Também vou garantir que aparece um player de pré-escuta logo abaixo, para conferir antes de salvar. Cancelar/parar/timer iguais ao do form de criação (vou extrair em um pequeno hook compartilhado `useTemplateAudioRecorder` para não duplicar a lógica do opus-recorder).

## 2. Voz Personalizada — slots de palavra-chave livres

**Onde:** `src/components/whatsapp/voice/VoiceTemplateEditor.tsx` + `useVoiceTemplates.ts`

Hoje só existe **um tipo** de slot: `name_slot` (`{{nome}}`). A tabela `voice_template_blocks` já tem suporte a `kind: "variable_slot"` e coluna `variable_key`, então não precisa migration.

Mudanças:

- Adicionar terceiro botão na timeline: **"+ Slot variável"** (além de "Áudio fixo" e "Slot do nome").
- Ao criar um slot variável, abrir um inline-input pedindo a palavra-chave (ex: `cidade`, `valor_conta`, `produto`). Validação: minúsculas, sem espaços, sem `{{}}` (o sistema embrulha sozinho).
- Cada bloco `variable_slot` exibe um card com a chave (ex: `{{cidade}}`) e um botão **"Editar palavra-chave"** + lixeira.
- No pré-visualizar emendado, para cada `variable_slot` presente, mostrar um input para o consultor digitar um valor exemplo (ex: "São Paulo"). Esses valores vão como `variables: { cidade: "São Paulo" }` pro stitcher.
- Lógica de match: o stitcher (`voice-template-stitch`) procura um `voice_name_clip` cujo `name_normalized` bate com o valor digitado. Ou seja, a biblioteca de "Nomes" passa a se chamar **"Biblioteca de áudios variáveis"** — pode guardar nomes de pessoas, cidades, números, qualquer palavra-chave reutilizável.
- Se faltar gravação para a palavra → mesma UX de hoje: retorna `name_not_recorded` + missing key, e abre o recorder inline pra gravar na hora.

## 3. Edge function `voice-template-stitch`

Pequeno ajuste: aceitar `variables: Record<string,string>` (além do `name` legado) e resolver cada `variable_slot` pela `variable_key` do bloco → procura clip normalizado. Cache key passa a ser `template_id + sorted(JSON.stringify(variables))`.

## Detalhes técnicos

- Sem migration nova — schema já comporta `variable_slot` + `variable_key`.
- Extrair recorder OGG/Opus 16kHz mono em hook compartilhado para reuso entre `TemplateCreateForm`, `TemplateListItem` (edição) e `VoiceClipRecorder`.
- UI mantém o padrão atual (botões outline tracejados, ícones lucide, cores roxas/verdes do tema).
- Sem mudanças de roles/RLS.

## Fora de escopo (não vou tocar agora)

- Atalho `/voz-...` no compositor do chat (pendente da rodada anterior).
- Múltiplas variáveis no `{{nome}}` legado dos templates regulares — só nas Vozes Personalizadas.
