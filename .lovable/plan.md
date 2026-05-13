## Diagnóstico encontrado

**Do I know what the issue is?** Sim.

O erro atual de publicação não é uma reprovação normal do Facebook: a Edge Function `facebook-create-campaign` está morrendo antes de responder.

### Evidência dos logs

- `facebook-create-campaign` retornou **status 546** após **42.047 ms**.
- O log mostra **`CPU Time exceeded`**.
- Isso significa que a função excedeu o limite de CPU do Supabase Edge Runtime e foi encerrada antes de concluir a publicação.
- Por isso nenhuma campanha nova apareceu em `facebook_campaigns`; a última campanha salva ainda é de `2026-05-12`.

### Causa principal

A função de publicação está fazendo trabalho pesado demais em uma única requisição:

1. Chama Meta API para criar campanha.
2. Cria conjunto de anúncios.
3. Para cada imagem:
   - baixa a imagem;
   - converte bytes para base64 com loop byte-a-byte;
   - chama validação Gemini;
   - envia imagem para o Meta.
4. Cria criativos/anúncios.
5. Tenta ativar campanha, adset e anúncios.
6. Ainda tenta notificar o consultor pelo WhatsApp antes de devolver resposta.

Esse conjunto estoura CPU, principalmente na conversão das imagens e na validação de imagem dentro do mesmo fluxo.

### Problema secundário encontrado

`facebook-preflight-check` também está chamando o campo Meta:

```text
connected_whatsapp_business_account
```

O Meta respondeu:

```text
(#100) Tried accessing nonexisting field (connected_whatsapp_business_account)
```

Esse erro aparece no pré-voo, mas hoje ele vira warning e não é o principal bloqueio. Mesmo assim, precisa ser corrigido para não confundir o sistema nem o usuário.

## Plano de correção

### 1. Destravar a publicação principal

Alterar `facebook-create-campaign` para reduzir CPU e responder dentro do limite:

- Remover a validação Gemini síncrona de dentro da publicação.
- Manter a publicação mesmo quando a análise de imagem não estiver disponível.
- Usar validação de imagem apenas como alerta/preflight separado, não como etapa obrigatória da criação.
- Trocar a conversão byte-a-byte de imagem para uma conversão base64 em chunks, reduzindo CPU.
- Limitar a quantidade de imagens processadas em uma tentativa rápida.
- Não chamar `notifyConsultant` antes de responder em erros críticos, porque isso adiciona chamadas externas e pode estourar o tempo de novo.

### 2. Corrigir o pré-voo do Facebook

Alterar `facebook-preflight-check` para parar de consultar o campo inválido `connected_whatsapp_business_account`.

Como a campanha atual usa link `wa.me` e objetivo `OUTCOME_TRAFFIC`, ela não deve bloquear publicação por WABA/WhatsApp Business vinculado à Página.

O pré-voo deve validar apenas:

- token válido;
- conta de anúncios ativa;
- página configurada;
- número de WhatsApp configurado;
- alcance estimado quando possível.

### 3. Melhorar a mensagem de erro para o usuário

Ajustar o frontend/serviço para quando a Edge Function retornar 546, timeout ou falha de rede:

- Exibir mensagem objetiva: “A publicação demorou demais no servidor. Reduzi o processamento e tente novamente.”
- Se o Meta retornar erro real, mostrar o motivo real do Meta.
- Evitar mensagem genérica “não consegui publicar” sem causa.

### 4. Garantir rastreio da causa real

Adicionar logs curtos e seguros por etapa em `facebook-create-campaign`:

```text
start
campaign_created
adset_created
image_uploaded
creative_created
ad_created
activation_attempted
success/error
```

Assim, se falhar de novo, será possível saber exatamente se parou em imagem, criativo, anúncio ou ativação.

### 5. Validar depois da correção

Depois de implementar:

- Deploy das funções corrigidas.
- Conferir logs de `facebook-create-campaign` e `facebook-preflight-check`.
- Testar uma chamada controlada da função ou validar pelo fluxo do app.
- Confirmar que o erro `CPU Time exceeded` não reaparece.
- Confirmar se uma campanha nova é gravada em `facebook_campaigns` ou se o Meta devolve um erro real e explicado.

## Resultado esperado

A publicação deve voltar a funcionar sem travar por CPU. Se o Facebook rejeitar por política, conta, criativo ou pagamento, o sistema deve mostrar o motivo real em português, em vez de apenas falhar ou travar.

<lov-actions>
<lov-open-history>View History</lov-open-history>
<lov-link url="https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions/facebook-create-campaign/logs">Logs da função de publicação</lov-link>
<lov-link url="https://supabase.com/dashboard/project/zlzasfhcxcznaprrragl/functions/facebook-preflight-check/logs">Logs do pré-voo Facebook</lov-link>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>