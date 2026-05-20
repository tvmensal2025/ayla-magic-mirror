## Problema

1. **Botão "Desconectar"** está visível na barra de status do WhatsApp (canto direito) — o consultor pode clicar sem querer e derrubar a conexão.
2. **Sheet de Captação em meia-tela** ainda cobre boa parte da conversa do WhatsApp. O header é alto (avatar 36px + 3 botões + barra de progresso + 3 linhas de texto), sobra pouco espaço pra ver e escrever no chat.

## Mudanças

### 1. Esconder "Desconectar" do consultor — `src/components/whatsapp/WhatsAppTab.tsx`

Linhas 174-179: remover o `<button>` "Desconectar". Quando conectado, mantém só o pill verde "WhatsApp Conectado (instância)". Desconexão continua disponível dentro do `ConnectionPanel` (aba de configuração avançada), fora do fluxo diário.

### 2. Visual mais leve da Sheet em meia-tela — `src/components/captacao/CaptureSheet.tsx`

**Altura menor por padrão (mobile):**
- meia-tela: `h-[52dvh] min-h-[380px]` (era 62dvh/420px) → libera ~10% a mais de chat visível.

**Header enxuto (quando NÃO expandido):**
- Avatar 36→28px, ícone menor.
- Esconder a linha "🎯 Próximo: ..." e "Passo X de 10" no modo meia-tela (mostrar só no expandido). Mantém a frase motivacional curta + barra de progresso.
- Agrupar os 3 botões (⛶ / ⌄ / ✕) num único cluster compacto à direita, altura 8 (era 9).
- Reduzir `pt-3 pb-2` → `pt-2 pb-1.5`.

**"Pegador" (grabber) no topo:**
- Adicionar barrinha cinza centralizada (`w-10 h-1 rounded-full bg-muted`) acima do header pra indicar arrasto/sheet, padrão iOS/Android — fica mais elegante.

**Borda superior brilhante:**
- Trocar `border-t border-border` por gradiente sutil verde (`shadow-[0_-8px_24px_-12px_hsl(var(--primary)/0.4)]`) pra dar profundidade sem peso visual.

**Footer mais compacto em meia-tela:**
- Botão FINALIZAR: `h-12 → h-11`, esconder a linha "X campos · Y passos" quando não-expandido (já tem no header).

### 3. Sem mudanças

- Lógica de envio de passos, OCR, modo expandido (continua com header completo).
- Desktop não muda.

## Validação

1. Mobile 390x844: botão "Desconectar" sumiu da barra do topo do WhatsApp.
2. Sheet abre em ~52dvh, mostra ~3-4 mensagens do chat + input do WhatsApp acima.
3. Pegador cinza visível no topo, header compacto, footer enxuto.
4. Botão ⛶ expande pra tela cheia mostrando header completo (próximo campo, contagem de passos).
5. Funciona em 320x568 e 360x800 sem cortar o "FINALIZAR".
