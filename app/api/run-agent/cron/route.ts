import { runFeatureAssetAgent } from "@/lib/agents/featureAssetAgent";
import { runUnfeatureAssetAgent } from "@/lib/agents/unfeatureAssetAgent";
import { runPricingAgent } from "@/lib/agents/pricingAgent";
import { runMerchandisingBatchAgent } from "@/lib/agents/merchandisingBatchAgent";
import { runCatalogBatchAgent } from "@/lib/agents/catalogBatchAgent";
import { runSearchOptimizationBatchAgent } from "@/lib/agents/searchOptimizationBatchAgent";
import { runPostLaunchBatchAgent } from "@/lib/agents/postLaunchBatchAgent";
import { runBundlingBatchAgent } from "@/lib/agents/bundlingBatchAgent";
import { runDebundlingBatchAgent } from "@/lib/agents/debundlingBatchAgent";

const AGENTS: { name: string; run: () => Promise<any> }[] = [
  { name: "pricing", run: runPricingAgent },
  { name: "feature", run: runFeatureAssetAgent },
  { name: "unfeature", run: runUnfeatureAssetAgent },
  { name: "merchandising", run: runMerchandisingBatchAgent },
  { name: "catalog", run: runCatalogBatchAgent },
  { name: "search_optimization", run: runSearchOptimizationBatchAgent },
  { name: "post_launch", run: runPostLaunchBatchAgent },
  { name: "bundling", run: runBundlingBatchAgent },
  { name: "debundling", run: runDebundlingBatchAgent },
];

export async function POST() {
  const results: Record<string, any> = {};
  const failures: string[] = [];

  for (let i = 0; i < AGENTS.length; i++) {
    const { name, run } = AGENTS[i];
    try {
      results[name] = (await run()) ?? "done";
    } catch (err: any) {
      results[name] = { error: err?.message || String(err) };
      failures.push(name);
    }
  }

  return Response.json({
    success: failures.length === 0,
    succeeded: AGENTS.length - failures.length,
    failed: failures,
    results,
  });
}

export async function GET() {
  return POST();
}
