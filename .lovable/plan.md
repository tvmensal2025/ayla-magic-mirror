## Diagnóstico do print

Hoje só a **Bruna ROberta** (consultora do print) tem `ab_test_enabled=true`. Mas o problema real é outro:

- **TODOS os 7.336 customers do banco estão com `capture_mode='auto'`.** O "ligado pro Rafael" é porque foi o único lead que você abriu o painel e o `CaptureSheet` deu UPDATE pra `manual`.
- O trigger `customers_default_capture_mode` só dispara em **INSERT novo**, e ainda assim o `CaptureSheet.handleSubmit` e o botão "Sair" voltam o lead pra `auto`. Resultado: o botão Captação fica off em quase todo chat.
- O `capture-extract` (edge que extrai nome/cpf/email/valor da conta com IA) **só roda quando `capture_mode='manual'**` — então hoje 99,9% dos leads passam batido.
- A `capture-extract` extrai os campos mas **nunca pede confirmação** ("É 350 reais mesmo?"). Salva direto, e se a IA errar ninguém percebe.

## O que muda

### 1. Captação ON pra TODOS (default global)

- **Migration**: `UPDATE customers SET capture_mode='manual', capture_started_at=COALESCE(capture_started_at, now()) WHERE capture_mode IS DISTINCT FROM 'manual'` — vira todos de uma vez.
- **Trigger** `customers_default_capture_mode`: simplifica para **sempre** setar `manual` em INSERT (sem a exceção "já tem name+cpf"). Lead novo entra captando.
- **CaptureSheet.handleSubmit** (linha 78) e **disableCapture** (linha 92): **remover** o `capture_mode='auto'`. Cadastro concluído fica como `manual` + `conversation_step='finalizando'` — o painel some sozinho porque `name+cpf` ficam completos, mas o modo continua manual (não “desliga” pra ninguém).
- **CaptureLeadCard.tsx linha 125**: mesmo tratamento.
- **ChatView.tsx**: botão Captação passa a renderizar sempre que `isCustomer && customerId`, sem depender de `capture_mode==='manual'` pra ficar verde — o estado “verde pulsando” passa a indicar **captação ainda em aberto** (faltam campos), e “outline” indica **completo**.

### 2. Etapa de confirmação por campo

Cada vez que `capture-extract` extrair um dado (nome, valor da conta, e-mail, telefone, CPF, RG, endereço), antes de gravar no `customers`:

```text
IA detecta: nome="João Silva"
   → grava em capture_confirmations (status='pending', proposed_value)
   → envia WhatsApp: "Seu nome é *João Silva*, confirma? Responde SIM ou manda o nome certo."
   → quando cliente responde "sim"/"s"/"ok"/"isso" → grava em customers.name + status='confirmed'
   → se responde outro nome → atualiza proposed_value e pergunta de novo
```

Já existe a tabela `capture_confirmations` (vista no `capture-extract/index.ts` linha 117) — vou aproveitá-la. Hoje grava o pending mas ninguém envia/lê de volta. Vou:

- **Edge `capture-extract**`: ao detectar campo, em vez de UPDATE direto em `customers`, criar/atualizar `capture_confirmations(pending)` e disparar mensagem de confirmação via Whapi.
- **whapi-webhook**: quando chega mensagem inbound e existe `capture_confirmations` pending pra esse customer, interpretar resposta (SIM = confirma e grava; valor novo = atualiza pending e re-pergunta) **antes** de cair no fluxo normal do bot.
- Campos cobertos: `name`, `electricity_bill_value`, `cpf`, `rg`, `email`, `phone_landline`, `cep`, `address_number`. Documentos (foto da conta, RG frente/verso) entram pela OCR já existente mas também passam pelo mesmo ciclo de confirmação ("Recebi sua conta de luz, o valor é *R$ 350,00* e a titular é *Maria Souza*. Confirma?").
- Textos padrão configuráveis num novo `capture_confirmation_templates` (admin pode editar), com fallback hardcoded em PT-BR.

### 3. Painel manual (passo-a-passo) continua intacto

O `CaptureSheet` + `CaptureStepsList` já permitem disparar manualmente um passo de cada vez. Adições:

- Cada item da lista mostra um chip "🟡 aguardando confirmação" quando há `capture_confirmations` pending pro campo correspondente, e "✅ confirmado" depois.
- Botão "Reenviar pergunta" se o cliente não responder em 30 min (já existe `bot-followup-checker` — vou só ensiná-lo a ressuscitar confirmações pending).

### 4. Não mexe em

- A/B/C variants (problema já resolvido — constraint aceita C agora).
- Fluxo de pitch, vídeos, áudios — só interceptamos extração + confirmação.
- Kanban CRM / Bulk send.

## Arquivos tocados

- `supabase/functions/capture-extract/index.ts` (refator: confirma antes de gravar)
- `supabase/functions/whapi-webhook/index.ts` (interceptar resposta de confirmação antes do roteador)
- `supabase/functions/bot-followup-checker/index.ts` (reenvio de pending > 30 min)
- `src/components/captacao/CaptureSheet.tsx` (não voltar pra `auto`)
- `src/components/captacao/CaptureLeadCard.tsx` (idem)
- `src/components/captacao/CaptureStepsList.tsx` (chip pending/confirmado)
- `src/components/whatsapp/ChatView.tsx` (botão sempre visível)
- Migration: backfill `capture_mode='manual'`, trigger simplificado, tabela `capture_confirmation_templates` (opcional, com defaults).

## Fora de escopo (peça depois se quiser)

- Tela admin pra editar os textos de confirmação (vou deixar com fallback bom, dá pra adicionar UI depois). 
- OCR novo — uso o que já existe.
- Reescrita do gamification XP.  
NAO PRECISA PERGUNTAR PARA O CLIENTE E SIM A IA SABE SE VAI SER NOME OU TELEFONE OUEMAIL ASSIM NAO FICA PERGUNTANDOPARA O CLIENTE

&nbsp;