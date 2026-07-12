import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Stable API version for promo-code operations (see /api/admin/discounts).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as unknown as Stripe.LatestApiVersion,
});

type PromotionCodeWithCoupon = Stripe.PromotionCode & {
  coupon?: {
    percent_off?: number | null;
    amount_off?: number | null;
  } | null;
};

// Validates a discount code (Stripe promotion code) for the pricing page and,
// for first-time-only codes, checks whether this user is actually eligible
// (no prior successful payment). Stripe still enforces this at checkout.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json(
        { valid: false, error: "Enter a code" },
        { status: 400 },
      );
    }

    const promos = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });
    const promo = promos.data[0] as PromotionCodeWithCoupon | undefined;

    if (!promo) {
      return NextResponse.json({ valid: false, error: "Invalid code" });
    }
    if (promo.expires_at && promo.expires_at * 1000 < Date.now()) {
      return NextResponse.json({ valid: false, error: "Code has expired" });
    }
    if (
      promo.max_redemptions &&
      promo.times_redeemed >= promo.max_redemptions
    ) {
      return NextResponse.json({
        valid: false,
        error: "Code fully redeemed",
      });
    }

    const firstTimeOnly = promo.restrictions?.first_time_transaction ?? false;

    // First-time-only: check if this user has already made a payment.
    let userId: string | null = null;
    if (token) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id || null;
    }

    let eligible = true;
    if (firstTimeOnly && userId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.stripe_customer_id) {
        const charges = await stripe.charges.list({
          customer: profile.stripe_customer_id,
          limit: 1,
        });
        if (charges.data.some((c) => c.paid)) eligible = false;
      }
    }

    const coupon = promo.coupon;
    return NextResponse.json({
      valid: true,
      eligible,
      code: promo.code,
      percentOff: coupon?.percent_off ?? null,
      amountOff: coupon?.amount_off ?? null, // cents
      firstTimeOnly,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Could not validate code";
    return NextResponse.json(
      { valid: false, error: message },
      { status: 500 },
    );
  }
}
