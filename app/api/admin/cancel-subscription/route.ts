import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

/**
 * EXPLANATION: This API cancels a subscription
 *
 * How it works:
 * 1. Receives Stripe subscription ID from frontend
 * 2. Tells Stripe to cancel at end of billing period (not immediately)
 * 3. Updates our database to mark it as "will cancel"
 * 4. User keeps access until period ends
 *
 * Why cancel_at_period_end?
 * - Fair to user - they paid for full month
 * - Better UX - no immediate loss of access
 * - Standard practice in SaaS
 */
export async function POST(req: NextRequest) {
  try {
    // Get subscription ID from request
    const { subscriptionId } = await req.json();

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Missing subscriptionId" },
        { status: 400 },
      );
    }

    // Tell Stripe to cancel subscription at period end
    // This means:
    // - User keeps access until billing period ends
    // - Stripe won't charge them again
    // - Webhook will notify us when it actually cancels
    const canceledSubscription = (await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: true, // Key setting - don't cancel immediately
      },
    )) as any;

    const payload = {
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from("user_subscriptions")
      .update(payload)
      .eq("stripe_subscription_id", subscriptionId);

    await supabaseAdmin
      .from("user_credit_subscriptions")
      .update({
        ...payload,
        status: canceledSubscription.status,
        current_period_end: canceledSubscription.current_period_end
          ? new Date(
              canceledSubscription.current_period_end * 1000,
            ).toISOString()
          : undefined,
      })
      .eq("stripe_subscription_id", subscriptionId);

    // Return success
    return NextResponse.json({
      success: true,
      canceledAt: canceledSubscription.cancel_at,
      message: "Subscription will cancel at end of billing period",
    });
  } catch (error: any) {
    console.error("Error canceling subscription:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to cancel subscription",
      },
      { status: 500 },
    );
  }
}
