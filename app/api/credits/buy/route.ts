import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Stable API version for resolving promo codes (see /api/admin/discounts).
const stripeStable = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as unknown as Stripe.LatestApiVersion,
});

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

    const { packId, couponCode } = await req.json();

    if (!packId || !user.email) {
      return NextResponse.json(
        { error: "Missing packId or user email" },
        { status: 400 }
      );
    }

    // Fetch pack from DB
    const { data: pack, error: packError } = await supabaseAdmin
      .from("credit_packs")
      .select("id, name, price, credits, active, tier")
      .eq("id", packId)
      .single();

    if (packError || !pack || !pack.active) {
      return NextResponse.json(
        { error: "Pack not found or inactive" },
        { status: 400 }
      );
    }

    const durationDays = pack.tier === "year" ? 365 : 30;

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host");
    const baseUrl = `${protocol}://${host}`;

    // Find or create Stripe customer
    let customerId: string;

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (existingProfile?.stripe_customer_id) {
      customerId = existingProfile.stripe_customer_id;
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

    // Resolve an optional discount code to its Stripe promotion code.
    let discounts: { promotion_code: string }[] | undefined;
    if (couponCode) {
      const promos = await stripeStable.promotionCodes.list({
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

    // Create one-time payment checkout session
    // pack.price is in dollars from DB, Stripe needs cents
    // setup_future_usage saves the card for auto top-up charges later
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `KAIZORA ${pack.name}`,
              description: `${pack.credits} credits — valid for ${durationDays} days`,
            },
            unit_amount: pack.price * 100, // dollars to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer: customerId,
      ...(discounts ? { discounts } : {}),
      payment_intent_data: {
        setup_future_usage: "off_session",
      },
      success_url: `${baseUrl}/pricing?credit_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?credit_cancelled=true`,
      metadata: {
        type: "credits",
        pack_id: packId,
        user_id: user.id,
        credits: pack.credits.toString(),
        duration_days: durationDays.toString(),
      },
    });

    return NextResponse.json({
      success: true,
      url: session.url,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Checkout failed";
    console.error("Credit checkout error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
