## Diagnóstico (análise das últimas conversas do fluxo de Camila — consultor `0c2711ad`)

Cliente `be540865` ("Rafael"), em 16/05 19:55–19:58:

```
19:55:22  inbound  "OI"                        step=welcome
19:55:?   (nenhum áudio de boas-vindas registrado em conversations)
19:55:52  inbound  "Lucas"                     step=flow:6226...
19:55:59  outbound "Rafael, qual o valor..."   step=flow:3e7fb4...
19:56:09  inbound  "900"
19:58:49  outbound "Deu para entender..."      step=flow:559b8f1b
```

Três bugs reais que explicam tudo que o usuário relatou:

### 1. Ordem de mídias do passo **NÃO** é a configurada na UI
- `StepMediaPanel` salva a ordem em `consultants.flow_step_media_order[stepKey]`.
- O bot (em `conversational/index.ts > sendStepMedia`) lê **primeiro** `bot_flow_steps.media_order` e só usa `flow_step_media_order` como fallback.
- O default semeado em `bot_flow_steps.media_order` é `["text","audio","video","image"]` — então o áudio nunca vem antes do texto, mesmo quando o consultor arrasta "audio" pro topo na UI.
- O `StepMediaPanel` também **não recebe `initialOrder`**, então ao abrir o passo ele sempre mostra `["audio","image","video","text"]` (default da UI), ignorando o que está salvo.

Resultado: o consultor mexe na ordem, mas (a) a UI não reflete o salvo, e (b) o bot ignora.

### 2. `text_delay_ms` aplicado no momento errado
- A UI rotula o campo como "⏱️ Aguardar antes de enviar a *mensagem de texto*".
- No bot, o `goToStep` aplica esse delay **antes de tudo** (antes da mídia), depois dispara `emitStep` que envia mídia e texto sem pausa entre eles.
- Consequência: o lead vê tudo quase junto; o áudio chega imediatamente após a mídia anterior e o texto cola no áudio. O "tempo configurado" não tem o efeito esperado.

### 3. "Regras" (transitions) e captura de nome não atualizam dados existentes
- Em `extractCaptures` o nome só é gravado se `!ctx.customer.name`. Cliente já tinha `name="Rafael"`, então o "Lucas" digitado no passo Boas-Vindas foi descartado e o template seguinte renderizou `{{nome}} = Rafael`.
- Passo "Boas Vindas e Nome" (`6226...`) tem `message_text` vazio e `wait_for=reply`, então quando o lead respondeu "Lucas" o bot não tinha regra/transition pra esse passo e caiu no auto-advance por captura — só que a captura foi suprimida pela razão acima, dando a sensação de "regra não funcionou".

---

## Plano de correção (apenas o que o usuário pediu — sem mudar layout)

### A. Unificar ordem de mídias na fonte certa
1. Em `sendStepMedia` (`supabase/functions/whapi-webhook/handlers/conversational/index.ts`) e no `dispatchStepFromFlow` (`bot-flow.ts`), **inverter a precedência**: ler `consultants.flow_step_media_order[stepKey]` primeiro (UI) e só cair em `bot_flow_steps.media_order` se não houver override.
2. Em `StepMediaPanel.tsx`, carregar `consultants.flow_step_media_order[stepKey]` no `useEffect` inicial e usar como estado inicial do `order` (hoje só lê na hora de gravar — daí mostrar sempre o default).
3. Em `FluxoCamila.tsx`, passar `initialOrder` para `<StepMediaPanel>` lendo do `consultants.flow_step_media_order` (uma vez, no carregamento do passo).
4. Migration de saneamento opcional: zerar `bot_flow_steps.media_order` antigos que estejam com o default `[text,audio,video,image]` para que o override da UI passe a valer.

### B. `text_delay_ms` virar "delay antes do TEXTO" de verdade
1. Em `emitStep`, mover o `await sleep(text_delay_ms)` para **depois** de `sendStepMedia` e **antes** do `sender.sendText` / retorno como reply.
2. Remover o sleep do início de `goToStep` (e do `cascadeDelay` antes de `emitStep`) para evitar dupla espera.
3. Manter `delay_before_ms` por mídia individual já existente (`ai_media_library.delay_before_ms`) — funciona, só não tinha como ser percebido enquanto o delay do passo todo travava antes da mídia.

### C. Captura de nome funcionar mesmo com customer já nomeado
- Em `extractCaptures` (no callsite linha 589 do `conversational/index.ts`), trocar `if (extracted.name && !ctx.customer.name)` por: sempre atualizar quando o passo atual for explicitamente um passo de "perguntar nome" (`step.title`/`step.slot_key` contém "nome", ou tem capture `name` habilitado). Em outros passos, manter a guarda atual para não sobrescrever por engano.

### D. Validação rápida pós-deploy
- Resetar o cliente de teste (`reset-conversation` já existe) e refazer "OI" → conferir nos logs da `whapi-webhook`:
  - mídia áudio enviada **antes** do texto no passo Boas-Vindas;
  - delay configurado em "Como funciona" respeitado entre áudio e vídeo;
  - "Lucas" sobrescreve "Rafael" no passo Boas-Vindas e o passo seguinte renderiza "Lucas, qual o valor...".

### Detalhes técnicos
- Arquivos tocados: `supabase/functions/whapi-webhook/handlers/conversational/index.ts`, `supabase/functions/whapi-webhook/handlers/bot-flow.ts`, `supabase/functions/_shared/step-media-order.ts` (helper já existe — só inverter precedência no caller), `src/components/admin/fluxo/StepMediaPanel.tsx`, `src/pages/FluxoCamila.tsx`.
- Sem mudanças de schema obrigatórias. Migration opcional só pra limpar `bot_flow_steps.media_order` semeado.
- Sem mudanças em layout/UI — só corrigir leitura/gravação da ordem e o ponto do `setTimeout`.

Posso seguir e implementar?
