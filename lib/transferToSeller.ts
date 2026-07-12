import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getPlatformFeePercent } from "@/app/api/admin/platform-fee/route";
import { getRoyaltyPercent } from "@/app/api/admin/royalty/route";
import { createNotification } from "@/lib/notifications";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-12-15.clover" as any,
});

export interface TransferParams {
  seller_id: string;
  amount_cents: number;
  asset_id?: string;
  skip_fee?: boolean;
  items?: { asset_id: string; price_cents: number }[];
}

export interface TransferResult {
  success: boolean;
  error?: string;
  transfer_id?: string;
  sale_total_cents?: number;
  platform_fee_percent?: number;
  platform_fee_cents?: number;
  royalty_cents?: number;
  amount_transferred?: number;
}

/**
 * Splits a sale: platform fee stays, the original creator's royalty is recorded
 * and (if they're Stripe-connected) paid, and the remainder is transferred to
 * the seller. Callable directly from server code — no HTTP self-call.
 *
 * Royalties are recorded as 'pending' BEFORE the seller Stripe check, so the
 * original creator's cut is never lost even if the seller isn't onboarded.
 */
export async function transferToSeller(
  params: TransferParams,
): Promise<TransferResult> {
  const { seller_id, amount_cents, asset_id, skip_fee, items } = params;

  console.log("💸 Transfer request:", {
    seller_id,
    amount_cents,
    asset_id,
    skip_fee,
  });

  if (!seller_id || !amount_cents) {
    return { success: false, error: "Missing seller_id or amount_cents" };
  }

  // Platform fee — single source of truth.
  // skip_fee=true is for callers (e.g. bundle complete) that already deducted it.
  const feePercent = skip_fee ? 0 : await getPlatformFeePercent();
  const platformFeeCents = Math.floor((amount_cents * feePercent) / 100);

  // ── Creator royalty split ──
  const saleItems: { asset_id: string; price_cents: number }[] =
    Array.isArray(items) && items.length > 0
      ? items
      : asset_id
        ? [{ asset_id, price_cents: amount_cents }]
        : [];

  let totalRoyaltyCents = 0;
  const royalties: {
    creatorId: string;
    assetId: string;
    assetTitle: string;
    salePrice: number;
    royaltyCents: number;
    payoutRowId?: string | null;
  }[] = [];

  if (!skip_fee && saleItems.length > 0) {
    const royaltyPercent = await getRoyaltyPercent();
    const assetIds = saleItems.map((i) => i.asset_id).filter(Boolean);
    const { data: assetRows } = await supabaseAdmin
      .from("assets")
      .select("id, title, origin_creator_id, origin_license")
      .in("id", assetIds);
    const assetMap = new Map((assetRows || []).map((a: any) => [a.id, a]));

    for (const item of saleItems) {
      const a = assetMap.get(item.asset_id);
      if (!a) continue;
      if (
        a.origin_license === "commercial" &&
        a.origin_creator_id &&
        a.origin_creator_id !== seller_id
      ) {
        const royaltyCents = Math.floor(
          (item.price_cents * royaltyPercent) / 100,
        );
        if (royaltyCents > 0) {
          totalRoyaltyCents += royaltyCents;
          royalties.push({
            creatorId: a.origin_creator_id,
            assetId: item.asset_id,
            assetTitle: a.title || "your asset",
            salePrice: item.price_cents,
            royaltyCents,
          });
        }
      }
    }
  }

  const sellerPayout = amount_cents - platformFeeCents - totalRoyaltyCents;

  // ── Record every royalty as 'pending' up-front (before the Stripe check) ──
  for (const r of royalties) {
    const { data: payoutRow, error: payoutErr } = await supabaseAdmin
      .from("royalty_payouts")
      .insert({
        original_creator_id: r.creatorId,
        seller_id,
        asset_id: r.assetId,
        sale_price_cents: r.salePrice,
        royalty_cents: r.royaltyCents,
        stripe_transfer_id: null,
        status: "pending",
      })
      .select("id")
      .single();
    if (payoutErr) {
      console.error("❌ Failed to record royalty payout:", payoutErr);
    }
    r.payoutRowId = payoutRow?.id ?? null;

    // Notify the original creator that they earned a royalty.
    createNotification({
      user_id: r.creatorId,
      type: "royalty_earned",
      title: "💰 Royalty earned",
      body: `You earned $${(r.royaltyCents / 100).toFixed(2)} from a resale of "${r.assetTitle}"`,
      link: "/creator/earnings",
      metadata: { asset_id: r.assetId, royalty_cents: r.royaltyCents },
    });
  }

  // ── Seller's Stripe account ──
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id, stripe_onboarding_status")
    .eq("id", seller_id)
    .single();

  if (!profile?.stripe_account_id) {
    console.log("⚠️ Seller has no Stripe account");
    return { success: false, error: "Seller not connected" };
  }

  if (profile.stripe_onboarding_status !== "completed") {
    console.log("⚠️ Seller Stripe incomplete");
    return { success: false, error: "Seller Stripe incomplete" };
  }

  console.log(
    "💰 Sale total:",
    amount_cents,
    "| Platform fee:",
    platformFeeCents,
    "| Royalty:",
    totalRoyaltyCents,
    "| Seller gets:",
    sellerPayout,
  );

  // Transfer (sale total − platform fee − royalty) to the seller.
  const transfer = await stripe.transfers.create({
    amount: sellerPayout,
    currency: "usd",
    destination: profile.stripe_account_id,
    description: `Payout for asset ${asset_id}`,
  });

  console.log("✅ Seller transfer created:", transfer.id);

  // ── Pay each original creator their royalty; flip its row to 'paid' ──
  for (const r of royalties) {
    try {
      const { data: creatorProfile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_account_id, stripe_onboarding_status")
        .eq("id", r.creatorId)
        .single();
      if (
        creatorProfile?.stripe_account_id &&
        creatorProfile.stripe_onboarding_status === "completed"
      ) {
        const royaltyTransfer = await stripe.transfers.create({
          amount: r.royaltyCents,
          currency: "usd",
          destination: creatorProfile.stripe_account_id,
          description: `Creator royalty for asset ${r.assetId}`,
        });
        if (r.payoutRowId) {
          await supabaseAdmin
            .from("royalty_payouts")
            .update({
              stripe_transfer_id: royaltyTransfer.id,
              status: "paid",
            })
            .eq("id", r.payoutRowId);
        }
        console.log(
          `✅ Royalty paid to creator ${r.creatorId}: $${r.royaltyCents / 100}`,
        );
      } else {
        console.log(
          `⚠️ Creator ${r.creatorId} has no Stripe — royalty stays pending`,
        );
      }
    } catch (e) {
      console.error("❌ Royalty transfer failed — royalty stays pending:", e);
    }
  }

  return {
    success: true,
    transfer_id: transfer.id,
    sale_total_cents: amount_cents,
    platform_fee_percent: feePercent,
    platform_fee_cents: platformFeeCents,
    royalty_cents: totalRoyaltyCents,
    amount_transferred: sellerPayout,
  };
}
