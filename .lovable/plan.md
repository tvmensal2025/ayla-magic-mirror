Plano de correção

1. Corrigir a causa da repetição

- Ajustar o roteador do `whapi-webhook` para não limpar `conversation_step` quando o lead já está em um passo válido do fluxo configurado.
- Hoje ele força `conversation_step = null` em situações onde deveria continuar no step atual; isso explica o welcome repetindo após clicar em botões.

2. Fazer botões seguirem a configuração real

- Garantir que o clique do botão Whapi use o `buttonId` real salvo em `captures._buttons`.
- Ajustar o matching para casar tanto por `buttonId` quanto pelo título/frases configuradas.
- Para Rafael/Whapi, o simulador deve renderizar botões clicáveis; para Evolution, deve aceitar `1`, `2`, `3` como fallback numérico.

3. Respeitar 100% a sequência do fluxo

- No motor conversacional, seguir exatamente:
  - step atual;
  - transição do botão/regra;
  - `goto_step_id` configurado;
  - `fallback.goto_step_id`;
  - ordem de mídia/texto configurada.
- Não inventar resposta, não pular step, não repetir step já emitido no mesmo turno.
- Se o step pede conta de luz, ele precisa parar esperando arquivo/imagem/documento antes de mostrar resultado/cadastro.

4. Corrigir o caso “Cadastrar”

- Quando clicar “Cadastrar agora”/“Cadastrar”, o fluxo deve ir para o passo que pede a conta de luz ou documento conforme configurado.
- Depois do envio da conta, o pipeline real deve processar OCR/valor e só então mostrar a mensagem de resultado/economia e perguntar se deseja cadastrar.
- Se faltar arquivo/valor necessário, o simulador deve pedir o dado correto em vez de avançar artificialmente.

5. Reduzir o tempo de “processando”

- No `flow-simulate-run`, encerrar o polling assim que o turno tiver terminado de verdade:
  - recebeu botões finais;
  - recebeu prompt de captura final;
  - não há novos eventos após janela curta;
  - webhook retornou sem eventos.
- Manter uma janela maior só para casos com mídia pesada, sem travar todos os cliques.

6. Melhorar validação do teste

- Adicionar retorno de diagnóstico no simulador com `run_id`, step anterior, step final e eventos emitidos.
- Usar isso para confirmar que cada clique avançou para o step esperado e não reiniciou no welcome.

Validação

- Testar variante D com Whapi:
  1. Zerar conversa.
  2. Ver welcome com áudio/texto/botões.
  3. Clicar “Quero simular” e confirmar que vai para pedir conta, sem repetir welcome.
  4. Clicar “Como funciona” e confirmar mídia/texto na ordem configurada e botões finais.
  5. Clicar “Cadastrar” e confirmar que pede a conta/documento correto antes de resultado.
  6. Verificar que `conversation_step` final bate com o step configurado.

Arquivos envolvidos

- `supabase/functions/whapi-webhook/index.ts`
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- `supabase/functions/_shared/flow-router.ts`
- `supabase/functions/_shared/ai-button-intent.ts`
- `supabase/functions/flow-simulate-run/index.ts`
- `src/components/admin/flow-builder/FlowSimulator.tsx`  
  
`JA LIGAR O FLUXO NOS PASSOS CERTOS FICANDO 100% CERTO`  
