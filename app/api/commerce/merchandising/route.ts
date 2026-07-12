import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { analyzeMerchandising } from "@/lib/ai/merchandisingAgent";

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
      .select("id, title, description, category, tags, views_count, purchases_count, featured, price_cents")
      .eq("owner_id", userId);

    if (!assets || assets.length === 0) {
      return NextResponse.json({
        success: true,
        feature_recommendations: [],
        cross_sell_groups: [],
        preview_improvements: [],
        applied_actions: [],
      });
    }

    const result = await analyzeMerchandising(assets);
    if (!result) return NextResponse.json({ error: "Merchandising analysis failed" }, { status: 500 });

    // ── REAL EXECUTION: auto-apply feature/unfeature for HIGH and MEDIUM priority ──
    const appliedActions: any[] = [];
    const assetsById: Record<string, any> = {};
    assets.forEach((a) => { assetsById[a.id] = a; });

    for (const rec of result.feature_recommendations || []) {
      const asset = assetsById[rec.asset_id];
      if (!asset) continue;

      // Skip "keep" actions — no change needed
      if (rec.action === "keep") continue;

      // Auto-apply only HIGH priority; medium/low remain as suggestions
      if (rec.priority !== "high") continue;

      const newFeatured = rec.action === "feature";
      // Skip if already in target state
      if (asset.featured === newFeatured) continue;

      const { error: updErr } = await supabaseAdmin
        .from("assets")
        .update({ featured: newFeatured })
        .eq("id", rec.asset_id)
        .eq("owner_id", userId);

      if (!updErr) {
        appliedActions.push({
          asset_id: rec.asset_id,
          asset_title: asset.title,
          action: rec.action,
          reason: rec.reason,
          previous_state: asset.featured,
          new_state: newFeatured,
        });
      }
    }

    // ── Save cross-sell groups as creator metadata for the storefront ──
    if (result.cross_sell_groups?.length > 0) {
      // Validate that cross-sell asset IDs belong to this creator
      const validGroups = result.cross_sell_groups
        .map((g) => ({
          ...g,
          asset_ids: g.asset_ids.filter((id) => assetsById[id]),
        }))
        .filter((g) => g.asset_ids.length >= 2);

      if (validGroups.length > 0) {
        // Try creator_storefront table; fall back silently if missing
        const { error: storefrontErr } = await supabaseAdmin
          .from("creator_storefront")
          .upsert(
            {
              creator_id: userId,
              cross_sell_groups: validGroups,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "creator_id" },
          );
        if (storefrontErr) {
          console.warn("[merchandising] creator_storefront save skipped:", storefrontErr.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      applied_actions: appliedActions,
      execution_summary: {
        total_recommendations: result.feature_recommendations?.length || 0,
        auto_applied: appliedActions.length,
        cross_sell_groups_saved: result.cross_sell_groups?.length || 0,
      },
    });
  } catch (error: any) {
    console.error("Merchandising route error:", error);
    return NextResponse.json({ error: "Failed", details: error.message }, { status: 500 });
  }
}

// PATCH: manually apply a specific recommendation (for medium/low priority items)
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const { asset_id, action } = await req.json();
    if (!asset_id || !["feature", "unfeature"].includes(action)) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("assets")
      .update({ featured: action === "feature" })
      .eq("id", asset_id)
      .eq("owner_id", userData.user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, asset_id, applied: action });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
