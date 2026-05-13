## Objetivo

Hoje você só vê status ("Ativa", "Pausada") e métricas agregadas dos últimos 30 dias. Isso não responde a pergunta real: **"o anúncio que está rodando agora está mesmo entregando e levando gente pro meu WhatsApp?"**

Vou adicionar um painel **"Está funcionando?"** em cada card de campanha em `CampaignsList.tsx` que checa 4 sinais ao vivo e mostra um veredito claro (verde/amarelo/vermelho) com um botão de teste prático.

## Os 4 sinais checados

1. **Entrega na Meta (ao vivo)** — chama uma nova edge function `facebook-campaign-status` que consulta `effective_status` da campanha + adset + ad direto na Graph API. Possíveis resultados: `ACTIVE`, `IN_PROCESS` (em revisão), `PAUSED`, `WITH_ISSUES`, `DISAPPROVED`. Retorna também o motivo se houver pendência.

2. **Impressões nas últimas 24h** — busca em `facebook_metrics_daily` (já existe) o registro de hoje + ontem. Se `impressions > 0` nas últimas 24h → entregando. Se zero há mais de 24h com status ativo → bandeira amarela "Meta ainda aquecendo" ou vermelha "Pode ter problema de pagamento/segmentação".

3. **Cliques chegando no WhatsApp** — soma `messaging_conversations_started` das últimas 48h. Se houver impressões mas zero conversas → o anúncio é visto mas o link não converte (provável problema no destino).

4. **Teste do link de destino** — botão **"Testar meu link agora"** que abre `https://wa.me/<numero-da-campanha>?text=Teste` em nova aba. É exatamente o link que o usuário do Facebook abriria. Se abrir o WhatsApp na sua tela, abre na de qualquer pessoa. (Já corrigimos para `wa.me` que funciona dentro do navegador interno do Facebook.)

## Veredito final

Combina os 4 sinais em uma frase única no topo do card:

- 🟢 **"Funcionando — gente vendo e conversando"** — Meta ACTIVE + impressões 24h > 0 + conversas 48h > 0
- 🟡 **"Rodando, mas sem conversas ainda"** — Meta ACTIVE + impressões > 0 + conversas = 0
- 🟡 **"Aquecendo na Meta"** — Meta ACTIVE + impressões = 0 + < 24h desde publicação
- 🔴 **"Não está entregando"** — Meta ACTIVE há > 24h sem impressões → problema de pagamento ou segmentação muito restrita
- 🔴 **"Reprovado / pausado"** — Meta DISAPPROVED ou PAUSED → mostra motivo + botão "Tentar reativar" (já existe)

## Onde aparece

Dentro do card de cada campanha em **Anúncios → lista de campanhas**, logo abaixo das métricas atuais. Em mobile fica empilhado; em desktop fica em uma faixa horizontal.

## Mudanças técnicas

```text
supabase/functions/facebook-campaign-status/   ← NOVA edge function
  index.ts        chama Graph API /{fb_campaign_id}?fields=effective_status,issues_info
                  + /{adset_id}?fields=effective_status
                  retorna { status, delivery, issues[], last_impression_at }

src/components/admin/ads/
  CampaignsList.tsx        adiciona <CampaignHealthBadge campaign={c} metric={m} />
  CampaignHealthBadge.tsx  ← NOVO componente
                           - busca status ao vivo (cache 60s)
                           - calcula veredito
                           - renderiza badge grande + botão "Testar link agora"
                           - botão "Ver no Gerenciador de Anúncios" (deep link Meta)
```

Sem mudança de banco. A edge function só lê da Graph API com o token já salvo em `facebook_connections`.

## Fora de escopo

- Não vou mexer na criação/pausa de campanhas.
- Não vou mudar layout de outras seções.
- Não vou adicionar notificações por e-mail/push (pode virar próximo passo se quiser).
