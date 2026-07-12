import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { analyzePricing, buildMarketContext } from "@/lib/ai/pricingAgent";

/**
 * POST /api/commerce/pricing/market
 *
 * Market-aware pricing that:
 * 1. Pulls real published Kaizora assets of the same content_type + optional category
 * 2. Weights assets that actually sold (purchases_count > 0) as "proven" ground truth
 * 3. Feeds live market stats into the pricing agent — self-improves as more assets sell
 *
 * No asset_id needed — works for temp assets before materialization.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      content_type,
      category,
      tags,
      commerce_readiness_score,
      technical_quality_score,
      market_fit_score,
      originality_proxy_score,
      suggested_price_band,
      suggested_license_type,
      title,
      description,
    } = body;

    if (!content_type) {
      return NextResponse.json(
        { error: "content_type is required" },
        { status: 400 },
      );
    }

    // ── Step 1: Fetch published assets in the same content_type segment ──────
    // Primary query: exact content_type match, paid assets (price > 0)
    const { data: sameTypeRows } = await supabaseAdmin
      .from("assets")
      .select("price_cents, purchases_count, category, tags")
      .eq("is_public", true)
      .eq("content_type", content_type.toLowerCase())
      .gt("price_cents", 0)
      .order("created_at", { ascending: false })
      .limit(500);

    const allRows = sameTypeRows ?? [];

    // ── Step 2: Narrow to same category if we have enough data ───────────────
    let segmentRows = allRows;
    let usedCategory: string | null = null;

    if (category) {
      const categoryRows = allRows.filter(
        (r) =>
          r.category?.toLowerCase().trim() === category.toLowerCase().trim(),
      );
      // Use category-filtered data only if we have at least 5 assets; otherwise use all
      if (categoryRows.length >= 5) {
        segmentRows = categoryRows;
        usedCategory = category;
      }
    }

    // ── Step 3: Build market context ─────────────────────────────────────────
    const marketContext = buildMarketContext(
      segmentRows,
      content_type,
      usedCategory,
    );

    console.log(
      `[pricing/market] segment: ${content_type}${usedCategory ? `/${usedCategory}` : ""} | ` +
        `${marketContext.sample_count} assets | proven: ${marketContext.proven_sample_count} | ` +
        `median: $${((marketContext.median_price_cents || 0) / 100).toFixed(2)} | ` +
        `proven_median: ${marketContext.proven_median_price_cents !== null ? `$${(marketContext.proven_median_price_cents / 100).toFixed(2)}` : "n/a"}`,
    );

    // ── Step 4: Call pricing agent with full market context ───────────────────
    const pricingResult = await analyzePricing({
      title,
      description,
      category,
      tags,
      content_type,
      commerce_readiness_score,
      technical_quality_score,
      market_fit_score,
      originality_proxy_score,
      suggested_price_band,
      suggested_license_type,
      views_count: 0,
      purchases_count: 0,
      creator_asset_count: 0,
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
    });
  } catch (error: any) {
    console.error("[pricing/market] error:", error);
    return NextResponse.json(
      { error: "Failed to analyze pricing", details: error.message },
      { status: 500 },
    );
  }
}
