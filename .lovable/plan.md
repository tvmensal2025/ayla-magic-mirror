## Diagnóstico

Lead **(11) 91682-7893** (`5511916827893`, `flow_variant=B`, consultor `0c2711ad…`).

Logs da Edge Function `manual-step-send`:
```
[manual-step-send] variant=B: removed 1 audio media(s)
POST /manual-step-send → 400  (nothing_to_send)
```

Causa: a função `manual-step-send` aplica a regra do teste A/B/C (variante B = sem áudio) e remove os áudios da lista de mídias **antes** de montar o `toSend`. Quando o consultor clica em "Enviar" no card de áudio do passo 1, sobra zero item e a função devolve `nothing_to_send` (400) → toast "Erro ao enviar / Edge Function returned a non-2xx status code".

Isso vai acontecer em **todo lead na variante B** sempre que o consultor tentar mandar manualmente um áudio (individual ou via "Enviar tudo" de um passo que só tem áudio configurado).

## Correção

A regra de variante existe para o bot automático. No envio manual o consultor está fazendo override — se ele clicou, manda.

### 1. `supabase/functions/manual-step-send/index.ts`

Remover (ou desativar) o bloco que filtra áudios em variante B na função principal:
```ts
if (variant === "B") {
  medias = medias.filter((m) => String(m.kind).toLowerCase() !== "audio");
  ...
}
```
Trocar por log informativo apenas (sem filtrar), porque agora envio manual ignora a variante.

Mesma mudança em `sendConfiguredStep` (usado quando `continueFlow=true`): também é disparado por ação manual do consultor, então remover o `continue` que pula áudios em variante B.

### 2. Validação

- Reabrir diálogo "Enviar passo do fluxo" no lead 11916827893
- Clicar "Enviar" no áudio do passo 1 (Captura do nome) → deve retornar 200 e a mensagem chega no WhatsApp
- Conferir log: não pode mais ter `nothing_to_send` para esse caso
- Testar com um lead variante A para garantir que nada quebrou
- Conferir `manual-step-send` logs após o teste

### 3. Memory update

Atualizar `mem://features/ab-test-audio-vs-text`: o filtro de variante B agora vale **somente** para os dispatchers automáticos (`whapi-webhook`, `evolution-webhook`). `manual-step-send` ignora a variante porque é override humano.

## Por que não mexer em mais nada

- O whapi-webhook (bot automático) continua respeitando A/B/C — variante B segue sem áudio para os leads que ainda não interagiram com humano.
- Não precisa migração no banco, não precisa nova secret. Mudança isolada em 1 arquivo de edge function.
