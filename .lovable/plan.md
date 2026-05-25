## Problemas identificados

**1. Barra minimizada da Captação tampa o composer do WhatsApp**

`src/components/captacao/CaptureSheet.tsx` (linha 265) renderiza:
```
fixed bottom-0 left-0 right-0 z-50 h-11 ...
```
Quando o modo Captação está ativo e minimizado, essa barra de 44 px fica fixa no rodapé da janela inteira, por cima do `MessageComposer` do `ChatView`. Resultado: você não enxerga o textarea nem o botão de enviar.

**2. Botão ⚡ (FlowQuickBar) fica cinza em alguns leads (ex.: 11971254913)**

Em `src/components/whatsapp/FlowQuickBar.tsx:229` o botão é desabilitado por `!customerId`. O `customerId` vem de `ChatView.tsx:164-204`, que busca em `customers` por `phone_whatsapp = chat.remoteJid.split("@")[0]`. Como esse phone pode estar gravado com/sem DDI 55 (ex.: `5511971254913` vs `11971254913`), o lookup falha, a criação automática às vezes também falha (RLS/duplicidade), e o botão fica cinza.

## O que vou fazer (apenas frontend, sem mexer em backend/CRM)

### A) Composer nunca mais é coberto pela Captação

- No `ChatView` (e/ou no contêiner do WhatsApp em `Admin.tsx`) aplicar `paddingBottom` dinâmico igual à altura da barra de Captação quando ela estiver visível e minimizada (`h-11` + safe-area).
  - Sinal: ler o mesmo flag que já controla `open && minimized` (expor via contexto leve de Captação ou via um data-attribute no `<body>` que o `CaptureSheet` já pode setar). Implementação simples: o `CaptureSheet`, ao montar a barra minimizada, marca `document.body.dataset.captacaoBarOpen = "1"`; o layout do WhatsApp aplica `pb-12` quando esse atributo existe.
- Alternativa para mobile: reduzir `z-index` da barra para abaixo do composer **ou** mover a barra para `bottom: var(--composer-height)` quando o WhatsApp estiver aberto. Vou seguir com a abordagem do padding (mais previsível).

### B) Botão ⚡ sempre aceso para qualquer lead

Em `ChatView.tsx` ajustar a resolução de `customerId`:

1. Criar helper `normalizeBrPhone(jidOrPhone)` que retorna lista de candidatos: `["5511971254913", "11971254913"]` (com e sem 55).
2. Trocar `.eq("phone_whatsapp", phone)` por `.in("phone_whatsapp", candidates)` no lookup inicial.
3. Se ainda não achar, antes de inserir, fazer um `select` final por `like '%últimos9dígitos%'` (mesma lógica usada em outros pontos), para evitar duplicar contato.
4. Padronizar o `phone_whatsapp` no insert para o formato com DDI 55 (já existente em outros pontos).
5. No `FlowQuickBar`, manter `!customerId` apenas como gate técnico real (não muda nada visual extra), mas ajustar o `title` para "Carregando lead…" quando o `ChatView` ainda está resolvendo, deixando claro que é transitório (e não "desligado").

### Arquivos afetados

- `src/components/captacao/CaptureSheet.tsx` — marcar/remover `data-captacao-bar` no body.
- `src/components/whatsapp/ChatView.tsx` — padding dinâmico do container do chat + lookup robusto de customerId.
- `src/components/whatsapp/FlowQuickBar.tsx` — pequeno ajuste de `title` (opcional, só pra UX).
- (sem migrações, sem mudanças de backend).

## Validação

- Abrir WhatsApp com Captação minimizada e confirmar que o composer fica visível e clicável em desktop e mobile.
- Abrir conversa do `11971254913` e confirmar que o ⚡ acende em poucos segundos, com `customerId` resolvido sem duplicar registro em `customers`.
- Repetir com 2-3 leads novos (sem cadastro) para garantir que o auto-create ainda funciona.
