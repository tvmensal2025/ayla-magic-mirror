Plano para fazer isso funcionar de forma profissional, sem mais tentativa no escuro:

1. Corrigir o erro atual que impede qualquer teste E2E de iniciar
- O log real do Supabase mostra: `bot-e2e-runner error: supabaseKey is required`.
- A função está tentando criar um client com `SUPABASE_PUBLISHABLE_KEY`, mas esse segredo não existe no ambiente Edge; deve usar uma variável compatível com o projeto, com fallback seguro para `SUPABASE_ANON_KEY`/`VITE_SUPABASE_PUBLISHABLE_KEY` quando disponível.
- Resultado esperado: clicar em “Rodar bot do início ao fim” deixa de falhar imediatamente e cria uma run real em `bot_test_runs`.

2. Garantir que o teste use o mesmo consultor do webhook
- Hoje o runner tem fallback para o consultor do usuário logado, mas o `whapi-webhook` exige `settings.superadmin_consultant_id` e busca o customer por esse consultor.
- Isso pode criar o lead em um consultor e o webhook tentar processar em outro, quebrando o fluxo.
- Ajuste: o runner só deve rodar com o mesmo `superadmin_consultant_id` usado pelo webhook, ou retornar erro claro dizendo o que falta configurar.

3. Corrigir o vínculo da run de teste dentro do webhook
- Hoje o webhook pega “a run running mais recente” sem filtrar pelo telefone/customer.
- Em testes simultâneos ou repetidos, isso pode registrar mensagens na run errada.
- Ajuste: buscar a run ativa vinculada ao `customer_id`/telefone correto depois de localizar o customer.

4. Fazer o outbound mostrar turnos reais
- O mock de envio grava `turn: 0` porque o `AsyncLocalStorage` é iniciado com `turn: 0`.
- Ajuste: passar o turno real vindo do payload/test runner para o contexto de teste, para a timeline ficar confiável.

5. Fortalecer o simulador para seguir o fluxo real sem alucinar
- O runner vai responder por estado real (`conversation_step`) e não por texto inventado.
- Melhorar respostas para: nome, valor da conta, dúvidas, aceite, conta de luz, confirmação de dados, tipo de documento, documento, e dados faltantes.
- Para cada cenário, registrar claramente: mensagem do lead, resposta do bot, step antes/depois, status HTTP, latência e motivo de parada.

6. Validar com sinais reais antes de concluir
- Consultar logs de `bot-e2e-runner` e `whapi-webhook` após deploy.
- Chamar a Edge Function de teste diretamente e confirmar que uma run aparece no banco.
- Conferir que a timeline tem eventos inbound/outbound e que o resumo final aponta exatamente onde o fluxo terminou: concluído, travado, lead silencioso, valor baixo, erro de webhook ou máximo de turnos.

7. Pequeno ajuste na tela `/admin/bot-audit`
- Mostrar erro técnico de forma útil: função, etapa, customer, último step e recomendação objetiva.
- Remover linguagem que pareça “teste fake”: deixar claro que é simulação real do webhook/banco, sem enviar WhatsApp pago.

Critério de pronto:
- O botão de E2E não falha com `supabaseKey is required`.
- Pelo menos o cenário `happy_path` cria run, customer, mensagens inbound/outbound e resumo.
- Se o bot travar, a tela mostra exatamente em qual step travou e qual foi a última resposta do bot, em vez de parecer que “alucinou”.