## Diagnóstico encontrado

O simulador está chamando `flow-simulate-run` corretamente e o `whapi-webhook` retorna 200, mas o motor não envia resposta porque caiu na regra de silêncio noturno:

- Log real: `quiet_hours_skip` em `conversational`
- Estado ficou `welcome -> welcome`
- `events: []`
- Como o Modo Real usa paridade total, ele respeitou a janela 21:30 -> 08:00 e por isso parece que “não iniciou”.

## Correção planejada

1. **Manter a produção intacta**
   - Não remover a regra de silêncio do bot real em produção.
   - Não criar atalho/mock no Modo Real.

2. **Adicionar override somente para o Simulador Real**
   - Quando `flow-simulate-run` chamar `whapi-webhook` no Modo Real, enviar um header interno indicando que é um teste explícito do painel.
   - Dentro do contexto de teste, permitir que `isQuietHourBRT()` seja ignorado apenas nessa execução do simulador.
   - OCR, IA, Whapi, handoff, delays, Portal Worker, OTP e demais serviços continuam reais.

3. **Aplicar o override nos dois motores**
   - `runBotFlow`
   - `runConversationalFlow`

4. **Melhorar o diagnóstico da UI**
   - Se o motor não avançar por silêncio, mostrar mensagem clara: “bloqueado por horário de silêncio” em vez de erro genérico.
   - Isso evita achar que o fluxo quebrou quando a regra operacional está atuando.

5. **Validar com teste real de função**
   - Testar `flow-simulate-run` com `real_mode=true` e telefone real.
   - Confirmar que a resposta gera eventos/espelhamento e não fica mais `welcome -> welcome` por `quiet_hours_skip`.

## Arquivos que serão alterados

- `supabase/functions/_shared/test-mode.ts`
- `supabase/functions/flow-simulate-run/index.ts`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- Possivelmente `src/components/admin/flow-builder/FlowSimulator.tsx` apenas para diagnóstico visual.

## Resultado esperado

O Modo Real iniciará imediatamente pelo painel mesmo fora do horário comercial, usando serviços reais, sem afetar a regra de silêncio dos leads reais em produção.