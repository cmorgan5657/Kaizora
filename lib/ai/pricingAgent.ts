import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genAI = getGoogleAiClient();
const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

export interface PricingTier {
  license: string;
  label: string;
  price_cents: number;
  description: string;
  ideal_for: string;
}

export interface PricingResult {
  recommended_price_cents: number;
  pricing_band: "budget" | "mid_market" | "premium" | "enterprise";
  pricing_strategy: string;
  tiers: PricingTier[];
  price_range: {
    floor_cents: number;
    ceiling_cents: number;
  };
  competitive_positioning: string;
  upsell_potential: string;
  bundle_discount_suggestion: string;
  confidence: number;
}

// ── Market context built from real Kaizora published assets ──────────────────
export interface MarketContext {
  content_type: string;
  category?: string | null;
  sample_count: number;             // total published assets in this segment
  min_price_cents: number;
  max_price_cents: number;
  avg_price_cents: number;
  median_price_cents: number;
  p25_price_cents: number;          // 25th percentile
  p75_price_cents: number;          // 75th percentile
  // "Proven" = assets that actually sold (purchases_count > 0)
  proven_sample_count: number;
  proven_median_price_cents: number | null;
  proven_avg_price_cents: number | null;
}

// ── Math helpers ─────────────────────────────────────────────────────────────
function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ── Build MarketContext from raw asset rows ───────────────────────────────────
export function buildMarketContext(
  rows: { price_cents: number | null; purchases_count: number | null }[],
  content_type: string,
  category?: string | null,
): MarketContext {
  const priced = rows
    .map((r) => r.price_cents ?? 0)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  const proven = rows
    .filter((r) => (r.purchases_count ?? 0) > 0 && (r.price_cents ?? 0) > 0)
    .map((r) => r.price_cents!)
    .sort((a, b) => a - b);

  const avg = priced.length
    ? Math.round(priced.reduce((s, v) => s + v, 0) / priced.length)
    : 0;

  return {
    content_type,
    category,
    sample_count: priced.length,
    min_price_cents: priced[0] ?? 0,
    max_price_cents: priced[priced.length - 1] ?? 0,
    avg_price_cents: avg,
    median_price_cents: median(priced),
    p25_price_cents: percentile(priced, 25),
    p75_price_cents: percentile(priced, 75),
    proven_sample_count: proven.length,
    proven_median_price_cents: proven.length ? median(proven) : null,
    proven_avg_price_cents: proven.length
      ? Math.round(proven.reduce((s, v) => s + v, 0) / proven.length)
      : null,
  };
}

// ── Main pricing function ────────────────────────────────────────────────────
export async function analyzePricing(input: {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  content_type?: string;
  current_price_cents?: number;
  commerce_readiness_score?: number;
  technical_quality_score?: number;
  market_fit_score?: number;
  originality_proxy_score?: number;
  suggested_price_band?: string;
  suggested_license_type?: string;
  views_count?: number;
  purchases_count?: number;
  creator_asset_count?: number;
  // Real Kaizora market data — injected by the market endpoint
  market_context?: MarketContext;
}): Promise<PricingResult | null> {

  // ── Build the market intelligence block ─────────────────────────────────
  let marketBlock = "No live market data available — use general industry knowledge.";

  if (input.market_context && input.market_context.sample_count >= 3) {
    const m = input.market_context;
    const fmt = (c: number | null) =>
      c !== null ? `$${(c / 100).toFixed(2)}` : "n/a";

    marketBlock = `
LIVE KAIZORA MARKET DATA (${m.content_type}${m.category ? ` · ${m.category}` : ""})
──────────────────────────────────────────
Published assets in this segment: ${m.sample_count}
Price range:   ${fmt(m.min_price_cents)} – ${fmt(m.max_price_cents)}
Average price: ${fmt(m.avg_price_cents)}
Median price:  ${fmt(m.median_price_cents)}
P25 / P75:     ${fmt(m.p25_price_cents)} / ${fmt(m.p75_price_cents)}

PROVEN SALES (assets with actual purchases — the ground truth of what the market pays):
Assets that sold: ${m.proven_sample_count}
Proven median:    ${fmt(m.proven_median_price_cents)}
Proven average:   ${fmt(m.proven_avg_price_cents)}

INSTRUCTION: Anchor your recommended_price_cents to the proven median/average if available.
A high readiness score (≥75) justifies pricing at or above the P75.
A lower score (50-74) should sit closer to P25-median.
Never recommend a price that deviates more than 40% below the proven median without a clear reason.`.trim();
  } else if (input.market_context) {
    marketBlock = `Kaizora market data for this segment is sparse (${input.market_context.sample_count} assets). Use the suggested_price_band as a guide.`;
  }

  const prompt = `You are the pricing intelligence engine for KAIZORA, an AI-generated asset marketplace.
Your job: recommend the single best price for this asset, grounded in REAL market data from Kaizora.

═══════════════════════════════
ASSET DETAILS
═══════════════════════════════
Title:         ${input.title || "Untitled"}
Category:      ${input.category || "Uncategorized"}
Tags:          ${(input.tags || []).join(", ") || "none"}
Content Type:  ${input.content_type || "unknown"}
Current Price: ${input.current_price_cents ? `$${(input.current_price_cents / 100).toFixed(2)}` : "not set"}

COMMERCE ANALYSIS SCORES
Commerce Readiness: ${input.commerce_readiness_score ?? "unknown"}%
Technical Quality:  ${input.technical_quality_score ?? "unknown"}
Market Fit:         ${input.market_fit_score ?? "unknown"}
Originality:        ${input.originality_proxy_score ?? "unknown"}
Suggested Band:     ${input.suggested_price_band || "unknown"}
Suggested License:  ${input.suggested_license_type || "unknown"}

CREATOR PERFORMANCE
Views: ${input.views_count ?? 0} | Purchases: ${input.purchases_count ?? 0} | Portfolio Size: ${input.creator_asset_count ?? "unknown"}

═══════════════════════════════
${marketBlock}
═══════════════════════════════

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "recommended_price_cents": <integer — the single best price to charge>,
  "pricing_band": "budget | mid_market | premium | enterprise",
  "pricing_strategy": "<1-2 sentences: why this price, referencing the market data>",
  "tiers": [
    { "license": "personal", "label": "Personal Use", "price_cents": <int>, "description": "<what this covers>", "ideal_for": "<who>" },
    { "license": "commercial", "label": "Commercial License", "price_cents": <int>, "description": "<what this covers>", "ideal_for": "<who>" },
    { "license": "extended", "label": "Extended / Enterprise", "price_cents": <int>, "description": "<what this covers>", "ideal_for": "<who>" }
  ],
  "price_range": { "floor_cents": <int>, "ceiling_cents": <int> },
  "competitive_positioning": "<how this price sits vs Kaizora market data — 1 sentence>",
  "upsell_potential": "<bundle or upsell opportunity — 1 sentence>",
  "bundle_discount_suggestion": "<e.g. 15-20%>",
  "confidence": <0-100>
}

Pricing rules:
- recommended_price_cents = the "personal" license tier price (your base price)
- commercial tier = 2-3× personal
- extended tier = 3-5× personal
- Budget <$10, mid_market $10-50, premium $50-200, enterprise $200+
- If proven_median exists, it's the strongest signal — weight it heavily
- High originality + high readiness = lean premium; high market fit = lean competitive
- 3D models and code command higher prices than stock images on average
- confidence reflects how much market data you had (more proven sales = higher confidence)`;

  try {
    const res = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, responseMimeType: "application/json" },
    });

    logGeminiUsage(res, { feature: "pricing_agent", model: "gemini-3.1-pro-preview" });
    const content = res.response.text();
    if (!content) return null;
    return JSON.parse(content) as PricingResult;
  } catch (e) {
    console.error("Pricing agent error:", e);
    return null;
  }
}
