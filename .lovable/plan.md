# Manter Avançado + Galeria como fluxo principal

Entendi. Inverter o que fizemos: o **Modo Fácil** (`CreateCampaignExpress`) sai, fica o **Wizard avançado** + **Galeria de modelos** (campanhas pré-prontas que o consultor publica em 1 clique).

## A boa notícia

A funcionalidade que você descreveu — *"campanha salva, novo usuário clica e publica, busca telefone/nome dele e já vai sem dificuldade"* — **já existe**: é o `UseTemplateDialog` chamado pela `AdTemplatesGallery`.

Hoje ele já:
- ✅ Puxa o `name` do consultor da tabela `consultants` para preencher `{nome_consultor}`.
- ✅ Usa o WhatsApp já conectado em **Dados** (Facebook envia leads direto pra lá — não precisa de telefone na tela).
- ✅ Pede só: distribuidora + cidade → "Publicar agora".

Ou seja: o fluxo "1 clique pra publicar" **já está pronto**. Só precisamos torná-lo o caminho principal.

## O que vou mudar

### 1. Remover o Modo Fácil
- Deletar `src/components/admin/ads/CreateCampaignExpress.tsx`.
- Em `AdsTab.tsx`: remover `import`, `expressOpen`, `prefillImageUrl`, `openExpressWithCreative` e o `<CreateCampaignExpress>` montado.
- Botão **"Nova"** passa a abrir o **Wizard** (avançado).
- Empty-state da aba Resultados passa a ter **dois** CTAs: **"Ver modelos prontos"** (Galeria — recomendado) e **"Criar do zero"** (Wizard).

### 2. Reordenar as tabs (Galeria primeiro)
A ordem fica: **Modelos → Resultados → Campanhas → Inteligência**. O view padrão do consultor que entra pela primeira vez vira **Modelos**, para ele já cair no fluxo 1-clique.

### 3. (Opcional, recomendo) Reforçar o auto-fill no template
Hoje `UseTemplateDialog` já busca `consultants.name`. Posso adicionar um banner discreto no topo do dialog: *"Anúncio em nome de **{nome}** • leads chegam no WhatsApp **{numero conectado}**"* — para o consultor ver que está tudo automático.

## O que NÃO vou tocar

- ✅ Wizard avançado (`CreateCampaignWizard.tsx`) — fica intacto.
- ✅ Galeria, templates, edge functions, banco — nenhuma mudança.
- ✅ Dashboard de Resultados, Campanhas, Inteligência, WalletChip.

## Risco

Zero risco operacional. Só remove uma porta de entrada (Express) que era opcional. As outras duas (Wizard e Galeria) continuam funcionando do mesmo jeito.

Posso aplicar?
