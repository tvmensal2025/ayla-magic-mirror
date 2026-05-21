# Plano

## 1) Modo Game 100% funcional (atalhos, templates, fluxos)

Hoje o `GameComposer` é minimalista (só texto + áudio). Vou **substituir** pelo `MessageComposer` completo (mesmo do chat) já gancheado pra ganhar XP:

- Em `CaptacaoPanel` (quando `gameOn && selectedId`), carregar `templates` via `useTemplates(consultantId)` e renderizar `<MessageComposer …/>` no lugar do `GameComposer` atual.
- Bindings:
  - `onSend(text)` → `sendWhatsAppMessage({mediaCategory:"text", phone, text, …})` + `progress.registerMessage("text")` + `sfx.coin` + `XpToast(+5)`.
  - `onSendAudio(base64)` → envia OGG + `registerMessage("audio")` + XpToast(+10).
  - `onSendAudioUrl(url)` → mesmo XP de áudio.
  - `onSendMedia(url, caption, mediaType)` → envia + XpToast(+8) ("imagem/vídeo/documento").
  - `templates` + `customerId`/`customerJid`/`customerName` passados pro composer → "/" abre `QuickReplyMenu`, atalhos `/oi` funcionam, anexar arquivo funciona, `FlowQuickBar` e `AiSuggestReplies` aparecem.
- Detalhe XP: subir nível dispara `LevelUpOverlay` igual aos passos.
- Remover o componente `GameComposer.tsx` (criado na turn anterior) — substituído pelo `MessageComposer`.

**Arquivos**:
- Editar `src/components/captacao/CaptacaoPanel.tsx`
- Apagar `src/components/captacao/game/GameComposer.tsx`

## 2) Mobile no Modo Game (viewport ≤ 768px)

Hoje o shell é `[lista | main | aside]` em flex-row — quebra em 390px. Vou tornar **responsivo**:

- **Mobile (`md:`-)**: layout em coluna única com 2 "telas":
  - Sem lead selecionado → só a `CaptureLeadList` (full width).
  - Com lead selecionado → header com botão **← Voltar** (limpa `selectedId`), depois grid de 10 passos, composer e (collapsible) ficha + achievements no fim. `CaptureLeadList` esconde.
- **Desktop (`md:`+)**: mantém o layout atual 3 colunas.
- `PlayerHud` e `QuestsBar` no topo viram chips menores no mobile (já dá com `text-xs` e flex-wrap).
- Header do painel: ícone-toggle do som vira `size="icon"` em mobile pra liberar espaço.

**Arquivos**:
- Editar `src/components/captacao/CaptacaoPanel.tsx`
- Editar `src/components/captacao/CaptureLeadList.tsx` (garantir `w-full md:w-72`)
- Editar `src/components/captacao/CaptureLeadCard.tsx` (já tem `embedded`, garantir bom encolhimento)

## 3) Ordem das mensagens (última = última)

Bug em `src/hooks/useMessages.ts:164`:

```ts
.sort((a, b) => (a.timestamp - b.timestamp) || (b.sourceIndex - a.sourceIndex))
```

O tiebreaker assume sempre que o feed bruto é "newest-first". Quando o Whapi/Evolution devolve mensagens **com o mesmo `messageTimestamp`** (resolução de 1 segundo, comum no envio sequencial áudio→imagem→texto), e o feed vem na ordem normal (oldest-first em alguns endpoints), a lista fica embaralhada — a última enviada aparece **antes** das anteriores.

Correção:

1. Detectar a direção do feed bruto: `descSource = raw[0].timestamp >= raw[raw.length-1].timestamp`.
2. Tiebreaker dinâmico:
   - feed `desc` (newest-first) → `b.sourceIndex - a.sourceIndex` (mantém atual).
   - feed `asc` (oldest-first) → `a.sourceIndex - b.sourceIndex`.
3. Otimização local: ao adicionar mensagem otimista (`setMessages(prev => [...prev, optimistic])` na linha ~338), usar `timestamp: Date.now() / 1000` (float, sem `floor`) — garante que a otimista sempre vença qualquer empate inteiro vindo do servidor.
4. Tiebreaker secundário por `id` lexicográfico quando `sourceIndex` empata — IDs do Whapi (BAE…) costumam ser monotônicos.

**Arquivo**:
- Editar `src/hooks/useMessages.ts`

## Out of scope

- Não vou mexer em fluxo do webhook nem em horários de delay entre disparos do bot.
- Não vou criar nova edge function; tudo no front.
