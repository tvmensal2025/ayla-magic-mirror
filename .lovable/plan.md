## O que vamos construir

Uma nova aba **"Templates de Voz"** dentro de WhatsApp → Templates, onde o consultor monta uma **mensagem de áudio personalizada** combinando vários trechos gravados por ele mesmo. Quando enviado para um lead, o sistema **junta os trechos na hora** colocando o nome certo da pessoa no meio do áudio — soa como se o consultor estivesse falando ao vivo com aquele lead específico.

### Exemplo prático

Consultor grava:

- Trecho 1 (fixo): *"Olá"*
- Slot dinâmico: `{{nome}}` → biblioteca de nomes gravados (Ana, Lucas, Maria, Paula, Rafael…)
- Trecho 2 (fixo): *"seja muito bem-vindo, eu sou o Rafael Ferreira Dias."*

Lead "Ana" recebe: áudio único = "Olá" + "Ana" + "seja muito bem-vindo, eu sou o Rafael Ferreira Dias." — tudo costurado, soando contínuo.

## Telas

### 1. WhatsApp → Templates → nova aba "Voz personalizada"

- Lista dos templates de voz do consultor (nome, prévia tocável já com um nome de exemplo, atalho `/voz-ola`, ações).
- Botão **"Novo template de voz"**.

### 2. Editor do template de voz

Linha do tempo horizontal de **blocos** na ordem em que vão tocar:

```text
[ 🎤 Áudio fixo ] [ 👤 Nome do lead ] [ 🎤 Áudio fixo ] [ + Adicionar ]
   "Olá"            {{nome}}            "seja bem-vindo…"
```

- Botão **"+"** entre/depois de cada bloco abre menu: **Gravar áudio fixo** | **Inserir nome do lead** | **Inserir variável** ({{valor_conta}}, {{cidade}}…).
- Cada bloco tem: play, regravar, excluir, arrastar para reordenar.
- Cada gravação usa o gravador OGG/Opus que já existe (`useAudioRecorder` + `loadOpusRecorder`) — mesma qualidade dos áudios atuais.
- Painel "**Pré-visualizar com nome**": campo de texto → escolhe um nome da biblioteca (ou digita) → toca o áudio costurado final.
- Dica visível: *"⚡ Palavra-chave deste template: `{{nome}}` — o sistema busca a gravação correspondente na sua biblioteca de nomes."*

### 3. Biblioteca de nomes (mesma página, aba secundária)

- Grid com cada nome gravado: Ana ▶, Bruno ▶, Lucas ▶, Maria ▶…
- Botão **"+ Gravar nome"**: digita o nome → grava o áudio dele → salva.
- Botão **"Gravar lista"** (modo rápido): consultor cola lista de nomes ("Ana, Bruno, Lucas…") e o sistema vai pedindo um a um para gravar — depois de cada gravação, próximo nome aparece automaticamente.
- Busca + indicador "X nomes gravados / Y leads na base sem nome gravado" (avisa lacunas).

### 4. Envio

- No chat e no envio em massa, atalho `/voz-ola` aparece no menu de respostas rápidas (igual templates de texto).
- Ao mandar, o sistema:
  1. Pega o `customer.name` do lead.
  2. Normaliza ("Maria José" → tenta `maria_jose`, depois `maria`).
  3. Se achar o nome na biblioteca → costura e envia.
  4. Se **não** achar → avisa o consultor: *"Você ainda não gravou o nome 'Fernanda'. Quer gravar agora?"* (abre o gravador inline).
- Áudio final entregue como **um único OGG/Opus** (WhatsApp/Whapi exige), igual aos atuais.

## Como o áudio é "juntado" (detalhes técnicos)

- Cada gravação é salva separada no MinIO (mesma estratégia atual de templates).
- Costura acontece numa **edge function nova** (`voice-template-stitch`):
  1. Recebe `template_id` + `name`.
  2. Baixa os OGGs dos blocos na ordem (fixo + nome + fixo…).
  3. Concatena com `ffmpeg concat demuxer` (já temos `compress-worker` com ffmpeg — reusa a mesma imagem ou faz no worker e devolve URL).
  4. Sobe o OGG final no MinIO (cache por `template_id+name` → segunda vez é instantâneo).
  5. Retorna URL pública.
- Frontend pede a URL costurada e manda via `whapi-proxy` `send_media` (audio) — fluxo idêntico ao envio normal.
- Pré-visualização no editor usa o mesmo endpoint.

## Banco de dados (novas tabelas)

- **voice_templates** — por consultor: `name`, `shortcut` (opcional, ex `/voz-ola`), `description`.
- **voice_template_blocks** — blocos ordenados de cada template: `template_id`, `position`, `kind` (`fixed_audio` | `name_slot` | `variable_slot`), `audio_url` (para fixed_audio), `variable_key` (para variable_slot, ex `{{nome}}`).
- **voice_name_clips** — biblioteca de nomes do consultor: `consultant_id`, `name_normalized` (chave de busca: `ana`, `maria_jose`), `name_display`, `audio_url`.
- **voice_template_renders** — cache de áudios já costurados: `template_id`, `name_normalized`, `final_audio_url`, `created_at`. Invalida quando algum bloco/clipe é regravado.

Tudo com RLS por `consultant_id` (mesmo padrão dos `message_templates` atuais).

## Ajudas para o consultor (durante a gravação)

- No editor, quando o bloco é `name_slot`, mostra: **"🔑 Palavra-chave deste slot: nome do lead"** + sugestão *"Grave os trechos fixos com tom natural, terminando frase aberta antes do nome ('Olá…') e começando depois do nome ('… seja bem-vindo')."*
- Medidor visual de volume durante a gravação (waveform simples).
- Botão *"Tocar emendado"* dentro do editor para o consultor ouvir como vai soar antes de salvar.
- Detector de silêncio nas pontas: corta automaticamente >300ms de silêncio no começo/fim de cada trecho para a costura ficar contínua.

## Fora do escopo desta versão

- Síntese TTS de nomes faltantes (consultor sempre grava os nomes ele mesmo — é o ponto da feature).
- Múltiplas variáveis simultâneas além de `{{nome}}` na v1 — começamos só com nome; estrutura já suporta adicionar `{{cidade}}`, `{{valor_conta}}` depois sem mudar tabelas.

## Entregáveis

1. Migration: 4 tabelas novas + RLS.
2. Edge function `voice-template-stitch` (ffmpeg concat + cache no MinIO).
3. UI: aba "Voz personalizada" no `TemplateManager` + editor de blocos + biblioteca de nomes.
4. Integração no chat e bulk send: atalho `/voz-*` resolve template de voz, costura e envia.
5. Aviso/atalho de gravação quando o nome do lead não existe na biblioteca.  
6. PODENDO SER PERSONALIZADO COM COMECO MEIO E FINAL COM PALAVRAS CHAVES  
