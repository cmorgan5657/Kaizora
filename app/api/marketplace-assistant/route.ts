import { NextRequest, NextResponse } from "next/server";
import { getGeminiTrace, GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import { serverLog } from "@/lib/debugLogs";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MARKETPLACE_ASSISTANT_MODEL = "gemini-3.1-flash-lite";

function trimToCompleteSentence(text: string): string {
  const trimmed = text.trim();
  if (/[.!?]$/.test(trimmed)) return trimmed;
  const lastEnd = Math.max(
    trimmed.lastIndexOf("."),
    trimmed.lastIndexOf("!"),
    trimmed.lastIndexOf("?"),
  );
  if (lastEnd > 0) return trimmed.slice(0, lastEnd + 1);
  return trimmed + ".";
}

export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      listings,
      bundles,
      myAssets,
      myListings,
      commerceProfiles,
      currentListing,
      currentAssets,
      activeTab,
      isLoggedIn,
    } = await req.json();

    // ── Build compact context snapshots ──────────────────────────────
    const bundlesSummary = (bundles || [])
      .map(
        (b: any) =>
          `[${b.id}] "${b.name}" | ${b.bundle_type?.replace(/_/g, " ") || "bundle"} | ${b.asset_count} assets | $${((b.total_price_cents || 0) / 100).toFixed(2)} | ${b.description || "no description"}`,
      )
      .join("\n");

    const publicAssetsSummary = (listings || [])
      .slice(0, 40)
      .map(
        (l: any) =>
          `[${l.id}] "${l.title}" by ${l._profile?.display_name || l.creator || "Unknown"} | ${l.category || "uncategorized"} | ${!l.price_cents ? "Free" : `$${(l.price_cents / 100).toFixed(2)}`} | tags: ${(l.tags || []).join(", ") || "none"} | views: ${l.views_count ?? 0}`,
      )
      .join("\n");

    const myAssetsSummary = (myAssets || [])
      .slice(0, 30)
      .map(
        (a: any) =>
          `[${a.id}] "${a.title}" (${a.content_type || "unknown"}) | ${a.is_public ? "public" : "private"} | uploaded ${new Date(a.created_at).toLocaleDateString()}`,
      )
      .join("\n");

    const myPublishedSummary = (myListings || [])
      .slice(0, 20)
      .map(
        (l: any) =>
          `[${l.id}] "${l.title}" | status: ${l.status} | ${!l.price_cents ? "Free" : `$${(l.price_cents / 100).toFixed(2)}`} | views: ${l.views_count ?? 0} | purchases: ${l.purchases_count ?? 0}`,
      )
      .join("\n");

    const profilesSummary = (commerceProfiles || [])
      .slice(0, 15)
      .map(
        (p: any) =>
          `Asset "${p.asset_id}": readiness ${p.commerce_readiness_score ?? "?"}% | quality ${p.technical_quality_score ?? "?"}% | market fit ${p.market_fit_score ?? "?"}% | price band: ${p.suggested_price_band || "?"} | status: ${p.listing_readiness_status || "?"}`,
      )
      .join("\n");

    // Single asset context (when user is on an asset detail page)
    let currentAssetBlock = "";
    if (currentListing) {
      currentAssetBlock = `\nCURRENT ASSET (user is viewing this specific asset right now):
Title: ${currentListing.title}
Category: ${currentListing.category || "uncategorized"}
Creator: ${currentListing.creator || "Unknown"}
Price: ${!currentListing.price_cents ? "Free" : `$${(currentListing.price_cents / 100).toFixed(2)}`}
Views: ${currentListing.views_count ?? 0} | Purchases: ${currentListing.purchases_count ?? 0}
Description: ${currentListing.description || "No description"}

RELATED ASSETS (${(currentAssets || []).length}):
${(currentAssets || [])
  .map(
    (a: any) =>
      `- "${a.title}" (${a.content_type || "unknown"}) ${!a.price_cents ? "Free" : `$${(a.price_cents / 100).toFixed(2)}`} | ${a.featured ? "FEATURED" : ""} | purchases: ${a.purchases_count ?? 0}`,
  )
  .join("\n")}`;
    }

    const systemInstruction = `You are KAIZORA's Marketplace Assistant — a single smart assistant that knows EVERYTHING about the marketplace. You help with browsing assets, related picks, commerce analytics, upload guidance, and pricing strategy.

RULES — FOLLOW EXACTLY:
- Reply in 2-4 SHORT sentences MAX. Never exceed 4 sentences.
- ALWAYS finish every sentence completely. Never cut off mid-word.
- NEVER say "How can I help you?" or any generic greeting. FORBIDDEN.
- Plain text only. No markdown, no bullet lists, no formatting.
- Use ONLY the data below. Never invent assets or stats.
- If you lack data, say "I don't have that info right now."
- Be specific — mention real titles, real names, real numbers from the data.
- When recommending assets, always include their IDs in a JSON block at the VERY END: |||ASSETS|||["id1","id2"]|||END|||
- Only add the ASSETS block when you mention specific assets. Omit it for general conversation.

CONTEXT:
User is ${isLoggedIn ? "logged in" : "not logged in"}.
Active tab: ${activeTab || "browse"}.

BUNDLES (${(bundles || []).length} available — groups of assets sold together at combined price):
${bundlesSummary || "No bundles available."}
- Bundles appear mixed into the asset grid in the Browse tab
- Clicking a bundle goes to /marketplace/bundles/[id] where user can buy all assets at once
- Bundle price = sum of all included asset prices (no discount)
- Buying a bundle unlocks all its assets in the user's library

PUBLIC ASSETS (${(listings || []).length} total):
${publicAssetsSummary || "None available."}

${
  isLoggedIn
    ? `MY ASSETS (${(myAssets || []).length}):
${myAssetsSummary || "None uploaded yet."}

MY PUBLISHED ASSETS (${(myListings || []).length}):
${myPublishedSummary || "None published yet."}

COMMERCE PROFILES:
${profilesSummary || "No analysis data yet."}`
    : "User is not logged in — no personal commerce data available."
}
${currentAssetBlock}

CAPABILITIES YOU KNOW ABOUT:
- Upload flow: user uploads file → AI analyzes commerce readiness → shows score + Quick Publish / Deep Analysis / Publish Anyway
- Commerce readiness >= 70% = "Ready to Publish", below = "Needs Work"
- Deep Analysis sends asset to Decision Layer for thorough evaluation
- Quick Publish uses AI-suggested tags, price, category
- Publish Anyway publishes with user's original data
- Commerce profiles include: quality score, market fit, originality, suggested price band, categories, tags
- Bundles: curated groups of assets by the same creator, sold as one purchase at the combined price
- Assets in a bundle can also be bought individually — bundles are additive, not exclusive
- After buying a bundle, all its assets are unlocked in the buyer's library instantly`;

    const msgArray = (messages || []).slice(-10);
    const conversationLines: string[] = [];
    for (const m of msgArray) {
      conversationLines.push(
        `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
      );
    }

    serverLog("KAIZORA_LOG_API_MARKETPLACE_ASSISTANT", "info", "[marketplace-assistant] payload", {
      messageCount: (messages || []).length,
      lastUserMessage:
        Array.isArray(messages) && messages.length > 0
          ? messages[messages.length - 1]?.content || ""
          : "",
      activeTab: activeTab || "browse",
      isLoggedIn: !!isLoggedIn,
      listingsCount: (listings || []).length,
      bundlesCount: (bundles || []).length,
      myAssetsCount: (myAssets || []).length,
      myListingsCount: (myListings || []).length,
      currentAssetsCount: (currentAssets || []).length,
      model: MARKETPLACE_ASSISTANT_MODEL,
    });

    const model = genAI.getGenerativeModel({
      model: MARKETPLACE_ASSISTANT_MODEL,
      systemInstruction,
    });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                conversationLines.length > 0
                  ? conversationLines.join("\n")
                  : "Hello",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    logGeminiUsage(result, { feature: "marketplace_assistant", model: MARKETPLACE_ASSISTANT_MODEL });
    let message = result.response
      .text()
      .trim()
      .replace(/^Assistant:\s*/i, "");
    message = trimToCompleteSentence(message);

    // Extract asset IDs if present
    let cleanMessage = message;
    let recommendedIds: string[] = [];
    const match = message.match(/\|\|\|ASSETS\|\|\|(.*?)\|\|\|END\|\|\|/);
    if (match) {
      try {
        recommendedIds = JSON.parse(match[1]);
      } catch {
        /* ignore parse errors */
      }
      cleanMessage = message
        .replace(/\|\|\|ASSETS\|\|\|.*?\|\|\|END\|\|\|/, "")
        .trim();
      cleanMessage = trimToCompleteSentence(cleanMessage);
    }

    serverLog("KAIZORA_LOG_API_MARKETPLACE_ASSISTANT", "info", "[marketplace-assistant] response", {
      trace: getGeminiTrace(result),
      responsePreview: cleanMessage.slice(0, 200),
      recommendedAssets: recommendedIds,
    });

    return NextResponse.json({
      message: cleanMessage,
      recommendedAssets: recommendedIds,
    });
  } catch (error: any) {
    serverLog(
      "KAIZORA_LOG_API_MARKETPLACE_ASSISTANT",
      "error",
      "Marketplace assistant error",
      error?.message || error,
    );
    return NextResponse.json(
      { error: true, message: "I ran into an issue processing that. Try asking again!" },
      { status: 200 },
    );
  }
}
