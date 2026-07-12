import { NextRequest, NextResponse } from "next/server";

import Replicate from "replicate";

import {
  analyzeImage,
  CreatorContext as ImageCreatorContext,
} from "@/app/api/decision-layer/analyze/image-analysis";
import {
  analyzeVideo,
  CreatorContext as VideoCreatorContext,
} from "@/app/api/decision-layer/analyze/video-analysis";
import {
  analyzeAudio,
  CreatorContext as AudioCreatorContext,
} from "@/app/api/decision-layer/analyze/audio-analysis";
import {
  analyzeText,
  CreatorContext as TextCreatorContext,
} from "@/app/api/decision-layer/analyze/text-analysis";
import {
  extractAudioTrack,
  extractVideoFrames,
} from "@/app/api/decision-layer/utils/frame-extractor";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const maxDuration = 300;

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

type SharedCreatorContext =
  | ImageCreatorContext
  | VideoCreatorContext
  | AudioCreatorContext
  | TextCreatorContext;

type LightweightProfile = {
  commerce_readiness_score: number;
  listing_readiness_status: "ready" | "needs_work";
  readiness_verdict: "ready" | "not-yet" | "not-ready";
  recommended_next_commerce_action: string;
};

function mapAlignmentVerdict(
  alignmentVerdict?: string | null,
): "ready" | "not-yet" | "not-ready" {
  if (alignmentVerdict === "monetize-now") return "ready";
  if (
    alignmentVerdict === "monetize-with-fixes" ||
    alignmentVerdict === "portfolio-only"
  ) {
    return "not-yet";
  }
  return "not-ready";
}

function buildLightweightProfile(
  score: number,
  readinessVerdict: "ready" | "not-yet" | "not-ready",
  nextAction: string,
): LightweightProfile {
  return {
    commerce_readiness_score: score,
    listing_readiness_status: score >= 70 ? "ready" : "needs_work",
    readiness_verdict: readinessVerdict,
    recommended_next_commerce_action: nextAction,
  };
}

async function markTempAsset(
  tempAssetId: string | null,
  updates: Record<string, unknown>,
) {
  if (!tempAssetId) return;

  await supabaseAdmin.from("temp_assets").update(updates).eq("id", tempAssetId);
}

// This route is intentionally small on the outside and heavyweight on the inside.
// The marketplace flow only needs readiness output, but we still reuse the same
// Decision Layer analyzers so the score quality stays aligned with the deeper flow.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const tempAssetId = (formData.get("tempAssetId") as string | null) || null;
  const storagePath = (formData.get("storagePath") as string | null) || null;
  const bucketName =
    (formData.get("bucketName") as string | null) || "asset-temp";
  const customPrompt = (formData.get("customPrompt") as string | null) || null;

  let creatorContext: SharedCreatorContext | undefined;
  let clientSignals: any = null;

  try {
    const creatorContextRaw = formData.get("creatorContext") as string | null;
    const clientSignalsRaw = formData.get("clientSignals") as string | null;
    creatorContext = creatorContextRaw
      ? (JSON.parse(creatorContextRaw) as SharedCreatorContext)
      : undefined;
    clientSignals = clientSignalsRaw ? JSON.parse(clientSignalsRaw) : null;
  } catch {
    creatorContext = undefined;
    clientSignals = null;
  }

  if (files.length !== 1) {
    return NextResponse.json(
      {
        success: false,
        error: "Upload exactly one file for lightweight analysis.",
      },
      { status: 400 },
    );
  }

  const file = files[0];
  const signal = Array.isArray(clientSignals)
    ? clientSignals[0] || null
    : clientSignals;

  await markTempAsset(tempAssetId, { analysis_status: "analyzing" });

  try {
    console.log("[lightweight/evaluate] starting");
    console.log("[lightweight/evaluate] file:", {
      name: file.name,
      type: file.type,
      sizeMB: Number((file.size / 1024 / 1024).toFixed(2)),
      tempAssetId,
    });

    let score = 0;
    let readinessVerdict: "ready" | "not-yet" | "not-ready" = "not-ready";
    let recommendedNextCommerceAction =
      "Run a deeper review before publishing this asset.";
    let contentType = "other";

    if (file.type.startsWith("image/")) {
      contentType = "image";
      const imageAnalysis = await analyzeImage(
        file,
        customPrompt,
        "",
        creatorContext as ImageCreatorContext | undefined,
        signal,
      );
      score = imageAnalysis.overallReadiness;
      readinessVerdict = mapAlignmentVerdict(imageAnalysis.alignmentVerdict);
      recommendedNextCommerceAction = imageAnalysis.topPainPoint;
    } else if (file.type.startsWith("video/")) {
      contentType = "video";
      const videoBuffer = Buffer.from(await file.arrayBuffer());
      const extraction = await extractVideoFrames(
        videoBuffer,
        file.name || "upload.mp4",
        40,
      );
      const frames = extraction.frames.map((frame) => ({
        base64: frame.base64,
        timestamp: parseFloat(frame.timestamp.replace(":", "")),
      }));
      const audioData = await extractAudioTrack(
        videoBuffer,
        file.name || "upload.mp4",
      );
      const videoAnalysis = await analyzeVideo(
        frames,
        extraction.duration,
        customPrompt,
        "",
        creatorContext as VideoCreatorContext | undefined,
        signal,
        audioData,
        replicate,
      );
      score = videoAnalysis.overallReadiness;
      readinessVerdict = mapAlignmentVerdict(videoAnalysis.alignmentVerdict);
      recommendedNextCommerceAction = videoAnalysis.topPainPoint;
    } else if (
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|flac|m4a|aac|ogg|webm)$/i.test(file.name)
    ) {
      contentType = "audio";
      const publicUrl = storagePath
        ? supabaseAdmin.storage.from(bucketName).getPublicUrl(storagePath).data
            .publicUrl
        : "";

      if (!publicUrl) {
        throw new Error(
          "Audio analysis needs a temp storage path so the existing model pipeline can read it.",
        );
      }

      const audioAnalysis = await analyzeAudio(
        file,
        publicUrl,
        replicate,
        creatorContext as AudioCreatorContext | undefined,
        signal?.durationSeconds || 0,
      );
      score = audioAnalysis.overallReadiness;
      readinessVerdict = mapAlignmentVerdict(audioAnalysis.alignmentVerdict);
      recommendedNextCommerceAction = audioAnalysis.topPainPoint;
    } else {
      contentType = "text";
      const textAnalysis = await analyzeText(
        file,
        customPrompt,
        "",
        creatorContext as TextCreatorContext | undefined,
        signal,
      );
      score = textAnalysis.overallReadiness;
      readinessVerdict = mapAlignmentVerdict(textAnalysis.alignmentVerdict);
      recommendedNextCommerceAction = textAnalysis.topPainPoint;
    }

    const profile = buildLightweightProfile(
      score,
      readinessVerdict,
      recommendedNextCommerceAction,
    );

    await markTempAsset(tempAssetId, {
      analysis_status: "completed",
      readiness_score: profile.commerce_readiness_score,
      readiness_verdict: profile.readiness_verdict,
      analysis_completed_at: new Date().toISOString(),
    });

    console.log("[lightweight/evaluate] completed", {
      tempAssetId,
      contentType,
      score,
      readinessVerdict,
    });

    return NextResponse.json({
      success: true,
      contentType,
      readiness: {
        score: profile.commerce_readiness_score,
        verdict: profile.readiness_verdict,
      },
      profile,
    });
  } catch (error: any) {
    console.error("[lightweight/evaluate] failed", error);

    await markTempAsset(tempAssetId, {
      analysis_status: "failed",
    });

    return NextResponse.json(
      {
        success: false,
        error:
          error?.code === "MEDIA_TOOL_MISSING"
            ? "Video analysis is not configured on this machine yet."
            : error?.message || "Lightweight analysis failed. Please try again.",
        details:
          error?.code === "MEDIA_TOOL_MISSING"
            ? "Install ffmpeg and ffprobe, or set FFMPEG_PATH and FFPROBE_PATH to valid executable paths."
            : undefined,
        setup:
          error?.code === "MEDIA_TOOL_MISSING"
            ? {
                missingTool: error.tool || "ffmpeg",
                resolvedPath: error.resolvedPath || null,
              }
            : undefined,
      },
      { status: error?.code === "MEDIA_TOOL_MISSING" ? 503 : 500 },
    );
  }
}
