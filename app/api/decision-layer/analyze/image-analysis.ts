// app/api/decision-layer/analyze/image-analysis.ts
import { disableGeminiFallback, GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const DECISION_LAYER_PRIMARY_MODEL = "gemini-3.1-pro-preview";
const DECISION_LAYER_FAST_MODEL = "gemini-3.1-flash-lite";
const DECISION_LAYER_REQUEST_OPTIONS = disableGeminiFallback();
export type ImageAnalysisMode = "fast" | "full";
const DECISION_LAYER_PERSONA = `You are the KAIZORA Decision Layer, an expert AI creative evaluation and strategy system.
Your role is not to generate content. Your role is to analyze, critique, and guide AI-generated creative work.
You function as a world-class AI creative director and technical content expert with deep expertise in:
- AI image generation
- AI video generation
- AI audio and music generation
- AI prompt engineering
- AI animation pipelines
- multimodal storytelling
- generative art workflows
- AI coding and creative tooling
- cross-platform creator monetization
You understand diffusion models, transformers, video synthesis, audio synthesis, and prompt architecture.
Evaluate like an experienced creative director, not a supportive assistant.

CRITICAL BEHAVIORAL RULES:
1. Do NOT default to praise. Most content is average. If work is mediocre or weak, say so clearly and explain why.
2. Prioritize honest evaluation. Constructive criticism is required.
3. Evaluate both creativity and technical execution.
4. Identify weaknesses first, then suggest improvements.
5. Be specific and actionable. Avoid vague advice.
6. Distinguish exploration vs production: classify as exploration, concept test, promising prototype, or monetizable asset.
7. If content is not worth pursuing, say so directly.

EVALUATION FRAMEWORK (apply in every analysis):
- Technical Quality: resolution/clarity, artifacts, prompt accuracy, editing quality, audio/video execution where applicable
- Creative Strength: originality, storytelling potential, emotional impact, composition
- Concept Strength: idea clarity, uniqueness, thematic depth
- Market Potential: platform fit, audience demand, monetization potential
- Expandability: potential to become a series, brand, channel, or product

RESPONSE QUALITY STANDARD:
- Lead with the most important weaknesses and risks.
- Include strongest elements only after the critical issues.
- Recommendations must be concrete, prioritized, and feasible.
- Tone must be professional, direct, analytical, and constructive.
- Never be overly positive, vague, or dismissive without explanation.
- Do not validate user assumptions unless supported by evidence.

OUTPUT COMPATIBILITY RULE:
If a later instruction requests an exact JSON schema, follow that schema exactly while applying all rules above.`;

const VISION_GUARDRAIL = `
VISION VERIFICATION — NON-NEGOTIABLE:
FORBIDDEN PHRASES — never output any of these:
"I cannot see", "I can't see", "no image data", "I'm unable to view",
"no visual content", "I cannot access", "no media provided",
"I don't have access to the image", "I don't see any image"
IF YOU CANNOT SEE PIXELS → return NEEDS_REVIEW with confidence 0
MANDATORY: Describe specific pixels — colours, subjects, positions, lighting
Generic descriptions = automatic NEEDS_REVIEW
No approval without explicit visual evidence`;

function createVisionVerificationError({
  summary,
  details,
  matchedPhrase,
  descriptionLength,
}: {
  summary: string;
  details: string;
  matchedPhrase?: string;
  descriptionLength?: number;
}) {
  const error = new Error(`NEEDS_REVIEW: ${summary}`);
  (error as Error & Record<string, unknown>).code =
    "VISION_VERIFICATION_FAILED";
  (error as Error & Record<string, unknown>).userMessage = summary;
  (error as Error & Record<string, unknown>).details = details;
  (error as Error & Record<string, unknown>).verification = {
    reason: summary,
    details,
    matchedPhrase: matchedPhrase || null,
    descriptionLength: descriptionLength ?? null,
  };
  return error;
}
function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Gemini sometimes wraps JSON in markdown fences even with responseMimeType set
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch (e2) {
        console.error(
          "Gemini returned invalid JSON (even after fence strip):",
          text.slice(0, 500),
        );
      }
    }
    // Try extracting first {...} block
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (e3) {
        console.error(
          "Gemini returned invalid JSON (no valid object found):",
          text.slice(0, 500),
        );
      }
    }
    return {};
  }
}

function extractJsonStringField(text: string, field: string) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s"),
  );
  if (!match) return undefined;

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  }
}

function extractJsonArrayField(text: string, field: string) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`"${escapedField}"\\s*:\\s*(\\[[\\s\\S]*?\\])`, "s"),
  );
  if (!match) return undefined;

  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

function extractJsonNumberField(text: string, field: string) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`"${escapedField}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "s"),
  );
  if (!match) return undefined;
  return Number(match[1]);
}

function recoverImageAnalysisFromText(text: string) {
  return {
    quality_score: extractJsonNumberField(text, "quality_score"),
    what_i_see: extractJsonStringField(text, "what_i_see"),
    composition: extractJsonStringField(text, "composition"),
    technical_assessment: extractJsonStringField(text, "technical_assessment"),
    commercial_potential: extractJsonStringField(text, "commercial_potential"),
    strengths: extractJsonArrayField(text, "strengths"),
    weaknesses: extractJsonArrayField(text, "weaknesses"),
    improvements: extractJsonArrayField(text, "improvements"),
  };
}

function parseImageAnalysisResponse(text: string) {
  const parsed = safeParse(text);
  const recovered = recoverImageAnalysisFromText(text);
  const analysis = {
    ...recovered,
    ...parsed,
  };

  if (!analysis.what_i_see && recovered.what_i_see) {
    analysis.what_i_see = recovered.what_i_see;
  }

  if (
    (analysis.quality_score == null || Number.isNaN(analysis.quality_score)) &&
    recovered.quality_score != null
  ) {
    analysis.quality_score = recovered.quality_score;
  }

  const rawQualityScore =
    typeof analysis.quality_score === "number" ? analysis.quality_score : 0;
  analysis.quality_score = Math.round((rawQualityScore / 10) * 100);

  return analysis;
}

function getVisionVerificationFailure(whatISee: string | undefined) {
  const forbiddenPhrases = [
    "i cannot see",
    "i can't see",
    "no image data",
    "i'm unable to view",
    "no visual content",
    "i cannot access",
    "no media provided",
    "i don't have access to the image",
    "i don't see any image",
  ];

  const descText = (whatISee || "").toLowerCase();
  const matchedPhrase = forbiddenPhrases.find((phrase) =>
    descText.includes(phrase),
  );

  if (matchedPhrase) {
    return {
      summary: "Vision verification failed",
      details: `The model response included the blocked phrase "${matchedPhrase}", so the image analysis was treated as unreliable.`,
      matchedPhrase,
      descriptionLength: descText.length,
    };
  }

  if (descText.length < 50) {
    return {
      summary: "Vision verification failed",
      details: `The model returned a description that was too short to trust (${descText.length} characters, minimum 50).`,
      descriptionLength: descText.length,
    };
  }

  return null;
}

async function generateVerifiedVisionAnalysis({
  descriptionPrompt,
  inlineData,
  maxOutputTokens = 3200,
  maxAttempts = 3,
}: {
  descriptionPrompt: string;
  inlineData: { mimeType: any; data: string };
  maxOutputTokens?: number;
  maxAttempts?: number;
}) {
  const statusLog: string[] = [];
  statusLog.push("Starting Gemini Vision Analysis (6-Axis + Coaching + Pricing)...");
  statusLog.push("Gemini Call 1: Visual Description...");
  const attempts = Array.from({ length: maxAttempts }, (_, index) => ({
    model: DECISION_LAYER_PRIMARY_MODEL,
    label:
      index === 0
        ? "Gemini Call 1"
        : index === 1
          ? "Gemini Call 1 Retry"
          : "Gemini Call 1 Fallback",
    note:
      index === 0
        ? "primary attempt"
        : index === 1
          ? "retry after short/invalid description"
          : "final retry after repeated short/invalid description",
  }));

  let lastFailure: ReturnType<typeof getVisionVerificationFailure> = null;

  for (const attempt of attempts) {
    statusLog.push(
      `[gemini] generateContent:${DECISION_LAYER_PRIMARY_MODEL}${
        attempt.label === "Gemini Call 1 Retry"
          ? ":retry"
          : attempt.label === "Gemini Call 1 Fallback"
            ? ":fallback"
            : ""
      } attempt using ${attempt.model} (requested ${DECISION_LAYER_PRIMARY_MODEL})`,
    );
    const model = genai.getGenerativeModel({
      model: attempt.model,
      generationConfig: {
        maxOutputTokens,
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(
      [{ text: descriptionPrompt }, { inlineData }],
      DECISION_LAYER_REQUEST_OPTIONS,
    );
    logGeminiUsage(result, {
      feature: "decision_layer_image",
      model: attempt.model,
    });

    const rawText = result.response.text();
    const analysis = parseImageAnalysisResponse(rawText);
    const failure = getVisionVerificationFailure(analysis.what_i_see);

    if (!failure) {
      statusLog.push(
        `[gemini] generateContent:${DECISION_LAYER_PRIMARY_MODEL}${
          attempt.label === "Gemini Call 1 Retry"
            ? ":retry"
            : attempt.label === "Gemini Call 1 Fallback"
              ? ":final-retry"
              : ""
        } success using ${attempt.model}`,
      );
      statusLog.push(`Gemini Call 1 complete with ${attempt.model}.`);
      console.log(`  ✓ ${attempt.label} complete with ${attempt.model}`);
      return {
        analysis,
        statusLog,
        modelUsed: attempt.model,
      };
    }

    lastFailure = failure;
    statusLog.push(
      failure.matchedPhrase
        ? `[gemini] generateContent:${DECISION_LAYER_PRIMARY_MODEL} response hit vision guardrails on ${attempt.model}, shifting to the next attempt.`
        : `[gemini] generateContent:${DECISION_LAYER_PRIMARY_MODEL} response too short (${failure.descriptionLength ?? 0} chars) on ${attempt.model}, retrying.`,
    );
    console.warn(
      `[decision_layer_image] ${attempt.note}; received unreliable vision description from ${attempt.model}`,
      {
        descriptionLength: failure.descriptionLength ?? 0,
        matchedPhrase: failure.matchedPhrase ?? null,
        preview: rawText.slice(0, 300),
      },
    );
  }

  throw createVisionVerificationError(lastFailure!);
}

function buildContextSection(creatorContext?: CreatorContext) {
  return creatorContext
    ? `\n\nCREATOR CONTEXT (use this to tailor your entire evaluation):
- Goal: ${creatorContext.goal || "unknown"}
- Content Outcome: ${creatorContext.buyer || "unknown"}
- Media Type: ${creatorContext.mediaType || "unknown"}
- Time Available: ${creatorContext.timeConstraint || "unknown"}
- Quality Aim: ${creatorContext.qualityLevel || "unknown"}
- Biggest Blocker: ${creatorContext.blocker || "none specified"}`
    : "";
}

function buildImageAnalysisResult({
  geminiAnalysis,
  readinessScore,
  coachingRoadmap,
  tieredPricing,
  alignmentData,
  coachingData,
  creatorContext,
  clientSignals,
  callModelTrail,
  statusLog,
}: {
  geminiAnalysis: any;
  readinessScore: ReadinessScore;
  coachingRoadmap: CoachingRoadmap;
  tieredPricing: TieredPricing;
  alignmentData: any;
  coachingData: any;
  creatorContext?: CreatorContext;
  clientSignals?: any | null;
  callModelTrail: string[];
  statusLog: string[];
}): ImageAnalysisResult {
  let overallQuality:
    | "exceptional"
    | "professional"
    | "good"
    | "average"
    | "needs-work";
  if (geminiAnalysis.quality_score >= 90) overallQuality = "exceptional";
  else if (geminiAnalysis.quality_score >= 75) overallQuality = "professional";
  else if (geminiAnalysis.quality_score >= 60) overallQuality = "good";
  else if (geminiAnalysis.quality_score >= 40) overallQuality = "average";
  else overallQuality = "needs-work";

  let monetizationReadiness: "ready" | "needs-refinement" | "not-ready";
  if (readinessScore.total >= 80) monetizationReadiness = "ready";
  else if (readinessScore.total >= 53)
    monetizationReadiness = "needs-refinement";
  else monetizationReadiness = "not-ready";
  const confidence = readinessScore.total;

  const overallReadiness = readinessScore.total;
  const alignmentVerdict:
    | "monetize-now"
    | "monetize-with-fixes"
    | "portfolio-only"
    | "hold-as-exploration"
    | "not-market-ready" =
    readinessScore.total >= 80
      ? "monetize-now"
      : readinessScore.total >= 65
        ? "monetize-with-fixes"
        : readinessScore.total >= 53
          ? "portfolio-only"
          : readinessScore.total >= 35
            ? "hold-as-exploration"
            : "not-market-ready";

  const readinessScores = [
    {
      axis: "Creative Clarity",
      score: readinessScore.creativeClarity.score,
      note: readinessScore.creativeClarity.justification,
    },
    {
      axis: "Technical Quality",
      score: readinessScore.technicalQuality.score,
      note: readinessScore.technicalQuality.justification,
    },
    {
      axis: "Consistency Control",
      score: readinessScore.consistencyControl.score,
      note: readinessScore.consistencyControl.justification,
    },
    {
      axis: "Audience Fit",
      score: readinessScore.audienceFit.score,
      note: readinessScore.audienceFit.justification,
    },
    {
      axis: "Differentiation",
      score: readinessScore.differentiation.score,
      note: readinessScore.differentiation.justification,
    },
    {
      axis: "Packaging Readiness",
      score: readinessScore.packagingReadiness.score,
      note: readinessScore.packagingReadiness.justification,
    },
  ];

  const shouldShowPricing =
    alignmentVerdict === "monetize-now" ||
    alignmentVerdict === "monetize-with-fixes";
  const pricingTiers = shouldShowPricing
    ? [
        {
          tier: "Starter",
          range: tieredPricing.starter.range,
          justification: tieredPricing.upgradeJustification,
          includes: tieredPricing.starter.includes,
        },
        {
          tier: "Standard",
          range: tieredPricing.standard.range,
          justification: tieredPricing.upgradeJustification,
          includes: tieredPricing.standard.includes,
        },
        {
          tier: "Premium",
          range: tieredPricing.premium.range,
          justification: tieredPricing.upgradeJustification,
          includes: tieredPricing.premium.includes,
        },
      ]
    : [];
  const lowestAxis = readinessScores.reduce(
    (min, s) => (s.score < min.score ? s : min),
    readinessScores[0],
  );
  const blockerRef = creatorContext?.blocker
    ? `You said "${creatorContext.blocker}" is your biggest challenge`
    : "Your main gap";
  const goalRef = creatorContext?.goal ? ` (goal: ${creatorContext.goal})` : "";
  const topPainPoint = `${blockerRef}${goalRef} — your weakest area is ${lowestAxis.axis} (${lowestAxis.score}%): ${lowestAxis.note}`;
  const coachingRoadmapArray = [
    {
      title: coachingRoadmap.phase1.title,
      timeEstimate: coachingRoadmap.phase1.timeEstimate,
      actions: coachingRoadmap.phase1.steps,
    },
    {
      title: coachingRoadmap.phase2.title,
      timeEstimate: coachingRoadmap.phase2.timeEstimate,
      actions: coachingRoadmap.phase2.steps,
    },
    {
      title: coachingRoadmap.phase3.title,
      timeEstimate: coachingRoadmap.phase3.timeEstimate,
      actions: coachingRoadmap.phase3.steps,
    },
  ];
  const honestPricing: HonestPricing = coachingData.tieredPricing
    ?.honestPricing || {
    low: 5,
    high: 50,
    currency: "USD",
    reasoning: "Based on current quality level and market comparables.",
    comparable: "Similar assets on stock platforms range $5-50.",
  };

  return {
    gemini_analysis: geminiAnalysis,
    readinessScore,
    coachingRoadmap: coachingRoadmapArray,
    tieredPricing,
    consensus: {
      overall_quality: overallQuality,
      monetization_readiness: monetizationReadiness,
      confidence,
    },
    overallReadiness,
    alignmentVerdict,
    readinessScores,
    pricingTiers,
    topPainPoint,
    visualDescription: geminiAnalysis.what_i_see,
    evidenceUsed: [
      geminiAnalysis.composition,
      geminiAnalysis.technical_assessment,
      geminiAnalysis.commercial_potential,
    ],
    whatISaw: geminiAnalysis.whatISaw || {
      subjects: geminiAnalysis.what_i_see,
      lighting: "See technical assessment",
      color: "See technical assessment",
      composition: geminiAnalysis.composition,
      mood: "See visual description",
    },
    whatYouToldMe: {
      goal: creatorContext?.goal || "not specified",
      pain: creatorContext?.blocker || "not specified",
      constraints: creatorContext?.timeConstraint || "not specified",
      buyerType: creatorContext?.buyer || "not specified",
    },
    realAlignment: alignmentData.realAlignment || {
      score: readinessScore.total,
      gapSummary: "Unable to assess alignment gap.",
      blindSpots: [],
    },
    myRecommendation: {
      verdict:
        alignmentVerdict === "monetize-now"
          ? "Ready"
          : alignmentVerdict === "monetize-with-fixes"
            ? "Refine"
            : alignmentVerdict === "portfolio-only"
              ? "Refine"
              : alignmentVerdict === "hold-as-exploration"
                ? "Explore"
                : "Flag",
      reasoning: `${topPainPoint} Overall readiness: ${overallReadiness}%.`,
    },
    exactEdits: alignmentData.exactEdits || [],
    honestPricing,
    fastestPath: alignmentData.fastestPath || [],
    evidenceDetails: {
      fileCount: 1,
      resolution: clientSignals?.width
        ? `${clientSignals.width}×${clientSignals.height}`
        : "auto-detected",
      framesAnalyzed: 1,
      modelUsed: callModelTrail.join(" -> "),
      analysisTimestamp: new Date().toISOString(),
      signalsSummary: clientSignals
        ? `${clientSignals.resolutionLabel} ${clientSignals.orientation} image, ${clientSignals.lightingMood}, ${clientSignals.colorMood}`
        : "No client signals",
      statusLog,
    },
    closingQuestion:
      coachingData.closingQuestion ||
      "Which of the quick wins do you want to tackle first?",
    fallbackEvaluation: {
      vision_evidence: geminiAnalysis.what_i_see || "No visual evidence captured",
      decision:
        alignmentVerdict === "monetize-now"
          ? "APPROVE"
          : alignmentVerdict === "monetize-with-fixes"
            ? "FLAG"
            : alignmentVerdict === "portfolio-only"
              ? "FLAG"
              : alignmentVerdict === "hold-as-exploration"
                ? "REJECT"
                : "NEEDS_REVIEW",
      confidence: overallReadiness,
      scores: {
        technical_quality: readinessScore.technicalQuality.score,
        market_fit: readinessScore.audienceFit.score,
        policy_risk: 0,
        originality: readinessScore.differentiation.score,
      },
      reasons: geminiAnalysis.strengths || [],
      recommended_fixes: geminiAnalysis.improvements || [],
      marketplace_recommendation: {
        should_list:
          alignmentVerdict === "monetize-now" ||
          alignmentVerdict === "monetize-with-fixes",
        category: creatorContext?.mediaType || "Digital Asset",
        title: `${creatorContext?.goal || "Creative"} Asset — ${overallReadiness}% Market Ready`,
        tags: [
          creatorContext?.buyer || "general",
          creatorContext?.goal || "creative",
          "digital asset",
        ],
        price_range: tieredPricing.starter.range,
        next_step:
          alignmentVerdict === "monetize-now"
            ? "List immediately on your target platform"
            : coachingRoadmap.phase1.steps[0] || "Complete quick wins first",
      },
    },
  };
}

async function generateContentWithModel({
  model,
  generationConfig,
  parts,
  feature,
  stageLabel,
}: {
  model: string;
  generationConfig: Record<string, unknown>;
  parts: any[];
  feature: string;
  stageLabel: string;
}) {
  const activeModel = genai.getGenerativeModel({
    model,
    generationConfig,
  });
  const result = await activeModel.generateContent(
    parts,
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(result, { feature, model });
  console.log(`  ✓ ${stageLabel} complete with ${model}`);
  return { result, modelUsed: model };
}
// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
interface ReadinessAxis {
  score: number; // 0-100%
  justification: string;
}
interface ReadinessScore {
  creativeClarity: ReadinessAxis;
  technicalQuality: ReadinessAxis;
  consistencyControl: ReadinessAxis;
  audienceFit: ReadinessAxis;
  differentiation: ReadinessAxis;
  packagingReadiness: ReadinessAxis;
  total: number;
}
interface CoachingPhase {
  title: string;
  timeEstimate: string;
  steps: string[];
}
interface CoachingRoadmap {
  phase1: CoachingPhase; // 30-min fixes
  phase2: CoachingPhase; // 2-hr upgrade
  phase3: CoachingPhase; // Market readiness
}
interface PricingTier {
  label: string;
  range: string;
  includes: string[];
}
interface TieredPricing {
  starter: PricingTier;
  standard: PricingTier;
  premium: PricingTier;
  upgradeJustification: string;
}
// ─── NEW TYPES (Phase 3) ─────────────────────────────
interface WhatISaw {
  subjects: string;
  lighting: string;
  color: string;
  composition: string;
  mood: string;
}

interface RealAlignment {
  score: number; // 0-100%
  gapSummary: string;
  blindSpots: string[];
}

interface ExactEdit {
  edit: string;
  why: string;
  effort: "Quick" | "Medium" | "Deep";
}

interface HonestPricing {
  low: number;
  high: number;
  currency: string;
  reasoning: string;
  comparable: string;
}

interface FastestPathStep {
  step: string;
  timeEstimate: string;
}

interface EvidenceDetails {
  fileCount: number;
  resolution: string;
  framesAnalyzed: number;
  modelUsed: string;
  analysisTimestamp: string;
  signalsSummary: string;
  statusLog?: string[];
}
export interface CreatorContext {
  goal?: string;
  buyer?: string;
  mediaType?: string;
  timeConstraint?: string;
  qualityLevel?: string;
  blocker?: string;
}
export interface ImageAnalysisResult {
  gemini_analysis: {
    quality_score: number;
    what_i_see: string;
    composition: string;
    technical_assessment: string;
    commercial_potential: string;
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
  // ✅ NEW: 6-axis readiness scoring (structured)
  readinessScore: ReadinessScore;
  // ✅ NEW: 3-phase coaching roadmap (array format for route compatibility)
  coachingRoadmap: { title: string; timeEstimate: string; actions: string[] }[];
  // ✅ NEW: Tiered pricing guidance (structured)
  tieredPricing: TieredPricing;
  consensus: {
    overall_quality:
      | "exceptional"
      | "professional"
      | "good"
      | "average"
      | "needs-work";
    monetization_readiness: "ready" | "needs-refinement" | "not-ready";
    confidence: number;
  };
  // ── Flattened convenience properties for the evaluate route ──
  overallReadiness: number; // 0-100% scale
  alignmentVerdict: "monetize-now" | "monetize-with-fixes" | "portfolio-only" | "hold-as-exploration" | "not-market-ready";
  readinessScores: { axis: string; score: number; note: string }[];
  pricingTiers: {
    tier: string;
    range: string;
    justification: string;
    includes: string[];
  }[];
  topPainPoint: string;
  visualDescription: string;
  evidenceUsed: string[];
  whatISaw: WhatISaw;
  whatYouToldMe: {
    goal: string;
    pain: string;
    constraints: string;
    buyerType: string;
  };
  realAlignment: RealAlignment;
  myRecommendation: {
    verdict: "Ready" | "Refine" | "Explore" | "Flag";
    reasoning: string;
  };
  exactEdits: ExactEdit[];
  honestPricing: HonestPricing;
 fastestPath: FastestPathStep[];
  evidenceDetails: EvidenceDetails;
  closingQuestion: string;
  fallbackEvaluation: {
    vision_evidence: string;
    decision: "APPROVE" | "FLAG" | "REJECT" | "NEEDS_REVIEW";
    confidence: number;
    scores: {
      technical_quality: number;
      market_fit: number;
      policy_risk: number;
      originality: number;
    };
    reasons: string[];
    recommended_fixes: string[];
    marketplace_recommendation: {
      should_list: boolean;
      category: string;
      title: string;
      tags: string[];
      price_range: string;
      next_step: string;
    };
  };
}
// ═══════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════
export async function analyzeImage(
  imageFile: File,

  customPrompt?: string | null,
  conversationContext?: string,
  creatorContext?: CreatorContext,
  clientSignals?: any | null,
  analysisMode: ImageAnalysisMode = "full",
): Promise<ImageAnalysisResult> {
  console.log(
    "🎨 Starting Gemini Vision Analysis (6-Axis + Coaching + Pricing)...",
  );
  // Convert image to base64
  const bytes = await imageFile.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = buffer.toString("base64");
  const knowledgeTier =
    creatorContext?.qualityLevel === "professional"
      ? "STUDIO/COMMERCIAL"
      : creatorContext?.qualityLevel === "intermediate"
        ? "INDEPENDENT"
        : "HOBBYIST";
  // Build context-aware prompt sections
  const contextSection =
    buildContextSection(creatorContext) +
    (creatorContext
      ? `\n
IMPORTANT: Weight your scoring and recommendations toward their specific goal and blocker. 
For example:
- If goal is "product" and blocker is "pricing" → focus on commercial viability and pricing tiers
- If goal is "portfolio" and blocker is "goodenough" → focus on creative clarity and differentiation
- If goal is "client" and blocker is "consistency" → focus on consistency control and packaging`
      : "");
  // ═══════════════════════════════════════════════════════
  // CALL 1: Visual Description + Basic Analysis
  // ═══════════════════════════════════════════════════════
  console.log("  → Gemini Call 1: Visual Description...");
  const descriptionPrompt = `${DECISION_LAYER_PERSONA}

${VISION_GUARDRAIL}

Creator knowledge tier: ${knowledgeTier}

CRITICAL: Describe EXACTLY what you see — colors, objects, positioning, lighting, mood. Be SO specific that someone reading your analysis knows you actually looked at THIS image, not a template.
${contextSection}
${clientSignals ? `\nCLIENT-SIDE PRE-ANALYSIS (extracted from the file before this call — use to validate your assessment):\n- Resolution: ${clientSignals.width}×${clientSignals.height} (${clientSignals.resolutionLabel})\n- Megapixels: ${clientSignals.megapixels}MP\n- Orientation: ${clientSignals.orientation}\n- Lighting: ${clientSignals.lightingMood}\n- Color: ${clientSignals.colorMood}\n- Contrast: ${clientSignals.contrastLevel}\n- File size: ${clientSignals.fileSizeMB}MB` : ""}
${conversationContext ? `\nUSER CONTEXT: "${conversationContext}"` : ""}
${customPrompt ? `\nUSER'S QUESTIONS: ${customPrompt}` : ""}
Respond in this EXACT JSON:
{
  "quality_score": <number 1-10>,
  "what_i_see": "<Describe EXACTLY what's in the image in 6-8 sentences. Include: every subject/object visible, their exact positioning, colors and color palette, lighting direction and quality, textures and materials, mood/atmosphere, background elements, foreground details. Be so specific that a blind person could recreate this image from your description.>",
 "composition": "<ACTUAL composition choices — where things are positioned, leading lines, balance, focal points, rule of thirds, negative space, depth layers. 3-4 sentences with specific references to image areas (top-left, center, foreground).>",
  "technical_assessment": "<ACTUAL technical quality — sharpness across different areas, exposure highlights/shadows, color grading warmth/coolness, noise/grain levels, chromatic aberration, dynamic range, white balance accuracy. 4-5 sentences pointing to specific regions.>",
  "commercial_potential": "<Real talk about if THIS specific image would sell. What exact market does it fit? What makes it unique or generic compared to stock libraries? Who specifically would buy it and for what use case? What's missing for commercial viability? 3-4 sentences.>",
  "strengths": ["<specific strength referencing actual elements>", "<another>", "<another>", "<another>"],
  "weaknesses": ["<specific weakness about actual image>", "<another>", "<another>"],
"improvements": ["<actionable improvement for THIS image>", "<another>", "<another>", "<another>"],
  "whatISaw": {
    "subjects": "<Every subject/object visible — people, animals, text, shapes, products. Be exhaustive.>",
    "lighting": "<Light direction, quality (hard/soft), color temperature, shadows, highlights, time of day feel.>",
    "color": "<Dominant palette, saturation level, warm/cool bias, any color grading applied, accent colors.>",
    "composition": "<Where subjects sit in frame, leading lines, rule of thirds, negative space, depth layers, focal point.>",
    "mood": "<Emotional atmosphere — calm, tense, playful, dark, ethereal, corporate, raw. What feeling does it evoke?>"
  }
  
}
Write like a professional visual consultant advising a client. Stay objective, do not default to agreeing with the user, and provide balanced positives and negatives based only on what is visible in the image. Be specific about what you ACTUALLY see.`;
  const {
    analysis: geminiAnalysis,
    statusLog,
    modelUsed: call1ModelUsed,
  } = await generateVerifiedVisionAnalysis({
    descriptionPrompt,
    inlineData: { mimeType: imageFile.type as any, data: base64 },
    maxOutputTokens: analysisMode === "fast" ? 1800 : 3200,
    maxAttempts: analysisMode === "fast" ? 2 : 3,
  });
  console.log("  ✓ Call 1 complete — visual description done");

  if (analysisMode === "fast") {
    console.log("  → Gemini Fast Call 2: Scoring + Alignment + Pricing...");
    const fastPrompt = `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

Use the image description below and produce a FAST, commercially useful evaluation. Keep it concise but specific. Favor speed over exhaustive detail.

VISUAL DESCRIPTION:
${geminiAnalysis.what_i_see}

TECHNICAL NOTES:
${geminiAnalysis.technical_assessment}

COMPOSITION:
${geminiAnalysis.composition}
${contextSection}

Respond in this EXACT JSON:
{
  "scores": {
    "creativeClarity": { "score": <1-5>, "justification": "<1 short sentence>" },
    "technicalQuality": { "score": <1-5>, "justification": "<1 short sentence>" },
    "consistencyControl": { "score": <1-5>, "justification": "<1 short sentence>" },
    "audienceFit": { "score": <1-5>, "justification": "<1 short sentence>" },
    "differentiation": { "score": <1-5>, "justification": "<1 short sentence>" },
    "packagingReadiness": { "score": <1-5>, "justification": "<1 short sentence>" }
  },
  "realAlignment": {
    "score": <1-10>,
    "gapSummary": "<2 short sentences>",
    "blindSpots": ["<one>", "<one>", "<one>"]
  },
  "exactEdits": [
    { "edit": "<specific edit>", "why": "<brief why>", "effort": "Quick" },
    { "edit": "<specific edit>", "why": "<brief why>", "effort": "Quick" },
    { "edit": "<specific edit>", "why": "<brief why>", "effort": "Medium" }
  ],
  "fastestPath": [
    { "step": "<step>", "timeEstimate": "<time>" },
    { "step": "<step>", "timeEstimate": "<time>" },
    { "step": "<step>", "timeEstimate": "<time>" }
  ],
  "coachingRoadmap": {
    "phase1": { "title": "Quick Wins", "timeEstimate": "20-30 minutes", "steps": ["<step>", "<step>", "<step>"] },
    "phase2": { "title": "Level Up", "timeEstimate": "60-90 minutes", "steps": ["<step>", "<step>"] },
    "phase3": { "title": "Market Ready", "timeEstimate": "Later", "steps": ["<step>", "<step>"] }
  },
  "tieredPricing": {
    "starter": { "label": "Starter", "range": "<range>", "includes": ["<item>", "<license>"] },
    "standard": { "label": "Standard", "range": "<range>", "includes": ["<item>", "<license>"] },
    "premium": { "label": "Premium", "range": "<range>", "includes": ["<item>", "<license>"] },
    "upgradeJustification": "<1 sentence>",
    "honestPricing": {
      "low": <number>,
      "high": <number>,
      "currency": "USD",
      "reasoning": "<1-2 sentences>",
      "comparable": "<platform comparison>"
    }
  },
  "closingQuestion": "<one short question>"
}`;
    const { result: fastResult, modelUsed: fastModelUsed } =
      await generateContentWithModel({
        model: DECISION_LAYER_FAST_MODEL,
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.2,
          responseMimeType: "application/json",
        },
        parts: [{ text: fastPrompt }],
        feature: "decision_layer_image",
        stageLabel: "Gemini Fast Call 2",
      });
    statusLog.push("Gemini Fast Call 2: Scoring + Alignment + Pricing...");
    statusLog.push(`Gemini Fast Call 2 complete with ${fastModelUsed}.`);
    const fastData = safeParse(fastResult.response.text());
    const axisScores = fastData.scores || {};
    Object.keys(axisScores).forEach((key) => {
      if (axisScores[key]?.score) {
        axisScores[key].score = Math.round((axisScores[key].score / 5) * 100);
      }
    });
    const readinessScore: ReadinessScore = {
      creativeClarity: axisScores.creativeClarity || {
        score: 3,
        justification: "Unable to evaluate",
      },
      technicalQuality: axisScores.technicalQuality || {
        score: 3,
        justification: "Unable to evaluate",
      },
      consistencyControl: axisScores.consistencyControl || {
        score: 3,
        justification: "Unable to evaluate",
      },
      audienceFit: axisScores.audienceFit || {
        score: 3,
        justification: "Unable to evaluate",
      },
      differentiation: axisScores.differentiation || {
        score: 3,
        justification: "Unable to evaluate",
      },
      packagingReadiness: axisScores.packagingReadiness || {
        score: 3,
        justification: "Unable to evaluate",
      },
      total: 0,
    };
    const rawTotal =
      readinessScore.creativeClarity.score +
      readinessScore.technicalQuality.score +
      readinessScore.consistencyControl.score +
      readinessScore.audienceFit.score +
      readinessScore.differentiation.score +
      readinessScore.packagingReadiness.score;
    readinessScore.total = Math.round((rawTotal / 600) * 100);
    const coachingRoadmap: CoachingRoadmap = {
      phase1: fastData.coachingRoadmap?.phase1 || {
        title: "Quick Wins",
        timeEstimate: "20-30 minutes",
        steps: [
          "Fix the most visible artifact first",
          "Create one cleaner crop",
          "Export a polished preview",
        ],
      },
      phase2: fastData.coachingRoadmap?.phase2 || {
        title: "Level Up",
        timeEstimate: "60-90 minutes",
        steps: [
          "Regenerate or retouch the weakest area",
          "Create 2-3 marketplace-ready variants",
        ],
      },
      phase3: fastData.coachingRoadmap?.phase3 || {
        title: "Market Ready",
        timeEstimate: "Later",
        steps: [
          "Package into a themed mini-set",
          "Add title, tags, and license framing",
        ],
      },
    };
    const tieredPricing: TieredPricing = {
      starter: fastData.tieredPricing?.starter || {
        label: "Starter",
        range: "$5-15",
        includes: ["Single asset", "Personal use license"],
      },
      standard: fastData.tieredPricing?.standard || {
        label: "Standard",
        range: "$20-40",
        includes: ["Asset + variants", "Commercial license"],
      },
      premium: fastData.tieredPricing?.premium || {
        label: "Premium",
        range: "$60-100+",
        includes: ["Mini bundle", "Extended license"],
      },
      upgradeJustification:
        fastData.tieredPricing?.upgradeJustification ||
        "Cleaner execution and better packaging justify higher pricing.",
    };
    return buildImageAnalysisResult({
      geminiAnalysis,
      readinessScore,
      coachingRoadmap,
      tieredPricing,
      alignmentData: {
        realAlignment: fastData.realAlignment,
        exactEdits: fastData.exactEdits,
        fastestPath: fastData.fastestPath,
      },
      coachingData: {
        tieredPricing: fastData.tieredPricing,
        closingQuestion: fastData.closingQuestion,
      },
      creatorContext,
      clientSignals,
      callModelTrail: [call1ModelUsed, fastModelUsed],
      statusLog,
    });
  }
  // ═══════════════════════════════════════════════════════
  // CALL 2: 6-Axis Readiness Scoring
  // ═══════════════════════════════════════════════════════
  console.log("  → Gemini Call 2: 6-Axis Readiness Scoring...");
  const scoringPrompt = `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

Based on this image, score it on 6 axes. Calibrate scores to the creator's tier — a HOBBYIST at 70% is performing well; a COMMERCIAL creator at 70% needs work.

VISUAL DESCRIPTION (from previous analysis):
${geminiAnalysis.what_i_see}
${geminiAnalysis.technical_assessment}
${geminiAnalysis.composition}
${contextSection}
Score each axis from 1-5 with a specific justification referencing what you SEE.
CROSS-REFERENCING RULE: Each justification MUST explicitly reference the creator's stated context. Use phrases like "You said your goal is [goal]...", "For your target buyer ([buyer])...", "At your stated [qualityLevel] level...". Never write generic notes — always name WHO, WHY, and how it connects to what the creator told you.
1. **Creative Clarity** (1-5): Is the core idea visually clear? Can someone instantly understand what this is and what it's for?
2. **Technical Quality** (1-5): Resolution, sharpness, color accuracy, artifacts, noise, exposure.
3. **Consistency Control** (1-5): For a single image — does style feel intentional and cohesive? No mixed aesthetics or accidental elements?
4. **Audience Fit** (1-5): Based on the target buyer (${creatorContext?.buyer || "general"}), would they pay for this? Does it match what that audience expects?
5. **Differentiation** (1-5): What makes this NOT generic? Is there a unique voice, perspective, or technique?
6. **Packaging Readiness** (1-5): How easy is it to turn this into a sellable product? Does it need heavy post-processing, or is it nearly ready?
Respond in this EXACT JSON:
{
  "creativeClarity": { "score": <1-5>, "justification": "<2 sentences referencing specific visual elements>" },
  "technicalQuality": { "score": <1-5>, "justification": "<2 sentences>" },
  "consistencyControl": { "score": <1-5>, "justification": "<2 sentences>" },
  "audienceFit": { "score": <1-5>, "justification": "<2 sentences>" },
  "differentiation": { "score": <1-5>, "justification": "<2 sentences>" },
  "packagingReadiness": { "score": <1-5>, "justification": "<2 sentences>" }
}`;
  const {
    result: call2Result,
    modelUsed: call2ModelUsed,
  } = await generateContentWithModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.2,
      responseMimeType: "application/json",
    },
    parts: [{ text: scoringPrompt }],
    feature: "decision_layer_image",
    stageLabel: "Gemini Call 2",
  });
  statusLog.push("Gemini Call 2: 6-Axis Readiness Scoring...");
  statusLog.push(`Gemini Call 2 complete with ${call2ModelUsed}.`);
  const rawCall2 = call2Result.response.text();
  console.log(
    "  Call 2 raw response (first 300 chars):",
    rawCall2.slice(0, 300),
  );
  const axisScores = safeParse(rawCall2);
  Object.keys(axisScores).forEach((key) => {
    if (axisScores[key]?.score) {
      axisScores[key].score = Math.round((axisScores[key].score / 5) * 100);
    }
  });
  console.log("  Call 2 parsed keys:", Object.keys(axisScores));

  // Build readiness score object
  const readinessScore: ReadinessScore = {
    creativeClarity: axisScores.creativeClarity || {
      score: 3,
      justification: "Unable to evaluate",
    },
    technicalQuality: axisScores.technicalQuality || {
      score: 3,
      justification: "Unable to evaluate",
    },
    consistencyControl: axisScores.consistencyControl || {
      score: 3,
      justification: "Unable to evaluate",
    },
    audienceFit: axisScores.audienceFit || {
      score: 3,
      justification: "Unable to evaluate",
    },
    differentiation: axisScores.differentiation || {
      score: 3,
      justification: "Unable to evaluate",
    },
    packagingReadiness: axisScores.packagingReadiness || {
      score: 3,
      justification: "Unable to evaluate",
    },
    total: 0,
  };
  const rawTotal =
    readinessScore.creativeClarity.score +
    readinessScore.technicalQuality.score +
    readinessScore.consistencyControl.score +
    readinessScore.audienceFit.score +
    readinessScore.differentiation.score +
    readinessScore.packagingReadiness.score;
  readinessScore.total = Math.round((rawTotal / 600) * 100);
  // ═══════════════════════════════════════════════════════
  // CALL 2.5: Real Alignment + Exact Edits + Fastest Path
  // ═══════════════════════════════════════════════════════
  console.log("  → Gemini Call 2.5: Alignment + Edits + Path...");

  const alignmentPrompt = `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

Based on the analysis so far, generate three things.

VISUAL DESCRIPTION:
${geminiAnalysis.what_i_see}

SCORES:
${Object.entries(axisScores)
  .map(([key, val]: any) => `${key}: ${val.score}% — ${val.justification}`)
  .join("\n")}

READINESS TOTAL: ${readinessScore.total}%
${contextSection}

Generate:

1. **Real Alignment** — How well does this content align with what the creator WANTS vs what it ACTUALLY is?
   - Score 1-10 (10 = perfect alignment between their goal and the content quality)
   - Gap summary: 2-3 sentences explaining the gap between ambition and reality
   - Blind spots: things the creator probably doesn't realize about their content (things they can't see because they're too close to it)

2. **Exact Edits** — 3-5 specific edits they should make, each with:
   - What exactly to edit
   - Why this edit matters (reference a specific score or weakness)
   - Effort level: "Quick" (under 10 min), "Medium" (30-60 min), "Deep" (2+ hours)
   - Order from quickest win to deepest investment

3. **Fastest Path** — 3-5 sequential steps to get from current state to their stated goal, each with a time estimate.
   - Each step must be concrete and actionable
   - Time estimates must be realistic
   - Steps should build on each other

Respond in this EXACT JSON:
{
  "realAlignment": {
    "score": <1-10>,
    "gapSummary": "<2-3 sentences about the gap between their goal and current content quality>",
    "blindSpots": ["<blind spot 1>", "<blind spot 2>", "<blind spot 3>"]
  },
  "exactEdits": [
    { "edit": "<specific edit>", "why": "<why it matters — reference a score>", "effort": "Quick" },
    { "edit": "<specific edit>", "why": "<why>", "effort": "Quick" },
    { "edit": "<specific edit>", "why": "<why>", "effort": "Medium" },
    { "edit": "<specific edit>", "why": "<why>", "effort": "Deep" }
  ],
  "fastestPath": [
    { "step": "<concrete action>", "timeEstimate": "<e.g. 15 minutes>" },
    { "step": "<concrete action>", "timeEstimate": "<e.g. 1 hour>" },
    { "step": "<concrete action>", "timeEstimate": "<e.g. 2 hours>" }
  ]
}`;

  const call25Model = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  });
  const call25Result = await call25Model.generateContent(
    [
      { text: alignmentPrompt },
      { inlineData: { mimeType: imageFile.type as any, data: base64 } },
    ],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(call25Result, { feature: "decision_layer_image", model: DECISION_LAYER_PRIMARY_MODEL });
  statusLog.push("Gemini Call 2.5: Alignment + Edits + Path...");
  statusLog.push(`Gemini Call 2.5 complete with ${DECISION_LAYER_PRIMARY_MODEL}.`);
  const alignmentData = safeParse(call25Result.response.text());
  if (alignmentData.realAlignment?.score) {
    alignmentData.realAlignment.score = Math.round(
      (alignmentData.realAlignment.score / 10) * 100,
    );
  }
  console.log("  ✓ Call 2.5 complete — alignment + edits + path done");
  // ═══════════════════════════════════════════════════════
  // CALL 3: Coaching Roadmap + Tiered Pricing
  // ═══════════════════════════════════════════════════════
  console.log("  → Gemini Call 3: Coaching Roadmap + Pricing...");
  const coachingPrompt = `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

Based on this evaluation, create a coaching roadmap and pricing guidance. Steps must be SPECIFIC — name exact tools, exact actions. Generic advice is forbidden.
ANALYSIS SUMMARY:
- What I See: ${geminiAnalysis.what_i_see}
- Quality Score: ${geminiAnalysis.quality_score}%
- Strengths: ${geminiAnalysis.strengths?.join(", ")}
- Weaknesses: ${geminiAnalysis.weaknesses?.join(", ")}
- Readiness Total: ${readinessScore.total}%
- Lowest Axes: ${Object.entries(axisScores)
    .sort((a: any, b: any) => a[1].score - b[1].score)
    .slice(0, 2)
    .map(([key, val]: any) => `${key}: ${val.score}%`)
    .join(", ")}
${contextSection}
Create:
1. **Coaching Roadmap** — 3 phases of improvement:
   - Phase 1 "Quick Wins" (30 minutes): 2-3 specific fixes they can do RIGHT NOW
   - Phase 2 "Level Up" (2 hours): 2-3 deeper improvements that meaningfully increase quality
   - Phase 3 "Market Ready" (ongoing): 2-3 steps to reach full monetization readiness
2. **Tiered Pricing** — based on CURRENT quality vs IMPROVED quality:
   - Starter: What they could charge NOW with minimal changes
   - Standard: What they could charge after Phase 1+2 improvements
   - Premium: What they could charge at full Phase 3 readiness
   - Include what each tier includes (single asset, bundle, license type)
IMPORTANT: 
- If blocker is "pricing" → be extra detailed on pricing rationale
- If blocker is "packaging" → focus Phase 1 on quick packaging wins
- If blocker is "goodenough" → be encouraging but honest in Phase 1
- Tailor to their quality level aim: ${creatorContext?.qualityLevel || "selling"}
- Time available: ${creatorContext?.timeConstraint || "unknown"}. If "under-1-hour" → only suggest Phase 1 quick wins. If "few-hours" → Phase 1 + some Phase 2. If "full-day" or longer → full 3-phase roadmap.
- CRITICAL: Scale the coaching intensity to match their time constraint. Don't suggest a week of work to someone with 1 hour.
Respond in this EXACT JSON:
{
  "coachingRoadmap": {
    "phase1": {
      "title": "Quick Wins",
      "timeEstimate": "30 minutes",
      "steps": ["<specific actionable step>", "<step>", "<step>"]
    },
    "phase2": {
      "title": "Level Up",
      "timeEstimate": "2 hours",
      "steps": ["<specific step>", "<step>", "<step>"]
    },
    "phase3": {
      "title": "Market Ready",
      "timeEstimate": "Ongoing",
      "steps": ["<specific step>", "<step>", "<step>"]
    }
  },
  "tieredPricing": {
   "starter": {
      "label": "Starter",
      "range": "<e.g. $5-15>",
      "includes": ["<what buyer gets>", "<license type>"]
    },
    "standard": {
      "label": "Standard",
      "range": "<e.g. $25-45>",
      "includes": ["<what buyer gets>", "<license type>"]
    },
    "premium": {
      "label": "Premium",
      "range": "<e.g. $60-100+>",
      "includes": ["<what buyer gets>", "<license type>"]
    },
    "upgradeJustification": "<1-2 sentences explaining why improved version commands higher price>",
    "honestPricing": {
      "low": <number>,
      "high": <number>,
      "currency": "USD",
      "reasoning": "<2-3 sentences>",
      "comparable": "<platform and price range>"
    }
  },
  "closingQuestion": "<One specific question to ask the creator about their next step — e.g. 'Which of the 3 quick wins do you want to tackle first?'>"
}`;
  const {
    result: call3Result,
    modelUsed: call3ModelUsed,
  } = await generateContentWithModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.3,
      responseMimeType: "application/json",
    },
    parts: [{ text: coachingPrompt }],
    feature: "decision_layer_image",
    stageLabel: "Gemini Call 3",
  });
  statusLog.push("Gemini Call 3: Coaching Roadmap + Pricing...");
  statusLog.push(`Gemini Call 3 complete with ${call3ModelUsed}.`);
  const coachingData = safeParse(call3Result.response.text());
  console.log("  ✓ Call 3 complete — coaching + pricing done");
  // Build coaching roadmap with defaults
  const coachingRoadmap: CoachingRoadmap = {
    phase1: coachingData.coachingRoadmap?.phase1 || {
      title: "Quick Wins",
      timeEstimate: "30 minutes",
      steps: [
        "Review and fix any visible artifacts",
        "Adjust exposure/contrast",
        "Crop for better composition",
      ],
    },
    phase2: coachingData.coachingRoadmap?.phase2 || {
      title: "Level Up",
      timeEstimate: "2 hours",
      steps: [
        "Refine color grading",
        "Add variations for bundle",
        "Create matching thumbnails",
      ],
    },
    phase3: coachingData.coachingRoadmap?.phase3 || {
      title: "Market Ready",
      timeEstimate: "Ongoing",
      steps: [
        "Build a cohesive collection",
        "Create marketing previews",
        "Set up licensing structure",
      ],
    },
  };
  // Build tiered pricing with defaults
  const tieredPricing: TieredPricing = {
    starter: coachingData.tieredPricing?.starter || {
      label: "Starter",
      range: "$5-15",
      includes: ["Single asset", "Personal use license"],
    },
    standard: coachingData.tieredPricing?.standard || {
      label: "Standard",
      range: "$25-45",
      includes: ["Asset + variations", "Commercial license"],
    },
    premium: coachingData.tieredPricing?.premium || {
      label: "Premium",
      range: "$60-100+",
      includes: [
        "Full collection",
        "Extended/exclusive license",
        "Source files",
      ],
    },
    upgradeJustification:
      coachingData.tieredPricing?.upgradeJustification ||
      "Improved consistency and packaging increases perceived value and justifies premium pricing.",
  };
  // Build honest pricing with defaults
  // ✅ Correct path
  const honestPricing: HonestPricing = coachingData.tieredPricing
    ?.honestPricing || {
    low: 5,
    high: 50,
    currency: "USD",
    reasoning: "Based on current quality level and market comparables.",
    comparable: "Similar assets on stock platforms range $5-50.",
  };
  // ═══════════════════════════════════════════════════════
  // CONSENSUS
  // ═══════════════════════════════════════════════════════
  console.log("  → Building consensus...");
  let overallQuality:
    | "exceptional"
    | "professional"
    | "good"
    | "average"
    | "needs-work";
  if (geminiAnalysis.quality_score >= 90) overallQuality = "exceptional";
  else if (geminiAnalysis.quality_score >= 75) overallQuality = "professional";
  else if (geminiAnalysis.quality_score >= 60) overallQuality = "good";
  else if (geminiAnalysis.quality_score >= 40) overallQuality = "average";
  else overallQuality = "needs-work";
  let monetizationReadiness: "ready" | "needs-refinement" | "not-ready";
  if (readinessScore.total >= 80) monetizationReadiness = "ready";
  else if (readinessScore.total >= 53)
    monetizationReadiness = "needs-refinement";
  else monetizationReadiness = "not-ready";
  const confidence = readinessScore.total;
  console.log("  ✓ Analysis Complete!");
  console.log(
    `    Quality: ${overallQuality} | Readiness: ${readinessScore.total}% | Monetization: ${monetizationReadiness} | Confidence: ${confidence}%`,
  );
  // ── Build flattened convenience properties for evaluate route ──
  const overallReadiness = readinessScore.total;
const alignmentVerdict: "monetize-now" | "monetize-with-fixes" | "portfolio-only" | "hold-as-exploration" | "not-market-ready" =
  readinessScore.total >= 80 ? "monetize-now"
  : readinessScore.total >= 65 ? "monetize-with-fixes"
  : readinessScore.total >= 53 ? "portfolio-only"
  : readinessScore.total >= 35 ? "hold-as-exploration"
  : "not-market-ready";
  const readinessScores = [
    {
      axis: "Creative Clarity",
      score: readinessScore.creativeClarity.score,
      note: readinessScore.creativeClarity.justification,
    },
    {
      axis: "Technical Quality",
      score: readinessScore.technicalQuality.score,
      note: readinessScore.technicalQuality.justification,
    },
    {
      axis: "Consistency Control",
      score: readinessScore.consistencyControl.score,
      note: readinessScore.consistencyControl.justification,
    },
    {
      axis: "Audience Fit",
      score: readinessScore.audienceFit.score,
      note: readinessScore.audienceFit.justification,
    },
    {
      axis: "Differentiation",
      score: readinessScore.differentiation.score,
      note: readinessScore.differentiation.justification,
    },
    {
      axis: "Packaging Readiness",
      score: readinessScore.packagingReadiness.score,
      note: readinessScore.packagingReadiness.justification,
    },
  ];
  const shouldShowPricing = alignmentVerdict === "monetize-now" || alignmentVerdict === "monetize-with-fixes";
const pricingTiers = shouldShowPricing ? [
    {
      tier: "Starter",
      range: tieredPricing.starter.range,
      justification: tieredPricing.upgradeJustification,
      includes: tieredPricing.starter.includes,
    },
    {
      tier: "Standard",
      range: tieredPricing.standard.range,
      justification: tieredPricing.upgradeJustification,
      includes: tieredPricing.standard.includes,
    },
    {
      tier: "Premium",
      range: tieredPricing.premium.range,
      justification: tieredPricing.upgradeJustification,
      includes: tieredPricing.premium.includes,
    },
] : [];
  const lowestAxis = readinessScores.reduce(
    (min, s) => (s.score < min.score ? s : min),
    readinessScores[0],
  );
  const blockerRef = creatorContext?.blocker
    ? `You said "${creatorContext.blocker}" is your biggest challenge`
    : "Your main gap";
  const goalRef = creatorContext?.goal ? ` (goal: ${creatorContext.goal})` : "";
  const topPainPoint = `${blockerRef}${goalRef} — your weakest area is ${lowestAxis.axis} (${lowestAxis.score}%): ${lowestAxis.note}`;
  // Flatten coaching roadmap into array with 'actions' key (route expects this format)
  const coachingRoadmapArray = [
    {
      title: coachingRoadmap.phase1.title,
      timeEstimate: coachingRoadmap.phase1.timeEstimate,
      actions: coachingRoadmap.phase1.steps,
    },
    {
      title: coachingRoadmap.phase2.title,
      timeEstimate: coachingRoadmap.phase2.timeEstimate,
      actions: coachingRoadmap.phase2.steps,
    },
    {
      title: coachingRoadmap.phase3.title,
      timeEstimate: coachingRoadmap.phase3.timeEstimate,
      actions: coachingRoadmap.phase3.steps,
    },
  ];

  return {
    gemini_analysis: geminiAnalysis,
    readinessScore,
    coachingRoadmap: coachingRoadmapArray,
    tieredPricing,
    consensus: {
      overall_quality: overallQuality,
      monetization_readiness: monetizationReadiness,
      confidence,
    },
    // Flattened for evaluate route
    overallReadiness,
    alignmentVerdict,
    readinessScores,
    pricingTiers,
    topPainPoint,
    visualDescription: geminiAnalysis.what_i_see,
    evidenceUsed: [
      geminiAnalysis.composition,
      geminiAnalysis.technical_assessment,
      geminiAnalysis.commercial_potential,
    ],
    // ─── NEW Phase 3 fields ──────────────────────────────
    whatISaw: geminiAnalysis.whatISaw || {
      subjects: geminiAnalysis.what_i_see,
      lighting: "See technical assessment",
      color: "See technical assessment",
      composition: geminiAnalysis.composition,
      mood: "See visual description",
    },
    whatYouToldMe: {
      goal: creatorContext?.goal || "not specified",
      pain: creatorContext?.blocker || "not specified",
      constraints: creatorContext?.timeConstraint || "not specified",
      buyerType: creatorContext?.buyer || "not specified",
    },
    realAlignment: alignmentData.realAlignment || {
      score: readinessScore.total,
      gapSummary: "Unable to assess alignment gap.",
      blindSpots: [],
    },
    myRecommendation: {
     verdict:
  alignmentVerdict === "monetize-now" ? "Ready"
  : alignmentVerdict === "monetize-with-fixes" ? "Refine"
  : alignmentVerdict === "portfolio-only" ? "Refine"
  : alignmentVerdict === "hold-as-exploration" ? "Explore"
  : "Flag",
      reasoning: `${topPainPoint} Overall readiness: ${overallReadiness}%.`,
    },
    exactEdits: alignmentData.exactEdits || [],
    honestPricing,
    fastestPath: alignmentData.fastestPath || [],
    evidenceDetails: {
      fileCount: 1,
      resolution: clientSignals?.width
        ? `${clientSignals.width}×${clientSignals.height}`
        : "auto-detected",
      framesAnalyzed: 1,
      modelUsed: [
        call1ModelUsed,
        call2ModelUsed,
        DECISION_LAYER_PRIMARY_MODEL,
        call3ModelUsed,
      ].join(" -> "),
      analysisTimestamp: new Date().toISOString(),
      signalsSummary: clientSignals
        ? `${clientSignals.resolutionLabel} ${clientSignals.orientation} image, ${clientSignals.lightingMood}, ${clientSignals.colorMood}`
        : "No client signals",
      statusLog,
   },
    closingQuestion: coachingData.closingQuestion || "Which of the quick wins do you want to tackle first?",
    fallbackEvaluation: {
      vision_evidence: geminiAnalysis.what_i_see || "No visual evidence captured",
      decision: alignmentVerdict === "monetize-now" ? "APPROVE"
        : alignmentVerdict === "monetize-with-fixes" ? "FLAG"
        : alignmentVerdict === "portfolio-only" ? "FLAG"
        : alignmentVerdict === "hold-as-exploration" ? "REJECT"
        : "NEEDS_REVIEW",
      confidence: overallReadiness,
      scores: {
        technical_quality: readinessScore.technicalQuality.score,
        market_fit: readinessScore.audienceFit.score,
        policy_risk: 0,
        originality: readinessScore.differentiation.score,
      },
      reasons: geminiAnalysis.strengths || [],
      recommended_fixes: geminiAnalysis.improvements || [],
      marketplace_recommendation: {
        should_list: alignmentVerdict === "monetize-now" || alignmentVerdict === "monetize-with-fixes",
        category: creatorContext?.mediaType || "Digital Asset",
        title: `${creatorContext?.goal || "Creative"} Asset — ${overallReadiness}% Market Ready`,
        tags: [creatorContext?.buyer || "general", creatorContext?.goal || "creative", "digital asset"],
        price_range: tieredPricing.starter.range,
        next_step: alignmentVerdict === "monetize-now"
          ? "List immediately on your target platform"
          : coachingRoadmap.phase1.steps[0] || "Complete quick wins first",
      },
    },
  };
}
