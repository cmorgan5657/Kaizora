import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// The shared client is pinned to a very new API version ("clover") that changed
// coupon/promotion-code semantics. Use a stable version for discount ops so
// coupon + promotion code creation works with the standard params.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
});

// Discount codes are backed by Stripe (coupon + promotion code). Stripe enforces
// percent/amount off, first-time-only, expiry, and max redemptions for us.
// Matches the no-server-auth convention of /api/admin/pricing (page is admin-gated).

// GET — list all promotion codes with their coupon details
export async function GET() {
  try {
    const promos = await stripe.promotionCodes.list({
      limit: 100,
      expand: ["data.coupon"],
    });

    const discounts = promos.data
      .filter((promo) => promo.metadata?.archived !== "true")
      .map((promo) => {
        const p = promo as any;
        const coupon = p.coupon;
        return {
          id: p.id,
          code: p.code,
          active: p.active,
          name: coupon?.name ?? null,
          coupon_id: coupon?.id ?? null,
          percent_off: coupon?.percent_off ?? null,
          amount_off: coupon?.amount_off ?? null, // in cents
          first_time_only: p.restrictions?.first_time_transaction ?? false,
          max_redemptions: p.max_redemptions ?? null,
          times_redeemed: p.times_redeemed ?? 0,
          expires_at: p.expires_at ?? null, // unix seconds
          created: p.created,
        };
      });

    return NextResponse.json({ discounts });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load discounts" },
      { status: 500 },
    );
  }
}

// POST — create a coupon + promotion code
export async function POST(req: NextRequest) {
  try {
    const {
      code,
      percentOff,
      amountOff, // dollars
      firstTimeOnly,
      maxRedemptions,
      expiresAt, // ISO date/datetime string
      name,
    } = await req.json();

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }
    if (!percentOff && !amountOff) {
      return NextResponse.json(
        { error: "Provide a percent-off or amount-off value" },
        { status: 400 },
      );
    }

    const coupon = await stripe.coupons.create({
      duration: "once",
      name: name || code,
      ...(percentOff
        ? { percent_off: Number(percentOff) }
        : { amount_off: Math.round(Number(amountOff) * 100), currency: "usd" }),
    });

    const promo = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code,
      ...(maxRedemptions ? { max_redemptions: Number(maxRedemptions) } : {}),
      ...(expiresAt
        ? { expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) }
        : {}),
      ...(firstTimeOnly
        ? { restrictions: { first_time_transaction: true } }
        : {}),
    } as any);

    return NextResponse.json({ success: true, id: promo.id, code: promo.code });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create discount" },
      { status: 400 },
    );
  }
}

// PATCH — activate / deactivate a promotion code
export async function PATCH(req: NextRequest) {
  try {
    const { id, active } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    await stripe.promotionCodes.update(id, { active: !!active });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update discount" },
      { status: 400 },
    );
  }
}

// DELETE — archive a promotion code so it no longer appears in admin
export async function DELETE(req: NextRequest) {
  try {
    const { id, couponId } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await stripe.promotionCodes.update(id, {
      active: false,
      metadata: {
        archived: "true",
        archived_at: String(Math.floor(Date.now() / 1000)),
      },
    } as any);

    if (couponId) {
      try {
        await stripe.coupons.del(couponId);
      } catch {}
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete discount" },
      { status: 400 },
    );
  }
}
