import { runFeatureAssetAgent } from "@/lib/agents/featureAssetAgent";

runFeatureAssetAgent().then(() => {
  console.log("Agent finished");
});
