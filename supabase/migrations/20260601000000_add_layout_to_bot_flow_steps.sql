-- Adiciona coluna `layout` em public.bot_flow_steps para o Modo_Diagrama
-- (feature flow-diagram-view).
--
-- Contexto:
--   O novo Modo_Diagrama do editor de fluxo (`/admin/fluxo`) precisa
--   persistir as coordenadas {x, y} de cada Passo no canvas para preservar
--   o posicionamento manual feito pelo Consultor entre sessões.
--
-- Características:
--   * Coluna nullable: `null` significa "não posicionado manualmente",
--     o renderer aplica auto-layout (dagre) para esses Passos.
--   * Não há backfill: fluxos pré-existentes ficam com `layout = null` e o
--     primeiro render do diagrama os organiza automaticamente.
--   * Cosmética: o engine de runtime (handlers Whapi/Evolution e
--     `flow-router.ts`) NÃO lê esta coluna; mantém compatibilidade total
--     com Requisito 17 (R17.2, R17.4).
--   * Formato esperado pelo cliente: `{"x": number, "y": number}` com
--     x e y finitos em [-100000, 100000]. Validação acontece no client
--     (R10.5); o banco armazena qualquer jsonb válido.
--
-- Idempotência:
--   * `ADD COLUMN IF NOT EXISTS` permite rodar a migração múltiplas vezes
--     contra a mesma base sem erro.
--   * `COMMENT ON COLUMN` é naturalmente idempotente (sobrescreve).
--
-- Rollback:
--   ALTER TABLE public.bot_flow_steps DROP COLUMN layout;
--   É seguro porque `layout` é nullable, nunca lido pelo engine de runtime
--   e o cliente trata ausência/`null` como "não posicionado manualmente"
--   (auto-layout dagre cobre o caso). Validação em
--   .kiro/specs/flow-diagram-view/migration-15-3-validation.md.

ALTER TABLE public.bot_flow_steps
  ADD COLUMN IF NOT EXISTS layout jsonb DEFAULT NULL;

COMMENT ON COLUMN public.bot_flow_steps.layout IS
  'Coordenadas {x, y} do passo no editor em diagrama (Modo_Diagrama da feature flow-diagram-view). '
  'Formato esperado: {"x": number, "y": number} com x e y finitos em [-100000, 100000]. '
  'Nulo significa "não posicionado manualmente"; o renderer aplica auto-layout dagre. '
  'Coluna cosmética: NÃO afeta o engine de runtime (handlers Whapi/Evolution e flow-router.ts ignoram).';
