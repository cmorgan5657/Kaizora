import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import { serverLog } from "@/lib/debugLogs";

const genAI = getGoogleAiClient();
const MODEL = "gemini-3.1-flash-lite";
const REQUEST_OPTIONS = {};

export async function POST(request: NextRequest) {
  try {
    const systemPrompt = `You are a professional creative advisor. Generate a greeting for the Decision Layer.

Rules:
- 2-3 sentences maximum
- Minimal, formal, respectful tone
- Direct and professional
- No pressure or sales language
- Acknowledge their creative work
- Offer clear guidance`;

    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: systemPrompt,
    });
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_GREETING", "info", "[decision-layer][greeting] request", {
      model: MODEL,
    });
    const result = await model.generateContent(
      {
        contents: [
          {
            role: "user",
            parts: [{ text: "Generate a professional greeting." }],
          },
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 150 },
      },
      REQUEST_OPTIONS,
    );
    logGeminiUsage(result, {
      feature: "decision_layer_greeting",
      model: MODEL,
    });
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_GREETING", "info", "[decision-layer][greeting] response", {
      greetingPreview: (result.response.text() || "").slice(0, 120),
    });

    return NextResponse.json({
      success: true,
      greeting: result.response.text() || "",
    });
  } catch (error: any) {
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_GREETING", "error", "Greeting generation error", error);
    return NextResponse.json(
      { error: "Failed to generate greeting", details: error.message },
      { status: 500 },
    );
  }
}
