import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export interface SearchOptResult {
  optimized_tags: string[];
  optimized_keywords: string[];
  suggested_category: string;
  title_suggestion: string;
  search_score: number;
  improvements: string[];
}

export async function optimizeSearch(asset: {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  keywords?: string[];
}): Promise<SearchOptResult | null> {
  const prompt = `You are a search optimization specialist for KAIZORA digital marketplace.

Optimize this asset's discoverability in marketplace search.

Asset:
- Title: ${asset.title || "untitled"}
- Description: ${asset.description || "none"}
- Category: ${asset.category || "uncategorized"}
- Current Tags: ${JSON.stringify(asset.tags || [])}
- Current Keywords: ${JSON.stringify(asset.keywords || [])}

Return ONLY valid JSON:
{
  "optimized_tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "optimized_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "suggested_category": "best fitting category",
  "title_suggestion": "optimized title for search (keep it natural, max 60 chars)",
  "search_score": 0-100,
  "improvements": ["specific improvement 1", "specific improvement 2", "specific improvement 3"]
}

Rules:
- Tags: mix broad (e.g. "digital art") and specific (e.g. "neon cyberpunk portrait")
- Keywords: terms buyers would actually search for
- Title: must be natural and compelling, not keyword-stuffed
- Keep existing good tags, replace weak ones
- search_score: how discoverable this asset will be after optimizations (0-100)
- improvements: specific, actionable suggestions`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    });
    logGeminiUsage(res, { feature: "search_optimization_agent", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;
    return JSON.parse(content) as SearchOptResult;
  } catch {
    return null;
  }
}
