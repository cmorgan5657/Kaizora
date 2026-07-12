import { supabaseAdmin } from "@/lib/supabaseServer";
import { optimizeSearch } from "@/lib/ai/searchOptimizationAgent";

/**
 * Autonomous Search Optimization Batch Agent.
 *
 * Targets: public assets with fewer than 10 views after 7+ days live,
 * cooldown of 14 days between re-optimizations, respects manual_override_until.
 *
 * Auto-applies tags/keywords/category when Gemini predicts a 20+ point gain.
 * Never overwrites the title.
 */

const VIEWS_THRESHOLD = 10;
const MIN_AGE_DAYS = 7;
const COOLDOWN_DAYS = 14;
const MIN_SCORE_GAIN = 20;

export async function runSearchOptimizationBatchAgent() {
  // Respect global AI switch
  const { data: aiControl } = await supabaseAdmin
    .from("ai_controls")
    .select("enabled")
    .eq("key", "agents_enabled")
    .maybeSingle();
  if (aiControl && aiControl.enabled === false) return { skipped: true };

  const minAgeCutoff = new Date(Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: assets, error } = await supabaseAdmin
    .from("assets")
    .select(
      "id, title, description, category, tags, keywords, views_count, last_search_optimized_at, manual_override_until, owner_id"
    )
    .eq("is_public", true)
    .lt("views_count", VIEWS_THRESHOLD)
    .lt("created_at", minAgeCutoff);

  if (error) return { error: error.message };

  let optimized = 0;
  let skipped = 0;

  for (const asset of assets || []) {
    // Skip if under manual override
    if (
      asset.manual_override_until &&
      new Date(asset.manual_override_until) > new Date()
    ) {
      skipped++;
      continue;
    }

    // Cooldown check
    if (
      asset.last_search_optimized_at &&
      asset.last_search_optimized_at > cooldownCutoff
    ) {
      skipped++;
      continue;
    }

    // Pre-filter: skip already-well-optimized assets (saves Gemini quota)
    // Criteria: 5+ tags AND description with 100+ characters
    const tagCount = (asset.tags || []).length;
    const descLen = (asset.description || "").length;
    if (tagCount >= 5 && descLen >= 100) {
      skipped++;
      continue;
    }

    try {
      const result = await optimizeSearch({
        id: asset.id,
        title: asset.title || "",
        description: asset.description || "",
        category: asset.category || "",
        tags: asset.tags || [],
        keywords: asset.keywords || [],
      });

      if (!result) continue;

      // Decide if we apply: score must indicate meaningful improvement
      const projectedGain = result.search_score - estimateCurrentScore(asset);
      const apply = projectedGain >= MIN_SCORE_GAIN;

      if (apply) {
        const { error: updErr } = await supabaseAdmin
          .from("assets")
          .update({
            tags: result.optimized_tags,
            keywords: result.optimized_keywords,
            category: result.suggested_category || asset.category,
            last_search_optimized_at: new Date().toISOString(),
            last_agent_action: "SEARCH_OPTIMIZED",
            last_agent_run_at: new Date().toISOString(),
          })
          .eq("id", asset.id);

        if (!updErr) {
          optimized++;
          await supabaseAdmin.from("agent_decisions").insert({
            asset_id: asset.id,
            agent_type: "search_optimization",
            input: {
              old_tags: asset.tags || [],
              old_keywords: asset.keywords || [],
              old_category: asset.category,
              views: asset.views_count,
            },
            output: {
              new_tags: result.optimized_tags,
              new_keywords: result.optimized_keywords,
              new_category: result.suggested_category,
              search_score: result.search_score,
              improvements: result.improvements,
              auto_applied: true,
            },
            explanation: `Optimized search: tags ${asset.tags?.length || 0}→${result.optimized_tags.length}, predicted score ${result.search_score}/100`,
            review_action: "auto_applied",
          });
        }
      } else {
        // Log a "no-op" decision so we know we looked but didn't act
        await supabaseAdmin.from("agent_decisions").insert({
          asset_id: asset.id,
          agent_type: "search_optimization",
          input: { views: asset.views_count, current_tags: asset.tags?.length || 0 },
          output: {
            search_score: result.search_score,
            projected_gain: projectedGain,
            auto_applied: false,
            reason: "gain_below_threshold",
          },
          explanation: `Predicted gain ${projectedGain} points — below threshold of ${MIN_SCORE_GAIN}`,
          review_action: "no_op",
        });
        skipped++;
      }
    } catch {
      // silent — keep cron running
    }
  }

  return { candidates: assets?.length || 0, optimized, skipped };
}

// Rough estimate of current search score based on tag/keyword/description fullness.
// (Used only for delta calculation against AI's predicted score.)
function estimateCurrentScore(asset: any): number {
  let score = 30; // baseline
  const tagCount = (asset.tags || []).length;
  const kwCount = (asset.keywords || []).length;
  const descLen = (asset.description || "").length;
  score += Math.min(tagCount * 4, 25); // up to +25 for tags
  score += Math.min(kwCount * 5, 20); // up to +20 for keywords
  if (descLen > 50) score += 10;
  if (asset.category) score += 5;
  return Math.min(score, 100);
}
