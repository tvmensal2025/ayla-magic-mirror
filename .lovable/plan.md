## Auditoria do problema

O fluxo não está quebrando por falta de reset do lead. O estado atual mostra que o lead `5511989000650` ficou no primeiro passo real do fluxo (`flow:6226...`), mas a mídia de boas-vindas falhou antes de ser entregue.

### Evidências encontradas

- O webhook recebeu `oi` e reiniciou corretamente no primeiro passo ativo:
  - `unknown step="welcome" → restart at firstActive=6226...`
- A mídia do primeiro passo foi tentada:
  - `sendMedia -> ... (audio)`
- A Whapi retornou erro ao enviar o áudio:
  - `whapi_send_media_failed status=500 Internal Error`
- Como a mídia falhou, o sistema caiu no texto fallback:
  - `Oi! 👋 Qual é o seu nome?`
- O lead ficou no passo correto, sem pular para a pergunta da conta:
  - `conversation_step = flow:6226...`
- Os arquivos no Storage estão acessíveis e públicos:
  - `boas_vindas.webm` retorna `200 audio/webm`
  - vídeos MP4 também retornam `200 video/mp4`

### Causa principal provável

A regressão está no envio de áudio pela Whapi. O helper direto `supabase/functions/_shared/whapi-api.ts` está enviando mídias `kind='audio'` para o endpoint:

```text
/messages/audio
```

Mas o proxy Whapi já existente no projeto usa:

```text
/messages/voice
```

para áudio. Isso indica divergência entre dois caminhos de envio do mesmo projeto. O erro atual acontece exatamente em arquivo `.webm` (`audio/webm`), formato gravado pelo painel.

### Risco adicional encontrado

A correção anterior passou a bloquear o avanço quando a mídia falha. Isso evita pular etapas, mas cria outro problema operacional: se a Whapi falhar em um áudio, o lead fica preso no passo e recebe apenas texto fallback. Como o primeiro passo é `wait_for='reply'`, isso parece para o usuário como “não enviou mídia e não seguiu o fluxo”.

## Plano de correção

1. **Unificar envio de áudio da Whapi**
   - Ajustar `supabase/functions/_shared/whapi-api.ts` para áudio usar `/messages/voice`, igual ao `whapi-proxy`.
   - Para `audio/webm`, enviar o payload simples `{ to, media, caption }`, sem forçar `mime_type: audio/ogg`.
   - Manter timeout de 60s e 3 tentativas.

2. **Tratar falha de áudio sem quebrar todo o fluxo**
   - Manter a regra: não avançar automaticamente quando mídia obrigatória falhar.
   - Mas registrar log mais claro com `step_key`, `slot_key`, `media_id`, `kind`, endpoint usado e URL parcial.
   - Evitar marcar mídia como enviada no dedupe se a Whapi retornou erro, mantendo retry possível.

3. **Auditar os pontos paralelos que ainda enviam mídia**
   - Revisar os envios de mídia por Q&A e regras globais dentro do mesmo handler, porque hoje eles tentam enviar mídia e ignoram erro silenciosamente.
   - Padronizar para não registrar dedupe como enviado quando o envio falha.

4. **Criar teste de regressão da lógica de mídia**
   - Adicionar teste leve para garantir que `audio` no helper Whapi resolve para `/messages/voice`.
   - Testar que falha de mídia retorna bloqueio (`null`) no passo, sem avançar para o próximo.

5. **Deploy e validação**
   - Deploy da Edge Function `whapi-webhook`.
   - Conferir logs após novo “oi”:
     - precisa aparecer envio por `voice`;
     - não pode aparecer `/messages/audio` para `.webm`;
     - se Whapi aceitar, deve registrar `[flow-step:...:audio]` e o lead continuar aguardando nome.

6. **Resetar novamente os dois leads de teste**
   - Após a correção, resetar:
     - `5511971254913`
     - `5511989000650`
   - Limpar conversas, dedupe de mídia, buffers e deixar `conversation_step='welcome'` para teste limpo.

## Resultado esperado

Quando o lead mandar “oi”, o bot deve enviar o áudio de boas-vindas real do slot `boas_vindas` e permanecer no primeiro passo aguardando o nome. Depois, ao informar o nome e valor da conta, o fluxo deve seguir pelos passos configurados e entregar as mídias dos slots `como_funciona` e `fazenda_solar` na ordem definida.