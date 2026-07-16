import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const MODEL = "gemini-3.1-pro-preview";

export async function POST(req: NextRequest) {
  const { imageUrl } = await req.json();

  try {
    // Fetch the image as base64 for Gemini inline data.
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error("failed to fetch image");
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const mimeType =
      (imgRes.headers.get("content-type") || "").split(";")[0] || "image/jpeg";
    const data = buf.toString("base64");

    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            {
              text: "Look at this image and write a detailed prompt that would recreate it. Include: subject, style, lighting, colors, mood, composition, camera angle. Return ONLY the prompt, nothing else.",
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 300 },
    });
    logGeminiUsage(result, { feature: "ai_reverse", model: MODEL });
    return NextResponse.json({ description: result.response.text() });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
