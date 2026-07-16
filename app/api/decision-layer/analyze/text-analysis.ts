// app/api/decision-layer/analyze/text-analysis.ts
// KAIZORA Text Intelligence — 3-call Google AI pipeline for written content evaluation
import { disableGeminiFallback, GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { getGoogleAiProviderLabel } from "@/lib/ai/provider";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const genai = getGoogleAiClient();
const DECISION_LAYER_PRIMARY_MODEL = "gemini-3.1-pro-preview";
const DECISION_LAYER_REQUEST_OPTIONS = disableGeminiFallback();
const AI_PROVIDER_LABEL = getGoogleAiProviderLabel();

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
- written content: ebooks, guides, scripts, prompts, blogs, newsletters, courses, templates
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
- Writing Quality: grammar, clarity, readability, voice consistency, structure
- Creative Strength: originality, storytelling potential, emotional impact, engagement
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

const TEXT_GUARDRAIL = `
TEXT VERIFICATION — NON-NEGOTIABLE:
All scores and descriptions MUST be grounded in the actual text content provided.
Do NOT fabricate quotes, statistics, or content details.
If text content is empty or unreadable → flag as NEEDS_REVIEW with confidence 0.
Generic descriptions ("nice writing", "good content") = automatic NEEDS_REVIEW.
No approval without explicit textual evidence.`;

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch (e) {
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

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

interface ReadinessAxis {
  score: number; // 0-100%
  justification: string;
}

interface ReadinessScore {
  writingClarity: ReadinessAxis;
  contentDepth: ReadinessAxis;
  structuralCoherence: ReadinessAxis;
  audienceFit: ReadinessAxis;
  originality: ReadinessAxis;
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

interface WhatIRead {
  contentType: string;
  tone: string;
  structure: string;
  keyTopics: string;
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
  wordCount: number;
  characterCount: number;
  modelUsed: string;
  analysisTimestamp: string;
  signalsSummary: string;
}

export interface CreatorContext {
  goal?: string;
  buyer?: string;
  mediaType?: string;
  timeConstraint?: string;
  qualityLevel?: string;
  blocker?: string;
}

export interface TextAnalysisResult {
  textAnalysis: {
    quality_score: number;
    what_i_read: string;
    structure: string;
    technical_assessment: string;
    commercial_potential: string;
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
    whatIRead: WhatIRead;
  };
  readinessScore: ReadinessScore;
  coachingRoadmap: { title: string; timeEstimate: string; actions: string[] }[];
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
  overallReadiness: number;
  alignmentVerdict:
    | "monetize-now"
    | "monetize-with-fixes"
    | "portfolio-only"
    | "hold-as-exploration"
    | "not-market-ready";
  readinessScores: { axis: string; score: number; note: string }[];
  pricingTiers: {
    tier: string;
    range: string;
    justification: string;
    includes: string[];
  }[];
  topPainPoint: string;
  textDescription: string;
  evidenceUsed: string[];
  whatIRead: WhatIRead;
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
    text_evidence: string;
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
export async function analyzeText(
  textFile: File,
  customPrompt?: string | null,
  conversationContext?: string,
  creatorContext?: CreatorContext,
  clientSignals?: any | null,
): Promise<TextAnalysisResult> {
  console.log(
    "📝 Starting Gemini Text Analysis (6-Axis + Coaching + Pricing)...",
  );

  // Detect if file is a PDF
  const isPdf =
    textFile.type === "application/pdf" ||
    textFile.name.toLowerCase().endsWith(".pdf");

  // For PDFs, we'll send as inline data to Gemini (it can read PDFs natively)
  // For text files, extract content directly
  let textContent = "";
  let pdfBase64 = "";
  if (isPdf) {
    const bytes = await textFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    pdfBase64 = buffer.toString("base64");
    // Estimate word count from file size (~5 bytes per word on average for PDFs)
    textContent = `[PDF document: ${textFile.name}, ${(textFile.size / 1024 / 1024).toFixed(2)}MB]`;
  } else {
    textContent = await textFile.text();
  }

  const wordCount = isPdf
    ? Math.round(textFile.size / 5)
    : textContent.split(/\s+/).filter(Boolean).length;
  const characterCount = isPdf ? textFile.size : textContent.length;

  // Truncate for Gemini if too long (keep first ~15k words) — only for non-PDF
  let analysisText = textContent;
  if (!isPdf) {
    const maxWords = 15000;
    const words = textContent.split(/\s+/);
    const truncated = words.length > maxWords;
    analysisText = truncated
      ? words.slice(0, maxWords).join(" ") +
        `\n\n[... TRUNCATED — original document has ${wordCount} words total, showing first ${maxWords} words for analysis]`
      : textContent;
  }

  const knowledgeTier =
    creatorContext?.qualityLevel === "professional"
      ? "STUDIO/COMMERCIAL"
      : creatorContext?.qualityLevel === "intermediate"
        ? "INDEPENDENT"
        : "HOBBYIST";

  const contextSection = creatorContext
    ? `\n\nCREATOR CONTEXT (use this to tailor your entire evaluation):
- Goal: ${creatorContext.goal || "unknown"}
- Content Outcome: ${creatorContext.buyer || "unknown"}
- Media Type: ${creatorContext.mediaType || "text"}
- Time Available: ${creatorContext.timeConstraint || "unknown"}
- Quality Aim: ${creatorContext.qualityLevel || "unknown"}
- Biggest Blocker: ${creatorContext.blocker || "none specified"}` +
      `\n
IMPORTANT: Weight your scoring and recommendations toward their specific goal and blocker.
For example:
- If goal is "product" and blocker is "pricing" → focus on commercial viability and pricing tiers
- If goal is "portfolio" and blocker is "goodenough" → focus on writing clarity and originality
- If goal is "client" and blocker is "consistency" → focus on structural coherence and packaging`
    : "";

  // ═══════════════════════════════════════════════════════
  // CALL 1: Text Description + Basic Analysis
  // ═══════════════════════════════════════════════════════
  console.log(`  → ${AI_PROVIDER_LABEL} Call 1: Text Description...`);
  const descriptionPrompt = `${DECISION_LAYER_PERSONA}

${TEXT_GUARDRAIL}

Creator knowledge tier: ${knowledgeTier}

CRITICAL: Analyze EXACTLY what you read — content type, writing style, structure, tone, key arguments/topics, and quality. Be SO specific that someone reading your analysis knows you actually read THIS text, not a template.
${contextSection}
${clientSignals ? `\nCLIENT-SIDE PRE-ANALYSIS (extracted from the file before this call — use to validate your assessment):\n- Word count: ${clientSignals.wordCount}\n- Character count: ${clientSignals.characterCount}\n- Paragraph count: ${clientSignals.paragraphCount}\n- Has sections/headings: ${clientSignals.hasSections}\n- File size: ${clientSignals.fileSizeMB}MB` : ""}
${conversationContext ? `\nUSER CONTEXT: "${conversationContext}"` : ""}
${customPrompt ? `\nUSER'S QUESTIONS: ${customPrompt}` : ""}

${isPdf ? "The PDF document is attached as inline data. Read and analyze its full contents." : `Here is the text content to analyze:\n---\n${analysisText}\n---`}

Respond in this EXACT JSON:
{
  "quality_score": <number 1-10>,
  "what_i_read": "<Describe EXACTLY what this text is about in 6-8 sentences. Include: the content type (guide, essay, script, blog, prompt collection, ebook chapter, course module, etc.), the main topic/argument, the target audience it seems written for, the writing style and tone, the level of depth/expertise shown, any unique angles or perspectives, and the overall impression. Be so specific that a reader could understand the content without seeing it.>",
  "structure": "<ACTUAL structural analysis — how the content is organized, logical flow between sections, paragraph transitions, heading hierarchy, opening hook strength, conclusion effectiveness. 3-4 sentences with specific references to content sections.>",
  "technical_assessment": "<ACTUAL writing quality — grammar accuracy, sentence variety, vocabulary level, readability grade, voice consistency, passive vs active usage, filler words, clarity of explanations, use of examples. 4-5 sentences pointing to specific passages.>",
  "commercial_potential": "<Real talk about if THIS specific text would sell. What exact market does it fit? What makes it unique or generic compared to existing content? Who specifically would buy it and for what use case? What's missing for commercial viability? 3-4 sentences.>",
  "strengths": ["<specific strength referencing actual content>", "<another>", "<another>", "<another>"],
  "weaknesses": ["<specific weakness about actual text>", "<another>", "<another>"],
  "improvements": ["<actionable improvement for THIS text>", "<another>", "<another>", "<another>"],
  "whatIRead": {
    "contentType": "<Guide, essay, script, blog post, prompt collection, ebook, course module, newsletter, template, etc.>",
    "tone": "<Professional, casual, academic, conversational, instructional, persuasive, etc.>",
    "structure": "<Well-structured with clear sections / Loosely organized / Stream of consciousness / List-based / etc.>",
    "keyTopics": "<Main topics and themes covered — be specific about the actual content.>",
    "mood": "<Educational, inspiring, technical, entertaining, urgent, reflective, etc.>"
  }
}
Write like a professional editorial consultant advising a client. Stay objective, do not default to agreeing with the user, and provide balanced positives and negatives based only on what is in the text. Be specific about what you ACTUALLY read.`;

  const call1Model = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 3200,
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  });
  const call1Parts: any[] = [{ text: descriptionPrompt }];
  if (isPdf && pdfBase64) {
    call1Parts.push({
      inlineData: { mimeType: "application/pdf", data: pdfBase64 },
    });
  }
  const call1Result = await call1Model.generateContent(
    call1Parts,
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(call1Result, { feature: "decision_layer_text", model: DECISION_LAYER_PRIMARY_MODEL });
  const textAnalysis = safeParse(call1Result.response.text());
  textAnalysis.quality_score = Math.round(
    (textAnalysis.quality_score / 10) * 100,
  );

  // Verify text was actually read
  const descText = (textAnalysis.what_i_read || "").toLowerCase();
  if (descText.length < 50) {
    throw new Error("NEEDS_REVIEW: Text verification failed — confidence 0");
  }
  console.log("  ✓ Call 1 complete — text description done");

  // ═══════════════════════════════════════════════════════
  // CALL 2: 6-Axis Readiness Scoring
  // ═══════════════════════════════════════════════════════
  console.log(`  → ${AI_PROVIDER_LABEL} Call 2: 6-Axis Readiness Scoring...`);
  const scoringPrompt = `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

Based on this text content, score it on 6 axes. Calibrate scores to the creator's tier — a HOBBYIST at 70% is performing well; a COMMERCIAL creator at 70% needs work.

TEXT DESCRIPTION (from previous analysis):
${textAnalysis.what_i_read}
${textAnalysis.technical_assessment}
${textAnalysis.structure}
${contextSection}
Score each axis from 1-5 with a specific justification referencing what you READ.
CROSS-REFERENCING RULE: Each justification MUST explicitly reference the creator's stated context. Use phrases like "You said your goal is [goal]...", "For your target buyer ([buyer])...", "At your stated [qualityLevel] level...". Never write generic notes — always name WHO, WHY, and how it connects to what the creator told you.
1. **Writing Clarity** (1-5): Is the writing clear, concise, and easy to understand? Can the reader follow the ideas without re-reading?
2. **Content Depth** (1-5): Does the content provide genuine value? Is there depth of insight, research, or expertise? Or is it surface-level?
3. **Structural Coherence** (1-5): Is the content logically organized? Do sections flow naturally? Is there a clear beginning, middle, and end?
4. **Audience Fit** (1-5): Based on the target buyer (${creatorContext?.buyer || "general"}), would they pay for this? Does it match what that audience expects?
5. **Originality** (1-5): What makes this NOT generic? Is there a unique voice, perspective, insight, or angle?
6. **Packaging Readiness** (1-5): How easy is it to turn this into a sellable product? Does it need heavy editing, or is it nearly ready to publish/sell?

Respond in this EXACT JSON:
{
  "writingClarity": { "score": <1-5>, "justification": "<2 sentences referencing specific text elements>" },
  "contentDepth": { "score": <1-5>, "justification": "<2 sentences>" },
  "structuralCoherence": { "score": <1-5>, "justification": "<2 sentences>" },
  "audienceFit": { "score": <1-5>, "justification": "<2 sentences>" },
  "originality": { "score": <1-5>, "justification": "<2 sentences>" },
  "packagingReadiness": { "score": <1-5>, "justification": "<2 sentences>" }
}`;

  const call2Model = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const call2Result = await call2Model.generateContent(
    [{ text: scoringPrompt }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(call2Result, { feature: "decision_layer_text", model: DECISION_LAYER_PRIMARY_MODEL });
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

  const readinessScore: ReadinessScore = {
    writingClarity: axisScores.writingClarity || {
      score: 3,
      justification: "Unable to evaluate",
    },
    contentDepth: axisScores.contentDepth || {
      score: 3,
      justification: "Unable to evaluate",
    },
    structuralCoherence: axisScores.structuralCoherence || {
      score: 3,
      justification: "Unable to evaluate",
    },
    audienceFit: axisScores.audienceFit || {
      score: 3,
      justification: "Unable to evaluate",
    },
    originality: axisScores.originality || {
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
    readinessScore.writingClarity.score +
    readinessScore.contentDepth.score +
    readinessScore.structuralCoherence.score +
    readinessScore.audienceFit.score +
    readinessScore.originality.score +
    readinessScore.packagingReadiness.score;
  readinessScore.total = Math.round((rawTotal / 600) * 100);

  // ═══════════════════════════════════════════════════════
  // CALL 2.5: Real Alignment + Exact Edits + Fastest Path
  // ═══════════════════════════════════════════════════════
  console.log(`  → ${AI_PROVIDER_LABEL} Call 2.5: Alignment + Edits + Path...`);

  const alignmentPrompt = `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

Based on the analysis so far, generate three things.

TEXT DESCRIPTION:
${textAnalysis.what_i_read}

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
    [{ text: alignmentPrompt }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(call25Result, { feature: "decision_layer_text", model: DECISION_LAYER_PRIMARY_MODEL });
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
  console.log(`  → ${AI_PROVIDER_LABEL} Call 3: Coaching Roadmap + Pricing...`);
  const coachingPrompt = `${DECISION_LAYER_PERSONA}

Creator knowledge tier: ${knowledgeTier}

Based on this evaluation, create a coaching roadmap and pricing guidance. Steps must be SPECIFIC — name exact tools, exact actions. Generic advice is forbidden.
ANALYSIS SUMMARY:
- What I Read: ${textAnalysis.what_i_read}
- Quality Score: ${textAnalysis.quality_score}%
- Strengths: ${textAnalysis.strengths?.join(", ")}
- Weaknesses: ${textAnalysis.weaknesses?.join(", ")}
- Readiness Total: ${readinessScore.total}%
- Word Count: ${wordCount}
- Lowest Axes: ${Object.entries(axisScores)
    .sort((a: any, b: any) => a[1].score - b[1].score)
    .slice(0, 2)
    .map(([key, val]: any) => `${key}: ${val.score}%`)
    .join(", ")}
${contextSection}
Create:
1. **Coaching Roadmap** — 3 phases of improvement:
   - Phase 1 "Quick Wins" (30 minutes): 2-3 specific fixes they can do RIGHT NOW (e.g., fix opening hook, remove filler paragraphs, add subheadings)
   - Phase 2 "Level Up" (2 hours): 2-3 deeper improvements that meaningfully increase quality (e.g., restructure sections, add examples/case studies, tighten prose)
   - Phase 3 "Market Ready" (ongoing): 2-3 steps to reach full monetization readiness (e.g., create a lead magnet version, build an email funnel, package as a course)
2. **Tiered Pricing** — based on CURRENT quality vs IMPROVED quality:
   - Starter: What they could charge NOW with minimal changes
   - Standard: What they could charge after Phase 1+2 improvements
   - Premium: What they could charge at full Phase 3 readiness
   - Include what each tier includes (single document, bundle, license type)
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
  "closingQuestion": "<One specific question to ask the creator about their next step — e.g. 'Which section do you want to rewrite first?'>"
}`;

  const call3Model = genai.getGenerativeModel({
    model: DECISION_LAYER_PRIMARY_MODEL,
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  });
  const call3Result = await call3Model.generateContent(
    [{ text: coachingPrompt }],
    DECISION_LAYER_REQUEST_OPTIONS,
  );
  logGeminiUsage(call3Result, { feature: "decision_layer_text", model: DECISION_LAYER_PRIMARY_MODEL });
  const coachingData = safeParse(call3Result.response.text());
  console.log("  ✓ Call 3 complete — coaching + pricing done");

  // Build coaching roadmap with defaults
  const coachingRoadmap: CoachingRoadmap = {
    phase1: coachingData.coachingRoadmap?.phase1 || {
      title: "Quick Wins",
      timeEstimate: "30 minutes",
      steps: [
        "Strengthen your opening hook — the first 2 sentences must grab attention",
        "Remove filler paragraphs that don't add value",
        "Add subheadings for better scannability",
      ],
    },
    phase2: coachingData.coachingRoadmap?.phase2 || {
      title: "Level Up",
      timeEstimate: "2 hours",
      steps: [
        "Add concrete examples or case studies to support key points",
        "Restructure weak sections for better logical flow",
        "Tighten prose — cut word count by 15-20% without losing meaning",
      ],
    },
    phase3: coachingData.coachingRoadmap?.phase3 || {
      title: "Market Ready",
      timeEstimate: "Ongoing",
      steps: [
        "Package into a sellable format (PDF, ebook, course module)",
        "Create a lead magnet version to build audience",
        "Set up distribution on your target platform",
      ],
    },
  };

  // Build tiered pricing with defaults
  const tieredPricing: TieredPricing = {
    starter: coachingData.tieredPricing?.starter || {
      label: "Starter",
      range: "$5-15",
      includes: ["Single document", "Personal use license"],
    },
    standard: coachingData.tieredPricing?.standard || {
      label: "Standard",
      range: "$25-45",
      includes: ["Document + templates", "Commercial license"],
    },
    premium: coachingData.tieredPricing?.premium || {
      label: "Premium",
      range: "$60-100+",
      includes: [
        "Full collection/course",
        "Extended license",
        "Source files + templates",
      ],
    },
    upgradeJustification:
      coachingData.tieredPricing?.upgradeJustification ||
      "Improved structure, depth, and packaging increases perceived value and justifies premium pricing.",
  };

  const honestPricing: HonestPricing = coachingData.tieredPricing
    ?.honestPricing || {
    low: 5,
    high: 50,
    currency: "USD",
    reasoning: "Based on current quality level and market comparables.",
    comparable:
      "Similar written content on Gumroad/Lemon Squeezy ranges $5-50.",
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
  if (textAnalysis.quality_score >= 90) overallQuality = "exceptional";
  else if (textAnalysis.quality_score >= 75) overallQuality = "professional";
  else if (textAnalysis.quality_score >= 60) overallQuality = "good";
  else if (textAnalysis.quality_score >= 40) overallQuality = "average";
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
      axis: "Writing Clarity",
      score: readinessScore.writingClarity.score,
      note: readinessScore.writingClarity.justification,
    },
    {
      axis: "Content Depth",
      score: readinessScore.contentDepth.score,
      note: readinessScore.contentDepth.justification,
    },
    {
      axis: "Structural Coherence",
      score: readinessScore.structuralCoherence.score,
      note: readinessScore.structuralCoherence.justification,
    },
    {
      axis: "Audience Fit",
      score: readinessScore.audienceFit.score,
      note: readinessScore.audienceFit.justification,
    },
    {
      axis: "Originality",
      score: readinessScore.originality.score,
      note: readinessScore.originality.justification,
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

  return {
    textAnalysis,
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
    textDescription: textAnalysis.what_i_read,
    evidenceUsed: [
      textAnalysis.structure,
      textAnalysis.technical_assessment,
      textAnalysis.commercial_potential,
    ],
    whatIRead: textAnalysis.whatIRead || {
      contentType: "Unknown",
      tone: "See technical assessment",
      structure: textAnalysis.structure,
      keyTopics: textAnalysis.what_i_read,
      mood: "See description",
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
      wordCount,
      characterCount,
      modelUsed: DECISION_LAYER_PRIMARY_MODEL,
      analysisTimestamp: new Date().toISOString(),
      signalsSummary: clientSignals
        ? `${clientSignals.wordCount} words, ${clientSignals.paragraphCount} paragraphs, sections: ${clientSignals.hasSections ? "yes" : "no"}`
        : `${wordCount} words, ${characterCount} characters`,
    },
    closingQuestion:
      coachingData.closingQuestion ||
      "Which section do you want to rewrite first?",
    fallbackEvaluation: {
      text_evidence: textAnalysis.what_i_read || "No text evidence captured",
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
        technical_quality: readinessScore.writingClarity.score,
        market_fit: readinessScore.audienceFit.score,
        policy_risk: 0,
        originality: readinessScore.originality.score,
      },
      reasons: textAnalysis.strengths || [],
      recommended_fixes: textAnalysis.improvements || [],
      marketplace_recommendation: {
        should_list:
          alignmentVerdict === "monetize-now" ||
          alignmentVerdict === "monetize-with-fixes",
        category: "Written Content",
        title: `${creatorContext?.goal || "Creative"} Text — ${overallReadiness}% Market Ready`,
        tags: [
          creatorContext?.buyer || "general",
          creatorContext?.goal || "creative",
          "written content",
          "digital product",
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
