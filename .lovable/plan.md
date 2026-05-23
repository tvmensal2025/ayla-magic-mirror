## Problema

Quando a Judite mandou a conta, o painel **não** mostrou o card "Eu confirmo / Pedir ao cliente" — o bot já disparou as opções SIM/NÃO direto pra ela.

## Causa

No `whapi-webhook/handlers/bot-flow.ts` o passo de OCR (conta e documento) só marca `ocr_review_pending` se o RPC `is_consultant_online` devolver `true`. Esse RPC depende da tabela `consultant_presence`, que é atualizada por heartbeat a cada 25s **e é zerada para 1970 sempre que a aba do /admin fica oculta** (`useConsultantPresence.ts` linhas 86-102). Resultado prático: basta trocar de aba/janela por alguns segundos pra cair no caminho "manda direto pro cliente", sem nunca passar pelo card de revisão.

O usuário quer o oposto: o card de revisão deve **sempre** abrir no painel quando o OCR terminar; quem decide se confirma sozinho ou pede pro cliente é o consultor, dentro do card. A fila de timeout (`ocr-review-timeout`, 5min) já existe e cuida do fallback automático caso o consultor não responda.

## Mudança

Remover o gate de presença nas duas etapas de OCR no `whapi-webhook/handlers/bot-flow.ts`:

1. **OCR da conta** (~linhas 3043-3072): apagar o bloco `is_consultant_online` + `if (consultantOnline)`. Sempre setar:
   - `ocr_review_pending = "bill"`
   - `ocr_review_started_at = now`
   - `ocr_review_decided_at = null`, `ocr_review_decided_by = null`
   - `reply = ""` (não manda SIM/NÃO pro cliente — espera o consultor decidir no painel)

2. **OCR do documento** (~linhas 3654-3690): mesma coisa, com `ocr_review_pending = "doc"`.

3. Manter o `conversation_step = "confirmando_dados_conta"` / `"confirmando_dados_doc"` como já está, e manter o cron `ocr-review-timeout` (5min) — ele continua liberando automaticamente se o consultor não decidir.

4. Verificar se o `evolution-webhook/handlers/bot-flow.ts` tem o mesmo gate. Se tiver, aplicar a mesma remoção pra manter paridade.

## Impacto

- O card "Eu confirmo / Pedir ao cliente" passa a aparecer **sempre** no painel do consultor assim que o OCR termina, independente de aba aberta/fechada.
- Se o consultor não decidir em 5 min, o cron já existente solta o lead pro fluxo automático (manda dados pro cliente confirmar).
- "Não está analisando" deve sumir junto, porque o card só renderiza quando o OCR preencheu pelo menos um campo — se ele não aparecer agora estava sendo escondido pela falta de presença, não por falha de OCR (mas vou conferir os logs da Judite após o ajuste pra confirmar).

## Memória

Atualizar `mem://features/ocr-review-flow` (criar se não existir) registrando: card de revisão sempre abre; presença não influencia mais; timeout de 5min cuida do fallback.
