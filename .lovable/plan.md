Plano para deixar o simulador 100% igual ao fluxo real:

1. Corrigir a criação do customer sandbox
- Hoje o insert deixa o trigger do banco trocar `capture_mode` para `manual`.
- Isso faz o webhook parar em `[manual-capture-stop] texto salvo sem avanço`, exatamente o que apareceu nos logs.
- Ajustar `flow-simulate-run` para criar/atualizar o sandbox com `capture_mode: "auto"`, `conversation_step: "welcome"` no início e sem flags de pausa/handoff.
- Para teste, manter `is_sandbox=true` e `customer_origin="whatsapp_lead"`, mas sem entrar no modo manual de captação.

2. Usar o mesmo consultor que o webhook real usa
- O `whapi-webhook` sempre roteia o bot pelo `settings.superadmin_consultant_id`.
- O simulador deve garantir que o sandbox pertence a esse consultor real do Whapi, não a outro consultor quando a tela estiver aberta por admin/consultor diferente.
- Isso evita carregar fluxo/variante errada e mantém o comportamento igual ao WhatsApp real.

3. Corrigir clique de botões
- O simulador hoje recria ids artificiais como `btn_0`, `btn_1` ao ler `bot_test_outbound`.
- No WhatsApp real, o webhook recebe o `id` original do botão enviado pelo fluxo.
- Ajustar o log do modo teste para gravar os botões como JSON com `{id,title}` e atualizar o mapper do simulador para devolver esses ids reais para a UI.
- Manter fallback compatível com o formato antigo para runs antigas.

4. Preservar sequência real de mensagens/mídias
- O simulador continuará chamando `whapi-webhook`, `runConversationalFlow` e `runBotFlow` reais.
- Não vou duplicar engine nem criar resposta fake.
- Apenas vou remover os atalhos que fazem o teste divergir: customer em modo manual e ids falsos de botão.

5. Validar no backend real
- Reimplantar `flow-simulate-run` e `whapi-webhook`.
- Testar `flow-simulate-reset` + `flow-simulate-run` com "oi".
- Conferir logs do `whapi-webhook`: não pode aparecer `[manual-capture-stop]` para sandbox.
- Conferir retorno: `events.length > 0`, `customer_state.conversation_step` avançando, e botões com ids reais.