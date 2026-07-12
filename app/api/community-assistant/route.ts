import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Trim to last complete sentence so responses never end mid-word
function trimToCompleteSentence(text: string): string {
  const trimmed = text.trim();
  // Already ends with sentence-ending punctuation
  if (/[.!?]$/.test(trimmed)) return trimmed;
  // Find the last sentence-ending punctuation
  const lastPeriod = trimmed.lastIndexOf(".");
  const lastExclaim = trimmed.lastIndexOf("!");
  const lastQuestion = trimmed.lastIndexOf("?");
  const lastEnd = Math.max(lastPeriod, lastExclaim, lastQuestion);
  if (lastEnd > 0) return trimmed.slice(0, lastEnd + 1);
  // No sentence ending found — return as-is with a period
  return trimmed + ".";
}

export async function POST(req: NextRequest) {
  try {
    const { messages, feedSnapshot, creatorsSnapshot, challengesSnapshot, focusedUser, isProactive } = await req.json();

    // Build compact data context — limit to reduce token usage
    const feedSummary = (feedSnapshot || []).slice(0, 30)
      .map((a: any) => `"${a.title}" by ${a.creator} (${a.type}, ${a.price})`)
      .join("\n");

    const creatorsSummary = (creatorsSnapshot || []).slice(0, 25)
      .map((u: any) =>
        `${u.name}: ${u.assetCount} assets${u.rating ? `, ★${u.rating}` : ""}${u.joinedYear ? `, joined ${u.joinedYear}` : ""}`
      )
      .join("\n");

    const challengesSummary = (challengesSnapshot || [])
      .map((c: any) =>
        `"${c.title}" theme: ${c.theme || "open"}, prize: ${c.prize}, ${c.entries} entries, status: ${c.status}`
      )
      .join("\n");

    const focusedUserBlock = focusedUser ? `\nCREATOR IN FOCUS (the user is looking at this creator right now):
Name: ${focusedUser.display_name || "Unknown"}
Bio: ${focusedUser.bio || "No bio set"}
Assets: ${focusedUser.assetCount ?? 0}
Rating: ${focusedUser.averageRating > 0 ? `★${focusedUser.averageRating} (${focusedUser.reviewCount} reviews)` : "No reviews yet"}
Joined: ${focusedUser.created_at ? new Date(focusedUser.created_at).getFullYear() : "Unknown"}` : "";

    const systemInstruction = `You are KAIZORA's Community Assistant. Answer questions about the community using ONLY the data below.

RULES — FOLLOW EXACTLY:
- Reply in 2-3 SHORT sentences MAX. Never exceed 3 sentences.
- ALWAYS finish every sentence. Never leave a sentence incomplete.
- NEVER say "How can I help you?", "What do you need help with?", or any generic greeting. FORBIDDEN.
- When the user says "him"/"her"/"them"/"this creator" — they mean the CREATOR IN FOCUS or the last creator you mentioned.
- Use ONLY the data below. Do not invent anything.
- Plain text only. No markdown, no lists, no formatting.
- If you lack data, say "I don't have that data right now."
${isProactive ? '- PROACTIVE MODE: Give exactly 2 short sentences about the CREATOR IN FOCUS. Start with their name. Say if they are worth connecting with.' : ""}

DATA:

POSTS (${(feedSnapshot || []).length}):
${feedSummary || "None."}

CREATORS (${(creatorsSnapshot || []).length}):
${creatorsSummary || "None."}

CHALLENGES (${(challengesSnapshot || []).length}):
${challengesSummary || "None."}
${focusedUserBlock}`;

    // Only send the last 8 messages to keep context focused
    const msgArray = (messages || []).slice(-8);
    const conversationLines: string[] = [];
    for (const m of msgArray) {
      conversationLines.push(`${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: conversationLines.length > 0 ? conversationLines.join("\n") : "Hello" }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    logGeminiUsage(result, { feature: "community_assistant", model: "gemini-3.1-pro-preview" });
    // Get response and ensure it ends on a complete sentence
    let message = result.response.text().trim()
      .replace(/^Assistant:\s*/i, "");
    message = trimToCompleteSentence(message);

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("Community assistant error:", error?.message || error);
    return NextResponse.json(
      { message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
