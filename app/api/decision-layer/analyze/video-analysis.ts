import {
  disableGeminiFallback,
  GoogleGenerativeAI,
  SchemaType,
  type Schema,
} from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import { uploadAudioTempAndGetSignedUrl } from "@/lib/audioTempStorage";
import { logReplicateError, maskSecret } from "@/lib/replicateDebug";
const genai = getGoogleAiClient();
const DECISION_LAYER_PRIMARY_MODEL = "gemini-3.1-pro-preview";
const DECISION_LAYER_REQUEST_OPTIONS = disableGeminiFallback();
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
IF YOU CANNOT SEE PIXELS → respond with NEEDS_REVIEW and confidence 0
MANDATORY: Describe specific pixels — colours, subjects, positions, lighting across frames
Generic descriptions = automatic NEEDS_REVIEW
No approval without explicit visual evidence from actual frames`;
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

function createAnalysisStageError({
  code,
  summary,
  details,
  stage,
  rawText,
}: {
  code: string;
  summary: string;
  details: string;
  stage: string;
  rawText?: string;
}) {
  const error = new Error(summary);
  (error as Error & Record<string, unknown>).code = code;
  (error as Error & Record<string, unknown>).details = details;
  (error as Error & Record<string, unknown>).stage = stage;
  (error as Error & Record<string, unknown>).rawText = rawText || null;
  return error;
}

function tryParseJsonObject(text: string): any | null {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  if (!cleaned) return null;

  const attempts = [cleaned];
  const objectMatch = cleaned.match(/\{[\s\S]*$/);
  if (objectMatch && objectMatch[0] !== cleaned) {
    attempts.push(objectMatch[0]);
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      const repaired = closeJsonDelimiters(attempt);
      if (repaired !== attempt) {
        try {
          return JSON.parse(repaired);
        } catch {
          // keep trying other variants
        }
      }
    }
  }

  return null;
}

function closeJsonDelimiters(text: string): string {
  let repaired = text.trim();
  let braceBalance = 0;
  let bracketBalance = 0;

  for (const char of repaired) {
    if (char === "{") braceBalance += 1;
    else if (char === "}") braceBalance -= 1;
    else if (char === "[") bracketBalance += 1;
    else if (char === "]") bracketBalance -= 1;
  }

  while (bracketBalance > 0) {
    repaired += "]";
    bracketBalance -= 1;
  }

  while (braceBalance > 0) {
    repaired += "}";
    braceBalance -= 1;
  }

  return repaired;
}

const readinessAxisNames = [
  "Creative Clarity",
  "Technical Quality",
  "Consistency",
  "Audience Fit",
  "Differentiation",
  "Packaging Readiness",
] as const;

const readinessLabels = [
  "Needs Work",
  "Developing",
  "Solid",
  "Strong",
  "Exceptional",
] as const;

const verdictLabels = [
  "monetize-now",
  "monetize-with-fixes",
  "portfolio-only",
  "hold-as-exploration",
  "not-market-ready",
] as const;

const effortLabels = ["Quick", "Medium", "Deep"] as const;

const videoScoreAxisSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    axis: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [...readinessAxisNames],
    },
    score: { type: SchemaType.NUMBER },
    label: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [...readinessLabels],
    },
    note: { type: SchemaType.STRING },
  },
  required: ["axis", "score", "label", "note"],
};

const videoScoresResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    scores: {
      type: SchemaType.ARRAY,
      items: videoScoreAxisSchema,
    },
    verdict: {
      type: SchemaType.STRING,
      format: "enum",
      enum: [...verdictLabels],
    },
  },
  required: ["scores", "verdict"],
};

const videoCoachingResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    roadmap: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          phase: { type: SchemaType.NUMBER },
          title: { type: SchemaType.STRING },
          timeframe: { type: SchemaType.STRING },
          actions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: ["phase", "title", "timeframe", "actions"],
      },
    },
    pricing: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          tier: { type: SchemaType.STRING },
          range: { type: SchemaType.STRING },
          justification: { type: SchemaType.STRING },
          upgradeAction: { type: SchemaType.STRING },
        },
        required: ["tier", "range", "justification"],
      },
    },
    painPoint: { type: SchemaType.STRING },
    honestPricing: {
      type: SchemaType.OBJECT,
      properties: {
        low: { type: SchemaType.NUMBER },
        high: { type: SchemaType.NUMBER },
        currency: { type: SchemaType.STRING },
        reasoning: { type: SchemaType.STRING },
        comparable: { type: SchemaType.STRING },
      },
      required: ["low", "high", "currency", "reasoning", "comparable"],
    },
    closingQuestion: { type: SchemaType.STRING },
  },
  required: ["roadmap", "pricing", "painPoint", "honestPricing", "closingQuestion"],
};

const videoAlignmentResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    realAlignment: {
      type: SchemaType.OBJECT,
      properties: {
        score: { type: SchemaType.NUMBER },
        gapSummary: { type: SchemaType.STRING },
        blindSpots: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
      required: ["score", "gapSummary", "blindSpots"],
    },
    exactEdits: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          edit: { type: SchemaType.STRING },
          why: { type: SchemaType.STRING },
          effort: {
            type: SchemaType.STRING,
            format: "enum",
            enum: [...effortLabels],
          },
        },
        required: ["edit", "why", "effort"],
      },
    },
    fastestPath: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          step: { type: SchemaType.STRING },
          timeEstimate: { type: SchemaType.STRING },
        },
        required: ["step", "timeEstimate"],
      },
    },
  },
  required: ["realAlignment", "exactEdits", "fastestPath"],
};

function parseStructuredJson(text: string): any | null {
  return tryParseJsonObject(text);
}

async function repairVideoScoresJson(
  brokenText: string,
): Promise<any | null> {
  const repairModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 2600,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: videoScoresResponseSchema,
    },
  });

  const repairResult = await repairModel.generateContent(
    [
      {
        text: `Repair and complete this broken scoring JSON into valid JSON only.
Do not add markdown.
Preserve the same meaning and scale.
Return exactly this schema:
{
  "scores": [
    { "axis": "Creative Clarity", "score": 1-5, "label": "Needs Work|Developing|Solid|Strong|Exceptional", "note": "..." },
    { "axis": "Technical Quality", "score": 1-5, "label": "Needs Work|Developing|Solid|Strong|Exceptional", "note": "..." },
    { "axis": "Consistency", "score": 1-5, "label": "Needs Work|Developing|Solid|Strong|Exceptional", "note": "..." },
    { "axis": "Audience Fit", "score": 1-5, "label": "Needs Work|Developing|Solid|Strong|Exceptional", "note": "..." },
    { "axis": "Differentiation", "score": 1-5, "label": "Needs Work|Developing|Solid|Strong|Exceptional", "note": "..." },
    { "axis": "Packaging Readiness", "score": 1-5, "label": "Needs Work|Developing|Solid|Strong|Exceptional", "note": "..." }
  ],
  "verdict": "monetize-now|monetize-with-fixes|portfolio-only|hold-as-exploration|not-market-ready"
}

BROKEN JSON:
${brokenText.slice(0, 6000)}`,
      },
    ],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(repairResult, {
    feature: "decision_layer_video",
    model: DECISION_LAYER_PRIMARY_MODEL,
  });
  return tryParseJsonObject(repairResult.response.text());
}
import Replicate from "replicate";
export interface CreatorContext {
  goal?: string;
  buyer?: string;
  mediaType?: string;
  timeConstraint?: string;
  qualityLevel?: string; // e.g. "beginner", "intermediate", "professional"
  blocker?: string; // e.g. "pricing confusion", "no audience", "inconsistent style"
}
// 6-Axis Readiness Score
export interface ReadinessAxis {
  axis: string;
  score: number; // 1-5
  label: string; // "Needs Work" | "Developing" | "Solid" | "Strong" | "Exceptional"
  note: string; // 1-sentence explanation
}
// Coaching Phase
export interface CoachingPhase {
  phase: number; // 1, 2, or 3
  title: string; // "Quick Wins" | "Level Up" | "Market Ready"
  timeframe: string; // "30 minutes" | "2 hours" | "Ongoing"
  actions: string[]; // 2-4 specific actions
}
// Pricing Tier
export interface PricingTier {
  tier: string; // "Starter" | "Standard" | "Premium"
  range: string; // e.g. "$15-25"
  justification: string;
  upgradeAction?: string; // What to do to reach next tier
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
  score: number;
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
}
// ─── Audio Intelligence Types (Replicate) ─────────────────────────
interface AudioIntelligence {
  genres: { genre: string; confidence: number }[];
  moods: { mood: string; confidence: number }[];
  instruments: string[];
  isVocal: boolean;
  vocalGender: string;
  danceability: number;
  engagement: number;
  approachability: number;
  bpm: number;
  key: string;
  structure: { section: string; startTime: number; endTime: number }[];
}
// Full evaluation result
export interface VideoAnalysisResult {
  // Visual description (Call 1)
  visualDescription: string;
  evidenceUsed: string;
  audioAnalysis?: AudioAnalysis;
  // 6-Axis Scores (Call 2)
  readinessScores: ReadinessAxis[];
  overallReadiness: number; // Average of 6 axes
  alignmentVerdict: "monetize-now" | "monetize-with-fixes" | "portfolio-only" | "hold-as-exploration" | "not-market-ready";

  // Coaching + Pricing (Call 3)
  coachingRoadmap: CoachingPhase[];
  pricingTiers: PricingTier[];
  topPainPoint: string;

  // Metadata
  frameCount: number;
  sampledTimestamps: number[];
  durationSeconds: number;
  model: string;
  // ─── NEW Phase 3 fields (additive) ──────────────────
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
audioIntelligence?: AudioIntelligence;
}
async function describeVideoFrames(
  frames: { base64: string; timestamp: number }[],
  creatorContext?: CreatorContext,
  clientSignals?: any | null,
  knowledgeTier?: string,
): Promise<{ description: string; evidence: string; whatISaw: WhatISaw }> {
  const contextBlock = creatorContext
    ? `
CREATOR CONTEXT (use this to focus your observations):
- Goal: ${creatorContext.goal || "not specified"}
- Target buyer: ${creatorContext.buyer || "not specified"}
- Media type: ${creatorContext.mediaType || "not specified"}
- Time available: ${creatorContext.timeConstraint || "not specified"}
- Self-assessed level: ${creatorContext.qualityLevel || "not specified"}
- Main blocker: ${creatorContext.blocker || "not specified"}
`
    : "";
  const signalsBlock = clientSignals
    ? `
CLIENT-SIDE PRE-ANALYSIS (extracted from the file before this call):
- Format: ${clientSignals.format || "unknown"}
- File size: ${clientSignals.fileSizeMB || "unknown"}MB
- Duration: ${clientSignals.durationLabel || "unknown"}
`
    : "";
  const descParts: any[] = [];
  for (const frame of frames) {
    descParts.push({ text: `Frame at ${frame.timestamp.toFixed(1)}s:` });
    const b64 = frame.base64.startsWith("data:")
      ? frame.base64.split(",")[1]
      : frame.base64;
    descParts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } });
  }

  const descModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    systemInstruction: `${DECISION_LAYER_PERSONA}

${VISION_GUARDRAIL}

Creator knowledge tier: ${knowledgeTier}

You are analyzing video frames for KAIZORA's Decision Layer.
${contextBlock}${signalsBlock}TASK: Describe exactly what you see across these video frames in rich detail.
FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
WHAT I SEE IN YOUR CONTENT:
[6-10 sentences describing: every visible subject/object across frames, motion and movement patterns, camera work (static/pan/tracking/handheld), transitions between scenes, lighting setup and changes, color palette and grading, composition choices, audio-visual style, textures and materials, background/environment details, mood and atmosphere progression. Be so specific that someone could storyboard this video from your description alone.]
SUBJECTS: [Every subject/object visible across all frames — people, characters, text, environments, props. Be exhaustive.]
LIGHTING: [Light quality, direction, color temperature, changes across the video, shadows, highlights.]
COLOR: [Dominant palette, saturation, warm/cool shifts, any color grading applied, accent colors.]
COMPOSITION: [Framing choices, camera movement, depth, focal points, rule of thirds, negative space.]
MOOD: [Emotional atmosphere, energy level, pacing feel — calm, intense, playful, dark, cinematic, raw.]
EVIDENCE USED:
[1 sentence: "Analyzed X frames from a Y-second video spanning timestamps Z"]
RULES:
- Only describe what you can literally see in the pixels
- Note motion/transitions between frames
- Mention technical quality (resolution, stability, lighting, color grading)
- If you cannot see the frames, respond with "NEEDS_REVIEW" and confidence 0
- NEVER guess or fabricate details`,
    generationConfig: { maxOutputTokens: 3000 },
  });
  const descResult = await descModel.generateContent(
    descParts,
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(descResult, { feature: "decision_layer_video", model: DECISION_LAYER_PRIMARY_MODEL });
  const text = descResult.response.text();
  console.log("CALL 1 RAW TEXT:", text);
  // Split into description and evidence
  const descMatch = text.match(
    /WHAT I SEE IN YOUR CONTENT:\s*([\s\S]*?)(?=SUBJECTS:|EVIDENCE USED:|$)/i,
  );
  const subjectsMatch = text.match(
    /SUBJECTS:\s*([\s\S]*?)(?=LIGHTING:|COLOR:|COMPOSITION:|MOOD:|EVIDENCE USED:|$)/i,
  );
  const lightingMatch = text.match(
    /LIGHTING:\s*([\s\S]*?)(?=COLOR:|COMPOSITION:|MOOD:|EVIDENCE USED:|$)/i,
  );
  const colorMatch = text.match(
    /COLOR:\s*([\s\S]*?)(?=COMPOSITION:|MOOD:|EVIDENCE USED:|$)/i,
  );
  const compositionMatch = text.match(
    /COMPOSITION:\s*([\s\S]*?)(?=MOOD:|EVIDENCE USED:|$)/i,
  );
  const moodMatch = text.match(/MOOD:\s*([\s\S]*?)(?=EVIDENCE USED:|$)/i);
  const evidenceMatch = text.match(/EVIDENCE USED:\s*([\s\S]*?)$/i);

  return {
    description: descMatch?.[1]?.trim() || text,
    evidence: evidenceMatch?.[1]?.trim() || `Analyzed ${frames.length} frames`,
    whatISaw: {
      subjects: subjectsMatch?.[1]?.trim() || "See description",
      lighting: lightingMatch?.[1]?.trim() || "See description",
      color: colorMatch?.[1]?.trim() || "See description",
      composition: compositionMatch?.[1]?.trim() || "See description",
      mood: moodMatch?.[1]?.trim() || "See description",
    },
  };
}
// ── Call 2: 6-Axis Scoring ──────────────────────────────────────────────────
async function scoreVideoAxes(
  frames: { base64: string; timestamp: number }[],
  description: string,
  creatorContext?: CreatorContext,
  knowledgeTier?: string,
): Promise<{
  scores: ReadinessAxis[];
  overall: number;
  verdict: "monetize-now" | "monetize-with-fixes" | "portfolio-only" | "hold-as-exploration" | "not-market-ready";
}> {
  const contextBlock = creatorContext
    ? `
CREATOR CONTEXT:
- Goal: ${creatorContext.goal || "not specified"}
- Target buyer: ${creatorContext.buyer || "not specified"}
- Media type: ${creatorContext.mediaType || "not specified"}
- Time available: ${creatorContext.timeConstraint || "not specified"}
- Self-assessed level: ${creatorContext.qualityLevel || "not specified"}
- Main blocker: ${creatorContext.blocker || "not specified"}
`
    : "";
  const scoringFrames =
    frames.length <= 3
      ? frames
      : [
          frames[0],
          frames[Math.floor(frames.length / 2)],
          frames[frames.length - 1],
        ];

  const scoreParts: any[] = [];
  for (const frame of scoringFrames) {
    const b64 = frame.base64.startsWith("data:")
      ? frame.base64.split(",")[1]
      : frame.base64;
    scoreParts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } });
  }

  const scoreModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    systemInstruction: `${DECISION_LAYER_PERSONA}

${VISION_GUARDRAIL}

Creator knowledge tier: ${knowledgeTier}

Evaluate video content for market readiness. Calibrate scores to the creator's tier — a HOBBYIST at 70% is performing well; a COMMERCIAL creator at 70% needs work.

${contextBlock}
VISUAL DESCRIPTION (already verified):
${description}
Score this video on exactly 6 axes. Each score is 1-5.
RESPOND WITH VALID JSON ONLY — no markdown, no backticks:
{
  "scores": [
  { "axis": "Creative Clarity", "score": N, "label": "LABEL", "note": "2-3 sentences explaining score with specific visual evidence from the frames" },
    { "axis": "Technical Quality", "score": N, "label": "LABEL", "note": "2-3 sentences referencing resolution, stability, lighting, color grading specifics" },
    { "axis": "Consistency", "score": N, "label": "LABEL", "note": "2-3 sentences about visual/motion consistency across frames with examples" },
    { "axis": "Audience Fit", "score": N, "label": "LABEL", "note": "2-3 sentences referencing target buyer and specific use cases" },
    { "axis": "Differentiation", "score": N, "label": "LABEL", "note": "2-3 sentences comparing to typical stock content" },
    { "axis": "Packaging Readiness", "score": N, "label": "LABEL", "note": "2-3 sentences about what's needed to make it sellable" }
  ],
  "verdict": "monetize-now | monetize-with-fixes | portfolio-only | hold-as-exploration | not-market-ready"
}
LABELS: 1=Needs Work, 2=Developing, 3=Solid, 4=Strong, 5=Exceptional
VERDICT RULES:
- monetize-now: All scores >= 4 AND average >= 80%
- monetize-with-fixes: Average >= 65% AND no score is 1
- portfolio-only: Average >= 53% AND no score is 1
- hold-as-exploration: Average >= 35%
- not-market-ready: Any score is 1 OR average < 35%`,
    generationConfig: {
      maxOutputTokens: 1400,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: videoScoresResponseSchema,
    },
  });
  const scoreResult = await scoreModel.generateContent(
    scoreParts,
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(scoreResult, { feature: "decision_layer_video", model: DECISION_LAYER_PRIMARY_MODEL });
  const text = scoreResult.response.text();
  console.log("CALL 2 RAW TEXT:", text);
  // Parse JSON with auto-repair
  let parsed: any = parseStructuredJson(text);
  if (!parsed) {
    parsed = await repairVideoScoresJson(text);
  }
  if (!parsed || !Array.isArray(parsed.scores)) {
    throw createAnalysisStageError({
      code: "VIDEO_SCORING_PARSE_FAILED",
      summary: "Video scoring response could not be parsed",
      details:
        "Gemini returned an invalid or incomplete JSON payload for the 6-axis scoring step.",
      stage: "scoreVideoAxes",
      rawText: text.slice(0, 4000),
    });
  }
  const scores: ReadinessAxis[] = parsed.scores;
  const expectedAxes = [...readinessAxisNames];
  const hasAllAxes =
    scores.length === expectedAxes.length &&
    expectedAxes.every((axis) => scores.some((score) => score.axis === axis));
  const hasValidScores = scores.every(
    (score) =>
      typeof score.score === "number" &&
      Number.isFinite(score.score) &&
      score.score >= 1 &&
      score.score <= 5,
  );

  if (!hasAllAxes || !hasValidScores) {
    const repairedParsed = await repairVideoScoresJson(text);
    if (repairedParsed && Array.isArray(repairedParsed.scores)) {
      parsed = repairedParsed;
    }
  }

  const repairedScores: ReadinessAxis[] = Array.isArray(parsed?.scores)
    ? parsed.scores
    : [];
  const repairedHasAllAxes =
    repairedScores.length === expectedAxes.length &&
    expectedAxes.every((axis) =>
      repairedScores.some((score) => score.axis === axis),
    );
  const repairedHasValidScores = repairedScores.every(
    (score) =>
      typeof score.score === "number" &&
      Number.isFinite(score.score) &&
      score.score >= 1 &&
      score.score <= 5,
  );

  if (!repairedHasAllAxes || !repairedHasValidScores) {
    throw createAnalysisStageError({
      code: "VIDEO_SCORING_INVALID_SCHEMA",
      summary: "Video scoring response schema was incomplete",
      details:
        "Gemini returned scoring JSON, but the axis list or score values were invalid.",
      stage: "scoreVideoAxes",
      rawText: text.slice(0, 4000),
    });
  }

  repairedScores.forEach((s) => {
    s.score = Math.round((s.score / 5) * 100);
  });
  const overall =
    repairedScores.reduce((sum, s) => sum + s.score, 0) / repairedScores.length;
  return {
    scores: repairedScores,
    overall: Math.round(overall),
    verdict: parsed.verdict || "not-market-ready",
  };
}
// ── Call 3: Coaching Roadmap + Pricing ───────────────────────────────────────
async function generateCoachingAndPricing(
  description: string,
  scores: ReadinessAxis[],
  overall: number,
  creatorContext?: CreatorContext,
  knowledgeTier?: string,
): Promise<{
  roadmap: CoachingPhase[];
  pricing: PricingTier[];
  painPoint: string;
  honestPricing: HonestPricing;
}> {
  const contextBlock = creatorContext
    ? `
CREATOR CONTEXT:
- Goal: ${creatorContext.goal || "not specified"}
- Target buyer: ${creatorContext.buyer || "not specified"}
- Media type: ${creatorContext.mediaType || "not specified"}
- Time available: ${creatorContext.timeConstraint || "not specified"}
- Self-assessed level: ${creatorContext.qualityLevel || "not specified"}
- Main blocker: ${creatorContext.blocker || "not specified"}
`
    : "";
  const scoresText = scores
    .map((s) => `${s.axis}: ${s.score}% (${s.label}) — ${s.note}`)
    .join("\n");
  const coachModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    systemInstruction: `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

You are coaching a video creator. Steps must be SPECIFIC — name exact tools, exact actions. Generic advice is forbidden.

${contextBlock}
VISUAL DESCRIPTION:
${description}
READINESS SCORES:
${scoresText}
Overall: ${overall}%
Generate a coaching roadmap and pricing guidance.
RESPOND WITH VALID JSON ONLY — no markdown, no backticks:
{
  "roadmap": [
    { "phase": 1, "title": "Quick Wins", "timeframe": "30 minutes", "actions": ["action 1", "action 2", "action 3"] },
    { "phase": 2, "title": "Level Up", "timeframe": "2 hours", "actions": ["action 1", "action 2", "action 3"] },
    { "phase": 3, "title": "Market Ready", "timeframe": "Ongoing", "actions": ["action 1", "action 2"] }
  ],
  "pricing": [
    { "tier": "Starter", "range": "$X-Y", "justification": "why now", "upgradeAction": "do X to reach Standard" },
    { "tier": "Standard", "range": "$X-Y", "justification": "why after improvements", "upgradeAction": "do X to reach Premium" },
    { "tier": "Premium", "range": "$X-Y", "justification": "why at full potential" }
  ],
  "painPoint": "You said [blocker] is your biggest challenge — connect to actual content quality.",
   "honestPricing": { "low": 15, "high": 200, "currency": "USD", "reasoning": "...", "comparable": "..." },
  "closingQuestion": "<One specific question to ask the creator about their next step>"
}`,
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: videoCoachingResponseSchema,
    },
  });
  const coachResult = await coachModel.generateContent(
    [{ text: "Generate now." }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(coachResult, { feature: "decision_layer_video", model: DECISION_LAYER_PRIMARY_MODEL });
  const text = coachResult.response.text();

  const parsed: any = parseStructuredJson(text);
  if (!parsed) {
    return {
    roadmap: [
  {
    phase: 1,
    title: "Quick Wins",
    timeframe: "30 minutes",
    actions: ["Re-run analysis for specific coaching steps"],
  },
  {
    phase: 2,
    title: "Level Up",
    timeframe: "2 hours",
    actions: ["Re-run analysis for specific coaching steps"],
  },
  {
    phase: 3,
    title: "Market Ready",
    timeframe: "Ongoing",
    actions: ["Re-run analysis for specific coaching steps"],
  },
],
      pricing: [
        {
          tier: "Starter",
          range: "$15-35",
          justification: "Current quality level for basic licensing",
        },
        {
          tier: "Standard",
          range: "$50-150",
          justification: "After technical improvements and better packaging",
        },
        {
          tier: "Premium",
          range: "$200-500+",
          justification:
            "Exclusive, series-ready content with consistent style",
        },
      ],
      honestPricing: {
        low: 15,
        high: 200,
        currency: "USD",
        reasoning: "Based on current video quality and market comparables.",
        comparable:
          "Similar stock clips on Pond5 and Shutterstock range $15-200.",
      },
      painPoint:
        "Unable to determine specific blocker — review scores for guidance",
    };
  }
  return {
    roadmap: parsed.roadmap || [],
    pricing: parsed.pricing || [],
    painPoint:
      parsed.painPoint ||
      "Review your lowest-scoring axis for the biggest improvement opportunity",
    honestPricing: parsed.honestPricing || {
      low: 15,
      high: 200,
      currency: "USD",
      reasoning: "Based on current video quality and market comparables.",
      comparable:
        "Similar stock clips on Pond5 and Shutterstock range $15-200.",
    },
  };
}
// ── Call 2.5 equivalent: Real Alignment + Exact Edits + Fastest Path ────────
async function generateAlignmentAndEdits(
  description: string,
  scores: ReadinessAxis[],
  overall: number,
  creatorContext?: CreatorContext,
  knowledgeTier?: string,
): Promise<{
  realAlignment: RealAlignment;
  exactEdits: ExactEdit[];
  fastestPath: FastestPathStep[];
}> {
  const contextBlock = creatorContext
    ? `
CREATOR CONTEXT:
- Goal: ${creatorContext.goal || "not specified"}
- Target buyer: ${creatorContext.buyer || "not specified"}
- Media type: ${creatorContext.mediaType || "not specified"}
- Time available: ${creatorContext.timeConstraint || "not specified"}
- Self-assessed level: ${creatorContext.qualityLevel || "not specified"}
- Main blocker: ${creatorContext.blocker || "not specified"}
`
    : "";

  const scoresText = scores
    .map((s) => `${s.axis}: ${s.score}% (${s.label}) — ${s.note}`)
    .join("\n");

  const alignModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    systemInstruction: `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

You are KAIZORA's decision advisor for video content.
${contextBlock}
 
VISUAL DESCRIPTION:
${description}
 
READINESS SCORES:
${scoresText}
Overall: ${overall}%
 
Generate three things:
1. Real Alignment — score 1-10, gap summary, blind spots
2. Exact Edits — 3-5 specific edits with effort level Quick/Medium/Deep
3. Fastest Path — 3-5 steps with time estimates
 
RESPOND WITH VALID JSON ONLY:
{
  "realAlignment": { "score": 7, "gapSummary": "...", "blindSpots": ["...", "...", "..."] },
  "exactEdits": [
    { "edit": "...", "why": "...", "effort": "Quick" },
    { "edit": "...", "why": "...", "effort": "Medium" },
    { "edit": "...", "why": "...", "effort": "Deep" }
  ],
  "fastestPath": [
    { "step": "...", "timeEstimate": "15 minutes" },
    { "step": "...", "timeEstimate": "1 hour" },
    { "step": "...", "timeEstimate": "2 hours" }
  ]
}`,
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.15,
      responseMimeType: "application/json",
      responseSchema: videoAlignmentResponseSchema,
    },
  });
  const alignResult = await alignModel.generateContent(
    [{ text: "Generate now." }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(alignResult, { feature: "decision_layer_video", model: DECISION_LAYER_PRIMARY_MODEL });
  const text = alignResult.response.text();

  const parsed: any = parseStructuredJson(text);

  return {
    realAlignment: parsed?.realAlignment || {
      score: overall,
      gapSummary: "Unable to assess alignment gap.",
      blindSpots: [],
    },
    exactEdits: parsed?.exactEdits || [],
    fastestPath: parsed?.fastestPath || [],
  };
}
export interface AudioAnalysis {
  hasAudio: boolean;
  transcript: string;
  audioQuality: string;
  audioNotes: string;
}
// ═══════════════════════════════════════════════════════════════════
// REPLICATE: Music Classification (for video audio track)
// ═══════════════════════════════════════════════════════════════════
async function classifyMusicFromVideo(
  audioBase64: string,
  mimeType: string,
  replicate: Replicate,
): Promise<AudioIntelligence | null> {
  console.log("  → Replicate: Music classifiers on video audio track...");

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    const fileName = `audio-${Date.now()}.mp3`;
    const { path: storagePath, signedUrl: audioUrl } =
      await uploadAudioTempAndGetSignedUrl(fileName, audioBuffer, mimeType);
    console.log("Audio temp storage path:", storagePath);
    console.log("Audio signed URL generated for Replicate");

    const [classificationOutput, structureOutput] = await Promise.allSettled([
      replicate.run(
        "mtg/effnet-discogs:1532dd069fb4f0e27c6833e28815f6b8c194dfec76fd9cd73460540fd720ffe1",
        {
          input: {
            audio: audioUrl,
            top_n: 10,
            output_format: "JSON",
          },
        },
      ),
      replicate.run(
        "cwalo/all-in-one-music-structure-analysis:6deeba047db17da69e9826c0285cd137cd2a81af05eb44ff496b7acd69b3a383",
        {
          input: { music_input: audioUrl, visualize: false, demux: false },
        },
      ),
    ]);

    console.log("MTG status:", classificationOutput.status);
    console.log("CWALO status:", structureOutput.status);

    // ── MTG: fetch the file URL, then parse JSON
    let mtgResult: any = {};
    if (
      classificationOutput.status === "fulfilled" &&
      classificationOutput.value
    ) {
      console.log("MTG raw value type:", typeof classificationOutput.value);
      console.log(
        "MTG raw value:",
        JSON.stringify(classificationOutput.value, null, 2),
      );

      const fileUrl = (classificationOutput.value as any).url();
      console.log("MTG file URL:", fileUrl);
      const res = await fetch(fileUrl);
      mtgResult = await res.json();
      console.log("MTG raw result:", JSON.stringify(mtgResult, null, 2));
    } else if (classificationOutput.status === "rejected") {
      logReplicateError("MTG error", classificationOutput.reason, {
        stage: "classifyMusicFromVideo",
        modelVersion:
          "mtg/effnet-discogs:1532dd069fb4f0e27c6833e28815f6b8c194dfec76fd9cd73460540fd720ffe1",
        audioUrlHost: (() => {
          try {
            return new URL(audioUrl).host;
          } catch {
            return "invalid-url";
          }
        })(),
        replicateTokenConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
        replicateTokenMasked: maskSecret(process.env.REPLICATE_API_TOKEN),
      });
    }

    // ── CWALO: fetch first file URL, then parse JSON
    let cwaloResult: any = {};
    if (structureOutput.status === "fulfilled" && structureOutput.value) {
      const files = structureOutput.value as any[];
      const fileUrl = files[0].url();
      console.log("CWALO file URL:", fileUrl);
      const res = await fetch(fileUrl);
      cwaloResult = await res.json();
      console.log("CWALO raw result:", JSON.stringify(cwaloResult, null, 2));
    } else if (structureOutput.status === "rejected") {
      logReplicateError("CWALO error", structureOutput.reason, {
        stage: "classifyMusicFromVideo",
        modelVersion:
          "cwalo/all-in-one-music-structure-analysis:6deeba047db17da69e9826c0285cd137cd2a81af05eb44ff496b7acd69b3a383",
        audioUrlHost: (() => {
          try {
            return new URL(audioUrl).host;
          } catch {
            return "invalid-url";
          }
        })(),
        replicateTokenConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
        replicateTokenMasked: maskSecret(process.env.REPLICATE_API_TOKEN),
      });
    }

    // ── Parse MTG genres (format: "Genre---Subgenre": probability) ──
    const genres = Object.entries(mtgResult)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 10)
      .map(([key, value]: [string, any]) => ({
        genre: key.replace("---", " → "),
        confidence: Math.round(value * 100),
      }));

    // ── Parse CWALO structure ──
    const structure = (cwaloResult.segments || []).map((s: any) => ({
      section: s.label || "unknown",
      startTime: s.start || 0,
      endTime: s.end || 0,
    }));

    console.log(
      `  ✓ Replicate parsed — ${genres.length} genres, BPM: ${cwaloResult.bpm || 0}, ${structure.length} sections`,
    );

    return {
      genres,
      moods: [],
      instruments: [],
      isVocal: false,
      vocalGender: "unknown",
      danceability: 0,
      engagement: 0,
      approachability: 0,
      bpm: cwaloResult.bpm || 0,
      key: cwaloResult.key || "unknown",
      structure,
    };
  } catch (error) {
    logReplicateError("  ⚠️ Replicate failed", error, {
      stage: "classifyMusicFromVideo",
      replicateTokenConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
      replicateTokenMasked: maskSecret(process.env.REPLICATE_API_TOKEN),
    });
    return null;
  }
}
export async function analyzeVideo(
  frames: { base64: string; timestamp: number }[],
  durationSeconds: number,

  customPrompt?: string | null,
  conversationContext?: string,
  creatorContext?: CreatorContext,
  clientSignals?: any | null,
  audioData?: { audioBase64: string | null; hasAudio: boolean } | null,
  replicate?: Replicate,
): Promise<VideoAnalysisResult> {
  if (!frames || frames.length === 0) {
    throw new Error("No video frames provided for analysis");
  }
  const knowledgeTier =
  creatorContext?.qualityLevel === "professional" ? "STUDIO/COMMERCIAL"
  : creatorContext?.qualityLevel === "intermediate" ? "INDEPENDENT"
  : "HOBBYIST";
 const { description, evidence, whatISaw } = await describeVideoFrames(
  frames,
  creatorContext,
  clientSignals,
  knowledgeTier,
);

  // Vision failure check
const forbiddenPhrases = [
  "i cannot see", "i can't see", "no image data", "i'm unable to view",
  "no visual content", "i cannot access", "no media provided",
  "i don't have access to the image", "i don't see any image", "needs_review"
];
const descLower = description.toLowerCase();
const matchedPhrase = forbiddenPhrases.find((phrase) =>
  descLower.includes(phrase),
);
if (matchedPhrase) {
  throw createVisionVerificationError({
    summary: "Vision verification failed",
    details: `The model response included the blocked phrase "${matchedPhrase}", so the extracted video frames were treated as unreliable. Re-upload in MP4 (H.264) or WebM format.`,
    matchedPhrase,
    descriptionLength: description.length,
  });
}
if (description.length < 50) {
  throw createVisionVerificationError({
    summary: "Vision verification failed",
    details: `The model returned a frame description that was too short to trust (${description.length} characters, minimum 50). Re-upload in MP4 (H.264) or WebM format.`,
    descriptionLength: description.length,
  });
}

  // ── Audio Analysis ──
  let audioAnalysis: AudioAnalysis = {
    hasAudio: false,
    transcript: "",
    audioQuality: "no audio",
    audioNotes: "No audio track detected in this video.",
  };

  if (audioData?.hasAudio && audioData.audioBase64) {
    console.log("  → Analyzing audio track...");
    try {
      // Step 1: Transcribe with Whisper
      const audioBuffer = Buffer.from(audioData.audioBase64, "base64");
      const audioFile = new File([audioBuffer], "audio.mp3", {
        type: "audio/mpeg",
      });
      const whisperModel = genai.getGenerativeModel({
        model: DECISION_LAYER_PRIMARY_MODEL,
      });
      const whisperResult = await whisperModel.generateContent(
        [
          {
            text: "Transcribe any speech in this audio. If no speech, return empty string only.",
          },
          {
            inlineData: {
              mimeType: "audio/mpeg",
              data: audioData.audioBase64,
            },
          },
        ],
        DECISION_LAYER_REQUEST_OPTIONS,
      );
      logGeminiUsage(whisperResult, { feature: "decision_layer_video", model: DECISION_LAYER_PRIMARY_MODEL });
      const transcript = whisperResult.response.text().trim();

      const aqModel = genai.getGenerativeModel({
        model: DECISION_LAYER_PRIMARY_MODEL,
        generationConfig: {
          maxOutputTokens: 500,
          responseMimeType: "application/json",
        },
      });
      const aqResult = await aqModel.generateContent(
        [
          {
            text: `You are an audio quality expert. Respond with valid JSON only, no markdown, no backticks, no extra text.
${creatorContext ? `Creator goal: ${creatorContext.goal}, buyer: ${creatorContext.buyer}, quality aim: ${creatorContext.qualityLevel}` : ""}
TRANSCRIPT: "${transcript.slice(0, 1000)}"
VIDEO DESCRIPTION: ${description.slice(0, 500)}
Return exactly: {"audioType":"speech","quality":"professional","hasSpeech":false,"hasMusic":true,"notes":"2-3 sentences here"}`,
          },
        ],
        DECISION_LAYER_REQUEST_OPTIONS,
      );

      let audioResult: any = { quality: "unknown", notes: "Audio detected." };
      try {
        logGeminiUsage(aqResult, { feature: "decision_layer_video", model: DECISION_LAYER_PRIMARY_MODEL });
        audioResult = JSON.parse(aqResult.response.text());
      } catch {
        // ignore bad JSON, use defaults
      }
      audioAnalysis = {
        hasAudio: true,
        transcript:
          transcript.slice(0, 500) ||
          "(no speech — music/ambient audio present)",
        audioQuality: audioResult.quality || "unknown",
        audioNotes:
          audioResult.notes ||
          "Audio track detected — no speech but music or ambient sound present.",
      };

      console.log(
        `  ✓ Audio analysis complete — quality: ${audioAnalysis.audioQuality}`,
      );
      console.log(`  ✓ Transcript: "${transcript.slice(0, 100)}..."`);
    } catch (e) {
      console.error("  ⚠️ Audio analysis failed:", e);
      audioAnalysis.audioNotes = "Audio track detected but analysis failed.";
    }
  }

  // ── Replicate Audio Intelligence (real listening) ──
  let audioIntelligence: AudioIntelligence | null = null;
  if (audioData?.hasAudio && audioData.audioBase64 && replicate) {
    try {
      audioIntelligence = await classifyMusicFromVideo(
        audioData.audioBase64,
        "audio/mpeg",
        replicate,
      );
    } catch (e) {
      console.error(
        "Replicate audio intelligence failed, continuing without:",
        e,
      );
    }
  }

  const descriptionWithAudio = audioAnalysis.hasAudio
    ? `${description}\n\nAUDIO ANALYSIS:\n- Audio type: present (${audioAnalysis.transcript ? "with speech" : "music/ambient, no speech"})\n- Quality: ${audioAnalysis.audioQuality}\n- ${audioAnalysis.audioNotes}${audioAnalysis.transcript && audioAnalysis.transcript !== "(no speech — music/ambient audio present)" ? `\n- Transcript preview: "${audioAnalysis.transcript.slice(0, 200)}"` : ""}`
    : `${description}\n\nAUDIO: No audio track detected in file.`;

  // Enrich with Replicate data for GPT prompts
  const descriptionWithFullAudio = audioIntelligence
    ? `${descriptionWithAudio}\n\nREPLICATE AUDIO INTELLIGENCE (from actual audio signal processing — real listening, not guessing):
- Genres: ${audioIntelligence.genres.map((g) => `${g.genre} (${g.confidence}%)`).join(", ") || "none detected"}
- Moods: ${audioIntelligence.moods.map((m) => `${m.mood} (${m.confidence}%)`).join(", ") || "none detected"}
- Instruments: ${audioIntelligence.instruments.join(", ") || "none detected"}
- BPM: ${audioIntelligence.bpm || "unknown"}
- Key: ${audioIntelligence.key || "unknown"}
- Vocal: ${audioIntelligence.isVocal ? "yes" : "instrumental"}
- Danceability: ${audioIntelligence.danceability}/1.0
- Engagement: ${audioIntelligence.engagement}/1.0
- Song sections: ${audioIntelligence.structure.length} detected`
    : descriptionWithAudio;

  // ── Call 2: 6-Axis Scoring ──
 const { scores, overall, verdict } = await scoreVideoAxes(
  frames,
  descriptionWithFullAudio,
  creatorContext,
  knowledgeTier,
);
  // ── Call 3: Coaching + Pricing ──
const { roadmap, pricing, painPoint, honestPricing } =
  await generateCoachingAndPricing(
    descriptionWithFullAudio,
    scores,
    overall,
    creatorContext,
    knowledgeTier,
  );
  // ── Call 2.5 equivalent: Alignment + Edits ──
const { realAlignment, exactEdits, fastestPath } =
  await generateAlignmentAndEdits(
    descriptionWithFullAudio,
    scores,
    overall,
    creatorContext,
    knowledgeTier,
  );
  return {
    visualDescription: description,
    evidenceUsed: evidence,
    audioAnalysis,
    readinessScores: scores,
    overallReadiness: overall,
    alignmentVerdict: verdict,
    coachingRoadmap: roadmap,
    pricingTiers: (verdict === "monetize-now" || verdict === "monetize-with-fixes") ? pricing : [],
    topPainPoint: painPoint,
    frameCount: frames.length,
    sampledTimestamps: frames.map((f) => f.timestamp),
    durationSeconds,
    model: DECISION_LAYER_PRIMARY_MODEL,
    whatISaw,
    whatYouToldMe: {
      goal: creatorContext?.goal || "not specified",
      pain: creatorContext?.blocker || "not specified",
      constraints: creatorContext?.timeConstraint || "not specified",
      buyerType: creatorContext?.buyer || "not specified",
    },
    realAlignment,
  myRecommendation: {
  verdict:
    verdict === "monetize-now" ? "Ready"
    : verdict === "monetize-with-fixes" ? "Refine"
    : verdict === "portfolio-only" ? "Refine"
    : verdict === "hold-as-exploration" ? "Explore"
    : "Flag",
reasoning: `${painPoint} Overall readiness: ${overall}%.`,
    },
    exactEdits,
    honestPricing,
    fastestPath,
    evidenceDetails: {
      fileCount: 1,
      resolution: "auto-detected",
      framesAnalyzed: frames.length,
      modelUsed: DECISION_LAYER_PRIMARY_MODEL,
      analysisTimestamp: new Date().toISOString(),
      signalsSummary: `${frames.length} frames from ${durationSeconds.toFixed(1)}s video`,
    },
 audioIntelligence: audioIntelligence || undefined,
    closingQuestion: "Which of the quick wins do you want to tackle first?",
    fallbackEvaluation: {
      vision_evidence: description,
      decision: verdict === "monetize-now" ? "APPROVE"
        : verdict === "monetize-with-fixes" ? "FLAG"
        : verdict === "portfolio-only" ? "FLAG"
        : verdict === "hold-as-exploration" ? "REJECT"
        : "NEEDS_REVIEW",
      confidence: overall,
      scores: {
        technical_quality: scores.find(s => s.axis === "Technical Quality")?.score || 0,
        market_fit: scores.find(s => s.axis === "Audience Fit")?.score || 0,
        policy_risk: 0,
        originality: scores.find(s => s.axis === "Differentiation")?.score || 0,
      },
      reasons: scores.filter(s => s.score >= 60).map(s => `${s.axis}: ${s.note}`),
      recommended_fixes: exactEdits.map(e => e.edit),
      marketplace_recommendation: {
        should_list: verdict === "monetize-now" || verdict === "monetize-with-fixes",
        category: creatorContext?.mediaType || "Video",
        title: `${creatorContext?.goal || "Creative"} Video — ${overall}% Market Ready`,
        tags: [creatorContext?.buyer || "general", creatorContext?.goal || "creative", "video"],
        price_range: pricing[0]?.range || "unknown",
        next_step: verdict === "monetize-now"
          ? "List immediately on Pond5 or Shutterstock"
          : roadmap[0]?.actions[0] || "Complete quick wins first",
      },
    },
  };
}
