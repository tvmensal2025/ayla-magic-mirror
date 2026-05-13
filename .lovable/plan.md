## Diagnóstico

### 1) Os Áudios da Camila ficaram inteligentes? Risco real
**Hoje (já implementado):** o roteador da IA recebe a lista de slots disponíveis e responde com `audio_slot_key` via JSON schema. Isso reduz alucinação, mas **não elimina**. Riscos que ainda existem:

- A IA pode escolher `objecao_preco` quando o lead só perguntou "como funciona". Hoje só temos `description` + `trigger_hint` como dica — a IA pode interpretar errado.
- Não há **classificador prévio** (intent detection) antes da decisão. A IA decide texto + áudio na mesma chamada, então um prompt mal calibrado causa disparo errado.
- Não há **limite global por conversa** (só cooldown por slot). Em teoria a IA pode disparar 4 áudios diferentes em 4 mensagens seguidas.
- Não há **fallback de segurança**: se a IA chamar um `slot_key` inexistente, o código ignora silenciosamente em vez de logar e alertar.
- Sem dashboard de "quais áudios estão sendo disparados pra quem" — você não consegue auditar sem abrir o banco.

### 2) Por que o anúncio "deu errado com muitas cidades"
Olhei o `UseTemplateDialog` (o fluxo que sobrou depois de apagar o Express). Ele já tem a opção "Todas (N cidades)" como **default selecionado** (`selectedCity = "__all__"`). Resultado: o consultor clica 2 vezes e publica para **80 cidades** de uma distribuidora inteira, com R$ 30/dia. O Facebook dilui o orçamento → CPL alto, leads ruins, audiência fria.

A regra real do mercado para CTWA (Click-to-WhatsApp) com R$ 20–50/dia é:
- **1 a 3 cidades por campanha**, priorizando capital + cidades com >100k habitantes da distribuidora certa.
- Audiência mínima ~80k pessoas, máxima ~2M (acima disso o Meta não otimiza bem com budget pequeno).

### 3) O que você pediu: 1 botão que seleciona tudo e publica
Hoje são 2 telas (escolher distribuidora → escolher cidade → publicar). Você quer **1 clique** que já decide o melhor.

---

## Plano

### A) Botão "Publicar inteligente" (1 clique)
Novo botão no card de cada template (`AdTemplatesGallery`), ao lado de "Usar template":

```
[ ⚡ Publicar inteligente ]   [ Personalizar ]
```

Ao clicar, sem abrir modal nenhum, o sistema:

1. **Detecta a região do consultor** com esta cascata:
   - a) DDD do telefone WhatsApp conectado → estado (mapa DDD→UF, 67 entradas, hardcoded).
   - b) Se o template tem `target_distribuidora_ids`, intercepta com a distribuidora compatível com o estado.
   - c) Se nada bater, usa a distribuidora de **maior tier** (`alto`) elegível no template.
2. **Escolhe 1 cidade ideal** dessa distribuidora:
   - Lê `ad_campaigns_stats` (criar view) com CPL médio por cidade dos últimos 30 dias.
   - Se houver histórico → escolhe a cidade com **menor CPL** e audiência >80k.
   - Se não houver histórico → escolhe a **primeira cidade da lista do preset** (já são ordenadas por porte na `DISTRIBUIDORAS_PRESETS`).
3. **Pré-valida no Meta** (`preflightCampaign`):
   - Se audiência <80k, expande pra 2 cidades mais próximas.
   - Se >2M, mantém só a capital.
4. **Publica** com `createCampaign` usando copy do template, R$ do template, foto do template.
5. **Toast de progresso** em 4 etapas: `Detectando região → Escolhendo cidade → Validando → Publicando ✅`. Sem modal.

Se qualquer etapa falhar, abre o `UseTemplateDialog` atual no estado certo (com distribuidora pré-selecionada) — fallback humano.

### B) Default seguro no fluxo manual existente
- No `UseTemplateDialog` step 2, **trocar default** de `selectedCity = "__all__"` para a primeira cidade individual.
- Renomear o botão "Todas (N cidades)" para `Todas — avançado (CPL alto)` com ícone de aviso.
- Adicionar badge vermelho "⚠ 80 cidades dilui o orçamento" quando "Todas" selecionado e budget <R$50/dia.

### C) Tornar os Áudios da Camila à prova de erro
1. **Limite global por conversa:** máx. 1 áudio a cada 3 mensagens da IA, máx. 3 áudios em 24h por lead. Coluna `ai_slot_dispatch_log` já existe — só adicionar checagem agregada antes do dispatch.
2. **Validação do `slot_key`:** se a IA retornar slot inexistente, logar em `ai_slot_dispatch_log` com `variant='invalid'` e enviar só texto. Já temos a infra; falta o log de erro.
3. **Slot `_default_seguro`:** se a IA estiver em dúvida (confidence baixa OU contexto ambíguo), forçar fallback de texto sem áudio. Adicionar campo `confidence` no schema da decisão.
4. **Aba "Auditoria" no painel de slots** (Super Admin): tabela com últimos 50 disparos: lead, slot, variant (personal/public/text), se houve resposta em 30min. Permite ver na prática se a IA está acertando.
5. **Modo "treinamento" por slot:** toggle "🧪 Em teste" → quando ativo, IA não dispara o áudio, apenas registra no log que disparou. Permite calibrar antes de mandar pra todos os leads.

### D) Análise de mercado (para decisão da cidade)
Criar Edge Function `ad-market-analysis` que retorna, para uma distribuidora:
- CPL médio por cidade (últimos 30d) baseado em `ad_campaigns` da plataforma toda.
- Audiência estimada via Meta API.
- Score: `1 / (CPL * sqrt(audiência))` — favorece cidades baratas e com volume razoável.
- Cache em tabela `ad_market_intel` por 24h.

O botão "Publicar inteligente" usa esse score para decidir.

---

## Detalhes técnicos

**Arquivos novos:**
- `src/lib/dddToUf.ts` — mapa DDD → UF.
- `src/services/smartPublish.ts` — orquestrador do fluxo de 1 clique.
- `supabase/functions/ad-market-analysis/index.ts` — edge function de scoring.
- `src/components/admin/ads/SmartPublishButton.tsx` — botão + toasts de progresso.

**Arquivos editados:**
- `src/components/admin/ads/AdTemplatesGallery.tsx` — adicionar `SmartPublishButton`.
- `src/components/admin/ads/UseTemplateDialog.tsx` — default = 1ª cidade, badge de aviso.
- `supabase/functions/ai-agent-router/index.ts` — limite global, validação de slot_key, campo `confidence`.
- `src/components/admin/AIAgentTab/SlotsPanel.tsx` — toggle "🧪 Em teste" + aba auditoria.

**Migrations:**
- `ad_market_intel` (distribuidora_id, city_key, cpl_avg_cents, audience_est, score, computed_at).
- `ai_agent_slots`: coluna `is_testing boolean default false`.
- `ai_slot_dispatch_log`: coluna `dispatch_status text` (`sent` | `blocked_global_limit` | `blocked_invalid_slot` | `testing_only`).

**Fora de escopo agora:** ML real para escolha de cidade (vamos com heurística simples), A/B testing automático, transcrição Whisper.

---

## Ordem de execução sugerida

1. Default seguro no `UseTemplateDialog` (5min, resolve o problema imediato).
2. Mapa DDD→UF + `SmartPublishButton` com lógica básica (sem market analysis ainda — usa primeira cidade do preset).
3. Limites globais + validação `slot_key` nos áudios.
4. `ad_market_intel` + edge function de score.
5. Aba auditoria + toggle "Em teste" nos slots.

Posso começar pelo passo 1+2 (resolve hoje o anúncio errado e entrega o botão de 1 clique) e os outros num próximo turno?