Plano para deixar o fluxo 100% real e fiel ao configurado

1. Corrigir a causa do clique “Como funciona” sem resposta
- O fluxo A está iniciando no passo “Captura do nome”, que tem botões, mas também tem `capture name` sem texto próprio.
- Quando o cliente digita/clica algo como “Como funciona”, o motor captura isso como nome antes de processar o botão/transição, depois avança para “Boas-vindas” sem responder o botão.
- Vou mudar a prioridade do motor: se houver `buttonId` real ou texto que bate com botão configurado, ele processa a transição do botão antes de capturar nome/texto livre.

2. Corrigir botões por ID e por título
- Garantir que Whapi use exatamente o ID do botão (`como`, `simular`, `cadastrar`, etc.).
- Melhorar o matching para aceitar também título e frase do botão quando o WhatsApp manda apenas texto.
- Corrigir o fallback numérico do simulador para buscar os botões do passo atual, não cair em botão vazio ou errado.

3. Impedir repetição e “processando muito”
- Ajustar o polling do simulador para encerrar quando o webhook já terminou mesmo sem outbound, mostrando diagnóstico claro em vez de ficar esperando.
- Corrigir anti-repetição para não bloquear resposta legítima do próximo passo, mas continuar impedindo reenvio do mesmo welcome/mesma mídia.
- Exibir no simulador o `run_id` e o diagnóstico do turno para validar cada clique.

4. Fluxo “Como funciona” fiel ao configurado
- Clique “Como funciona” deve enviar o passo configurado de explicação com mídia/texto na ordem definida.
- Depois deve parar no convite correto com os botões configurados, sem pular nem repetir.
- Se o usuário responder “quero simular” ou clicar no botão, deve ir para pedir conta de luz.

5. Fluxo “Quero simular / Cadastrar” fiel ao processo real
- “Quero simular” deve pedir a conta de luz e aguardar foto/PDF, sem inventar resultado antes do arquivo.
- Ao receber conta, deve chamar o pipeline real de OCR do `bot-flow.ts`.
- Após OCR, deve mostrar valor/economia e botões “Cadastrar agora / Dúvidas / Humano”.
- “Cadastrar agora” deve pedir documento com foto e seguir o cadastro real até finalização/portal, respeitando dados faltantes.

6. Validar com teste real do motor
- Criar/ajustar teste de regressão para simular: zerar, nome, como funciona, quero simular, anexar conta, resultado, cadastrar, anexar documento.
- Validar que cada etapa muda para o step esperado, emite os botões esperados e não repete welcome.
- Implantar as edge functions alteradas e conferir logs do `whapi-webhook` e do `flow-simulate-run`.

Arquivos previstos
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- `supabase/functions/_shared/flow-router.ts`
- `supabase/functions/flow-simulate-run/index.ts`
- `src/components/admin/flow-builder/FlowSimulator.tsx`
- Possível teste Deno dentro de `supabase/functions/whapi-webhook/` ou ajuste de teste existente, sem alterar banco estrutural.