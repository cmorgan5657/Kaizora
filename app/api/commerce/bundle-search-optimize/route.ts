import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { optimizeBundleSearch } from "@/lib/ai/bundleSearchOptimizationAgent";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const userId = userData.user.id;
    const body = await req.json().catch(() => ({}));
    const { bundle_id, all } = body;

    let bundleIds: string[] = [];

    if (bundle_id) {
      bundleIds = [bundle_id];
    } else if (all) {
      const { data: rows } = await supabaseAdmin
        .from("bundles")
        .select("id")
        .eq("creator_id", userId);
      bundleIds = (rows || []).map((r: any) => r.id);
    } else {
      return NextResponse.json({ error: "bundle_id or all required" }, { status: 400 });
    }

    if (bundleIds.length === 0) return NextResponse.json({ success: true, processed: 0 });

    const { data: bundles } = await supabaseAdmin
      .from("bundles")
      .select("id, name, description, bundle_type, asset_ids, creator_id")
      .in("id", bundleIds)
      .eq("creator_id", userId);

    if (!bundles?.length) return NextResponse.json({ error: "No bundles found" }, { status: 404 });

    const results: any[] = [];

    for (const b of bundles) {
      const { data: assets } = await supabaseAdmin
        .from("assets")
        .select("title")
        .in("id", b.asset_ids || []);
      const titles = (assets || []).map((a: any) => a.title).filter(Boolean);

      const result = await optimizeBundleSearch({
        id: b.id,
        name: b.name,
        description: b.description,
        bundle_type: b.bundle_type,
        asset_titles: titles,
      });

      if (!result) {
        results.push({ bundle_id: b.id, success: false });
        continue;
      }

      await supabaseAdmin
        .from("bundles")
        .update({
          suggested_keywords: result.optimized_keywords,
          suggested_tags: result.optimized_tags,
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.id);

      // Log to agent_decisions under search_optimization (subtype = bundle)
      // anchor to first asset in the bundle so it appears in the per-user feed
      const firstAssetId = (b.asset_ids || [])[0];
      if (firstAssetId) {
        await supabaseAdmin.from("agent_decisions").insert({
          asset_id: firstAssetId,
          agent_type: "search_optimization",
          input: { subtype: "bundle", bundle_id: b.id, bundle_name: b.name },
          output: {
            action: "OPTIMIZE_BUNDLE_SEARCH",
            new_keywords: result.optimized_keywords,
            new_tags: result.optimized_tags,
            search_score: result.search_score,
          },
          explanation: `Bundle "${b.name}" — ${result.optimized_keywords?.length || 0} keywords, ${result.optimized_tags?.length || 0} tags, score ${result.search_score}/100`,
          review_action: "auto_applied",
        });
      }

      results.push({ bundle_id: b.id, success: true, ...result });
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    console.error("Bundle search optimize error:", error);
    return NextResponse.json({ error: "Failed", details: error.message }, { status: 500 });
  }
}
