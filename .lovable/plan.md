# Token Facebook inválido não pode quebrar o wizard

## Diagnóstico

Logs de `facebook-search-cities`:
```
[fbFetch] code=190 subcode=460 OAuthException
"Error validating access token: The session has been invalidated…"
```

O token Meta da consultora foi invalidado (mudança de senha / FB security). O Graph responde 400 em todo `/search`. Hoje:

- `fbFetch` (`_shared/fb-graph.ts:241`) faz `throw new Error(msg)` para 190 — correto, não retenta.
- No modo **bulk** isso vira `unresolved`, mas a busca **autocomplete** cai no `catch` (`facebook-search-cities/index.ts:117`) e devolve **HTTP 500** com `{ error, cities: [] }`.
- O front (`CreateCampaignWizard.tsx:284`) recebe 500 → `supabase.functions.invoke` joga erro → toast vermelho **"Falha na busca · Edge Function returned a non-2xx status code"** a cada letra digitada.
- Idem para qualquer outro passo do wizard que dependa do token (preflight, validate, search) — todos viram 500 e cospem toast.

O banner amarelo "Token expirado ou inválido — reconecte ao Facebook" já está visível no topo; o erro vermelho é redundante e atrapalha.

## Solução

Tratar **erro 190 (token inválido) como estado normal de UI**, não como exceção HTTP.

### 1. Helper compartilhado `fbFetch` (`supabase/functions/_shared/fb-graph.ts`)

Trocar o `throw new Error(msg)` por um erro tipado quando `e.code === 190` (ou `type === "OAuthException"`):

```ts
class FbAuthError extends Error {
  readonly code = 190;
  readonly subcode: number | null;
  readonly needsReconnect = true;
  constructor(msg: string, subcode: number | null) { super(msg); this.subcode = subcode; }
}
// dentro do !res.ok:
if (Number(e.code) === 190) throw new FbAuthError(msg, Number(e.error_subcode) || null);
```

Exportar `FbAuthError` para todas as edge functions reaproveitarem.

### 2. `facebook-search-cities/index.ts`

**Bulk:**
- No primeiro `FbAuthError` capturado dentro do loop, **abortar** o restante (já que nenhum outro item vai resolver) e marcar todos como `unresolved: { reason: "needs_reconnect" }`.
- Devolver **HTTP 200** com `{ cities, unresolved, needs_reconnect: true }`.

**Autocomplete:**
- Envolver `fbFetch(...)` em try/catch; se `err instanceof FbAuthError`, retornar `200 { cities: [], needs_reconnect: true }`.

Erros não-token continuam 500 (para não esconder bugs reais).

### 3. `src/services/facebookAds.ts`

`searchCities` e `searchCitiesBulk`: ler `data.needs_reconnect`. Quando `true`, **não jogar** — retornar a tupla normal (`[]` ou `{ cities, unresolved }`) e expor a flag:

```ts
export interface CitySearchResult { cities: CityHit[]; needsReconnect?: boolean }
```

Mantém retrocompat: callers que não leem a flag simplesmente recebem lista vazia.

### 4. `CreateCampaignWizard.tsx` e `UseTemplateDialog.tsx`

No catch de `searchCities`/`searchCitiesBulk`: **suprimir** o toast "Falha na busca" quando a resposta vier com `needsReconnect`. O banner amarelo do topo já comunica o problema. Para outras falhas, manter o toast.

Opcional: no campo de busca, quando `needsReconnect`, mostrar inline um `"Reconecte o Facebook para buscar cidades"` em vez de loading vazio.

## Arquivos a editar

- `supabase/functions/_shared/fb-graph.ts` — adicionar classe `FbAuthError` e usar dentro do `fbFetch`.
- `supabase/functions/facebook-search-cities/index.ts` — short-circuit bulk + autocomplete 200 quando token inválido.
- `src/services/facebookAds.ts` — propagar `needs_reconnect` sem throw.
- `src/components/admin/ads/CreateCampaignWizard.tsx` — suprimir toast em caso de `needsReconnect`.
- `src/components/admin/ads/UseTemplateDialog.tsx` — idem.

## Fora do escopo

- Implementar reconexão automática do token (já existe a UI manual).
- Refatorar todas as outras edges Facebook agora. Esta mudança no `fbFetch` é compatível: qualquer outra função que use `fbFetch` continua jogando erro como antes, só que agora identificável via `instanceof FbAuthError` quando quisermos aplicar o mesmo padrão.
