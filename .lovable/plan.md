# Diagnóstico — lead JOSINETE (5511971254913)

**O que aconteceu:** o consultor clicou em **"1. Captura do nome"** (passo 2) no Modo Game. O backend disparou em sequência, sem esperar resposta do lead:
1. Conteúdo do passo 2 — "Captura do nome" (`message`)
2. Conteúdo do passo 3 — "2. Boas-vindas" (`message`)
3. Conteúdo do passo 4 — "JOSINETE, qual o valor médio da sua conta de luz?" (`message`, termina em `?` → aí parou)

Resultado: 3 passos despachados em ~5s, lead bombardeado sem chance de responder. Só sobrou a última mensagem visível na conversa.

**Causa raiz:** `CaptureStepsGrid.tsx` (linha ~98) chama `supabase.functions.invoke('manual-step-send', { … continueFlow: true … })`. Com `continueFlow:true`, o `manual-step-send/index.ts` roda `buildContinuationPatch()` (linha 592) que **encadeia passos `message` seguintes** até bater em capture/pergunta/intent. Isso faz sentido para o bot automático, mas é o oposto do esperado no Modo Game manual — onde o consultor é quem decide quando avançar (ainda mais com a trava de ordem e o toggle Auto/Manual recém-criados).

**Por que escapou:** o passo 2 ("Captura do nome") está cadastrado como `step_type=message` (não `capture_*` nem `inline_capture`), então o chain não para nele. Idem passo 3 (boas-vindas). Só o passo 4 com `?` no fim cortou o chain.

# Plano de correção

## 1. `CaptureStepsGrid.tsx` — desligar chain por padrão
- Mudar a chamada para `continueFlow: false`. Cada clique envia **apenas o conteúdo do tile clicado** (texto + mídias daquele passo, com os delays internos já existentes entre mídia/texto do mesmo passo).
- O cursor `conversation_step` continua sendo reposicionado no passo clicado (o handler já faz isso quando `part==='all'` mesmo sem chain — ver linhas 477-495 do `manual-step-send`).
- Ajustar o toast: remover "→ próximo passo" quando não houver `next_step` na resposta.

## 2. AutoMode permanece exatamente como está
- O toggle 🤖 AUTO já dispara o próximo tile **só quando chega inbound do lead** (Realtime em `conversations`). Isso é o comportamento correto de "aguardar resposta" — não precisa de chain do backend.
- Em MANUAL, consultor clica tile-a-tile. Em AUTO, sistema clica tile-a-tile ao receber resposta. Em nenhum dos dois faz sentido o backend encadear passos sozinho.

## 3. Sem mudanças no backend
- `manual-step-send` continua suportando `continueFlow:true` (usado por outros caminhos, p.ex. `FinalizeButton` antigo / fluxos de teste). Não vamos mexer no helper.
- Nenhuma migração, nenhuma edge function nova.

## 4. Verificação
- Reenviar passo 1 para um lead de teste e confirmar nos logs `conversations` que sai **1 outbound apenas**.
- Confirmar que o tile fica ✓ e o próximo destrava (já depende só de `sentSteps`, não do `next_step` do backend).

# Fora de escopo
- Não tocar no `FinalizeButton` / `finalize-capture` (fluxo de portal worker já implementado).
- Não tocar no bot automático do WhatsApp (`whapi-webhook/bot-flow.ts`) — o chain lá é desejado.
- Não alterar `bot_flow_steps` da Camila/consultores (passos "Boas-vindas" continuam `message` — só não vão mais ser arrastados juntos no envio manual).

# Arquivos
- **Editar**: `src/components/captacao/CaptureStepsGrid.tsx` (1 flag + ajuste de toast)
