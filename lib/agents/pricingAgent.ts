import { supabase } from "@/lib/supabaseClient";
import { getDemandScore } from "@/lib/ai/shouldAdjustPrice";

export async function runPricingAgent() {
  const { data: assets, error } = await supabase.from("assets").select(
    `
      id,
      purchases_count,
      price_cents,
      created_at,
      agent_mode,
      last_agent_run_at,
      manual_override_until
    `
  );

  if (error || !assets) return;

  for (const asset of assets) {
    if (
      asset.manual_override_until &&
      Date.now() < new Date(asset.manual_override_until).getTime()
    ) {
      continue;
    }

    if (
      asset.last_agent_run_at &&
      Date.now() - new Date(asset.last_agent_run_at).getTime() <
        24 * 60 * 60 * 1000
    ) {
      continue;
    }
    // 🛑 MINIMUM SIGNAL GUARD
    const ageInDays =
      (Date.now() - new Date(asset.created_at).getTime()) /
      (1000 * 60 * 60 * 24);

    if (ageInDays < 7) continue;
    if ((asset.purchases_count ?? 0) < 1) continue;

    /* =========================================================
       3️⃣ BASIC VALIDATION
       ========================================================= */
    if (!asset.price_cents || asset.price_cents <= 0) continue;

    /* =========================================================
       4️⃣ DEMAND SCORE
       ========================================================= */
    const score = await getDemandScore({
      purchases_count: asset.purchases_count ?? 0,
      price_cents: asset.price_cents,
      created_at: asset.created_at,
    });

    if (score === null) continue;

    const action = score >= 75 ? "INCREASE" : score <= 25 ? "DECREASE" : "HOLD";

    if (action === "HOLD") continue;

    /* =========================================================
       5️⃣ CONFIDENCE
       ========================================================= */
    let confidence: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    if (score >= 85 || score <= 15) confidence = "HIGH";
    else if (score >= 70 || score <= 30) confidence = "MEDIUM";
    else confidence = "LOW";

    /* =========================================================
       6️⃣ EXPLANATION
       ========================================================= */
    const explanation =
      action === "INCREASE"
        ? `High demand score (${score}) indicates strong buyer interest.`
        : `Low demand score (${score}) suggests price resistance.`;

    /* =========================================================
       7️⃣ PREVENT DUPLICATE OPEN SUGGESTIONS
       ========================================================= */
    const { data: existing } = await supabase
      .from("agent_decisions")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("agent_type", "pricing")
      .is("review_action", null)
      .limit(1)
      .single();

    if (existing) continue;

    /* =========================================================
       8️⃣ SUGGEST MODE → LOG ONLY
       ========================================================= */
    await supabase.from("agent_decisions").insert({
      asset_id: asset.id,
      agent_type: "pricing",
      input: {
        purchases: asset.purchases_count,
        price: asset.price_cents,
        created_at: asset.created_at,
      },
      output: {
        score,
        action,
        confidence,
      },
      explanation,
    });

    await supabase
      .from("assets")
      .update({
        last_agent_run_at: new Date().toISOString(),
      })
      .eq("id", asset.id);

    let newPrice = asset.price_cents;

    if (action === "INCREASE") {
      newPrice = Math.round(asset.price_cents * 1.1);
    } else if (action === "DECREASE") {
      newPrice = Math.round(asset.price_cents * 0.9);
    }

    if (
      newPrice !== asset.price_cents &&
      asset.agent_mode === "AUTO" &&
      confidence === "HIGH"
    ) {
      await supabase
        .from("assets")
        .update({
          price_cents: newPrice,
          last_agent_action: "PRICE_UPDATED",
        })
        .eq("id", asset.id);
    }

  }
}
