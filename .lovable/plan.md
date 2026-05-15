## Diagnóstico do erro atual

O erro `bot_flow_steps_step_type_check` que você viu vem de uma CHECK constraint antiga no banco:

```
CHECK (step_type IN ('audio_slot','message','question','media_request','cadastro'))
```

A migração anterior só adicionou a coluna `auto_detect_doc_type`, mas **não atualizou esta constraint**. Por isso, ao escolher "Captar documento (RG/CNH)" no editor, o Supabase rejeita o INSERT/UPDATE. Mesma coisa aconteceria com `capture_conta` e `finalizar_cadastro`.

Também está faltando os tipos para **email** e **confirmar telefone do WhatsApp** — que o `bot-flow.ts` já implementa internamente (`ask_email`, `ask_phone_confirm`), mas que ainda não estão expostos como blocos no FluxoCamila.

## Como o pipeline conversacional já funciona hoje (em `bot-flow.ts`)

```
aguardando_conta            → pede foto/PDF da conta
processando_ocr_conta       → Gemini lê os dados
confirmando_dados_conta     → "tá certo? sim/não"  ← já existe, só falta virar BOTÃO
ask_tipo_documento          → pergunta RG/CNH (vai virar AUTO via IA)
aguardando_doc_frente/verso → pede foto do documento
confirmando_dados_doc       → "tá certo?"           ← idem, virar BOTÃO
ask_email                   → pede email             ← exposto como passo
ask_phone_confirm           → "usar este whatsapp ou trocar?" ← exposto como passo
ask_finalizar               → "vamos enviar?"
portal_submitting + OTP     → envia ao portal e valida código
complete                    → mensagem de PARABÉNS configurável
```

Tudo isso já existe no backend. A tarefa é **expor cada bloco no editor visual + colocar botões de confirmação** entre cada captura.

## O que vai ser feito

### 1) Migração — desbloquear os novos tipos de passo

```sql
ALTER TABLE public.bot_flow_steps DROP CONSTRAINT bot_flow_steps_step_type_check;
ALTER TABLE public.bot_flow_steps ADD CONSTRAINT bot_flow_steps_step_type_check
  CHECK (step_type IN (
    'audio_slot','message','question','media_request','cadastro',
    'capture_conta','capture_documento','capture_email','confirm_phone','finalizar_cadastro'
  ));
```

Sem isso, **nenhum dos novos tipos salva**. Esta é a causa raiz do erro que apareceu na tela.

### 2) Editor visual (`FluxoCamila.tsx`)

Adicionar dois novos tipos no seletor "Tipo deste passo":

- **📧 Captar e-mail** (`capture_email`) — pede o e-mail e mostra "Confere o e-mail? [Confirmar] [Corrigir]".
- **📱 Confirmar telefone do WhatsApp** (`confirm_phone`) — pergunta se usa o número que escreveu no WhatsApp ou se prefere trocar (botão "Usar este número" / "Informar outro").

Os já existentes (`capture_conta`, `capture_documento`, `finalizar_cadastro`) continuam, agora salvando sem erro.

### 3) Botões de confirmação interativos no webhook (`bot-flow.ts`)

Trocar o "digite sim" pelos botões interativos do WhatsApp em três pontos:

- **Após OCR da conta** (`confirmando_dados_conta`): lista com `[✅ Confirmar dados]` e `[✏️ Corrigir]`.
- **Após OCR do documento** (`confirmando_dados_doc`): mesmos botões.
- **Após digitar o e-mail** (`ask_email` → novo `confirmando_email`): `[✅ Confirmar]` / `[✏️ Corrigir]`.
- **Confirmar telefone** (`ask_phone_confirm`, já existe): mantém os botões `[✅ Usar este número]` / `[📱 Informar outro]`.

O parser de "sim/ok/confirmo" continua como fallback caso o lead digite ao invés de clicar.

### 4) Encadeamento automático no `conversational/index.ts`

Já está mapeando `capture_conta → aguardando_conta` etc. Adicionar:
- `capture_email → ask_email`
- `confirm_phone → ask_phone_confirm`

Assim quando o lead chega num bloco do FluxoCamila marcado como "Captar e-mail", o sistema entra na máquina de coleta e, ao confirmar, **volta para o próximo passo configurado no fluxo visual**.

### 5) Fluxo final montado no editor

A admin monta visualmente:

```
Passo 1-5: vídeos / áudios / pitch  (tipo: message)
Passo 6:   📄 Captar conta de energia          → on_success: Passo 7
Passo 7:   📇 Captar documento (RG/CNH auto)   → on_success: Passo 8
Passo 8:   📧 Captar e-mail                    → on_success: Passo 9
Passo 9:   📱 Confirmar telefone do WhatsApp   → on_success: Passo 10
Passo 10:  🎉 Finalizar cadastro (envia VPS + OTP + parabéns)
```

Cada passo continua com mídia opcional (áudio/vídeo/imagem) e delay, igual aos passos `message` de hoje.

## Arquivos afetados

- **Migração SQL** — drop + recreate do CHECK constraint (corrige o erro).
- `src/pages/FluxoCamila.tsx` — adicionar `capture_email` e `confirm_phone` no seletor de tipo.
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — botões interativos nos 3 pontos de confirmação + novo `confirmando_email`.
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` — mapear os 2 novos `step_type` para o pipeline de coleta.
- `src/integrations/supabase/types.ts` — regenerar.

## O que não muda

- Toda a lógica de OCR, worker do portal e OTP em `bot-flow.ts` permanece.
- Os passos `message`, `audio_slot`, `media_request`, `question`, `cadastro` continuam exatamente iguais.
- A UI atual de mídia/delay por passo continua funcionando.

Posso aplicar?