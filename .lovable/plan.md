## Diagnóstico

O reset anterior limpou os registros, mas o problema não é só o estado do lead.

Nos logs, quando o cliente manda “Oi”, o webhook faz isto:

```text
step legado="welcome"
unknown step="welcome" → restart at firstActive=6226...
mídia audio não bloqueante ignorada
start cascade 6226... → 3e7...
envia: "qual o valor médio da sua conta de luz?"
grava conversation_step = flow:3e7...
```

Ou seja: o fluxo reinicia, mas o primeiro passo é tratado como mídia “não bloqueante”, não envia o áudio/imagem do passo inicial, e ainda faz cascade automático para o segundo passo. Por isso o cliente já cai na pergunta da conta e parece que “não resetou”.

## Plano de implementação

1. **Corrigir o início do fluxo dinâmico**
   - No handler `supabase/functions/whapi-webhook/handlers/conversational/index.ts`, ajustar o bloco de `unknown step="welcome"`.
   - Ao reiniciar no primeiro passo ativo, enviar mídia de forma normal/bloqueante em vez de marcar como `skipped_nonblocking`.
   - Não avançar automaticamente para o fallback do primeiro passo quando esse primeiro passo está configurado para aguardar resposta (`wait_for='reply'`).
   - Persistir `conversation_step` no primeiro passo (`flow:6226...`) para a próxima mensagem do usuário ser processada ali.

2. **Preservar auto-cascade apenas onde faz sentido**
   - Manter cascade automático somente para passos que não aguardam resposta (`wait_for='none'`) ou quando a própria configuração indicar etapa sem interação.
   - Evitar que o fallback do primeiro passo funcione como “próximo passo imediato” durante o start.

3. **Resetar novamente os dois números depois da correção**
   - Aplicar uma migração de reset para os leads:
     - `5511971254913`
     - `5511989000650`
   - Limpar conversas, logs, buffers, agendamentos e estado do cliente.
   - Deixar `conversation_step='welcome'`, `status='pending'`, sem memória residual.

4. **Validar nos logs**
   - Conferir que após enviar “Oi”, o log fique no primeiro passo ativo em vez de pular para `3e7...`.
   - Verificar que a resposta enviada corresponde ao primeiro passo do fluxo, não à pergunta “qual o valor médio...”.

## Resultado esperado

Depois de implementado, quando um desses números mandar “Oi”, o bot deverá começar do primeiro passo real do fluxo e aguardar a resposta antes de avançar para a pergunta do valor da conta.