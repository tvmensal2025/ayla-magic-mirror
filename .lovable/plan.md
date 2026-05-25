## Diagnóstico

O sistema melhorou, mas ainda não está 100% garantido de ponta a ponta.

### O que melhorou

- A variante D está ativa e organizada em 8 passos principais: boas-vindas, pedir conta, explicação, resultado, pedir documento, dúvidas, handoff e finalizar cadastro.
- O `whapi-webhook` já tem proteções importantes:
  - não reseta mais o lead para o início em vários estados críticos;
  - aceita resposta numérica nos botões;
  - tem mocks no `testMode` para OCR, documento, portal, OTP e facial;
  - força o simulador a usar `capture_mode='auto'`, despausa bot e limpa dados no “Zerar”.
- O fluxo real tem tratamento de erro de OCR com tentativa, retry e possibilidade de pausar/chamar humano.
- O envio ao portal real continua protegido: fora do `testMode`, ele chama worker/portal, `submit-otp` e validações reais.

### O que ainda impede dizer “100%”

- O simulador ainda não é igual ao real: ele usa OCR mock, documento mock, OTP aceito automaticamente e link facial fake em `testMode`.
- O último `bot_test_run` encontrado do simulador teve só 1 evento, então não existe evidência gravada de um teste completo até OTP/facial/finalização.
- Os logs recentes não mostraram chamadas do `whapi-webhook`; só apareceram crons/rotinas, então não dá para confirmar produção real pelas últimas entradas disponíveis.
- Os fallbacks configurados no DB da variante D estão como `mode: goto`, mas o código de OCR só usa configuração customizada se o fallback for `mode: retry`. Na prática, o retry personalizado da variante D pode não estar sendo usado.
- `d_pedir_conta` aponta fallback para `d_resultado` e `d_pedir_documento` aponta fallback para `d_finalizar`; isso é perigoso se o motor V3 aplicar fallback por timer, porque pode avançar sem OCR/documento válido.
- O helper `resolveOcrFallback` busca o primeiro fluxo ativo do consultor sem filtrar `variant = D`, então pode pegar fallback de outra variante.
- O fluxo visual da variante D tem 8 passos, mas o cadastro real injeta etapas legadas obrigatórias quando faltam dados: CPF, e-mail, telefone, CEP/endereço, confirmação etc. Isso pode fazer o simulador parecer diferente do fluxo “desenhado”.

## Plano de correção

### 1. Corrigir fallbacks da variante D

Atualizar os passos de captura:

- `d_pedir_conta`:
  - trocar fallback de `goto d_resultado` para `retry`;
  - usar `retry_text` claro para pedir nova foto da fatura;
  - após 2 tentativas, enviar para humano sem avançar para resultado falso.

- `d_pedir_documento`:
  - trocar fallback de `goto d_finalizar` para `retry`;
  - usar `retry_text` claro para pedir RG/CNH nítido;
  - após 2 tentativas, enviar para humano sem submeter cadastro incompleto.

### 2. Fazer OCR fallback respeitar a variante correta

Ajustar `resolveOcrFallback` para buscar o fluxo ativo filtrando também por `customer.flow_variant`, principalmente `D`.

Resultado esperado: a variante D usa seus próprios textos/regras, sem herdar fallback da A/B/C.

### 3. Separar dois modos de teste

Criar distinção clara:

- `simulator_mock`: seguro, rápido, sem bater portal real;
- `simulator_real`: usa OCR real, portal real, OTP real e facial real, marcado como teste real.

Isso evita confusão entre “simulador visual” e “teste real completo”.

### 4. Garantir paridade do fluxo desenhado com o fluxo real

Quando a variante D chegar em `d_finalizar`, o backend deve:

- validar campos obrigatórios;
- se faltar algo, pedir o campo necessário;
- quando tudo estiver completo, submeter ao portal;
- aguardar OTP real;
- validar OTP;
- gerar/esperar facial;
- finalizar em `cadastro_em_analise`.

### 5. Criar regressão end-to-end

Adicionar teste automático cobrindo:

1. Zerar lead sandbox;
2. “oi”;
3. botão “Quero simular”;
4. enviar conta;
5. conferir resultado;
6. cadastrar;
7. enviar documento;
8. preencher dados faltantes;
9. submeter portal;
10. OTP;
11. facial;
12. finalizar em análise.

O teste deve falhar se repetir mensagem, travar em OCR, pular documento, ou avançar sem dados obrigatórios.

### 6. Validar com dados reais

Depois dos ajustes:

- rodar simulador mock para fluidez;
- rodar teste real controlado com fatura/documento reais;
- verificar logs do `whapi-webhook`, `submit-cadastro`, `submit-otp`, `start-facial` e worker portal;
- confirmar no DB que o lead terminou em `cadastro_em_analise` ou estado final esperado.

## Critério de sucesso

O sistema só pode ser considerado 100% quando:

- o fluxo D não avança sem conta válida;
- não avança sem documento válido;
- não chama portal com cadastro incompleto;
- OTP e facial funcionam no teste real;
- simulador mock e teste real seguem a mesma ordem de mensagens;
- existe teste automático completo passando;
- logs não mostram erro, loop, silêncio ou reset indevido.