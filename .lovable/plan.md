## O que muda

Quatro ajustes finos no fluxo do bot, mantendo o tom humano que já está rodando.

---

### 1) Ritmo: áudio (2min) primeiro, vídeo só depois

**Hoje:** as mídias do "opening" e dos Q&A são enviadas em sequência com pausa fixa de 1,2s a 1,5s entre elas. Resultado: o vídeo cai antes do lead nem ouvir o áudio.

**Mudança:**
- No envio de mídias do `bot_flow_qa_media` (e do opening), se a sequência tiver `audio` seguido de `video`/`image`, calcular uma **espera proporcional à duração do áudio** antes de mandar a próxima mídia.
- Estratégia simples e sem dependências novas: usar `duration_seconds` do `ai_media_library` (já existe na tabela; se vazio, fallback de 90s para áudio e 30s para vídeo). Aplicar `await sleep(min(duration * 1000, 120_000))` entre áudio→vídeo.
- Manter a pausa atual (1,5s) só entre mídias do mesmo tipo (ex.: dois vídeos).

### 2) Pergunta "deu pra entender?" depois do áudio + vídeo

**Hoje:** depois do opening (áudio + vídeo), o bot já pula direto para perguntar o valor da conta.

**Mudança:**
- Após terminar de enviar o opening (áudio + vídeo do consultor), enviar **uma única mensagem de texto**: `"Deu pra entender, {nome}? Posso te explicar melhor se precisar 😊"`.
- Setar `conversation_step = "checkin_pos_video"` (novo step).
- No handler do `checkin_pos_video`:
  - Se a resposta for afirmativa (`sim|entendi|claro|deu|sim sim|ok|beleza|👍|👌|✅`) → segue para `qualificacao` ("Boa! Então me conta: quanto vem em média na sua conta de luz?").
  - Se for dúvida ou negativa → IA assume (mesmo path do `qualificacao`/Q&A) e responde a pergunta; depois manda o nudge pra valor da conta.
  - Sem botões — texto puro.

### 3) OCR da conta de energia precisa rodar de verdade

**Hoje:** a tela do print mostra que o bot recebeu a conta, disse "Analisando..." e travou. Olhando o código (`processando_ocr_conta` em `bot-flow.ts` linha 1024+), o OCR é chamado mas:
- Quando `fileBase64` está vazio e `fileUrl = "evolution-media:pending"`, o `ocrContaEnergia` recebe inputs inválidos e dá erro silencioso.
- Quando dá erro, ele cai no fluxo de "ask_name" manual sem nem confirmar — mas no print nem isso aconteceu (ficou parado).

**Mudança:**
- **Garantir base64 antes de chamar OCR:** se `fileBase64` estiver vazio mas `fileUrl` for HTTP válido, baixar o arquivo on-demand (fetch + arrayBuffer → base64) antes de chamar `ocrContaEnergia`.
- **Timeout explícito de 25s** no OCR; se estourar ou der erro de rede, **logar com `customer_id` e `mensagem do erro`** e responder ao lead com a mensagem clara de retry (já existe, só não estava sendo executada).
- **Confirmação dos dados continua com botões** (✅ SIM / ❌ NÃO / ✏️ EDITAR) — isso é o ponto crítico onde o usuário **quer** botões.
- Se mesmo após 2 tentativas o OCR falhar, segue para `ask_name` manual com texto natural ("Tive dificuldade em ler a conta, vamos preencher rapidinho juntos. Qual o seu nome completo?").

### 4) Pitch do Conexão Club logo após confirmar a conta

**Hoje:** depois do `confirmando_dados_conta` (SIM), o bot vai direto para `ask_tipo_documento` (RG/CNH).

**Mudança:**
- Inserir um novo step **`pitch_conexao_club`** entre `confirmando_dados_conta` (resposta SIM) e `ask_tipo_documento`.
- Comportamento do step:
  1. Mensagem de texto curta e humana com a economia calculada:
     `"Show, {nome}! Com R$ {valor} de conta dá pra economizar até 20% todo mês na luz 💚\n\nE tem mais: você ainda entra no nosso *Conexão Club* — até *70% de desconto em farmácia*, mercado, posto e várias lojas parceiras. Minha mãe usa direto kkk"`
  2. Em seguida, enviar o **vídeo do Conexão Club** (slot `conexao_club` no `ai_media_library` — já existe a mídia "5. Conexão Club – Lojas, Saúde e Farmácias" mostrada no print do Super Admin).
  3. Depois do vídeo, mensagem de fechamento: `"Bora finalizar seu cadastro? Pra travar tudo eu preciso só de uma foto do seu *RG ou CNH* 📄"`.
  4. Setar `conversation_step = "ask_tipo_documento"` (botões RG Novo / RG Antigo / CNH).
- Aplicar a regra de timing do item 1 (esperar a duração do vídeo antes da mensagem final, se quisermos texto pós-vídeo — ou mandar texto antes do vídeo para o lead já saber o que vem).
- Decisão: **texto antes**, **vídeo no final**, e a próxima interação acontece quando o lead responder.

---

## Detalhes técnicos

**Arquivo único editado:** `supabase/functions/whapi-webhook/handlers/bot-flow.ts`

**Mudanças por bloco:**

1. **Helper `sleepForMedia(kind, duration)`** no topo do arquivo (após os imports):
```text
async function sleepForMedia(kind, durationSec) {
  if (kind !== 'audio') return 1500;
  const ms = Math.min((durationSec || 90) * 1000, 120_000);
  await new Promise(r => setTimeout(r, ms));
}
```

2. **Loop de envio do opening (linha ~466)** e **loop do Q&A (linha ~339)**: trocar a pausa fixa pelo helper, lendo `duration_seconds` do `ai_media_library` (incluir no select).

3. **Novo step `checkin_pos_video`** no `switch(step)` (depois do `qualificacao`, antes do `menu_inicial`).

4. **Opening (linha ~540)**: ao final do envio das mídias, em vez de deixar `step=welcome` e cair na IA, setar `updates.conversation_step = "checkin_pos_video"` e enviar o texto "Deu pra entender, {nome}?".

5. **`processando_ocr_conta` (linha ~1024)**: adicionar fetch on-demand de base64 + `Promise.race` com timeout de 25s no `ocrContaEnergia`.

6. **`confirmando_dados_conta` (linha ~1154)**: trocar `updates.conversation_step = "ask_tipo_documento"` por `"pitch_conexao_club"` e remover o `sendOptions` do tipo de documento dali.

7. **Novo case `pitch_conexao_club`**: monta a economia (12-20%), envia texto, busca slot `conexao_club` no `ai_media_library` (personal → público), envia o vídeo, e seta `step=ask_tipo_documento`.

**Sem mudanças de schema.** O slot `conexao_club` já existe no Flow Builder do Super Admin (print confirma).

**Deploy:** redeploy de `whapi-webhook` (automático).

---

## Fora de escopo

- Não mexe em OCR de RG/CNH, portal-worker, MinIO, OTP.
- Não muda a IA do `ai-sales-agent` (só o flow determinístico).
- Não cria novos slots no Flow Builder — usa o que o consultor já configurou.
