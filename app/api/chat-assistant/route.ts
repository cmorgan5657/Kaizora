import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const MODEL = "gemini-3.1-pro-preview";

export async function POST(request: NextRequest) {
  try {
    const { messages, listings } = await request.json();

    const systemPrompt = `You are a helpful shopping assistant for a digital marketplace called KAIZORA. Your job is to help users find the perfect asset based on their needs.

Available assets in the marketplace:
${JSON.stringify(
  listings.map((l: any) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    category: l.category,
    tags: l.tags,
    license_type: l.license_type,
    currency: l.currency,
    creator: l.profiles?.display_name || "Unknown",
  })),
  null,
  2,
)}

Your role:
- Ask clarifying questions to understand their needs (budget, skill level, use case, preferences)
- Recommend 2-3 specific assets that best match their requirements
- Explain WHY each asset is a good fit for them
- If a user asks about a specific creator by name, show ALL assets by that creator
- When recommending assets, mention the creator name alongside the title
- Be concise, friendly, and helpful
- If they're unsure what they need, guide them with questions

CRITICAL RULE — ALWAYS FOLLOW THIS:
Whenever you mention, recommend, reference, or list ANY specific asset(s) from the marketplace — whether by name search, creator search, category search, or any recommendation — you MUST include a JSON block at the VERY END of your message in this EXACT format:

|||ASSETS|||["actual-asset-id-1","actual-asset-id-2"]|||END|||

Rules for the ASSETS block:
- Use the EXACT "id" values from the asset data above
- Include ALL assets you mention in your response
- The IDs must be real IDs from the data, not made up
- Place it at the VERY END of your message, after all text
- NEVER skip this block when you reference any asset
- If a user searches by creator name, include ALL that creator's asset IDs
- If no assets match, do NOT include the block — just say you couldn't find any

Example: If you recommend assets with IDs "abc-123" and "def-456", end your message with:
|||ASSETS|||["abc-123","def-456"]|||END|||

Only OMIT the block when you are asking questions or having general conversation without mentioning specific assets.

Keep responses short and conversational (2-4 sentences max).`;

    // Convert OpenAI-style messages to Gemini format.
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
      generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
    });
    logGeminiUsage(result, { feature: "marketplace_assistant", model: MODEL });

    const aiMessage = result.response.text() || "";

    let cleanMessage = aiMessage;
    let recommendedIds: string[] = [];

    const match = aiMessage.match(/\|\|\|ASSETS\|\|\|(.*?)\|\|\|END\|\|\|/);
    if (match) {
      try {
        recommendedIds = JSON.parse(match[1]);
      } catch (e) {
        console.error("Failed to parse asset IDs:", e);
      }
      cleanMessage = aiMessage
        .replace(/\|\|\|ASSETS\|\|\|.*?\|\|\|END\|\|\|/, "")
        .trim();
    }

    return NextResponse.json({
      message: cleanMessage,
      recommendedAssets: recommendedIds,
    });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 },
    );
  }
}
