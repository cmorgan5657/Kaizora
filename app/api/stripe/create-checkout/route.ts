import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  try {
    const { planId, userId, email } = await req.json();

    if (!planId || !userId || !email) {
      return NextResponse.json(
        { error: "Missing planId, userId, or email" },
        { status: 400 }
      );
    }

    // Get plan details from database
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (!plan || !plan.stripe_price_id) {
      return NextResponse.json(
        { error: "Plan not found or not connected to Stripe" },
        { status: 404 }
      );
    }

    // Get base URL from request headers
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const baseUrl = `${protocol}://${host}`;

    // ✅ FIX: Create or get Stripe customer first
    let customerId: string;

    // Check if user already has a stripe customer ID
    const { data: existingSub } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .not("stripe_customer_id", "is", null)
      .single();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          user_id: userId,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session with existing customer
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: "subscription",
      customer: customerId, // ✅ Use existing customer
      success_url: `${baseUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/`,
      metadata: {
        plan_id: planId,
        user_id: userId,
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error("Checkout session error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
