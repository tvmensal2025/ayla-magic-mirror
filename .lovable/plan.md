## Diagnóstico

A Márcia respondeu agora ("Márcia") e o webhook está em `global-off-silent` (IA desligada manualmente), então o bot não tocou — isso é correto.

O sintoma "mensagens fora de ordem" tem **duas causas distintas** que se somam:

### 1. Ordenação no chat do consultor (UI)
`src/hooks/useMessages.ts` faz:
```ts
const mapped = unique.map(mapMessage).sort((a, b) => a.timestamp - b.timestamp);
```
Whapi devolve `/messages/list` em ordem **descendente** (mais nova primeiro). O `Array.prototype.sort` no JS é **estável**: quando dois itens têm o mesmo `messageTimestamp` (precisão de segundo), a ordem original é preservada — ou seja, ficam **invertidos** (a nova aparece antes da antiga). Quando o envio sequencial dispara áudio + texto no mesmo segundo, eles aparecem trocados na tela.

### 2. Ordem real de entrega no WhatsApp da Márcia
Em `supabase/functions/manual-step-send/index.ts` linha 281, o delay entre itens no modo `"all"` é só **1200 ms**. O `sendMedia` de áudio retorna assim que o Whapi aceita o pedido, mas o Whapi ainda baixa/processa o arquivo antes de despachar. Em seguida o `sendText` dispara — e o texto chega no celular **antes** do áudio. Não é só percepção: é entrega real fora de ordem.

## Plano de correção

### A) `src/hooks/useMessages.ts` — sort determinístico
- Antes de ordenar, reverter o array deduplicado (Whapi devolve desc → vira asc).
- Adicionar critério de desempate por id do Whapi (lexicográfico) para casos extremos de mesmo segundo.

```text
const mapped = unique
  .slice()
  .reverse()                       // Whapi desc → asc base
  .map(mapMessage)
  .filter(...)
  .sort((a, b) => (a.timestamp - b.timestamp) || a.id.localeCompare(b.id));
```

### B) `supabase/functions/manual-step-send/index.ts` — delay adaptativo
Substituir o delay fixo de 1200 ms por valores adaptativos:
- após `audio` → 4500 ms (Whapi precisa subir + transcodar voz)
- após `video` → 5000 ms
- após `image` → 2500 ms
- após `text`  → 1500 ms

Assim a próxima mensagem só dispara depois que a anterior teve tempo razoável de ser despachada, garantindo a ordem **no celular do lead**.

### C) Validação
1. Em uma conversa de teste (lead variante A), clicar "Enviar tudo (sequencial)" no passo 1 (áudio + texto).
2. Conferir no celular do lead: áudio chega primeiro, depois texto.
3. Conferir no chat do /admin: ordem cronológica respeitada mesmo recarregando.
4. Reabrir conversa da Márcia (`5511916827893`) e validar que as mensagens já gravadas aparecem na ordem certa.

## Fora do escopo
- Não mexer no `whapi-webhook` (IA continua desligada via `global-off-silent` como o usuário deixou).
- Não alterar regras de A/B/C nem o auto-takeover.