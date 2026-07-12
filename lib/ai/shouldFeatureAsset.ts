import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MODEL = "gemini-3.1-pro-preview";

export async function shouldFeatureAsset(asset: {
  purchases_count: number;
  price_cents: number;
  created_at: string;
}) {
  const prompt = `
Decide if this marketplace asset should be featured.

Data:
- purchases: ${asset.purchases_count}
- price_cents: ${asset.price_cents}
- created_at: ${asset.created_at}

Be conservative.
Answer ONLY YES or NO.
`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 },
    });
    logGeminiUsage(result, { feature: "feature_asset_agent", model: MODEL });
    return result.response.text().trim() === "YES";
  } catch (e) {
    console.error("AI error:", e);
    return null;
  }
}
