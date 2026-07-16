import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

export const maxDuration = 300;

const genAI = getGoogleAiClient();
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

/**
 * POST /api/creator/bulk-categorize
 *
 * For the authenticated creator's public assets, assign a category chosen ONLY from
 * categories that already exist in the marketplace. Skips assets that already have
 * a category unless ?overwrite=true.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const overwrite: boolean = !!body.overwrite;

    // Get distinct existing categories across all public assets
    const { data: catRows } = await supabaseAdmin
      .from("assets")
      .select("category")
      .eq("is_public", true)
      .not("category", "is", null)
      .limit(2000);

    const existingCategories = Array.from(
      new Set(
        (catRows || [])
          .map((r: any) => (r.category || "").trim())
          .filter((c: string) => c.length > 0),
      ),
    );

    if (existingCategories.length === 0) {
      return NextResponse.json({
        error: "No existing categories in marketplace yet — can't constrain AI to them.",
      }, { status: 400 });
    }

    // Get this creator's public assets
    let query = supabaseAdmin
      .from("assets")
      .select("id, title, description, content_type, tags, category")
      .eq("owner_id", userId)
      .eq("is_public", true);

    if (!overwrite) {
      query = query.is("category", null);
    }

    const { data: assets, error } = await query.order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!assets || assets.length === 0) {
      return NextResponse.json({ success: true, processed: 0, results: [] });
    }

    const results: any[] = [];

    for (const asset of assets) {
      try {
        const prompt = `You are KAIZORA's category classifier. Pick the SINGLE best category for this asset.

Asset:
- Title: ${asset.title || "untitled"}
- Description: ${asset.description || "none"}
- Content type: ${asset.content_type || "unknown"}
- Tags: ${(asset.tags || []).join(", ") || "none"}

You MUST choose ONE category from this list — do NOT invent a new one:
${existingCategories.map((c) => `- ${c}`).join("\n")}

If absolutely no category fits, return null.

Return ONLY valid JSON:
{ "category": "<exact match from list, or null>", "confidence": 0-100, "reason": "<one short sentence>" }`;

        const res = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        });
        logGeminiUsage(res, { feature: "bulk_categorize", model: "gemini-3.1-pro-preview" });
        const text = res.response.text();
        const parsed = JSON.parse(text) as { category: string | null; confidence: number; reason: string };

        // Validate the chosen category actually exists in the list (case-insensitive)
        let chosen: string | null = null;
        if (parsed.category) {
          const match = existingCategories.find(
            (c) => c.toLowerCase() === parsed.category!.toLowerCase().trim(),
          );
          chosen = match ?? null;
        }

        if (!chosen) {
          results.push({ id: asset.id, title: asset.title, skipped: "no_match", reason: parsed.reason });
          continue;
        }

        await supabaseAdmin
          .from("assets")
          .update({ category: chosen })
          .eq("id", asset.id)
          .eq("owner_id", userId);

        results.push({
          id: asset.id,
          title: asset.title,
          old_category: asset.category,
          new_category: chosen,
          confidence: parsed.confidence,
          reason: parsed.reason,
          updated: true,
        });
      } catch (err: any) {
        results.push({ id: asset.id, title: asset.title, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      updated: results.filter((r) => r.updated).length,
      existing_categories: existingCategories,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Bulk categorize failed", details: error.message }, { status: 500 });
  }
}
