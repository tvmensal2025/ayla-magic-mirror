## Entendimento corrigido

A IA não está "desligada" — está em **modo manual/captação assistida**. O consultor (Rafael) está mapeando passo a passo e decidindo quando avançar via "Devolver para o passo". O `ai_agent_config.enabled = false` significa apenas: "não responda conversa automaticamente para o lead".

Isso NÃO deve impedir o pipeline operacional de captura: foto/PDF da conta tem que ser **baixada, salva, OCR rodado, dados preenchidos no card do consultor**, exatamente como no fluxo oficial da Camila. A confirmação dos dados pode ser enviada pelo consultor com 1 clique (`Pedir ao cliente` no `CaptureDataConfirmCard`), sem a IA tomar a iniciativa.

## Causa raiz

Em `supabase/functions/whapi-webhook/index.ts` (~linha 476), o gate `globalAiDisabled` faz `return` cedo, salvando só `[arquivo]` em `conversations` e nunca chama `runBotFlow`. Resultado:
- `electricity_bill_photo_url` fica vazio
- `bill_message_id` não é salvo
- OCR não roda → `bill_holder_name`, `ocr_confianca`, endereço, valor: nada preenchido
- `CaptureDataConfirmCard` não aparece para o consultor porque não tem dados de OCR
- Consultor precisa "adivinhar" e digitar tudo manual → exatamente o que o usuário reclamou

Confirmado nos dados reais do lead Lucas (`5511971254913`, customer `21265632-...`): `electricity_bill_photo_url=null`, `bill_message_id=null`, `ocr_done=false`, mas conversation log tem `[arquivo]` recebido.

## O que vai mudar

### 1. Gate `globalAiDisabled` vira "silêncio conversacional", não "silêncio total"

No `whapi-webhook/index.ts`, quando `globalAiDisabled === true`:
- Se a mensagem é **arquivo** (`isFile=true`, foto ou PDF) → **não retorna**. Continua o fluxo até o pipeline de captura/OCR rodar e salvar tudo.
- Se a mensagem é **texto/áudio** comum → mantém o comportamento atual (salva inbound, não responde).

### 2. Rota dedicada de captura silenciosa para arquivos

Quando `globalAiDisabled=true` e chegou arquivo, o webhook vai:
1. Baixar a mídia (já existe lógica).
2. Forçar `step = aguardando_conta` se ainda falta a conta (regra `bill-redirect` já existente).
3. Chamar `runBotFlow` apenas para executar o handler de `aguardando_conta`, **mas suprimindo a `reply` outbound** (não manda mensagem "✅ Conta recebida! Analisando..." nem botões automáticos SIM/NÃO/EDITAR).
4. Persistir todos os `updates` (URL da mídia, dados OCR, `conversation_step = confirmando_dados_conta`).
5. Notificar o consultor via `notifyHandoff` (ou flag visual no CRM) que tem captura pronta para revisar.

Assim o consultor abre o card do lead e vê:
- Foto/PDF anexado
- `CaptureDataConfirmCard` preenchido com nome do titular, endereço, distribuidora, valor
- Botões "Eu confirmo" e "Pedir ao cliente"

### 3. Manter `capture_mode = manual` 100% sob controle do consultor

- Nenhuma resposta automática é enviada quando IA está desligada — nem "✅ Conta recebida", nem botões SIM/NÃO, nem prompt de documento.
- O `manual-step-send` (botão "Devolver para o passo") continua sendo o único caminho de outbound.
- Quando o consultor clicar "Pedir ao cliente" no card, a mensagem de confirmação sai (igual hoje).

### 4. Mesma regra para documento (RG/CNH)

Aplica o mesmo padrão para `aguardando_doc_*`: OCR roda, dados preenchidos no card, sem outbound automático.

### 5. Validação no caso real

- Reenvio simulado do payload de PDF do Lucas → confirmar que `electricity_bill_photo_url`, `bill_holder_name`, `ocr_confianca` ficam preenchidos.
- Verificar no `/admin` se o `CaptureDataConfirmCard` aparece para o consultor.
- Confirmar que NENHUMA mensagem automática foi enviada ao lead.
- Verificar log: deve aparecer algo como `[silent-capture] OCR rodado, sem outbound (manual mode)`.

## Arquivos

- `supabase/functions/whapi-webhook/index.ts` — mudar gate `globalAiDisabled` para permitir arquivos seguirem o pipeline, e suprimir a `reply` outbound quando IA está manual.
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — adicionar flag/contexto `suppressReply` que faz o handler de `aguardando_conta` (e `aguardando_doc_*`) executar OCR + updates mas NÃO chamar `sendText`/`sendOptions`.

## Fora de escopo

- Não mexer em `bot_paused` / `assigned_human_id` / handoff humano: continua silenciando tudo.
- Não mexer no UI do `CaptureDataConfirmCard` (já funciona, só precisa receber dados).
- Não adicionar resposta automática de confirmação — confirmação só sai quando consultor clicar "Pedir ao cliente".

## Resultado esperado

Cliente manda foto/PDF da conta → sistema baixa, salva, roda OCR, preenche todos os campos no card do consultor, **fica em silêncio no WhatsApp**. Consultor revisa, edita se quiser, clica "Pedir ao cliente" ou "Eu confirmo" — exatamente o fluxo manual da Camila que ele está modelando.