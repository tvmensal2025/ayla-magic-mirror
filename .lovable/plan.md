## Diagnóstico

O erro vem do botão/switch **“IA ativa para meus leads”** no topo da aba IA. Ele faz `upsert` em `ai_agent_config` com `onConflict: "consultant_id"`, mas a tabela hoje tem apenas índice único parcial em `consultant_id`, então o PostgREST retorna:

```text
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Também há risco de a pausa global só alterar leads com `bot_paused = false`, deixando casos inconsistentes fora da regra.

## Plano de correção

1. **Corrigir o switch “IA ativa para meus leads”**
   - Trocar o `upsert(..., { onConflict: "consultant_id" })` por lógica segura: procurar config existente do consultor; se existir, `update`; se não existir, `insert`.
   - Aplicar o mesmo padrão ao salvar o nome da persona.
   - Assim o botão para/religa a IA sem depender de `ON CONFLICT`.

2. **Fazer o desligamento do switch pausar também os leads ativos**
   - Quando o usuário desligar a IA, além de salvar `enabled=false`, atualizar os `customers` do consultor para `bot_paused=true`, `assigned_human_id=userId` e motivo `manual_global_pause`.
   - Quando religar, limpar apenas pausas com motivo `manual_global_pause`, sem mexer em leads assumidos manualmente por outro motivo.

3. **Endurecer o botão “Parar IA de todos os meus leads”**
   - Remover filtro frágil que só atualiza `bot_paused=false`.
   - Pausar todos os leads do consultor que ainda não estão em atendimento humano, garantindo `assigned_human_id` e `bot_paused=true`.
   - Manter o botão “Religar IA” revertendo somente `manual_global_pause`.

4. **Garantir que o fluxo respeite a pausa global**
   - Revisar os pontos de decisão do `whapi-webhook`/`bot-flow` que leem `ai_agent_config.enabled` e `bot_paused` para manter a regra: se `enabled=false`, `bot_paused=true` ou `assigned_human_id` preenchido, a IA não envia mensagem.

5. **Ajuste opcional de banco, se necessário**
   - Se ainda houver necessidade de `upsert` em outros lugares, criar uma constraint única real ou substituir esses `upsert`s por update/insert. Para este erro específico, a correção no frontend já elimina a chamada quebrada.

## Validação

- Clicar no switch “IA ativa para meus leads” para desligar e confirmar que não aparece mais o erro vermelho.
- Verificar que os leads saem de “IA atendendo” e entram como pausados/humano.
- Clicar em “Parar IA em todos” e confirmar que todos os leads ativos ficam pausados.
- Conferir no fluxo/webhook que mensagens novas não disparam IA quando o lead está pausado ou com humano assumido.