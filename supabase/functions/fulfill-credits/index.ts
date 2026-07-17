// supabase/functions/fulfill-credits/index.ts
//
// Fulfills a Stripe credit-pack purchase when the user returns to /credits.
// Mirrors the Stripe webhook and credits the permanent purchased bucket.
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

const getBuckets = (row: {
  subscription_credits?: number | null;
  purchased_credits?: number | null;
  balance?: number | null;
} | null | undefined) => {
  if (!row) {
    return { subscriptionCredits: 0, purchasedCredits: 0, totalBalance: 0 };
  }

  const hasExplicitBuckets =
    row.subscription_credits != null || row.purchased_credits != null;
  const subscriptionCredits = hasExplicitBuckets
    ? Math.max(0, Number(row.subscription_credits || 0))
    : 0;
  const purchasedCredits = hasExplicitBuckets
    ? Math.max(0, Number(row.purchased_credits || 0))
    : Math.max(0, Number(row.balance || 0));

  return {
    subscriptionCredits,
    purchasedCredits,
    totalBalance: subscriptionCredits + purchasedCredits,
  };
};

const buildCreditUpdate = (
  subscriptionCredits: number,
  purchasedCredits: number,
) => ({
  subscription_credits: Math.max(0, subscriptionCredits),
  purchased_credits: Math.max(0, purchasedCredits),
  balance: Math.max(0, subscriptionCredits) + Math.max(0, purchasedCredits),
  updated_at: new Date().toISOString(),
});

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
        .select("balance, subscription_credits, purchased_credits")
        .eq("user_id", userId)
        .maybeSingle();
      const buckets = getBuckets(current);
      return json({
        success: true,
        alreadyFulfilled: true,
        balance: buckets.totalBalance,
      });
    }

    // 3. Upsert balance into the permanent purchased bucket.
    const { data: existing } = await supabaseAdmin
      .from("user_credits")
      .select(
        "balance, total_purchased, subscription_credits, purchased_credits",
      )
      .eq("user_id", userId)
      .maybeSingle();

    let newBalance: number;

    if (existing) {
      const buckets = getBuckets(existing);
      const nextPurchasedCredits = buckets.purchasedCredits + credits;
      newBalance = buckets.subscriptionCredits + nextPurchasedCredits;
      await supabaseAdmin
        .from("user_credits")
        .update({
          ...buildCreditUpdate(
            buckets.subscriptionCredits,
            nextPurchasedCredits,
          ),
          total_purchased: (existing.total_purchased || 0) + credits,
        })
        .eq("user_id", userId);
    } else {
      newBalance = credits;
      await supabaseAdmin.from("user_credits").insert({
        user_id: userId,
        ...buildCreditUpdate(0, credits),
        total_purchased: credits,
        total_spent: 0,
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
