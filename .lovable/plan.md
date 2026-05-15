# Plano: Levar o bot a 100% antes de colocar no mercado

## Diagnóstico atual (verificado agora no banco)

- Instância WhatsApp do consultor `0c2711ad-4836-...` está em `needs_reconnect` → cliente real não recebe nada.
- 7 customers reais travados em `checkin_pos_video`.
- 5 últimos testes E2E (happy_path, recusa_conta, documento_cnh, lead_some, valor_baixo) terminaram `stuck` no mesmo passo.
- Veredicto do próprio runner: "Não colocar no mercado".

A correção do loop (`isPositiveCheckinIntent`) feita no turno anterior precisa ser **revalidada** — os runs com falha são posteriores ao código, então ou o deploy não pegou, ou a correção não cobre os triggers que o runner usa.

## Etapas

### 1. Garantir que `whapi-webhook` está com a última versão
- Re-deploy explícito de `whapi-webhook` para garantir que `isPositiveCheckinIntent` está em produção.
- Conferir o código deployado puxando logs recentes e procurando o marcador novo.

### 2. Rodar `bot-e2e-runner` para `happy_path` e ler o resultado real
- Disparar o runner.
- Ler `bot_test_runs` mais recente: `visitedSteps`, `lastStep`, `stopReason`.
- Critério de sucesso desta etapa: o teste sai de `checkin_pos_video` e visita ao menos `qualificacao` ou `aguardando_conta`.

### 3. Se ainda travar em `checkin_pos_video`
Investigar **por que** o handler não reconhece o sinal positivo:
- Ler `bot_messages` do customer de teste para ver a frase exata enviada pelo runner.
- Conferir se `trySendConfiguredQa` ainda intercepta antes do `isPositiveCheckinIntent`.
- Conferir ordem das verificações em `bot-flow.ts` (intent positivo → avançar; só depois Q&A/IA).
- Ajustar e redeployar.

### 4. Cobrir os 5 cenários do runner até todos passarem
- `happy_path` → vai até `cadastro_completo` (ou pausa em `aguardando_humano` por motivo legítimo).
- `recusa_conta` → bot reage com fluxo de recuperação, não fica em loop.
- `documento_cnh` → aceita CNH como documento.
- `lead_some` → bot pausa após X tentativas, não fica martelando.
- `valor_baixo` → bot descarta ou pausa com motivo claro, não pede conta de novo.

### 5. Validar com mensagem real (Whapi simulado)
Como a instância está `needs_reconnect`, simulo o webhook diretamente:
- `curl` para `whapi-webhook` com payload de DM (não grupo) usando um número de teste.
- Confirmar que `bot_messages` registra o BOT respondendo.
- Confirmar avanço em `customers.conversation_step`.

### 6. Reportar resultado real para o usuário
Tabela final por cenário com:
- Status (PASS / FAIL).
- `visitedSteps`.
- Motivo de falha, se houver.
- Veredicto: "pode colocar no mercado" ou "ainda não".

### 7. Avisar sobre a instância desconectada
Independente do bot estar correto, **nenhuma mensagem real sai enquanto `igreen-0c2711ad4836` estiver `needs_reconnect`**. O usuário precisa reconectar via QR code antes de receber leads de verdade.

## Arquivos que podem ser tocados
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (ajustes finos na ordem das verificações)
- `supabase/functions/bot-e2e-runner/index.ts` (apenas se o runner estiver com mensagem que não casa com nenhum trigger razoável)

## O que NÃO vai ser feito
- Nenhuma mudança de UI (página BotAudit já foi removida).
- Nenhuma reescrita grande — só corrigir o que os testes reais apontarem.
- Nada de "achismo": cada mudança vai ser seguida de re-run do `bot-e2e-runner` e leitura do resultado no banco.

## Critério de "100%"
Os 5 cenários do `bot-e2e-runner` retornarem `status: passed` (ou `summary.marketReadiness: "Pronto para o mercado"`) **e** uma simulação de DM via webhook gerar resposta do bot em `bot_messages` com `direction='out'`.
