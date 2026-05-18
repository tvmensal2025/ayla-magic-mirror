## Diagnóstico

O caso do Donizete falhou no ponto certo identificado pelos logs: o OCR leu nome, RG e nascimento, mas retornou `cpf: ""`, mesmo com CPF visível no topo do documento. Por isso o bot caiu em `ask_cpf` e pediu o CPF manualmente.

Também encontrei textos no fluxo ativo dizendo ao cliente que “a IA reconhece automaticamente”, o que quebra a experiência de atendimento real. Isso deve virar uma mensagem natural, mantendo os botões e o fluxo visual como estão.

## Plano de correção

1. Reforçar o OCR para CPF no topo do documento
   - Ajustar o prompt de RG frente e verso para priorizar cabeçalho/topo/faixa superior antes de qualquer outro campo.
   - Instruir explicitamente que CPF no topo do RG antigo/novo deve ser extraído mesmo se o RG estiver em outra área.
   - Manter a regra de não inventar e validar matematicamente o CPF antes de salvar.

2. Criar segunda leitura automática quando faltar CPF
   - Se o OCR normal encontrar nome/RG/nascimento, mas não CPF, executar uma leitura focada apenas em CPF na mesma frente/verso.
   - Usar prompt menor e objetivo: “procure somente CPF no topo, laterais, campos CPF/Cadastro de Pessoa Física”.
   - Só aceitar CPF com 11 dígitos e dígitos verificadores válidos.

3. Evitar pedir CPF cedo demais
   - Em RG, antes de ir para `ask_cpf`, tentar a segunda leitura focada usando as imagens já enviadas.
   - Se ainda assim não encontrar, aí sim pedir CPF manualmente, sem perder nome/RG/nascimento.

4. Remover linguagem de “IA/reconhece automaticamente” para o cliente
   - Trocar mensagens como “eu reconheço automaticamente” e “A IA reconhece” por textos naturais de atendimento humano.
   - Manter botões e estrutura atual: o cliente continua enviando RG ou CNH sem escolher tipo técnico.
   - Não expor “RG novo/RG antigo” ao cliente no fluxo ativo.

5. Aplicar no webhook ativo e no espelho
   - Corrigir `whapi-webhook`, que é o webhook ativo.
   - Replicar a proteção essencial no `evolution-webhook` para manter consistência futura.

6. Validar com logs e caso Donizete
   - Verificar nos logs que, quando o CPF faltar na primeira leitura, aparece a segunda tentativa focada.
   - Resetar Donizete para reenviar documento se necessário, sem apagar os dados já corretos além do CPF/step.
   - Resultado esperado: para os próximos leads, o sistema só pede CPF manual se realmente não conseguir extrair/validar após duas leituras.