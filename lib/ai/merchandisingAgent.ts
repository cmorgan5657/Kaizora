import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export interface MerchandisingResult {
  feature_recommendations: Array<{
    asset_id: string;
    action: "feature" | "unfeature" | "keep";
    reason: string;
    priority: "high" | "medium" | "low";
  }>;
  cross_sell_groups: Array<{
    name: string;
    asset_ids: string[];
    reason: string;
  }>;
  preview_improvements: Array<{
    asset_id: string;
    suggestion: string;
  }>;
}

export async function analyzeMerchandising(
  assets: Array<{ id: string; title: string; description: string; category: string; tags: string[]; views_count: number; purchases_count: number; featured: boolean; price_cents: number }>,
): Promise<MerchandisingResult | null> {
  const prompt = `You are a merchandising strategist for KAIZORA digital marketplace.

Analyze these assets and recommend featuring, cross-selling, and preview improvements.

Assets:
${JSON.stringify(assets.map((a) => ({ id: a.id, title: a.title, category: a.category, tags: a.tags, views: a.views_count, purchases: a.purchases_count, featured: a.featured, price: a.price_cents })), null, 2)}

Return ONLY valid JSON:
{
  "feature_recommendations": [
    { "asset_id": "id", "action": "feature | unfeature | keep", "reason": "why", "priority": "high | medium | low" }
  ],
  "cross_sell_groups": [
    { "name": "group name", "asset_ids": ["id1", "id2"], "reason": "why these pair well" }
  ],
  "preview_improvements": [
    { "asset_id": "id", "suggestion": "how to improve the preview/thumbnail" }
  ]
}

Rules:
- Feature assets with high engagement or strong commercial appeal
- Unfeature assets with many views but very low conversion
- Cross-sell groups should be 2-4 assets that complement each other
- Preview improvements should be specific and actionable
- Max 5 feature recommendations, 4 cross-sell groups, 5 preview improvements`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    });
    logGeminiUsage(res, { feature: "merchandising_agent", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;
    return JSON.parse(content) as MerchandisingResult;
  } catch {
    return null;
  }
}
