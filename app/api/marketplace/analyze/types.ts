// Shared types + utilities for Kaizora Commerce Analyzer
// Separate from Decision Layer — do not import from decision-layer

export const COMMERCE_PERSONA = `You are KAIZORA Commerce Intelligence, a specialized system for evaluating AI-generated creative assets for marketplace readiness.
Your role: assess quality and commercial potential to help creators list their work effectively.
Be direct and honest. Most content is average — say so when it is. Base every judgment on what you actually see/read/hear.`;

export const PRICE_BANDS = `"free" | "micro($1-5)" | "starter($5-15)" | "standard($15-50)" | "premium($50-200)" | "enterprise($200+)"`;
export const LICENSE_TYPES = `"personal" | "commercial" | "royalty-free"`;

export interface CommerceAnalysisResult {
  // Call 1 — content read
  content_description: string;
  quality_score: number;       // 0-100
  top_strength: string;
  top_weakness: string;

  // Call 2 — 6-axis scoring
  readiness_axes: { axis: string; score: number; note: string }[];
  commerce_readiness_score: number; // 0-100, avg of axes

  // Call 2.5 — marketplace metadata
  suggested_price_band: string;
  suggested_categories: string[];
  suggested_tags: string[];
  suggested_license_type: string;
  listing_description: string;

  // Call 3 — verdict
  readiness_verdict: "ready" | "not-yet" | "not-ready";
  recommended_next_commerce_action: string;

  // Derived
  listing_readiness_status: "ready" | "needs_work";
  alignmentVerdict:
    | "monetize-now"
    | "monetize-with-fixes"
    | "portfolio-only"
    | "hold-as-exploration"
    | "not-market-ready";
}

export function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try { return JSON.parse(fenceMatch[1].trim()); } catch {}
    }
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch {}
    }
    return {};
  }
}

export function buildAxes(
  raw: Record<string, any>,
  axisMap: Record<string, string>,
): { axes: CommerceAnalysisResult["readiness_axes"]; score: number } {
  const axes = Object.entries(axisMap).map(([key, label]) => ({
    axis: label,
    score: Math.round(((raw[key]?.score ?? 3) / 5) * 100),
    note: raw[key]?.note ?? "Unable to evaluate",
  }));
  const score = Math.round(axes.reduce((s, a) => s + a.score, 0) / axes.length);
  return { axes, score };
}

export function deriveVerdict(score: number): CommerceAnalysisResult["alignmentVerdict"] {
  if (score >= 80) return "monetize-now";
  if (score >= 65) return "monetize-with-fixes";
  if (score >= 53) return "portfolio-only";
  if (score >= 35) return "hold-as-exploration";
  return "not-market-ready";
}

export function fallbackVerdict(score: number): "ready" | "not-yet" | "not-ready" {
  if (score >= 60) return "ready";
  if (score >= 45) return "not-yet";
  return "not-ready";
}

export function fallbackNextAction(score: number, weakness?: string): string {
  const cleanWeakness = (weakness || "").trim();

  if (score >= 60) {
    return "Publish this asset, then refine the packaging and listing copy based on early buyer response.";
  }

  if (score >= 45) {
    return cleanWeakness
      ? `Improve this first: ${cleanWeakness}. Then re-run the marketplace analysis before publishing.`
      : "Fix the biggest commercial weakness, then re-run the marketplace analysis before publishing.";
  }

  return cleanWeakness
    ? `Do not publish yet. Rework this first: ${cleanWeakness}.`
    : "Do not publish yet. Rework the asset quality and positioning before listing it.";
}
