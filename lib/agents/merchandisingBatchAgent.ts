import { supabaseAdmin } from "@/lib/supabaseServer";
import { analyzeMerchandising } from "@/lib/ai/merchandisingAgent";

/**
 * Autonomous batch merchandising agent.
 * Iterates over every creator with 2+ assets, runs AI analysis,
 * and auto-applies ALL feature/unfeature recommendations (no priority gate).
 * Logs every action into agent_decisions for audit trail.
 */
export async function runMerchandisingBatchAgent() {
  // ── Respect global AI switch ──
  const { data: aiControl } = await supabaseAdmin
    .from("ai_controls")
    .select("enabled")
    .eq("key", "agents_enabled")
    .single();
  if (aiControl && aiControl.enabled === false) return { skipped: true };

  // Find every creator with at least 2 assets
  const { data: creators, error } = await supabaseAdmin
    .from("assets")
    .select("owner_id")
    .not("owner_id", "is", null);

  if (error) return { error: error.message };

  const creatorIds = Array.from(new Set((creators || []).map((c: any) => c.owner_id)));

  let totalApplied = 0;
  let totalCreatorsRun = 0;

  for (const creatorId of creatorIds) {
    try {
      const { data: assets } = await supabaseAdmin
        .from("assets")
        .select("id, title, description, category, tags, views_count, purchases_count, featured, price_cents, agent_mode, manual_override_until")
        .eq("owner_id", creatorId);

      if (!assets || assets.length < 2) continue;

      // Filter out assets under manual override
      const eligibleAssets = assets.filter(
        (a: any) =>
          !a.manual_override_until ||
          new Date(a.manual_override_until) <= new Date(),
      );
      if (eligibleAssets.length < 2) continue;

      const result = await analyzeMerchandising(eligibleAssets);
      if (!result) continue;

      const assetsById: Record<string, any> = {};
      eligibleAssets.forEach((a: any) => { assetsById[a.id] = a; });

      // Auto-apply ALL feature/unfeature recommendations (no priority gate — it's autonomous)
      for (const rec of result.feature_recommendations || []) {
        const asset = assetsById[rec.asset_id];
        if (!asset) continue;
        if (rec.action === "keep") continue;

        const newFeatured = rec.action === "feature";
        if (asset.featured === newFeatured) continue;

        const { error: updErr } = await supabaseAdmin
          .from("assets")
          .update({
            featured: newFeatured,
            last_agent_action: newFeatured ? "FEATURED" : "UNFEATURED",
            last_agent_run_at: new Date().toISOString(),
          })
          .eq("id", rec.asset_id)
          .eq("owner_id", creatorId);

        if (!updErr) {
          totalApplied++;
          // Log to agent_decisions for audit
          await supabaseAdmin.from("agent_decisions").insert({
            asset_id: rec.asset_id,
            agent_type: "merchandising",
            input: {
              previous_featured: asset.featured,
              priority: rec.priority,
              views: asset.views_count,
              purchases: asset.purchases_count,
            },
            output: {
              action: rec.action.toUpperCase(),
              new_featured: newFeatured,
              auto_applied: true,
            },
            explanation: rec.reason,
            review_action: "auto_applied",
          });
        }
      }

      // Save cross-sell groups (best-effort)
      if (result.cross_sell_groups?.length) {
        const validGroups = result.cross_sell_groups
          .map((g) => ({
            ...g,
            asset_ids: g.asset_ids.filter((id: string) => assetsById[id]),
          }))
          .filter((g) => g.asset_ids.length >= 2);

        if (validGroups.length > 0) {
          await supabaseAdmin
            .from("creator_storefront")
            .upsert(
              {
                creator_id: creatorId,
                cross_sell_groups: validGroups,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "creator_id" },
            );
        }
      }

      totalCreatorsRun++;
    } catch {
      // silent
    }
  }

  return { creators_scanned: creatorIds.length, creators_processed: totalCreatorsRun, actions_applied: totalApplied };
}
