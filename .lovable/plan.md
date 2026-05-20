## Diagnóstico

O erro do card é da Meta, não nosso:

```
Error validating access token: The session has been invalidated because
the user changed their password or Facebook has changed the session for
security reasons. | subcode=460 | code=190
```

Significa: o **token do Facebook do consultor** (Rafael Ferreiras) **foi invalidado pelo próprio Facebook** — provavelmente porque ele trocou a senha, encerrou sessões, ou a Meta expirou a sessão por segurança. Não há nada que o healthcheck possa fazer: clicar em "Tentar reativar" vai falhar de novo até o token ser renovado via OAuth.

Confirmação nos logs:
- `facebook-campaign-healthcheck` → `OAuthException code=190 subcode=460` (token revogado).
- A campanha "CPFL Paulista" do Rafael está **pausada** por esse motivo, não por saldo nem por política.

## Por que `explainRejection` não pegou esse caso amigavelmente

Em `CampaignsList.tsx` (`explainRejection`), o branch de token só dispara se a string contiver `"token"` + (`"expired" | "expirou" | "invalid"`). A mensagem real da Meta diz `"session has been invalidated"` — não bate em nenhum branch específico, cai no genérico "Erro ao publicar no Meta" + raw text. Por isso o cartão vermelho mostra o texto cru e o botão "Tentar reativar" que nunca vai funcionar.

## Plano

### 1. `src/components/admin/ads/CampaignsList.tsx` — melhorar diagnóstico

Em `explainRejection`, adicionar branch específico **antes** do branch genérico de token:

- Detectar `subcode=460`, `session has been invalidated`, `session for security reasons`, `code=190` → retornar:
  - **title**: "Conexão com Facebook expirou"
  - **suggestion**: "O Facebook invalidou a sessão (provavelmente por troca de senha ou segurança). Reconecte sua conta Facebook no card de conexão acima e republique a campanha. O botão 'Tentar reativar' não resolve esse caso."

Quando o motivo for token/sessão inválida, **esconder o botão "Tentar reativar"** (que não funciona) e mostrar um botão **"Reconectar Facebook"** que faz scroll/foco no card de conexão FB (componente `FacebookConnectionCard` ou similar) — ou simplesmente abre `https://www.facebook.com/settings` em nova aba, mas o ideal é scrollar para o card existente.

### 2. `supabase/functions/facebook-campaign-healthcheck/index.ts` — gravar motivo legível

Quando o fetch retornar `code=190` / `subcode=460`, atualizar `facebook_campaigns.rejection_reason` com uma string padronizada tipo:

```
SESSION_INVALIDATED: Token do Facebook foi invalidado (senha alterada ou
sessão encerrada por segurança). Reconecte a conta no painel.
```

Assim o front mostra mensagem amigável mesmo sem precisar parsear o texto cru da Meta toda vez.

### 3. Sinalizar globalmente no card de conexão Facebook

No componente que renderiza a conexão FB do consultor (provavelmente `FacebookConnectionCard` em `src/components/admin/ads/`), se houver pelo menos uma campanha com `rejection_reason` contendo `SESSION_INVALIDATED` ou `code=190`, mostrar badge vermelho "Token expirado — reconectar" com CTA destacado.

## Fora de escopo
- Renovar token automaticamente (não dá — exige re-OAuth do usuário).
- Mexer em saldo/carteira (já está R$ 240,89, OK).
- Alterar lógica de criação de campanha.

## Pergunta
Posso seguir com (1) + (2) + (3), ou prefere só (1) (UI clara) por enquanto?
