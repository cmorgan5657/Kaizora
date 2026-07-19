import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

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

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ hasCard: false });
    }

    let paymentMethods;
    try {
      paymentMethods = await stripe.paymentMethods.list({
        customer: profile.stripe_customer_id,
        type: "card",
        limit: 1,
      });
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === "resource_missing"
      ) {
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_customer_id: null })
          .eq("id", user.id);

        return NextResponse.json({ hasCard: false });
      }

      throw error;
    }

    if (!paymentMethods.data.length) {
      return NextResponse.json({ hasCard: false });
    }

    const card = paymentMethods.data[0].card;

    return NextResponse.json({
      hasCard: true,
      card: {
        brand: card?.brand || "card",
        last4: card?.last4 || "****",
        exp_month: card?.exp_month,
        exp_year: card?.exp_year,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to check card";
    console.error("Check card error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
