import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !userData?.user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 401 });
    }

    const userId = userData.user.id;
    const body = await req.json();
    const { asset_id } = body;

    // Get the target asset's commerce profile
    const { data: targetProfile } = await supabaseAdmin
      .from("asset_commerce_profiles")
      .select("*")
      .eq("asset_id", asset_id || "")
      .eq("user_id", userId)
      .maybeSingle();

    // Get all commerce profiles for this user's assets
    const { data: allProfiles } = await supabaseAdmin
      .from("asset_commerce_profiles")
      .select("asset_id, content_description, suggested_categories, suggested_tags, suggested_product_shapes, commerce_readiness_score, suggested_price_band")
      .eq("user_id", userId);

    if (!allProfiles || allProfiles.length < 2) {
      return NextResponse.json({
        success: true,
        bundles: [],
        message: "Need at least 2 assets with commerce profiles to suggest bundles",
      });
    }

    // Also fetch basic asset info for context
    const assetIds = allProfiles.map((p) => p.asset_id);
    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id, title, category, tags, price_cents")
      .in("id", assetIds);

    const assetsMap: Record<string, any> = {};
    (assets || []).forEach((a) => {
      assetsMap[a.id] = a;
    });

    const assetSummaries = allProfiles.map((p) => ({
      asset_id: p.asset_id,
      title: assetsMap[p.asset_id]?.title || "untitled",
      description: p.content_description || "",
      categories: p.suggested_categories || [],
      tags: p.suggested_tags || [],
      price_band: p.suggested_price_band || "mid_market",
      readiness: p.commerce_readiness_score || 0,
    }));

    const prompt = `You are a marketplace bundling strategist for KAIZORA.

Analyze these assets from the same creator and suggest bundles that would sell well together.

Assets:
${JSON.stringify(assetSummaries, null, 2)}

${targetProfile ? `Focus on bundles that include asset: ${asset_id}` : "Suggest the best bundles from all available assets."}

Return ONLY valid JSON:
{
  "bundles": [
    {
      "name": "suggested bundle name",
      "description": "why these work together (1-2 sentences)",
      "asset_ids": ["id1", "id2", "id3"],
      "bundle_type": "themed_series | complementary | complete_kit | style_pack",
      "suggested_price_band": "budget | mid_market | premium",
      "confidence": 0-100
    }
  ]
}

Rules:
- Each bundle must have 2-5 assets
- Only suggest bundles where assets genuinely complement each other
- Max 5 bundle suggestions
- Higher confidence = stronger thematic/commercial connection
- Don't force bundles that don't make sense`;

    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    });

    logGeminiUsage(res, { feature: "marketplace_bundles_suggest", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) {
      return NextResponse.json({
        success: true,
        bundles: [],
        message: "Could not generate bundle suggestions",
      });
    }

    const result = JSON.parse(content);

    return NextResponse.json({
      success: true,
      bundles: result.bundles || [],
      total_assets_analyzed: allProfiles.length,
    });
  } catch (error: any) {
    console.error("Bundle suggest error:", error);
    return NextResponse.json(
      { error: "Failed to suggest bundles", details: error.message },
      { status: 500 },
    );
  }
}
