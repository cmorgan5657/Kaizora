import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getPlanMonthlyCredits } from "@/lib/creditBuckets";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as unknown as Stripe.LatestApiVersion,
});

async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data } = await supabaseAdmin.auth.getUser(token);
  if (!data?.user) {
    return { error: NextResponse.json({ error: "Invalid user" }, { status: 401 }) };
  }

  return { user: data.user };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (auth.error) {
      return auth.error;
    }

    const { subscriptionId, planId } = await req.json();
    if (!subscriptionId || !planId) {
      return NextResponse.json(
        { error: "Missing subscriptionId or planId" },
        { status: 400 },
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("user_credit_subscriptions")
      .select(
        "stripe_subscription_id, plan_id, current_period_end, credits_per_cycle",
      )
      .eq("user_id", auth.user.id)
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    if (existing.plan_id === planId) {
      return NextResponse.json(
        { error: "You are already on this plan." },
        { status: 400 },
      );
    }

    const { data: plan } = await supabaseAdmin
      .from("credit_plans")
      .select("id, name, stripe_price_id, active, credits")
      .eq("id", planId)
      .maybeSingle();

    if (!plan || !plan.active || !plan.stripe_price_id) {
      return NextResponse.json(
        { error: "Plan not found or unavailable" },
        { status: 400 },
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Stripe customer not found for this account" },
        { status: 400 },
      );
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });
    const subscriptionItem = subscription.items.data[0];

    if (!subscriptionItem?.id) {
      return NextResponse.json(
        { error: "Subscription item not found" },
        { status: 400 },
      );
    }

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const baseUrl = `${protocol}://${host}`;
    const currentPlanCredits = getPlanMonthlyCredits(
      existing.plan_id,
      existing.credits_per_cycle,
    );
    const nextPlanCredits = getPlanMonthlyCredits(plan.id, plan.credits);

    if (nextPlanCredits <= currentPlanCredits) {
      await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscriptionItem.id,
            price: plan.stripe_price_id,
            quantity: subscriptionItem.quantity ?? 1,
          },
        ],
        proration_behavior: "none",
      });

      await supabaseAdmin
        .from("user_credit_subscriptions")
        .update({
          pending_plan_id: plan.id,
          pending_change_effective_date: existing.current_period_end,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", auth.user.id)
        .eq("stripe_subscription_id", subscriptionId);

      return NextResponse.json({
        success: true,
        deferred: true,
        effectiveDate: existing.current_period_end,
        message: "Downgrade scheduled for the next billing cycle.",
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/pricing`,
      flow_data: {
        type: "subscription_update_confirm",
        after_completion: {
          type: "redirect",
          redirect: {
            return_url: `${baseUrl}/pricing?portal_success=true`,
          },
        },
        subscription_update_confirm: {
          subscription: subscriptionId,
          items: [
            {
              id: subscriptionItem.id,
              price: plan.stripe_price_id,
              quantity: subscriptionItem.quantity ?? 1,
            },
          ],
        },
      },
    });

    return NextResponse.json({
      success: true,
      url: session.url,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create Stripe portal session";
    console.error("Error creating Stripe portal session:", error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
