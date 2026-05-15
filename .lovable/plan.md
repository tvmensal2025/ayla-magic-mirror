## Objetivo

Permitir que a admin monte, dentro do **FluxoCamila**, blocos para:
1. **Captar a conta de luz** (OCR + botão de confirmar dados) — já salva a conta no portal-staging sem pedir documento.
2. **Captar o documento** (RG/CNH) — IA detecta automaticamente o tipo via OCR, sem perguntar.
3. **Finalizar** — envia ao portal VPS, trata OTP, dá os parabéns.

Tudo isso **reaproveitando** o pipeline `bot-flow.ts` que já existe (`aguardando_conta → processando_ocr_conta → confirmando_dados_conta → ask_tipo_documento → aguardando_doc_frente/verso → confirmando_dados_doc → ask_finalizar → portal_submitting → aguardando_otp → complete`). Nada do fluxo conversacional atual é perdido.

## Diagnóstico do que já existe

- `bot-flow.ts` já implementa toda a máquina de cadastro com OCR (Gemini), validação de dados, envio ao worker do portal e OTP.
- `conversational/index.ts` já reconhece o set `CADASTRO_STEPS` e **não interfere** quando o `conversation_step` está nesse pipeline — só o dispara via `goto_special: "cadastro"`.
- O FluxoCamila hoje tem `step_type` apenas como `message`. A transição para cadastro existe via `→ Cadastro (OCR + portal)` no select de transições.
- O RG/CNH hoje **é perguntado** num passo `ask_tipo_documento`. A IA já tem `document-type.ts` para normalizar, mas o tipo vem do texto do lead, não da imagem.

## O que vai mudar

### 1) Novos `step_type` no FluxoCamila (UI + DB)

Adicionar três tipos novos de passo selecionáveis no editor, cada um amarrando o lead a um trecho do pipeline existente:

- `capture_conta` — pede a conta, faz OCR, mostra dados extraídos com **um botão "Confirmar"** (lista interativa do WhatsApp). Ao confirmar, salva os dados em `customers` e **decide** o próximo passo conforme a transição configurada (pode ir direto para um próximo passo de fluxo OU encadear o `capture_documento`).
- `capture_documento` — pede a foto do documento. **A IA classifica automaticamente** (CNH x RG novo x RG antigo) a partir da imagem, salva em `customer.document_type` e segue: pede verso só se não for CNH. Sem perguntar tipo ao lead.
- `finalizar_cadastro` — dispara `portal_submitting`, trata OTP, e ao concluir envia a mensagem de parabéns configurável no próprio passo (campo `message_text` do passo já existe).

Cada passo expõe no painel:
- Texto inicial (mídia + delay já existem).
- Lista de campos obrigatórios mínimos antes de avançar (ex.: `nome`, `cpf`, `endereço`).
- Transição `on_success` (vai para qual passo) e `on_fail` (humano / repetir).

### 2) Detecção automática de RG x CNH

No `bot-flow.ts`, no passo equivalente a `aguardando_doc_frente` quando vier de `capture_documento`:

- Chamar a função Gemini que já é usada para OCR da conta, com um prompt curto:
  > "Esta imagem é uma CNH, RG novo (modelo policarbonato) ou RG antigo (papel)? Responda apenas: cnh | rg_novo | rg_antigo."
- Salvar em `customer.document_type` via `normalizeDocumentType()`.
- Se `cnh` → pular `aguardando_doc_verso`, ir direto a `confirmando_dados_doc`.
- Se RG → pedir verso normalmente.
- Fallback (se IA falhar): cair no `ask_tipo_documento` legado para perguntar ao lead.

### 3) Confirmação por botão na captura da conta

Hoje o `confirmando_dados_conta` espera o lead digitar "sim". Vamos:

- Trocar a mensagem de confirmação por uma **interactive list** do WhatsApp (Evolution API já suporta) com botões `Confirmar dados` e `Corrigir`.
- Manter o parser de "sim/ok/confirmo" como fallback caso o cliente digite ao invés de clicar.
- Ao clicar `Confirmar`: gravar tudo em `customers` e seguir a transição configurada no passo `capture_conta` da UI.

### 4) Mensagem final de parabéns configurável

O passo `finalizar_cadastro` no FluxoCamila terá:
- Campo `message_text` (já existe) — usado como mensagem de parabéns enviada após `complete`.
- Campo `media` (já existe) — opcional, áudio/vídeo de parabéns.
- O `bot-flow.ts` ao chegar em `complete` consulta o passo correspondente do fluxo do consultor e envia esses conteúdos no lugar da mensagem fixa atual.

## Migração de banco

```sql
-- Permite os novos tipos no editor
ALTER TABLE bot_flow_steps
  ADD COLUMN IF NOT EXISTS required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS on_success_step_id uuid,
  ADD COLUMN IF NOT EXISTS on_fail_step_id uuid;

-- step_type passa a aceitar: 'message' | 'capture_conta' | 'capture_documento' | 'finalizar_cadastro'
-- (não é enum — é text. Só documentação.)
```

Sem destruir nada do que existe. Os passos atuais continuam como `message`.

## Arquivos afetados

- `src/pages/FluxoCamila.tsx` — novo seletor de `step_type`, painéis específicos por tipo.
- `src/components/admin/fluxo/StepMediaPanel.tsx` — habilitar mídia para os novos tipos (já funciona).
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`:
  - Inserir detecção automática de RG/CNH via Gemini no `aguardando_doc_frente`.
  - Trocar texto fixo do `confirmando_dados_conta` por mensagem interactive com botões.
  - No `complete`, consultar `bot_flow_steps` do tipo `finalizar_cadastro` do consultor e enviar mídia + texto configurados.
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` — adicionar `goto_special: "capture_conta" | "capture_documento" | "finalizar"` que mapeiam direto pra `aguardando_conta`, `ask_tipo_documento` (ou novo `aguardando_doc_frente_auto`) e `ask_finalizar`.
- Migração SQL acima.

## Fluxo final (lead-side)

```
[Passo N: vídeo explicação] 
   ↓ (intent: quer cadastrar)
[capture_conta] → "manda a foto da conta"
   ↓ OCR + extrai (nome, cpf, endereço, valor, instalação)
   → "Confere se está certo? [Confirmar] [Corrigir]"
   ↓ Confirmar
[capture_documento] → "manda a foto do RG ou CNH"
   ↓ IA detecta tipo da imagem
   ↓ se RG → pede verso
   → "Confere os dados do documento? [Confirmar]"
   ↓
[finalizar_cadastro] → envia ao portal VPS
   ↓ aguarda OTP do lead
   ↓ valida OTP
   → mensagem + áudio/vídeo de PARABÉNS configuráveis
   → conversation_step = complete
```

## O que não muda

- Toda a lógica de OCR, worker do portal, OTP, validações em `bot-flow.ts` permanece — só ganha pontos de entrada via fluxo dinâmico e detecção automática de tipo.
- Os passos `message` existentes seguem funcionando do mesmo jeito.
- A UI atual de mídias por passo, delays e capturas continua igual.