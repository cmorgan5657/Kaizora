// app/api/decision-layer/evaluate/route.ts — Phase 2 Updated
// Orchestrator for image evaluation with 6-axis scoring, coaching roadmap, tiered pricing
// Integrates with updated image-analysis.ts and video-analysis.ts
import { NextRequest, NextResponse } from "next/server";

import {
  analyzeImage,
  CreatorContext,
  ImageAnalysisResult,
  ImageAnalysisMode,
} from "../analyze/image-analysis";
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

export async function POST(request: NextRequest) {
  const exposeDebugUi = shouldExposeDebugUi("KAIZORA_LOG_GEMINI", false);
  const startedAt = new Date().toISOString();
  let requestSummary: Record<string, unknown> = {};

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const userId = formData.get("userId") as string;

    // Pre-check credits (don't deduct yet)
    let creditCost = 0;
    if (userId && userId !== "anonymous") {
      const check = await canAfford(userId, "decision_layer_image");
      console.log("[credits] Decision Layer image pre-check", {
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
    const customPrompt = formData.get("customPrompt") as string | null;
    const rawAnalysisMode = formData.get("analysisMode");
    const analysisMode: ImageAnalysisMode =
      rawAnalysisMode === "fast" ? "fast" : "full";
    const conversationContext = formData.get("conversationContext") as string;
    const userConcern = formData.get("userConcern") as string | null;
    // Extract creator context from conversation
    const contextSummary = conversationContext
      ? JSON.parse(conversationContext)
          .filter((m: any) => m.role === "user")
          .map((m: any) => m.content)
          .join(" → ")
      : "";
    // Build creator context from conversation signals
    const rawCreatorContext = formData.get("creatorContext") as string | null;
    const creatorContext: CreatorContext = rawCreatorContext
      ? JSON.parse(rawCreatorContext)
      : buildCreatorContext(contextSummary, userConcern);
    const rawClientSignals = formData.get("clientSignals") as string | null;
    const clientSignals = rawClientSignals ? JSON.parse(rawClientSignals) : [];
    requestSummary = {
      userId: userId || "anonymous",
      customPrompt,
      analysisMode,
      userConcern,
      creatorContext,
      contextSummary,
      clientSignals,
      files: summarizeFiles(files),
    };
    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }
    // Separate images and videos
    const imageFiles: File[] = [];
    const videoFiles: File[] = [];
    files.forEach((file) => {
      if (file.type.startsWith("image/")) {
        imageFiles.push(file);
      } else if (file.type.startsWith("video/")) {
        videoFiles.push(file);
      }
    });
    if (imageFiles.length === 0 && videoFiles.length === 0) {
      return NextResponse.json(
        { error: "Please upload images or videos only" },
        { status: 400 },
      );
    }
    console.log("📊 Starting Decision Layer Analysis (Phase 2)...");
    console.log(`  Images: ${imageFiles.length}, Videos: ${videoFiles.length}`);
    // ═══════════════════════════════════════════════════════
    // IMAGE ANALYSIS — 3-call pipeline (description → scoring → coaching)
    // ═══════════════════════════════════════════════════════
    let imageAnalysis: ImageAnalysisResult | null = null;
    if (imageFiles.length > 0) {
      console.log(
        `  Analyzing ${imageFiles.length} image(s) with 3-call pipeline...`,
      );
      // Analyze all images, merge results (primary = first image)
      const allResults: ImageAnalysisResult[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        console.log(`  → Analyzing image ${i + 1}/${imageFiles.length}...`);
        const result = await analyzeImage(
          imageFiles[i],
          customPrompt,
          contextSummary,
          creatorContext,
          clientSignals[i] || null,
          analysisMode,
        );
        allResults.push(result);
      }
      // Primary analysis from first image
      imageAnalysis = allResults[0];
      // If multiple images, merge strengths/weaknesses/improvements from all
      if (allResults.length > 1 && imageAnalysis) {
        const allStrengths = allResults.flatMap(
          (r) => r.gemini_analysis.strengths || [],
        );
        const allWeaknesses = allResults.flatMap(
          (r) => r.gemini_analysis.weaknesses || [],
        );
        const allImprovements = allResults.flatMap(
          (r) => r.gemini_analysis.improvements || [],
        );
        imageAnalysis.gemini_analysis.strengths = [...new Set(allStrengths)];
        imageAnalysis.gemini_analysis.weaknesses = [...new Set(allWeaknesses)];
        imageAnalysis.gemini_analysis.improvements = [
          ...new Set(allImprovements),
        ];
        // Average the readiness scores across all images
        const axisKeys = imageAnalysis.readinessScores.map((s: any) => s.axis);
        const currentScores = imageAnalysis.readinessScores;
        imageAnalysis.readinessScores = axisKeys.map(
          (axis: string, idx: number) => {
            const avg = Math.round(
              allResults.reduce(
                (sum, r) => sum + r.readinessScores[idx].score,
                0,
              ) / allResults.length,
            );
            return {
              axis,
              score: avg,
              note: currentScores[idx].note,
            };
          },
        );
        imageAnalysis.overallReadiness = Math.round(
          imageAnalysis.readinessScores.reduce(
            (sum: number, s: any) => sum + s.score,
            0,
          ) / imageAnalysis.readinessScores.length,
        );
        console.log(`  ✓ Merged results from ${allResults.length} images`);
      }
      console.log(`  ✓ Image analysis complete!`);
      console.log(
        `    Overall readiness: ${imageAnalysis.readinessScore.total}%`,
      );
      console.log(
        `    Monetization: ${imageAnalysis.consensus.monetization_readiness}`,
      );
    }
    // ═══════════════════════════════════════════════════════
    // VIDEO ANALYSIS — placeholder for video route
    // ═══════════════════════════════════════════════════════
    if (videoFiles.length > 0) {
      console.log(
        `  ⚠️  Videos detected — use /api/decision-layer-video/evaluate for video analysis`,
      );
    }
    if (!imageAnalysis) {
      return NextResponse.json(
        { error: "No analyzable content found" },
        { status: 400 },
      );
    }
    // ═══════════════════════════════════════════════════════
    // BUILD EVALUATION RESPONSE — New Phase 2 format
    // ═══════════════════════════════════════════════════════
    console.log("\n📋 Building Phase 2 evaluation...");
 const decision =
  imageAnalysis.alignmentVerdict === "monetize-now" ? "yes"
  : imageAnalysis.alignmentVerdict === "monetize-with-fixes" ? "not-yet"
  : imageAnalysis.alignmentVerdict === "portfolio-only" ? "not-yet"
  : "no";
    const evaluation = {
      decision,
     title:
  imageAnalysis.alignmentVerdict === "monetize-now" ? "Ready to List — Strong Market Fit"
  : imageAnalysis.alignmentVerdict === "monetize-with-fixes" ? "Almost There — Quick Improvements Needed"
  : imageAnalysis.alignmentVerdict === "portfolio-only" ? "Portfolio Ready — Not Yet Market Ready"
  : imageAnalysis.alignmentVerdict === "hold-as-exploration" ? "Hold For Now — Needs Significant Work"
  : "Not Market Ready — Follow Your Roadmap",
      // ─── VISUAL DESCRIPTION (from Call 1) ──────────────────
      honestAssessment: `${imageAnalysis.visualDescription} ${imageAnalysis.gemini_analysis.commercial_potential}`,
      evidenceUsed: imageAnalysis.evidenceUsed,
      // ─── WORTH IT VERDICT ─────────────────────────────────
      worthIt: {
        verdict:
          decision === "yes" ? "yes" : decision === "not-yet" ? "maybe" : "no",
        explanation: `Overall readiness: ${imageAnalysis.overallReadiness}%. ${
          imageAnalysis.topPainPoint
        }`,
      },
      // ─── 6-AXIS READINESS SCORES (from Call 2) ────────────
      readinessScores: imageAnalysis.readinessScores,
      overallReadiness: imageAnalysis.overallReadiness,
      alignmentVerdict: imageAnalysis.alignmentVerdict,
      // ─── COACHING ROADMAP (from Call 3) ────────────────────
      coachingRoadmap: imageAnalysis.coachingRoadmap,
      // ─── TIERED PRICING (from Call 3) ──────────────────────
      pricingGuidance: {
        tiers: imageAnalysis.pricingTiers,
        currentTier: imageAnalysis.pricingTiers[0]?.tier || "Starter",
        currentRange: imageAnalysis.pricingTiers[0]?.range || "$10-25",
        potentialRange: imageAnalysis.pricingTiers[2]?.range || "$100+",
        rationale: imageAnalysis.pricingTiers[0]?.justification || "",
      },
      // ─── TOP PAIN POINT ────────────────────────────────────
      topPainPoint: imageAnalysis.topPainPoint,
      // ─── WHERE TO START (derived from coaching Phase 1) ────
      whereToStart: {
        priority:
          imageAnalysis.coachingRoadmap[0]?.actions[0] || "Review feedback",
        steps: imageAnalysis.coachingRoadmap[0]?.actions || [],
      },
      // ─── CONTENT CRITIQUE (derived from scores) ────────────
      contentCritique: {
        strengths: [
          ...imageAnalysis.readinessScores
            .filter((s: any) => s.score >= 80)
            .map((s: any) => `${s.axis}: ${s.note}`),
          ...(imageAnalysis.gemini_analysis.strengths || []),
        ],
        weaknesses: [
          ...imageAnalysis.readinessScores
            .filter((s: any) => s.score <= 60)
            .map((s: any) => `${s.axis} (${s.score}%): ${s.note}`),
          ...(imageAnalysis.gemini_analysis.weaknesses || []),
        ],
        improvements: [
          ...(imageAnalysis.gemini_analysis.improvements || []),
          ...(imageAnalysis.coachingRoadmap[0]?.actions || []),
        ],
      },
      // ─── NEXT STEPS ───────────────────────────────────────
      nextSteps: [
        imageAnalysis.coachingRoadmap[0]?.actions[0] ||
          "Review the detailed feedback",
        imageAnalysis.coachingRoadmap[0]?.actions[1] || "Implement quick wins",
        imageAnalysis.coachingRoadmap[1]?.actions[0] || "Level up your content",
        decision === "yes"
          ? "Publish on KAIZORA to start earning"
          : "Re-analyze after improvements",
      ].filter(Boolean),
      realTalk: `${imageAnalysis.overallReadiness}% overall readiness. ${imageAnalysis.gemini_analysis.commercial_potential} ${imageAnalysis.topPainPoint}`,
      // ─── KAIZORA STRATEGY ─────────────────────────────────
      KAIZORAStrategy: {
        strategyType:
          decision === "yes"
            ? "Direct Sale + Remix License"
            : "Improve first, then publish",
        features: [
          "High-quality preview",
          "Detailed metadata",
          "Multiple licensing tiers",
        ],
        rationale:
          decision === "yes"
            ? "Your content is market-ready. Maximize reach with both purchase and remix options."
            : `Focus on ${imageAnalysis.coachingRoadmap[0]?.title || "Quick Wins"} before publishing.`,
      },
      // ─── MARKET REALITY ───────────────────────────────────
      marketReality: {
       demand:
          imageAnalysis.overallReadiness >= 80
            ? "high"
            : imageAnalysis.overallReadiness >= 53
              ? "medium"
              : "low",
        competition: "medium" as const,
        analysis: imageAnalysis.topPainPoint,
      },
      // ─── NEW Phase 3 fields (additive) ─────────────────
      whatISaw: imageAnalysis.whatISaw,
      whatYouToldMe: imageAnalysis.whatYouToldMe,
      realAlignment: imageAnalysis.realAlignment,
      myRecommendation: imageAnalysis.myRecommendation,
      exactEdits: imageAnalysis.exactEdits,
      honestPricing: imageAnalysis.honestPricing,
      fastestPath: imageAnalysis.fastestPath,
     evidenceDetails: imageAnalysis.evidenceDetails,
      analysisStatusLog: imageAnalysis.evidenceDetails?.statusLog || [],
      closingQuestion: imageAnalysis.closingQuestion,
      fallbackEvaluation: imageAnalysis.fallbackEvaluation,
    };
    console.log("\n✅ Phase 2 Analysis Complete!");
    console.log(`   Decision: ${evaluation.decision}`);
    console.log(`   Readiness: ${imageAnalysis.overallReadiness}%`);
    console.log(`   Verdict: ${imageAnalysis.alignmentVerdict}`);
    console.log(`   Pain Point: ${imageAnalysis.topPainPoint}`);

    const analysisLogFile = await writeDecisionLayerAnalysisLog({
      route: "/api/decision-layer/evaluate",
      mediaType: "image",
      status: "success",
      startedAt,
      request: requestSummary,
      responseStatus: 200,
      result: {
        evaluation,
        imageAnalysis,
        creditCost,
      },
    });

    // Deduct credits AFTER successful analysis
    if (userId && userId !== "anonymous" && creditCost > 0) {
      const deduction = await forceDeduct(
        userId,
        creditCost,
        "decision_layer_image",
        "Decision Layer — Image Analysis",
      );
      console.log("[credits] Decision Layer image deduction result", {
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
              image_analysis: imageAnalysis,
              model_used:
                imageAnalysis.evidenceDetails?.modelUsed ||
                "gemini-3.1-pro-preview",
              api: {
                provider: "Google Gemini",
                models: imageAnalysis.evidenceDetails?.modelUsed
                  ? imageAnalysis.evidenceDetails.modelUsed.split(" -> ")
                  : ["gemini-3.1-pro-preview"],
                statusLog: imageAnalysis.evidenceDetails?.statusLog || [],
                keys: [
                  {
                    label: "GEMINI_API_KEY",
                    masked: maskSecret(process.env.GEMINI_API_KEY),
                  },
                ],
              },
              pipeline:
                analysisMode === "fast"
                  ? "2-call fast (description → synthesis)"
                  : "3-call (description → scoring → coaching)",
              analysis_mode: analysisMode,
              creator_context: creatorContext,
              analysis_log_file: analysisLogFile,
            },
          }
        : {}),
    });
  } catch (error: any) {
    console.error("❌ Decision layer API error:", error);
    if (error?.code === "VISION_VERIFICATION_FAILED") {
      const analysisLogFile = await writeDecisionLayerAnalysisLog({
        route: "/api/decision-layer/evaluate",
        mediaType: "image",
        status: "error",
        startedAt,
        request: requestSummary,
        responseStatus: 422,
        error,
      });
      return NextResponse.json(
        {
          error: error.userMessage || "Vision verification failed",
          details:
            error.details ||
            "The model response did not contain reliable visual evidence.",
          verification: error.verification || null,
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
        { status: 422 },
      );
    }
    const analysisLogFile = await writeDecisionLayerAnalysisLog({
      route: "/api/decision-layer/evaluate",
      mediaType: "image",
      status: "error",
      startedAt,
      request: requestSummary,
      responseStatus: 500,
      error,
    });
    return NextResponse.json(
      {
        error: "Failed to evaluate content",
        details: error.message,
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
// ── Extract creator context from conversation ────────────────────────────
function buildCreatorContext(
  contextSummary: string,
  userConcern: string | null,
): CreatorContext {
  const lower = contextSummary.toLowerCase();
  const context: CreatorContext = {};
  // Detect goal
  if (
    lower.includes("sell") ||
    lower.includes("monetize") ||
    lower.includes("earn")
  ) {
    context.goal = "sell content";
  } else if (
    lower.includes("commission") ||
    lower.includes("freelance") ||
    lower.includes("client")
  ) {
    context.goal = "get commissions";
  } else if (
    lower.includes("audience") ||
    lower.includes("follower") ||
    lower.includes("grow")
  ) {
    context.goal = "build audience";
  } else if (lower.includes("portfolio") || lower.includes("showcase")) {
    context.goal = "build portfolio";
  }
  // Detect buyer
  if (
    lower.includes("brand") ||
    lower.includes("agency") ||
    lower.includes("corporate")
  ) {
    context.buyer = "brands and agencies";
  } else if (lower.includes("game") || lower.includes("indie")) {
    context.buyer = "indie game studios";
  } else if (
    lower.includes("social media") ||
    lower.includes("content creator")
  ) {
    context.buyer = "social media managers";
  }
  // Detect quality level
  if (
    lower.includes("beginner") ||
    lower.includes("just started") ||
    lower.includes("new to")
  ) {
    context.qualityLevel = "beginner";
  } else if (
    lower.includes("professional") ||
    lower.includes("years of") ||
    lower.includes("expert")
  ) {
    context.qualityLevel = "professional";
  } else {
    context.qualityLevel = "intermediate";
  }
  // Detect blocker from concern
  if (userConcern === "pricing") {
    context.blocker = "pricing confusion";
  } else if (userConcern === "consistency") {
    context.blocker = "inconsistent style";
  } else if (userConcern === "time") {
    context.blocker = "packaging takes too long";
  } else if (userConcern === "platform") {
    context.blocker = "unsure where to sell";
  } else if (userConcern === "quality") {
    context.blocker = "unsure about quality";
  }
  return context;
}
