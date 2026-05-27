# Requirements Document — Flow Business Hours

## Introduction

Estender o editor de fluxo (`/admin/fluxos`) e o cron `send-scheduled-messages`
para que cada passo (`bot_flow_steps`) possa ter regras de horário comercial,
fim de semana e feriados. O objetivo é que mensagens automáticas oriundas de
passos configurados não sejam disparadas em momentos inadequados — fora do
horário comercial, em finais de semana ou em feriados cadastrados pelo
consultor.

A regra atua **somente** na fila `scheduled_messages` (cron a cada 5min); o
runtime tempo-real (`flow-engine` em `webhook` calls) continua respeitando
apenas a `quiet-hours` global existente (21:30→08:00 BRT). Mensagens fora da
janela permitida são **deferidas** (não descartadas): `scheduled_at` é
movido para o próximo momento permitido.

## Glossary

- **Sistema**: cron `send-scheduled-messages` + edge functions Supabase.
- **Editor_de_Fluxo**: `/admin/fluxos` (`FluxoBuilder.tsx`).
- **Passo**: registro de `bot_flow_steps`.
- **Mensagem_Agendada**: registro de `scheduled_messages` com
  `status='pending'`.
- **Janela_Permitida**: combinação das três regras configuradas em um Passo
  que avalia se "agora" é momento válido para disparar.
- **Horario_Comercial**: período dentro de um dia em que mensagens podem
  sair, definido por `business_hour_start` e `business_hour_end` (HH:MM em
  fuso BRT).
- **Feriado**: data em `holidays` correspondente ao consultor dono do fluxo
  ou marcada como global (`consultant_id IS NULL`).
- **ConsultantId**: `consultants.id` dono do fluxo (auth.users.id).

## Requirements

### Requirement 1: Configuração por passo

**User Story:** Como Consultor, quero marcar quais passos respeitam horário
comercial, finais de semana e feriados, para evitar disparos em momentos
inoportunos.

#### Acceptance Criteria

1. A migration DEVE adicionar três colunas a `bot_flow_steps`:
   - `respect_business_hours boolean NOT NULL DEFAULT false`
   - `pause_on_weekend boolean NOT NULL DEFAULT false`
   - `pause_on_holiday boolean NOT NULL DEFAULT false`
2. A migration DEVE adicionar duas colunas opcionais para janela horária no
   próprio passo (sobrescrevendo defaults globais quando preenchidas):
   - `business_hour_start text` (formato `"HH:MM"`, ex: `"09:00"`; default
     do sistema = `"09:00"`)
   - `business_hour_end text` (formato `"HH:MM"`, ex: `"18:00"`; default do
     sistema = `"18:00"`)
3. SE `respect_business_hours = false`, O Sistema DEVE ignorar
   `business_hour_start`/`business_hour_end` desse passo.
4. SE qualquer das três flags for `true` em um passo, ENTÃO o `StepInspector`
   DEVE exibir as configurações em uma seção "Horário e calendário".

### Requirement 2: Tabela de feriados

**User Story:** Como Consultor, quero cadastrar os feriados que se aplicam
ao meu negócio, para o bot pausar nos dias certos.

#### Acceptance Criteria

1. A migration DEVE criar tabela `holidays`:
   - `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
   - `consultant_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`
     (NULL = feriado global aplicável a todos os consultores)
   - `date date NOT NULL`
   - `label text` (descrição opcional)
   - `created_at timestamptz NOT NULL DEFAULT now()`
   - UNIQUE `(consultant_id, date)` — um consultor não duplica datas, mas
     pode coexistir com feriado global na mesma data
2. RLS: o Consultor SHALL ler/escrever apenas seus feriados; feriados
   globais (`consultant_id IS NULL`) SHALL ser legíveis por todos
   autenticados, mas escrevíveis apenas por super-admin.
3. SE existe registro em `holidays` com `date = CURRENT_DATE` cujo
   `consultant_id = $owner` ou `consultant_id IS NULL`, ENTÃO `isHolidayBRT`
   DEVE retornar `true` para esse consultor.
4. UI: seção "Feriados" no `/admin/fluxos` que liste, adicione e remova
   feriados do consultor.

### Requirement 3: Referência do passo de origem em scheduled_messages

**User Story:** Como Engenheiro, preciso saber qual passo gerou cada
mensagem agendada para aplicar as regras corretas.

#### Acceptance Criteria

1. A migration DEVE adicionar coluna `source_step_id uuid REFERENCES
   bot_flow_steps(id) ON DELETE SET NULL` em `scheduled_messages`.
2. Os dois call-sites que inserem em `scheduled_messages` (manual e
   automático via flow-engine) DEVEM popular `source_step_id` quando
   conhecido. Se desconhecido, o campo permanece `NULL` e o cron aplica
   regra de fallback (sem regra de horário/feriado/fds).
3. Mensagens com `source_step_id IS NULL` mantêm comportamento atual (só
   `quiet-hours` global).

### Requirement 4: Avaliação no cron `send-scheduled-messages`

**User Story:** Como Sistema, preciso adiar mensagens agendadas cuja regra
do passo de origem não é satisfeita "agora".

#### Acceptance Criteria

1. PARA CADA Mensagem_Agendada com `source_step_id` não nulo, O cron DEVE
   carregar as flags `respect_business_hours`, `pause_on_weekend`,
   `pause_on_holiday`, `business_hour_start`, `business_hour_end` do passo.
2. SE `pause_on_weekend = true` AND `now` é sábado ou domingo (BRT),
   ENTÃO O cron DEVE atualizar `scheduled_at` para a próxima segunda-feira
   às `business_hour_start` (ou 09:00 se vazio).
3. SE `pause_on_holiday = true` AND `isHolidayBRT(consultant_id)` retorna
   `true` para hoje, ENTÃO O cron DEVE adiar para o próximo dia útil
   (não-feriado, não-fds quando aplicável) às `business_hour_start`.
4. SE `respect_business_hours = true` AND `now` está fora da janela
   `[business_hour_start, business_hour_end]` em BRT, ENTÃO O cron DEVE
   adiar para o próximo `business_hour_start` válido (mesmo dia se ainda
   não chegou; senão próximo dia útil).
5. As regras 2/3/4 SÃO aplicadas em ordem; o resultado final é o
   **MAIOR** dos `scheduled_at` propostos por cada regra ativa (garante
   que todas sejam respeitadas).
6. SE nenhuma flag está ativa OU todas as condições são satisfeitas, o
   cron processa a mensagem normalmente.
7. O cron DEVE registrar log estruturado quando defere uma mensagem por
   regra de passo, contendo `message_id`, `step_id`, `reason`
   (`weekend`/`holiday`/`outside_business_hours`), `next_run`.

### Requirement 5: Indicador visual no diagrama

**User Story:** Como Consultor olhando o diagrama, quero ver imediatamente
quais passos têm regras de horário/feriado/fds e se estão pausados agora.

#### Acceptance Criteria

1. SE pelo menos uma das três flags do passo é `true`, ENTÃO o `FlowDiagramNode`
   DEVE exibir badge "🕐 Horário" (cor neutra) no rodapé do nó.
2. SE alguma das regras está bloqueando o disparo NESTE MOMENTO (calculado
   no client em BRT contra `now`), ENTÃO o badge DEVE virar "🌙 Pausado"
   (cor âmbar) com tooltip indicando o motivo (fds / feriado / fora do
   horário).
3. O cálculo do "está pausado agora" DEVE rodar a cada minuto via `setInterval`
   no client; a remontagem acontece sem reload.

### Requirement 6: Não regredir engine de runtime

**User Story:** Como Engenheiro, preciso garantir que o engine que dispara
mensagens em tempo real não muda comportamento.

#### Acceptance Criteria

1. O `flow-engine` (`_shared/flow-engine/`, handlers Whapi/Evolution) NÃO
   DEVE ler nenhuma das novas colunas de `bot_flow_steps`.
2. As novas colunas DEVEM ser nullable ou ter default que preserva o
   comportamento anterior (todos `false` por padrão = sem nenhuma regra
   nova ativa).
3. A regressão Deno (`deno test supabase/functions/_shared/flow-engine/`)
   DEVE continuar passando sem alterações.
