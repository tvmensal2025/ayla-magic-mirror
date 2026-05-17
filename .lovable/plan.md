
# Plano de Execução — Sprint A + B

Tudo verificado no código real. Implementação em sequência, sem reescrever o que funciona.

## SPRINT A — Bugs que param o lead (~1h)

### A1. Step "processando_ocr_conta" cai no default e reseta
**Arquivo:** `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
**Onde:** dentro do `switch (step)`, antes do `default:` (linha ~3103)
**Fix:** adicionar
```ts
case "processando_ocr_conta": {
  reply = "⏳ Ainda estou analisando sua conta, só mais um instante...";
  break;
}
```
Mesma adição no `evolution-webhook` se houver switch espelho.

### A2. Passo final (`finalizar_cadastro`) com `fallback.mode=ai` manda lead pra trás
**Arquivo:** `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
**Onde:** linha 1307 (`if (fb.mode === "ai" && fb.ai_prompt && !strictMode)`)
**Fix:** antes do bloco AI, forçar cadastro se o passo é terminal:
```ts
if (currentStep.step_type === "finalizar_cadastro") {
  return _finalize(stepKey, await resolveTransition({ goto_special: "cadastro" } as DbTransition));
}
```

### A3. `aguardando_otp` salva código mas não dispara worker
**Arquivo:** `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linhas 3035-3045)
**Fix:** após salvar `otp_code`, fazer fetch para a edge function `submit-otp` existente:
```ts
fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/submit-otp`, {
  method: "POST",
  headers: { "Content-Type": "application/json",
             "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
  body: JSON.stringify({ customer_id: customer.id, otp_code: otpCode })
}).catch(e => console.warn("submit-otp dispatch falhou:", e.message));
```
Fire-and-forget — `submit-otp` já cuida do worker e do `validando_otp`.

### A4. Verificar se `OPENAI_API_KEY` chega no runtime
**Arquivo:** `supabase/functions/whapi-webhook/handlers/conversational/intent-classifier.ts` (linha 151)
**Fix:** log único na primeira chamada do classifier:
```ts
const fast = regexClassify(text);
if (fast) return { intent: fast, confidence: 0.95, source: "regex" };
if (!text.trim()) return { intent: "outro", confidence: 0, source: "fallback" };

const hasOpenAI = !!Deno.env.get("OPENAI_API_KEY");
console.log(`[classifier] route step=${currentStep} hasOpenAI=${hasOpenAI} hasGemini=${!!geminiApiKey}`);
```
Após deploy, basta procurar `[classifier] route` nos logs.

---

## SPRINT B — Validação no Flow Builder (~1h)

Hoje o `/admin/fluxos` deixa salvar passo que trava o lead. Vou adicionar lint client-side + uma RPC server-side para auditoria.

### B1. Função SQL de auditoria de passos quebrados
Migration nova: `lint_bot_flow_steps(_flow_id uuid)` que retorna:
- `dead_cascade` — `wait_for=none` + `fallback.mode=repeat` + 0 transições + sem `goto_step_id`
- `empty_reply` — `wait_for=reply` + `message_text` vazio + sem mídia ativa no `slot_key`
- `terminal_with_ai_fallback` — `step_type=finalizar_cadastro` + `fallback.mode=ai`
- `goto_dangling` — `fallback.mode=goto` apontando pra step inativo/inexistente

### B2. Hook React que chama essa RPC e mostra warnings
**Arquivo novo:** `src/hooks/useFlowLint.ts`
Retorna `{ issues: LintIssue[], loading }`. Chamado ao abrir `/admin/fluxos`.

### B3. Banner de avisos + ícone vermelho por passo
**Arquivos:** `src/pages/FluxoCamila.tsx` (ou `FlowBuilder.tsx` — vou identificar qual está ativo)
- Banner no topo: "⚠️ 3 passos com problemas — clique para ver"
- Badge vermelho no card de cada passo problemático
- Tooltip com mensagem específica do lint

### B4. Bloquear "Salvar" quando houver `dead_cascade` ou `empty_reply`
Severidade `high` impede salvar; `medium` (ex: terminal_with_ai) só avisa.

---

## Ordem de execução

1. Sprint A inteiro (4 patches pequenos, mesmo PR mental)
2. Deploy automático das edge functions
3. Validar nos logs: `[classifier] route`, `case processando_ocr_conta`, `submit-otp dispatch`
4. Sprint B — migration + hook + UI

## O que **não** vou mexer agora

- B7 (detour QA limit), B8 (regex assinatura), B10 (anti-loop finalizando), B11/B12/B13 — ficam pro Sprint C/D conforme combinado.
- Lógica de cadastro determinístico (bot-flow.ts) fora dos pontos A1/A3.
- Motor conversacional fora do ponto A2.

Pronto pra implementar. Aprova que eu mando.
