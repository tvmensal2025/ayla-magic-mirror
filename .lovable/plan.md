## Problemas confirmados

**1. Detecção do documento (RG antigo / RG novo / CNH) está errando**
- Em `supabase/functions/_shared/detect-doc-type.ts` o bot usa Gemini com prompt simples e modelo `gemini-2.0-flash-exp`. Quando a foto está torta, com reflexo ou cortada, ele classifica errado e às vezes pede verso de CNH (que não tem) ou trata RG novo como antigo.
- Em `bot-flow.ts` (linhas 2058–2061) o bot escreve ao cliente "✅ RG (Novo) identificado!" / "✅ RG (Antigo) identificado!". Você não quer que essa distinção apareça pro cliente — ela só serve internamente pra decidir se pede verso.

**2. Bot pulou a conta de energia**
- No "Fluxo da Camila" o passo 6 ("Deu para entender?") tem `fallback.goto_step_id` apontando direto pro passo 8 ("Cadastro"), pulando o passo 7 ("Conta de energia", `capture_conta`).
- Resultado: depois do "Deu pra entender?" o bot foi direto pra nome → telefone → e-mail → CEP (que é o pipeline do `capture_documento`), sem pedir a foto da conta. Depois ele volta a pedir a conta no meio do cadastro, dando a sensação de "ficou pedindo de novo".

---

## Plano

### 1. Treinamento de detecção de documento (sem expor "novo/antigo" ao cliente)

Arquivo: `supabase/functions/_shared/detect-doc-type.ts`

- Trocar modelo para `gemini-2.5-flash` (mais estável que o `2.0-flash-exp`) com fallback pro `2.5-pro` quando a confiança vier baixa.
- Reescrever os prompts com checklist mais rico e exemplos de sinais visuais:
  - **CNH**: faixa "REPÚBLICA FEDERATIVA DO BRASIL — CARTEIRA NACIONAL DE HABILITAÇÃO", campo "CATEGORIA / CAT. HAB.", "VALIDADE", "1ª HABILITAÇÃO", QR Code no verso, foto + assinatura no mesmo lado, layout horizontal cinza/azulado.
  - **RG novo (CIN)**: "CARTEIRA DE IDENTIDADE NACIONAL", QR Code grande, CPF impresso no rosto, layout horizontal em policarbonato (parece cartão de banco), brasão colorido.
  - **RG antigo**: "CARTEIRA DE IDENTIDADE" / "REGISTRO GERAL", papel laminado com bordas amareladas/manchadas, foto preto-e-branco, "SSP/UF" em destaque, normalmente vertical.
- Pedir resposta `{tipo, confianca, sinais:[...]}` e logar os sinais quando confiança ≥ 0.8 (ajuda debug).
- Thresholds: pass1 ≥ 0.80 aceita direto; entre 0.50 e 0.80 dispara pass2 com `gemini-2.5-pro`; abaixo disso roda pass3 com prompt "quando em dúvida, prefira RG_NOVO se enxergar QR code grande + CPF impresso, caso contrário RG_ANTIGO".
- Pré-rotação: quando a imagem chegar deitada (EXIF/heurística simples por aspect ratio), incluir aviso no prompt ("a foto pode estar rotacionada 90° ou 180°") em vez de devolver erro.
- Cache curto: salvar `document_type_confidence` e `document_type_source` em `customers` (campos novos) pra auditoria sem expor pro cliente.

### 2. Mensagens ao cliente sem "RG novo/antigo"

Arquivo: `supabase/functions/whapi-webhook/handlers/bot-flow.ts`

- Linha 2058–2061: trocar as três variantes por mensagem única e neutra:
  - CNH detectada → "✅ Documento recebido! ⏳ Analisando os dados..." (sem pedir verso).
  - RG (qualquer geração) → "✅ Documento recebido! ⏳ Analisando a frente...\n\nDepois vou te pedir o *verso*."
- Linhas 2132–2134 (`aguardando_doc_frente`) e demais cópias: substituir `friendlyLabel(...)` por "documento" quando for falar com o cliente. O `friendlyLabel` continua existindo, mas só pra log/portal.
- Procurar todas as ocorrências de "RG (Novo)" / "RG (Antigo)" / `friendlyLabel(` em mensagens de WhatsApp e padronizar para "documento" / "RG" / "CNH" sem geração.

### 3. Impedir o salto da conta de energia

- Corrigir o fluxo em banco: passo 6 ("Deu para entender?") precisa ter `fallback.goto_step_id` apontando pro passo 7 ("Conta de energia"), não pro passo 8.
- Aplicar via `supabase--migration` um `UPDATE bot_flow_steps SET fallback = jsonb_set(fallback, '{goto_step_id}', to_jsonb('<id_do_passo_7>'::text)) WHERE id = '<id_do_passo_6>'` restrito ao flow do consultor `0c2711ad-…`.
- Adicionar guarda no motor (`supabase/functions/whapi-webhook/handlers/conversational/index.ts`): antes de pular pra um `capture_documento`, verificar se existe um `capture_conta` ativo posterior ao passo atual e ainda não satisfeito (`customers.bill_value` vazio ou `document_front_url` vazio do tipo "bill"); se houver, redirecionar pra esse `capture_conta` em vez de avançar. Isso protege contra fluxos futuros mal configurados.
- Quando o cliente cair em `capture_documento` sem ter a conta capturada, marcar `conversation_step = 'aguardando_conta'` e enviar "Antes do cadastro preciso da *foto ou PDF da sua conta de luz* 📸" — em vez de pedir CEP/e-mail.

### 4. Validação

- Rodar `supabase--read_query` depois da migration pra confirmar o `fallback.goto_step_id` corrigido.
- Testar manualmente no fluxo da Camila: avançar até "Deu pra entender?" → responder "sim" → confirmar que o próximo prompt é a conta de luz, não o nome/CEP.
- Subir uma foto de CNH, uma de RG novo (CIN com QR) e uma de RG antigo no WhatsApp e conferir nos logs do edge function que `detectDocumentTypeDetailed` retornou o tipo certo com `confianca ≥ 0.8` e que o cliente recebeu só "Documento recebido!".

---

## Detalhes técnicos

- Arquivos editados:
  - `supabase/functions/_shared/detect-doc-type.ts` (modelo, prompts, thresholds, retorno enriquecido).
  - `supabase/functions/whapi-webhook/handlers/bot-flow.ts` (mensagens neutras ao cliente, guarda anti-skip da conta).
  - `supabase/functions/whapi-webhook/handlers/conversational/index.ts` (checagem de `capture_conta` pendente antes de avançar pra `capture_documento`).
- Migração:
  - Corrigir `fallback.goto_step_id` do passo "Deu para entender?" do Fluxo da Camila.
  - Opcional: adicionar colunas `document_type_confidence numeric`, `document_type_source text` em `customers`.
- Deploy: `whapi-webhook` (precisa redeploy após editar funções compartilhadas).
- Sem mudança de UI/admin: a tela `/admin/fluxos` continua mostrando "Conta de energia" como passo 7; a correção do fallback faz o motor respeitar essa ordem.
