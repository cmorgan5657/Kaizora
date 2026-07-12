import { supabaseAdmin } from "@/lib/supabaseServer";
import { analyzeCatalog } from "@/lib/ai/catalogStrategyAgent";

/**
 * Autonomous batch catalog strategy agent.
 * Iterates over every creator, auto-features top performers,
 * auto-unfeatures poor performers, and saves storefront strategy.
 */
export async function runCatalogBatchAgent() {
  // ── Respect global AI switch ──
  const { data: aiControl } = await supabaseAdmin
    .from("ai_controls")
    .select("enabled")
    .eq("key", "agents_enabled")
    .single();
  if (aiControl && aiControl.enabled === false) return { skipped: true };

  const { data: creators } = await supabaseAdmin
    .from("assets")
    .select("owner_id")
    .not("owner_id", "is", null);

  const creatorIds = Array.from(new Set((creators || []).map((c: any) => c.owner_id)));

  let totalActions = 0;
  let creatorsProcessed = 0;

  for (const creatorId of creatorIds) {
    try {
      const { data: assets } = await supabaseAdmin
        .from("assets")
        .select("id, title, description, category, tags, content_type, price_cents, purchases_count, views_count, featured, is_public, manual_override_until")
        .eq("owner_id", creatorId);

      if (!assets || assets.length < 2) continue;

      // Filter out manually-overridden assets
      const eligibleAssets = assets.filter(
        (a: any) =>
          !a.manual_override_until ||
          new Date(a.manual_override_until) <= new Date(),
      );
      if (eligibleAssets.length < 2) continue;

      const result = await analyzeCatalog(eligibleAssets);
      if (!result) continue;

      const assetsById: Record<string, any> = {};
      eligibleAssets.forEach((a: any) => { assetsById[a.id] = a; });

      // 1. Auto-feature top 3 performers
      const publicAssets = eligibleAssets.filter((a: any) => a.is_public);
      const topPerformers = [...publicAssets]
        .sort((a: any, b: any) => {
          const p = (b.purchases_count || 0) - (a.purchases_count || 0);
          if (p !== 0) return p;
          return (b.views_count || 0) - (a.views_count || 0);
        })
        .slice(0, 3);

      for (const top of topPerformers) {
        if (top.featured) continue;
        if ((top.purchases_count || 0) === 0 && (top.views_count || 0) < 5) continue;

        const { error } = await supabaseAdmin
          .from("assets")
          .update({
            featured: true,
            last_agent_action: "FEATURED",
            last_agent_run_at: new Date().toISOString(),
          })
          .eq("id", top.id)
          .eq("owner_id", creatorId);

        if (!error) {
          totalActions++;
          await supabaseAdmin.from("agent_decisions").insert({
            asset_id: top.id,
            agent_type: "catalog",
            input: { purchases: top.purchases_count, views: top.views_count },
            output: { action: "FEATURE", reason: "top_performer", auto_applied: true },
            explanation: `Top performer: ${top.purchases_count || 0} purchases, ${top.views_count || 0} views`,
            review_action: "auto_applied",
          });
        }
      }

      // 2. Auto-unfeature poor performers
      const poorPerformers = publicAssets.filter(
        (a: any) =>
          a.featured &&
          (a.views_count || 0) > 50 &&
          (a.purchases_count || 0) === 0 &&
          !topPerformers.some((t: any) => t.id === a.id),
      );

      for (const poor of poorPerformers) {
        const { error } = await supabaseAdmin
          .from("assets")
          .update({
            featured: false,
            last_agent_action: "UNFEATURED",
            last_agent_run_at: new Date().toISOString(),
          })
          .eq("id", poor.id)
          .eq("owner_id", creatorId);

        if (!error) {
          totalActions++;
          await supabaseAdmin.from("agent_decisions").insert({
            asset_id: poor.id,
            agent_type: "catalog",
            input: { purchases: poor.purchases_count, views: poor.views_count },
            output: { action: "UNFEATURE", reason: "poor_converter", auto_applied: true },
            explanation: `${poor.views_count} views, 0 purchases — not converting`,
            review_action: "auto_applied",
          });
        }
      }

      // 3. Save storefront strategy
      if (
        (result.cross_sell_opportunities?.length || 0) > 0 ||
        (result.storefront_suggestions?.length || 0) > 0
      ) {
        const validCrossSells = (result.cross_sell_opportunities || []).filter(
          (cs: any) => assetsById[cs.from_asset_id] && assetsById[cs.to_asset_id],
        );

        await supabaseAdmin
          .from("creator_storefront")
          .upsert(
            {
              creator_id: creatorId,
              cross_sell_pairs: validCrossSells,
              storefront_suggestions: result.storefront_suggestions || [],
              portfolio_health: result.portfolio_health,
              portfolio_summary: result.portfolio_summary,
              last_analyzed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "creator_id" },
          );
      }

      creatorsProcessed++;
    } catch {
      // silent
    }
  }

  return { creators_scanned: creatorIds.length, creators_processed: creatorsProcessed, actions_applied: totalActions };
}
