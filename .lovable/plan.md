## Objetivo
Reverter a alteração de banco feita anteriormente e manter o sistema exatamente como estava: **Whapi só para o Rafael**, **Evolution para todos os outros**, **uma conexão por consultor**.

## Mudança única (migration)

Remover a coluna `slot` e o índice composto adicionados, restaurando o `UNIQUE(consultant_id)` original em `whatsapp_instances`.

```sql
ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_consultant_slot_key;

ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_slot_check;

ALTER TABLE public.whatsapp_instances
  DROP COLUMN IF EXISTS slot;

ALTER TABLE public.whatsapp_instances
  ADD CONSTRAINT whatsapp_instances_consultant_id_key UNIQUE (consultant_id);
```

## Código
Nenhuma alteração — nenhum arquivo de código chegou a ser modificado para o recurso de "segunda conexão".

## Fora de escopo
Tudo o mais (Whapi, Evolution, dashboards, fluxos).
