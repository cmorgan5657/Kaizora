import { disableGeminiFallback, GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import { logReplicateError, maskSecret } from "@/lib/replicateDebug";
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
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

const ML_GUARDRAIL = `
ML VERIFICATION — NON-NEGOTIABLE:
All scores and descriptions MUST be grounded in the ML data provided.
Do NOT fabricate genre, mood, BPM, or instrument data.
If ML data is empty or missing → flag as NEEDS_REVIEW with confidence 0.
Generic descriptions ("nice music", "good track") = automatic NEEDS_REVIEW.
No approval without explicit ML evidence.`;
import Replicate from "replicate";
import { supabase } from "@/lib/supabaseClient";

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
          // keep trying
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

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface CreatorContext {
  goal?: string;
  buyer?: string;
  mediaType?: string;
  timeConstraint?: string;
  qualityLevel?: string;
  blocker?: string;
}

interface ReadinessAxis {
  score: number;
  justification: string;
}

interface ReadinessScore {
  sonicClarity: ReadinessAxis;
  productionQuality: ReadinessAxis;
  musicalIdentity: ReadinessAxis;
  audienceFit: ReadinessAxis;
  commercialViability: ReadinessAxis;
  packagingReadiness: ReadinessAxis;
  total: number;
}

interface CoachingPhase {
  title: string;
  timeEstimate: string;
  steps: string[];
}

interface CoachingRoadmap {
  phase1: CoachingPhase;
  phase2: CoachingPhase;
  phase3: CoachingPhase;
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

interface WhatIHeard {
  instruments: string;
  rhythm: string;
  tonality: string;
  production: string;
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

// Replicate model outputs
interface MusicClassification {
  genres: { genre: string; confidence: number }[];
  moods: { mood: string; confidence: number }[];
  instruments: string[];
  isVocal: boolean;
  vocalGender: string;
  danceability: number;
  engagement: number;
  approachability: number;
}

interface MusicStructure {
  bpm: number;
  key: string;
  structure: { section: string; startTime: number; endTime: number }[];
  downbeats: number[];
  hasDemux: boolean;
}

export interface AudioAnalysisResult {
  // Core analysis
  whatIHeard: WhatIHeard;
  audioDescription: string;

  // Replicate raw data
  musicClassification: MusicClassification;
  musicStructure: MusicStructure;

  // Speech
  hasSpeech: boolean;
  transcript: string;

  // 6-Axis Readiness (audio-specific)
  readinessScore: ReadinessScore;
  readinessScores: { axis: string; score: number; note: string }[];
  overallReadiness: number;
  alignmentVerdict: "monetize-now" | "monetize-with-fixes" | "portfolio-only" | "hold-as-exploration" | "not-market-ready";

  // Coaching + Pricing
  coachingRoadmap: { title: string; timeEstimate: string; actions: string[] }[];
  tieredPricing: TieredPricing;
  pricingTiers: {
    tier: string;
    range: string;
    justification: string;
    includes: string[];
  }[];
  topPainPoint: string;

  // Phase 3 fields
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

  // Metadata
  durationSeconds: number;
  model: string;
  visualDescription: string;
  evidenceUsed: string[];
}

// ═══════════════════════════════════════════════════════
// REPLICATE: Music Classification
// ═══════════════════════════════════════════════════════

async function classifyMusic(
  audioUrl: string,
  replicate: Replicate,
): Promise<MusicClassification> {
  console.log("  → Replicate: Music classifiers (genre, mood, instruments)...");

  try {
    const output: any = await replicate.run(
      "mtg/effnet-discogs:1532dd069fb4f0e27c6833e28815f6b8c194dfec76fd9cd73460540fd720ffe1",
      {
        input: {
          audio: audioUrl,
          top_n: 10,
          output_format: "JSON",
        },
      },
    );

    // effnet-discogs returns a FileOutput — fetch the JSON file
    const fileUrl = (output as any).url();
    const res = await fetch(fileUrl);
    const result = await res.json();

    // Parse genres (format: "Genre---Subgenre": probability)
    const genres = Object.entries(result)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 10)
      .map(([key, value]: [string, any]) => ({
        genre: key.replace("---", " → "),
        confidence: Math.round(value * 100),
      }));

    console.log(`  ✓ Music classification done — ${genres.length} genres`);

    return {
      genres,
      moods: [],
      instruments: [],
      isVocal: false,
      vocalGender: "unknown",
      danceability: 0,
      engagement: 0,
      approachability: 0,
    };
  } catch (error) {
    logReplicateError("  ⚠️ Music classification failed", error, {
      stage: "classifyMusic",
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
    return {
      genres: [],
      moods: [],
      instruments: [],
      isVocal: false,
      vocalGender: "unknown",
      danceability: 0,
      engagement: 0,
      approachability: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════
// REPLICATE: Music Structure Analysis
// ═══════════════════════════════════════════════════════

async function analyzeStructure(
  audioUrl: string,
  replicate: Replicate,
): Promise<MusicStructure> {
  console.log(
    "  → Replicate: All-in-one structure analysis (BPM, key, sections)...",
  );

  try {
    const output: any = await replicate.run(
      "cwalo/all-in-one-music-structure-analysis:6deeba047db17da69e9826c0285cd137cd2a81af05eb44ff496b7acd69b3a383",
      {
        input: {
          music_input: audioUrl,
          visualize: false,
          demux: false,
        },
      },
    );

    // cwalo returns array of FileOutputs — fetch first JSON file
    const files = output as any[];
    const fileUrl = files[0].url();
    const res = await fetch(fileUrl);
    const result = await res.json();

    const bpm = result.bpm || result.tempo || 0;
    const key = result.key || "unknown";

    const structure = (result.segments || result.sections || []).map(
      (s: any) => ({
        section: s.label || s.section || "unknown",
        startTime: s.start || 0,
        endTime: s.end || 0,
      }),
    );

    const downbeats = result.downbeats || result.beats || [];

    console.log(
      `  ✓ Structure analysis done — BPM: ${bpm}, Key: ${key}, ${structure.length} sections`,
    );

    return {
      bpm: Math.round(bpm * 10) / 10,
      key,
      structure,
      downbeats: Array.isArray(downbeats) ? downbeats.slice(0, 50) : [],
      hasDemux: false,
    };
  } catch (error) {
    logReplicateError("  ⚠️ Structure analysis failed", error, {
      stage: "analyzeStructure",
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
    return {
      bpm: 0,
      key: "unknown",
      structure: [],
      downbeats: [],
      hasDemux: false,
    };
  }
}

// ═══════════════════════════════════════════════════════
// WHISPER: Speech Transcription
// ═══════════════════════════════════════════════════════

async function transcribeSpeech(
  audioFile: File,
): Promise<{ hasSpeech: boolean; transcript: string }> {
  console.log("  → Gemini: Speech transcription...");

  try {
    const bytes = await audioFile.arrayBuffer();
    const b64 = Buffer.from(bytes).toString("base64");
    const whisperModel = genai.getGenerativeModel({
      model: DECISION_LAYER_PRIMARY_MODEL,
    });
    const whisperResult = await whisperModel.generateContent(
      [
        {
          text: "Transcribe any speech in this audio. If no speech, return empty string only.",
        },
        { inlineData: { mimeType: audioFile.type as any, data: b64 } },
      ],
      DECISION_LAYER_REQUEST_OPTIONS,
    );
    logGeminiUsage(whisperResult, { feature: "decision_layer_audio", model: DECISION_LAYER_PRIMARY_MODEL });
    const transcript = whisperResult.response.text().trim();
    const hasSpeech = transcript.trim().length > 10;

  console.log(
  `  ✓ Gemini transcription done — ${hasSpeech ? "speech detected" : "no speech"} (${transcript.length} chars)`,
);

    return {
      hasSpeech,
      transcript: transcript.slice(0, 1000),
    };
  } catch (error) {
    console.error("  ⚠️ Whisper transcription failed:", error);
    return { hasSpeech: false, transcript: "" };
  }
}

// ═══════════════════════════════════════════════════════
// GPT-4o CALL 1: Audio Description
// ═══════════════════════════════════════════════════════

async function describeAudio(
  classification: MusicClassification,
  structure: MusicStructure,
  speech: { hasSpeech: boolean; transcript: string },
  creatorContext?: CreatorContext,
  knowledgeTier?: string,
): Promise<{ description: string; whatIHeard: WhatIHeard }> {
  console.log("  → GPT-4o Call 1: Audio description from ML data...");

  const contextSection = creatorContext
    ? `\nCREATOR CONTEXT:
- Goal: ${creatorContext.goal || "unknown"}
- Content Outcome: ${creatorContext.buyer || "unknown"}
- Time Available: ${creatorContext.timeConstraint || "unknown"}
- Quality Aim: ${creatorContext.qualityLevel || "unknown"}
- Biggest Blocker: ${creatorContext.blocker || "none specified"}`
    : "";

  const mlDataBlock = `
MACHINE LEARNING ANALYSIS (from actual audio signal processing — this is what the audio ACTUALLY sounds like):

GENRES DETECTED (by confidence):
${classification.genres.map((g) => `- ${g.genre}: ${g.confidence}%`).join("\n") || "- No genres detected"}

MOODS DETECTED:
${classification.moods.map((m) => `- ${m.mood}: ${m.confidence}%`).join("\n") || "- No moods detected"}

INSTRUMENTS DETECTED:
${classification.instruments.length > 0 ? classification.instruments.join(", ") : "None identified"}

VOCAL: ${classification.isVocal ? `Yes (${classification.vocalGender})` : "Instrumental / No vocals"}
DANCEABILITY: ${classification.danceability}/1.0
ENGAGEMENT: ${classification.engagement}/1.0
APPROACHABILITY: ${classification.approachability}/1.0

STRUCTURE:
- BPM: ${structure.bpm || "unknown"}
- Key: ${structure.key || "unknown"}
- Sections: ${structure.structure.length > 0 ? structure.structure.map((s) => `${s.section} (${s.startTime.toFixed(1)}s-${s.endTime.toFixed(1)}s)`).join(", ") : "No sections detected"}

SPEECH: ${speech.hasSpeech ? `Detected — "${speech.transcript.slice(0, 200)}"` : "No speech detected"}
`;

  const prompt = `
${DECISION_LAYER_PERSONA}

${ML_GUARDRAIL}

Creator knowledge tier: ${knowledgeTier}

You have received detailed machine learning analysis of an audio file. The ML models actually LISTENED to the audio — the data below is real, not guessed.


${mlDataBlock}
${contextSection}

Based on this ML data, create:

1. A rich 6-8 sentence description of what this audio sounds like, as if you're describing it to someone who hasn't heard it. Reference the actual genres, instruments, BPM, mood, and structure detected.

2. Structured breakdown in 5 categories.

Respond in this EXACT JSON:
{
  "description": "<6-8 sentences describing the audio in vivid detail based on the ML data. Reference specific genres, instruments, BPM, moods. Be specific — don't say 'nice music', say exactly what the ML detected.>",
  "whatIHeard": {
    "instruments": "<List every instrument detected plus inferred elements from genre/style. e.g. 'Acoustic guitar, soft piano, light percussion, ambient synth pad'>",
    "rhythm": "<BPM, time signature feel, groove characteristics. e.g. '120 BPM, steady 4/4 pattern, laid-back groove with swung hi-hats'>",
    "tonality": "<Key, harmonic character, chord mood. e.g. 'C minor, melancholic progression, minor-key emotional movement'>",
    "production": "<Mix quality assessment based on engagement/approachability scores and genre standards. e.g. 'Clean mix with wide stereo field, well-balanced low end, professional mastering'>",
    "mood": "<Combine detected moods into a vivid atmosphere description. e.g. 'Contemplative and cinematic, slowly building from intimate to expansive'>"
  }
}`;

  const descModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 4000,
      temperature: 1.0,
      responseMimeType: "application/json",
    },
  });
  const descResult = await descModel.generateContent(
    [{ text: prompt }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(descResult, { feature: "decision_layer_audio", model: DECISION_LAYER_PRIMARY_MODEL });
  const result = tryParseJsonObject(descResult.response.text()) || {};
  console.log("  ✓ Call 1 complete — audio description done");

  return {
    description:
      result.description ||
      "Audio analysis complete but description generation failed.",
    whatIHeard: result.whatIHeard || {
      instruments: classification.instruments.join(", ") || "See ML analysis",
      rhythm: structure.bpm ? `${structure.bpm} BPM` : "Unknown tempo",
      tonality: structure.key || "Unknown key",
      production: "See engagement scores",
      mood:
        classification.moods.map((m) => m.mood).join(", ") ||
        "See mood analysis",
    },
  };
}

// ═══════════════════════════════════════════════════════
// GPT-4o CALL 2: 6-Axis Audio Scoring
// ═══════════════════════════════════════════════════════
async function scoreAudioAxes(
  description: string,
  classification: MusicClassification,
  structure: MusicStructure,
  speech: { hasSpeech: boolean; transcript: string },
  creatorContext?: CreatorContext,
  knowledgeTier?: string,
): Promise<ReadinessScore> {
  console.log("  → GPT-4o Call 2: 6-Axis Audio Scoring...");

  const contextSection = creatorContext
    ? `\nCREATOR CONTEXT:
- Goal: ${creatorContext.goal || "unknown"}
- Content Outcome: ${creatorContext.buyer || "unknown"}
- Time Available: ${creatorContext.timeConstraint || "unknown"}
- Quality Aim: ${creatorContext.qualityLevel || "unknown"}
- Biggest Blocker: ${creatorContext.blocker || "none specified"}`
    : "";

  const prompt = `${DECISION_LAYER_PERSONA}

${ML_GUARDRAIL}

Creator knowledge tier: ${knowledgeTier}

Score this audio on 6 axes based on ML analysis data. Calibrate scores to the creator's tier — a HOBBYIST at 70% is performing well; a COMMERCIAL creator at 70% needs work.


AUDIO DESCRIPTION:
${description}

ML DATA:
- Genres: ${classification.genres.map((g) => `${g.genre} (${g.confidence}%)`).join(", ")}
- Moods: ${classification.moods.map((m) => `${m.mood} (${m.confidence}%)`).join(", ")}
- Instruments: ${classification.instruments.join(", ") || "none detected"}
- Vocal: ${classification.isVocal ? "yes" : "instrumental"}
- BPM: ${structure.bpm || "unknown"}
- Key: ${structure.key || "unknown"}
- Structure sections: ${structure.structure.length}
- Danceability: ${classification.danceability}/1.0
- Engagement: ${classification.engagement}/1.0
- Speech: ${speech.hasSpeech ? "present" : "none"}
${contextSection}

CROSS-REFERENCING RULE: Each justification MUST explicitly reference the creator's stated context. Use phrases like "You said your goal is [goal]...", "For your target buyer ([buyer])...". Never generic — always name WHO, WHY, and how it connects.

Score each axis 1-5:

1. **Sonic Clarity** — Is the mix clean? Frequencies balanced? No muddiness, clipping, distortion? Based on engagement and approachability scores.
2. **Production Quality** — Professional mastering level? Proper loudness? Dynamic range? Based on genre standards.
3. **Musical Identity** — Is the style clear and intentional? Genre-consistent? Distinctive sound? Based on genre confidence scores.
4. **Audience Fit** — Does this match what the target buyer (${creatorContext?.buyer || "general"}) expects? Based on mood + genre + danceability.
5. **Commercial Viability** — Would someone license/buy this? Stock library ready? Based on structure, length, engagement.
6. **Packaging Readiness** — Proper format, tagged, correct length, loop-ready if needed? Based on structure analysis.

Respond in this EXACT JSON:
{
  "sonicClarity": { "score": <1-5>, "justification": "<2-3 sentences with specific references to ML data>" },
  "productionQuality": { "score": <1-5>, "justification": "<2-3 sentences>" },
  "musicalIdentity": { "score": <1-5>, "justification": "<2-3 sentences>" },
  "audienceFit": { "score": <1-5>, "justification": "<2-3 sentences>" },
  "commercialViability": { "score": <1-5>, "justification": "<2-3 sentences>" },
  "packagingReadiness": { "score": <1-5>, "justification": "<2-3 sentences>" }
}`;

  const scoreModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 4000,
      temperature: 1.0,
      responseMimeType: "application/json",
    },
  });
  const scoreResult = await scoreModel.generateContent(
    [{ text: prompt }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(scoreResult, { feature: "decision_layer_audio", model: DECISION_LAYER_PRIMARY_MODEL });
  const axisScores = tryParseJsonObject(scoreResult.response.text()) || {};
  Object.keys(axisScores).forEach((key) => {
    if (axisScores[key]?.score) {
      axisScores[key].score = Math.round((axisScores[key].score / 5) * 100);
    }
  });
  console.log("  ✓ Call 2 complete — 6-axis audio scoring done");

  const readinessScore: ReadinessScore = {
    sonicClarity: axisScores.sonicClarity || {
      score: 3,
      justification: "Unable to evaluate",
    },
    productionQuality: axisScores.productionQuality || {
      score: 3,
      justification: "Unable to evaluate",
    },
    musicalIdentity: axisScores.musicalIdentity || {
      score: 3,
      justification: "Unable to evaluate",
    },
    audienceFit: axisScores.audienceFit || {
      score: 3,
      justification: "Unable to evaluate",
    },
    commercialViability: axisScores.commercialViability || {
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
    readinessScore.sonicClarity.score +
    readinessScore.productionQuality.score +
    readinessScore.musicalIdentity.score +
    readinessScore.audienceFit.score +
    readinessScore.commercialViability.score +
    readinessScore.packagingReadiness.score;
  readinessScore.total = Math.round((rawTotal / 600) * 100);

  return readinessScore;
}

// ═══════════════════════════════════════════════════════
// GPT-4o CALL 2.5: Alignment + Edits + Path
// ═══════════════════════════════════════════════════════

async function generateAudioAlignmentAndEdits(
  description: string,
  readinessScore: ReadinessScore,
  classification: MusicClassification,
  structure: MusicStructure,
  creatorContext?: CreatorContext,
  knowledgeTier?: string,
): Promise<{
  realAlignment: RealAlignment;
  exactEdits: ExactEdit[];
  fastestPath: FastestPathStep[];
}> {
  console.log("  → GPT-4o Call 2.5: Alignment + Edits + Path...");

  const contextSection = creatorContext
    ? `\nCREATOR CONTEXT:
- Goal: ${creatorContext.goal || "unknown"}
- Content Outcome: ${creatorContext.buyer || "unknown"}
- Time Available: ${creatorContext.timeConstraint || "unknown"}
- Quality Aim: ${creatorContext.qualityLevel || "unknown"}
- Biggest Blocker: ${creatorContext.blocker || "none specified"}`
    : "";

  const scoresText = [
   `Sonic Clarity: ${readinessScore.sonicClarity.score}% — ${readinessScore.sonicClarity.justification}`,
`Production Quality: ${readinessScore.productionQuality.score}% — ${readinessScore.productionQuality.justification}`,
`Musical Identity: ${readinessScore.musicalIdentity.score}% — ${readinessScore.musicalIdentity.justification}`,
`Audience Fit: ${readinessScore.audienceFit.score}% — ${readinessScore.audienceFit.justification}`,
`Commercial Viability: ${readinessScore.commercialViability.score}% — ${readinessScore.commercialViability.justification}`,
`Packaging Readiness: ${readinessScore.packagingReadiness.score}% — ${readinessScore.packagingReadiness.justification}`,
  ].join("\n");

  const prompt = `${DECISION_LAYER_PERSONA}

${ML_GUARDRAIL}

Creator knowledge tier: ${knowledgeTier}

AUDIO DESCRIPTION:
${description}

ML DATA:
- Genres: ${classification.genres.map((g) => `${g.genre} (${g.confidence}%)`).join(", ")}
- BPM: ${structure.bpm} | Key: ${structure.key}
- Sections: ${structure.structure.length} | Instruments: ${classification.instruments.join(", ")}

SCORES:
${scoresText}
Total: ${readinessScore.total}%
${contextSection}

Generate:

1. **Real Alignment** — Score 1-10, gap summary, blind spots
2. **Exact Edits** — 3-5 audio-specific edits (EQ, compression, arrangement, mixing, mastering)
3. **Fastest Path** — 3-5 steps with time estimates

RESPOND WITH VALID JSON ONLY:
{
  "realAlignment": {
    "score": <1-10>,
    "gapSummary": "<2-3 sentences>",
    "blindSpots": ["<blind spot 1>", "<blind spot 2>", "<blind spot 3>"]
  },
  "exactEdits": [
    { "edit": "<specific audio edit>", "why": "<why — reference a score>", "effort": "Quick" },
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

  const alignModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 4000,
      temperature: 1.0,
      responseMimeType: "application/json",
    },
  });
  const alignResult = await alignModel.generateContent(
    [{ text: prompt }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(alignResult, { feature: "decision_layer_audio", model: DECISION_LAYER_PRIMARY_MODEL });
  const parsed = tryParseJsonObject(alignResult.response.text()) || {};
if (parsed.realAlignment?.score) {
  parsed.realAlignment.score = Math.round((parsed.realAlignment.score / 10) * 100);
}
console.log("  ✓ Call 2.5 complete — alignment + edits + path done");

  return {
    realAlignment: parsed.realAlignment || {
      score: readinessScore.total,
      gapSummary: "Unable to assess alignment gap.",
      blindSpots: [],
    },
    exactEdits: parsed.exactEdits || [],
    fastestPath: parsed.fastestPath || [],
  };
}

// ═══════════════════════════════════════════════════════
// GPT-4o CALL 3: Coaching + Pricing
// ═══════════════════════════════════════════════════════

async function generateAudioCoachingAndPricing(
  description: string,
  readinessScore: ReadinessScore,
  classification: MusicClassification,
  structure: MusicStructure,
  creatorContext?: CreatorContext,
  knowledgeTier?: string,
): Promise<{
  coachingRoadmap: CoachingRoadmap;
  tieredPricing: TieredPricing;
  honestPricing: HonestPricing;
  topPainPoint: string;
}> {
  console.log("  → GPT-4o Call 3: Audio coaching + pricing...");

  const contextSection = creatorContext
    ? `\nCREATOR CONTEXT:
- Goal: ${creatorContext.goal || "unknown"}
- Content Outcome: ${creatorContext.buyer || "unknown"}
- Time Available: ${creatorContext.timeConstraint || "unknown"}
- Quality Aim: ${creatorContext.qualityLevel || "unknown"}
- Biggest Blocker: ${creatorContext.blocker || "none specified"}`
    : "";

  const lowestAxis = [
    { name: "Sonic Clarity", ...readinessScore.sonicClarity },
    { name: "Production Quality", ...readinessScore.productionQuality },
    { name: "Musical Identity", ...readinessScore.musicalIdentity },
    { name: "Audience Fit", ...readinessScore.audienceFit },
    { name: "Commercial Viability", ...readinessScore.commercialViability },
    { name: "Packaging Readiness", ...readinessScore.packagingReadiness },
  ].sort((a, b) => a.score - b.score)[0];

  const prompt = `
${DECISION_LAYER_PERSONA}

${ML_GUARDRAIL}

Creator knowledge tier: ${knowledgeTier}

Steps must be SPECIFIC — name exact tools, exact actions, exact timestamps. Generic advice like "normalize audio" is forbidden.

AUDIO DESCRIPTION:
${description}

ML DATA:
- Genres: ${classification.genres.map((g) => `${g.genre} (${g.confidence}%)`).join(", ")}
- BPM: ${structure.bpm} | Key: ${structure.key}
- Danceability: ${classification.danceability} | Engagement: ${classification.engagement}
- Vocal: ${classification.isVocal ? "yes" : "instrumental"}
- Weakest axis: ${lowestAxis.name} (${lowestAxis.score}%)

READINESS: ${readinessScore.total}%
${contextSection}

Create coaching roadmap, tiered pricing, honest pricing, and pain point.

AUDIO-SPECIFIC COACHING RULES:
- Phase 1 Quick Wins (30 min): EQ fixes, volume normalization, fade in/out, trim silence, basic compression
- Phase 2 Level Up (2 hrs): Re-mix, add/improve arrangement, sound design, better mastering, stem cleanup
- Phase 3 Market Ready (ongoing): Build catalog, develop sonic brand, create variations/edits, multi-format export
- Time available: ${creatorContext?.timeConstraint || "unknown"}. Scale coaching to their time.

AUDIO PRICING RULES:
- Stock music/SFX: Starter $5-25, Standard $25-75, Premium $75-500+
- Custom compositions: Starter $50-150, Standard $150-500, Premium $500-2000+
- Podcast/voiceover: Starter $25-75, Standard $75-200, Premium $200-500+
- Always reference what similar audio sells for on AudioJungle, Pond5, Epidemic Sound

Respond in EXACT JSON:
{
  "coachingRoadmap": {
    "phase1": { "title": "Quick Wins", "timeEstimate": "30 minutes", "steps": ["<step>", "<step>", "<step>"] },
    "phase2": { "title": "Level Up", "timeEstimate": "2 hours", "steps": ["<step>", "<step>", "<step>"] },
    "phase3": { "title": "Market Ready", "timeEstimate": "Ongoing", "steps": ["<step>", "<step>", "<step>"] }
  },
  "tieredPricing": {
    "starter": { "label": "Starter", "range": "<e.g. $10-25>", "includes": ["<what>", "<license>"] },
    "standard": { "label": "Standard", "range": "<e.g. $30-75>", "includes": ["<what>", "<license>"] },
    "premium": { "label": "Premium", "range": "<e.g. $100-300+>", "includes": ["<what>", "<license>"] },
    "upgradeJustification": "<1-2 sentences>"
  },
  "honestPricing": {
    "low": <number>,
    "high": <number>,
    "currency": "USD",
    "reasoning": "<2-3 sentences referencing audio quality and market>",
    "comparable": "<What similar audio sells for — name platform and price>"
  },
 "painPoint": "MUST start with 'You said [blocker] is your biggest challenge — ' then connect to actual audio quality.",
  "closingQuestion": "<One specific question to ask the creator about their next step — e.g. 'Which EQ fix do you want to tackle first?'>"
}`;

  const coachModel = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 4000,
      temperature: 1.0,
      responseMimeType: "application/json",
    },
  });
  const coachResult = await coachModel.generateContent(
    [{ text: prompt }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(coachResult, { feature: "decision_layer_audio", model: DECISION_LAYER_PRIMARY_MODEL });
  const data = tryParseJsonObject(coachResult.response.text()) || {};
  console.log("  ✓ Call 3 complete — audio coaching + pricing done");

  return {
    coachingRoadmap: data.coachingRoadmap || {
      phase1: {
        title: "Quick Wins",
        timeEstimate: "30 minutes",
        steps: [
          "Normalize audio levels",
          "Add proper fade in/out",
          "Trim silence",
        ],
      },
      phase2: {
        title: "Level Up",
        timeEstimate: "2 hours",
        steps: [
          "Improve EQ balance",
          "Add compression/limiting",
          "Enhance stereo width",
        ],
      },
      phase3: {
        title: "Market Ready",
        timeEstimate: "Ongoing",
        steps: [
          "Build audio catalog",
          "Create format variations",
          "Develop sonic brand",
        ],
      },
    },
    tieredPricing: data.tieredPricing || {
      starter: {
        label: "Starter",
        range: "$10-25",
        includes: ["Single track", "Standard license"],
      },
      standard: {
        label: "Standard",
        range: "$30-75",
        includes: ["Track + stems", "Commercial license"],
      },
      premium: {
        label: "Premium",
        range: "$100-300+",
        includes: ["Full package", "Exclusive license"],
      },
      upgradeJustification:
        "Better production quality and proper mastering justifies premium pricing.",
    },
    honestPricing: data.honestPricing || {
      low: 10,
      high: 100,
      currency: "USD",
      reasoning: "Based on current audio quality and market comparables.",
      comparable: "Similar tracks on AudioJungle range $10-100.",
    },
    topPainPoint:
      data.painPoint ||
      `Your weakest area is ${lowestAxis.name} (${lowestAxis.score}%): ${lowestAxis.justification}`,
  };
}

// ═══════════════════════════════════════════════════════
// MAIN: analyzeAudio
// ═══════════════════════════════════════════════════════

export async function analyzeAudio(
  audioFile: File,
  audioUrl: string,
  replicate: Replicate,
  creatorContext?: CreatorContext,
  durationSeconds?: number,
): Promise<AudioAnalysisResult> {
  console.log("🔊 Starting KAIZORA Audio Intelligence...");
  console.log(
    `   File: ${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(2)}MB)`,
  );
const knowledgeTier =
  creatorContext?.qualityLevel === "professional" ? "STUDIO/COMMERCIAL"
  : creatorContext?.qualityLevel === "intermediate" ? "INDEPENDENT"
  : "HOBBYIST";
  // ═══ PARALLEL: Run all 3 ML models simultaneously ═══
  console.log("  → Running 3 models in parallel...");
  const [classification, structure, speech] = await Promise.all([
    classifyMusic(audioUrl, replicate),
    analyzeStructure(audioUrl, replicate),
    transcribeSpeech(audioFile),
  ]);

  console.log("  ✓ All 3 ML models complete");
if (classification.genres.length === 0 && structure.bpm === 0) {
  throw new Error("NEEDS_REVIEW: ML models returned no data — confidence 0. Re-upload audio in MP3 or WAV format.");
}
  // ═══ GPT-4o Call 1: Description ═══
  const { description, whatIHeard } = await describeAudio(
    classification,
    structure,
    speech,
    creatorContext,
    knowledgeTier
  );

  // ═══ GPT-4o Call 2: 6-Axis Scoring ═══
  const readinessScore = await scoreAudioAxes(
    description,
    classification,
    structure,
    speech,
    creatorContext,
    knowledgeTier
  );

  // ═══ GPT-4o Call 2.5: Alignment + Edits ═══
  const { realAlignment, exactEdits, fastestPath } =
    await generateAudioAlignmentAndEdits(
      description,
      readinessScore,
      classification,
      structure,
      creatorContext,
      knowledgeTier
    );

  // ═══ GPT-4o Call 3: Coaching + Pricing ═══
  const { coachingRoadmap, tieredPricing, honestPricing, topPainPoint } =
    await generateAudioCoachingAndPricing(
      description,
      readinessScore,
      classification,
      structure,
      creatorContext,
      knowledgeTier
    );

  // ═══ Build result ═══
  const overallReadiness = readinessScore.total;
const alignmentVerdict: "monetize-now" | "monetize-with-fixes" | "portfolio-only" | "hold-as-exploration" | "not-market-ready" =
  readinessScore.total >= 80 ? "monetize-now"
  : readinessScore.total >= 65 ? "monetize-with-fixes"
  : readinessScore.total >= 53 ? "portfolio-only"
  : readinessScore.total >= 35 ? "hold-as-exploration"
  : "not-market-ready";

  const readinessScores = [
    {
      axis: "Sonic Clarity",
      score: readinessScore.sonicClarity.score,
      note: readinessScore.sonicClarity.justification,
    },
    {
      axis: "Production Quality",
      score: readinessScore.productionQuality.score,
      note: readinessScore.productionQuality.justification,
    },
    {
      axis: "Musical Identity",
      score: readinessScore.musicalIdentity.score,
      note: readinessScore.musicalIdentity.justification,
    },
    {
      axis: "Audience Fit",
      score: readinessScore.audienceFit.score,
      note: readinessScore.audienceFit.justification,
    },
    {
      axis: "Commercial Viability",
      score: readinessScore.commercialViability.score,
      note: readinessScore.commercialViability.justification,
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

  const blockerRef = creatorContext?.blocker
    ? `You said "${creatorContext.blocker}" is your biggest challenge`
    : "Your main gap";
  const goalRef = creatorContext?.goal ? ` (goal: ${creatorContext.goal})` : "";
  const lowestAxis = readinessScores.reduce(
    (min, s) => (s.score < min.score ? s : min),
    readinessScores[0],
  );
  const painPoint =
    topPainPoint ||
    `${blockerRef}${goalRef} — your weakest area is ${lowestAxis.axis} (${lowestAxis.score}%): ${lowestAxis.note}`;

  console.log("  ✓ Audio Intelligence Complete!");
  console.log(
    `    Readiness: ${readinessScore.total}% | Verdict: ${alignmentVerdict} | BPM: ${structure.bpm} | Key: ${structure.key}`,
  );

  return {
    whatIHeard,
    audioDescription: description,
    musicClassification: classification,
    musicStructure: structure,
    hasSpeech: speech.hasSpeech,
    transcript: speech.transcript,
    readinessScore,
    readinessScores,
    overallReadiness,
    alignmentVerdict,
    coachingRoadmap: coachingRoadmapArray,
    tieredPricing,
    pricingTiers,
    topPainPoint: painPoint,
    whatYouToldMe: {
      goal: creatorContext?.goal || "not specified",
      pain: creatorContext?.blocker || "not specified",
      constraints: creatorContext?.timeConstraint || "not specified",
      buyerType: creatorContext?.buyer || "not specified",
    },
    realAlignment,
    myRecommendation: {
     verdict:
  alignmentVerdict === "monetize-now" ? "Ready"
  : alignmentVerdict === "monetize-with-fixes" ? "Refine"
  : alignmentVerdict === "portfolio-only" ? "Refine"
  : alignmentVerdict === "hold-as-exploration" ? "Explore"
  : "Flag",
      reasoning: `${painPoint} Overall readiness: ${overallReadiness}%.`,
    },
    exactEdits,
    honestPricing,
    fastestPath,
    evidenceDetails: {
      fileCount: 1,
      resolution: `${structure.bpm ? structure.bpm + " BPM" : "unknown"} / ${structure.key || "unknown key"}`,
      framesAnalyzed: 0,
      modelUsed: "replicate/mtg + replicate/cwalo + gemini-3.1-pro-preview",
      analysisTimestamp: new Date().toISOString(),
      signalsSummary: `${classification.genres[0]?.genre || "unknown genre"} | ${classification.isVocal ? "vocal" : "instrumental"} | ${structure.structure.length} sections | danceability ${classification.danceability}`,
    },
    durationSeconds: durationSeconds || 0,
    model: "replicate + gemini-3.1-pro-preview",
    visualDescription: description,
   evidenceUsed: [
  `Genres: ${classification.genres.map((g) => g.genre).join(", ")}`,
  `Instruments: ${classification.instruments.join(", ")}`,
  `Structure: ${structure.bpm} BPM, ${structure.key}, ${structure.structure.length} sections`,
],
closingQuestion: (await Promise.resolve(undefined)) || "Which of the quick wins do you want to tackle first?",
fallbackEvaluation: {
  vision_evidence: description,
  decision: alignmentVerdict === "monetize-now" ? "APPROVE"
    : alignmentVerdict === "monetize-with-fixes" ? "FLAG"
    : alignmentVerdict === "portfolio-only" ? "FLAG"
    : alignmentVerdict === "hold-as-exploration" ? "REJECT"
    : "NEEDS_REVIEW",
  confidence: overallReadiness,
  scores: {
    technical_quality: readinessScore.productionQuality.score,
    market_fit: readinessScore.audienceFit.score,
    policy_risk: 0,
    originality: readinessScore.musicalIdentity.score,
  },
  reasons: [
    classification.genres[0]?.genre ? `Top genre: ${classification.genres[0].genre}` : "Genre undetected",
    structure.bpm ? `BPM: ${structure.bpm}` : "Tempo undetected",
  ],
  recommended_fixes: exactEdits.map(e => e.edit),
  marketplace_recommendation: {
    should_list: alignmentVerdict === "monetize-now" || alignmentVerdict === "monetize-with-fixes",
    category: classification.isVocal ? "Vocal Track" : "Instrumental",
    title: `${classification.genres[0]?.genre || "Audio"} Track — ${overallReadiness}% Market Ready`,
    tags: [...classification.genres.slice(0, 3).map(g => g.genre), structure.key || "unknown key"],
    price_range: tieredPricing.starter.range,
    next_step: alignmentVerdict === "monetize-now"
      ? "List immediately on AudioJungle or Pond5"
      : coachingRoadmap.phase1.steps[0] || "Complete quick wins first",
  },
},
  };
}
