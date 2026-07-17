import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { createNotification } from "@/lib/notifications";
import { sendSubscriptionCancelledEmail } from "@/lib/email";
import {
  applyPendingPlanChangeIfDue,
  syncAnnualSubscriptionCreditsForRow,
} from "@/lib/creditSubscriptionSync";
import { buildCreditUpdate } from "@/lib/creditBuckets";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as unknown as Stripe.LatestApiVersion,
});

async function getPlan(planId: string) {
  const { data } = await supabaseAdmin
    .from("credit_plans")
    .select("id, name, price, credits, billing_interval, discount_percent")
    .eq("id", planId)
    .maybeSingle();

  return data;
}

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

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (auth.error) {
      return auth.error;
    }

    const { data: subscription } = await supabaseAdmin
      .from("user_credit_subscriptions")
      .select("*")
      .eq("user_id", auth.user.id)
      .in("status", ["active", "past_due", "trialing", "unpaid", "canceled"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return NextResponse.json({ subscription: null });
    }

    const periodEndMs = subscription.current_period_end
      ? new Date(subscription.current_period_end).getTime()
      : null;
    const hasFutureAccess = periodEndMs ? periodEndMs > Date.now() : false;

    if (subscription.status === "canceled" && !hasFutureAccess) {
      return NextResponse.json({ subscription: null });
    }

    const pendingResult = await applyPendingPlanChangeIfDue(subscription as any);
    if (pendingResult.applied) {
      subscription.plan_id = pendingResult.effectivePlanId;
      subscription.pending_plan_id = null;
      subscription.pending_change_effective_date = null;
    }

    await syncAnnualSubscriptionCreditsForRow({
      user_id: subscription.user_id,
      plan_id: subscription.plan_id,
      stripe_subscription_id: subscription.stripe_subscription_id,
      status: subscription.status,
      billing_interval: subscription.billing_interval || "month",
      credits_per_cycle: subscription.credits_per_cycle ?? 0,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      pending_plan_id: subscription.pending_plan_id || null,
      pending_change_effective_date:
        subscription.pending_change_effective_date || null,
    });

    const plan = await getPlan(subscription.plan_id);

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        plan_name: plan?.name || subscription.plan_id,
        price: plan?.price ?? null,
        credits: plan?.credits ?? subscription.credits_per_cycle ?? 0,
        billing_interval:
          plan?.billing_interval || subscription.billing_interval || "month",
        discount_percent: plan?.discount_percent ?? 0,
        status: subscription.status,
        stripe_subscription_id: subscription.stripe_subscription_id,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        pending_plan_id: subscription.pending_plan_id || null,
        pending_change_effective_date:
          subscription.pending_change_effective_date || null,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load subscription";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (auth.error) {
      return auth.error;
    }

    const { subscriptionId, immediate } = await req.json();
    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Missing subscriptionId" },
        { status: 400 },
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("user_credit_subscriptions")
      .select(
        "stripe_subscription_id, cancel_at_period_end, current_period_end, plan_id",
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

    // Cancel right now (ends access immediately, no more renewals).
    if (immediate) {
      await stripe.subscriptions.cancel(subscriptionId);
      await supabaseAdmin
        .from("user_credit_subscriptions")
        .update({
          status: "canceled",
          cancel_at_period_end: false,
          pending_plan_id: null,
          pending_change_effective_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", auth.user.id)
        .eq("stripe_subscription_id", subscriptionId);
      await supabaseAdmin
        .from("user_credits")
        .update(buildCreditUpdate(0, 0))
        .eq("user_id", auth.user.id);

      return NextResponse.json({
        success: true,
        immediate: true,
        message: "Subscription canceled immediately.",
      });
    }

    if (existing.cancel_at_period_end) {
      return NextResponse.json({
        success: true,
        message: "Subscription is already scheduled to cancel",
        currentPeriodEnd: existing.current_period_end,
      });
    }

    const canceledSubscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: true,
      },
    );
    const stripeSubscription = canceledSubscription as unknown as Stripe.Subscription & {
      current_period_end?: number | null;
    };

    await supabaseAdmin
      .from("user_credit_subscriptions")
      .update({
        status: stripeSubscription.status,
        cancel_at_period_end: true,
        current_period_end: stripeSubscription.current_period_end
          ? new Date(
              stripeSubscription.current_period_end * 1000,
            ).toISOString()
          : existing.current_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", auth.user.id)
      .eq("stripe_subscription_id", subscriptionId);

    // Notify the user their subscription will end at period end.
    // (Immediate cancellations are handled by the subscription.deleted webhook.)
    const accessUntil = stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
      : existing.current_period_end;
    const { data: planRow } = await supabaseAdmin
      .from("credit_plans")
      .select("name")
      .eq("id", existing.plan_id)
      .maybeSingle();
    createNotification({
      user_id: auth.user.id,
      type: "subscription_cancelled",
      title: "Subscription set to cancel",
      body: `Your ${planRow?.name || "subscription"} won't renew. You keep access until the period ends.`,
      link: "/pricing",
      metadata: { plan_id: existing.plan_id, access_until: accessUntil },
    });
    if (auth.user.email) {
      sendSubscriptionCancelledEmail({
        to: auth.user.email,
        planName: planRow?.name || "your plan",
        immediate: false,
        accessUntil,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      canceledAt: stripeSubscription.cancel_at,
      currentPeriodEnd: stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : existing.current_period_end,
      message: "Subscription will cancel at end of billing period",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel subscription";
    console.error("Error canceling credit subscription:", error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
