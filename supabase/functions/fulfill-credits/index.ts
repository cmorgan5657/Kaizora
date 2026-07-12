// supabase/functions/fulfill-credits/index.ts
//
// Fulfills a Stripe credit-pack purchase when the user returns to /credits.
// Mirrors the Stripe webhook: sets the rolling 30-day expiry, logs a
// transaction, and is idempotent so it never double-credits alongside the
// webhook.
//
// Deploy:  supabase functions deploy fulfill-credits
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Single rolling expiry, 30 days flat — must match lib/creditExpiry.ts.
const CREDIT_EXPIRY_DAYS = 30;
const newCreditExpiry = () =>
  new Date(Date.now() + CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
const isCreditsExpired = (expiresAt: string | null | undefined) =>
  !!expiresAt && new Date(expiresAt).getTime() < Date.now();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { sessionId } = await req.json();
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    // 1. Verify the Stripe session is real, paid, and a credit purchase.
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return json({ error: "Payment not completed" }, 402);
    }
    if (session.metadata?.type !== "credits") {
      return json({ error: "Not a credit purchase" }, 400);
    }

    const userId = session.metadata.user_id;
    const credits = parseInt(session.metadata.credits ?? "0", 10);
    const packId = session.metadata.pack_id;

    if (!userId || credits <= 0) {
      return json({ error: "Invalid credit metadata" }, 400);
    }

    // 2. Idempotency — the Stripe webhook may fulfill this same session.
    //    If a transaction for it already exists, do nothing (avoid double-credit).
    const { data: already } = await supabaseAdmin
      .from("credit_transactions")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (already) {
      const { data: current } = await supabaseAdmin
        .from("user_credits")
        .select("balance, expires_at")
        .eq("user_id", userId)
        .maybeSingle();
      return json({
        success: true,
        alreadyFulfilled: true,
        balance: isCreditsExpired(current?.expires_at)
          ? 0
          : current?.balance ?? 0,
      });
    }

    // 3. Upsert balance with rolling expiry (reset if the old balance expired).
    const { data: existing } = await supabaseAdmin
      .from("user_credits")
      .select("balance, total_purchased, expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    let newBalance: number;

    if (existing) {
      const base = isCreditsExpired(existing.expires_at)
        ? 0
        : existing.balance || 0;
      newBalance = base + credits;
      await supabaseAdmin
        .from("user_credits")
        .update({
          balance: newBalance,
          total_purchased: (existing.total_purchased || 0) + credits,
          expires_at: newCreditExpiry(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } else {
      newBalance = credits;
      await supabaseAdmin.from("user_credits").insert({
        user_id: userId,
        balance: credits,
        total_purchased: credits,
        total_spent: 0,
        expires_at: newCreditExpiry(),
      });
    }

    // 4. Log the purchase (also the idempotency marker for step 2).
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: userId,
      amount: credits,
      type: "purchase",
      action: "credit_purchase",
      description: `Purchased ${packId} pack`,
      stripe_session_id: session.id,
    });

    return json({ success: true, balance: newBalance });
  } catch (err) {
    console.error("fulfill-credits error:", err);
    return json({ error: (err as Error).message ?? "Fulfillment failed" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
