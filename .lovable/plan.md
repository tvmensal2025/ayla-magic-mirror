## Objetivo

Garantir que **todos os consultores que rodam na Evolution** tenham comportamento idêntico aos que rodam na Whapi — exceto botões interativos do WhatsApp (Evolution não suporta nativamente, então o texto da pergunta vai cru no chat, sem botão).

## Diagnóstico

Comparando `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (4415 linhas) vs `evolution-webhook/handlers/bot-flow.ts` (4277 linhas), identifiquei **gaps reais** que afetam o comportamento textual dos consultores na Evolution:

### Gaps que precisam ser fechados (afetam texto)

1. **F10 — Fallback de variante C → B quando vídeo inicial falha**
   - Whapi: linhas 959–1038 (rastreia `hadVideo`/`videoFailed` e migra customer para variant B se o vídeo do welcome falhar)
   - Evolution: **ausente** → consultor C com vídeo quebrado deixa lead sem mensagem
2. **Quiet hours BRT** (`isQuietHourBRT`, `logQuietSkip`)
   - Whapi importa de `_shared/quiet-hours.ts` e bloqueia envio fora do horário comercial
   - Evolution: **não importa** → manda em qualquer horário
3. **Resolver strict mode** (`isResolverStrictMode` de `_shared/bot/global-flag.ts`)
   - Whapi: feature flag global para impedir fallback Gemini livre quando custom flow ativo
   - Evolution: **não usa** → pode cair em welcome legacy
4. **`notifyNewLead` no `index.ts`**
   - Whapi notifica `superAdminConsultantId`; Evolution notifica `instanceData.consultant_id` — comportamento divergente em ambientes multi-tenant
   - Validar qual está correto e padronizar
5. **Possíveis outras divergências menores** em handlers de capture/transitions — varredura linha-a-linha pendente

### Gaps que **NÃO** precisam ser portados (botões)

- **Auto-buttons wrapper** (whapi linhas 4388–4408): converte `ask_phone_confirm` e `ask_complement` em botões interativos. Na Evolution o texto-base já é enviado normalmente como pergunta — **manter como está** (texto puro funciona, cliente responde digitando).
- `sendButtons` da Evolution já tem fallback nativo: se a API rejeitar botões, cai para `"1. opção / 2. opção"` numerado via `sendText`. Não precisa mexer.

## Plano de execução

1. **Diff completo lado-a-lado** dos dois `bot-flow.ts` (script tmp) para listar TODAS as divergências, classificar como "porta para evolution" vs "específico de botão".
2. **Portar para evolution-webhook**:
   - F10 variant C → B fallback (bloco `hadVideo`/`videoFailed`)
   - Imports + chamadas de `isQuietHourBRT` / `logQuietSkip`
   - Imports + uso de `isResolverStrictMode`
   - Qualquer outro gap não-botão encontrado no diff
3. **Normalizar `notifyNewLead`** no `evolution-webhook/index.ts` para usar a mesma lógica do whapi (super-admin notifier quando aplicável).
4. **Adicionar testes** em `evolution-webhook/handlers/bot-flow_test.ts` (espelhando os do whapi) que cobrem: variant A/B/C, custom flow resolver, anti-rep prompt, transitions.
5. **Deploy** apenas das funções afetadas: `evolution-webhook`.
6. **Validação**:
   - Rodar testes Deno em ambas as funções
   - Curl simulado com payload Evolution de um consultor variant=B e variant=C, conferir nos logs que o conteúdo é o mesmo do whapi para a mesma `flow_variant`

## Detalhes técnicos

- Tudo é mudança em edge functions (`supabase/functions/evolution-webhook/**` e mínima em `_shared/`). Zero alteração de frontend, schema, ou tabela.
- Helpers compartilhados (`flow-router`, `step-media-order`, `notify-consultant`, `bot/paused`, `bot/global-flag`, `quiet-hours`) já existem em `_shared/` — só precisam ser importados/chamados na Evolution.
- Auto-buttons wrapper fica deliberadamente **fora** do port — o reply textual já está pronto antes do wrapper, então omitir o bloco preserva o texto sem alterações.
- Risco: durante o port pode aparecer divergência em assinatura de `BotContext` (ex: `sender.sendButtons` opcional). Vou validar pelos types antes de mover código.

## Saída esperada

- evolution-webhook se comporta **idêntico** ao whapi-webhook em: ordem de mídia, A/B/C, custom flow, anti-rep, quiet hours, fallback C→B, notificação de novo lead, takeover humano.
- Diferença visual única: perguntas que viram botões na Whapi ficam como texto na Evolution (o `sendButtons` da Evolution já tem fallback numerado, mas o auto-wrapper do whapi não dispara).
- Pronto para escalar nos outros consultores Evolution sem reescrever lógica.
