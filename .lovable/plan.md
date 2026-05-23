## Plano: Ícones de ajuda (?) em todo o /admin

Adicionar um componente reutilizável de ajuda que aparece como um pequeno ícone `(?)` cinza ao lado de cada função importante do painel. Comportamento duplo:

- **Hover (desktop)** → tooltip curto de 1 linha resumindo o que a função faz.
- **Clique (qualquer dispositivo)** → popover detalhado com título, descrição, exemplo de uso e dica.

### 1. Componente novo: `HelpHint`

`src/components/ui/help-hint.tsx`

- Wrapper sobre `Tooltip` + `Popover` do shadcn (já no projeto).
- Props: `title`, `summary` (linha curta), `details` (texto longo ou JSX), `example?` (opcional).
- Ícone `HelpCircle` da lucide-react, tamanho 12-14px, cor `text-muted-foreground hover:text-primary`.
- Mobile: tooltip não dispara, só o clique abre o popover.

### 2. Onde colocar (mapa completo)

**Captação (`/admin` → painel atual)**
- Título "Passos" → o que é o painel
- Botão ✈️ ao lado de cada passo → "envia esse passo isolado pro lead"
- Badge A/B/C → "variante do teste A/B/C que esse lead está recebendo"
- Filtro "Pendentes" → "mostra só passos que ainda não foram enviados"
- Aba "Ficha" → "dados que o bot já capturou desse lead"
- Barra de progresso "8/10 enviado" → "quantos passos do fluxo o lead já recebeu"

**Kanban (`/admin` → aba Kanban)**
- Título de cada coluna (Novo lead, Aguardando conta, etc) → o que significa cada estágio
- Botão "Pausar bot" no card → "para todas as mensagens automáticas pro lead"
- Indicador de "humano assumiu" → quando aparece

**Envio em massa (`/admin/envio-em-massa`)**
- Filtros de status → o que cada status inclui
- Multiselect de licenciadas → como combinar filtros
- Botão de origem (Leads WhatsApp / Clientes iGreen) → diferença entre os dois
- Botão "Enviar" → o que acontece (delay, ordem áudio→imagem→texto)

**Fluxos (`/admin/fluxos`)**
- Variantes A/B/C → o que diferencia cada uma
- Tipos de passo (message vs capture) → quando usar cada
- Campo `step_key` → o que é e quando precisa preencher
- Botão "Gerar texto (IA)" → como funciona o Gemini
- Mídias (áudio, imagem, vídeo) → ordem de envio garantida

### 3. Padrão de copy

- **Summary**: 5-10 palavras, ação direta. Ex: "Envia esse passo único para o lead".
- **Details**: 2-3 frases curtas explicando comportamento, efeitos colaterais e quando usar.
- **Example** (opcional): caso de uso real. Ex: "Use quando o lead pediu pra repetir o áudio".

### 4. Arquivos afetados

- **Novo**: `src/components/ui/help-hint.tsx`
- **Edits** (adicionar `<HelpHint />` ao lado dos elementos):
  - `src/components/captacao/CaptureStepsList.tsx`
  - `src/components/captacao/CaptureStepsGrid.tsx`
  - `src/components/captacao/CaptacaoPanel.tsx`
  - `src/components/whatsapp/BulkSendPanel.tsx` (ou equivalente em `src/components/whatsapp/`)
  - `src/components/admin/...` (Kanban e Fluxos — localizo no momento da implementação)

### 5. O que NÃO entra

- Tour guiado de primeira sessão (não foi escolhido).
- Mudar nada da lógica de envio/fluxo — só camada de ajuda.
- Tradução/i18n — texto direto em pt-BR.

### Detalhes técnicos

- Usa `@/components/ui/tooltip` e `@/components/ui/popover` já existentes.
- `useIsMobile()` para condicionar o tooltip (só desktop).
- Z-index do popover acima do drawer do lead.
- Aria-label correto para acessibilidade.
- Sem nova dependência.
