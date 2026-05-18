# Problema

No `/admin` o botão **"Reconectar / trocar conta"** não faz nada quando clicado. Investigação:

1. O handler atual (`handleConnect` em `PlatformFacebookCard.tsx`) chama `startFacebookOAuth({ scope: "platform" })` **sem `mode: "switch"`** — ou seja, mesmo se funcionasse, o Facebook reutilizaria a sessão atual e voltaria pra mesma conta sem permitir trocar.
2. Ele faz `window.location.href = res.url`. Como o preview do Lovable roda dentro de **iframe**, o Facebook (`facebook.com/dialog/oauth`) bloqueia carregamento em iframe via `X-Frame-Options` → a navegação é silenciosamente bloqueada e nada acontece visualmente. Por isso "clico e não faz nada".
3. O mesmo bug afeta o botão "Solicitar permissões faltando" e o "Conectar Facebook Business" inicial — todos usam `window.location.href`.

# Solução

Fazer o OAuth abrir em **nova aba** (com `window.open` disparado direto no clique, preservando o gesto do usuário pra não cair em popup blocker) e usar o **modo correto** em cada botão:

- "Reconectar / trocar conta" → `mode: "switch"` (Facebook força re-login e mostra seletor de conta)
- "Solicitar permissões faltando" → `mode: "rerequest"` (já correto)
- "Conectar Facebook Business" (estado desconectado) → `mode: "connect"`

Depois que a nova aba completar o OAuth (`facebook-oauth-callback` já redireciona pro `return_origin`), a aba do admin precisa recarregar o status. Solução simples: ao abrir a nova aba, iniciar um **polling de 3s** chamando `loadStatus()` enquanto a aba popup estiver aberta (`popup.closed === false`) ou por até 5 min, e parar quando detectar mudança em `last_validated_at` / `pixel_id` / `ad_account_id`.

# Arquivos alterados

**`src/components/admin/super/PlatformFacebookCard.tsx`** (única alteração de UI/lógica):

1. Criar helper `openOAuthInNewTab(mode)`:
   ```ts
   async function openOAuthInNewTab(mode: "connect" | "switch" | "rerequest") {
     // abre janela SINCRONAMENTE no clique (about:blank) pra evitar popup blocker
     const popup = window.open("about:blank", "fb_oauth", "width=600,height=750");
     if (!popup) { toast({ title: "Pop-up bloqueado", description: "Permita pop-ups deste site e tente de novo.", variant: "destructive" }); return; }
     setConnecting(true);
     try {
       const res = await startFacebookOAuth({ scope: "platform", mode });
       popup.location.href = res.url;
       // polling
       const started = Date.now();
       const prev = JSON.stringify({ a: status?.ad_account_id, p: status?.pixel_id, v: status?.last_validated_at });
       const interval = setInterval(async () => {
         if (popup.closed || Date.now() - started > 5 * 60_000) {
           clearInterval(interval); setConnecting(false); await loadStatus(); return;
         }
         try {
           const s = await getPlatformFacebookStatus();
           const now = JSON.stringify({ a: s?.ad_account_id, p: s?.pixel_id, v: s?.last_validated_at });
           if (now !== prev) { setStatus(s); if (s?.configured) loadBalance(); clearInterval(interval); setConnecting(false); try { popup.close(); } catch {} }
         } catch {}
       }, 3000);
     } catch (e: any) {
       try { popup.close(); } catch {}
       toast({ title: "Erro ao iniciar OAuth", description: e?.message, variant: "destructive" });
       setConnecting(false);
     }
   }
   ```
2. Trocar `handleConnect` (estado desconectado) → `openOAuthInNewTab("connect")`.
3. Botão "Reconectar / trocar conta" (linha 194) → `openOAuthInNewTab("switch")`.
4. Botão "Solicitar permissões faltando" (linha 267) → `openOAuthInNewTab("rerequest")`.
5. Remover funções antigas `handleConnect` / `handleRerequest` redundantes.

# Fora do escopo

- Não mexer no backend (`facebook-oauth-start` / `facebook-oauth-callback`) — já suporta `mode: switch | rerequest` e já redireciona pro `return_origin` no fim.
- Não mexer em outras telas que usam `startFacebookOAuth` com `scope: "user"` (não foi o problema reportado).
