
# Correção dos Fluxos A/B do Rafael Ferreira

## Reanálise (correção da análise anterior)

Reli direto do banco. **Boa notícia:** as "transitions órfãs" relatadas antes **não existem** — todos os `goto_step_id` em ambos os fluxos apontam para steps reais. Os P2 da análise anterior estão descartados.

**Notícia ruim:** o Fluxo B tem 1 bug grave de roteamento que pula o passo "Como funciona" inteiro:

```text
B-pos6 "Pede permissão" --(default/afirmação)--> pos8 "Convite"   ❌ pula pos7
B-pos7 "Como funciona"  --(nunca alcançado)----> pos9 (órfão de fato)
B-pos8 "Convite"        com slot_key = fazenda_solar              ❌ mídia errada
```

Resultado prático no B hoje: lead recebe "5. Pede permissão" → "7. Convite" mostrando o vídeo do fazenda_solar (que era pra ser do "Como funciona"), e nunca vê o passo 6. Os outros 8 passos (1,2,3,4,5,8,9,10) chegam corretos.

## Issues confirmados

| # | Fluxo | Problema | Impacto |
|---|-------|----------|---------|
| B1 | B | `pos6.transitions[*].goto_step_id` aponta pra pos8 em vez de pos7 | passo 6 nunca é executado |
| B2 | B | pos7 `slot_key=NULL` | mesmo se reativado, não envia mídia |
| B3 | B | pos8 `slot_key=fazenda_solar` (deveria ser NULL) | convite aparece com vídeo da fazenda |
| A1 | A | pos5 "Explica desconto" `slot=como_funciona`, pos7 "Como funciona" `slot=fazenda_solar` | títulos vs slot trocados, **mas funciona em produção há tempos** |

## Plano

### 1. Corrigir Fluxo B (crítico — migração de DATA via insert tool)

```sql
-- B1: pos6 deve avançar para pos7 (id e0f1de51-36c5-4669-9ffd-95c1423e5008)
UPDATE bot_flow_steps
SET transitions = '[
  {"goto_step_id":"e0f1de51-36c5-4669-9ffd-95c1423e5008","trigger_intent":"afirmacao","trigger_phrases":["ok","okay","pode","sim","claro","manda","beleza"]},
  {"goto_step_id":"e0f1de51-36c5-4669-9ffd-95c1423e5008","trigger_intent":"default","trigger_phrases":[]}
]'::jsonb
WHERE id = '94e01f57-b841-455f-8777-6bb6d3a94674';

-- B2 + B3: trocar slot_key entre pos7 e pos8
UPDATE bot_flow_steps SET slot_key = 'fazenda_solar' WHERE id = 'e0f1de51-36c5-4669-9ffd-95c1423e5008';
UPDATE bot_flow_steps SET slot_key = NULL            WHERE id = '674d90a5-38b4-4931-a8a3-eac8e743ce7a';
```

### 2. Fluxo A — **NÃO MEXER**

Os slot_keys de A estão "trocados" semanticamente, mas a mídia atual está vinculada a esses slots e o fluxo roda OK em produção. Mexer = risco alto de quebrar quem já está no meio do funil. Mantém como está.

### 3. Validação pós-fix

- Re-consulta os 11 steps de B e confirma chain: pos2→3→4→5→6→7→8→9→10→11.
- Confere `ai_media_library` para garantir que existe mídia ativa pro consultor nos slots `fazenda_solar` (será usado em B-pos7 agora) e que nenhum slot novo ficou órfão.
- A/B test pode continuar ligado: clientes existentes têm `flow_variant=NULL` (tratado como A) e só novos leads entram no B corrigido.

### 4. Sobre "disparar pro lead do passado"

Confirmado pela análise anterior: 877 dos 926 clientes estão `bot_paused=true` (silêncio total via `_shared/bot/paused.ts`). `set_customer_flow_variant` só roda em INSERT. Ligar/desligar A/B não dispara cron retroativo. **Seguro.**

## O que NÃO faz parte deste plano

- Renomear `slot_key` do Fluxo A
- Tocar em mídias do `ai_media_library`
- Mexer em código (apenas dados via UPDATE em 3 linhas)
