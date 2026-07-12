/**
 * One-off: for "Ready to List" assets (temp_assets + private assets with
 * commerce_readiness_score >= 60), re-write asset_commerce_profiles.suggested_categories
 * to ONLY contain categories that already exist in published marketplace assets.
 * That way when the user clicks "Quick Publish" the category applied is a real one.
 *
 *   npx tsx scripts/bulkCategorize.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

try {
  const envPath = join(process.cwd(), ".env");
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq < 0) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  });
} catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

async function fetchAssetMeta(assetId: string) {
  // Try temp_assets first, then assets
  const { data: temp } = await supabase
    .from("temp_assets")
    .select("id, title, description, content_type, tags")
    .eq("id", assetId)
    .maybeSingle();
  if (temp) return temp;
  const { data: asset } = await supabase
    .from("assets")
    .select("id, title, description, content_type, tags")
    .eq("id", assetId)
    .maybeSingle();
  return asset;
}

async function main() {
  // 1. Distinct existing categories from published assets
  const { data: catRows } = await supabase
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
    console.error("No existing categories in marketplace — aborting.");
    process.exit(1);
  }

  console.log(`Found ${existingCategories.length} existing categories.`);

  // 2. Ready-to-list profiles: commerce_readiness_score >= 60
  const { data: profiles, error } = await supabase
    .from("asset_commerce_profiles")
    .select("asset_id, suggested_categories, commerce_readiness_score")
    .gte("commerce_readiness_score", 60);
  if (error) throw error;
  if (!profiles || profiles.length === 0) {
    console.log("No ready-to-list profiles.");
    return;
  }

  console.log(`Processing ${profiles.length} ready-to-list profiles…\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of profiles) {
    const meta = await fetchAssetMeta(p.asset_id);
    if (!meta) {
      skipped++;
      console.log(`⊘ ${p.asset_id} (no asset row found)`);
      continue;
    }

    try {
      const prompt = `You are KAIZORA's category classifier. Pick the SINGLE best category for this asset.

Asset:
- Title: ${meta.title || "untitled"}
- Description: ${meta.description || "none"}
- Content type: ${meta.content_type || "unknown"}
- Tags: ${(meta.tags || []).join(", ") || "none"}

You MUST choose ONE category from this list — do NOT invent a new one:
${existingCategories.map((c) => `- ${c}`).join("\n")}

If absolutely no category fits, return null.

Return ONLY valid JSON:
{ "category": "<exact match from list, or null>", "confidence": 0-100, "reason": "<one short sentence>" }`;

      const res = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      });
      logGeminiUsage(res, { feature: "bulk_categorize_script", model: "gemini-3.1-pro-preview" });
      const parsed = JSON.parse(res.response.text()) as {
        category: string | null;
        confidence: number;
        reason: string;
      };

      let chosen: string | null = null;
      if (parsed.category) {
        const match = existingCategories.find(
          (c) => c.toLowerCase() === parsed.category!.toLowerCase().trim(),
        );
        chosen = match ?? null;
      }

      if (!chosen) {
        skipped++;
        console.log(`⊘ ${meta.title} → (no match) ${parsed.reason ?? ""}`);
        continue;
      }

      await supabase
        .from("asset_commerce_profiles")
        .update({ suggested_categories: [chosen] })
        .eq("asset_id", p.asset_id);

      updated++;
      console.log(`✓ ${meta.title}  →  ${chosen}  (${parsed.confidence}%)`);
    } catch (err: any) {
      failed++;
      console.error(`✗ ${meta.title}  →  ${err.message}`);
    }
  }

  console.log(`\nDone. Updated: ${updated} · Skipped: ${skipped} · Failed: ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
