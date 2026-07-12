import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Stable API version (matches the prices created in /api/admin/plans).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as unknown as Stripe.LatestApiVersion,
});

// Start a recurring subscription checkout for a credit plan.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;
    if (!user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const { planId, couponCode } = await req.json();
    if (!planId || !user.email) {
      return NextResponse.json(
        { error: "Missing planId or user email" },
        { status: 400 },
      );
    }

    const { data: existingSub } = await supabaseAdmin
      .from("user_credit_subscriptions")
      .select("id, status, current_period_end")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due", "trialing", "unpaid"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSub) {
      return NextResponse.json(
        {
          error:
            "You already have an active subscription. Manage it from your credits page.",
        },
        { status: 409 },
      );
    }

    // Fetch the plan
    const { data: plan } = await supabaseAdmin
      .from("credit_plans")
      .select("id, name, credits, billing_interval, stripe_price_id, active")
      .eq("id", planId)
      .single();

    if (!plan || !plan.active || !plan.stripe_price_id) {
      return NextResponse.json(
        { error: "Plan not found or unavailable" },
        { status: 400 },
      );
    }

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const baseUrl = `${protocol}://${host}`;

    // Find or create the Stripe customer
    let customerId: string;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Resolve an optional coupon code for any subscription plan.
    // Stripe applies the promotion code directly during Checkout.
    let discounts: { promotion_code: string }[] | undefined;
    if (couponCode) {
      const promos = await stripe.promotionCodes.list({
        code: couponCode,
        active: true,
        limit: 1,
      });
      const promo = promos.data[0];
      if (!promo) {
        return NextResponse.json(
          { error: "Invalid or expired discount code." },
          { status: 400 },
        );
      }
      discounts = [{ promotion_code: promo.id }];
    }

    const metadata = {
      type: "credit_subscription",
      user_id: user.id,
      plan_id: plan.id,
      credits: String(plan.credits),
      billing_interval: plan.billing_interval,
    };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      ...(discounts ? { discounts } : {}),
      subscription_data: { metadata },
      metadata,
      success_url: `${baseUrl}/pricing?sub_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?sub_cancelled=true`,
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    console.error("Subscribe error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
