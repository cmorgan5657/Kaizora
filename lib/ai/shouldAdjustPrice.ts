import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const MODEL = "gemini-3.1-pro-preview";

export async function getDemandScore(asset: {
  purchases_count: number;
  price_cents: number;
  created_at: string;
}) {
  const prompt = `
You are an AI pricing analyst.

Evaluate demand strength from 0 to 100.

Consider:
- purchases relative to price
- early traction vs asset age
- whether price is high or low

Asset:
- purchases: ${asset.purchases_count}
- price_cents: ${asset.price_cents}
- created_at: ${asset.created_at}

Return ONLY valid JSON in this exact format:
{ "score": number }
`;

  try {
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });
    logGeminiUsage(result, { feature: "pricing_agent", model: MODEL });
    const content = result.response.text();

    if (!content) return null;

    const parsed = JSON.parse(content);

    return typeof parsed.score === "number" ? parsed.score : null;
  } catch (e) {
    console.error("Pricing AI error:", e);
    return null;
  }
}
