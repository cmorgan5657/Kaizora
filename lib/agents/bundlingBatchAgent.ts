import { supabaseAdmin } from "@/lib/supabaseServer";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { autoOptimizeBundleAfterCreate } from "@/lib/ai/bundleSearchOptimizationAgent";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

/**
 * Autonomous Bundling Batch Agent.
 *
 * Walks every creator with 3+ public assets and asks Gemini for
 * bundle suggestions. Auto-creates bundles where:
 *   - Confidence ≥ 80
 *   - 2-5 assets per bundle
 *   - Combined price ≤ $200 (20000 cents)
 *   - Assets aren't already in another live bundle
 *   - Bundle published immediately (is_public = true)
 */

const MIN_CONFIDENCE = 80;
const MAX_BUNDLE_PRICE_CENTS = 20000;
const MIN_ASSETS_FOR_CREATOR = 3;
const MAX_BUNDLES_PER_RUN = 3;

export async function runBundlingBatchAgent() {
  const { data: aiControl } = await supabaseAdmin
    .from("ai_controls")
    .select("enabled")
    .eq("key", "agents_enabled")
    .maybeSingle();
  if (aiControl && aiControl.enabled === false) return { skipped: true };

  // All public assets grouped by owner
  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select("id, title, description, category, tags, content_type, price_cents, owner_id, manual_override_until")
    .eq("is_public", true);

  const byCreator: Record<string, any[]> = {};
  for (const a of assets || []) {
    if (!a.owner_id) continue;
    if (a.manual_override_until && new Date(a.manual_override_until) > new Date()) continue;
    if (!byCreator[a.owner_id]) byCreator[a.owner_id] = [];
    byCreator[a.owner_id].push(a);
  }

  let totalCreated = 0;
  let creatorsProcessed = 0;

  for (const [creatorId, creatorAssets] of Object.entries(byCreator)) {
    if (creatorAssets.length < MIN_ASSETS_FOR_CREATOR) continue;

    // Asset IDs already inside a LIVE bundle for this creator
    const { data: existingBundles } = await supabaseAdmin
      .from("bundles")
      .select("asset_ids")
      .eq("creator_id", creatorId)
      .eq("is_public", true);
    const usedAssetIds = new Set<string>();
    (existingBundles || []).forEach((b: any) => {
      (b.asset_ids || []).forEach((id: string) => usedAssetIds.add(id));
    });

    const eligibleAssets = creatorAssets.filter((a) => !usedAssetIds.has(a.id));
    if (eligibleAssets.length < 2) continue;

    creatorsProcessed++;

    try {
      const result = await suggestBundles(eligibleAssets);
      if (!result?.bundles?.length) continue;

      let createdForCreator = 0;
      for (const sug of result.bundles) {
        if (createdForCreator >= MAX_BUNDLES_PER_RUN) break;
        if ((sug.confidence ?? 0) < MIN_CONFIDENCE) continue;
        if (!sug.asset_ids || sug.asset_ids.length < 2 || sug.asset_ids.length > 5) continue;

        // Validate ownership
        const valid = eligibleAssets.filter((a) => sug.asset_ids.includes(a.id));
        if (valid.length < 2) continue;

        const totalPrice = valid.reduce((s, a) => s + (a.price_cents || 0), 0);
        if (totalPrice > MAX_BUNDLE_PRICE_CENTS) continue;
        if (totalPrice < 100) continue; // bundle must be at least $1

        const thumbnailUrl =
          (valid[0] as any)?.thumbnail_path ||
          valid[0]?.storage_path ||
          null;

        const { data: bundle, error } = await supabaseAdmin
          .from("bundles")
          .insert({
            creator_id: creatorId,
            name: sug.name,
            description: sug.description || null,
            bundle_type: sug.bundle_type || "themed_series",
            asset_ids: valid.map((a) => a.id),
            total_price_cents: totalPrice,
            is_public: true,
            thumbnail_url: thumbnailUrl,
          })
          .select()
          .single();

        if (!error && bundle) {
          createdForCreator++;
          totalCreated++;

          autoOptimizeBundleAfterCreate({
            id: bundle.id,
            name: bundle.name,
            description: bundle.description,
            bundle_type: bundle.bundle_type,
            asset_ids: valid.map(a => a.id),
          });
          // Log decision against the FIRST asset (we use a per-asset agent_decisions table)
          await supabaseAdmin.from("agent_decisions").insert({
            asset_id: valid[0].id,
            agent_type: "bundling",
            input: { asset_ids: valid.map((a) => a.id), creator_id: creatorId },
            output: {
              action: "CREATE_BUNDLE",
              bundle_id: bundle.id,
              bundle_name: sug.name,
              confidence: sug.confidence,
              total_price_cents: totalPrice,
              auto_applied: true,
            },
            explanation: `Auto-created bundle "${sug.name}" — ${valid.length} assets, $${(totalPrice / 100).toFixed(2)}, confidence ${sug.confidence}%`,
            review_action: "auto_applied",
          });
        }
      }
    } catch {
      // silent — keep cron running
    }
  }

  return { creators_processed: creatorsProcessed, bundles_created: totalCreated };
}

async function suggestBundles(assets: any[]) {
  const summaries = assets.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description?.slice(0, 100),
    category: a.category,
    tags: (a.tags || []).slice(0, 6),
    type: a.content_type,
    price: a.price_cents,
  }));

  const prompt = `You are a marketplace bundling strategist for KAIZORA.

Suggest bundles from these assets that share genre, style, or theme.

Assets:
${JSON.stringify(summaries, null, 2)}

Return ONLY valid JSON:
{
  "bundles": [
    {
      "name": "bundle name",
      "description": "why these belong together",
      "asset_ids": ["id1", "id2"],
      "bundle_type": "themed_series | complementary | complete_kit | style_pack",
      "confidence": 0-100
    }
  ]
}

Rules:
- 2-5 assets per bundle
- Only group assets that GENUINELY share a theme/style/genre
- Max 3 bundles
- Only include bundles with confidence >= 80
- Skip if no strong matches`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    });
    logGeminiUsage(res, { feature: "bundling_batch_agent", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;
    return JSON.parse(content) as { bundles: any[] };
  } catch {
    return null;
  }
}
