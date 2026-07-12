import { supabase } from "@/lib/supabaseClient";
import { shouldFeatureAsset } from "@/lib/ai/shouldFeatureAsset";

export async function runFeatureAssetAgent() {
  // 🔴 AI GLOBAL SWITCH
  const { data: aiControl } = await supabase
    .from("ai_controls")
    .select("enabled")
    .eq("key", "agents_enabled")
    .single();

  if (!aiControl?.enabled) return;
  const { data: assets, error } = await supabase.from("assets").select(
    `
      id,
      purchases_count,
      price_cents,
      created_at,
      featured,
      agent_mode,
      manual_override_until
      `
  );

  if (error || !assets) return;

  for (const asset of assets) {
    // ⏸ Manual override guard
    if (
      asset.manual_override_until &&
      new Date(asset.manual_override_until) > new Date()
    ) {
      continue;
    }
    // 🛑 MINIMUM AGE GUARD (FEATURE)
    const ageInDays =
      (Date.now() - new Date(asset.created_at).getTime()) /
      (1000 * 60 * 60 * 24);

    if (ageInDays < 7) continue;

    if (asset.featured) continue;

    const aiDecision = await shouldFeatureAsset({
      purchases_count: asset.purchases_count ?? 0,
      price_cents: asset.price_cents ?? 0,
      created_at: asset.created_at,
    });

    const shouldFeature =
      aiDecision !== null ? aiDecision : (asset.purchases_count ?? 0) >= 2;

    const confidence: "HIGH" | "MEDIUM" | "LOW" =
      aiDecision === true ? "HIGH" : aiDecision === false ? "MEDIUM" : "LOW";

    const explanation = shouldFeature
      ? aiDecision !== null
        ? "AI detected strong engagement signals indicating this asset should be featured."
        : "Asset met minimum purchase threshold and was featured by fallback rule."
      : aiDecision !== null
      ? "AI determined this asset does not yet have enough engagement to be featured."
      : "Asset did not meet minimum purchase threshold.";

    // 🚫 Prevent duplicate pending decision
    const { data: existing } = await supabase
      .from("agent_decisions")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("agent_type", "feature")
      .is("review_action", null)
      .limit(1)
      .single();

    if (existing) continue;

    // Record that the agent evaluated this asset even when it decides not to
    // feature it, so the Commerce Intelligence dashboard can show the run.
    if (!shouldFeature) {
      await supabase.from("agent_decisions").insert({
        asset_id: asset.id,
        agent_type: "feature",
        input: {
          purchases_count: asset.purchases_count,
          price_cents: asset.price_cents,
          created_at: asset.created_at,
        },
        output: {
          action: "KEEP_UNFEATURED",
          confidence,
          auto_applied: false,
        },
        explanation,
        review_action: "no_op",
      });

      await supabase
        .from("assets")
        .update({
          last_agent_run_at: new Date().toISOString(),
        })
        .eq("id", asset.id);

      continue;
    }

    // ✅ WRITE FEATURE SUGGESTION (ONLY WHEN FEATURE)
    if (shouldFeature) {
      // 1️⃣ Always log suggestion
      await supabase.from("agent_decisions").insert({
        asset_id: asset.id,
        agent_type: "feature",
        input: {
          purchases_count: asset.purchases_count,
          price_cents: asset.price_cents,
          created_at: asset.created_at,
        },
        output: {
          action: "FEATURE",
          confidence,
        },
        explanation,
      });

      // 2️⃣ AUTO only if HIGH confidence
      if (asset.agent_mode === "AUTO" && confidence === "HIGH") {
        await supabase
          .from("assets")
          .update({
            featured: true,
            last_agent_action: "FEATURED",
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
}
