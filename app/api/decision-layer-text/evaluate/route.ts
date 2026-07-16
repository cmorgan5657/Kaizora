// app/api/decision-layer-text/evaluate/route.ts
// KAIZORA Text Intelligence — evaluation endpoint
import { NextRequest, NextResponse } from "next/server";

import {
  analyzeText,
  CreatorContext,
} from "../../decision-layer/analyze/text-analysis";
import { canAfford, forceDeduct } from "@/lib/credits";
import {
  summarizeFiles,
  writeDecisionLayerAnalysisLog,
} from "@/lib/decisionLayerAnalysisLogs";
import { shouldExposeDebugUi } from "@/lib/debugLogs";

const maskSecret = (value?: string | null) => {
  if (!value) return "Not configured";
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export const maxDuration = 120; // 2 minutes max for text processing

export async function POST(req: NextRequest) {
  const exposeDebugUi = shouldExposeDebugUi("KAIZORA_LOG_GEMINI", false);
  const startedAt = new Date().toISOString();
  let requestSummary: Record<string, unknown> = {};

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const userId = formData.get("userId") as string;

    // Pre-check credits (don't deduct yet)
    let creditCost = 0;
    if (userId && userId !== "anonymous") {
      const check = await canAfford(userId, "decision_layer_text");
      console.log("[credits] Decision Layer text pre-check", {
        userId,
        cost: check.cost,
        balance: check.balance,
        affordable: check.affordable,
      });
      if (!check.affordable) {
        return NextResponse.json({ error: `Insufficient credits. This action costs ${check.cost} credits but you have ${check.balance}.`, creditError: true }, { status: 402 });
      }
      creditCost = check.cost;
    }
    const creatorContextStr = formData.get("creatorContext") as string;
    const customPrompt = formData.get("customPrompt") as string | null;
    const conversationContext = formData.get("conversationContext") as string;
    const userConcern = formData.get("userConcern") as string | null;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No text files provided" },
        { status: 400 },
      );
    }

    const textFile = files[0];

    // Validate text file
    const validTypes = [
      "text/plain",
      "text/markdown",
      "text/csv",
      "text/html",
      "text/rtf",
      "application/json",
      "application/pdf",
    ];
    const validExtensions = [
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".json",
      ".html",
      ".rtf",
      ".log",
      ".pdf",
    ];

    const hasValidType = validTypes.some((t) => textFile.type.includes(t));
    const hasValidExt = validExtensions.some((ext) =>
      textFile.name.toLowerCase().endsWith(ext),
    );

    if (!hasValidType && !hasValidExt) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported text format: ${textFile.type || textFile.name}. Supported: TXT, MD, CSV, JSON, HTML, RTF, PDF`,
        },
        { status: 400 },
      );
    }

    // Parse creator context
    let creatorContext: CreatorContext | undefined;
    try {
      creatorContext = creatorContextStr
        ? JSON.parse(creatorContextStr)
        : undefined;
    } catch {
      creatorContext = undefined;
    }

    // Build context summary from conversation
    const contextSummary = conversationContext
      ? JSON.parse(conversationContext)
          .filter((m: any) => m.role === "user")
          .map((m: any) => m.content)
          .join(" → ")
      : "";

    // Parse client signals
    let clientSignals = null;
    try {
      const rawClientSignals = formData.get("clientSignals") as string | null;
      if (rawClientSignals) {
        const parsed = JSON.parse(rawClientSignals);
        clientSignals = Array.isArray(parsed) ? parsed[0] : parsed;
      }
    } catch {
      // ignore
    }
    requestSummary = {
      userId: userId || "anonymous",
      customPrompt,
      userConcern,
      creatorContext,
      contextSummary,
      clientSignals,
      files: summarizeFiles(files),
    };

    console.log("📝 Text evaluation request received");
    console.log(
      `   File: ${textFile.name} (${(textFile.size / 1024 / 1024).toFixed(2)}MB)`,
    );
    console.log(`   Type: ${textFile.type}`);
    console.log(`   Creator context:`, creatorContext);

    // ── Run full text analysis ──
    const textAnalysis = await analyzeText(
      textFile,
      customPrompt,
      contextSummary,
      creatorContext,
      clientSignals,
    );

    // ── Build evaluation object (same shape as image/video/audio for UI compatibility) ──
    const evaluation = {
      // Core decision fields
      decision:
        textAnalysis.alignmentVerdict === "monetize-now"
          ? "yes"
          : textAnalysis.alignmentVerdict === "monetize-with-fixes"
            ? "not-yet"
            : textAnalysis.alignmentVerdict === "portfolio-only"
              ? "not-yet"
              : "no",
      title:
        textAnalysis.alignmentVerdict === "monetize-now"
          ? "This text is ready to sell"
          : textAnalysis.alignmentVerdict === "monetize-with-fixes"
            ? "Almost there — a few improvements needed"
            : textAnalysis.alignmentVerdict === "portfolio-only"
              ? "Portfolio quality — not yet market-ready"
              : textAnalysis.alignmentVerdict === "hold-as-exploration"
                ? "Hold for now — needs significant work"
                : "Needs work before it's market-ready",
      honestAssessment: textAnalysis.textDescription,
      evidenceUsed: textAnalysis.evidenceUsed,

      // Worth it
      worthIt: {
        verdict:
          textAnalysis.alignmentVerdict === "monetize-now"
            ? "yes"
            : textAnalysis.alignmentVerdict === "monetize-with-fixes"
              ? "maybe"
              : textAnalysis.alignmentVerdict === "portfolio-only"
                ? "maybe"
                : "no",
        explanation: textAnalysis.topPainPoint,
      },

      // 6-Axis
      readinessScores: textAnalysis.readinessScores,
      overallReadiness: textAnalysis.overallReadiness,
      alignmentVerdict: textAnalysis.alignmentVerdict,

      // Coaching
      coachingRoadmap: textAnalysis.coachingRoadmap,

      // Pricing
      pricingGuidance: {
        tiers: textAnalysis.pricingTiers,
        currentTier: "Starter",
        currentRange: textAnalysis.tieredPricing.starter.range,
        potentialRange: textAnalysis.tieredPricing.premium.range,
        rationale: textAnalysis.tieredPricing.upgradeJustification,
      },

      // Pain point
      topPainPoint: textAnalysis.topPainPoint,

      // Where to start
      whereToStart: {
        priority:
          textAnalysis.exactEdits?.[0]?.edit ||
          "Review your lowest-scoring axis",
        steps: textAnalysis.fastestPath?.map((s) => s.step) || [],
      },

      // Content critique
      contentCritique: {
        strengths: [
          ...(textAnalysis.textAnalysis.strengths || []),
          ...textAnalysis.readinessScores
            .filter((s) => s.score >= 80)
            .map((s) => `${s.axis}: ${s.note}`),
        ],
        weaknesses: [
          ...textAnalysis.readinessScores
            .filter((s) => s.score <= 40)
            .map((s) => `${s.axis} (${s.score}%): ${s.note}`),
          ...(textAnalysis.textAnalysis.weaknesses || []),
        ],
        improvements: textAnalysis.exactEdits?.map((e) => e.edit) || [],
      },

      // Next steps
      nextSteps:
        textAnalysis.fastestPath?.map(
          (s) => `${s.step} (${s.timeEstimate})`,
        ) || [],

      // Real talk
      realTalk: `${textAnalysis.overallReadiness}% overall readiness. ${textAnalysis.evidenceDetails.wordCount} words. ${textAnalysis.textAnalysis.whatIRead?.contentType || "Text document"} — ${textAnalysis.topPainPoint}`,

      // Phase 3 fields
      whatISaw: undefined,
      whatIRead: textAnalysis.whatIRead,
      whatYouToldMe: textAnalysis.whatYouToldMe,
      realAlignment: textAnalysis.realAlignment,
      myRecommendation: textAnalysis.myRecommendation,
      exactEdits: textAnalysis.exactEdits,
      honestPricing: textAnalysis.honestPricing,
      fastestPath: textAnalysis.fastestPath,
      evidenceDetails: textAnalysis.evidenceDetails,
      closingQuestion: textAnalysis.closingQuestion,
      fallbackEvaluation: textAnalysis.fallbackEvaluation,
    };

    const analysisLogFile = await writeDecisionLayerAnalysisLog({
      route: "/api/decision-layer-text/evaluate",
      mediaType: "text",
      status: "success",
      startedAt,
      request: requestSummary,
      responseStatus: 200,
      result: {
        evaluation,
        textAnalysis,
        creditCost,
      },
    });

    // Deduct credits AFTER successful analysis
    if (userId && userId !== "anonymous" && creditCost > 0) {
      const deduction = await forceDeduct(
        userId,
        creditCost,
        "decision_layer_text",
        "Decision Layer — Text Analysis",
      );
      console.log("[credits] Decision Layer text deduction result", {
        userId,
        creditCost,
        success: deduction.success,
        remaining: deduction.success ? deduction.remaining : undefined,
        error: deduction.success ? undefined : deduction.error,
      });
    }

    return NextResponse.json({
      success: true,
      evaluation,
      ...(exposeDebugUi
        ? {
            debug: {
              api: {
                provider: "Google Gemini",
                models: ["gemini-3.1-pro-preview"],
                keys: [
                  {
                    label: "GEMINI_API_KEY",
                    masked: maskSecret(process.env.GEMINI_API_KEY),
                  },
                ],
              },
              analysis_log_file: analysisLogFile,
            },
          }
        : {}),
    });
  } catch (error: any) {
    console.error("Text evaluation error:", error);
    const analysisLogFile = await writeDecisionLayerAnalysisLog({
      route: "/api/decision-layer-text/evaluate",
      mediaType: "text",
      status: "error",
      startedAt,
      request: requestSummary,
      responseStatus: 500,
      error,
    });
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to evaluate text",
        ...(exposeDebugUi
          ? {
              debug: {
                api: {
                  provider: "Google Gemini",
                  models: ["gemini-3.1-pro-preview"],
                  keys: [
                    {
                      label: "GEMINI_API_KEY",
                      masked: maskSecret(process.env.GEMINI_API_KEY),
                    },
                  ],
                  analysis_log_file: analysisLogFile,
                },
              },
            }
          : {}),
      },
      { status: 500 },
    );
  }
}
