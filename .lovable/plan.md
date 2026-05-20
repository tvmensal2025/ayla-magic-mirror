# Análise dos Fluxos A e B (Rafael Ferreiras)

## Status atual

**Consultor:** Rafael Ferreiras — `ab_test_enabled = false` ⚠️ (precisa ligar pra rodar A/B amanhã)

**Fluxo A** (com áudio): 10 passos, textos OK. Pronto.

**Fluxo B** (sem áudio): problemas encontrados:


| Pos | Título                          | Texto atual no B                                                               | Problema                      |
| --- | ------------------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| 3   | 2. Boas-vindas                  | "Eu vou estar explicando abaixo, mas hoje já somos mais de 700.000 pessoas..." | OK (substitui o áudio do A) ✅ |
| 5   | 4. Explica o desconto           | igual A                                                                        | OK ✅                          |
| 6   | 5. Pede permissão para explicar | **vazio**                                                                      | Falta texto                   |
| 7   | 6. Como funciona (áudio+vídeo)  | "Deu para entender como funciona agora? Vamos fazer seu cadastro?"             | **Texto trocado** com pos 8   |
| 8   | 7. Convite para o cadastro      | "É simples — vou te mandar um áudio e um vídeo curtos…"                        | **Texto trocado** com pos 7   |


Resumindo: no Fluxo B os passos 7 e 8 estão com os textos invertidos, e o passo 6 está sem texto. Como o B descarta áudios, esses passos hoje mandam mensagens fora de ordem (ou nada).

## O que vou fazer

1. **Trocar/corrigir textos do Fluxo B** (apenas `message_text`, sem mexer em mídias/ordem):
  - **Passo 6 "Pede permissão para explicar"**: preencher com versão em texto equivalente ao áudio do A, ex.:
    > "{{nome}}, posso te explicar rapidinho como funciona? Prometo ser direto. 💚"
  - **Passo 7 "Como funciona (áudio + vídeo)"**: substituir pelo texto explicativo que está hoje no passo 8 do B + complemento descritivo (já que no B não vai áudio), ex.:
    > "Olha como funciona na prática: a iGreen tem uma fazenda solar gigante que gera energia limpa e injeta direto na rede da sua distribuidora. Você continua recebendo a mesma conta de luz, só que com **até 20% de desconto** todo mês. Sem obra, sem instalação, sem mudar nada na sua casa."
  - **Passo 8 "Convite para o cadastro"**: colocar o convite que está hoje no passo 7 do B:
    > "Deu pra entender como funciona, {{nome}}? 😊
    > Vamos fazer seu cadastro? É rapidinho, só preciso de 2 coisas: foto da sua conta de luz e um documento com foto."
2. **Ligar A/B test do Rafael**: `UPDATE consultants SET ab_test_enabled = true WHERE name = 'Rafael Ferreiras'` para o round-robin começar a alternar entre A e B nos próximos leads dos anúncios.
3. **Confirmar com você os textos exatos antes de salvar** — você revisa os 3 textos sugeridos acima (passos 6, 7, 8) e ajusta se quiser tom diferente.

## Pontos do fluxo já 100% (sem ação)

- Captures (conta, documento, finalizar) — compartilhados, OK em A e B.
- Pergunta valor da conta e explicação do desconto — idênticos, OK.
- Boas-vindas do B substituindo o áudio do A — OK.
- Dispatchers já descartam áudios automaticamente no B (memória `ab-test-audio-vs-text`).
- CAPI + Pixel + wallet — já confirmados nas mensagens anteriores.

## Detalhe técnico

- Tabela: `bot_flow_steps`, filtrar por `flow_id = '477f8968-1344-4252-b822-8912fdbdb538'` (Fluxo B do Rafael).
- 3 `UPDATE` em `message_text` (passos position 6, 7, 8) + 1 `UPDATE` em `consultants.ab_test_enabled`.
- Migração via tool de migration do Supabase.
- Sem mudanças em código/edge function.

## Pergunta antes de implementar

quero texto do fluxo b mas quero que seja perfeito, quero que tenha o escrito.  
  
Todo o fluxo tem que funcionar do 1 ao 10.   
  
