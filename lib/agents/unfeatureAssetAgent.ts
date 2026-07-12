import { supabase } from "@/lib/supabaseClient";

export async function runUnfeatureAssetAgent() {
  // 🔴 AI GLOBAL SWITCH
  const { data: aiControl } = await supabase
    .from("ai_controls")
    .select("enabled")
    .eq("key", "agents_enabled")
    .single();

  if (!aiControl?.enabled) return;
  const { data: assets, error } = await supabase.from("assets").select(`
    id,
    purchases_count,
    price_cents,
    created_at,
    featured,
    agent_mode,
    manual_override_until
  `);

  if (error || !assets) return;

  for (const asset of assets) {
    /* =========================================================
       1️⃣ MANUAL OVERRIDE GUARD
       ========================================================= */
    if (
      asset.manual_override_until &&
      new Date(asset.manual_override_until).getTime() > Date.now()
    ) {
      continue;
    }
    // 🛑 MINIMUM AGE GUARD (UNFEATURE)
    const ageInDays =
      (Date.now() - new Date(asset.created_at).getTime()) /
      (1000 * 60 * 60 * 24);

    if (ageInDays < 7) continue;

    /* =========================================================
       2️⃣ ONLY FEATURED ASSETS
       ========================================================= */
    if (!asset.featured) continue;

    /* =========================================================
       3️⃣ UNFEATURE CONDITION
       ========================================================= */
    const shouldUnfeature = (asset.purchases_count ?? 0) < 2;
    if (!shouldUnfeature) continue;

    /* =========================================================
       4️⃣ CONFIDENCE + EXPLANATION
       ========================================================= */
    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      asset.purchases_count === 0 ? "HIGH" : "MEDIUM";

    const explanation =
      "Asset was previously featured but recent purchase activity dropped below the minimum threshold, indicating reduced demand.";

    /* =========================================================
       5️⃣ PREVENT DUPLICATE OPEN DECISIONS
       ========================================================= */
    const { data: existing } = await supabase
      .from("agent_decisions")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("agent_type", "unfeature")
      .is("review_action", null)
      .limit(1)
      .single();

    if (existing) continue;

    await supabase.from("agent_decisions").insert({
      asset_id: asset.id,
      agent_type: "unfeature",
      input: {
        purchases_count: asset.purchases_count,
        price_cents: asset.price_cents,
        created_at: asset.created_at,
      },
      output: {
        action: "UNFEATURE",
        confidence,
      },
      explanation,
    });

    // 2️⃣ AUTO only if HIGH confidence
    if (asset.agent_mode === "AUTO" && confidence === "HIGH") {
      await supabase
        .from("assets")
        .update({
          featured: false,
          last_agent_action: "UNFEATURED",
          last_agent_run_at: new Date().toISOString(),
        })
        .eq("id", asset.id);
    } else {
      // 3️⃣ Otherwise just mark agent run
      await supabase
        .from("assets")
        .update({
          last_agent_run_at: new Date().toISOString(),
        })
        .eq("id", asset.id);
    }

  }
}
