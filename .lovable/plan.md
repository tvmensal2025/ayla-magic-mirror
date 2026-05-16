## Diagnóstico da auditoria

O problema não é “só Whapi” nem “só mídia”. São 5 falhas combinadas:

1. **O fluxo configurado em `/admin/fluxos` está incoerente**
   - O passo 2 captura `electricity_bill_value`, mas não tem transição `informou_valor`/`valor_brl` para o passo 3.
   - O motor tenta compensar com auto-advance, mas isso é frágil e não representa fielmente o que foi configurado.

2. **Há passos `wait_for=none` em cascata que ainda dependem de fallback.goto**
   - Se o passo não tem texto e a mídia falha ou é deduplicada, a conversa pode ficar sem resposta ou salvar o step errado.
   - Isso aparece nos testes: alguns leads ficaram no step 3 e outros foram ao step 5, variando conforme mídia/dedupe.

3. **O dedupe de mídia está sendo usado como “já enviado”, mas na prática marca também “tentado”**
   - Quando a mídia falha, ela fica bloqueada para sempre para aquele customer.
   - Isso evita loop de 500, mas causa efeito colateral: em novo teste com o mesmo lead, o passo pode pular a mídia e parecer que o fluxo não obedeceu.

4. **Áudio `.webm` continua sendo o gargalo real**
   - O código tenta URL, base64, alias OGG e multipart, mas Whapi ainda pode recusar `.webm`.
   - Solução definitiva: converter/uploadar áudio como `.ogg` ou `.mp3` e impedir novos `.webm` no fluxo.

5. **O admin `/admin/fluxos` permite configurar estados inválidos**
   - Hoje ele deixa salvar passo com captura sem transição, passo sem texto/mídia, `wait_for` incorreto e fallback quebrado.
   - O backend tenta adivinhar, mas “perfeição” aqui exige bloquear configuração inválida antes de chegar no webhook.

## Solução definitiva proposta

### 1. Tornar o motor 100% determinístico e fiel ao `/admin/fluxos`
- Quando um passo tem captura, criar/usar intents virtuais explícitos:
  - `informou_nome`
  - `informou_valor`
  - `informou_telefone`
  - `informou_cpf`
  - manter compatibilidade com `nome_proprio`, `valor_brl`, `telefone_br`, `cpf_br`
- Prioridade correta:
  1. Captura válida
  2. Transição configurada no passo
  3. Plano B configurado
  4. Repetir o próprio passo sem inventar texto
- Remover qualquer comportamento que “adivinhe” fora do fluxo, exceto uma compatibilidade controlada para fluxos antigos.

### 2. Corrigir a cascata de passos `wait_for=none`
- Fazer a cascata sempre seguir `fallback.goto_step_id` até encontrar um passo que espera resposta (`reply`/`media`) ou etapa especial de cadastro.
- Enviar todos os conteúdos configurados de cada passo:
  - áudio, imagem e vídeo sempre que existirem;
  - texto também quando existir;
  - sem suprimir mídia por existir texto.
- Salvar `conversation_step` no último passo real da cascata, não no intermediário.

### 3. Separar “mídia tentada” de “mídia entregue”
- Ajustar o controle de mídia para registrar status:
  - `attempted`
  - `sent`
  - `failed`
- Não repetir falhas infinitamente no mesmo turno.
- Permitir reset/retentativa limpa quando o lead for zerado.
- A conversa não deve travar se uma mídia falhar: ela deve seguir o fluxo configurado e registrar a falha.

### 4. Blindar áudio `.webm`
- Ajustar envio Whapi para detectar mime/extensão real.
- Preferir enviar áudio convertido/compatível (`audio/ogg` ou `audio/mpeg`) quando disponível.
- No admin, alertar ou bloquear upload `.webm` para passos do fluxo, orientando `.ogg`/`.mp3`.
- Opcionalmente criar rotina de conversão dos áudios atuais para `.ogg` e atualizar `ai_media_library`.

### 5. Adicionar auditoria visual no `/admin/fluxos`
- Mostrar problemas por passo antes do consultor testar:
  - captura sem transição correspondente;
  - `wait_for=none` sem Plano B para próximo passo;
  - passo sem texto e sem mídia ativa;
  - mídia `.webm` em áudio;
  - fallback apontando para passo inativo/inexistente;
  - passo de cadastro fora da ordem esperada.
- Exibir um status claro: “Fluxo pronto para teste” ou “Corrigir X problemas”.

### 6. Corrigir o fluxo atual do Rafael no banco
- Para o fluxo `66a19db4-b061-4f3f-921f-c13e9fb6f730`:
  - passo 1: captura nome deve ir para passo 2;
  - passo 2: captura valor deve ir para passo 3;
  - passo 3: deve cascatear para passo 4;
  - passo 4: deve cascatear para passo 5;
  - passo 5 deve esperar resposta correta (`reply`, não `media`) se a pergunta é “vamos fazer cadastro?”;
  - resposta afirmativa do passo 5 deve ir para `capture_conta` ou `capture_documento`, conforme sua estratégia.
- Remover/ignorar passos vazios finais que não têm conteúdo nem função.

### 7. Criar teste automatizado do fluxo real
- Simular:
  - “oi”
  - nome
  - “900”
  - confirmação após explicação
- Validar que:
  - o step avança na ordem correta;
  - mídia configurada é tentada/enviada;
  - texto configurado é enviado;
  - não há texto inventado fora do `/admin/fluxos`;
  - não há travamento silencioso.

## Arquivos/áreas a alterar

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
  - motor de transição, cascata, captura, envio e logs.

- `supabase/functions/_shared/whapi-api.ts`
  - robustez no envio de áudio e detecção de formato.

- `src/pages/FluxoCamila.tsx`
  - auditoria visual, validações e bloqueios de configuração ruim.

- `src/components/admin/fluxo/StepMediaPanel.tsx`
  - bloqueio/alerta para `.webm` e indicação de mídia compatível.

- Migração Supabase
  - se necessário, ajustar status de logs de mídia e corrigir o fluxo atual do consultor Rafael.

## Resultado esperado

Depois da implementação, o bot deve:

- seguir exatamente o que está em `/admin/fluxos`;
- enviar sempre áudio/vídeo/imagem quando configurados;
- enviar texto quando configurado;
- não inventar mensagem fora do fluxo;
- não travar em silêncio quando mídia falhar;
- mostrar no admin quando o fluxo estiver mal configurado;
- permitir testar com previsibilidade antes de usar com leads reais.