import { runFeatureAssetAgent } from "@/lib/agents/featureAssetAgent";
import { runUnfeatureAssetAgent } from "@/lib/agents/unfeatureAssetAgent";
import { runPricingAgent } from "@/lib/agents/pricingAgent";
import { runMerchandisingBatchAgent } from "@/lib/agents/merchandisingBatchAgent";
import { runCatalogBatchAgent } from "@/lib/agents/catalogBatchAgent";

export async function GET() {
  await runFeatureAssetAgent();
  await runUnfeatureAssetAgent();
  await runPricingAgent();
  await runMerchandisingBatchAgent();
  await runCatalogBatchAgent();

  return new Response("All agents ran");
}
