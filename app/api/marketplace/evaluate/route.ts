import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { analyzeImageCommerce } from "@/app/api/marketplace/analyze/image-analysis";
import { analyzeVideoCommerce } from "@/app/api/marketplace/analyze/video-analysis";
import { analyzeAudioCommerce } from "@/app/api/marketplace/analyze/audio-analysis";
import { analyzeTextCommerce } from "@/app/api/marketplace/analyze/text-analysis";
import type { CommerceAnalysisResult } from "@/app/api/marketplace/analyze/types";
import { serverLog } from "@/lib/debugLogs";

export const maxDuration = 300;

async function markTempAsset(
  id: string | null,
  updates: Record<string, unknown>,
) {
  if (!id) return;
  await supabaseAdmin.from("temp_assets").update(updates).eq("id", id);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  const tempAssetId = (formData.get("tempAssetId") as string | null) || null;
  const storagePath = (formData.get("storagePath") as string | null) || null;
  const bucketName =
    (formData.get("bucketName") as string | null) || "asset-temp";

  if (files.length !== 1) {
    return NextResponse.json(
      { success: false, error: "Upload exactly one file." },
      { status: 400 },
    );
  }

  const file = files[0];
  await markTempAsset(tempAssetId, { analysis_status: "analyzing" });

  try {
    serverLog("KAIZORA_LOG_API_MARKETPLACE_EVALUATE", "info", "[marketplace/evaluate] starting", {
      name: file.name,
      type: file.type,
      sizeMB: Number((file.size / 1024 / 1024).toFixed(2)),
      tempAssetId,
    });

    let result: CommerceAnalysisResult;

    if (file.type.startsWith("image/")) {
      result = await analyzeImageCommerce(file);
    } else if (file.type.startsWith("video/")) {
      result = await analyzeVideoCommerce(file);
    } else if (
      file.type.startsWith("audio/") ||
      /\.(mp3|wav|flac|m4a|aac|ogg|webm)$/i.test(file.name)
    ) {
      if (!storagePath) throw new Error("storagePath required for audio analysis.");
      const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucketName}/${storagePath}`;
      result = await analyzeAudioCommerce(file, audioUrl);
    } else {
      result = await analyzeTextCommerce(file);
    }

    // Persist score + verdict + full profile to temp_assets row
    await markTempAsset(tempAssetId, {
      analysis_status: "completed",
      readiness_score: result.commerce_readiness_score,
      readiness_verdict: result.readiness_verdict,
      analysis_completed_at: new Date().toISOString(),
      commerce_profile: result,
    });

    const modelsUsed = file.type.startsWith("image/")
      ? ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite"]
      : file.type.startsWith("video/")
        ? ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite"]
        : file.type.startsWith("audio/") ||
            /\.(mp3|wav|flac|m4a|aac|ogg|webm)$/i.test(file.name)
          ? ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite", "replicate"]
          : ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite"];

    serverLog("KAIZORA_LOG_API_MARKETPLACE_EVALUATE", "info", "[marketplace/evaluate] completed", {
      tempAssetId,
      score: result.commerce_readiness_score,
      verdict: result.readiness_verdict,
      modelsUsed,
    });

    return NextResponse.json({
      success: true,
      profile: {
        commerce_readiness_score:          result.commerce_readiness_score,
        listing_readiness_status:          result.listing_readiness_status,
        readiness_verdict:                 result.readiness_verdict,
        recommended_next_commerce_action:  result.recommended_next_commerce_action,
        suggested_price_band:              result.suggested_price_band,
        suggested_categories:              result.suggested_categories,
        suggested_tags:                    result.suggested_tags,
        suggested_license_type:            result.suggested_license_type,
        content_description:               result.content_description,
        listing_description:               result.listing_description,
        quality_score:                     result.quality_score,
        top_strength:                      result.top_strength,
        top_weakness:                      result.top_weakness,
        readiness_axes:                    result.readiness_axes,
      },
      debug: {
        models_used: modelsUsed,
        tempAssetId,
      },
    });
  } catch (error: any) {
    serverLog("KAIZORA_LOG_API_MARKETPLACE_EVALUATE", "error", "[marketplace/evaluate] failed", error);

    await markTempAsset(tempAssetId, { analysis_status: "failed" });

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Commerce analysis failed. Please try again.",
      },
      { status: 500 },
    );
  }
}
