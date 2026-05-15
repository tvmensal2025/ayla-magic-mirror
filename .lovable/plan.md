## O problema identificado

O teste atual não está validando um fluxo real de venda. Ele fica travado em `checkin_pos_video`, repetindo áudio/vídeo, e nunca chega naturalmente em:

```text
boas-vindas → nome/valor da conta → explicação/dúvidas → aceite → conta de luz → confirmar/recusar → documento → confirmar/recusar → dados finais → pronto para envio
```

Isso acontece porque o simulador responde “sim, quero economizar” no momento em que o bot ainda espera algo mais específico, e o motor conversacional volta a mandar mídia em vez de avançar para valor da conta/cadastro.

## O que vou implantar

### 1. Criar um fluxo de teste realmente profissional

Substituir o E2E atual por uma jornada guiada por estados reais do cliente, com roteiros como:

```text
1. Lead chama: “oi”
2. Bot responde boas-vindas / pergunta nome ou valor
3. Lead informa nome: “João Silva”
4. Bot pede valor da conta
5. Lead informa: “350 reais”
6. Bot calcula economia e pede conta
7. Lead pode:
   - dar joinha / aceitar
   - recusar
   - perguntar dúvida
8. Bot responde e tenta avançar
9. Lead envia conta fictícia
10. Bot faz OCR mockado e mostra dados extraídos
11. Lead pode:
   - aprovar
   - recusar e reenviar
   - editar campo
12. Bot pede RG/CNH
13. Lead envia documento fictício
14. Bot confirma dados
15. Lead aprova ou recusa
16. Bot coleta dados faltantes e encerra em estado validável
```

### 2. Adicionar “dar joia” e “recusar” como ações explícitas no teste

Na tela `/admin/bot-audit`, trocar a sensação de “teste automático cego” por um painel de validação real:

- botão “Aprovar etapa” / “Joia”
- botão “Recusar etapa”
- botão “Enviar dúvida”
- botão “Enviar valor da conta”
- botão “Enviar conta fictícia”
- botão “Enviar RG/CNH fictício”

Assim você consegue validar como um operador/profissional faria: olhando a resposta do bot e decidindo se o lead aprova, recusa, pergunta ou segue.

### 3. Corrigir o travamento em `checkin_pos_video`

Alterar a lógica para que, quando o lead responder “sim”, “joia”, “entendi”, “pode seguir”, “quero economizar” ou equivalente, o bot avance para pedir o valor da conta ou iniciar cadastro — sem repetir áudio/vídeo em loop.

### 4. Fazer o teste medir conversão real, não só “sem erro técnico”

O resultado final precisa mostrar:

- quantas etapas foram concluídas
- onde travou, se travou
- última mensagem do bot
- último step real
- se houve repetição de mídia
- se houve placeholder sem substituir
- se houve erro HTTP/função
- se o lead chegou em estado de conversão
- se a recusa foi tratada corretamente
- se dúvidas foram respondidas sem alucinação aparente

### 5. Usar dados fictícios, mas passando pelo fluxo real

Manter telefone reservado `5500000...`, OCR mockado e envio sem custo de WhatsApp, mas o caminho será pelo mesmo `whapi-webhook` e pelo mesmo `bot-flow.ts`. Ou seja: não é teste de mentira; é um lead falso usando o fluxo real.

### 6. Melhorar a tela de auditoria para decisão de mercado

A tela deve deixar claro:

- “Pronto para vender” quando passa
- “Não colocar no mercado” quando trava
- motivo objetivo do bloqueio
- recomendação concreta do próximo ajuste

Remover linguagem confusa como “dados fictícios” como teste principal e deixar o foco em “Simulação real de conversa”.

## Critério de pronto

Só considero pronto quando o teste conseguir provar pelo menos estes caminhos:

```text
Caminho feliz: lead aceita tudo e chega ao final
Dúvida: lead pergunta, bot responde e volta ao fechamento
Recusa da conta: lead recusa/edita e o bot se recupera
Valor baixo: bot não tenta vender como se fosse lead bom
Documento CNH: CNH segue sem pedir verso indevido
Lead some: sistema identifica abandono sem chamar de erro de bot
```

## Arquivos que serão ajustados

- `supabase/functions/bot-e2e-runner/index.ts`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `src/pages/BotAudit.tsx`
- possivelmente `supabase/functions/_shared/test-mode.ts` para registrar melhor os eventos de aprovação/recusa

## Sem mexer agora

Não vou criar um novo produto, nem landing page, nem refazer todo o CRM. O foco será um sistema de validação real do bot e correção do loop que impede o fluxo de converter.