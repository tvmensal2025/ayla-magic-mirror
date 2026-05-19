# Horário de silêncio do bot (21:30 → 08:00 BRT)

## Objetivo
Impedir que QUALQUER envio automático (bot-flow, IA, follow-up, crons, agendados não-explícitos) chegue ao cliente entre **21:30 e 08:00 (horário de Brasília)**. Envios manuais do consultor continuam liberados.

## 1. Helper compartilhado

Criar `supabase/functions/_shared/quiet-hours.ts`:

```ts
// Retorna true se agora (BRT) está dentro do período silencioso 21:30–08:00
export function isQuietHourBRT(now = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now); // "HH:MM"
  const [h, m] = fmt.split(":").map(Number);
  const minutes = h * 60 + m;
  const start = 21 * 60 + 30; // 21:30
  const end = 8 * 60;         // 08:00
  return minutes >= start || minutes < end;
}

// Próximo 08:00 BRT em ISO (para reagendar)
export function nextQuietWindowEndISO(now = new Date()): string {
  // Calcula 08:00 BRT do próximo dia útil (ou hoje se ainda for madrugada)
  const brtParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).reduce<Record<string,string>>((a,p)=>(a[p.type]=p.value,a),{});
  const hhmm = Number(brtParts.hour) * 60 + Number(brtParts.minute);
  // Se já passou de 00:00 BRT mas <08:00 → hoje 08:00; senão amanhã 08:00
  const targetDate = hhmm < 8 * 60
    ? `${brtParts.year}-${brtParts.month}-${brtParts.day}`
    : new Date(Date.UTC(+brtParts.year, +brtParts.month - 1, +brtParts.day + 1))
        .toISOString().slice(0, 10);
  return new Date(`${targetDate}T08:00:00-03:00`).toISOString();
}
```

## 2. Pontos de bloqueio

Adicionar checagem `if (isQuietHourBRT()) { ...skip/reschedule... }` nos seguintes envios automáticos:

| Arquivo | Comportamento |
|---|---|
| `whapi-webhook/handlers/bot-flow.ts` (dispatchStep + replies) | Não responder. Sair silenciosamente; cliente recebe resposta no próximo evento após 08:00 (bot processa mensagem nova). |
| `whapi-webhook/handlers/conversational/index.ts` (IA respondendo) | Idem — não envia. |
| `ai-followup-cron` | Pular execução: log `skipped_quiet_hours` e retornar 200. |
| `ai-closer-cron` | Idem. |
| `bot-followup-checker` | Idem. |
| `crm-auto-progress` (msgs automáticas de estágio) | Idem. |
| `send-scheduled-messages` | Adiar: atualizar `scheduled_at = nextQuietWindowEndISO()` para mensagens elegíveis nesse ciclo (status continua `pending`). |
| `manual-step-send` | **NÃO bloqueia** — é envio iniciado pelo consultor. |
| `whapi-proxy` (envio direto do CRM pelo consultor) | **NÃO bloqueia**. |

## 3. Observabilidade

- Log estruturado `quiet_hours_skip` com `{ function, customer_id, reason }` em cada bloqueio.
- Métrica simples: contagem por dia visível em `supabase--edge_function_logs`.

## 4. Configuração futura (não nesta entrega)

Janela 21:30–08:00 fica hardcoded por enquanto. Se quiser depois, viramos por consultor em `consultants.quiet_hours_start/end`. Você quer já nessa primeira entrega ou deixamos fixo?

## Arquivos alterados
- `supabase/functions/_shared/quiet-hours.ts` (novo)
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `supabase/functions/whapi-webhook/handlers/conversational/index.ts`
- `supabase/functions/ai-followup-cron/index.ts`
- `supabase/functions/ai-closer-cron/index.ts`
- `supabase/functions/bot-followup-checker/index.ts`
- `supabase/functions/crm-auto-progress/index.ts`
- `supabase/functions/send-scheduled-messages/index.ts`

Sem alterações de DB.
