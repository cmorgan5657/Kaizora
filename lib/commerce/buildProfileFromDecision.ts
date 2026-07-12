import { supabaseAdmin } from "@/lib/supabaseServer";

interface DecisionLayerEvaluation {
  decision: string;
  overallReadiness: number;
  readinessScores: Array<{ axis: string; score: number; note: string }>;
  alignmentVerdict: string;
  pricingGuidance?: {
    tiers: Array<{ tier: string; range: string; justification: string }>;
    currentTier: string;
    currentRange: string;
  };
  contentCritique?: {
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
  honestAssessment?: string;
  KAIZORAStrategy?: {
    strategyType: string;
    features: string[];
    rationale: string;
  };
  marketReality?: {
    demand: string;
    competition: string;
    analysis: string;
  };
}

/**
 * Translates Decision Layer evaluation into a commerce profile.
 * Called when a user moves from DL evaluation to publishing an asset.
 */
export async function buildProfileFromDecision(
  assetId: string,
  userId: string,
  evaluation: DecisionLayerEvaluation,
  assetMeta?: { title?: string; description?: string; category?: string; tags?: string[] },
) {
  const scores = evaluation.readinessScores || [];
  const getScore = (axis: string) =>
    scores.find((s) => s.axis.toLowerCase().includes(axis.toLowerCase()))
      ?.score ?? null;

  // Map DL readiness axes to commerce scores
  const technicalQuality = getScore("Technical");
  const audienceFit = getScore("Audience");
  const differentiation = getScore("Differentiation");
  const packagingReadiness = getScore("Packaging");
  const creativeClarity = getScore("Creative");
  const consistencyControl = getScore("Consistency");

  // Derive commerce-specific scores
  const marketFit = audienceFit;
  const originalityProxy = differentiation;
  const narrativePotential = creativeClarity;
  const repeatability = consistencyControl;

  // Determine price band from DL pricing guidance
  let priceBand = "mid_market";
  const currentRange = evaluation.pricingGuidance?.currentRange || "";
  if (currentRange.includes("$100") || currentRange.includes("$200")) {
    priceBand = "premium";
  } else if (currentRange.includes("$50")) {
    priceBand = "mid_market";
  } else if (currentRange.includes("$10") || currentRange.includes("$25")) {
    priceBand = "budget";
  }

  // Determine publish readiness
  let readinessStatus = "pending";
  if (evaluation.decision === "yes") readinessStatus = "ready";
  else if (evaluation.decision === "not-yet") readinessStatus = "needs_work";
  else readinessStatus = "not_ready";

  // Determine product shapes from DL strategy
  const productShapes: string[] = ["single_asset"];
  if (
    evaluation.KAIZORAStrategy?.strategyType?.toLowerCase().includes("remix")
  ) {
    productShapes.push("themed_series");
  }
  if (repeatability && repeatability >= 70) {
    productShapes.push("template_pack");
  }

  // Determine next action
  let nextAction = "needs_review";
  if (evaluation.decision === "yes") nextAction = "publish_now";
  else if (evaluation.decision === "not-yet") nextAction = "improve_before_publish";

  // Derive tags from DL content
  const suggestedTags = assetMeta?.tags || [];
  const suggestedCategories = assetMeta?.category
    ? [assetMeta.category]
    : [];

  const profile = {
    asset_id: assetId,
    user_id: userId,
    source_path: "decision_layer",
    content_description: evaluation.honestAssessment || assetMeta?.description || "",
    technical_quality_score: technicalQuality,
    market_fit_score: marketFit,
    originality_proxy_score: originalityProxy,
    policy_risk_score: null,
    narrative_potential_score: narrativePotential,
    repeatability_potential_score: repeatability,
    commerce_readiness_score: evaluation.overallReadiness,
    listing_readiness_status: readinessStatus,
    suggested_categories: suggestedCategories,
    suggested_product_shapes: productShapes,
    suggested_tags: suggestedTags,
    suggested_keywords: [],
    suggested_price_band: priceBand,
    suggested_license_type:
      evaluation.decision === "yes" ? "commercial" : "personal",
    bundle_candidates: [],
    preview_strength:
      packagingReadiness && packagingReadiness >= 70
        ? "strong"
        : packagingReadiness && packagingReadiness >= 40
          ? "medium"
          : "weak",
    thumbnail_notes: "",
    recommended_next_commerce_action: nextAction,
    profile_confidence:
      evaluation.overallReadiness >= 70
        ? 85
        : evaluation.overallReadiness >= 50
          ? 65
          : 45,
    updated_at: new Date().toISOString(),
  };

  // Upsert
  const { data: existing } = await supabaseAdmin
    .from("asset_commerce_profiles")
    .select("id")
    .eq("asset_id", assetId)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from("asset_commerce_profiles")
      .update(profile)
      .eq("asset_id", assetId);
  } else {
    await supabaseAdmin.from("asset_commerce_profiles").insert(profile);
  }

  return profile;
}
