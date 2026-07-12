import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { autoOptimizeBundleAfterCreate } from "@/lib/ai/bundleSearchOptimizationAgent";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const userId = userData.user.id;
    const { name, description, bundle_type, asset_ids } = await req.json();

    if (!name || !asset_ids || asset_ids.length < 2) {
      return NextResponse.json({ error: "Name and at least 2 assets required" }, { status: 400 });
    }

    // Fetch assets to get prices + verify ownership
    const { data: assets, error: assetErr } = await supabaseAdmin
      .from("assets")
      .select("id, price_cents, storage_path, thumbnail_path, owner_id")
      .in("id", asset_ids)
      .eq("owner_id", userId);

    if (assetErr || !assets || assets.length < 2) {
      return NextResponse.json({ error: "Assets not found or not yours" }, { status: 400 });
    }

    const total_price_cents = assets.reduce((sum, a) => sum + (a.price_cents || 0), 0);

    // Use first asset's thumbnail as bundle cover
    const thumbnail_url = (assets[0] as any)?.thumbnail_path || assets[0]?.storage_path || null;

    const { data: bundle, error } = await supabaseAdmin
      .from("bundles")
      .insert({
        creator_id: userId,
        name,
        description: description || null,
        bundle_type: bundle_type || "themed_series",
        asset_ids,
        total_price_cents,
        is_public: true,
        thumbnail_url,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fire-and-forget: auto-run search optimization + log decision
    autoOptimizeBundleAfterCreate({
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      bundle_type: bundle.bundle_type,
      asset_ids,
    });

    return NextResponse.json({ success: true, bundle });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
