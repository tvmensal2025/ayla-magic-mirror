# Plano: corrigir guarda de nome e sobreposição do nome do perfil do WhatsApp

## Diagnóstico (causa raiz do erro do print)

O bot lê `pushName` do WhatsApp (ex.: "Rafael Ferreira") e grava no `customers.name` com `customers.n = "whatsapp_profile"`. Quando o consultor clica em qualquer passo, a edge `manual-step-send` faz:

```ts
.select("id, name, name_source, phone_whatsapp, ...")          // ← coluna errada
const nameSource = String((customer as any).name_source || "unknown")
if (nameSource === "unknown" && !stepAsksName) → bloqueia
```

**A coluna real é `n`, não `name_source`** (confirmado no schema e em todo `whapi-webhook`). Por isso `nameSource` cai sempre em `"unknown"` e **todo passo é bloqueado** com "Antes de avançar, peça o nome do lead…" — mesmo quando o lead já tem `name="Fernando"` e `n="self_introduced"`. É exatamente o erro vermelho do 3º screenshot.

Além disso, o usuário quer que: nome do perfil do zap **não conta como capturado** (consultor ainda precisa pedir ou o lead se apresentar), mas quando o lead digitar o nome, **sobrescreve** o do perfil. A sobreposição já existe em `bot-flow.ts` (seta `n="self_introduced"` no capture do ask_name) — só não está rodando porque o `awaiting_inbound` do print anterior travava o avanço.

## O que muda

### 1. `supabase/functions/manual-step-send/index.ts`

- **Trocar `name_source` por `n`** no `select` e na leitura.
- Tratar como "ainda não capturado" os valores: `unknown`, `whatsapp_profile`, `""`, `null`. Qualquer outro (`self_introduced`, `ocr_conta`, `ocr_doc`, `user_confirmed`, `freeform_multi`) libera o passo.
- Mensagem de erro continua sugerindo "Pedir nome" — e o botão "Pedir nome" já dispara o passo com `skipNameGuard=true`.

```ts
.select("id, name, n, phone_whatsapp, ...")
const nameSource = String((customer as any).n || "unknown").toLowerCase();
const NAME_NOT_TRUSTED = new Set(["", "unknown", "whatsapp_profile"]);
if (!body.skipNameGuard && NAME_NOT_TRUSTED.has(nameSource) && !stepAsksName) {
  return json({ ok:false, blocked:true, code:"name_not_captured_yet", ... });
}
```

### 2. Sobreposição quando o lead digita o nome (verificar que continua valendo)

Já implementado em `whapi-webhook/handlers/bot-flow.ts` no capture de `ask_name`: quando o lead responde com nome plausível, faz `update({ name: candidate, n: "self_introduced" })` — isso já sobrescreve o `whatsapp_profile`. Só precisamos garantir que o `whapi-webhook` esteja recebendo o inbound (round-trip do `awaiting_inbound` resolvido na rodada anterior). Sem mudança de código aqui — apenas validar pelo log.

### 3. `src/components/captacao/CaptureSheet.tsx`

Hoje `needsName = !customer?.n || customer.n === "unknown"`. Alinhar com a regra do backend para evitar UI inconsistente:

```ts
const NAME_NOT_TRUSTED = new Set(["", "unknown", "whatsapp_profile"]);
const needsName = NAME_NOT_TRUSTED.has(String(customer?.n || "").toLowerCase());
```

Assim o badge "Pedir nome" continua aparecendo quando o nome veio só do perfil do zap, e some assim que o lead se apresenta.

## Comportamento esperado depois

1. Lead novo entra → `n="whatsapp_profile"` (vindo do pushName) → consultor clica em passo qualquer → backend bloqueia com `name_not_captured_yet` → consultor clica **"Pedir nome"** (envia `ask_name` com `skipNameGuard=true`).
2. Lead digita "Fernando" → webhook captura, sobrescreve `name="Fernando"`, `n="self_introduced"`.
3. Consultor clica próximo passo → guard libera (nameSource ≠ unknown/whatsapp_profile) → fluxo avança normalmente, **um passo por vez**, respeitando o `awaiting_inbound` já existente.
4. Erro vermelho "Lead não encontrado / Antes de avançar, peça o nome" deixa de aparecer com lead que já respondeu.

## Arquivos alterados

- `supabase/functions/manual-step-send/index.ts` — trocar `name_source` → `n` + lista de sources não confiáveis
- `src/components/captacao/CaptureSheet.tsx` — alinhar `needsName` com `NAME_NOT_TRUSTED`

## Fora de escopo

- `whapi-webhook` (lógica de sobrescrever nome já correta).
- SendSequenceDialog single-step / chips A·B·C (já implementados na rodada anterior).
- Round-robin de variante na criação do lead.
