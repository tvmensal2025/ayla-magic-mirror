// Cria uma sessão de Checkout Stripe para recarregar a carteira do consultor.
// Requer auth do consultor. Após pagar, o webhook credita o saldo automaticamente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_CENTS = 5000;     // R$ 50
const MAX_CENTS = 500000;   // R$ 5.000

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return json({ error: "Pagamentos ainda não configurados pelo Super Admin." }, 503);
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const amountCents = Math.floor(Number(body.amount_cents || 0));
    if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return json({ error: `Valor inválido (mínimo R$ ${MIN_CENTS/100}, máximo R$ ${MAX_CENTS/100})` }, 400);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    const origin = req.headers.get("origin") || "https://igreen.institutodossonhos.com.br";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "brl",
          product_data: { name: "Recarga de carteira – Anúncios iGreen" },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      customer_email: user.email ?? undefined,
      metadata: { consultant_id: user.id, amount_cents: String(amountCents) },
      success_url: `${origin}/admin?tab=anuncios&topup=ok`,
      cancel_url: `${origin}/admin?tab=anuncios&topup=cancel`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("[wallet-create-topup]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}