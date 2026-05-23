## Diagnóstico do que está acontecendo agora

Na screenshot do `/admin/fluxos` aparecem dois problemas reais:

**1. Letras brancas "sumidas" no preview do WhatsApp (direita)**
- `WhatsAppPreview.tsx` usa `<BotBubble>` com `bg-white text-foreground`.
- Em dark mode (tema atual), `--foreground` é **branco/quase-branco** → texto branco em bolha branca = ilegível (foi exatamente o que você viu no celular do preview).
- O footer "Mensagem" também usa `text-foreground/40` → mesmo problema.

**2. OCR existe no banco mas não no editor**
- A coluna `auto_detect_doc_type` já existe em `bot_flow_steps` e o backend (`_shared/ocr.ts`, `whapi-webhook`) já chama OCR nos passos `pedir_conta_luz` e `pedir_documento`.
- Mas o editor novo **não mostra nem deixa configurar** isso — não há badge "OCR ligado", nem switch, nem indicação visual de "este passo lê a imagem".
- Também **não existe passo intermediário** para o cliente confirmar/editar os dados extraídos (valor da conta, nome, CPF) antes de pedir e-mail e confirmar telefone.

## O que vou implementar

### A) Corrigir contraste do preview (cosmético, alta prioridade)

`src/components/admin/flow-builder/WhatsAppPreview.tsx`:
- Bot bubble: `bg-white text-[#111B21]` (cor fixa do WhatsApp, igual ao real), `text-[10px] text-black/45` no horário.
- User bubble (vou adicionar p/ botões clicados se houver): `bg-[#DCF8C6] text-[#111B21]`.
- Footer placeholder: `text-black/40`.
- Frame do celular: trocar `border-foreground/80 bg-foreground/80` por `border-zinc-900 bg-zinc-900` para não depender do token de tema.

Resultado: texto preto em fundo bege/branco como no WhatsApp real, legível em dark **e** light mode.

### B) Badge e toggle de OCR nos passos certos

`src/components/admin/flow-builder/StepCard.tsx` e `StepInspector.tsx`:
- Quando `step.captures` contém `electricity_bill_value`, `document_*`, ou `step_key` casa `pedir_conta` / `pedir_documento` / `aguardando_conta` / `aguardando_documento`: mostrar chip verde **"📷 OCR ativo — lê a imagem"** no card.
- No Inspector adicionar bloco **"Leitura automática (OCR)"** com:
  - Switch `auto_detect_doc_type` (já existe na coluna).
  - Texto explicativo: "Quando o cliente enviar a foto, o bot extrai automaticamente: valor da conta / nome / CPF / RG."
  - Lista dos campos que serão extraídos (lida de `captures`).

### C) Novo passo padrão "Confirmar dados extraídos"

Template novo em `flowTemplates.ts` chamado **"Confirmação pós-OCR"** que insere 3 passos após `pedir_documento`:

1. **`confirmar_dados`** — mensagem:
   > Consegui ler aqui, {{nome}}:
   > • Nome: {{nome_ocr}}
   > • CPF: {{cpf_ocr}}
   > • Valor da conta: R$ {{valor_conta}}
   >
   > Está tudo certo?

   Botões: `Sim, está certo` / `Não, editar` / `Falar com humano`.

2. **`pedir_email`** (transição do botão "Sim") — captura `email` com validação.
   > Show! Agora me passa seu **e-mail** para finalizar o cadastro.

3. **`confirmar_telefone`** — mensagem:
   > Esse mesmo número ({{telefone}}) é o seu WhatsApp para contato?
   
   Botões: `Sim, é esse` / `Quero editar`.
   Transição "editar" → passo `editar_telefone` que captura novo telefone.

Tudo isso é só **conteúdo de template** (linhas em `bot_flow_steps` via INSERT na ativação do template) — **não muda código de runtime**, o `whapi-webhook` já sabe processar `captures` e `transitions`.

### D) Validação visual no editor

`useFlowValidation.ts`: avisar (warning amarelo) quando existir passo `pedir_conta_luz`/`pedir_documento` sem um passo `confirmar_dados` logo depois → sugerir aplicar o template "Confirmação pós-OCR" com 1 clique.

## Resumo das mudanças

```text
src/components/admin/flow-builder/WhatsAppPreview.tsx   (cores fixas WhatsApp)
src/components/admin/flow-builder/StepCard.tsx          (chip OCR)
src/components/admin/flow-builder/StepInspector.tsx     (bloco OCR + switch)
src/components/admin/flow-builder/flowTemplates.ts      (template "Confirmação pós-OCR")
src/components/admin/flow-builder/useFlowValidation.ts  (warning "falta confirmação")
```

Sem migrations, sem mudar edge functions, sem mexer no router/whapi. Só frontend do editor + 1 template de conteúdo.

## Fluxo final que o cliente vai ver

```text
1. Pedir foto da conta de luz       (OCR → valor_conta, nome)
2. Pedir foto do documento (RG/CNH) (OCR → cpf, nome)
3. Confirmar dados                  [Sim] [Não, editar] [Falar humano]
4. Pedir email                      (captura email)
5. Confirmar telefone               [Sim, é esse] [Quero editar]
6. Finalizar cadastro
```
