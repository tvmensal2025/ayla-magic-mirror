# Plano

## 1) Erro ao salvar template

Pelo replay vi você digitando nome `dasd` e atalho só `/`. O atalho exige **`/` + 2 a 20 letras/números** (ex: `/oi`). Com apenas `/`, o botão "Salvar template" trava como desabilitado e nenhum salvamento acontece. Não vejo bug no insert em si (a coluna nova `is_quick_reply` tem default `true` no banco, então `INSERT` antigo continua válido).

Para destravar e melhorar a UX:

- **`SaveMessageAsTemplateDialog`**: mostrar mensagem clara em vermelho abaixo do atalho ("Atalho precisa ter pelo menos 2 caracteres após a /") e o motivo do botão estar desabilitado num tooltip (nome vazio, atalho inválido, mídia ainda não carregou).
- **Toast mais explícito** quando o erro vier do Supabase: incluir `error.code` e `error.details` para conseguirmos diagnosticar caso seja RLS/coluna.
- **Permitir salvar template só de texto** (hoje o dialog só salva se houver mídia carregada — `mt === "audio"|"video"|"image"`). Vou liberar `mt === "text"` salvando sem `media_url`, útil quando você quer salvar uma mensagem digitada.

Se mesmo com nome + atalho válidos o erro persistir, me mande **o texto exato do toast vermelho** que aparece — com os logs extras eu identifico em 1 passo.

## 2) Modo Game — composer com texto e áudio

Hoje o `GameShell` (lead selecionado) só mostra os 10 passos prontos. Vou adicionar **acima da ficha**, na coluna central, um composer estilo arcade:

```
┌─ Alvo: +55 31 9... ──────────── [Abrir conversa] ─┐
│  ⚔️ 10 passos · ataque rápido (já existe)          │
│  ──────────────────────────────────────────────    │
│  💬 [textarea com {{nome}} {{valor_conta}}]        │
│  [🎤 Gravar áudio]  [📎 Imagem]  [🚀 Enviar +5XP]  │
└────────────────────────────────────────────────────┘
```

Componente novo: `src/components/captacao/game/GameComposer.tsx`
- Textarea + botão **Enviar** → usa `sendTextMessage` de `src/lib/whatsapp/send.ts` (mesmo helper do chat).
- Botão **Gravar áudio** → reusa `useAudioRecorder` (mesmo que o WhatsApp chat usa) com waveform compacto; ao soltar, faz upload via `uploadMedia` (scope `chat`) e dispara áudio para o telefone do lead.
- Ao enviar texto/áudio com sucesso: `progress.registerXp(+5)` (texto) ou `+10` (áudio), toca `sfx.coin`, mostra `XpToast`, conta como missão "mensagem manual" e mantém combo.
- Erros: toast vermelho com motivo.

Mudanças em arquivos existentes:
- `src/components/captacao/CaptacaoPanel.tsx`: dentro do bloco `gameOn && selectedId`, renderizar `<GameComposer phone={phone} consultantId={consultantId} onSent={(kind)=>{...XP, sfx, missão}}/>` logo após o grid dos 10 passos.
- `src/components/captacao/game/useGameProgress.ts`: adicionar `registerMessage(kind: "text"|"audio")` retornando `{ gainedXp, leveledUp, newLevel }` (não muda contrato de `registerCapture`).
- `src/hooks/useAudioRecorder.ts`: reusar como está (já existe).

Fora de escopo:
- Não vou mexer no modo "clássico" (sem game) — composer aparece **só** quando `gameOn = true`.
- Sem mudar o fluxo do WhatsApp (continua usando o `messageSender` padrão).

## Arquivos

**Editar**
- `src/components/whatsapp/SaveMessageAsTemplateDialog.tsx`
- `src/components/captacao/CaptacaoPanel.tsx`
- `src/components/captacao/game/useGameProgress.ts`

**Criar**
- `src/components/captacao/game/GameComposer.tsx`
