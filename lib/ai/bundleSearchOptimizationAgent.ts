import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export interface BundleSearchOptResult {
  optimized_tags: string[];
  optimized_keywords: string[];
  search_score: number;
  improvements: string[];
}

export async function optimizeBundleSearch(bundle: {
  id: string;
  name: string;
  description: string;
  bundle_type?: string;
  asset_titles?: string[];
}): Promise<BundleSearchOptResult | null> {
  const prompt = `You are a search optimization specialist for KAIZORA digital marketplace bundles.

Optimize this bundle's discoverability in marketplace search.

Bundle:
- Name: ${bundle.name || "untitled"}
- Description: ${bundle.description || "none"}
- Type: ${bundle.bundle_type || "unknown"}
- Contained asset titles: ${JSON.stringify(bundle.asset_titles || [])}

Return ONLY valid JSON:
{
  "optimized_tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "optimized_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "search_score": 0-100,
  "improvements": ["specific improvement 1", "specific improvement 2"]
}

Rules:
- Tags: mix broad (e.g. "asset pack") and specific (e.g. "cyberpunk character bundle")
- Keywords: terms buyers would actually search for when looking for a bundle like this
- Consider the bundle theme, the assets inside, and buyer intent
- search_score: how discoverable this bundle will be after optimizations (0-100)`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    });
    logGeminiUsage(res, { feature: "bundle_search_optimization_agent", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;
    return JSON.parse(content) as BundleSearchOptResult;
  } catch {
    return null;
  }
}

/**
 * Runs optimizeBundleSearch + persists results + logs to agent_decisions.
 * Designed to be called fire-and-forget after a bundle is inserted.
 */
export async function autoOptimizeBundleAfterCreate(bundle: {
  id: string;
  name: string;
  description?: string | null;
  bundle_type?: string;
  asset_ids: string[];
}): Promise<void> {
  try {
    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("title")
      .in("id", bundle.asset_ids || []);
    const titles = (assets || []).map((a: any) => a.title).filter(Boolean);

    const result = await optimizeBundleSearch({
      id: bundle.id,
      name: bundle.name,
      description: bundle.description || "",
      bundle_type: bundle.bundle_type,
      asset_titles: titles,
    });

    if (!result) return;

    await supabaseAdmin
      .from("bundles")
      .update({
        suggested_keywords: result.optimized_keywords,
        suggested_tags: result.optimized_tags,
      })
      .eq("id", bundle.id);

    const firstAssetId = (bundle.asset_ids || [])[0];
    if (firstAssetId) {
      await supabaseAdmin.from("agent_decisions").insert({
        asset_id: firstAssetId,
        agent_type: "search_optimization",
        input: { subtype: "bundle", bundle_id: bundle.id, bundle_name: bundle.name },
        output: {
          action: "OPTIMIZE_BUNDLE_SEARCH",
          new_keywords: result.optimized_keywords,
          new_tags: result.optimized_tags,
          search_score: result.search_score,
        },
        explanation: `Bundle "${bundle.name}" — ${result.optimized_keywords?.length || 0} keywords, ${result.optimized_tags?.length || 0} tags, score ${result.search_score}/100`,
        review_action: "auto_applied",
      });
    }
  } catch {
    // silent
  }
}
