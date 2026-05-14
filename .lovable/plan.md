## Problema

A mensagem que abre no WhatsApp quando o lead clica no anúncio está feia e longa demais:

> "Olá! Vi o anúncio iGreen sobre energia mais barata em CPFL. Quero saber como economizar na conta de luz."

É hardcoded em `supabase/functions/facebook-create-campaign/index.ts` (linha 430), não aparece em lugar nenhum no Wizard, e o usuário não consegue editar nem ver o que vai sair. Você quer algo curto, natural e do ponto de vista do lead, tipo:

> "Olá, quero saber mais sobre a redução de energia"

## Plano

### 1. Mensagem padrão nova (curta, do lead, contextual)

Trocar o template em `facebook-create-campaign/index.ts`:

```
Olá! Quero saber mais sobre a redução na conta de luz {distribuidora}.
```

- Se não houver distribuidora, cai para: `Olá! Quero saber mais sobre a redução na minha conta de luz.`
- Sem "Vi o anúncio…" (Meta já mostra o card do anúncio acima da mensagem).
- Limite rígido de 160 caracteres.

### 2. Campo editável no Wizard

Em `src/components/admin/ads/CreateCampaignWizard.tsx`, na aba de copy (logo abaixo do "Texto principal"):

- Novo input "Primeira mensagem no WhatsApp" com:
  - placeholder = mensagem padrão acima já preenchida com a distribuidora selecionada.
  - contador de caracteres (max 160).
  - preview do balão estilo WhatsApp (verde, fonte do app), mostrando exatamente o que o cliente vai ver ao clicar.
  - botão "Sugerir com IA" usando `ad-creative-builder` (reaproveita gateway) para gerar 3 variações curtas em 1ª pessoa.

State novo: `initialMessage` (string). Default recalculado quando muda a distribuidora.

### 3. Enviar e persistir

- Wizard envia `initial_message` no body do `facebook-create-campaign`.
- Edge function valida (≤160, não vazio, strip de quebras de linha) e usa em `waLink` (linha 432).
- Salva em `ad_campaigns.initial_message` para histórico/relatório (nova coluna `text` nullable, sem RLS nova — a tabela já tem).
- O `ad-creative-learner` passa a considerar `initial_message` como variável da performance (só guarda no `ad_creative_performance.metadata`, sem novo schema).

### 4. Garantir CTWA nativo (sem link quebrado)

Já está usando `WHATSAPP_MESSAGE` com `app_destination: "WHATSAPP"` e `page` da WABA — isso é o correto e não quebra. Vou só:

- Remover `description` do `link_data` quando o destino é WhatsApp (Meta ignora e às vezes mostra preview feio).
- Garantir `name` (headline) ≤ 40 chars no envio (já validado no Wizard).
- Logar no preflight a mensagem final que vai para o `text=` do `wa.me` para conferência.

### 5. Auto-aprendizado da mensagem

No painel "IA Aprendendo" (`AILearningHealthPanel.tsx`), adicionar bloco "Mensagens iniciais por CPL":
- Top 3 mensagens com menor CPL nas últimas 14 dias.
- Bottom 3 (as que pioram conversão).
- Lê de `ad_creative_performance` agrupando por `metadata->>initial_message`.

## Detalhes técnicos

- Migration: `ALTER TABLE public.ad_campaigns ADD COLUMN IF NOT EXISTS initial_message text;`
- Edge function: validação Zod do `initial_message` opcional, default server-side se vier vazio.
- Wizard: novo state, novo bloco UI, envio no payload, derivação automática quando muda a distribuidora se o usuário ainda não editou manualmente (flag `userTouchedMessage`).
- `ad-creative-builder`: aceitar `mode: "initial_message"` retornando array de 3 strings ≤160 chars em 1ª pessoa.

## Fora de escopo

- Não mexe em CTA, templates de WhatsApp internos, nem no fluxo do CRM depois que o lead chega.
