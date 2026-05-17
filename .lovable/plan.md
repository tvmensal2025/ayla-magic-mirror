## Problema observado

Screenshot do teste:
1. Bot: "Informe seu e-mail" → user respondeu
2. Bot: "Qual o seu CEP?" → user respondeu **"Oi me chamo Luciano"** (não era CEP)
3. Bot: "Qual seu nome para eu adicionar aqui?" → user: "Luciano"

O sistema **ignorou** "me chamo Luciano" e ainda perguntou o nome no passo seguinte. O `resolveLandingStep` que adicionamos antes deveria pular o passo de nome — mas não pulou porque o nome nunca foi salvo.

## Causa raiz

`extractCaptures` (linha 217 de `supabase/functions/whapi-webhook/handlers/conversational/index.ts`) só tenta extrair nome quando o **step atual** tem `capture.field === "name"` habilitada:

```ts
if (enabled.has("name")) {
  const n = extractNome(messageText);
  ...
}
```

No step de CEP, `name` não está habilitado → `extractNome` nunca roda → nome não é salvo → no próximo passo (que pergunta nome), `resolveLandingStep` vê `customer.name = null` e mantém o passo. Bot repete a pergunta.

Mesmo se rodasse a extração, faltaria gravar `name_source = "self_introduced"` para o `TRUSTED_NAME_SKIP` ativar — hoje a linha 755 só seta `captureUpdates.name`, sem `name_source`.

## Solução (cirúrgica, só no conversational engine)

Arquivo: `supabase/functions/whapi-webhook/handlers/conversational/index.ts`

### 1. Sempre tentar extrair nome em texto livre (~linha 233)

Remover o gate `enabled.has("name")` só para nome. Os outros campos (valor/cpf/telefone) continuam dependendo de configuração do step. A guarda real (lock por OCR/user_confirmed, etc.) já está feita lá em baixo (linha 747).

```ts
// Nome: sempre tenta — guard real fica no consumer (linha 754).
const n = extractNome(messageText);
if (n) out.name = n;
```

### 2. Gravar `name_source = "self_introduced"` junto com `name` (~linha 754-756)

```ts
if (extracted.name && !nameLocked && (stepIsAskName || !ctx.customer.name)) {
  captureUpdates.name = extracted.name;
  captureUpdates.name_source = "self_introduced";
}
```

### 3. Re-resolver landing step após captura (~depois da linha 760)

Se o cliente acabou de preencher o campo que o próximo step pediria, pular agora:

```ts
if (captureUpdates.name) {
  (ctx.customer as any).name = captureUpdates.name;
  (ctx.customer as any).name_source = captureUpdates.name_source;
  const advanced = resolveLandingStep(currentStep);
  if (advanced && advanced.id !== currentStep.id) {
    currentStep = advanced;
    stepKey = currentStep.id;
    console.log(`[skip-step] post-capture: jumped to ${currentStep.step_key}`);
  }
}
```

(idem para `electricity_bill_value`/`cpf`/`phone_whatsapp` se quiser — mas o bug reportado é só nome; mantenho o escopo no nome).

### 4. Deploy

Apenas `whapi-webhook`. Testar com o mesmo lead após reset.

## O que NÃO muda

- Fluxo `/admin/fluxos` do consultor
- `safeAssignName`, lock de OCR/user_confirmed (continua ativo)
- `bot-flow.ts` (fluxo Camila legado)
- Schemas, RLS, edge functions

## Critério de sucesso

Lead manda "Oi me chamo X" em qualquer step do fluxo customizado → nome é gravado com `self_introduced` → no próximo step que pediria nome, `resolveLandingStep` pula automaticamente para o passo seguinte. Log esperado: `[skip-step] post-capture: jumped to <step>`.
