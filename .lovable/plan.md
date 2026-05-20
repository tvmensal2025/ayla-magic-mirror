# Auditoria — Fluxo de Captação Manual

Escopo: `CaptureSheet` → `CaptureStepsList` → `CaptureStepPreview` → edge `manual-step-send`.

## Veredito: ~90% — funciona, mas tem 5 ajustes para ficar 100%

---

## ✅ O que está correto

1. **Variant switching no preview** — `changeVariant` troca `confirmStep.row` e o dialog re-renderiza com mídia/texto da nova variante (A/B/C). `onSend` usa `confirmStep.row`, então envia a variante escolhida.
2. **Variante B (sem áudio)** — front substitui áudio por transcrição; edge faz o mesmo via `ensureAudioTranscript`. Consistente.
3. **Substituição de variáveis** — `{{nome}}`, `{{valor}}`, `{{economia_*}}` idênticas no preview e no edge (mesmo formato pt-BR, 2 decimais, 20%).
4. **Capture steps automáticos** — edge gera prompt automático (`message_text → retry_text → fallback por tipo`) com debounce de 20s e mapeia para legacy step (`aguardando_conta`, etc). Bem implementado.
5. **Bot pause clearing** — ao enviar capture step, limpa `bot_paused`, `assigned_human_id`, `custom_step_retries`. Correto.
6. **Minimização/expansão** — sheet permite ver o chat por trás (overlay transparente quando não-expandido); botão minimizar não bloqueia input.
7. **Auth** — verifica JWT + consultantId match OU super_admin via RPC.

---

## ⚠️ Problemas encontrados

### 1. `sentSteps` é por `row.id` (variant-specific), não por `step_key`

**Local:** `CaptureStepsList.tsx:169` (`onSent(row.id)`) + `:218` (`variantKeys.some((v) => sentSteps.has(g.variants[v].id))`).
**Comportamento:** ao enviar variante A, o grupo aparece como enviado. Mas se o consultor trocar para B no preview e enviar de novo, marca outro row.id — o `Check` continua, mas `sentSteps.size` no header passa a contar 2 envios do mesmo passo (badge "Passos 11/10" possível). 
**Fix:** marcar com `g.step_key` em vez de `row.id`, ou deduplicar no contador do header (`new Set([...sentSteps].map(id → step_key))`).

### 2. Numeração instável quando filtro "Pendentes" ativo

**Local:** `CaptureStepsList.tsx:216` — `num = groups.findIndex(...)` usa o array completo, OK. Mas se `onlyPending` esconde itens, a numeração visível pula (1, 3, 5...). É proposital? Se não, basta `filtered.findIndex`.

### 3. Edge não desfaz `capture_mode=manual` quando consultor envia step manual

**Local:** `CaptureSheet.tsx:42` força `capture_mode='manual'` ao abrir. Mas `manual-step-send` com `continueFlow:false` (caso atual) NÃO toca `capture_mode` nem `bot_paused`. Resultado: se o bot estava pausado, continua pausado; se não estava, o bot continua respondendo em paralelo com o consultor. **Recomendado:** pausar bot (`bot_paused=true`, reason="manual_capture") automaticamente ao 1º envio manual da sheet — ou expor toggle no header.

### 4. Botão "Sair do modo" só aparece em modo expandido

**Local:** `CaptureSheet.tsx:228-237` — `disableCapture` está dentro de `{expanded && ...}`. No modo compacto (default) o consultor não consegue sair sem fechar a sheet inteira. **Fix:** mover para o menu de 3 pontos ou mostrar sempre.

### 5. Hit area do botão Send está OK no toque, mas falta feedback de "passo atual"

- Não há indicação visual de qual passo é o "próximo lógico" baseado em `customer.conversation_step`. O consultor precisa lembrar onde parou. **Sugestão:** badge `Atual` no card cujo `step_key` bate com `conversation_step`.

### 6. Variante B sem transcript = áudio simplesmente sumido (silencioso)

**Local:** `manual-step-send/index.ts:120-122` — `console.warn` + pula. O frontend (`CaptureStepPreview:87-95`) também filtra silenciosamente. Consultor não vê erro, mas mídia some. **Fix:** preview mostrar aviso "áudio sem transcrição — não será enviado na variante B".

### 7. Dedup de variantes pega só a `updated_at` mais recente por letra

**Local:** `CaptureStepsList.tsx:79-83`. Se houver 2 fluxos `is_active=true` com `variant='A'`, descarta o mais antigo silenciosamente. Não é bug, mas é uma armadilha em ambientes com múltiplos fluxos ativos. **Fix:** logar warning ou exibir badge.

---

## 🔧 Plano de correções (prioridade)


| #   | Issue                                                          | Arquivo                                                 | Esforço |
| --- | -------------------------------------------------------------- | ------------------------------------------------------- | ------- |
| 1   | Marcar `sentSteps` por `step_key` (dedup do contador)          | `CaptureStepsList.tsx`, `CaptureSheet.tsx`              | 5 min   |
| 2   | Pausar bot ao 1º envio manual                                  | `CaptureSheet.tsx` (opt) ou `manual-step-send/index.ts` | 10 min  |
| 3   | Badge "Atual" no passo correspondente a `conversation_step`    | `CaptureStepsList.tsx`                                  | 5 min   |
| 4   | "Sair do modo" sempre visível (menu compacto)                  | `CaptureSheet.tsx`                                      | 3 min   |
| 5   | Aviso no preview quando variante B remove áudio sem transcript | `CaptureStepPreview.tsx`                                | 5 min   |
| 6   | `findIndex` no `filtered` para numeração estável com filtros   | `CaptureStepsList.tsx`                                  | 2 min   |


Total estimado: ~30 min. Nada bloqueante — o fluxo funciona hoje, mas esses ajustes deixam 100%.

---

## Diagrama do fluxo atual

```text
[CaptureSheet] open
   └─ força capture_mode='manual'
   └─ [CaptureStepsList]
        └─ carrega bot_flows (variants A/B/C) + bot_flow_steps
        └─ agrupa por step_key, ordena por position
        └─ usa defaultVariant (customer.flow_variant)
        └─ click → [CaptureStepPreview]
             └─ render mídias + texto substituído
             └─ chips A/B/C → changeVariant → re-render
             └─ Enviar → manual-step-send
                  ├─ resolve customer + phone + step
                  ├─ medias (variant B: áudio→transcript)
                  ├─ envia via Whapi (audio→image→video→text)
                  ├─ se step capture_*: prompt + maps to legacy step
                  │   + limpa bot_paused, marca last_custom_prompt_at
                  └─ retorna sent[]
        └─ onSent(row.id) → marca como enviado (✓ verde)
```

Quer que eu aplique as 6 correções de uma vez? Sim