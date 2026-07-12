import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";

// Public list of currently-usable discount codes for the pricing page.
// Stable API version (see /api/admin/discounts).
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as unknown as Stripe.LatestApiVersion,
});

type PromotionCodeWithCoupon = Stripe.PromotionCode & {
  coupon?: {
    percent_off?: number | null;
    amount_off?: number | null;
  } | null;
};

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    let userId: string | null = null;

    if (token) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id || null;
    }

    const promos = await stripe.promotionCodes.list({ active: true, limit: 50 });
    const now = Date.now();

    let codes = (promos.data as PromotionCodeWithCoupon[])
      .filter(
        (p) =>
          (!p.expires_at || p.expires_at * 1000 > now) &&
          (!p.max_redemptions || p.times_redeemed < p.max_redemptions),
      )
      .map((p) => ({
        code: p.code,
        percentOff: p.coupon?.percent_off ?? null,
        amountOff: p.coupon?.amount_off ?? null, // cents
        firstTimeOnly: p.restrictions?.first_time_transaction ?? false,
      }));

    // Hide first-time-only codes from returning customers (they can't use them).
    if (userId && codes.some((c) => c.firstTimeOnly)) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

      let hasPurchased = false;
      if (profile?.stripe_customer_id) {
        const charges = await stripe.charges.list({
          customer: profile.stripe_customer_id,
          limit: 1,
        });
        hasPurchased = charges.data.some((c) => c.paid);
      }

      if (hasPurchased) codes = codes.filter((c) => !c.firstTimeOnly);
    }

    return NextResponse.json({ codes });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load codes";
    return NextResponse.json(
      { codes: [], error: message },
      { status: 500 },
    );
  }
}
