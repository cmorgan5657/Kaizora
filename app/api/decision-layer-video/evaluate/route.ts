// app/api/decision-layer-video/evaluate/route.ts — Phase 2 Updated
// Video evaluation orchestrator with 6-axis scoring, coaching roadmap, tiered pricing
// Integrates with updated video-analysis.ts
import { NextRequest, NextResponse } from "next/server";

import Replicate from "replicate";

import {
  analyzeVideo,
  CreatorContext,
} from "../../decision-layer/analyze/video-analysis";
import {
  extractVideoFrames,
  extractAudioTrack,
} from "../../decision-layer/utils/frame-extractor";
import { canAfford, forceDeduct } from "@/lib/credits";
import {
  summarizeFiles,
  writeDecisionLayerAnalysisLog,
} from "@/lib/decisionLayerAnalysisLogs";
import { maskSecret } from "@/lib/replicateDebug";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function POST(request: NextRequest) {
  const startedAt = new Date().toISOString();
  let requestSummary: Record<string, unknown> = {};

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const userId = formData.get("userId") as string;

    // Pre-check credits (don't deduct yet)
    let creditCost = 0;
    if (userId && userId !== "anonymous") {
      const check = await canAfford(userId, "decision_layer_video");
      console.log("[credits] Decision Layer video pre-check", {
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
    const conversationContext = formData.get("conversationContext") as string;
    const userConcern = formData.get("userConcern") as string | null;
    // Extract creator context
    const contextSummary = conversationContext
      ? JSON.parse(conversationContext)
          .filter((m: any) => m.role === "user")
          .map((m: any) => m.content)
          .join(" → ")
      : "";
    const rawCreatorContext = formData.get("creatorContext") as string | null;
    const creatorContext: CreatorContext = rawCreatorContext
      ? JSON.parse(rawCreatorContext)
      : buildCreatorContext(contextSummary, userConcern);
    const rawClientSignals = formData.get("clientSignals") as string | null;
    const clientSignals = rawClientSignals ? JSON.parse(rawClientSignals) : [];
    requestSummary = {
      userId: userId || "anonymous",
      customPrompt,
      userConcern,
      creatorContext,
      contextSummary,
      clientSignals,
      files: summarizeFiles(files),
    };
    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }
    const videoFiles = files.filter((file) => file.type.startsWith("video/"));
    if (videoFiles.length === 0) {
      return NextResponse.json(
        { error: "Please upload video files only" },
        { status: 400 },
      );
    }
    console.log("📊 Starting Video Decision Layer Analysis (Phase 2)...");
    console.log("   Replicate config:", {
      tokenConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
      tokenMasked: maskSecret(process.env.REPLICATE_API_TOKEN),
    });
    // ═══════════════════════════════════════════════════════
    // STEP 1: Extract frames from video
    // ═══════════════════════════════════════════════════════
    console.log("\n🎬 Extracting video frames...");
    const videoFile = videoFiles[0];
    const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
    // Extract frames using canvas-based sampling
    // In production, use ffmpeg or a frame extraction service
    // Extract frames using fluent-ffmpeg
    const extraction = await extractVideoFrames(
      videoBuffer,
      videoFile.name || "upload.mp4",
      40,
    );
    const frames = extraction.frames.map((f) => ({
      base64: f.base64,
      timestamp: parseFloat(f.timestamp.replace(":", "")),
    }));
    const durationSeconds = extraction.duration;
    console.log(
      `  Extracted ${frames.length} frames from ${durationSeconds.toFixed(1)}s video`,
    );
    // Extract audio track
    console.log("\n🔊 Extracting audio track...");
    const audioData = await extractAudioTrack(
      videoBuffer,
      videoFile.name || "upload.mp4",
    );
    console.log(`  Audio detected: ${audioData.hasAudio}`);
    // ═══════════════════════════════════════════════════════
    // STEP 2: Run 3-call pipeline (description → scoring → coaching)
    // ═══════════════════════════════════════════════════════
    console.log("\n🎨 Running 3-call analysis pipeline...");
    const videoAnalysis = await analyzeVideo(
      frames,
      durationSeconds,
      customPrompt,
      contextSummary,
      creatorContext,
      clientSignals[0] || null,
      audioData,
      replicate,
    );
    console.log(`  ✓ Video analysis complete!`);
    console.log(`    Overall readiness: ${videoAnalysis.overallReadiness}%`);
    console.log(`    Verdict: ${videoAnalysis.alignmentVerdict}`);
    // ═══════════════════════════════════════════════════════
    // STEP 3: Build evaluation response
    // ═══════════════════════════════════════════════════════
    console.log("\n📋 Building Phase 2 evaluation...");
   const decision =
  videoAnalysis.alignmentVerdict === "monetize-now" ? "yes"
  : videoAnalysis.alignmentVerdict === "monetize-with-fixes" ? "not-yet"
  : videoAnalysis.alignmentVerdict === "portfolio-only" ? "not-yet"
  : "no";
    const evaluation = {
      decision,
    title:
  videoAnalysis.alignmentVerdict === "monetize-now" ? "Ready to List — Strong Market Fit"
  : videoAnalysis.alignmentVerdict === "monetize-with-fixes" ? "Almost There — Quick Improvements Needed"
  : videoAnalysis.alignmentVerdict === "portfolio-only" ? "Portfolio Ready — Not Yet Market Ready"
  : videoAnalysis.alignmentVerdict === "hold-as-exploration" ? "Hold For Now — Needs Significant Work"
  : "Needs Work — Follow Your Roadmap",
      // ─── VISUAL DESCRIPTION (from Call 1) ──────────────────
      honestAssessment: videoAnalysis.visualDescription.slice(0, 300) + "...",
      evidenceUsed: videoAnalysis.evidenceUsed,
      // ─── WORTH IT ─────────────────────────────────────────
      worthIt: {
        verdict:
          decision === "yes" ? "yes" : decision === "not-yet" ? "maybe" : "no",
        explanation: `Overall readiness: ${videoAnalysis.overallReadiness}%. ${videoAnalysis.topPainPoint}`,
      },
      // ─── 6-AXIS READINESS SCORES (from Call 2) ────────────
      readinessScores: videoAnalysis.readinessScores,
      overallReadiness: videoAnalysis.overallReadiness,
      alignmentVerdict: videoAnalysis.alignmentVerdict,
      // ─── COACHING ROADMAP (from Call 3) ────────────────────
      coachingRoadmap: videoAnalysis.coachingRoadmap,
      // ─── TIERED PRICING (from Call 3) ──────────────────────
      pricingGuidance: {
        tiers: videoAnalysis.pricingTiers,
        currentTier: videoAnalysis.pricingTiers[0]?.tier || "Starter",
        currentRange: videoAnalysis.pricingTiers[0]?.range || "$15-35",
        potentialRange: videoAnalysis.pricingTiers[2]?.range || "$200+",
        rationale: videoAnalysis.pricingTiers[0]?.justification || "",
        // Legacy fields for backward compatibility
        range: videoAnalysis.pricingTiers[0]?.range || "$15-35",
        pricingTips: videoAnalysis.pricingTiers[0]?.upgradeAction || "",
        licenseOptions: [
          {
            type: "Starter",
            price: videoAnalysis.pricingTiers[0]?.range || "$15-35",
          },
          {
            type: "Standard",
            price: videoAnalysis.pricingTiers[1]?.range || "$50-150",
          },
          {
            type: "Premium",
            price: videoAnalysis.pricingTiers[2]?.range || "$200-500+",
          },
        ],
      },
      // ─── TOP PAIN POINT ────────────────────────────────────
      topPainPoint: videoAnalysis.topPainPoint,
      // ─── VIDEO METADATA ───────────────────────────────────
      videoMetadata: {
        duration: `${Math.floor(durationSeconds / 60)}:${String(Math.floor(durationSeconds % 60)).padStart(2, "0")}`,
        resolution: "auto-detected",
        fileSize: `${(videoFile.size / 1024 / 1024).toFixed(1)}MB`,
        format: videoFile.type,
        framesAnalyzed: videoAnalysis.frameCount,
        hasAudio: audioData.hasAudio,
        audioQuality: videoAnalysis.audioAnalysis?.audioQuality || "none",
      },
      // ─── SCORES (mapped from 6-axis for legacy UI) ────────
     scores: {
  overall: videoAnalysis.overallReadiness,
  technical:
    videoAnalysis.readinessScores.find(
      (s: any) => s.axis === "Technical Quality",
    )?.score || 60,
  commercial:
    videoAnalysis.readinessScores.find(
      (s: any) => s.axis === "Audience Fit",
    )?.score || 60,
  narrative:
    videoAnalysis.readinessScores.find(
      (s: any) => s.axis === "Creative Clarity",
    )?.score || 60,
  confidence: videoAnalysis.overallReadiness,
},
      // ─── CONTENT CRITIQUE ─────────────────────────────────
      contentCritique: {
        strengths: videoAnalysis.readinessScores
          .filter((s: any) => s.score >= 80)
          .map((s: any) => `${s.axis}: ${s.note}`),
        weaknesses: videoAnalysis.readinessScores
          .filter((s: any) => s.score <= 40)
          .map((s: any) => `${s.axis}: ${s.note}`),
        improvements: videoAnalysis.coachingRoadmap[0]?.actions || [],
      },
      // ─── TECHNICAL BREAKDOWN ──────────────────────────────
      technicalBreakdown: {
        composition: videoAnalysis.visualDescription,
        technicalAssessment:
          videoAnalysis.readinessScores.find(
            (s: any) => s.axis === "Technical Quality",
          )?.note || "",
        visualDescription: videoAnalysis.visualDescription,
      },
      // ─── MARKET ANALYSIS ──────────────────────────────────
      marketAnalysis: {
        commercialPotential: videoAnalysis.topPainPoint,
        targetAudience:
        videoAnalysis.overallReadiness >= 80
  ? "Commercial buyers, brand marketers, content agencies"
  : videoAnalysis.overallReadiness >= 60
    ? "Indie creators, small businesses, social media managers"
    : "Personal projects, hobbyist use",
bestPlatforms:
  videoAnalysis.overallReadiness >= 80
    ? ["KAIZORA", "Pond5", "Shutterstock", "Getty"]
    : videoAnalysis.overallReadiness >= 60
      ? ["KAIZORA", "Envato", "Motion Array"]
      : ["KAIZORA", "Gumroad"],
demandLevel:
  videoAnalysis.overallReadiness >= 80
    ? "high"
    : videoAnalysis.overallReadiness >= 60
      ? "medium"
      : "low",
      },
      // ─── WHERE TO START ───────────────────────────────────
      whereToStart: {
        priority:
          videoAnalysis.coachingRoadmap[0]?.actions[0] || "Review feedback",
        steps: videoAnalysis.coachingRoadmap[0]?.actions || [],
      },
      // ─── NEXT STEPS ───────────────────────────────────────
      nextSteps: [
        videoAnalysis.coachingRoadmap[0]?.actions[0] ||
          "Review detailed feedback",
        videoAnalysis.coachingRoadmap[0]?.actions[1] || "Implement quick wins",
        videoAnalysis.coachingRoadmap[1]?.actions[0] || "Level up your content",
        decision === "yes"
          ? "List on KAIZORA to start earning"
          : "Re-analyze after improvements",
      ].filter(Boolean),
      // ─── REAL TALK ────────────────────────────────────────
      realTalk: `${videoAnalysis.overallReadiness}% overall readiness across ${videoAnalysis.frameCount} frames. ${videoAnalysis.topPainPoint}`,
      // ─── NEW Phase 3 fields (additive) ─────────────────
      whatISaw: videoAnalysis.whatISaw,
      whatYouToldMe: videoAnalysis.whatYouToldMe,
      realAlignment: videoAnalysis.realAlignment,
      myRecommendation: videoAnalysis.myRecommendation,
      exactEdits: videoAnalysis.exactEdits,
      honestPricing: videoAnalysis.honestPricing,
      fastestPath: videoAnalysis.fastestPath,
   evidenceDetails: videoAnalysis.evidenceDetails,
      closingQuestion: videoAnalysis.closingQuestion,
      fallbackEvaluation: videoAnalysis.fallbackEvaluation,
      whatIHeard: videoAnalysis.audioIntelligence
        ? {
            instruments:
              videoAnalysis.audioIntelligence.genres
                .slice(0, 3)
                .map((g) => g.genre)
                .join(", ") || "None detected",
            rhythm: videoAnalysis.audioIntelligence.bpm
              ? `${videoAnalysis.audioIntelligence.bpm} BPM, ${videoAnalysis.audioIntelligence.structure.length} sections detected`
              : "Unknown tempo",
            tonality: videoAnalysis.audioIntelligence.key || "Unknown key",
            production: `Top genre confidence: ${videoAnalysis.audioIntelligence.genres[0]?.confidence || 0}%`,
            mood:
              videoAnalysis.audioIntelligence.genres
                .slice(0, 5)
                .map((g) => `${g.genre} (${g.confidence}%)`)
                .join(", ") || "Unknown mood",
          }
        : undefined,
      audioIntelligence: videoAnalysis.audioIntelligence
        ? {
            genres: videoAnalysis.audioIntelligence.genres,
            moods: videoAnalysis.audioIntelligence.moods,
            instruments: videoAnalysis.audioIntelligence.instruments,
            isVocal: videoAnalysis.audioIntelligence.isVocal,
            vocalGender: videoAnalysis.audioIntelligence.vocalGender,
            danceability: videoAnalysis.audioIntelligence.danceability,
            engagement: videoAnalysis.audioIntelligence.engagement,
            approachability: videoAnalysis.audioIntelligence.approachability,
            bpm: videoAnalysis.audioIntelligence.bpm,
            key: videoAnalysis.audioIntelligence.key,
            structure: videoAnalysis.audioIntelligence.structure,
            hasSpeech: videoAnalysis.audioAnalysis?.hasAudio || false,
            transcript: videoAnalysis.audioAnalysis?.transcript || "",
          }
        : undefined,
    };
    console.log("\n✅ Video Phase 2 Analysis Complete!");
    console.log(`   Decision: ${evaluation.decision}`);
    console.log(`   Readiness: ${videoAnalysis.overallReadiness}%`);
    console.log(`   Verdict: ${videoAnalysis.alignmentVerdict}`);

    const analysisLogFile = await writeDecisionLayerAnalysisLog({
      route: "/api/decision-layer-video/evaluate",
      mediaType: "video",
      status: "success",
      startedAt,
      request: requestSummary,
      responseStatus: 200,
      result: {
        evaluation,
        videoAnalysis,
        creditCost,
      },
    });

    // Deduct credits AFTER successful analysis
    if (userId && userId !== "anonymous" && creditCost > 0) {
      const deduction = await forceDeduct(
        userId,
        creditCost,
        "decision_layer_video",
        "Decision Layer — Video Analysis",
      );
      console.log("[credits] Decision Layer video deduction result", {
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
      debug: {
        video_analysis: videoAnalysis,
        models_used: ["gemini-3.1-pro-preview"],
        api: {
          provider: "Google Gemini + Replicate",
          models: ["gemini-3.1-pro-preview"],
          keys: [
            {
              label: "GEMINI_API_KEY",
              masked: maskSecret(process.env.GEMINI_API_KEY),
            },
            {
              label: "REPLICATE_API_TOKEN",
              masked: maskSecret(process.env.REPLICATE_API_TOKEN),
            },
          ],
        },
        pipeline: "3-call (description → scoring → coaching)",
        frames_analyzed: videoAnalysis.frameCount,
        creator_context: creatorContext,
        analysis_log_file: analysisLogFile,
      },
    });
  } catch (error: any) {
    console.error("❌ Video decision layer API error:", error);
    if (error?.message?.includes("Failed to parse body as FormData")) {
      const analysisLogFile = await writeDecisionLayerAnalysisLog({
        route: "/api/decision-layer-video/evaluate",
        mediaType: "video",
        status: "error",
        startedAt,
        request: requestSummary,
        responseStatus: 413,
        error,
      });
      return NextResponse.json(
        {
          error:
            "Upload body is too large or malformed. Reduce file size and try again.",
          details:
            "Multipart form-data could not be parsed. Check proxy upload size limits.",
          analysisLogFile,
        },
        { status: 413 },
      );
    }
    if (error?.code === "VISION_VERIFICATION_FAILED") {
      const analysisLogFile = await writeDecisionLayerAnalysisLog({
        route: "/api/decision-layer-video/evaluate",
        mediaType: "video",
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
            "The model response did not contain reliable frame evidence.",
          verification: error.verification || null,
          debug: {
            api: {
              provider: "Google Gemini + Replicate",
              models: ["gemini-3.1-pro-preview"],
              keys: [
                {
                  label: "GEMINI_API_KEY",
                  masked: maskSecret(process.env.GEMINI_API_KEY),
                },
                {
                  label: "REPLICATE_API_TOKEN",
                  masked: maskSecret(process.env.REPLICATE_API_TOKEN),
                },
              ],
            },
            analysis_log_file: analysisLogFile,
          },
        },
        { status: 422 },
      );
    }
    if (
      error?.code === "VIDEO_SCORING_PARSE_FAILED" ||
      error?.code === "VIDEO_SCORING_INVALID_SCHEMA"
    ) {
      const analysisLogFile = await writeDecisionLayerAnalysisLog({
        route: "/api/decision-layer-video/evaluate",
        mediaType: "video",
        status: "error",
        startedAt,
        request: requestSummary,
        responseStatus: 502,
        error,
      });
      return NextResponse.json(
        {
          error: "Video scoring failed during analysis",
          details:
            error.details ||
            "The model returned an invalid scoring payload for the 6-axis evaluation step.",
          stage: error.stage || "scoreVideoAxes",
          debug: {
            raw_model_snippet: error.rawText || null,
            api: {
              provider: "Google Gemini + Replicate",
              models: ["gemini-3.1-pro-preview"],
              keys: [
                {
                  label: "GEMINI_API_KEY",
                  masked: maskSecret(process.env.GEMINI_API_KEY),
                },
                {
                  label: "REPLICATE_API_TOKEN",
                  masked: maskSecret(process.env.REPLICATE_API_TOKEN),
                },
              ],
              analysis_log_file: analysisLogFile,
            },
          },
        },
        { status: 502 },
      );
    }
    if (error?.code === "MEDIA_TOOL_MISSING") {
      const analysisLogFile = await writeDecisionLayerAnalysisLog({
        route: "/api/decision-layer-video/evaluate",
        mediaType: "video",
        status: "error",
        startedAt,
        request: requestSummary,
        responseStatus: 503,
        error,
      });
      return NextResponse.json(
        {
          error: "Video analysis is not configured on this machine yet",
          details:
            error.message ||
            "ffmpeg/ffprobe is required to extract frames and audio.",
          setup: {
            missingTool: error.tool || "ffmpeg",
            resolvedPath: error.resolvedPath || null,
            nextStep:
              "Install ffmpeg and ffprobe, or set FFMPEG_PATH and FFPROBE_PATH to valid executable paths.",
          },
          debug: {
            api: {
              provider: "Google Gemini + Replicate",
              models: ["gemini-3.1-pro-preview"],
              keys: [
                {
                  label: "GEMINI_API_KEY",
                  masked: maskSecret(process.env.GEMINI_API_KEY),
                },
                {
                  label: "REPLICATE_API_TOKEN",
                  masked: maskSecret(process.env.REPLICATE_API_TOKEN),
                },
              ],
            },
            analysis_log_file: analysisLogFile,
          },
        },
        { status: 503 },
      );
    }
    const analysisLogFile = await writeDecisionLayerAnalysisLog({
      route: "/api/decision-layer-video/evaluate",
      mediaType: "video",
      status: "error",
      startedAt,
      request: requestSummary,
      responseStatus: 500,
      error,
    });
    return NextResponse.json(
      {
        error: "Failed to evaluate video content",
        details: error.message,
        debug: {
          api: {
            provider: "Google Gemini + Replicate",
            models: ["gemini-3.1-pro-preview"],
            keys: [
              {
                label: "GEMINI_API_KEY",
                masked: maskSecret(process.env.GEMINI_API_KEY),
              },
              {
                label: "REPLICATE_API_TOKEN",
                masked: maskSecret(process.env.REPLICATE_API_TOKEN),
              },
            ],
            analysis_log_file: analysisLogFile,
          },
        },
      },
      { status: 500 },
    );
  }
}
// ── Creator context builder ──────────────────────────────────────────────
function buildCreatorContext(
  contextSummary: string,
  userConcern: string | null,
): CreatorContext {
  const lower = contextSummary.toLowerCase();
  const context: CreatorContext = {};
  if (lower.includes("sell") || lower.includes("monetize")) {
    context.goal = "sell content";
  } else if (lower.includes("commission") || lower.includes("client")) {
    context.goal = "get commissions";
  } else if (lower.includes("audience") || lower.includes("grow")) {
    context.goal = "build audience";
  }
  if (lower.includes("brand") || lower.includes("agency")) {
    context.buyer = "brands and agencies";
  } else if (lower.includes("game") || lower.includes("indie")) {
    context.buyer = "indie game studios";
  }
  if (lower.includes("beginner") || lower.includes("new to")) {
    context.qualityLevel = "beginner";
  } else if (lower.includes("professional") || lower.includes("expert")) {
    context.qualityLevel = "professional";
  } else {
    context.qualityLevel = "intermediate";
  }
  if (userConcern === "pricing") context.blocker = "pricing confusion";
  else if (userConcern === "consistency")
    context.blocker = "inconsistent style";
  else if (userConcern === "time") context.blocker = "packaging takes too long";
  else if (userConcern === "platform") context.blocker = "unsure where to sell";
  else if (userConcern === "quality") context.blocker = "unsure about quality";
  return context;
}
