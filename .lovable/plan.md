## Diagnóstico da conversa de JOSINETE (5511989000650, customer `cb668312-…`, variant D)

Cronologia real, do mais antigo ao mais novo:

```
15:11:54  OUT d_welcome     → "Sou a *assistente virtual* do  e vou te ajudar..."
                              ⚠ {{representante}} VAZIO (faltando "Rafael")
15:12:04  IN  "Como funciona"
15:12:34  IN  "📸 Quero simular"
15:12:46  OUT (aguardando_conta legado) "Perfeito! Pra eu já garantir seu desconto..."
                              ⚠ Texto LEGADO em vez do d_pedir_conta configurado
                              ("Perfeito! 🙌  📸 Me envia agora uma foto da sua conta de luz…")
15:13:13  IN  [foto da conta]
15:14:53  OUT d_duvidas      → "Claro, JOSINETE! Me conta sua dúvida…"
                              ⚠ Pulou d_resultado E d_pedir_documento
15:15:10  OUT d_finalizar    → "Tudo certo… portal da iGreen"
                              ⚠ Pulou d_pedir_documento; cadastro disparado SEM RG
15:15:36  OUT d_como_funciona (pos 3) — VOLTOU pra trás
15:15:41  OUT d_duvidas       (duplicado em 48s)
15:15:42  OUT d_resultado     (chega tarde, fora de ordem)
15:15:59  OUT d_finalizar     (duplicado em 49s)
```

Resumo: 4 bugs distintos compõem o caos.

### Bug 1 — `{{representante}}` não resolve no `d_welcome` real

No `manual-step-send` (botão "Simular" do /admin) já foi corrigido buscando `consultants.name` e passando como `representante`. Mas o caminho de produção `whapi-webhook/handlers/conversational` monta `vars` em `index.ts:1509` e usa `ctx.nomeRepresentante`. Precisa garantir que esse campo recebe o **primeiro nome** do consultor (hoje sai string vazia em alguns paths, deixando `do ` solto).

### Bug 2 — `d_pedir_conta` envia template legado em vez do passo configurado

Quando o motor transita para `capture_conta`, persiste `conversation_step="aguardando_conta"` (linha 1519 do conversational) e o handler legado `aguardando_conta` ganha controle no próximo turno, mas no MESMO turno do clique "Quero simular" o reply enviado foi `"Perfeito! Pra eu já garantir seu desconto…"` (template `checkin_pos_video/pedir_conta`) — não o `message_text` do `d_pedir_conta` configurado. A trilha legada está sobrescrevendo o passo do consultor.

### Bug 3 — Pós-OCR conta pula `d_resultado` e `d_pedir_documento` (CRÍTICO)

Após receber a foto da conta:
- Esperado: `d_pedir_conta` (capture_conta) → OCR sucesso → `d_resultado` (mostra economia, espera botão "Cadastrar agora") → `d_pedir_documento` (capture_documento) → OCR doc → `d_finalizar`.
- Real: pulou direto pra `d_duvidas` (pos 6) e depois `d_finalizar` (pos 8). Cadastro foi enviado pro portal SEM RG/CNH coletado.

O `d_pedir_conta` tem `transitions: []` e `fallback: retry+then:humano`. Não existe transition "sucesso → d_resultado". O motor está caindo no `next por position` mas pulando passos. Causa provável: lógica de cascade após OCR sucesso em capture_conta não respeita a sequência (vai direto pra próximo capture sem passar pelos message intermediários, OU pula múltiplos passos em uma cascata sem aguardar reply).

### Bug 4 — Duplicação de mensagens em 30-60s

`d_finalizar` saiu às 15:15:10 e de novo 15:15:59. `d_duvidas` às 15:14:53 e de novo 15:15:41. O anti-rep (10min por step_key) deveria bloquear, mas está falhando — possivelmente porque o `conversation_step` salvo é o legado (`finalizando`, `aguardando_conta`) e não o `step_key` do fluxo (`d_finalizar`), então o lookup `eq("conversation_step", st.step_key)` não encontra a outbound anterior.

## Plano de correção

### Fix 1 — `representante` sempre preenchido

Em `whapi-webhook/index.ts`, onde monta `ctx` para o handler conversational, garantir `nomeRepresentante = consultantData?.name?.split(/\s+/)[0] || ""`. Hoje há paths em que esse valor não é setado e cai em `""`.

### Fix 2 — `d_pedir_conta` usa texto do passo

Em `handlers/conversational/index.ts:1757-1759`, o fallback do `cadastroStep === "aguardando_conta"` só dispara o template legado quando `!replyText && !inlineSent`. Mas o `emitStep` do passo `d_pedir_conta` retornou `replyText` (texto configurado). Vou auditar por que o `replyText` é descartado antes desse ponto — provavelmente o handler legado `aguardando_conta` é invocado **antes** do conversational quando o customer já tem esse `conversation_step`. Mover a checagem para priorizar `bot_flow_steps` quando o consultor tem flow ativo.

### Fix 3 — Sequência pós-OCR da conta (CRÍTICO)

Depois do `capture_conta` com sucesso, motor precisa avançar para `d_resultado` (e aguardar resposta), não cascatear para `d_duvidas`/`d_finalizar`. Duas opções:

  a. **Por configuração**: adicionar transition `default → d_resultado` no `d_pedir_conta`. Mínimo invasivo.
  b. **Por código**: no handler que processa OCR sucesso (`_shared/ocr.ts` ou caller), buscar o próximo passo `message` ativo por position e parar lá com `wait_for=reply`, sem cascatear até o próximo capture.

Recomendo **(a) + (b)**: adicionar transitions corretas em todos os passos `capture_*` do Fluxo D (`d_pedir_conta → d_resultado`, `d_pedir_documento → d_finalizar`) E garantir que cascade pós-capture respeita `step_type=message` como ponto de parada que exige resposta.

Também adicionar guard: `finalizar_cadastro` NUNCA pode disparar se `document_front_url` estiver nulo.

### Fix 4 — Anti-rep robusto

Em `emitStep` (linha 1554), o lookup de duplicata precisa considerar **tanto** `step_key` quanto o `conversation_step` legado mapeado (`aguardando_conta`, `finalizando` etc). Adicionar o conjunto:

```
stepIds = { st.id, st.step_key, `flow:${st.id}`, `flow:${st.step_key}`, stepTypeToCadastro(st.step_type) }
```

E checar também por hash do texto normalizado (já tem, mas só roda quando step_key não bate — precisa rodar sempre).

## Validação

1. Resetar o sandbox do simulador e rodar Fluxo D completo:
   - "oi" → welcome com nome **"Rafael"** preenchido ✅
   - Clicar "Quero simular" → texto do `d_pedir_conta` configurado ✅
   - Mandar foto conta → `d_resultado` (não `d_duvidas`) ✅
   - Clicar "Cadastrar agora" → `d_pedir_documento` ✅
   - Mandar foto doc → `d_finalizar` ✅
2. Conferir `conversations` da Josinete depois do próximo reset: zero duplicatas em 60s.
3. Conferir que `d_finalizar` só dispara com `document_front_url` preenchido.

## Escopo

- `supabase/functions/whapi-webhook/index.ts` — Fix 1 (nomeRepresentante).
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts` — Fix 2, 3 (cascade) e 4 (anti-rep).
- Migração de dados para adicionar transitions corretas em `d_pedir_conta` e `d_pedir_documento` (Fix 3a).
- Guard de "documento ausente" antes de `finalizar_cadastro` no handler `finalizando` ou `bot-flow`.

Nenhuma mudança de UI. Mudanças isoladas no motor do bot Whapi.