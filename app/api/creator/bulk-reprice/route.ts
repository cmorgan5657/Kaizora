import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { analyzePricing, buildMarketContext } from "@/lib/ai/pricingAgent";

export const maxDuration = 300; // 5 minutes

/**
 * POST /api/creator/bulk-reprice
 *
 * Re-prices the authenticated creator's public assets using the market pricing agent.
 * Body (optional): { dry_run?: boolean, only_band_defaults?: boolean }
 *   - dry_run: don't write, just return what would change
 *   - only_band_defaults: only re-price assets whose price matches a known band default
 *     (300, 999, 2999, 9900, 29900) — safer, leaves your deliberate prices alone
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = !!body.dry_run;
    const onlyBandDefaults: boolean = !!body.only_band_defaults;
    const bandDefaults = new Set([300, 999, 2999, 9900, 29900]);

    // Fetch creator's public assets
    const { data: assets, error } = await supabaseAdmin
      .from("assets")
      .select("id, title, description, content_type, category, tags, price_cents, views_count, purchases_count")
      .eq("owner_id", userId)
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!assets || assets.length === 0) {
      return NextResponse.json({ success: true, processed: 0, results: [] });
    }

    const results: any[] = [];

    for (const asset of assets) {
      if (onlyBandDefaults && !bandDefaults.has(asset.price_cents ?? -1)) {
        results.push({ id: asset.id, title: asset.title, skipped: "not_band_default", price_cents: asset.price_cents });
        continue;
      }

      try {
        // Build market context for this asset's segment
        const { data: segmentRows } = await supabaseAdmin
          .from("assets")
          .select("price_cents, purchases_count, category, tags")
          .eq("is_public", true)
          .eq("content_type", (asset.content_type || "").toLowerCase())
          .gt("price_cents", 0)
          .neq("id", asset.id)
          .limit(500);

        let segment = segmentRows ?? [];
        let usedCategory: string | null = null;
        if (asset.category) {
          const cat = segment.filter(
            (r: any) =>
              r.category?.toLowerCase().trim() === asset.category.toLowerCase().trim(),
          );
          if (cat.length >= 5) {
            segment = cat;
            usedCategory = asset.category;
          }
        }

        const marketContext = buildMarketContext(segment, asset.content_type || "other", usedCategory);

        const pricing = await analyzePricing({
          title: asset.title,
          description: asset.description,
          category: asset.category,
          tags: asset.tags ?? [],
          content_type: asset.content_type,
          current_price_cents: asset.price_cents,
          views_count: asset.views_count ?? 0,
          purchases_count: asset.purchases_count ?? 0,
          market_context: marketContext,
        });

        if (!pricing || !pricing.recommended_price_cents || pricing.recommended_price_cents <= 0) {
          results.push({ id: asset.id, title: asset.title, error: "no_recommendation" });
          continue;
        }

        const oldPrice = asset.price_cents ?? 0;
        const newPrice = pricing.recommended_price_cents;

        if (!dryRun) {
          await supabaseAdmin
            .from("assets")
            .update({ price_cents: newPrice })
            .eq("id", asset.id)
            .eq("owner_id", userId);
        }

        results.push({
          id: asset.id,
          title: asset.title,
          old_price_cents: oldPrice,
          new_price_cents: newPrice,
          pricing_band: pricing.pricing_band,
          strategy: pricing.pricing_strategy,
          updated: !dryRun,
        });
      } catch (err: any) {
        results.push({ id: asset.id, title: asset.title, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      updated: results.filter((r) => r.updated).length,
      dry_run: dryRun,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Bulk reprice failed", details: error.message }, { status: 500 });
  }
}
