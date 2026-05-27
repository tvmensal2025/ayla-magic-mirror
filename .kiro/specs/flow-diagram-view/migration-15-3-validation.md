# Task 15.3 — Validação da migration `20260601000000_add_layout_to_bot_flow_steps.sql`

> Documento de validação para a Task 15.3 do spec `flow-diagram-view`.
> Anexar este arquivo ao PR como evidência das asserções R17.2, R17.3 e R17.6.

## Resumo

A migration `supabase/migrations/20260601000000_add_layout_to_bot_flow_steps.sql`
foi validada contra um **snapshot do schema de dev** reproduzido em uma
instância isolada de Postgres (PGlite, embedded), com a estrutura, policies,
função `seed_default_camila_flow` e RLS clonadas direto da base ativa via MCP
(`pg_get_tabledef` + `pg_get_functiondef` + `pg_policy`).

Todas as quatro asserções do plano passaram. Documentamos também o rollback,
verificando empiricamente que `DROP COLUMN layout` é seguro e o ciclo
apply/rollback/re-apply é repetível.

## Pré-condição (baseline)

Antes da migration, o snapshot contém:

- Tabela `public.bot_flow_steps` sem a coluna `layout`.
- 4 registros pré-existentes em `bot_flow_steps` (proxy para os 150 registros
  presentes em dev).
- RLS habilitado (`relrowsecurity = true`).
- 2 policies permissivas (`Owner manages own flow steps`, `Super admin manages
  all flow steps`).
- Função `public.seed_default_camila_flow(_consultant_id uuid)` com corpo
  byte-idêntico ao snapshot recuperado de dev.

## Asserções verificadas

### (a) Coluna `layout` existe como `jsonb DEFAULT NULL`

```sql
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public'
   AND table_name='bot_flow_steps'
   AND column_name='layout';
```

Resultado pós-migration:

| column_name | data_type | column_default | is_nullable |
|-------------|-----------|----------------|-------------|
| layout      | jsonb     | NULL           | YES         |

Observação: o Postgres serializa `DEFAULT NULL` como ausência de default literal
(coluna `column_default = NULL` em `information_schema`); a coluna nasce
nullable e qualquer `INSERT` que não cite `layout` resulta em `NULL`, que é o
comportamento desejado pela migration (linha `ADD COLUMN IF NOT EXISTS layout
jsonb DEFAULT NULL`).

### (b) Registros pré-existentes têm `layout = NULL`

```sql
SELECT count(*) AS total, count(layout) AS not_null
  FROM public.bot_flow_steps
 WHERE flow_id = $1;  -- flow pré-existente
-- total=4, not_null=0
```

Os 4 registros pré-existentes preservam `layout = NULL`. Não há backfill nem
alteração de dados existentes.

### (c) `seed_default_camila_flow` continua funcionando sem alterações

Duas verificações:

1. **Body byte-idêntico** — Comparando o resultado de `pg_get_functiondef` antes
   e depois da migration, o corpo da função é literalmente igual (string
   compare). A migration não toca em funções.
2. **Comportamento preservado** — Chamar `seed_default_camila_flow($consultant)`
   em um consultor sem fluxo:
   - retorna `uuid` válido do novo flow;
   - insere os 6 passos esperados;
   - cada passo recém-inserido tem `layout = NULL` (default da nova coluna);
   - re-chamar com o mesmo `consultant_id` continua idempotente (mesmo `flow_id`,
     nenhuma duplicação de passos).

### (d) RLS de `bot_flow_steps` continua aplicável

Pós-migration:

- `pg_class.relrowsecurity` continua `true`.
- `pg_policy` retorna exatamente as 2 policies originais (`Owner manages own
  flow steps`, `Super admin manages all flow steps`), com mesmas expressões
  USING / WITH CHECK e mesmo conjunto de roles (`{authenticated}`).

A migration é puramente DDL aditiva (`ALTER TABLE ... ADD COLUMN`); ela não
toca em policies nem em RLS.

## Rollback

```sql
ALTER TABLE public.bot_flow_steps DROP COLUMN layout;
```

Por que é seguro:

- `layout` é nullable e nunca lido pelo engine de runtime (handlers
  Whapi/Evolution e `flow-router.ts`). Veja R17.2 e o comentário no migration
  file. Logo, `DROP COLUMN` não quebra nenhum consumidor server-side.
- O cliente (`Modo_Diagrama`) **lê** `layout` mas trata `null` / ausência
  como "não posicionado manualmente" — o auto-layout do dagre cobre o caso.
  Após o rollback o canvas continua usável; apenas perde o posicionamento
  manual já feito.
- Validamos empiricamente: após `DROP COLUMN layout`, todas as 4 linhas
  pré-existentes permanecem; RLS continua habilitada; o ciclo
  apply → rollback → re-apply é repetível sem erro (idempotência via
  `ADD COLUMN IF NOT EXISTS`).

Para reverter em produção:

```bash
supabase db remote commit  # snapshot atual
psql "$DEV_DATABASE_URL" -c "ALTER TABLE public.bot_flow_steps DROP COLUMN layout;"
```

## Como reproduzir esta validação

Há um script automatizado em `.tmp/pg-snapshot-validate/validate.mjs` que:

1. cria um Postgres embarcado (PGlite);
2. recria `bot_flows`, `bot_flow_steps`, RLS, policies e
   `seed_default_camila_flow` a partir do snapshot capturado de dev;
3. insere 4 linhas pré-existentes;
4. roda a migration;
5. asserta os pontos (a)–(d);
6. valida o rollback e o ciclo apply/rollback/re-apply.

Comando:

```bash
node .tmp/pg-snapshot-validate/validate.mjs
```

Saída esperada (resumida):

```
== Validate add_layout_to_bot_flow_steps migration on dev snapshot ==

Step 0: build snapshot schema (auth stubs, bot_flows, bot_flow_steps, RLS, seed function)
  baseline: 4 pre-existing rows, RLS=true, 2 policies

Step 1: apply migration 20260601000000_add_layout_to_bot_flow_steps.sql
  OK migration applied without error
  OK migration is idempotent (second run no-op)

Step 2: assertions
  OK (a) layout column exists
  OK (a) layout.data_type = jsonb
  OK (a) layout DEFAULT NULL (no explicit default literal)
  OK (a) layout is nullable
  OK (b) pre-existing row count preserved
  OK (b) pre-existing rows have layout = NULL
  OK (c) seed_default_camila_flow body byte-identical pre/post migration
  OK (c) seed_default_camila_flow returns flow_id
  OK (c) seed_default_camila_flow inserts 6 steps (unchanged behaviour)
  OK (c) freshly seeded steps default to layout = NULL
  OK (c) seed_default_camila_flow remains idempotent (same flow_id on re-call)
  OK (c) re-call did not insert duplicate steps
  OK (d) RLS still enabled on bot_flow_steps
  OK (d) policies on bot_flow_steps unchanged after migration
  OK (d) expected 2 policies still present

Step 3: rollback (ALTER TABLE ... DROP COLUMN layout)
  OK rollback: layout column dropped
  OK rollback: data rows preserved (drop is safe)
  OK rollback: RLS still enabled
  OK rollback + re-apply cycle is repeatable

== validation complete ==
ALL ASSERTIONS PASSED
```

## Mapeamento de requisitos

- **R17.2** — Apenas adição de coluna `layout` jsonb nullable; engine não lê.
  Comprovado em (a) e (c).
- **R17.3** — `seed_default_camila_flow` permanece byte-idêntico e produz o
  mesmo resultado. Comprovado em (c).
- **R17.6** — RLS de `bot_flow_steps` permanece aplicável após a migration.
  Comprovado em (d).

## Observações sobre o ambiente de execução

A validação foi feita contra um snapshot reproduzido com PGlite (Postgres
embarcado em WASM) porque o Supabase MCP server desta workspace está em
modo `--read-only`, impedindo aplicação direta de DDL contra a base de dev
remota a partir desta sessão.

A reprodução do schema foi feita capturando direto da base remota (também via
MCP, em modo de leitura) os artefatos a seguir:

- `pg_get_tabledef` para `bot_flow_steps`;
- `pg_constraint` (FKs e CHECKs) para `bot_flow_steps`;
- `pg_policy` (`Owner manages own flow steps`, `Super admin manages all flow steps`);
- `pg_get_functiondef` para `seed_default_camila_flow`.

Para aplicar a migration na base de dev remota, basta rodar:

```bash
supabase db push --include 20260601000000_add_layout_to_bot_flow_steps.sql
```

ou subir o flag `--read-only` do MCP e re-rodar `mcp_supabase_apply_migration`.
