## Auditoria

### Problema 1 — Duplicação

`CaptureDataConfirmCard.tsx` (linhas ~73-165) e `OcrReviewCard.tsx` (linhas ~117-222) contêm **o mesmo bloco** de ~90 linhas após "Eu confirmo":

1. Lookup do `bot_flow` ativo por `variant`
2. Busca dos `bot_flow_steps`, filtro de `message` entre `capture_conta` e próximo capture
3. Loop despachando via `manual-step-send` com delay 1,8s
4. Fallback de simulação hardcoded (8%–20%)
5. Dispatch do próximo `capture_*`

Qualquer ajuste (ex.: corrigir copy, mudar delay, adicionar `capture_email` na lista de stops) precisa ser feito duas vezes — risco alto de divergência. **OcrReviewCard usa `continueFlow:false` no capture final; CaptureDataConfirmCard usa `continueFlow:true**` — já existe divergência sutil.

### Problema 2 — Copy "8%" conflita com memória

`mem://copy/discount-rate-20` é explícita: **"NUNCA 12%, 15% ou faixa 10-20%"**, sempre "até 20%". O texto atual nos dois cards diz:

> `💚 Economia estimada: *de R$ X (8%) até R$ Y (20%)* todo mês`

A faixa "8%" foi pedida em outra conversa como "piso realista", mas viola a regra oficial e cria inconsistência com LP, FAQ, IA agent e variáveis `{economia_mensal}` do bot (todos usam 0.20 puro).

## Plano

### 1. Criar helper compartilhado

**Novo arquivo:** `src/lib/captacao/postBillConfirm.ts`

Exporta uma função única:

```ts
dispatchPostBillConfirm({
  customer,
  kind: "bill" | "doc",
  continueFlowOnNextCapture?: boolean, // default true
}): Promise<{ dispatchedBetween: number; nextCaptureKey: string }>
```

Responsabilidades (move 100% da lógica atual dos dois cards):

- Resolve `nextCaptureKey` e `currentCaptureType` por `kind`
- Lookup `bot_flows` por `consultant_id + is_active + variant`
- Busca `bot_flow_steps`, slice entre capture atual e próximo stop
- Loop dispatch `manual-step-send` (delay 1,8s, try/catch individual)
- Fallback de simulação (ver passo 2 para copy)
- Dispatch do `nextCaptureKey` com `continueFlow` configurável
- Toda lógica de log usa prefixo `[post-bill-confirm]`

### 2. Alinhar copy à memória "até 20%"

Substituir o bloco da simulação hardcoded por mensagem que respeita `mem://copy/discount-rate-20`:

```
🎉 *Pronto{, Nome}!* Já fiz a *simulação* com base na sua conta.

💡 Conta atual: *R$ {valor}*
💚 Economia: *até R$ {valor*0.20} todo mês*  (até 20%)

✅ Sem obra
✅ Sem instalação
✅ Mesma distribuidora — só muda quem fornece a energia

Bora *finalizar seu cadastro agora*? 🚀
```

- Remove o "de R$ X (8%)"
- Usa `valor * 0.20` (mesma fórmula do `{economia_mensal}` no bot-flow e do `ai-sales-agent`)
- Mantém threshold `valor > 30` e o insert em `conversations` com `conversation_step: "simulacao_consultor"`

### 3. Refatorar os dois cards

`**OcrReviewCard.tsx**` — substituir linhas 117-225 por:

```ts
try {
  await dispatchPostBillConfirm({ customer, kind, continueFlowOnNextCapture: false });
} catch (advErr: any) {
  console.warn("[ocr-review] advance flow failed:", advErr?.message);
}
```

`**CaptureDataConfirmCard.tsx**` — substituir linhas 73-167 por:

```ts
try {
  await dispatchPostBillConfirm({ customer, kind, continueFlowOnNextCapture: true });
} catch (advErr: any) {
  console.warn("[confirm-self] advance flow failed:", advErr?.message);
}
```

### 4. Decisão sobre `continueFlow`

Padronizar para `true` nos dois (atual `OcrReviewCard` está com `false`, o que pode estar segurando o avanço automático após o `capture_documento`). Confirmar com você antes de mudar — se preferir manter divergência, o param fica como está.

### 5. Memória

Atualizar `mem://features/ocr-review-flow`: registrar que a lógica pós-confirmação vive em `src/lib/captacao/postBillConfirm.ts` e que a copy da simulação fallback segue `mem://copy/discount-rate-20`.

## Arquivos tocados

- **Novo:** `src/lib/captacao/postBillConfirm.ts` (~120 linhas)
- **Editado:** `src/components/captacao/OcrReviewCard.tsx` (remove ~108 linhas, adiciona ~5)
- **Editado:** `src/components/captacao/CaptureDataConfirmCard.tsx` (remove ~95 linhas, adiciona ~5)
- **Editado:** `mem/features/ocr-review-flow.md`

## Riscos

- Baixo. Lógica idêntica, só muda lugar. Cobertura de teste manual: confirmar 1 lead em variante A (fallback hardcoded dispara) e 1 lead em variante com `d_resultado` (fluxo despacha `message` step e pula fallback).

## Pergunta antes de implementar

1. Quer que eu **padronize** `continueFlow: true` nos dois cards, ou mantenho `OcrReviewCard` com `false` como hoje?
2. Confirma a copy nova "até R$ X todo mês (até 20%)" ou prefere outra formulação?