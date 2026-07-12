import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MODEL = "gemini-3.1-pro-preview";

async function fetchFileContent(url: string, contentType: string) {
  try {
    const response = await fetch(url);

    if (contentType === "image") {
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType =
        (response.headers.get("content-type") || "").split(";")[0] ||
        "image/jpeg";
      return { type: "image", data: base64, mimeType };
    }

    if (contentType === "text" || contentType === "code") {
      const text = await response.text();
      return { type: "text", data: text.substring(0, 2000) };
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, category, assets } = body;

    if (!assets || assets.length === 0) {
      return NextResponse.json({ analysis: null });
    }

    const enrichedAssets = await Promise.all(
      assets.map(async (a: any) => {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${a.storage_path}`;
        const content = await fetchFileContent(url, a.content_type);

        return {
          title: a.title,
          type: a.content_type,
          size: a.file_size,
          content: content?.data || null,
          mimeType: (content as any)?.mimeType || "image/jpeg",
        };
      }),
    );

    const assetDetails = enrichedAssets
      .map((a) => {
        const sizeKB = a.size ? (a.size / 1024).toFixed(1) : "N/A";
        let details = `- ${a.title || "Untitled"} (${a.type}, ${sizeKB}KB)`;
        if (a.content && a.type === "text") {
          details += `\n  Preview: ${a.content.substring(0, 200)}...`;
        }
        return details;
      })
      .join("\n");

    const systemPrompt =
      "You analyze digital assets for publishing on a marketplace. Provide concise, structured feedback in 3 sections: STRENGTHS (what's good), ISSUES (problems found), RECOMMENDATIONS (what to add/fix). Keep each section to 2-3 bullet points maximum. Be specific and actionable.";

    const userText = `Asset: "${title}"\nCategory: "${category}"\n\nFiles (${assets.length} total):\n${assetDetails}\n\nAnalyze these assets and provide structured feedback.`;

    const parts: any[] = [{ text: userText }];
    const imageAssets = enrichedAssets.filter(
      (a) => a.type === "image" && a.content,
    );
    imageAssets.slice(0, 3).forEach((img) => {
      parts.push({
        inlineData: { mimeType: img.mimeType, data: img.content as string },
      });
    });

    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: systemPrompt,
    });
    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
    });
    logGeminiUsage(result, { feature: "analyze_assets", model: MODEL });

    return NextResponse.json({
      analysis: result.response.text() || "Analysis unavailable.",
    });
  } catch (err) {
    console.error("AI analysis error:", err);
    return NextResponse.json(
      { analysis: "Unable to analyze assets right now." },
      { status: 500 },
    );
  }
}
