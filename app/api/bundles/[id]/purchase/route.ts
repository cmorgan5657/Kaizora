import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover" as any,
  maxNetworkRetries: 2,
  timeout: 20000,
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const userId = userData.user.id;

    // Fetch bundle
    const { data: bundle, error: bundleErr } = await supabaseAdmin
      .from("bundles")
      .select("*")
      .eq("id", id)
      .eq("is_public", true)
      .single();

    if (bundleErr || !bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    // Check already purchased
    const { data: existing } = await supabaseAdmin
      .from("bundle_purchases")
      .select("id")
      .eq("bundle_id", id)
      .eq("buyer_id", userId)
      .eq("status", "paid")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Already purchased this bundle" }, { status: 400 });
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: bundle.total_price_cents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: "bundle",
        bundle_id: id,
        buyer_id: userId,
      },
    });

    // Insert pending bundle purchase record
    await supabaseAdmin.from("bundle_purchases").insert({
      bundle_id: id,
      buyer_id: userId,
      amount_paid_cents: bundle.total_price_cents,
      stripe_payment_intent_id: paymentIntent.id,
      status: "pending",
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bundle_id: id,
      total_price_cents: bundle.total_price_cents,
    });
  } catch (e: any) {
    console.error("[bundles/purchase] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
