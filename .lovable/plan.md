# Bugs no passo "Como funciona" e no pós-simulação

Análise direto no DB e código do `whapi-webhook`. Identifiquei 2 causas raiz independentes.

## Bug 1 — Ordem TEXT/AUDIO/VIDEO/IMAGE configurada na UI é ignorada

**Causa raiz (mismatch chave de leitura ≠ chave de escrita):**

- A UI `/admin/fluxos` (`StepMediaPanel.tsx` linhas 184–187) grava em `consultants.flow_step_media_order` **usando `step_key`** como chave do JSONB. Ex.: `{ "d_como_funciona": ["text","audio","video","image"] }`.
- A edge `whapi-webhook/handlers/bot-flow.ts` (linha 1212) lê **usando `slot_key`**: `getStepMediaOrder(supabase, consultant_id, slotKey)` — onde `slotKey = "como_funciona"` (sem o `d_`).
- Resultado: a chave `"como_funciona"` nunca existe no JSON, `getStepMediaOrder` retorna `null`, e o dispatcher cai no default `["audio","image","video","text","document"]`. Por isso o áudio vem antes do texto, ignorando a preferência salva.

Mesmo bug em `evolution-webhook/handlers/bot-flow.ts` (espelho).

**Fix:**
1. Em `dispatchStepFromFlow` (whapi + evolution), tentar `getStepMediaOrder(consultant_id, stepKey)` **primeiro**; só cair em `slotKey` como fallback de compatibilidade. Mantém retroatividade com qualquer ordem antiga que tenha sido salva por slot_key, e passa a respeitar o que a UI grava hoje (por step_key).
2. Aplicar o mesmo lookup nos outros 2 pontos que usam `getStepMediaOrder` (linhas ~1528 e ~1677 do whapi e os equivalentes do evolution).

Sem migração de DB — `flow_step_media_order` já é um JSONB livre.

## Bug 2 — Pós-simulação envia mensagem duplicada de CTA

**Logs/código (`bot-flow.ts` ~3580–3653):** após `d_resultado` ser despachado pelo CHAIN amplo, o bloco `if (nextCustom.step_type === "capture_documento")` envia **mais uma** `sendOptions` com o botão `btn_quero_cadastrar`. Como o próprio `d_resultado` já tem botões (`cadastrar`, `dúvida`) configurados nos `_buttons` do step (a UI mostra "3 botões / 3 regras"), o cliente recebe:

```
1) Texto da simulação + botões [📸 Quero simular] [🤔 Tenho dúvida]   ← do d_resultado
2) "Pra continuar seu cadastro..." + botão [✅ Quero me cadastrar]    ← do post-confirm-conta (DUPLICADO)
```

E em caso de re-entrada (lead manda outro texto), o `ask_quero_cadastrar` re-emite o mesmo CTA, agravando a sensação de "repetindo / não evoluiu".

**Fix:**
1. Em `post-confirm-conta`, **detectar se o último step `message` da CHAIN (`d_resultado`) já tem `_buttons` configurados** (consultando `captures` do step). Se já tem CTA próprio:
   - **NÃO enviar** o `sendOptions` adicional com `btn_quero_cadastrar`.
   - Apenas setar `updates.conversation_step = "ask_quero_cadastrar"` para o handler já existente continuar tratando os cliques.
2. Garantir que o handler `ask_quero_cadastrar` (linha ~4758) **também aceite os ids dos botões do próprio `d_resultado`** (`cadastrar`, `quero_simular`, `duvida`, etc.) como gatilhos válidos, em vez de só `btn_quero_cadastrar`. Hoje ele já cobre vários sinônimos — só preciso adicionar os ids reais que o consultor configurou.
3. Espelhar em `evolution-webhook`.

## Arquivos a alterar

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts`

Nenhuma mudança em UI nem migração — a UI continua salvando por `step_key`; a edge passa a respeitar isso.

## Validação

1. No `/admin/fluxos`, no passo "Como funciona", ordenar `text → audio → video → image` e salvar.
2. Mandar "Zerar" no lead 11971254913 e clicar em "Como funciona" no welcome.
3. Esperado: bot manda **texto** primeiro, depois áudio, depois vídeo, depois imagem (na ordem exata configurada).
4. Após confirmar a conta, esperar `d_resultado`: deve chegar **APENAS UMA** mensagem com a simulação + os botões do próprio step (cadastrar / dúvida / falar com Rafael, se o consultor configurar o terceiro). Sem CTA duplicado de "Quero me cadastrar".
5. Clicar em "cadastrar" → bot pede o documento (capture_documento). Clicar em "dúvida" → cai no `d_duvidas` (IA).
