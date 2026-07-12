import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export interface PackagingResult {
  suggestions: Array<{
    type: "single_asset" | "bundle" | "collection" | "template_pack" | "themed_series";
    name: string;
    description: string;
    asset_ids: string[];
    confidence: number;
  }>;
  primary_recommendation: string;
  reasoning: string;
}

export async function suggestPackaging(
  assets: Array<{ id: string; title: string; description: string; category: string; tags: string[]; content_type: string; price_cents: number }>,
): Promise<PackagingResult | null> {
  const prompt = `You are a product packaging strategist for KAIZORA digital marketplace.

Analyze these assets from the same creator and suggest the best product shapes.

Assets:
${JSON.stringify(assets.map((a) => ({ id: a.id, title: a.title, description: a.description, category: a.category, tags: a.tags, type: a.content_type, price: a.price_cents })), null, 2)}

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "type": "single_asset | bundle | collection | template_pack | themed_series",
      "name": "product name",
      "description": "why this packaging works",
      "asset_ids": ["id1", "id2"],
      "confidence": 0-100
    }
  ],
  "primary_recommendation": "the single best packaging strategy",
  "reasoning": "why this is the best approach"
}

Rules:
- Always include single_asset for each asset
- Only suggest bundles/collections where assets genuinely complement each other
- template_pack: assets that serve as reusable templates
- themed_series: assets that follow a visual/conceptual theme
- Max 6 suggestions
- Higher confidence = stronger thematic connection`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    });
    logGeminiUsage(res, { feature: "packaging_agent", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;
    return JSON.parse(content) as PackagingResult;
  } catch (e) {
    console.error("Packaging agent error:", e);
    return null;
  }
}
