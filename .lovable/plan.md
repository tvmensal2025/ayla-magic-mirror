## Diagnóstico

O teste não está 100% real por dois problemas principais:

1. **O Modo Real está caindo no telefone sandbox**
   - A UI enviou `real_mode: true` e `real_phone: 5511971254913`, mas os logs do `whapi-webhook` mostram que o processamento rodou no telefone `550000021189303`.
   - Resultado: ele continua usando o customer sandbox em vez do seu WhatsApp real.

2. **O fluxo trava no `capture_mode = manual`**
   - Os logs mostram: `[manual-capture-stop] ... texto salvo sem avanço step="welcome"`.
   - Isso impede o motor de sair do `welcome`, por isso a resposta da API volta com `events: []`, `step_after: welcome` e nada aparece/envia.

Também encontrei um terceiro risco: existe um customer real antigo para `5511971254913` com `is_test_lead=false` e `capture_mode=manual`. O reset do simulador não apaga esse registro por segurança, então o Modo Real pode reencontrar esse lead real antigo e não o lead de teste recém-criado.

## Plano de correção

1. **Garantir que o Modo Real use sempre o telefone real informado**
   - Ajustar `flow-simulate-reset` para resolver o mesmo `superadmin_consultant_id` usado em `flow-simulate-run`.
   - Assim reset e run apontam para o mesmo consultor e para o mesmo telefone.

2. **Isolar lead de teste real sem apagar cliente real**
   - No Modo Real, antes de criar/reusar customer, procurar primeiro por `phone_whatsapp + consultant_id + is_test_lead=true`.
   - Se houver customer real antigo com o mesmo telefone e `is_test_lead=false`, não reaproveitar para o teste.
   - Criar um novo customer marcado como `is_test_lead=true`, `is_sandbox=false`, `capture_mode=auto`.

3. **Forçar o motor a não parar no modo manual durante testes reais**
   - No `whapi-webhook`, quando `x-bot-real-services=1`, ignorar os guards de `capture_mode=manual` que salvam e param.
   - O Modo Real precisa simular o lead real avançando automaticamente pelo fluxo criado, não o modo captação manual do CRM.

4. **Corrigir visibilidade no simulador**
   - Garantir que `botRequestStore` receba `realServices=true` e que o `mirrorSender` registre todos os envios reais em `bot_test_outbound`.
   - Se nenhum evento for capturado, devolver diagnóstico explícito no painel em vez de ficar vazio.

5. **Validar ponta a ponta**
   - Testar `flow-simulate-run` com `real_mode=true`, `real_phone=5511971254913`, `fresh=true`.
   - Conferir que a resposta sai de `welcome`, gera eventos e usa o telefone real.
   - Conferir logs do `whapi-webhook` mostrando `phone=5511971254913`, `realServices=true`.

## Resultado esperado

Depois da correção:

```text
Modo Real ON + telefone real
        ↓
flow-simulate-reset limpa somente lead de teste real
        ↓
flow-simulate-run chama whapi-webhook com telefone real
        ↓
whapi-webhook roda motor do fluxo ativo sem parar em manual
        ↓
WhatsApp real recebe mensagens
        ↓
simulador espelha os mesmos eventos
        ↓
OCR, Portal Worker, OTP e link facial seguem serviços reais
```

## Arquivos envolvidos

- `supabase/functions/flow-simulate-run/index.ts`
- `supabase/functions/flow-simulate-reset/index.ts`
- `supabase/functions/whapi-webhook/index.ts`
- `src/components/admin/flow-builder/FlowSimulator.tsx` somente se for necessário melhorar o diagnóstico visual.