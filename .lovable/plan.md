## Diagnóstico direto

O fluxo está bagunçando porque o sistema ainda mistura três comportamentos:

1. **Motor do fluxo configurado no /admin/fluxos**
   - deveria seguir `bot_flow_steps` por `position`, `transitions` e `goto_step_id`.

2. **Motor legado de cadastro**
   - ainda entra em alguns momentos e volta para textos antigos como “me manda a conta de luz”.

3. **IA/classificador/Gemini**
   - ainda roda antes de algumas decisões determinísticas e pode interpretar “quero cadastrar”, “simular”, “dúvida” fora da regra configurada.

O log confirma isso: ao clicar **“📸 Quero simular”** dentro do passo `d_como_funciona`, o webhook entrou no motor conversacional com o step UUID `c87d76f8...`, classificou a entrada e acabou mandando o texto legado de pedir conta. Ou seja: ele não está tratando o botão como transição determinística pura do passo 3 para o passo 2.

Também identifiquei outro ponto crítico: no motor conversacional, quando o passo tem botões, o texto é segurado para ser enviado no final. Por isso, mesmo com ordem configurada `text → audio → image → video`, ele manda mídia antes e só depois manda o texto com botões. A correção anterior mexeu em `bot-flow.ts`, mas esse teste passou pelo arquivo `handlers/conversational/index.ts`, então a ordem continuou errada.

---

## Objetivo da correção

Transformar o Fluxo D em uma execução determinística:

```text
Passo atual
  ↓
Se clicou botão: casar pelo ID do botão ou título configurado
  ↓
Ir exatamente para goto_step_id configurado
  ↓
Enviar exatamente o conteúdo do passo na ordem salva:
text → audio → video → image, ou qualquer ordem definida no admin
  ↓
Parar quando o passo exigir captura/resposta
  ↓
Nunca chamar IA nem texto legado para decidir caminho principal
```

---

## Plano de implementação

### 1. Criar uma regra “strict flow” para fluxo custom ativo

Nos webhooks:

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- `supabase/functions/evolution-webhook/handlers/conversational/index.ts`

Vou fazer com que, quando existir `bot_flow` ativo para o consultor/variante do lead:

- botão clicado é roteado primeiro por `transitions` do passo atual;
- `goto_step_id` vence qualquer IA/classificador;
- `goto_special` só executa se estiver configurado na transição;
- IA só entra quando o próprio passo tiver fallback/ação de dúvida/IA configurado;
- `quer_cadastrar` global não poderá mais mandar para `aguardando_conta` se o passo atual tem uma transição configurada para cadastro/documento.

### 2. Corrigir definitivamente a ordem de mídia no motor conversacional

Hoje o motor conversacional segura texto com botões para o final. Vou ajustar para:

- montar uma sequência única com `text`, `audio`, `video`, `image`, `document`;
- se `text` vier primeiro e o passo tiver botões, enviar esse texto já como mensagem interativa naquela posição;
- continuar enviando as mídias depois, se a ordem configurada mandar;
- se `text` vier no final, enviar botões no final;
- não forçar texto para o fim por causa de botão.

Exemplo esperado para `d_como_funciona` com ordem `text → audio → image → video`:

```text
1. Texto “Vou te explicar...” com os 3 botões
2. Áudio
3. Imagem, se existir
4. Vídeo, se existir
```

Se não existir imagem cadastrada, simplesmente pula imagem e mantém a ordem dos itens existentes.

### 3. Remover fallback legado de “cadastrar = pedir conta” dentro de fluxo custom

No motor conversacional existe este comportamento perigoso:

```text
intent quer_cadastrar → pedir conta de luz
```

Isso não pode valer dentro do Fluxo D, porque depois da simulação o correto é:

```text
Cadastrar agora → d_pedir_documento
```

Vou mudar para:

- se o passo atual tem transição para `cadastrar`, usar a transição;
- se o fluxo tem `capture_documento`, cadastro vai para documento;
- só pedir conta quando a transição configurada apontar para `capture_conta`.

### 4. Unificar a lógica entre Whapi e Evolution

As mesmas correções serão aplicadas nos dois webhooks para não ficar um canal certo e outro errado:

- `whapi-webhook/handlers/conversational/index.ts`
- `evolution-webhook/handlers/conversational/index.ts`
- se necessário, mover helpers comuns para `_shared` para evitar divergência.

### 5. Validar com os dados reais do Rafael/Rodrigo

Vou validar especificamente com o lead e fluxo que aparecem nos logs:

- consultor `0c2711ad-4836-41e6-afba-edd94f698ae3`
- lead `5511971254913`
- variant `D`

Cenários de validação:

1. **Oi → welcome**
   - envia o passo 1 configurado.

2. **Clicar “Como funciona”**
   - vai para `d_como_funciona`.
   - respeita exatamente a ordem de mídia salva.

3. **Clicar “Quero simular” dentro de Como funciona**
   - vai para `d_pedir_conta`.
   - não chama Gemini.
   - não manda texto legado fora do passo configurado.

4. **Enviar conta → confirmar OCR**
   - envia `d_resultado`.
   - não duplica CTA se `d_resultado` já tem botões.

5. **Clicar “Cadastrar agora”**
   - vai para `d_pedir_documento`.
   - nunca volta a pedir conta de luz.

---

## Arquivos que serão alterados

- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- `supabase/functions/evolution-webhook/handlers/conversational/index.ts`
- possivelmente `supabase/functions/_shared/flow-router.ts` ou novo helper compartilhado, apenas se for necessário para evitar duplicação.

Não vou alterar banco, UI ou copy do fluxo. A correção é no motor de execução.