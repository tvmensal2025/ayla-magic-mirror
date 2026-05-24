// Edge: flow-simulate-run
// Simulador do fluxo conversacional. Atualmente em modo manutenção:
// retorna uma resposta amigável em vez de tentar executar o motor real,
// porque o engine não pode ser importado de outra função no edge-runtime.
// O simulador deve ser reescrito para usar o motor movido para _shared/.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "unauthenticated" }, 401);

    // Body é aceito mas ignorado por enquanto.
    await req.json().catch(() => ({}));

    return json({
      maintenance: true,
      events: [
        {
          kind: "text",
          text:
            "🛠️ O simulador está temporariamente em manutenção. Para testar o fluxo, envie uma mensagem real para o seu WhatsApp conectado. (Status: aguardando refactor do motor para módulo compartilhado.)",
        },
      ],
      customer_state: null,
    });
  } catch (e) {
    return json({ error: "internal", detail: String((e as Error)?.message || e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
