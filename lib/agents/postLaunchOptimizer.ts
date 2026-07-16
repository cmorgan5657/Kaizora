import { supabase } from "@/lib/supabaseClient";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

/**
 * Post-Launch Optimization Agent
 * Runs periodically across all public assets.
 * Checks performance, suggests optimizations, logs to agent_decisions.
 * Respects ai_controls and agent_mode settings.
 */
export async function runPostLaunchOptimizer() {
  // Check if agent is enabled
  const { data: control } = await supabase
    .from("ai_controls")
    .select("enabled")
    .eq("key", "post_launch_optimizer")
    .maybeSingle();

  if (control && !control.enabled) return;

  // Get public assets
  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, title, description, category, tags, views_count, purchases_count, price_cents, created_at, owner_id")
    .eq("is_public", true);

  if (error || !assets) return;

  for (const asset of assets) {
    // Cooldown: skip if optimized in last 7 days
    const { data: lastRun } = await supabase
      .from("agent_decisions")
      .select("created_at")
      .eq("asset_id", asset.id)
      .eq("agent_type", "post_launch_optimizer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRun) {
      const daysSince = (Date.now() - new Date(lastRun.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) continue;
    }

    const totalViews = asset.views_count || 0;
    const totalPurchases = asset.purchases_count || 0;
    const convRate = totalViews > 0 ? (totalPurchases / totalViews) * 100 : 0;
    const daysLive = Math.floor((Date.now() - new Date(asset.created_at).getTime()) / (1000 * 60 * 60 * 24));

    // Skip brand new assets (< 7 days)
    if (daysLive < 7) continue;
    // Skip if no views at all
    if (totalViews === 0 && daysLive < 14) continue;

    // Ask AI for optimization suggestions
    const prompt = `Analyze this marketplace asset performance and suggest optimizations.

Asset: "${asset.title}"
Category: ${asset.category || "uncategorized"}
Tags: ${JSON.stringify(asset.tags || [])}
Days Live: ${daysLive}
Total Views: ${totalViews}
Total Purchases: ${totalPurchases}
Conversion Rate: ${convRate.toFixed(1)}%
Price: $${((asset.price_cents || 0) / 100).toFixed(2)}

Return ONLY valid JSON:
{
  "health": "healthy | needs_attention | underperforming",
  "actions": [
    { "type": "reprice | retitle | retag | refresh_preview | promote", "suggestion": "specific action", "priority": "high | medium | low", "reason": "why" }
  ],
  "summary": "one line assessment"
}

Rules: max 4 actions. Be specific. If healthy, return empty actions array.`;

    try {
      const res = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      });

      logGeminiUsage(res, { feature: "post_launch_optimizer", model: "gemini-3.1-pro-preview" });
      const content = res.response.text();
      if (!content) continue;

      const analysis = JSON.parse(content);

      // Log to agent_decisions
      await supabase.from("agent_decisions").insert({
        asset_id: asset.id,
        agent_type: "post_launch_optimizer",
        input: {
          asset_title: asset.title,
          views: totalViews,
          purchases: totalPurchases,
          conversion_rate: convRate,
          days_live: daysLive,
        },
        output: analysis,
        explanation: analysis.summary || "Post-launch analysis complete",
      });

    } catch {
      // silent
    }
  }
}
