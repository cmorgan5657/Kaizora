import { supabaseAdmin } from "@/lib/supabaseServer";

/**
 * Autonomous Debundling Batch Agent.
 *
 * Reviews live bundles and quietly delists ones that aren't performing.
 *
 * Triggers (any one is enough):
 *   - 60+ days live with 0 sales → delist
 *   - Individual assets in the bundle have 5x+ more sales than the bundle → delist
 *
 * Action: sets bundles.is_public = false (NEVER deletes).
 * Stamps auto_delisted_reason for the dashboard.
 */

const STALE_DAYS = 60;
const INDIVIDUAL_VS_BUNDLE_RATIO = 5;

export async function runDebundlingBatchAgent() {

  const { data: aiControl } = await supabaseAdmin
    .from("ai_controls")
    .select("enabled")
    .eq("key", "agents_enabled")
    .maybeSingle();
  if (aiControl && aiControl.enabled === false) {
    return { skipped: true };
  }

  const { data: bundles } = await supabaseAdmin
    .from("bundles")
    .select("id, creator_id, name, asset_ids, sales_count, last_sale_at, created_at, is_public")
    .eq("is_public", true);

  let delisted = 0;
  let inspected = 0;
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  for (const b of bundles || []) {
    inspected++;
    let reason: string | null = null;

    const ageDays = Math.floor(
      (Date.now() - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24),
    );

    // Trigger 1: stale + no sales
    if (
      new Date(b.created_at) < staleCutoff &&
      (b.sales_count || 0) === 0
    ) {
      reason = `${ageDays} days live with zero sales`;
    }

    // Trigger 2: individual assets outperform the bundle
    if (!reason && (b.asset_ids || []).length > 0) {
      const { data: assetStats } = await supabaseAdmin
        .from("assets")
        .select("id, purchases_count")
        .in("id", b.asset_ids);

      const totalIndividualSales = (assetStats || []).reduce(
        (s, a: any) => s + (a.purchases_count || 0),
        0,
      );

      if (
        totalIndividualSales >= INDIVIDUAL_VS_BUNDLE_RATIO * Math.max(b.sales_count || 0, 1) &&
        totalIndividualSales >= 5 // need real signal, not 1-2 buys
      ) {
        reason = `Individual assets sold ${totalIndividualSales}× vs bundle ${b.sales_count || 0}× — bundle isn't earning its place`;
      }
    }

    if (reason) {
      const { error } = await supabaseAdmin
        .from("bundles")
        .update({
          is_public: false,
          auto_delisted_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.id);

      if (!error) {
        delisted++;
        // Log against the first asset in the bundle
        if ((b.asset_ids || []).length > 0) {
          await supabaseAdmin.from("agent_decisions").insert({
            asset_id: b.asset_ids[0],
            agent_type: "debundling",
            input: {
              bundle_id: b.id,
              bundle_name: b.name,
              age_days: ageDays,
              sales_count: b.sales_count || 0,
            },
            output: {
              action: "DELIST_BUNDLE",
              bundle_id: b.id,
              bundle_name: b.name,
              auto_applied: true,
            },
            explanation: `Auto-delisted bundle "${b.name}" — ${reason}`,
            review_action: "auto_applied",
          });
        }
      }
    }
  }

  return { bundles_inspected: inspected, bundles_delisted: delisted };
}
