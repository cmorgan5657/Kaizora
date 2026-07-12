// app/api/decision-layer-audio/evaluate/route.ts
// KAIZORA Audio Intelligence — evaluation endpoint
import { NextRequest, NextResponse } from "next/server";

import Replicate from "replicate";
import {
  analyzeAudio,
  CreatorContext,
} from "../../../api/decision-layer/analyze/audio-analysis";
import { uploadAudioTempAndGetSignedUrl } from "@/lib/audioTempStorage";
import { canAfford, forceDeduct } from "@/lib/credits";
import {
  summarizeFiles,
  writeDecisionLayerAnalysisLog,
} from "@/lib/decisionLayerAnalysisLogs";
import { maskSecret } from "@/lib/replicateDebug";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export const maxDuration = 300; // 5 minutes max for audio processing

export async function POST(req: NextRequest) {
  const startedAt = new Date().toISOString();
  let requestSummary: Record<string, unknown> = {};

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const userId = formData.get("userId") as string;

    // Pre-check credits (don't deduct yet)
    let creditCost = 0;
    if (userId && userId !== "anonymous") {
      const check = await canAfford(userId, "decision_layer_audio");
      console.log("[credits] Decision Layer audio pre-check", {
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

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No audio files provided" },
        { status: 400 },
      );
    }

    const audioFile = files[0];
    const maxAudioSizeBytes = 100 * 1024 * 1024;

    // Validate audio file
    const validTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/flac",
      "audio/x-flac",
      "audio/m4a",
      "audio/x-m4a",
      "audio/mp4",
      "audio/aac",
      "audio/ogg",
      "audio/webm",
    ];

    if (!validTypes.some((t) => audioFile.type.includes(t.split("/")[1]))) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported audio format: ${audioFile.type}. Supported: MP3, WAV, FLAC, M4A, AAC, OGG, WebM`,
        },
        { status: 400 },
      );
    }

    if (audioFile.size > maxAudioSizeBytes) {
      return NextResponse.json(
        {
          success: false,
          error: "Audio file exceeds 100MB limit.",
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
    requestSummary = {
      userId: userId || "anonymous",
      customPrompt,
      creatorContext,
      files: summarizeFiles(files),
    };

    console.log("🔊 Audio evaluation request received");
    console.log(
      `   File: ${audioFile.name} (${(audioFile.size / 1024 / 1024).toFixed(2)}MB)`,
    );
    console.log(`   Type: ${audioFile.type}`);
    console.log(`   Creator context:`, creatorContext);
    console.log("   Replicate config:", {
      tokenConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
      tokenMasked: maskSecret(process.env.REPLICATE_API_TOKEN),
    });

    // ── Upload audio to temporary URL for Replicate ──
    // Replicate models need a URL, so we convert to base64 data URL
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = audioFile.type || "audio/mpeg";

    const fileName = `audio-${Date.now()}.mp3`;
    const { path: storagePath, signedUrl: audioUrl } =
      await uploadAudioTempAndGetSignedUrl(fileName, buffer, mimeType);
    console.log(`   Audio temp storage path: ${storagePath}`);

    // ── Get duration from client signals if available ──
    let durationSeconds = 0;
    try {
      const clientSignalsStr = formData.get("clientSignals") as string;
      if (clientSignalsStr) {
        const signals = JSON.parse(clientSignalsStr);
        const firstSignal = Array.isArray(signals) ? signals[0] : signals;
        durationSeconds = firstSignal?.durationSeconds || 0;
      }
    } catch {
      // ignore
    }

    // ── Run full audio analysis ──
    const audioAnalysis = await analyzeAudio(
      audioFile,
      audioUrl,
      replicate,
      creatorContext,
      durationSeconds,
    );

    // ── Build evaluation object (same shape as image/video for UI compatibility) ──
    const evaluation = {
      // Core decision fields
      decision:
        audioAnalysis.alignmentVerdict === "monetize-now"
          ? "yes"
          : audioAnalysis.alignmentVerdict === "monetize-with-fixes"
            ? "not-yet"
            : audioAnalysis.alignmentVerdict === "portfolio-only"
              ? "not-yet"
              : "no",
      title:
        audioAnalysis.alignmentVerdict === "monetize-now"
          ? "This audio is ready to sell"
          : audioAnalysis.alignmentVerdict === "monetize-with-fixes"
            ? "Almost there — a few improvements needed"
            : audioAnalysis.alignmentVerdict === "portfolio-only"
              ? "Portfolio quality — not yet market-ready"
              : audioAnalysis.alignmentVerdict === "hold-as-exploration"
                ? "Hold for now — needs significant work"
                : "Needs work before it's market-ready",
      honestAssessment: audioAnalysis.audioDescription,
      evidenceUsed: audioAnalysis.evidenceUsed,

      // Worth it
      worthIt: {
        verdict:
          audioAnalysis.alignmentVerdict === "monetize-now"
            ? "yes"
            : audioAnalysis.alignmentVerdict === "monetize-with-fixes"
              ? "maybe"
              : audioAnalysis.alignmentVerdict === "portfolio-only"
                ? "maybe"
                : "no",
        explanation: audioAnalysis.topPainPoint,
      },

      // 6-Axis
      readinessScores: audioAnalysis.readinessScores,
      overallReadiness: audioAnalysis.overallReadiness,
      alignmentVerdict: audioAnalysis.alignmentVerdict,

      // Coaching
      coachingRoadmap: audioAnalysis.coachingRoadmap,

      // Pricing
      pricingGuidance: {
        tiers: audioAnalysis.pricingTiers,
        currentTier: "Starter",
        currentRange: audioAnalysis.tieredPricing.starter.range,
        potentialRange: audioAnalysis.tieredPricing.premium.range,
        rationale: audioAnalysis.tieredPricing.upgradeJustification,
      },

      // Pain point
      topPainPoint: audioAnalysis.topPainPoint,

      // Where to start
      whereToStart: {
        priority:
          audioAnalysis.exactEdits?.[0]?.edit ||
          "Review your lowest-scoring axis",
        steps: audioAnalysis.fastestPath?.map((s) => s.step) || [],
      },

      // Content critique (adapted for audio)
      contentCritique: {
        strengths: [
          audioAnalysis.musicClassification.genres[0]
            ? `Clear ${audioAnalysis.musicClassification.genres[0].genre} identity (${audioAnalysis.musicClassification.genres[0].confidence}% confidence)`
            : "Audio uploaded successfully",
          audioAnalysis.musicStructure.bpm
            ? `Well-defined tempo at ${audioAnalysis.musicStructure.bpm} BPM`
            : "Tempo detected",
          audioAnalysis.musicClassification.instruments.length > 0
            ? `Rich instrumentation: ${audioAnalysis.musicClassification.instruments.slice(0, 3).join(", ")}`
            : "Audio content present",
        ],
        weaknesses: audioAnalysis.readinessScores
          .filter((s) => s.score <= 40)
          .map((s) => `${s.axis}: ${s.note}`),
        improvements: audioAnalysis.exactEdits?.map((e) => e.edit) || [],
      },

      // Next steps
      nextSteps:
        audioAnalysis.fastestPath?.map(
          (s) => `${s.step} (${s.timeEstimate})`,
        ) || [],

      // Real talk
      realTalk: `${audioAnalysis.overallReadiness}% overall readiness. ${audioAnalysis.musicClassification.isVocal ? "Vocal track" : "Instrumental"} — ${audioAnalysis.musicStructure.bpm || "unknown"} BPM in ${audioAnalysis.musicStructure.key || "unknown key"}. ${audioAnalysis.topPainPoint}`,

      // Phase 3 fields
      whatISaw: undefined, // Audio doesn't have visual
      whatIHeard: audioAnalysis.whatIHeard,
      whatYouToldMe: audioAnalysis.whatYouToldMe,
      realAlignment: audioAnalysis.realAlignment,
      myRecommendation: audioAnalysis.myRecommendation,
      exactEdits: audioAnalysis.exactEdits,
      honestPricing: audioAnalysis.honestPricing,
      fastestPath: audioAnalysis.fastestPath,
      evidenceDetails: audioAnalysis.evidenceDetails,
      closingQuestion: audioAnalysis.closingQuestion,
      fallbackEvaluation: audioAnalysis.fallbackEvaluation,

      // Audio-specific data
      audioIntelligence: {
        genres: audioAnalysis.musicClassification.genres,
        moods: audioAnalysis.musicClassification.moods,
        instruments: audioAnalysis.musicClassification.instruments,
        isVocal: audioAnalysis.musicClassification.isVocal,
        vocalGender: audioAnalysis.musicClassification.vocalGender,
        danceability: audioAnalysis.musicClassification.danceability,
        engagement: audioAnalysis.musicClassification.engagement,
        approachability: audioAnalysis.musicClassification.approachability,
        bpm: audioAnalysis.musicStructure.bpm,
        key: audioAnalysis.musicStructure.key,
        structure: audioAnalysis.musicStructure.structure,
        hasSpeech: audioAnalysis.hasSpeech,
        transcript: audioAnalysis.transcript,
      },
    };

    const analysisLogFile = await writeDecisionLayerAnalysisLog({
      route: "/api/decision-layer-audio/evaluate",
      mediaType: "audio",
      status: "success",
      startedAt,
      request: requestSummary,
      responseStatus: 200,
      result: {
        evaluation,
        audioAnalysis,
        audioUrl,
        durationSeconds,
        creditCost,
      },
    });

    // Deduct credits AFTER successful analysis
    if (userId && userId !== "anonymous" && creditCost > 0) {
      const deduction = await forceDeduct(
        userId,
        creditCost,
        "decision_layer_audio",
        "Decision Layer — Audio Analysis",
      );
      console.log("[credits] Decision Layer audio deduction result", {
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
    });
  } catch (error: any) {
    console.error("Audio evaluation error:", error);
    const analysisLogFile = await writeDecisionLayerAnalysisLog({
      route: "/api/decision-layer-audio/evaluate",
      mediaType: "audio",
      status: "error",
      startedAt,
      request: requestSummary,
      responseStatus: 500,
      error,
    });
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to evaluate audio",
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
