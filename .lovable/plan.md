# Sprint E — Router de Fluxo + Extrator Multi-Campo

Dois recursos para fechar as lacunas do fluxo conversacional:

## E1. Extrator multi-campo (mensagem rica)

**Problema:** lead manda "sou João, CEP 01310-100, conta 450" no step `pedir_nome` — hoje só captura nome, perde CEP e valor.

**Solução:** novo helper `extractMultiField(text)` em `_shared/multi-field-extractor.ts` que roda regex paralelo em **toda** mensagem livre e devolve `{ nome?, cep?, valor_conta?, cpf?, email?, telefone? }`. Integra em `bot-flow.ts` antes do `safeAssignName`:
- Cada campo extraído é gravado no `customer` (se ainda vazio) com `source=freeform_multi`
- Steps subsequentes detectam campo já preenchido e pulam (`shouldSkipStep`)
- Log único `[multi-extract] capturou: nome=X cep=Y valor=Z` pra auditoria

Regex usadas:
- CEP: `\b\d{5}-?\d{3}\b`
- Valor conta: `\b(?:R\$\s*)?(\d{2,4})(?:[,.]\d{2})?\b` com contexto `conta|luz|fatura|paga|gasto`
- CPF: `\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b`
- Email: regex padrão RFC simplificada
- Telefone: `\b(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b`

Hierarquia: campos vindos de step dedicado (`pedir_cep`, `pedir_valor`) **sobrescrevem** os do multi-extract — o multi só preenche slots vazios.

## E2. Router de fluxo (intent forte de outro produto)

**Problema:** lead começou cadastro residencial e no meio diz "na verdade quero o plano PJ" ou "quero ser licenciada" — hoje cai no midflow-qa, IA responde mas não troca de fluxo.

**Solução:** novo intent `mudar_fluxo` no classifier + tabela `flow_router_rules`:

```sql
CREATE TABLE public.flow_router_rules (
  id uuid PK,
  consultant_id uuid NULL,  -- NULL = regra global
  trigger_keywords text[],   -- ["pj", "empresa", "cnpj", "pessoa juridica"]
  target_flow_key text NOT NULL,  -- "conexao_club_pj" | "licenciada" | "residencial"
  priority int DEFAULT 10,
  is_active bool DEFAULT true
);
```

Seed inicial com 3 regras: PJ, Licenciada, Residencial (default).

No `conversational/index.ts`, antes do `midflow-qa`:
1. Roda `detectFlowSwitchIntent(text, currentFlow)` que faz regex match nas regras ativas
2. Se match e `target_flow_key != currentFlow.name`: envia mensagem de confirmação ("Vi que você quer falar sobre **plano PJ** — quer que eu mude pra esse atendimento? (sim/não)") e seta `customer.pending_flow_switch = 'conexao_club_pj'`
3. Na próxima resposta `afirmacao`: muda `customer.active_flow_id` pro fluxo destino, reseta `conversation_step` pro primeiro step desse fluxo, loga `bot_step_transitions` com motivo `flow_router`
4. `negacao`: limpa `pending_flow_switch` e volta ao step atual

Campos novos em `customers`:
- `active_flow_id uuid` (já existe via `flow_id` no contexto — verificar)
- `pending_flow_switch text NULL`

## E3. Telemetria

Adicionar 2 contadores em `bot_handoff_alerts.reason`:
- `multi_field_captured` (info, não bloqueante)
- `flow_switch_requested` / `flow_switch_confirmed` / `flow_switch_rejected`

Painel SuperAdmin (`BotFunnelPanel.tsx`) ganha card "Trocas de fluxo (7d)" e "Multi-campo (taxa de captura)".

---

## Ordem de execução

1. Migration: `flow_router_rules` + colunas em `customers` + seed
2. `_shared/multi-field-extractor.ts` (puro, testável)
3. `_shared/flow-router.ts` (lê regras, decide switch)
4. Integrar no `bot-flow.ts` (multi-extract no topo do handler de texto livre)
5. Integrar no `conversational/index.ts` (router antes do midflow-qa)
6. Deploy `whapi-webhook`
7. UI: card no `BotFunnelPanel.tsx`

## O que **não** vou mexer

- Lógica de OCR / name-lock (Sprint D já blindou)
- Steps determinísticos do cadastro (CEP, CPF, etc. — só vão receber valores prontos quando multi-extract pegar)
- Engine de classifier (só adiciono o intent `mudar_fluxo` no enum)

Aprova que eu mando.
