## Diagnóstico

O caso do Donizete não travou por erro de imagem ou por tipo de RG. O OCR leu corretamente:

- Nome: `APARECIDO DONIZETE DE OLIVEIRA`
- RG: `59684750`
- Data de nascimento: `26/01/1973`
- CPF: não encontrado

Depois o cliente clicou “NÃO” e o fluxo foi para coleta manual de CPF. O problema real é que o sistema ainda mostra confirmação mesmo quando falta CPF, e isso confunde o cliente. Como CPF é obrigatório e precisa estar correto, o fluxo deve continuar automaticamente pedindo CPF em vez de perguntar se “está tudo correto” com CPF vazio.

## Plano de correção

1. Reforçar extração de CPF em RG novo e RG antigo
   - Ajustar o prompt do OCR para tratar RG antigo, RG novo/CIN e verso com mais precisão.
   - Instruir a IA a procurar CPF em áreas comuns do RG novo/CIN, QR/textos e campos “CPF”, “Cadastro de Pessoa Física”, “Registro Civil”, sem inventar número.
   - Manter validação matemática do CPF; CPF inválido continua sendo descartado.

2. Fazer o fluxo continuar quando OCR parcial for suficiente
   - Se OCR encontrar nome/RG/data, mas não CPF, salvar esses dados e ir direto para `ask_cpf`.
   - Não enviar tela de confirmação com `CPF: não encontrado`.
   - Mensagem sugerida: “Consegui ler nome, RG e nascimento. Só falta o CPF para continuar.”

3. Evitar erro/loop em RG novo e RG antigo
   - Se for RG/CIN e não encontrar CPF na frente, pedir verso quando aplicável.
   - Se mesmo com verso o CPF não vier, seguir para coleta manual de CPF sem reiniciar documento.
   - O cadastro não deve voltar para pedir a foto inteira quando o único campo ausente for CPF.

4. Melhorar confirmação de documento
   - Só mostrar “Confirme seus dados pessoais” quando o CPF estiver presente e válido.
   - Se algum campo obrigatório faltar, usar `getNextMissingStep` para perguntar apenas o que falta.
   - Preservar os dados já lidos do OCR para não perder nome, RG e nascimento.

5. Aplicar nos dois webhooks
   - Corrigir o fluxo ativo `whapi-webhook`.
   - Replicar o mesmo comportamento no espelho `evolution-webhook`, para manter os dois consistentes.

6. Validar com teste direcionado
   - Criar/rodar teste do helper de decisão para o cenário: OCR retorna nome + RG + nascimento, CPF vazio.
   - Resultado esperado: salva os campos encontrados e o próximo passo é `ask_cpf`, sem confirmação inválida.

## Arquivos envolvidos

- `supabase/functions/_shared/ocr.ts`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `supabase/functions/evolution-webhook/handlers/bot-flow.ts`
- Possível teste novo/ajustado em `supabase/functions/...`