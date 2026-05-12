// Busca cidades brasileiras via Marketing API search endpoint.
// Suporta dois modos:
//   { q: "Campinas" }                              -> autocomplete (busca solta no FB, sem cache)
//   { bulk: [{ name, uf }, ...] }                  -> resolve várias cidades de uma vez
//                                                     consultando cache `fb_city_cache` primeiro
//                                                     e gravando o que faltar.
import { adminClient, authConsultant, corsHeaders, fbFetch, loadCampaignConnection, loadConnection } from "../_shared/fb-graph.ts";

interface BulkItem { name: string; uf: string }

// UF (sigla) -> nome do estado retornado pelo Meta no campo `region`.
const UF_NAME: Record<string, string> = {
  AC: "acre", AL: "alagoas", AP: "amapá", AM: "amazonas", BA: "bahia",
  CE: "ceará", DF: "distrito federal", ES: "espírito santo", GO: "goiás",
  MA: "maranhão", MT: "mato grosso", MS: "mato grosso do sul", MG: "minas gerais",
  PA: "pará", PB: "paraíba", PR: "paraná", PE: "pernambuco", PI: "piauí",
  RJ: "rio de janeiro", RN: "rio grande do norte", RS: "rio grande do sul",
  RO: "rondônia", RR: "roraima", SC: "santa catarina", SP: "são paulo",
  SE: "sergipe", TO: "tocantins",
};
function regionMatchesUf(region: string | null | undefined, uf: string): boolean {
  if (!region) return false;
  const r = region.toLowerCase().trim();
  const target = UF_NAME[uf.toUpperCase()];
  if (!target) return false;
  return r === target || r.includes(target);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await authConsultant(req);
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const conn = await loadCampaignConnection(auth.id) ?? await loadConnection(auth.id);
    if (!conn) return new Response(JSON.stringify({ error: "Sem conexão Facebook" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ---------- BULK MODE ----------
    if (Array.isArray(body?.bulk)) {
      const items: BulkItem[] = body.bulk
        .filter((x: any) => x && typeof x.name === "string" && typeof x.uf === "string")
        .slice(0, 60);
      const admin = adminClient();

      // 1) busca tudo do cache de uma vez
      const names = items.map((i) => i.name);
      const ufs = Array.from(new Set(items.map((i) => i.uf)));
      const { data: cached } = await admin
        .from("fb_city_cache")
        .select("name, uf, fb_key, region, region_id, country_code")
        .in("uf", ufs)
        .in("name", names);
      const cacheMap = new Map<string, any>();
      for (const c of cached || []) cacheMap.set(`${c.name}|${c.uf}`, c);

      const results: any[] = [];
      const toInsert: any[] = [];
      const unresolved: { name: string; uf: string; reason: string }[] = [];
      const toInvalidate: { name: string; uf: string }[] = [];
      for (const it of items) {
        const cKey = `${it.name}|${it.uf}`;
        const hit = cacheMap.get(cKey);
        // Cache só vale se a região bater com a UF — protege contra entradas
        // antigas resolvidas erradas (ex.: "Resende" caindo em RJ no cache de SP).
        if (hit && regionMatchesUf(hit.region, it.uf)) {
          results.push({ key: hit.fb_key, name: hit.name, region: hit.region, region_id: hit.region_id, country_code: hit.country_code, type: "city" });
          continue;
        }
        if (hit) {
          // cache inválido — vamos refazer o lookup e sobrescrever
          toInvalidate.push({ name: it.name, uf: it.uf });
        }
        // 2) consulta o FB pra cidades faltantes
        try {
          const url = `/search?location_types=["city"]&type=adgeolocation&country_code=BR&q=${encodeURIComponent(it.name)}&limit=15&access_token=${conn.token}`;
          const json = await fbFetch(url);
          const list = (json.data || []) as any[];
          // Match ESTRITO por UF — não cair em homônimo de outro estado
          const match = list.find((h) => regionMatchesUf(h.region, it.uf));
          if (match?.key) {
            results.push({ key: match.key, name: it.name, region: match.region, region_id: match.region_id, country_code: match.country_code || "BR", type: "city" });
            toInsert.push({ name: it.name, uf: it.uf, fb_key: match.key, region: match.region ?? null, region_id: match.region_id ?? null, country_code: match.country_code || "BR" });
          } else {
            unresolved.push({ name: it.name, uf: it.uf, reason: list.length ? "homônimo em outro estado" : "não encontrada no Meta" });
            console.warn("[fb-search-cities bulk] no UF match for", it.name, it.uf, "candidates:", list.map((h) => `${h.name}/${h.region}`).join(", "));
          }
        } catch (e) {
          console.warn("[fb-search-cities bulk] fail", it.name, (e as Error).message);
          unresolved.push({ name: it.name, uf: it.uf, reason: (e as Error).message });
        }
      }

      if (toInvalidate.length) {
        // remove entradas erradas do cache antes do upsert (evita ON CONFLICT silencioso manter o errado)
        for (const x of toInvalidate) {
          await admin.from("fb_city_cache").delete().eq("name", x.name).eq("uf", x.uf);
        }
      }
      if (toInsert.length) {
        await admin.from("fb_city_cache").upsert(toInsert, { onConflict: "name,uf" });
      }
      return new Response(JSON.stringify({ cities: results, unresolved, cached: items.length - toInsert.length - unresolved.length, fetched: toInsert.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------- AUTOCOMPLETE MODE ----------
    const q = body?.q;
    if (!q || q.length < 2) return new Response(JSON.stringify({ cities: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const url = `/search?location_types=["city"]&type=adgeolocation&country_code=BR&q=${encodeURIComponent(q)}&limit=15&access_token=${conn.token}`;
    const json = await fbFetch(url);
    const cities = (json.data || []).map((c: any) => ({
      key: c.key, name: c.name, region: c.region, region_id: c.region_id,
      type: c.type, country_code: c.country_code,
    }));
    return new Response(JSON.stringify({ cities }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message, cities: [] }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
