## Objetivo

Hoje cada consultor tem **um** fluxo ativo na `bot_flows` (a "Camila"). Vamos transformar isso em **dois fluxos idênticos** — variante **A** (atual, com áudio) e variante **B** (sem áudio, mantém texto, imagem e vídeo) — e distribuir os leads alternadamente (1=A, 2=B, 3=A, 4=B...) para comparar performance.

Importante: as mídias (`ai_media_library`) são compartilhadas por `consultant_id + slot_key`. Por isso, em vez de duplicar áudios, basta o dispatcher **ignorar áudios quando a variante for B**. Assim qualquer edição feita pela consultora (trocar imagem, texto, vídeo) reflete nas duas variantes automaticamente, exceto pelo áudio que só sai no A.

---

## Mudanças no banco

1. `bot_flows`
  - Nova coluna `variant text not null default 'A'` (valores: `'A'` ou `'B'`).
  - Trocar unique/lookup: permitir 2 linhas ativas por consultor, uma por variante (`unique(consultant_id, variant)`).
2. `customers`
  - Nova coluna `flow_variant text` (nullable; preenchida na entrada do lead, fica fixa para a vida do lead).
3. `consultants`
  - Nova coluna `ab_test_enabled boolean not null default false`. Quando `false`, todos os leads continuam recebendo a variante A (comportamento atual preservado).
  - Nova coluna `ab_test_counter int not null default 0`, usada para decidir A/B sequencial.
4. Função `assign_flow_variant(consultant uuid) returns text`
  - Se `ab_test_enabled = false` → retorna `'A'`.
  - Senão, incrementa `ab_test_counter` atomicamente e retorna `'A'` se ímpar, `'B'` se par. Garante sequência 1=A, 2=B, 3=A...
5. Trigger `before insert` em `customers`
  - Se `flow_variant` for nulo, chama `assign_flow_variant(NEW.consultant_id)` e grava.
6. Função RPC `clone_bot_flow_as_b(_consultant_id uuid)`
  - Pega o fluxo A ativo do consultor.
  - Cria fluxo B (`variant='B'`, mesmo `name + ' (B - sem áudio)'`, `is_active=true`).
  - Copia todos os `bot_flow_steps` preservando `step_key`, `slot_key`, `position`, `transitions`, `captures`, `fallback`, `media_order`, `message_text`, etc.
  - Re-mapeia `transitions[*].goto_step_id` dos passos antigos para os IDs novos.

---

## Mudanças nas Edge Functions

Arquivos: `supabase/functions/whapi-webhook/handlers/bot-flow.ts`, `supabase/functions/whapi-webhook/handlers/conversational/index.ts`, `supabase/functions/manual-step-send/index.ts`.

1. **Resolver do fluxo ativo** — onde hoje:
  ```ts
   .from("bot_flows").eq("consultant_id", x).eq("is_active", true).maybeSingle()
  ```
   passa a:
   Centralizar num helper `getActiveFlowForCustomer(customer)`.
2. **Dispatcher de mídia** — quando `variant === 'B'`, filtrar `ai_media_library` para `kind != 'audio'` e remover `'audio'` do `media_order` antes de enviar. Texto, imagem e vídeo seguem normalmente. A ordem padrão `Audio → Image → Video → Text` vira `Image → Video → Text`.
3. `manual-step-send` segue a mesma regra (consulta o `customer.flow_variant` antes de montar a sequência).

---

## Mudanças no admin (`src/pages/FluxoCamila.tsx`)

1. Switch novo no topo do card de teste: **"Teste A/B ativo"** — liga/desliga `consultants.ab_test_enabled`. Com tooltip explicando "novos leads alternam entre Fluxo A (com áudio) e Fluxo B (sem áudio)".
2. Botão **"Criar/atualizar Fluxo B (sem áudio)"** ao lado do switch:
  - Se ainda não existe fluxo B do consultor → chama `clone_bot_flow_as_b`.
  - Se já existe → confirma diálogo e re-sincroniza B com os passos atuais do A (apaga passos B e recopia).
3. Seletor **"Editando: Fluxo A | Fluxo B"** no topo da lista de passos:
  - Por padrão mostra A.
  - Em B, esconder a seção "ÁUDIOS" do `StepMediaPanel` e mostrar aviso "Variante sem áudio — gerencie áudios em Fluxo A".
  - Texto/imagem/vídeo continuam editáveis nas duas variantes (mas como compartilham `slot_key`, alterações no texto refletem em ambas — explicar isso num banner: "Texto, imagem e vídeo são compartilhados entre A e B; apenas o áudio difere").
4. Indicador no card "Em teste com X número(s)": mostrar quantos leads em cada variante (`count where flow_variant='A'` / `='B'`).

---

## Critérios de aceite

- Consultor sem A/B ligado: comportamento idêntico ao atual (todos leads = A).
- Ao ligar A/B e criar fluxo B: próximos leads alternam A,B,A,B...
- Lead variante B recebe os mesmos passos, na mesma ordem, com imagem/vídeo/texto, mas **sem nenhum áudio**.
- Editar um passo (texto, imagem, vídeo) reflete nas duas variantes; gravar áudio novo só afeta A.
- `LiveConversationsPanel` e `manual-step-send` respeitam a variante do lead ao reenviar passo manualmente.

---

## Perguntas antes de implementar

1. Confirmar que a alternância é **por consultor** (cada consultor tem seu próprio contador A/B). Correto? SIM o Do [rafael.ids@icloud.com](mailto:rafael.ids@icloud.com)  é público por ser ele o que as pessoas fot usad
2. Leads já existentes (criados antes do A/B ligar) — deixar `flow_variant = 'A'` para todos, ok? Sim 
3. Quando a consultora editar o texto de um passo, deve refletir em A e B (compartilhado) ou cada variante tem texto independente? Plano acima usa **compartilhado** (mais simples e mantém o teste justo: só o áudio é a variável). Sim 
  &nbsp;