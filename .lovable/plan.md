## Por que está demorando

Cada passo do fluxo (whapi-webhook) hoje acumula **4 camadas de atraso** que somam facilmente 5–15 s por passo:

| # | Onde | Valor atual | Efeito |
|---|------|-------------|--------|
| 1 | `whapi-api.ts` `typingTimeFor()` (linha 59) | `1500 + len*35 ms` (1–15 s) enviado ao Whapi como `typing_time` — o **Whapi segura a mensagem** esse tempo antes de entregar | Cada texto demora 2–8 s só por causa do "digitando…" do Whapi |
| 2 | `conversational/index.ts` (linha 1543) `text_delay_ms` | default **1500 ms** antes de cada texto, teto 120 s | +1,5 s por passo, mesmo quando o consultor não configurou nada |
| 3 | `bot-flow.ts` linhas 89, 2289, 2814 + `conversational` linha 570 | gaps fixos de **1500 ms** entre mídias / antes do texto | +1,5–4,5 s em passos com áudio+imagem+texto |
| 4 | `_shared/human-pace.ts` (engine v3) | piso **2000 ms**, 60 ms/char, teto 12 s + presence "composing" sleep igual | Engine v3 espera 2–12 s antes de cada `send_text` |
| 5 | `bot_flows.initial_delay_seconds` (linha 844) | configurável, default geralmente 0 mas alguns fluxos têm 3–10 s | Atrasa o 1º passo do fluxo |

Soma típica num passo "áudio + imagem + texto" = `1500 (typing) + 1500 (text_delay) + 1500 (gap mídia) + 1500 (gap mídia) ≈ 6 s`, sem contar o piso de 2 s do engine v3.

## Solução: modo "instantâneo" como novo padrão

Reduzir as 4 fontes a quase-zero, mantendo só um typing curtíssimo (~600 ms) para o WhatsApp ainda mostrar o "digitando…" e não cheirar a bot puro. Tudo controlado por **uma flag global** `FLOW_INSTANT_MODE=true` (default `true`) — se um dia quiser voltar ao ritmo humano basta desligar, sem mexer em código.

### Mudanças

1. **`supabase/functions/_shared/whapi-api.ts`**
   - `typingTimeFor()` → retorna `1` segundo fixo (mínimo aceito pelo Whapi) quando `FLOW_INSTANT_MODE`. O Whapi não tem `typing_time=0`, então `1 s` é o instantâneo real.

2. **`supabase/functions/_shared/human-pace.ts`**
   - Adicionar caminho rápido: se `FLOW_INSTANT_MODE`, `computeHumanDelayMs()` retorna `0`. Mantém a função pura e testada — só um early-return guardado pelo env.

3. **`supabase/functions/whapi-webhook/handlers/conversational/index.ts`**
   - Linha 1543: default de `text_delay_ms` cai de `1500` → `0` quando `FLOW_INSTANT_MODE` (continua respeitando valor explícito > 0 que o consultor configurou no passo).
   - Linha 476 / 545: `Math.max(0, Math.min(item.delayMs, 12_000))` vira `0` no modo instantâneo (ignora `delay_before_ms` de mídia).
   - Linha 570: retry de mídia falha mantém `1500 ms` (é recuperação de erro de rede, não humanização).

4. **`supabase/functions/whapi-webhook/handlers/bot-flow.ts`**
   - Linhas 89, 2289, 2814: gaps de `1500 ms` entre mídias viram `0` no modo instantâneo.
   - Linha 1267: `delay_before_ms` configurado por mídia também é ignorado.

5. **`supabase/functions/_shared/flow-engine/dispatcher.ts`**
   - Linha 137: `await sleep(Math.min(action.humanDelayMs, 12000))` só dorme se `humanDelayMs > 0` — já é o caso, e como a fórmula passa a devolver `0`, o sleep some.

6. **Nada muda em**: idempotência, ordenação de mídia (text→audio→video→image), captura/OCR, takeover humano, watchdog de fluxo D. Só os `sleep`s.

## Como ativar

- Default novo: `FLOW_INSTANT_MODE=true` (constante no `_shared/env.ts`, sem precisar de secret — fica versionado).
- Se algum dia o consultor reclamar de "tá muito robótico", invertemos a constante para `false` numa única linha e o ritmo humano antigo volta inteiro (todo o código fica preservado atrás do guard).

## Riscos e mitigações

- **WhatsApp anti-spam**: enviar 5 mensagens em <500 ms para o mesmo número pode disparar throttle. Mitigação: manter `typing_time=1s` no Whapi (item 1) — isso por si só serializa as mensagens em ~1 s cada, evitando burst.
- **Mídia + texto fora de ordem**: a ordem `text→audio→video→image` é garantida por `await` sequencial, não pelos `sleep`s. Continua funcionando.
- **Testes**: `human-pace_test.ts` testa a fórmula numérica — manter rodando com `FLOW_INSTANT_MODE` desligado (default no test runner) pra não quebrar as asserções existentes.

## Resultado esperado

Passo "áudio + imagem + texto": **~6 s → ~1 s** (limitado só pelo `typing_time=1` do Whapi e pelo tempo de rede do upload de mídia).
