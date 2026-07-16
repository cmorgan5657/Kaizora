import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
const genai = getGoogleAiClient();

const MODE_KNOWLEDGE: Record<string, string> = {
  variation:
    "Img2Img mode creates creative variations of the source image using Flux Pro 1.1 Ultra. Best for exploring alternatives while keeping the core subject.",
  custom:
    "Txt2Img mode generates a completely new image from a text prompt using Flux Dev. Best for creating scenes from scratch.",
  char: "Char2Img mode places a character into new scenes using Flux Dev. Lock Character pins the source as a visual reference for consistency.",
  video:
    "Img2Vid mode is a 2-step process — first generates a scene image, then animates it with Minimax Video. Add a scene description for best results.",
  vid2vid:
    "Vid2Vid transforms existing video using Wan 2.1. Describe how you want it transformed.",
  audio:
    "Generate Music mode creates music, songs, voice, or sound effects using MusicGen, Stable Audio, or Bark depending on type.",
  style:
    "Editor Toolkits applies artistic styles (anime, oil, watercolor, sketch, cyberpunk, fantasy) using Flux Pro.",
};

const GREETING_SYSTEM = `You are KAIZORA — an elite creative AI director with decades of experience in visual storytelling, commercial production, and AI art. You work with the world's top creators.

Greet the user with sharp creative energy. Reference their specific asset and mode. Make them feel like they just walked into a world-class studio. 2-3 sentences max. 1-2 emojis. Never generic, never robotic.`;

const SUCCESS_SYSTEM = `You are KAIZORA — an elite creative AI director with a razor-sharp eye for visual quality.

You are reviewing the generated result like a senior art director would. Be direct, specific, and honest.

- Identify exactly what's working visually and why
- Identify the single biggest weakness
- Give exactly 3 actionable next steps ranked by impact

Use **bold** for key actions. Max 6 lines. Be precise — no fluff.`;
const CHAT_SYSTEM = (
  context: any,
) => `You are KAIZORA — a world-class creative AI partner inside KAIZORA Remix Studio. You are the best creative guide in the world.

CURRENT CONTEXT:
- Asset: "${context.assetTitle || "untitled"}" (${context.assetType || "unknown"})
- Current Mode: ${context.currentMode || "variation"}
- Mode Knowledge: ${MODE_KNOWLEDGE[context.currentMode] || "AI generation mode"}
- Has Generated Result: ${context.hasResult ? "Yes" : "Not yet"}
- Original Image: ${context.originalImageUrl ? "Available" : "None"}
- Generated Result: ${context.generatedImageUrl ? "Available" : "Not yet"}
- Prompt Used: "${context.prompt || "none"}"

YOUR CAPABILITIES — guide users on:
1. Prompt crafting — write killer prompts for any mode
2. Mode selection — when to use which mode for best results  
3. Creative direction — style, composition, mood, lighting tips
4. Iteration strategy — how to refine and improve results
5. Monetization — how to turn outputs into revenue
6. Workflow optimization — fastest path to best results
7. Technical tips — aspect ratios, quality settings, duration choices
YOUR PERSONALITY:
- You are a senior creative director — direct, sharp, and deeply experienced
- Every response must contain at least one insight the user hasn't thought of
- Reference the specific asset, mode, and prompt they're using
- Use **bold** for key terms and actions
- Be concise but dense with value — no filler words
- Think like a commercial director, concept artist, and AI engineer combined
- Never give generic advice — always specific to their exact situation

IMPORTANT:
You can visually see generated images when provided.
Always analyze visually if images are available.
Never say you cannot see them.

Always give at least one concrete next action the user can take RIGHT NOW.`;

export async function POST(req: NextRequest) {
  try {
    const { messages, context, isGreeting, isSuccessAnalysis, userId } =
      await req.json();

    let systemPrompt: string;

    if (isGreeting) {
      systemPrompt = GREETING_SYSTEM;
    } else if (isSuccessAnalysis) {
      systemPrompt = SUCCESS_SYSTEM;
    } else {
      systemPrompt = CHAT_SYSTEM(context);
    }

    const userMessages = isGreeting
      ? [
          {
            role: "user" as const,
            content: `Greet me. I just loaded an asset called "${context.assetTitle || "untitled"}" (${context.assetType || "image"}). I'm in ${context.currentMode || "variation"} mode.`,
          },
        ]
      : isSuccessAnalysis
        ? [
            {
              role: "user" as const,
              content: [
                {
                  type: "text",
                  text: `I just generated this image in ${context.currentMode} mode. Original asset: "${context.assetTitle}". Prompt used: "${context.prompt || "none"}". Analyze both images and give me specific next steps based on what you see.`,
                },
                ...(context.originalImageUrl
                  ? [
                      {
                        type: "input_image",
                        image_url: context.originalImageUrl,
                      },
                    ]
                  : []),
                ...(context.generatedImageUrl &&
                !context.generatedImageUrl.startsWith("data:")
                  ? [
                      {
                        type: "input_image",
                        image_url: context.generatedImageUrl,
                      },
                    ]
                  : []),
              ],
            },
          ]
        : messages.map((m: any) => ({
            role:
              m.role === "assistant"
                ? ("assistant" as const)
                : ("user" as const),
            content: m.content,
          }));

  const modelName = "gemini-3.1-flash-lite";
  const model = genai.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  });
const prompt = isGreeting || isSuccessAnalysis
  ? typeof userMessages[0].content === "string"
    ? userMessages[0].content
    : userMessages[0].content[0].text
  : messages[messages.length - 1]?.content || "";
const stream = await model.generateContentStream(prompt);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
      for await (const chunk of stream.stream) {
  const text = chunk.text();
  if (text) controller.enqueue(encoder.encode(text));
}
        try {
          const finalResp = await stream.response;
          logGeminiUsage(finalResp, { feature: "creator_agent", model: modelName });
        } catch {}
        controller.close();
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: any) {
    console.error("Creator agent error:", error);
    return NextResponse.json({ error: "Agent failed" }, { status: 500 });
  }
}
