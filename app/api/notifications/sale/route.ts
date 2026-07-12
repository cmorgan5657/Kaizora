import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendNewSaleEmail, sendPurchaseConfirmedEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const { asset_id, buyer_id, license_type_name, price_cents } =
      await req.json();

    if (!asset_id || !buyer_id || !license_type_name || price_cents == null) {
      return NextResponse.json(
        {
          error:
            "asset_id, buyer_id, license_type_name, and price_cents are required",
        },
        { status: 400 },
      );
    }

    // The caller (buyer) must match the buyer_id they're claiming
    if (userData.user.id !== buyer_id) {
      return NextResponse.json(
        { error: "Buyer mismatch" },
        { status: 403 },
      );
    }

    // Asset -> owner_id + title
    const { data: asset, error: assetErr } = await supabaseAdmin
      .from("assets")
      .select("id, owner_id, title")
      .eq("id", asset_id)
      .single();

    if (assetErr || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Seller name + email
    const { data: sellerProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", asset.owner_id)
      .single();

    const { data: sellerAuth } = await supabaseAdmin.auth.admin.getUserById(
      asset.owner_id,
    );
    const sellerEmail = sellerAuth?.user?.email;

    // Buyer name + email
    const { data: buyerProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", buyer_id)
      .single();

    const buyerEmail = userData.user.email || null;

    // Fire-and-forget — both helpers already swallow errors
    if (sellerEmail) {
      sendNewSaleEmail({
        to: sellerEmail,
        sellerName: sellerProfile?.display_name || "",
        assetTitle: asset.title || "Untitled",
        buyerName: buyerProfile?.display_name || "A KAIZORA user",
        priceCents: Number(price_cents) || 0,
        licenseType: String(license_type_name),
      }).catch(() => {});
    }

    if (buyerEmail) {
      sendPurchaseConfirmedEmail({
        to: buyerEmail,
        buyerName: buyerProfile?.display_name || "",
        assetTitle: asset.title || "Untitled",
        sellerName: sellerProfile?.display_name || "A KAIZORA creator",
        priceCents: Number(price_cents) || 0,
        licenseType: String(license_type_name),
      }).catch(() => {});
    }

    // In-app notifications (fire-and-forget)
    const assetTitle = asset.title || "Untitled";
    const buyerName = buyerProfile?.display_name || "A KAIZORA user";
    try {
      createNotification({
        user_id: asset.owner_id,
        type: "new_sale",
        title: "🎉 New sale!",
        body: `${buyerName} bought "${assetTitle}"`,
        link: "/creator/earnings",
        metadata: {
          price_cents: Number(price_cents) || 0,
          license_type_name: String(license_type_name),
        },
      }).catch(() => {});
    } catch {
      // ignore
    }
    try {
      createNotification({
        user_id: buyer_id,
        type: "purchase_confirmed",
        title: "Purchase confirmed",
        body: `You purchased "${assetTitle}"`,
        link: "/library",
        metadata: {
          price_cents: Number(price_cents) || 0,
          license_type_name: String(license_type_name),
        },
      }).catch(() => {});
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[notifications/sale] error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
