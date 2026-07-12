/**
 * One-off cleanup: null out category on any asset that is NOT marked
 * listing_readiness_status='ready' in asset_commerce_profiles.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  const { data: readyProfiles } = await supabase
    .from("asset_commerce_profiles")
    .select("asset_id")
    .eq("listing_readiness_status", "ready");
  const readyIds = new Set((readyProfiles || []).map((r: any) => r.asset_id));

  // Assets that have a category but are NOT ready-to-list
  const { data: withCat } = await supabase
    .from("assets")
    .select("id, title, category")
    .not("category", "is", null);

  const toRevert = (withCat || []).filter((a: any) => !readyIds.has(a.id));
  console.log(`Reverting category on ${toRevert.length} non-ready assets…\n`);

  for (const a of toRevert) {
    await supabase.from("assets").update({ category: null }).eq("id", a.id);
    console.log(`✓ ${a.title} (was ${a.category})`);
  }
  console.log(`\nDone. Reverted ${toRevert.length} assets.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
