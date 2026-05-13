
# Reformulação da IA Vendedora — Camila 2.0

Análise do print do Rafael Ferreira: a IA chamou ele de "Gabriel" (nome inventado), respondeu em segundos seguidos como robô, ignorou que o cliente já tinha mandado a conta, ficou repetindo "me manda foto da conta", usou emojis/brincadeiras impróprias para venda séria, e não conhece o ecossistema iGreen (app, Conexão Club com até 70% off em Droga Raia, fatura via app). Vou consertar tudo isso em 6 frentes.

---

## 1. Nova persona — vendedora consultiva, sem brincadeira

Em `ai-sales-agent/index.ts` (`systemPrompt`):
- Tom: **consultiva, profissional, calorosa mas séria**. Nada de "oii 😊", "blz", "rapidinho".
- **Zero emojis** em mensagens da IA (sanitizer remove qualquer emoji de saída).
- Proibidas frases tipo "vou fazer uma continha", "me chama" — substituir por linguagem de vendedora real ("posso te mostrar exatamente quanto você economiza", "vamos seguir com seu cadastro").
- Mensagens 1-3 frases, mas com **conteúdo de valor**, não recheio.
- Saudação neutra quando não tem nome: **"Olá! Tudo bem?"** (não "oii").

## 2. Trava de nome (nunca mais inventar "Gabriel")

- `isTrustworthyName()` continua, mas vai ser **mais rígido**: só aceita nome se vier do OCR da conta de luz (`customer.name` populado pelo OCR) OU se o lead se apresentou explicitamente ("meu nome é X", "sou X", "aqui é X" — regex no inbound).
- Enquanto não houver nome confiável, `firstName = null` e o prompt **bloqueia explicitamente** qualquer vocativo. Adiciona ao sanitizer um pós-filtro que remove qualquer "Olá NOME," / "Oi NOME" se NOME não está no contexto.
- Adiciona ferramenta `ask_for_name` para a IA pedir o nome em momento natural (após o pitch, antes do fechamento).

## 3. Base de conhecimento iGreen completa (no system prompt)

Adicionar bloco `CONHECIMENTO IGREEN` no prompt:
- **Conta da distribuidora (CPFL/Enel/etc) chega normalmente**, mas o cliente também recebe a fatura iGreen **dentro do aplicativo iGreen Energy** (Play Store / App Store).
- **Conexão Club** (benefício gratuito do cliente iGreen): até **70% de desconto em farmácias Droga Raia, Drogasil, Pacheco**, descontos em consultas, exames, óticas, pet shop, lazer.
- Empresa mineira (Uberlândia), 170 mil+ clientes, selo RA1000 Reclame Aqui, regulamentada ANEEL desde 2017.
- Sem instalação, sem placa, sem obra, sem fidelidade, sem custo, sem trocar fiação.
- Desconto real: **até 20%** (não fixar 12%).

A IA usa esse conhecimento espontaneamente quando faz sentido (Conexão Club como bônus surpresa no fechamento, app para tirar dúvidas pós-venda).

## 4. Ritmo humano (sem indicador "digitando…")

Conforme já decidido antes: **não enviar `presence: composing`**. Em vez disso, no `bot-flow.ts` (e no caminho da IA), aplicar um **delay calculado** antes de cada `sendText`/`sendMedia`:
- Delay base = 2.5s + (length / 20) segundos, com jitter ±20%, teto de 12s.
- Mensagens curtas (<30 chars) ainda esperam mínimo 3s.
- Múltiplas mensagens em sequência → delay extra entre elas.

Implementado num helper `humanPace(text)` chamado antes de qualquer envio outbound da IA.

## 5. OCR autônomo + não pedir conta duas vezes

Hoje a IA fala "me manda foto da conta" mesmo quando o cliente acabou de enviar (caso do print). Correção em `bot-flow.ts` e `ai-sales-agent`:

- **Antes de chamar a IA**, o webhook checa: o cliente já tem `electricity_bill_photo_url`? Se sim e o OCR já rodou (`ocr_done = true`), o contexto da IA recebe `[CONTA JÁ RECEBIDA E ANALISADA]` com os dados extraídos (titular, endereço, distribuidora, valor, instalação) — e o prompt proíbe pedir a conta de novo.
- Se o cliente disse "quero cadastrar" e **já tem conta no banco**, pular `aguardando_conta` e ir direto para `confirmando_dados_conta` (botões SIM / EDITAR).
- Se OCR já tem nome confiável, popular `customer.name` automaticamente para a IA passar a usar.
- Quando a IA detecta intenção de cadastro e a conta ainda não existe, ela usa `advance_to_closing` (já existe), mas agora o webhook adiciona estado `bill_requested_at` para não repetir o pedido em <10 min.

## 6. Documento (RG antigo / CNH) — pedido específico de reenvio

No fluxo de coleta de documentos (depois de `confirmando_dados_conta`):
- Se o OCR do documento falhar OU o cliente disser "errei", "mandei errado", "é antigo", "é a CNH":
  - Bot pergunta com **botões**: `[RG Novo] [RG Antigo] [CNH]` para escolher o tipo correto.
  - Após escolher, pede explicitamente: "Por favor, envie novamente a foto da **frente da sua [tipo escolhido]**" e depois o verso.
- Adicionar handler `clarify_document_type` que detecta intenção via regex no inbound e força reenvio sem perder a conversa.

---

## Arquivos a alterar

```text
supabase/functions/ai-sales-agent/index.ts
  - systemPrompt(): persona séria, conhecimento iGreen, regras anti-emoji/anti-brincadeira
  - sanitizeHumanMessage(): remove TODOS emojis, remove vocativos com nome não-confiável
  - tools: adicionar ask_for_name; ajustar send_text/advance_to_closing
  - loadContext(): incluir flag `bill_already_received` + dados extraídos do OCR
  - isTrustworthyName(): exigir source = ocr|self_introduced

supabase/functions/evolution-webhook/handlers/bot-flow.ts
  - Pré-IA: detectar conta já recebida → contexto especial / pular re-pedido
  - Detectar self-introduction de nome ("meu nome é X") → salvar com source=self_introduced
  - Wrapper humanPace() antes de cada envio
  - clarify_document_type para "errei / é antigo / é CNH"
  - Após advance_to_closing: setar bill_requested_at e não repetir

supabase/functions/_shared/human-pace.ts (novo)
  - Helper de delay humano (sem 'composing')

supabase/functions/_shared/ocr.ts (verificar)
  - Garantir que após OCR da conta, customer.name e customer.distribuidora ficam populados e ocr_done=true

DOCUMENTATION.md
  - Anexar seção "Camila 2.0 — Persona, Ritmo e Conhecimento"
mem://features/ai-camila-persona-v2 (novo memory)
  - Persona séria, zero emoji, ritmo humano sem "digitando", base iGreen
```

## Detalhes técnicos

**Detecção de auto-apresentação (regex):**
```
/(?:meu nome (?:é|eh)|me chamo|aqui (?:é|eh|fala)|sou (?:o|a)?)\s+([A-ZÀ-Ý][a-zà-ÿ]{1,20})/i
```
→ salva em `customer.name` com `name_source = 'self_introduced'`.

**humanPace:**
```ts
export async function humanPace(text: string) {
  const base = 2500 + (text?.length || 0) * 50;
  const jitter = (Math.random() * 0.4 - 0.2) * base;
  const ms = Math.min(12000, Math.max(3000, base + jitter));
  await new Promise(r => setTimeout(r, ms));
}
```

**Prompt — bloco anti-emoji/jocoso (trecho):**
```
ESTILO OBRIGATÓRIO:
- Você é vendedora consultiva. Profissional, calorosa, jamais infantil.
- PROIBIDO: emojis, "rs", "kkk", "blz", "rapidinho", "oii", "fofo", "amor".
- Use "você", não "vc". Use português correto de WhatsApp adulto.
- Nunca chame o lead por nome a não ser que [Contexto] traga "Nome confiável: X".
- Se o lead mandou conta de luz: NUNCA peça de novo. Use os dados já extraídos.
```

**Migração de DB (mínima):**
- `customers.name_source text` (ocr | self_introduced | manual | unknown)
- `customers.ocr_done boolean default false`
- `customers.bill_requested_at timestamptz`

---

## Testes pós-implementação

1. Mandar "oi" → resposta sem nome, sem emoji, em ~4s.
2. Mandar "quero cadastrar" + foto da conta → IA confirma dados extraídos com botões, **não pede a conta de novo**.
3. Dizer "meu nome é Rafael" → próximas mensagens usam "Rafael".
4. Mandar "errei o RG, é o antigo" → botões `[RG Antigo] [CNH] [RG Novo]` e pedido específico de reenvio.
5. Verificar logs: nenhum `composing` enviado; delays entre 3-12s.
6. Testar pitch — IA deve mencionar Conexão Club (Droga Raia) e app iGreen como diferenciais.
