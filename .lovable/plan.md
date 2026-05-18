## Objetivo

Melhorar a UX do cadastro: mensagem de e-mail mais curta e bonita, passo de complemento com 3 botões e descrição clara, e OCR do documento (RG/CNH, novo ou antigo) mais robusto — fazendo múltiplas passadas para nunca errar nome, CPF, RG e nascimento.

## 1. Pergunta de e-mail mais curta e bonita

Arquivo: `supabase/functions/_shared/conversation-helpers.ts` (linha 114)
Arquivo: `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linhas 355, 3628, 3633, 3637, 3648, 3659)

- Trocar o texto longo atual por uma mensagem curta, com hierarquia visual limpa. Exemplo:
  - `📧 *Seu e-mail*\n_O portal envia um código por ele._\n\nPode ser qualquer e-mail seu (Gmail, Outlook, iCloud, do trabalho…).`
- Manter as validações (formato, placeholder, e-mail do consultor) mas com mensagens curtas (1–2 linhas), sem repetição de explicações.
- Centralizar o texto base no `getReplyForStep` e remover duplicações em `bot-flow.ts`.

## 2. Passo de complemento com 3 botões + descrição

Arquivo: `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (linhas 3695–3727 e callsite em 4182–4191)

- Substituir o atual `sendOptions` de 2 botões por 3 botões padronizados, com uma descrição curta acima:
  - Texto: `🏠 *Tem complemento no endereço?*\n_Apto, bloco, casa, fundos, etc._`
  - Botões:
    1. `add_complement` → "✍️ Adicionar"
    2. `skip_complement` → "⏭️ Pular"
    3. `no_complement` → "🚫 Não tem"
- Tratar `no_complement` igual a `skip_complement` (salva `address_complement = ""`), mas mantendo o id próprio para telemetria.
- Garantir que sempre que o passo ficar ativo (entrada, reentrada e callsite no fim do handler) os 3 botões sejam enviados, nunca só texto.
- Atualizar `getReplyForStep("ask_complement")` para o mesmo texto curto + descrição (fallback quando botões não renderizam).

## 3. OCR do documento mais robusto (RG/CNH, novo e antigo)

Arquivo: `supabase/functions/_shared/ocr.ts`

Hoje só o CPF tem segunda passada focada (`ocrCpfFocado`). Vamos generalizar para garantir que todos os campos críticos sejam encontrados, mesmo em RG antigo, RG novo (CIN), CNH nova e CNH antiga.

- Criar funções focadas adicionais (mesmo padrão de `ocrCpfFocado`, prompts cirúrgicos):
  - `ocrRgFocado` — procura o número do Registro Geral, tratando RG antigo (verso, vermelho) vs CIN (frente).
  - `ocrNascimentoFocado` — procura a data de nascimento, distinguindo das outras datas (emissão/validade na CNH).
  - `ocrNomeFocado` — procura o nome completo do titular (e descarta nome do pai/mãe).
- Em `ocrDocumentoFrenteVerso`, depois da consolidação atual, rodar um *retry loop* (até 2 passadas extras) para qualquer campo crítico ainda vazio ou de baixa confiança, alternando frente/verso quando aplicável:
  - se faltar `cpf` → `ocrCpfFocado` (já existe) na frente e depois no verso.
  - se faltar `rg`  → `ocrRgFocado` no verso (RG antigo) e depois na frente (CIN/CNH).
  - se faltar `nome` ou nome inválido → `ocrNomeFocado` na frente.
  - se faltar `dataNascimento` ou ano implausível → `ocrNascimentoFocado` na frente.
- Atualizar `confianca` final para refletir o resultado pós-retry e logar quais campos foram recuperados em qual passada.
- Continuar respeitando os validadores (`normalizarRG`, `validarCPFDigitos`, `validarDataNascimento`, `validarNomeOCR`) — nada entra sem validação.

## 4. Validação

- `bot-flow`: testar fluxo no preview, conferir que:
  - mensagem de e-mail aparece curta e legível.
  - passo de complemento mostra os 3 botões (Adicionar / Pular / Não tem) com a descrição.
- `ocr.ts`: rodar OCR com imagens já conhecidas (Donizete, casos anteriores de RG antigo/novo e CNH) e confirmar nos logs que os retries focados disparam quando algum campo falta e que o `confianca` final sobe.
- Deploy: `whapi-webhook` (edge function).

## Arquivos afetados

- `supabase/functions/_shared/conversation-helpers.ts`
- `supabase/functions/whapi-webhook/handlers/bot-flow.ts`
- `supabase/functions/_shared/ocr.ts`
