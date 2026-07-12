import { supabaseAdmin } from "@/lib/supabaseServer";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

/**
 * Autonomous Post-Launch Optimizer.
 *
 * For every public asset that's at least 7 days old:
 *  - Compute conversion = purchases / views
 *  - HEALTHY (≥2%) and selling well (≥5%) → auto-FEATURE
 *  - NEEDS ATTENTION (0.5–2%) → log + review
 *  - UNDERPERFORMING (<0.5%):
 *      • high views, no buys → drop price 10%
 *      • low views → flag for search optimization next run
 *      • severely stale (90+ days low activity) → unfeature + mark as remix candidate
 *  - WEAK TITLE detected by AI → retitle
 *
 * One action per asset per run.
 */

const MIN_AGE_DAYS = 7;
const STALE_DAYS = 90;
const COOLDOWN_DAYS = 7;

const HEALTHY_CONV = 0.02; // 2%
const FEATURE_CONV = 0.05; // 5%
const UNDERPERF_CONV = 0.005; // 0.5%
const HIGH_VIEWS_THRESHOLD = 50;

export async function runPostLaunchBatchAgent() {
  const { data: aiControl } = await supabaseAdmin
    .from("ai_controls")
    .select("enabled")
    .eq("key", "agents_enabled")
    .maybeSingle();
  if (aiControl && aiControl.enabled === false) return { skipped: true };

  const minAgeCutoff = new Date(Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select(
      "id, title, description, category, tags, content_type, price_cents, views_count, purchases_count, saves_count, clicks_count, featured, owner_id, created_at, manual_override_until, remix_candidate"
    )
    .eq("is_public", true)
    .lt("created_at", minAgeCutoff);


  const stats = {
    repriced: 0,
    featured: 0,
    unfeatured: 0,
    retitled: 0,
    sent_to_remix: 0,
    flagged_for_search: 0,
    healthy_no_op: 0,
    skipped: 0,
  };

  for (const asset of assets || []) {
    // Manual override guard
    if (
      asset.manual_override_until &&
      new Date(asset.manual_override_until) > new Date()
    ) {
      stats.skipped++;
      continue;
    }

    // Per-asset cooldown
    const { data: lastDecision } = await supabaseAdmin
      .from("agent_decisions")
      .select("created_at")
      .eq("asset_id", asset.id)
      .eq("agent_type", "post_launch")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastDecision && new Date(lastDecision.created_at) > cooldownCutoff) {
      stats.skipped++;
      continue;
    }

    const views = asset.views_count || 0;
    const purchases = asset.purchases_count || 0;
    const conv = views > 0 ? purchases / views : 0;
    const isStale = new Date(asset.created_at) < staleCutoff && purchases === 0;

    // ── DECISION TREE ──

    // 1. SEVERELY STALE → mark as remix candidate + unfeature
    if (isStale) {
      const updates: any = {
        remix_candidate: true,
        remix_candidate_reason: `${STALE_DAYS}+ days live with 0 sales`,
        last_agent_action: "MARKED_REMIX_CANDIDATE",
        last_agent_run_at: new Date().toISOString(),
      };
      if (asset.featured) updates.featured = false;

      const { error } = await supabaseAdmin
        .from("assets")
        .update(updates)
        .eq("id", asset.id);

      if (!error) {
        stats.sent_to_remix++;
        if (asset.featured) stats.unfeatured++;
        await logDecision(asset.id, "remix_candidate", {
          views,
          purchases,
          age_days: daysSince(asset.created_at),
        }, {
          action: "MARK_REMIX_CANDIDATE",
          previous_featured: asset.featured,
          new_featured: false,
        }, `Stale asset (${daysSince(asset.created_at)}d, 0 sales) — flagged for remix queue`);
      }
      continue;
    }

    // 2. HEALTHY w/ HIGH CONVERSION → auto-feature
    if (conv >= FEATURE_CONV && !asset.featured) {
      const { error } = await supabaseAdmin
        .from("assets")
        .update({
          featured: true,
          last_agent_action: "FEATURED",
          last_agent_run_at: new Date().toISOString(),
        })
        .eq("id", asset.id);

      if (!error) {
        stats.featured++;
        await logDecision(asset.id, "feature", { views, purchases, conversion: conv }, {
          action: "FEATURE",
          previous: false,
          new: true,
        }, `Conversion ${(conv * 100).toFixed(1)}% — promoted to featured`);
      }
      continue;
    }

    // 3. UNDERPERFORMING + HIGH VIEWS → drop price 10%
    if (conv < UNDERPERF_CONV && views >= HIGH_VIEWS_THRESHOLD && asset.price_cents > 100) {
      const newPrice = Math.max(100, Math.floor(asset.price_cents * 0.9));
      const { error } = await supabaseAdmin
        .from("assets")
        .update({
          price_cents: newPrice,
          last_agent_action: "REPRICED",
          last_agent_run_at: new Date().toISOString(),
        })
        .eq("id", asset.id);

      if (!error) {
        stats.repriced++;
        await logDecision(asset.id, "post_launch", {
          views,
          purchases,
          conversion: conv,
          old_price: asset.price_cents,
        }, {
          action: "REPRICE",
          new_price: newPrice,
          discount_pct: 10,
        }, `${views} views, ${purchases} buys (${(conv * 100).toFixed(2)}% conv) — price cut 10%`);
      }
      continue;
    }

    // 4. UNDERPERFORMING + LOW VIEWS → flag for search optimization
    if (conv < UNDERPERF_CONV && views < HIGH_VIEWS_THRESHOLD) {
      // Trigger by clearing last_search_optimized_at so next search-batch picks it up
      await supabaseAdmin
        .from("assets")
        .update({
          last_search_optimized_at: null,
          last_agent_action: "FLAGGED_FOR_SEARCH",
          last_agent_run_at: new Date().toISOString(),
        })
        .eq("id", asset.id);

      stats.flagged_for_search++;
      await logDecision(asset.id, "post_launch", {
        views,
        purchases,
      }, {
        action: "FLAG_FOR_SEARCH",
      }, `Only ${views} views — handed to search agent for tag/keyword optimization`);
      continue;
    }

    // 5. WEAK TITLE check (only for assets with views but mediocre conversion)
    if (views > 20 && conv >= UNDERPERF_CONV && conv < HEALTHY_CONV) {
      try {
        const titleResult = await suggestRetitle(asset);
        if (titleResult && titleResult.should_retitle && titleResult.new_title) {
          const oldTitle = asset.title;
          const { error } = await supabaseAdmin
            .from("assets")
            .update({
              title: titleResult.new_title,
              last_agent_action: "RETITLED",
              last_agent_run_at: new Date().toISOString(),
            })
            .eq("id", asset.id);

          if (!error) {
            stats.retitled++;
            await logDecision(asset.id, "post_launch", {
              old_title: oldTitle,
              views,
              purchases,
            }, {
              action: "RETITLE",
              new_title: titleResult.new_title,
              old_title: oldTitle,
            }, titleResult.reason);
          }
          continue;
        }
      } catch {
        // silent
      }
    }

    // 6. HEALTHY → no-op log (so dashboard can show "audited, looking good")
    stats.healthy_no_op++;
  }

  return stats;
}

async function logDecision(
  assetId: string,
  agentSubtype: string,
  input: any,
  output: any,
  explanation: string,
) {
  await supabaseAdmin.from("agent_decisions").insert({
    asset_id: assetId,
    agent_type: "post_launch",
    input: { ...input, subtype: agentSubtype },
    output: { ...output, auto_applied: true },
    explanation,
    review_action: "auto_applied",
  });
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

async function suggestRetitle(asset: any): Promise<{ should_retitle: boolean; new_title?: string; reason: string } | null> {
  const prompt = `You are a marketplace listing copywriter. Given this asset, decide if its title is hurting conversions.

Title: ${asset.title}
Description: ${asset.description?.slice(0, 200) || "none"}
Category: ${asset.category || "none"}
Tags: ${(asset.tags || []).join(", ") || "none"}
Stats: ${asset.views_count} views, ${asset.purchases_count} buys

Return ONLY valid JSON:
{
  "should_retitle": true/false,
  "new_title": "string (max 60 chars, only if should_retitle=true)",
  "reason": "1 sentence why (or why not)"
}

Only suggest a retitle if the current title is vague, generic, or fails to describe what's actually inside. Be conservative.`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    });
    logGeminiUsage(res, { feature: "post_launch_batch_agent", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}
