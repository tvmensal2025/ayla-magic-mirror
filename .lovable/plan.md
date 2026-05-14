## Problema

O alerta "1 instância(s) Evolution caída(s)" não diz QUAL instância caiu. Você precisa abrir outro painel pra descobrir qual consultor reconectar — perde tempo.

## Plano

Em `src/components/superadmin/SystemHealthPanel.tsx`:

### 1. Buscar a lista de instâncias caídas (não só o count)

Trocar a query do `needReconnect` para trazer as linhas, fazendo join com `consultants` para mostrar nome/licença:

```ts
supabase.from("whatsapp_instances")
  .select("id, instance_name, connected_phone, status, last_health_check_at, consultant_id, consultants:consultant_id(name, license_code)")
  .in("status", ["needs_reconnect", "disconnected", "close"])
```

Guardar em `downInstances: Array<{name, license, phone, instance, lastSeen}>`.

### 2. Expandir o card vermelho com lista clicável

Trocar a linha única por uma lista com até 5 itens visíveis (resto em "+N mais"):

```
🔴 1 instância caída
 └─ Carlos Magna · igreen-carlos-magna · 5519988185006 · há 12 min
    [Abrir Evolution] [Ver consultor]
```

- "Abrir Evolution" → link direto para `https://evo.igreenenergybrasil.site/manager/instance/{instance_name}` (ou variável de env já usada no projeto — vou checar `EVOLUTION_API_URL` em código)
- "Ver consultor" → navega para `/super-admin?tab=consultores&search={license_code}`
- Tempo desde `last_health_check_at` em formato amigável ("há 3 min").

### 3. Atualizar o Metric "Inst. derrubadas"

Mostrar tooltip nativo (`title=`) com os primeiros nomes para feedback rápido sem precisar rolar.

### 4. Status considerados "caídos"

Hoje só conta `needs_reconnect`. Vou incluir também `disconnected` e `close` (são os estados que a Evolution emite quando o QR expira ou o celular desconectou) para não esconder problemas reais.

## Fora de escopo

- Não mexe no fluxo de reconexão automática nem no painel da Evolution em si.
- Não cria nova tabela nem migration.
