## Objetivo

1. **Todos os consultores** usam apenas **Evolution API** (1 conexão).
2. **Apenas `rafael.ids@icloud.com`** mantém o acesso ao **Whapi** (super admin já existente).
3. **Apenas `rafael.ids@icloud.com`** ganha uma **segunda conexão Evolution** (instância extra), podendo conectar outro número.

## Diagnóstico atual

- `whatsapp_instances` tem `UNIQUE(consultant_id)` → hoje cada consultor só pode ter 1 instância.
- `useWhatsAppInstanceDb.saveInstance` faz upsert com `onConflict: "consultant_id"`.
- `useWhatsApp.ts` detecta Whapi via `admin_settings.superadmin_consultant_id`. O ID do Rafael já está nessa chave (Whapi continuará funcionando só para ele, já está restrito).
- `ConnectionPanel` e `WhatsAppTab` já lidam com `isWhapi`.

Ou seja: Whapi-só-Rafael já está implementado. O que falta é a **segunda instância Evolution para o Rafael**.

## Mudanças

### 1. Banco (migration)

- Adicionar coluna `slot smallint NOT NULL DEFAULT 1` em `whatsapp_instances`.
- Substituir `UNIQUE(consultant_id)` por `UNIQUE(consultant_id, slot)`.
- Backfill: todas as linhas existentes ficam com `slot = 1`.
- Manter `UNIQUE(instance_name)` (cada slot vira `igreen-{slug}` e `igreen-{slug}-2`).

### 2. Hook `useWhatsApp` (parametrizado por slot)

- Aceitar `slot: 1 | 2` (default 1).
- Nome da instância: `slot===2 ? `${base}-2` : base`.
- Toda query/upsert em `whatsapp_instances` passa a filtrar `.eq("slot", slot)`.
- `useWhatsAppInstanceDb` recebe `slot` e usa `onConflict: "consultant_id,slot"`.
- `isWhapi` só vale para `slot===1` (Whapi não tem slot 2).

### 3. UI

- **WhatsAppTab** ganha props/estado de slot ativo. Para usuário normal: comportamento atual (slot 1).
- **Para Rafael (super admin)**: exibir tabs internas **"Conexão 1"** e **"Conexão 2"** no painel de conexão. Cada uma instancia o fluxo `useWhatsApp({ slot })` independentemente, com QR code, status e número conectado próprios.
- Gate por `is_super_admin(auth.uid())` (já existe RPC) — não hardcodar email.
- Tab de "Conexão 2" mostra apenas Evolution (sem Whapi).

### 4. Edge functions / envio

- `messageSender` / envio em massa hoje resolve a instância do consultor por `consultant_id`. Atualizar para usar **slot 1 por padrão** (comportamento atual preservado). Slot 2 fica disponível só para conectar/desconectar/visualizar — envios automáticos continuam pelo slot 1, evitando regressão.
- (Opcional, fora de escopo deste plano salvo confirmação) seletor de slot no envio em massa do Rafael.

### Arquivos previstos

- **Migration:** nova, adiciona `slot` + índice único composto.
- **Editados:**
  - `src/hooks/useWhatsApp.ts` (aceitar slot)
  - `src/hooks/whatsapp/useWhatsAppInstanceDb.ts` (slot + onConflict)
  - `src/components/whatsapp/WhatsAppTab.tsx` (tabs Conexão 1/2 só p/ super admin)
  - `src/components/whatsapp/ConnectionPanel.tsx` (rótulo do slot)
  - `src/integrations/supabase/types.ts` (regenerado automaticamente após migration)

### Fora de escopo

- Mudar fluxo de bot, CRM, dashboard ou Whapi.
- Roteamento de envios automáticos pelo slot 2 (pode entrar depois se desejado).

## Pergunta antes de implementar

Confirma que o **slot 2 serve apenas para conectar/visualizar outro número** (sem mudar para onde vão os envios automáticos do bot)? Se quiser que o Rafael escolha por qual slot enviar (manual ou em massa), eu incluo no mesmo plano.
