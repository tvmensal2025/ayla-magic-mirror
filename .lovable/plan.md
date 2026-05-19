## Diagnóstico

O erro visível no preview é o painel Admin quebrando/interrompendo o carregamento. Encontrei dois sinais principais:

1. O runtime registrou `Failed to fetch dynamically imported module: /src/pages/Admin.tsx`, típico de reload/HMR após erro em módulo lazy.
2. No carregamento atual do `/admin`, há uma chamada Supabase inválida:

```text
GET /rest/v1/whatsapp_instances?select=id&consultant_id=eq.
400 invalid input syntax for type uuid: ""
```

Isso acontece porque `useWhatsApp()` é chamado com `consultantId` vazio antes do `userId` real estar disponível, e ele consulta `whatsapp_instances.consultant_id = ""`.

## Plano de correção

1. Tornar `useWhatsApp` seguro quando ainda não existe `consultantId` válido:
   - não calcular instância;
   - não consultar `settings`/`whatsapp_instances`;
   - não iniciar polling;
   - retornar estado neutro/desconectado até receber um UUID válido.

2. Ajustar o uso no `Admin.tsx` para evitar inicializar o hook de WhatsApp com string vazia.

3. Melhorar o carregamento da aba `Atendente IA`:
   - manter spinner apenas enquanto os dados realmente carregam;
   - se a consulta falhar, exibir mensagem de erro e botão de tentar novamente, em vez de ficar travado.

4. Validar no preview:
   - abrir `/admin`;
   - confirmar que não existe mais request `consultant_id=eq.`;
   - abrir WhatsApp > Atendente IA e confirmar que a aba carrega ou mostra erro recuperável.

## Arquivos prováveis

- `src/hooks/useWhatsApp.ts`
- `src/pages/Admin.tsx`
- `src/components/admin/AIAgentTab/index.tsx` e/ou painéis internos como `SlotsPanel.tsx` / `LiveConversationsPanel.tsx`

## Resultado esperado

O painel Admin não deve quebrar durante o carregamento, e a aba Atendente IA não deve ficar presa em spinner por erro silencioso de consulta.