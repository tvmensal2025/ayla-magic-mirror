# Plano — Simulador 100% Real até o Portal

## Objetivo

Quando você clicar "Simular" no `/admin/fluxos`, o sistema vai rodar **exatamente igual a um lead real**: OCR de verdade no Gemini, envio real ao Portal Worker, OTP real chegando no WhatsApp, link facial real do iGreen. Sem mock, sem atalho.

## O que muda

### 1. Remover `testMode` dos 3 pontos que ainda fingem

Hoje o simulador tem 3 atalhos que pulam serviços reais:


| Etapa         | Hoje (mock)                        | Vai virar (real)                                  |
| ------------- | ---------------------------------- | ------------------------------------------------- |
| OCR conta     | Retorna R$350 + distribuidora fake | Chama Gemini com a foto real que você mandou      |
| Portal submit | Marca `portal_submitting` e para   | Dispara `dispatchPortalWorker` → Playwright real  |
| OTP           | Aceita qualquer código             | Espera o código real chegar do WhatsApp do iGreen |
| Link facial   | Link fake                          | Link real que o portal devolve                    |


### 2. Toggle no FluxoBuilder

Botão **"Modo Real"** ao lado de "Simular":

- **OFF (padrão)**: roda mock rápido (10s, sem custo)
- **ON**: roda 100% real (60-90s, consome créditos Gemini + ocupa worker)

Quando ON, o simulador cria um `customer` real com seu telefone, marca `is_test_lead=true` pra não poluir métricas, e segue o fluxo normal.

### 3. Pré-requisitos validados antes de ligar Modo Real

Antes do botão habilitar, checa:

- ✅ `GEMINI_API_KEY` setado
- ✅ `PORTAL_WORKER_URL` + `WORKER_SECRET` setados e `/health` respondendo
- ✅ Instância WhatsApp do consultor conectada (pra OTP voltar)
- ✅ Seu telefone cadastrado no consultor (pra receber as mensagens)

Se faltar algo, mostra checklist vermelho explicando o que configurar.

### 4. Limpeza pós-teste

Botão **"Zerar teste real"** que:

- Deleta o customer de teste
- Remove arquivos do MinIO daquele teste
- Limpa `ai_decisions`, `customer_events` do teste

## Arquivos envolvidos (técnico)

- `supabase/functions/whapi-webhook/handlers/bot-flow.ts` — remover branches `if (testMode)` em OCR/portal/OTP
- `supabase/functions/_shared/ocr.ts` — sempre chamar Gemini
- `supabase/functions/_shared/portal-worker.ts` — já está real, só não ser bypassed
- `src/pages/FluxoBuilder.tsx` — adicionar toggle "Modo Real" + checklist
- `src/lib/flow-simulator/engine.ts` — passar `realMode: true` quando ligado
- Migration: `customers.is_test_lead boolean default false` + índice

## Critério de sucesso

Ligar Modo Real → mandar "oi" → "Quero simular" → enviar foto real da conta → Gemini extrai valor real → bot manda áudio → manda CNH real → portal abre no Worker → OTP chega no seu WhatsApp → você digita → link facial real chega → ✅.

## Riscos

- **Custo Gemini**: ~$0.01 por teste real
- **Worker ocupado**: trava fila de leads reais por 90s. Sugiro rodar fora do horário comercial OU criar fila separada `test_queue` no worker.
- **CPF/instalação duplicada**: se usar seus dados reais 2x, portal recusa. Solução: usar CPF/instalação diferentes a cada teste OU resetar no portal manualmente. Ireiusar nomes e pessoasdiferentes a cada teste

## Pergunta antes de implementar

Você quer que o teste real use:

- **(A)** Seus dados reais (seu CPF, sua conta) — mais fiel, mas portal vai recusar duplicata depois
- **(B)** Dados de um "lead de teste fixo" cadastrado no consultor — reutilizável, mas precisa configurar 1x
- **(C)** Dados aleatórios gerados (CPF válido fake) — portal vai recusar na validação Receita

APENAS TESTES REAIS   
  
ENTAO A   
