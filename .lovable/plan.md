## Problema

O campo "Aguardar antes de enviar" (`delay_before_ms`) e a ordem configurada não estão sendo respeitados como o usuário espera. Analisei `supabase/functions/whapi-webhook/handlers/conversational/index.ts`:

**Bug 1 — Delay aplicado DEPOIS, não ANTES:**
Na linha 409, o loop faz:
```ts
await sender.sendMedia(...);                          // envia a mídia
// ...registra envio...
if (i < medias.length - 1)
  await sleepForMedia(kind, duration, m.delay_before_ms);  // ❌ usa o delay da mídia ATUAL como pausa depois dela
```
Ou seja, ao mandar o **áudio (delay 1,5s)** seguido do **vídeo (delay 2,4s)**:
- Manda áudio imediatamente
- Espera **1,5s** (delay do áudio, usado como pós-pausa)
- Manda vídeo imediatamente
- Loop termina — **os 2,4s do vídeo são ignorados** (porque é a última mídia e o `if` corta)

A semântica do campo "Aguardar **antes** de enviar" exige esperar o `delay_before_ms` da PRÓXIMA mídia, antes do `sendMedia` dela.

**Bug 2 — Delay da primeira mídia nunca aplicado:**
Não há `await` antes do primeiro `sendMedia` do loop. Se o consultor configura "espera 1,5s antes do primeiro áudio", isso é ignorado.

**Bug 3 — Cap em 5000ms:** `Math.min(configuredDelay, 5_000)` limita o delay a 5s. 1,5s e 2,4s passam, mas vale documentar.

**Ordem:** está correta. O loop carrega mídias por `send_order ASC` (vídeo=100 vem antes de áudio=101), mas depois aplica `flow_step_media_order` configurado (`como_funciona = [audio, video, text, image]`), então áudio sai primeiro. ✅

## Solução

Reescrever o loop em `sendStepMedia` (linhas ~358–410) para aplicar o delay **antes** de cada envio, usando o `delay_before_ms` da própria mídia que está prestes a sair:

```ts
for (let i = 0; i < medias.length; i++) {
  const m = medias[i];
  const kind = ...;

  // dedupe check (igual)
  if (já entregue) continue;

  // ⏱️ ESPERA ANTES DE ENVIAR — respeita delay_before_ms desta mídia
  const configuredDelay = Number(m.delay_before_ms || 0);
  if (configuredDelay > 0 && !isTestMode()) {
    await sleep(Math.min(configuredDelay, 10_000));   // cap subido para 10s
  } else if (i > 0 && !isTestMode()) {
    // sem delay configurado → mantém pausa curta entre mídias consecutivas
    await sleep(kind === "audio" ? 1500 : kind === "video" ? 2000 : 800);
  }

  // envia + dedupe + log (igual)
  const ok = await sender.sendMedia(...);
  ...
}
```

E remover (ou simplificar) `sleepForMedia` — não é mais usado dentro do loop.

### Verificação

1. Editar o arquivo (mudança contida em um único bloco).
2. Resetar `conversation_step` do Rafael (5511971254913) — você ainda precisa aprovar a migration anterior que ficou pendurada.
3. Mandar "Oi" via WhatsApp.
4. Conferir nos logs da `whapi-webhook` a sequência de timestamps:
   - `t0`: chega o "Oi"
   - cascade até `como_funciona`
   - `t1` (= t0 + ~1,5s): log "📤 sendMedia audio"
   - `t2` (= t1 + ~2,4s): log "📤 sendMedia video"

## Fora do escopo

- Não vou mexer na ordem `flow_step_media_order` (já está OK).
- Não vou alterar o cap (subo de 5s para 10s só para acomodar configs maiores, mas mantenho um teto para evitar timeout da Edge Function).
- A migration de reset do `conversation_step` permanece pendente da sua aprovação anterior.
