import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { runFeatureAssetAgent } from "@/lib/agents/featureAssetAgent";
import { runUnfeatureAssetAgent } from "@/lib/agents/unfeatureAssetAgent";
import { runPricingAgent } from "@/lib/agents/pricingAgent";
import { runMerchandisingBatchAgent } from "@/lib/agents/merchandisingBatchAgent";
import { runCatalogBatchAgent } from "@/lib/agents/catalogBatchAgent";
import { runSearchOptimizationBatchAgent } from "@/lib/agents/searchOptimizationBatchAgent";
import { runPostLaunchBatchAgent } from "@/lib/agents/postLaunchBatchAgent";
import { runBundlingBatchAgent } from "@/lib/agents/bundlingBatchAgent";
import { runDebundlingBatchAgent } from "@/lib/agents/debundlingBatchAgent";
import { autoOptimizeBundleAfterCreate } from "@/lib/ai/bundleSearchOptimizationAgent";

const RUNNERS: Record<string, () => Promise<any>> = {
  feature: runFeatureAssetAgent,
  unfeature: runUnfeatureAssetAgent,
  pricing: runPricingAgent,
  merchandising: runMerchandisingBatchAgent,
  catalog: runCatalogBatchAgent,
  search_optimization: async () => {
    // Run BOTH asset search-opt AND bundle search-opt for the authenticated user
    return await runSearchOptimizationBatchAgent();
  },
  post_launch: runPostLaunchBatchAgent,
  bundling: runBundlingBatchAgent,
  debundling: runDebundlingBatchAgent,
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await ctx.params;

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });

    const runner = RUNNERS[type];
    if (!runner) return NextResponse.json({ error: `Unknown agent: ${type}` }, { status: 400 });

    const result = await runner();

    // For search_optimization, ALSO run bundle search-opt for this user's bundles
    if (type === "search_optimization") {
      const { data: bundles } = await supabaseAdmin
        .from("bundles")
        .select("id, name, description, bundle_type, asset_ids")
        .eq("creator_id", userData.user.id);
      for (const b of bundles || []) {
        await autoOptimizeBundleAfterCreate({
          id: b.id,
          name: b.name,
          description: b.description,
          bundle_type: b.bundle_type,
          asset_ids: b.asset_ids || [],
        });
      }
    }

    return NextResponse.json({ success: true, agent: type, result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
