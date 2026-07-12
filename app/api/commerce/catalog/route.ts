import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { analyzeCatalog } from "@/lib/ai/catalogStrategyAgent";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const userId = userData.user.id;

    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id, title, description, category, tags, content_type, price_cents, purchases_count, views_count, featured, is_public")
      .eq("owner_id", userId);

    if (!assets || assets.length < 2) {
      return NextResponse.json({
        success: true,
        bundle_opportunities: [],
        collection_gaps: [],
        cross_sell_opportunities: [],
        storefront_suggestions: [],
        portfolio_health: "needs_work",
        portfolio_summary: "Need at least 2 assets for catalog analysis.",
        applied_actions: [],
      });
    }

    const result = await analyzeCatalog(assets);
    if (!result) return NextResponse.json({ error: "Catalog analysis failed" }, { status: 500 });

    // ── REAL EXECUTION ──
    const appliedActions: any[] = [];
    const assetsById: Record<string, any> = {};
    assets.forEach((a) => { assetsById[a.id] = a; });

    // 1. AUTO-FEATURE top 3 best performers (highest purchases, then views) that are public
    const publicAssets = assets.filter((a) => a.is_public);
    const topPerformers = [...publicAssets]
      .sort((a, b) => {
        const purchaseDiff = (b.purchases_count || 0) - (a.purchases_count || 0);
        if (purchaseDiff !== 0) return purchaseDiff;
        return (b.views_count || 0) - (a.views_count || 0);
      })
      .slice(0, 3);

    for (const top of topPerformers) {
      if (top.featured) continue; // already featured
      // Only feature if there's actual engagement
      if ((top.purchases_count || 0) === 0 && (top.views_count || 0) < 5) continue;

      const { error } = await supabaseAdmin
        .from("assets")
        .update({ featured: true })
        .eq("id", top.id)
        .eq("owner_id", userId);

      if (!error) {
        appliedActions.push({
          type: "auto_feature_top_performer",
          asset_id: top.id,
          asset_title: top.title,
          reason: `Top performer: ${top.purchases_count || 0} purchases, ${top.views_count || 0} views`,
        });
      }
    }

    // 2. AUTO-UNFEATURE poor performers (high views but zero purchases for a while, currently featured)
    const poorPerformers = publicAssets.filter(
      (a) =>
        a.featured &&
        (a.views_count || 0) > 50 &&
        (a.purchases_count || 0) === 0,
    );

    for (const poor of poorPerformers) {
      // Don't unfeature if it's a top performer
      if (topPerformers.some((t) => t.id === poor.id)) continue;

      const { error } = await supabaseAdmin
        .from("assets")
        .update({ featured: false })
        .eq("id", poor.id)
        .eq("owner_id", userId);

      if (!error) {
        appliedActions.push({
          type: "auto_unfeature_poor_performer",
          asset_id: poor.id,
          asset_title: poor.title,
          reason: `${poor.views_count} views but 0 purchases — not converting`,
        });
      }
    }

    // 3. Save cross-sell opportunities + storefront suggestions to creator_storefront
    if (
      (result.cross_sell_opportunities?.length || 0) > 0 ||
      (result.storefront_suggestions?.length || 0) > 0
    ) {
      // Validate cross-sell asset IDs belong to creator
      const validCrossSells = (result.cross_sell_opportunities || []).filter(
        (cs) => assetsById[cs.from_asset_id] && assetsById[cs.to_asset_id],
      );

      const { error: storefrontErr } = await supabaseAdmin
        .from("creator_storefront")
        .upsert(
          {
            creator_id: userId,
            cross_sell_pairs: validCrossSells,
            storefront_suggestions: result.storefront_suggestions || [],
            portfolio_health: result.portfolio_health,
            portfolio_summary: result.portfolio_summary,
            last_analyzed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "creator_id" },
        );

      if (!storefrontErr) {
        appliedActions.push({
          type: "saved_storefront_strategy",
          cross_sell_pairs: validCrossSells.length,
          storefront_tips: (result.storefront_suggestions || []).length,
        });
      } else {
        console.warn("[catalog] creator_storefront save skipped:", storefrontErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      applied_actions: appliedActions,
      execution_summary: {
        auto_featured: appliedActions.filter((a) => a.type === "auto_feature_top_performer").length,
        auto_unfeatured: appliedActions.filter((a) => a.type === "auto_unfeature_poor_performer").length,
        storefront_saved: appliedActions.some((a) => a.type === "saved_storefront_strategy"),
      },
    });
  } catch (error: any) {
    console.error("Catalog route error:", error);
    return NextResponse.json({ error: "Failed", details: error.message }, { status: 500 });
  }
}
