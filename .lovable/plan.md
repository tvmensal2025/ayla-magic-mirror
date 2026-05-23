## Problema

Cliente 11971254913 clicou "Como funciona" 5x hoje. Áudio + vídeo só foram registrados como enviados às 14:46 (em `ai_slot_dispatch_log`). Nas tentativas seguintes (14:35, 14:25, 17:19…), o RPC `try_log_media_send` retornou `false` por causa do `ON CONFLICT (customer_id, media_id) DO NOTHING` — bloqueando para sempre o reenvio da mesma mídia ao mesmo lead. Resultado: o lead só recebeu o texto, sem o vídeo/áudio.

## Solução

Permitir reenvio da mesma mídia se passaram **≥ 10 minutos** do último envio bem-sucedido. Dentro de 10min, continua bloqueando (anti-duplo-clique / anti-loop).

### Mudança 1 — função `try_log_media_send` (migration)

Substituir a lógica `ON CONFLICT DO NOTHING` por:

```sql
-- Procura último envio dessa (customer, media). Se for > 10min atrás, registra novo e libera.
-- Se for recente, retorna false (bloqueia).
SELECT sent_at INTO _last_sent
  FROM ai_slot_dispatch_log
 WHERE customer_id = _customer_id AND media_id = _media_id
 ORDER BY sent_at DESC LIMIT 1;

IF _last_sent IS NOT NULL AND _last_sent > now() - interval '10 minutes' THEN
  RETURN false;
END IF;

INSERT INTO ai_slot_dispatch_log (...) VALUES (...);
RETURN true;
```

Remover o índice/constraint único `(customer_id, media_id)` se existir (vira histórico de envios, não única).

### Mudança 2 — verificar constraint

Antes da migration, checar se há `UNIQUE(customer_id, media_id) WHERE media_id IS NOT NULL` em `ai_slot_dispatch_log`. Se houver, dropar (vai virar histórico, múltiplas linhas permitidas).

## Escopo

- **Não muda** o código dos webhooks (`whapi-webhook`, `evolution-webhook`, `manual-step-send`, `bot-flow.ts`, `_shared/media-dedupe.ts`). Todos eles já chamam o RPC — só a lógica interna do RPC muda.
- **Vale para todos os fluxos e todos os consultores** automaticamente, porque é uma única função no banco.
- Ordem do passo (`text → audio → video → image` ou configurada em `flow_step_media_order`) já é respeitada pelo código atual; não muda nada.

## Teste pós-deploy

1. Cliente clica "Como funciona" → recebe texto + áudio + vídeo + imagem.
2. Clica de novo em <10min → recebe só o texto (bloqueado, anti-spam).
3. Clica de novo após 10min → recebe tudo de novo.
