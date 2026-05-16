# Plano — Fases 5 e 6

## Fase 5 — Testes Deno do fluxo conversacional

Criar `supabase/functions/whapi-webhook/handlers/conversational/index_test.ts` cobrindo os bugs corrigidos. Usar `Deno.test` + mocks leves do Supabase client (stub das chamadas `.from().select()/.insert()/.update()` e do RPC de dedupe).

Cenários (8):

1. **Idempotência** — mesmo `messageId` processado 2x → segunda chamada retorna early sem efeitos colaterais (sem update de step, sem rule fire).
2. **Captura + auto-advance** — lead em `qualificacao`, manda "300 reais" → `electricity_bill_value=300` setado, step avança para `checkin_pos_video` por position.
3. **Captura bloqueia QA** — mesma "300 reais" com FAQ ativa contendo "reais" como keyword → QA NÃO casa, captura processa, auto-advance ocorre.
4. **Captura bloqueia regra global** — regra global com keyword "valor" + lead informa valor → regra suprimida com `suppressed_reason='capture_priority'`, fluxo segue.
5. **Detour + restauração** — lead em `welcome`, regra FAQ dispara `goto_step=faq_como_funciona` com `return_behavior='goto_step'` → próximo turno restaura `welcome`, zera `previous_conversation_step` e `last_rule_id`.
6. **Max fires por conversa** — regra com `max_fires_per_conversation=null` (default 10) dispara 10x, 11ª é suprimida com `suppressed_reason='max_fires'`.
7. **Rate limit por cliente** — 6 regras gatilháveis em 60s → 6ª é suprimida com `suppressed_reason='rate_limit'`.
8. **Empty reply guard** — passo com `return_behavior='stay'` sem `response_text` e sem mídia → `_finalize` retorna `reply: ""` + `__inline_sent: true` (não dispara mensagem fantasma).

Rodar via `supabase--test_edge_functions` com `functions: ["whapi-webhook"]`.

## Fase 6 — Painel de observabilidade

### 6.1 Hook `src/hooks/useSuppressedRules.ts` (novo)

Consulta `bot_flow_rule_fires` agregando por `suppressed_reason` nos últimos N dias (default 7). RPC ou query direta com `group by`.

```typescript
useSuppressedRules(days) → { reason, count, last_at, top_rules: [{rule_id, name, count}] }[]
```

### 6.2 Componente `src/components/superadmin/SuppressedRulesPanel.tsx` (novo)

Card no estilo de `BotFunnelPanel.tsx`:
- Cabeçalho com ícone `ShieldOff` + dropdown 24h/7d/30d
- Lista barras horizontais por motivo (`capture_priority`, `max_fires`, `rate_limit`, `cooldown`, `step_scope_mismatch`)
- Labels traduzidos em PT-BR (mapa `REASON_LABELS`)
- Expandir motivo mostra top 5 regras suprimidas com nome + contagem
- Empty state quando 0 supressões

### 6.3 Integração

Adicionar `<SuppressedRulesPanel />` no `src/pages/SuperAdmin.tsx`, próximo ao `BotFunnelPanel`. Sem mudanças de rota.

## Arquivos

**Novos:**
- `supabase/functions/whapi-webhook/handlers/conversational/index_test.ts`
- `src/hooks/useSuppressedRules.ts`
- `src/components/superadmin/SuppressedRulesPanel.tsx`

**Editados:**
- `src/pages/SuperAdmin.tsx` — mount do painel

**Sem migrations.** A coluna `suppressed_reason` já existe (criada na fase 1).

## Ordem

1. Painel (6.1 → 6.2 → 6.3) — valor visível imediato
2. Testes Deno (Fase 5) — protege regressões
3. Rodar `supabase--test_edge_functions` e validar verde

## Não inclui

- Fase 7 (`whapi:sendMedia` 500 com retry) — fica para próximo ciclo
- Alertas/notificações em cima do painel
- Export CSV das supressões
