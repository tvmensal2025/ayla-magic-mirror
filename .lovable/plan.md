# O que falta para ficar 100%

A página de Anúncios já está enxuta (sem telefone/nome, com `WalletChip` compacto, geração de IA removida e upload manual com selo + CTA). Faltam ajustes finais para considerar "pronto":

## 1. Validar o composite real (selo + CTA)
- Hoje aplicamos `CreativeOverlay` por cima do upload via `html2canvas`. Precisamos confirmar que:
  - A imagem final enviada ao Facebook tem o overlay aplicado (não apenas a preview).
  - Funciona nos 3 formatos (1:1, 4:5, 9:16) — atualmente só geramos no `feed_1x1`.
- Ação: testar 1 publicação real e checar a foto que aparece em `CampaignsList` / preview do Facebook.

## 2. Múltiplos formatos a partir de 1 upload
Hoje cada foto vira só `square`. Para anúncio "convertendo" precisamos enviar também `vertical (4:5)` e `story (9:16)` da mesma imagem, com auto-crop + overlay específico de cada formato. Reutilizar `CreativeOverlay` mudando `format`.

## 3. WalletChip → popup de recarga
O chip mostra saldo, mas o clique precisa abrir o popup de recarga Stripe (já existe em `CreateCampaignWizard`/wallet flows). Verificar se está conectado — caso não, plugar o handler.

## 4. Estado vazio da aba "Resultados"
Quando o consultor entra pela 1ª vez (sem campanha), em vez do dashboard vazio mostrar um CTA grande "Criar primeira campanha" → abre `CreateCampaignExpress`.

## 5. Limpeza de código morto
- `CreateCampaignWizard` ainda é montado no `AdsTab` mas só é aberto via "Modo avançado" do Express. Confirmar se mantemos ou removemos (usuário disse que prefere o modo fácil).
- Remover qualquer import/refs remanescentes ao gerador de IA (já deletado).

## 6. Headline dinâmica de verdade
Hoje a headline é fixa "Conta de luz até 20% mais barata em {distribuidora}". A IA do `generateCopy` já é chamada — ok. Mas o overlay usa a headline **antes** da IA rodar. Trocar para usar a headline final da IA na composição (mover `composeFinalFiles` para depois de `generateCopy`, o que já está feito ✅) — porém o `CreativeOverlay` recebe `headline` do estado preset, não o `finalHeadline`. Precisa passar a headline da IA para o overlay no momento da composição.

## 7. QA visual (mobile)
Viewport atual 1350px ok. Testar em 390px (mobile) — botões "Nova"/"Galeria" no header podem quebrar.

---

## Resumo priorizado

| # | Item | Esforço | Impacto |
|---|------|---------|---------|
| 1 | Confirmar composite real chega no FB | baixo | alto |
| 6 | Headline da IA no overlay | baixo | alto |
| 3 | WalletChip abre recarga | baixo | alto |
| 2 | Gerar 4:5 e 9:16 a partir do upload | médio | alto |
| 4 | Empty state Resultados | baixo | médio |
| 5 | Decidir destino do Wizard avançado | baixo | baixo |
| 7 | QA mobile do header | baixo | médio |

Quer que eu siga **todos os itens acima** numa só leva, ou prefere priorizar (ex.: só 1, 3, 6 que são os críticos para já publicar bem)?
