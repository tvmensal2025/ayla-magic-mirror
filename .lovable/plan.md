## Diagnóstico

Achei a causa raiz dos dois problemas que você relatou (texto "olá tudo bem" duplicado depois do áudio + cadastro que não chega ao final):

**Bug fatal em `supabase/functions/ai-agent-router/index.ts` (linhas 182-188):** a edição anterior duplicou a query do slot, deixando código sintaticamente inválido:

```ts
.from("ai_agent_slots")
.select("...video_url, video_label")
.eq("active", true)
.order("position");
  .eq("active", true)        // <-- linhas órfãs, quebram o parse
  .order("position");
```

Confirmação: `ai-agent-router` **não tem nenhum log de execução** nas últimas horas (nem boot, nem shutdown). Ou seja, ele falha na primeira chamada e o webhook cai no fallback genérico. Isso explica:

1. **"Olá, tudo bem?" depois do áudio** — o webhook ou outro caminho legado dispara a saudação padrão porque o router morreu antes de atualizar o `conversation_step` para fora de `welcome`.
2. **Cadastro que não conclui** — sem o router, ninguém move o cliente entre `coleta_conta → coleta_doc → cadastro_portal`, e o handoff/finalização nunca acontece.

## Plano de correção

### 1. Consertar o `ai-agent-router` (1 edição mínima)
Remover as duas linhas duplicadas (187-188) para o select compilar:
```ts
const { data: slotsRaw } = await supabase
  .from("ai_agent_slots")
  .select("slot_key, label, trigger_hint, fallback_text, min_interval_minutes, is_testing, video_url, video_label")
  .eq("active", true)
  .order("position");
```

### 2. Evitar o "olá tudo bem" duplicado quando o áudio do welcome dispara
No mesmo arquivo, depois que o slot é despachado com sucesso (`dispatchedSlot` setado):
- **Suprimir `decision.reply_text`** (zerar antes do envio do texto). O áudio da Camila já cumprimenta e pede o nome — não faz sentido o LLM mandar "oii, qual sua cidade?" logo depois.
- **Forçar `updates.conversation_step = "qualificacao"`** quando o slot disparado for o de boas-vindas e o step atual ainda for `welcome`. Assim a próxima mensagem do lead já entra no funil certo e nunca mais cai no fallback de saudação.

### 3. Garantir que o slot de welcome não toque duas vezes
- Confirmar que o slot de welcome tem `min_interval_minutes >= 1440` (1 dia) no banco. Se estiver 0/null, o LLM pode reescolher e o áudio toca de novo.
- Adicionar guarda extra: se já existe `ai_slot_dispatch_log` com `dispatch_status='sent'` para esse `customer_id` + `slot_key='welcome'` em qualquer tempo, bloquear novo envio do mesmo slot (idempotência por cliente).

### 4. Avançar o cadastro até o fim
Hoje o router só avança step quando o LLM devolve `next_step` diferente. Vou adicionar regras determinísticas para não depender só do LLM:
- Se o lead enviou imagem/documento e step é `welcome`/`qualificacao`/`apresentacao` → mover para `coleta_conta` automaticamente.
- Se já existe `customer.electricity_bill_value` + `customer.cpf` + documento → mover para `cadastro_portal` e disparar o `submit-lead` do portal worker (mesmo padrão que o `evolution-webhook` já usa no fluxo manual, conforme `IMPLEMENTACAO_COMPLETA_EVOLUTION.md`).
- Logar cada transição em `ai_agent_logs` com motivo (`auto_progress: bill_received` etc.) pra ficar auditável.

### 5. Validação
- Rodar lint do edge function pra confirmar que compila.
- Testar com `supabase--curl_edge_functions` mandando um payload simulado de "oi" e checar nos logs:
  - boot OK
  - slot welcome despachado UMA vez
  - reply_text vazio
  - step avança
- Mandar uma segunda mensagem ("a conta vem uns 300 reais") e confirmar que NÃO há novo "olá tudo bem".
- Simular envio de foto e confirmar que step move para `coleta_conta` e finalmente dispara o portal worker.

## Detalhes técnicos

Arquivos tocados:
- `supabase/functions/ai-agent-router/index.ts` — fix de sintaxe + supressão de reply após slot + auto-progresso de step + idempotência do slot welcome.
- Migration nova (se necessário): `UPDATE ai_agent_slots SET min_interval_minutes = GREATEST(min_interval_minutes, 1440) WHERE slot_key = 'welcome';`

Sem mudanças de UI. Sem mudanças nos handlers do `evolution-webhook` ou `whapi-webhook` — eles continuam apenas chamando o router.

Quer que eu já implemente assim ou prefere ajustar algum ponto antes (ex.: outro intervalo mínimo pro slot welcome, ou desligar o auto-progresso determinístico)?
