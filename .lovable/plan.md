## Diagnóstico

O simulador já está chamando o `whapi-webhook` real e recebendo resposta 200, mas ele fica lento por dois motivos principais:

1. **Modo Real espera duração inteira de áudio/vídeo** em `bot-flow.ts`.
  - Exemplo atual: áudio sem duração cadastrada espera até 90s; vídeo até 30s.
  - Isso é fiel ao ritmo humano do bot, mas ruim para teste interativo e pode parecer travado.
2. `**flow-simulate-run` só retorna depois que o webhook termina + polling de saída**.
  - Se o passo envia mídia em sequência, OCR, Gemini ou Portal Worker, a tela fica “processando” durante toda a execução.

## Plano de correção

### 1. Manter serviços reais, mas acelerar só o relógio do simulador

Adicionar um flag interno de teste, por exemplo `x-bot-fast-clock: 1`, enviado apenas pelo `flow-simulate-run`.

Com isso:

- OCR continua real.
- Gemini continua real.
- Portal Worker/OTP/link facial continuam reais.
- Whapi continua real no número informado.
- Só as pausas artificiais de cadência entre mensagens/mídias ficam curtas.

### 2. Corrigir `sleepForMedia` do fluxo principal

Em `supabase/functions/whapi-webhook/handlers/bot-flow.ts`, alterar a espera quando estiver no simulador real com fast clock:

- áudio/vídeo: aguardar ~800ms a 1500ms, não a duração inteira;
- imagem/texto: manter pausa curta;
- produção real fora do simulador continua igual.

Isso espelha o que já foi feito no handler conversacional, mas limitado ao simulador.

### 3. Propagar o flag no contexto de teste

Em `supabase/functions/_shared/test-mode.ts`:

- adicionar `fastClock?: boolean` no `TestStore`;
- criar helper `shouldUseFastClock()`.

Em `supabase/functions/whapi-webhook/index.ts`:

- ler o header interno `x-bot-fast-clock`;
- salvar no `botRequestStore` somente quando `testMode === true`.

Em `supabase/functions/flow-simulate-run/index.ts`:

- enviar `x-bot-fast-clock: 1` junto com `x-bot-real-services: 1`.

### 4. Reduzir espera morta do polling do simulador

Ajustar a janela em `flow-simulate-run`:

- quando já houver evento de saída, encerrar mais rápido após estabilizar;
- manter uma janela segura para cold start/primeira resposta;
- retornar diagnóstico claro quando não houver evento, em vez de parecer travado.

### 5. Validar no fluxo real

Depois de implementar:

- testar `flow-simulate-run` no modo real com a mensagem `oi`;
- testar clique em `Quero simular`;
- conferir que responde em poucos segundos e que o estado do customer avança corretamente;
- revisar logs do `whapi-webhook` para confirmar que o fast clock só ativou em test mode.  


## Resultado esperado

O teste continua 100% real nos serviços e decisões, mas deixa de esperar 30–90s por cadência artificial de mídia. Cada mensagem deve voltar em poucos segundos, exceto etapas naturalmente pesadas como OCR/Portal/OTP, que ainda dependem dos serviços reais.