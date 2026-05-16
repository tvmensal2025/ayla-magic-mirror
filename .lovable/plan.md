##   
ANALISE OQUE MAIS PODE SER FEITO E  FACA UMA AUDITORIA PARA NAO DAR ERRO E APLICAR 100% CERTO

##   
  
Resumo da auditoria das 2 conversas (Viviane + Paulo)


| #   | Problema observado nas mensagens                                                              | Causa real                                                                                                            |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | "1️⃣ Sim / 2️⃣ Outro" como texto em `ask_phone_confirm`, `ask_finalizar`, `ask_complement`    | Steps legados mandam string — Whapi suporta botões mas não é usado                                                    |
| 2   | "Campo Seu Código" pedido pra cliente CPFL (rótulo é Light/Enel)                              | Texto fixo em `ask_installation_number`, sem mapa por distribuidora; OCR já tinha rodado mas fallback pergunta sempre |
| 3   | Cliente mandou CNH e bot pediu "verso do RG"                                                  | `detectDocumentType` retorna `rg_antigo` como fallback silencioso quando Gemini falha/ambíguo                         |
| 4   | Mensagens repetidas 2x ("qual valor da conta", "Deu para entender", etc)                      | Engine re-executa o step quando inbound chega antes da transição persistir                                            |
| 5   | Nome "Lucas" salvo, depois sobrescrito                                                        | Capture aceita qualquer string nova sem checar nome já confirmado                                                     |
| 6   | A partir de `aguardando_doc_*` o bot vira hardcoded (`ask_email`, `ask_cep`, `ask_number`...) | Esses steps não existem no Flow Builder, são do `bot-flow.ts` legado                                                  |


## Plano de correção (ajustado ao seu feedback)

### Fix A — Tom humano para perguntas (sem botões)

Você pediu pra **não usar botões** no passo de documento: tornar mais humano.

- Substituir `ask_tipo_documento` por uma **mensagem única** sem opções:
  ```
  Pra finalizar, me manda só uma foto da frente do seu documento 📄
  Pode ser RG ou CNH, o que for mais fácil pra você.
  ```
- **Não perguntar "novo ou antigo"** em hipótese nenhuma — o bot detecta sozinho.
- Manter os outros prompts (`ask_phone_confirm`, `ask_finalizar`, `ask_complement`) em texto humano também, sem "1/2":
  ```
  Esse número é o seu WhatsApp principal? Se sim, é só responder "sim".
  Se não, me manda o número certo.
  ```

### Fix B — Auto-detecção robusta de documento (CNH x RG novo x RG antigo)

O cliente nunca escolhe. O bot decide pela foto.

1. Após receber a 1ª foto, rodar `detectDocumentType` (Gemini Vision) com prompt JSON estruturado e score de confiança.
2. Se confiança ≥ 0.7 → segue:
  - `cnh` → pede só **uma** foto (CNH digital é frente+verso na mesma página). Não pede verso.
  - `rg_novo` ou `rg_antigo` → pede o **verso**.
3. Se confiança < 0.7 → **roda 2ª passada** com prompt mais detalhado em vez de assumir RG antigo.
4. Se ainda incerto → assume `rg_antigo` (mais seguro: pede verso). Loga em `ai_decisions`.
5. Remover o fallback silencioso atual no `normalizeDocumentType` que sempre retorna `rg_antigo` quando vazio.

Mensagens humanizadas após detecção:

```
cnh:        "Recebi sua CNH! Já tenho tudo dela, vamos pro próximo passo."
rg_novo:    "Recebi a frente. Agora me manda o verso, por favor."
rg_antigo:  "Recebi a frente. Agora me manda o verso, por favor."

( AQUI TEM QUE TER OS DADOS E OS BOTOES PARA CONFIRMAR OS DOS DO CLIENTE DO RG OU CNH ) IGUAL JA FAZIA ANTES PARA CONFIRMAR 
```

### Fix C — Número de instalação inteligente ( ESSE JA TEM NA CONTA, TEM QUE PEDIR A CONTA DE ENERGIA )

- Antes de enviar `ask_installation_number`, checar `customers.numero_instalacao`. Se OCR já preencheu, **pular o step**.
- Se precisar perguntar, mapa por distribuidora:
  ```
  CPFL/RGE  → "Nº da Instalação"
  Light/Enel → "Seu Código / Nº do Cliente"
  Equatorial/Energisa/Cemig → "Nº da Instalação / Conta Contrato"
  default    → "Nº da Instalação"
  ```

### Fix D — Eliminar mensagens duplicadas

- Lock por `customer_id` em `runConversationalFlow` usando `webhook_message_dedup` (tabela já existe) com TTL 8s.
- Consumir `whatsapp_message_buffer` em batch de 1.5s antes de rodar o step (já existe a tabela, falta o consumidor).

### Fix E — Captura de nome com guarda

- No capture de `name`: se `name_source='ocr'` (veio da CNH/conta) → não sobrescreve.
- Se ainda não tem: aceita primeira resposta `^[A-Za-zÀ-ÿ ]{2,40}$`. Correções posteriores só se o cliente disser "meu nome é X".

### Fix F — Seguir o fluxo correto até o fim

Hoje o Flow Builder controla só até o documento. Depois vira código legado e fica fora da sua tela.

- Criar no `bot_flow_steps` os passos que faltam: `ask_email`, `ask_cep`, `ask_number`, `ask_complement`, `pitch_conexao_club`, `duvidas_pos_club`, `ask_finalizar`.
- Cada um com `step_type=message` + `captures` apontando pro campo correto em `customers`.
- No `bot-flow.ts`, marcar os blocos legados como deprecated — só rodam quando o consultor **não tem** flow ativo.
- Migration: leads atuais em `ask_email`, `ask_cep`, etc são re-mapeados para o `flow:<novo_step_id>` equivalente automaticamente na próxima mensagem.

Resultado: 100% do funil editável pela tela "Fluxo da Camila", sem texto hardcoded.

## Ordem de execução

1. **Fix B + Fix C** — corrige os 2 erros que o cliente viu na hora (~30 min)
2. **Fix A** — humaniza prompts de documento e confirmação (~20 min)
3. **Fix D** — estanca duplicação (~20 min)
4. **Fix E** — guard de nome (~15 min)
5. **Fix F** — migração dos steps pós-documento pro Flow Builder (~1h)

## Riscos

- Fix B pode aumentar latência em ~1s nos casos ambíguos (2ª passada do Gemini) — aceitável.
- Fix F vai exigir testar leads que já estão em `ask_email`/`ask_cep` no momento do deploy; o re-mapeamento é automático mas requer validação.
- Nenhuma mudança altera dados existentes; só código + 1 migration de steps novos.

Posso seguir nessa ordem?