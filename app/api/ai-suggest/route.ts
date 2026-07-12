import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MODEL = "gemini-3.1-pro-preview";

export async function POST(req: NextRequest) {
  const { prompt, mode } = await req.json();

  try {
    const sys = `You are an expert AI image/video/audio prompt engineer. The user is in "${mode}" mode. Take their rough idea and return a single enhanced, detailed, professional prompt. Return ONLY the prompt, nothing else.`;
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: sys,
    });
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt || "Generate a creative prompt for me" }],
        },
      ],
      generationConfig: { maxOutputTokens: 200 },
    });
    logGeminiUsage(result, { feature: "ai_suggest", model: MODEL });
    return NextResponse.json({ suggestion: result.response.text() });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
