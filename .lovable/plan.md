# Ajustar Passo 6 do Fluxo D — somente IA (sem áudio/vídeo)

## Diagnóstico
Investiguei o passo 6 do **Fluxo D** (`Fluxo Whapi (botões)` — id `320bf22c-...02558`):

| Campo | Valor atual | Problema |
|---|---|---|
| `step_key` | `d_duvidas` | OK |
| `slot_key` | `como_funciona` | Faz o editor exibir áudios/vídeos reutilizados do "Como funciona" |
| `media_order` | `[audio, image, video, text]` | Lista mídia para envio |
| `step_type` | `message` | OK |

**Backend já está correto**: o handler em `whapi-webhook/handlers/bot-flow.ts` (linhas 904-998) detecta `step_key` contendo "duvid" e responde **apenas texto via Gemini 3.1 Pro**, com guard absoluto contra mídia mesmo se a IA falhar.

**Problema real**: o **editor `/admin/fluxos` exibe** áudios e vídeos no passo 6 porque o `slot_key=como_funciona` puxa a biblioteca de mídia daquele slot. Isso confunde o consultor e dá a impressão de que mídia é enviada.

## Mudanças

### Migration — atualizar o passo 6 do Fluxo D
```sql
UPDATE bot_flow_steps
SET 
  slot_key = 'esclarecer_duvidas',
  media_order = ARRAY['text']::text[]
WHERE flow_id = '320bf22c-e383-4f53-a3c0-b88b89b02558'
  AND step_key = 'd_duvidas';
```

Efeito:
- Editor passa a mostrar o passo 6 **só com texto** (sem seções de áudio/vídeo/imagem).
- Backend continua enviando resposta da IA (slot `esclarecer_duvidas` também está na lista de detecção do guard, linha 912).
- Nenhum outro passo/fluxo é afetado.

### Sem mudanças de código
- `whapi-webhook/handlers/bot-flow.ts` — guard de IA já cobre `esclarecer_duvidas` e `/duvid/`.
- `evolution-webhook/handlers/bot-flow.ts` — idem.
- Frontend `/admin/fluxos` — usa `media_order` para decidir o que renderizar; ao limitar a `['text']`, áudios/vídeos somem automaticamente.

## Critério de sucesso
- Em `/admin/fluxos` → Fluxo D → Passo 6: aparece apenas campo de texto, sem seções "ÁUDIOS"/"VÍDEOS"/"IMAGENS".
- Quando o lead chega no passo 6 (ou pergunta algo), o bot responde **só texto** gerado pelo Gemini 3.1 Pro.
- Passos 1–5 e 7+ permanecem intactos.
