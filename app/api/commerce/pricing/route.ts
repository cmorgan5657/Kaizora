import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { analyzePricing, buildMarketContext } from "@/lib/ai/pricingAgent";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !userData?.user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const userId = userData.user.id;
    const body = await req.json();
    const { asset_id } = body;

    if (!asset_id) {
      return NextResponse.json(
        { error: "asset_id is required" },
        { status: 400 },
      );
    }

    // Fetch the asset
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("assets")
      .select("*")
      .eq("id", asset_id)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (asset.owner_id !== userId) {
      return NextResponse.json({ error: "Not your asset" }, { status: 403 });
    }

    // Fetch commerce profile if exists
    const { data: profile } = await supabaseAdmin
      .from("asset_commerce_profiles")
      .select("*")
      .eq("asset_id", asset_id)
      .maybeSingle();

    // Count creator's total assets for context
    const { count: creatorAssetCount } = await supabaseAdmin
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);

    // ── Fetch live market data (same logic as /market endpoint) ─────────────
    const contentType = asset.content_type?.toLowerCase() ?? "";
    const { data: marketRows } = await supabaseAdmin
      .from("assets")
      .select("price_cents, purchases_count, category")
      .eq("is_public", true)
      .eq("content_type", contentType)
      .gt("price_cents", 0)
      .order("created_at", { ascending: false })
      .limit(500);

    let segmentRows = marketRows ?? [];
    let usedCategory: string | null = null;
    if (asset.category) {
      const cat = (marketRows ?? []).filter(
        (r) =>
          r.category?.toLowerCase().trim() ===
          asset.category?.toLowerCase().trim(),
      );
      if (cat.length >= 5) {
        segmentRows = cat;
        usedCategory = asset.category;
      }
    }

    const marketContext = buildMarketContext(segmentRows, contentType, usedCategory);

    // Run pricing analysis with market context
    const pricingResult = await analyzePricing({
      title: asset.title,
      description: asset.description,
      category: asset.category,
      tags: asset.tags,
      content_type: asset.content_type,
      current_price_cents: asset.price_cents,
      commerce_readiness_score: profile?.commerce_readiness_score,
      technical_quality_score: profile?.technical_quality_score,
      market_fit_score: profile?.market_fit_score,
      originality_proxy_score: profile?.originality_proxy_score,
      suggested_price_band: profile?.suggested_price_band,
      suggested_license_type: profile?.suggested_license_type,
      views_count: asset.views_count || 0,
      purchases_count: asset.purchases_count || 0,
      creator_asset_count: creatorAssetCount || 0,
      market_context: marketContext,
    });

    if (!pricingResult) {
      return NextResponse.json(
        { error: "Pricing analysis failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      pricing: pricingResult,
      market_context: marketContext,
      asset_id,
    });
  } catch (error: any) {
    console.error("Pricing agent error:", error);
    return NextResponse.json(
      { error: "Failed to analyze pricing", details: error.message },
      { status: 500 },
    );
  }
}
