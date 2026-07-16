import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export interface CommerceIntakeResult {
  content_description: string;
  technical_quality_score: number;
  market_fit_score: number;
  originality_proxy_score: number;
  suggested_categories: string[];
  suggested_tags: string[];
  suggested_keywords: string[];
  suggested_product_shapes: string[];
  suggested_price_band: string;
  suggested_license_type: string;
  preview_strength: string;
  thumbnail_notes: string;
  policy_risk_score: number;
  commerce_readiness_score: number;
  recommended_next_commerce_action: string;
  profile_confidence: number;
}

export async function runCommerceIntake(asset: {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  file_type?: string;
  price_cents?: number;
  existing_categories?: string[];
}): Promise<CommerceIntakeResult | null> {
  const existingCats = (asset.existing_categories || []).filter(Boolean);
  const categoryConstraint = existingCats.length > 0
    ? `\n\nEXISTING CATEGORIES IN THE MARKETPLACE (you MUST pick suggested_categories ONLY from this list — do not invent new ones):
${existingCats.map((c) => `- ${c}`).join("\n")}`
    : "";

  const prompt = `You are KAIZORA's Commerce Intake Agent. Analyze this creative AI-generated asset and produce commerce intelligence.

Asset Info:
- Title: ${asset.title || "untitled"}
- Description: ${asset.description || "none"}
- Category: ${asset.category || "uncategorized"}
- Tags: ${asset.tags?.join(", ") || "none"}
- File Type: ${asset.file_type || "unknown"}
- Current Price (cents): ${asset.price_cents || 0}${categoryConstraint}

Return ONLY valid JSON:
{
  "content_description": "2-3 sentence description of the asset and its commercial potential",
  "technical_quality_score": 0-100,
  "market_fit_score": 0-100,
  "originality_proxy_score": 0-100,
  "policy_risk_score": 0-100,
  "commerce_readiness_score": 0-100,
  "profile_confidence": 0-100,
  "suggested_categories": ["category1", "category2"],
  "suggested_product_shapes": ["single", "pack", "template", "series"],
  "suggested_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "suggested_keywords": ["keyword1", "keyword2", "keyword3"],
  "suggested_price_band": "free|micro($1-5)|starter($5-15)|standard($15-50)|premium($50-200)|enterprise($200+)",
  "suggested_license_type": "cc|personal|commercial|extended",
  "preview_strength": "strong|moderate|weak",
  "thumbnail_notes": "brief note on thumbnail optimization",
  "recommended_next_commerce_action": "one clear actionable sentence for the creator"
}

Rules:
- commerce_readiness_score >= 70 means ready to list. Below 70 needs work.
- Be realistic. Consider title, description, and file type to assess market viability.
- For beginners lean toward actionable suggestions. For polished assets suggest premium positioning.
- Always include "single" in suggested_product_shapes.
- suggested_categories MUST be chosen from the EXISTING CATEGORIES list above (if provided). Pick the 1-2 best fits. If nothing fits, return an empty array — do NOT invent new categories.`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    });

    logGeminiUsage(res, { feature: "commerce_intake", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;

    return JSON.parse(content) as CommerceIntakeResult;
  } catch (e) {
    console.error("Commerce intake AI error:", e);
    return null;
  }
}
