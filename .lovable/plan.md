## Objetivo
Executar uma simulação ponta-a-ponta no `flow-simulate-run` contra o consultor superadmin (mesmo motor do WhatsApp real) usando imagens reais do MinIO, validar OCR e reportar onde o fluxo trava (se travar).

## Inputs reais encontrados
- **Conta de luz (MinIO, HTTP):** `https://igreen-minio.d9v63q.easypanel.host/igreen/documentos/124170_rafael/warmup_warmup_20260525/conta.png` ✅
- **CNH frente/verso:** não há URL HTTP no DB (só base64 inline em `document_front_url`). Vou usar uma das duas opções abaixo conforme você preferir — pergunto após plano se necessário, mas por padrão sigo com **(A)**:
  - **(A)** Reaproveitar a própria conta como "documento" só para destravar o passo `aguardando_doc_auto` (Gemini vai rodar OCR real, provavelmente retorna sem CPF/RG → fluxo deve cair em retry/handoff — isso já é um sinal útil).
  - **(B)** Você cola URL pública de uma CNH na próxima mensagem e eu repito o passo.

## Execução (sequencial via curl no edge `flow-simulate-run`)

Cada chamada usa o token de sessão do preview (você está logado como superadmin) e a flag `fresh:true` apenas no primeiro turno.

```text
T0  fresh=true,  user_message="oi"                          → welcome / pergunta nome
T1  user_message="Rafael Teste E2E"                         → confirma nome / pede conta
T2  attach={url: bill_url, kind:"image"}, msg="conta"       → OCR conta (Gemini real) → card revisão
T3  button_id da revisão "Confirmar"                        → avança para aguardando_doc_auto
T4  attach={url: doc_url, kind:"image"}, msg="cnh frente"   → OCR documento (Gemini real)
T5  button_id "Confirmar" do doc                            → avança para portal/OTP
T6  user_message="123456" (OTP mock)                        → portal_submitting → finalizando
```

Entre turnos eu leio:
- `events[]` retornado (textos/botões/mídia que o bot mandou)
- `customer_state` (conversation_step, distribuidora, valor, instalação, cpf, rg, etc.)
- `diagnostic.advanced` (true/false) + `webhook_err`
- Se travar: `bot_test_outbound` + `ai_slot_dispatch_log` + `conversations` do run para diagnóstico

## Entregável (chat)
Tabela por turno com:
- step antes → depois
- tempo de resposta
- eventos enviados pelo bot (resumidos)
- campos preenchidos no customer (ex.: `distribuidora=ENEL`, `electricity_bill_value=237.45`)
- ⚠️ erros (OCR vazio, capture_mode flip, handoff, etc.)

E no final um **veredito**: "✅ E2E completo até X" ou "❌ Travou em Y porque Z" + sugestão de correção.

## Observações técnicas
- Sandbox phone determinístico (`5500000xxxxxxx`) → não afeta lead real.
- `is_sandbox=true` faz portal/OTP/facial continuarem mock (sem disparar Worker real).
- OCR conta + OCR doc são **reais** (mocks já foram removidos no commit anterior).
- Vou rodar tudo no sandbox do consultor `0c2711ad-4836-41e6-afba-edd94f698ae3` (superadmin oficial).
- Nada de schema/code muda neste turno — só execução + leitura.

## O que precisa do build mode
- `supabase--curl_edge_functions` (7 chamadas)
- `supabase--read_query` entre cada turno

Aprovar pra eu rodar.
