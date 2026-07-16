import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { autoOptimizeBundleAfterCreate } from "@/lib/ai/bundleSearchOptimizationAgent";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export async function POST(req: NextRequest) {
  try {
    // Fetch all public assets (no price filter — bundles can include free assets)
    let { data: assets, error } = await supabaseAdmin
      .from("assets")
      .select("id, title, description, category, tags, content_type, price_cents, storage_path, thumbnail_path, owner_id")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    // Fallback: if no public assets found, try all assets
    if (error || !assets?.length) {
      const { data: allAssets, error: allErr } = await supabaseAdmin
        .from("assets")
        .select("id, title, description, category, tags, content_type, price_cents, storage_path, thumbnail_path, owner_id")
        .order("created_at", { ascending: false })
        .limit(200);

      if (allErr || !allAssets?.length) {
        return NextResponse.json({ error: "No assets found", created: 0, db_error: error?.message });
      }

      assets = allAssets;
    }

    // Group by creator
    const byCreator: Record<string, typeof assets> = {};
    for (const asset of assets) {
      if (!asset.owner_id) continue;
      if (!byCreator[asset.owner_id]) byCreator[asset.owner_id] = [];
      byCreator[asset.owner_id].push(asset);
    }

    let totalCreated = 0;
    const results: any[] = [];

    for (const [creatorId, creatorAssets] of Object.entries(byCreator)) {
      if (creatorAssets.length < 2) continue;

      // Check if creator already has bundles
      const { data: existingBundles } = await supabaseAdmin
        .from("bundles")
        .select("id")
        .eq("creator_id", creatorId);

      if (existingBundles && existingBundles.length > 0) {
        results.push({ creator_id: creatorId, skipped: true, reason: "already has bundles" });
        continue;
      }

      // Ask Gemini to suggest bundles for this creator's assets
      const assetSummaries = creatorAssets.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description?.slice(0, 100),
        category: a.category,
        tags: a.tags?.slice(0, 8),
        type: a.content_type,
        price: a.price_cents,
      }));

      const prompt = `You are a marketplace bundling strategist for KAIZORA.

Analyze these assets from the same creator and suggest bundles that share the same genre, style, or theme.

Assets:
${JSON.stringify(assetSummaries, null, 2)}

Return ONLY valid JSON:
{
  "bundles": [
    {
      "name": "bundle name",
      "description": "why these work together",
      "asset_ids": ["id1", "id2"],
      "bundle_type": "themed_series | complementary | complete_kit | style_pack",
      "confidence": 0-100
    }
  ]
}

Rules:
- Each bundle MUST have 2-5 assets
- Only group assets that GENUINELY share genre, style, theme, or content type
- Max 3 bundles
- Only suggest bundles with confidence >= 70
- If no strong matches exist, return empty bundles array
- Do NOT force bundles that don't make sense`;

      try {
        const res = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        });

        logGeminiUsage(res, { feature: "bundles_auto_create", model: "gemini-3.1-pro-preview" });
        const content = res.response.text();
        if (!content) continue;

        const result = JSON.parse(content);
        const suggestedBundles = result.bundles || [];

        for (const b of suggestedBundles) {
          if (!b.asset_ids || b.asset_ids.length < 2) continue;
          if ((b.confidence || 0) < 70) continue;

          // Verify asset_ids actually belong to this creator
          const validAssets = creatorAssets.filter(a => b.asset_ids.includes(a.id));
          if (validAssets.length < 2) continue;

          const total_price_cents = validAssets.reduce((s, a) => s + (a.price_cents || 0), 0);
          const thumbnail_url = (validAssets[0] as any)?.thumbnail_path || validAssets[0]?.storage_path || null;

          const { data: insertedBundle, error: insertErr } = await supabaseAdmin
            .from("bundles")
            .insert({
              creator_id: creatorId,
              name: b.name,
              description: b.description || null,
              bundle_type: b.bundle_type || "themed_series",
              asset_ids: validAssets.map(a => a.id),
              total_price_cents,
              is_public: true,
              thumbnail_url,
            })
            .select()
            .single();

          if (!insertErr && insertedBundle) {
            totalCreated++;
            results.push({ creator_id: creatorId, bundle: b.name, assets: validAssets.length });

            autoOptimizeBundleAfterCreate({
              id: insertedBundle.id,
              name: insertedBundle.name,
              description: insertedBundle.description,
              bundle_type: insertedBundle.bundle_type,
              asset_ids: validAssets.map(a => a.id),
            });
          } else if (insertErr) {
            results.push({ creator_id: creatorId, bundle: b.name, insert_error: insertErr.message });
          }
        }
      } catch (aiErr) {
        console.error(`[auto-bundle] AI error for creator ${creatorId}:`, aiErr);
        results.push({ creator_id: creatorId, ai_error: String(aiErr) });
      }
    }

    return NextResponse.json({
      success: true,
      total_assets: assets.length,
      total_creators_scanned: Object.keys(byCreator).length,
      bundles_created: totalCreated,
      results,
    });
  } catch (e: any) {
    console.error("[auto-bundle] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
