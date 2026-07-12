import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getPlatformFeePercent } from "@/app/api/admin/platform-fee/route";

// Called client-side after Stripe payment succeeds
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const userId = userData.user.id;
    const { stripe_payment_intent_id } = await req.json();

    // Fetch bundle
    const { data: bundle } = await supabaseAdmin
      .from("bundles")
      .select("*")
      .eq("id", id)
      .single();

    if (!bundle) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });

    // Mark bundle purchase as paid
    await supabaseAdmin
      .from("bundle_purchases")
      .update({ status: "paid" })
      .eq("bundle_id", id)
      .eq("buyer_id", userId)
      .eq("status", "pending");

    // Fetch asset details for purchased_assets inserts
    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id, price_cents, owner_id")
      .in("id", bundle.asset_ids);

    if (assets && assets.length > 0) {
      // Insert each asset into purchased_assets (ownership)
      const purchasedRows = assets.map((asset) => ({
        buyer_id: userId,
        seller_id: asset.owner_id,
        asset_id: asset.id,
        listing_id: null,
        purchase_price: asset.price_cents,
        purchased_at: new Date().toISOString(),
      }));

      await supabaseAdmin
        .from("purchased_assets")
        .upsert(purchasedRows, { onConflict: "buyer_id,asset_id", ignoreDuplicates: true });

      // Update purchases_count on each asset
      for (const asset of assets) {
        try {
          const { error: rpcErr } = await supabaseAdmin.rpc("increment_purchases_count", { asset_id: asset.id });
          if (rpcErr) throw rpcErr;
        } catch {
          await supabaseAdmin
            .from("assets")
            .update({ purchases_count: (asset as any).purchases_count + 1 })
            .eq("id", asset.id);
        }
      }

      // Use dynamic platform fee for both transaction record + seller transfer
      const feePercent = await getPlatformFeePercent();
      const platformFeeCents = Math.floor((bundle.total_price_cents * feePercent) / 100);
      const sellerAmount = bundle.total_price_cents - platformFeeCents;

      // Log transaction
      await supabaseAdmin.from("transactions").insert({
        buyer_id: userId,
        creator_id: bundle.creator_id,
        listing_id: null,
        stripe_payment_intent_id: stripe_payment_intent_id || null,
        amount_cents: bundle.total_price_cents,
        platform_fee_cents: platformFeeCents,
        currency: "usd",
        status: "paid",
      });

      // Transfer to seller — sellerAmount already has fee deducted, so skip_fee=true
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("supabase.co", "vercel.app") || ""}/api/stripe/transfer-to-seller`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seller_id: bundle.creator_id,
            amount_cents: sellerAmount,
            asset_id: bundle.asset_ids[0],
            skip_fee: true,
          }),
        });
      } catch (transferErr) {
        console.warn("[bundle/complete] seller transfer failed:", transferErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[bundles/complete] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
