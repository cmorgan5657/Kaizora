import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export interface CatalogResult {
  bundle_opportunities: Array<{
    name: string;
    asset_ids: string[];
    type: string;
    estimated_value: string;
    confidence: number;
  }>;
  collection_gaps: string[];
  cross_sell_opportunities: Array<{
    from_asset_id: string;
    to_asset_id: string;
    reason: string;
  }>;
  storefront_suggestions: string[];
  portfolio_health: "strong" | "moderate" | "needs_work";
  portfolio_summary: string;
}

export async function analyzeCatalog(
  assets: Array<{ id: string; title: string; description: string; category: string; tags: string[]; content_type: string; price_cents: number; purchases_count: number; views_count: number }>,
): Promise<CatalogResult | null> {
  const prompt = `You are a catalog strategy analyst for KAIZORA digital marketplace.

Analyze this creator's full portfolio and provide strategic recommendations.

Creator's Assets:
${JSON.stringify(assets.map((a) => ({ id: a.id, title: a.title, category: a.category, tags: a.tags, type: a.content_type, price: a.price_cents, purchases: a.purchases_count, views: a.views_count })), null, 2)}

Return ONLY valid JSON:
{
  "bundle_opportunities": [
    { "name": "bundle name", "asset_ids": ["id1", "id2"], "type": "themed | complementary | complete_kit | style_pack", "estimated_value": "$X-Y range", "confidence": 0-100 }
  ],
  "collection_gaps": ["what type of content is missing from this portfolio"],
  "cross_sell_opportunities": [
    { "from_asset_id": "id1", "to_asset_id": "id2", "reason": "why buyers of asset1 would want asset2" }
  ],
  "storefront_suggestions": ["how to organize/present this portfolio better"],
  "portfolio_health": "strong | moderate | needs_work",
  "portfolio_summary": "brief assessment of the portfolio (2-3 sentences)"
}

Rules:
- Bundle opportunities: only where assets genuinely pair well (max 5)
- Collection gaps: what content types or themes would round out the portfolio (max 4)
- Cross-sell: specific pairs where buying one asset makes another appealing (max 5)
- Storefront: how to organize categories, feature items, structure the store (max 4)
- Portfolio health: based on diversity, quality signals, performance data
- Be specific and actionable, not generic`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    });
    logGeminiUsage(res, { feature: "catalog_strategy_agent", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;
    return JSON.parse(content) as CatalogResult;
  } catch {
    return null;
  }
}
