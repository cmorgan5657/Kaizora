import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const MODEL = "gemini-3.1-pro-preview";

export async function POST(request: NextRequest) {
  try {
    const { messages, listing, assets } = await request.json();

    const systemPrompt = `You are a helpful asset exploration assistant for a digital marketplace. You are currently helping a user explore assets around: "${
      listing.title
    }".

Primary Asset Details:
- Title: ${listing.title}
- Category: ${listing.category || "Uncategorized"}
- Total Views: ${listing.views_count || 0}
- Total Purchases: ${listing.purchases_count || 0}

Related Assets:
${JSON.stringify(
  assets.map((a: any) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    content_type: a.content_type,
    price: a.price_cents ? `$${(a.price_cents / 100).toFixed(2)}` : "Free",
    featured: a.featured || false,
    purchases: a.purchases_count || 0,
  })),
  null,
  2
)}

Your role:
- Help users find the perfect asset(s) from the list above based on their needs
- Answer questions about specific assets (price, content type, features, etc.)
- Compare different assets when asked
- Filter and recommend based on: budget, content type, skill level, use case
- Explain WHY each asset recommendation is a good fit
- Be concise, friendly, and helpful
- When recommending assets, mention them by title so users can identify them
- If they're unsure what they need, guide them with clarifying questions

Important:
- Only recommend assets from the list above
- If an asset doesn't exist, politely say so and suggest alternatives
- Keep responses short and conversational (2-4 sentences max)
- Focus on the user's specific needs and preferences`;

    const contents = (messages || []).map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: systemPrompt,
    });
    const result = await model.generateContent({
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
    });
    logGeminiUsage(result, { feature: "asset_assistant", model: MODEL });

    return NextResponse.json({ message: result.response.text() });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}
