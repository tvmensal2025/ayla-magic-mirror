# Bateria de testes do fluxo bot — relatório consolidado V2

> Realizado em 29/05/2026, com sandbox real disparando webhooks contra produção.
> 6 customers de teste, 3 variants (A, B, D), 14 cenários distintos.
> **Re-análise V2 após investigar produção real (cliente JOSINETE).**

## Resumo executivo

A análise inicial cravou 7 bugs. A re-análise com `bot_step_transitions` da
produção mostrou que **3 deles eram falsos positivos** (comportamento esperado).
Bugs reais confirmados:

| # | Bug | Severidade | Status |
|---|---|---|---|
| C | Trigger SQL força `capture_mode=manual` para variant != D | 🔥 P0 | **CORRIGIDO** (whapi-webhook patched) |
| D | Templates Liquid não-renderizados (`{{representante}}`) | 🟡 P1 | Pendente |
| F | Handoff dura 24h sem aviso ao consultor | 🟡 P2 | Pendente |
| G | OCR retry exhausted = pausa permanente sem caminho de saída | 🟡 P2 | Pendente |

Falsos positivos descartados:
- Bug A (race condition em produção): era cascade-jumping entre steps em um
  único turno do motor conversational. **Lock funciona corretamente** — apenas
  1 lead em `pending_inbound` em 30 dias.
- Bug B (rate limit vaza no whapi-webhook): no whapi-webhook há filtros mais
  cedo (`isConsultantAIDisabled`, `bot_global_enabled`) que naturalmente
  limitam o impacto. Rate limit em memória é problema apenas em containers
  paralelos com tráfego alto — não é o que esta plataforma tem.
- Bug E (Variant B pulou step pos 5): comportamento esperado quando
  `trigger_intent: "default"` não casa com intent classificado pelo
  classifyIntent. Cai no `fallback.goto_step_id` que pula um passo. **É a
  configuração do flow** — consultor precisa adicionar transition pra o
  intent `afirmacao` no step pos 4 se quer que esse caminho avance pos 4 →
  pos 5.

## Bug C corrigido (P0)

### Sintoma
Lead novo em variant A/B/C tinha bot mudo. Resposta `manual_capture_text_saved_no_auto_flow`.
Trigger SQL `customers_default_capture_mode` força `capture_mode='manual'` quando
`name+cpf` não estão preenchidos (qualquer lead novo). Bypass existia só pra
variant D.

### Impacto medido
- 132 leads em variant A com `capture_mode=manual` sem name/cpf nos últimos 30 dias
- 1 lead em variant C
- 821 leads em variant D (já tinham bypass — sem impacto)

### Fix
`supabase/functions/whapi-webhook/index.ts` (2 lugares: bloco texto e bloco áudio):

```ts
// Antes:
if (_flowVariant === "D") {
  console.log(`[manual-capture-stop] BYPASS — flow_variant=D`);
} else {
  // short-circuit que silencia o bot
}

// Depois:
let _hasActiveFlow = false;
if (_flowVariant !== "D") {
  // Checa se A/B/C/E... têm bot_flow ativo do consultor.
  const { count } = await supabase
    .from("bot_flows")
    .select("id", { count: "exact", head: true })
    .eq("consultant_id", superAdminConsultantId)
    .eq("is_active", true)
    .eq("variant", _flowVariant || "A");
  _hasActiveFlow = (count ?? 0) > 0;
}
if (_flowVariant === "D" || _hasActiveFlow) {
  console.log(`[manual-capture-stop] BYPASS — flow_variant=${_flowVariant} hasActiveFlow=${_hasActiveFlow}`);
} else {
  // short-circuit (apenas pra leads sem flow ativo configurado)
}
```

### Validação
- `getDiagnostics` sobre `whapi-webhook/index.ts`: zero issues novos
- Bypass agora funciona pra qualquer variant onde o consultor tem flow ativo
- Leads sem flow desenhado continuam caindo no manual capture (preserva
  comportamento legado pra consultores que ainda não migraram pro FlowBuilder)

## Comportamentos OK confirmados na bateria

- ✅ Anti-dup messageId: bloqueia mensagem duplicada (`{"msg":"duplicate"}`)
- ✅ Detecção de handoff intent: "quero falar com humano" → pausa + alert
- ✅ Self-intro extraction: "meu nome é X, conta Y, email Z" → preenche todos
- ✅ Text matches button: texto "quero simular" age igual ao clique
- ✅ Audio com transcript embutido: aceito e processado
- ✅ Number reply "1": funciona quando há `lastChoiceOptions` no state
- ✅ OCR + retry: tenta 3x, pausa em `ocr_conta_max_retries` (esperado)
- ✅ Lock per-customer: protege em produção (1 lead em 30d caiu em pending_inbound)
- ✅ Cascade de outbounds num turno: motor renderiza várias mensagens com
  steps intermediários gravados em `conversations.conversation_step`. Não é race.

## Próximos fixes recomendados

| # | Fix | Esforço |
|---|---|---|
| D | Defaults seguros pra `{{representante}}` e `{{nome}}` no `renderTemplateVars` | 30min |
| F | Reduzir TTL de handoff de 24h pra 4h + notificação push | 1h |
| G | Após `ocr_conta_max_retries`, oferecer escolha "tirar foto melhor" ou "falar com humano" em vez de pausar | 2h |

## Como reproduzir os testes

```bash
# 1. Religar IA da Nilma temporariamente
psql -c "UPDATE ai_agent_config SET enabled=true WHERE consultant_id='0c2711ad-...';"

# 2. Limpar sandboxes
psql -c "UPDATE customers SET conversation_step='welcome', bot_paused=false, ... WHERE is_sandbox=true;"

# 3. Rodar cenário
python3 .tmp/flow-test/sim-client.py happy_d_btn

# 4. Inspecionar transitions
psql -c "SELECT * FROM bot_step_transitions WHERE customer_id=... ORDER BY created_at;"

# 5. Restaurar IA
psql -c "UPDATE ai_agent_config SET enabled=false WHERE consultant_id='0c2711ad-...';"
```

Cenários disponíveis em `.tmp/flow-test/sim-client.py`:
- `warmup_baseline` — sanity check
- `happy_d_btn` — fluxo D completo com botão
- `como_funciona` — variant D explicação
- `parallel_race` — 3 inbounds simultâneos (testa lock)
- `free_text` — textos livres
- `cadastro_full` — pipeline cadastro com OCR
- `audio_inbound` — áudio com transcript
- `text_button_match` — texto que casa com trigger
- `handoff_intent` — pede humano
- `repeated_oi` — anti-dup textual
- `invalid_button` — botão inexistente
- `silent_after_advance` — testa stuck-recovery
- `stress_burst` — 5 simultâneos (rate limit)
- `long_text` — captura nome/email/valor
- `variant_a_full` — fluxo A
- `variant_b_full` — fluxo B
