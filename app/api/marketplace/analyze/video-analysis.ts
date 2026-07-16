import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiClient } from "@/lib/ai/googleClient";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import {
  COMMERCE_PERSONA,
  PRICE_BANDS,
  LICENSE_TYPES,
  CommerceAnalysisResult,
  safeParse,
  buildAxes,
  deriveVerdict,
  fallbackVerdict,
  fallbackNextAction,
} from "./types";
import {
  extractVideoFrames,
  extractAudioTrack,
} from "@/app/api/decision-layer/utils/frame-extractor";

const genai = getGoogleAiClient();
const MARKETPLACE_ANALYSIS_MODEL = "gemini-3.1-pro-preview";
const MARKETPLACE_SUPPORT_MODEL = "gemini-3.1-flash-lite";

const VIDEO_AXES: Record<string, string> = {
  visualStorytelling: "Visual Storytelling",
  technicalQuality:   "Technical Quality",
  pacingAndFlow:      "Pacing & Flow",
  audienceFit:        "Audience Fit",
  originality:        "Originality",
  packagingReadiness: "Packaging Readiness",
};

export async function analyzeVideoCommerce(
  file: File,
): Promise<CommerceAnalysisResult> {
  const videoBuffer = Buffer.from(await file.arrayBuffer());

  // Extract 20 frames — wrapped so a single frame error doesn't kill the whole analysis
  let frames: { base64: string; timestamp: number }[] = [];
  let durationRaw: number | undefined;
  let hasAudio = false;

  try {
    const extraction = await extractVideoFrames(videoBuffer, file.name || "upload.mp4", 20);
    frames = extraction.frames.map((f) => ({
      base64: f.base64,
      timestamp: parseFloat(f.timestamp.replace(":", "")),
    }));
    durationRaw = extraction.duration;
  } catch (e) {
    console.warn("[commerce/video] frame extraction failed, continuing without frames:", e);
  }

  try {
    const audioData = await extractAudioTrack(videoBuffer, file.name || "upload.mp4");
    hasAudio = !!audioData;
  } catch {
    // audio extraction optional — ignore
  }

  // Call 1 uses all frames (same as DL description call)
  const allFrameParts = frames.map((f) => {
    const b64 = f.base64.startsWith("data:") ? f.base64.split(",")[1] : f.base64;
    return { inlineData: { mimeType: "image/jpeg" as any, data: b64 } };
  });

  // Calls 2+ use 3 key frames: start, middle, end (same as DL scoring calls)
  const keyFrames: typeof frames =
    frames.length <= 3
      ? frames
      : [frames[0], frames[Math.floor(frames.length / 2)], frames[frames.length - 1]];
  const keyFrameParts = keyFrames.map((f) => {
    const b64 = f.base64.startsWith("data:") ? f.base64.split(",")[1] : f.base64;
    return { inlineData: { mimeType: "image/jpeg" as any, data: b64 } };
  });

  const durationLabel = durationRaw ? `${Math.round(durationRaw)}s` : "unknown duration";

  // ── Call 1: Content description + quality (pro, 1200 tokens) ─────────────
  console.log("[commerce/video] Call 1: description");
  const c1 = await genai
    .getGenerativeModel({
      model: MARKETPLACE_ANALYSIS_MODEL,
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0,
        responseMimeType: "application/json",
      },
    })
    .generateContent([
      {
        text: `${COMMERCE_PERSONA}

Analyze these video frames for marketplace readiness.
Video duration: ${durationLabel}. Frames provided: ${frames.length}.
${hasAudio ? "Audio track present." : "No audio track detected."}

Respond in this EXACT JSON:
{
  "quality_score": <1-10>,
  "content_description": "<2-3 sentences: what this video shows, its visual style, pacing feel, and overall impression>",
  "top_strength": "<single most commercially valuable quality>",
  "top_weakness": "<single biggest thing holding it back from selling>"
}`,
      },
      ...allFrameParts,
    ]);
  logGeminiUsage(c1, { feature: "marketplace_analyze_video", model: MARKETPLACE_ANALYSIS_MODEL });
  const call1 = safeParse(c1.response.text());
  const quality_score = Math.round(((call1.quality_score ?? 5) / 10) * 100);
  console.log("[commerce/video] Call 1 done — score:", quality_score);

  // ── Call 2 + 2.5: parallel scoring and metadata ───────────────────────────
  console.log("[commerce/video] Call 2: 6-axis");
  console.log("[commerce/video] Call 2.5: metadata");
  const [c2, c25] = await Promise.all([
    genai
      .getGenerativeModel({
        model: MARKETPLACE_SUPPORT_MODEL,
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0,
          responseMimeType: "application/json",
        },
      })
      .generateContent([
        {
          text: `${COMMERCE_PERSONA}

Video: ${call1.content_description}
Duration: ${durationLabel}
Quality: ${quality_score}%

You are scoring the ACTUAL VIDEO FRAMES, not just the summary.
Use this scale strictly:
- 1 = broken, unusable, or clear commercial failure
- 2 = weak and needs substantial improvement
- 3 = competent, average, or commercially usable but common
- 4 = strong and sellable with minor improvements
- 5 = exceptional, highly polished, and commercially standout

Do not give 1 unless the asset clearly fails on that axis.
Score on 6 commerce axes (1-5 each). One sentence justification per axis.

{
  "visualStorytelling": { "score": <1-5>, "note": "<1 sentence>" },
  "technicalQuality":   { "score": <1-5>, "note": "<1 sentence>" },
  "pacingAndFlow":      { "score": <1-5>, "note": "<1 sentence>" },
  "audienceFit":        { "score": <1-5>, "note": "<1 sentence>" },
  "originality":        { "score": <1-5>, "note": "<1 sentence>" },
  "packagingReadiness": { "score": <1-5>, "note": "<1 sentence>" }
}`,
        },
        ...keyFrameParts,
      ]),
    genai
      .getGenerativeModel({
        model: MARKETPLACE_ANALYSIS_MODEL,
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0,
          responseMimeType: "application/json",
        },
      })
      .generateContent([
        {
          text: `${COMMERCE_PERSONA}

Video: ${call1.content_description}
Duration: ${durationLabel}
Quality: ${quality_score}%
Top strength: ${call1.top_strength}

Generate marketplace publishing metadata.
Price bands: ${PRICE_BANDS}
License types: ${LICENSE_TYPES}

{
  "suggested_price_band": "<price band>",
  "suggested_categories": ["<cat1>", "<cat2>"],
  "suggested_tags": ["<tag1>","<tag2>","<tag3>","<tag4>","<tag5>","<tag6>","<tag7>","<tag8>"],
  "suggested_license_type": "<license>",
  "listing_description": "<2 sentences ready to use as marketplace copy — what buyer gets and why it's valuable>"
}`,
        },
        ...keyFrameParts,
      ]),
  ]);
  logGeminiUsage(c2, { feature: "marketplace_analyze_video", model: MARKETPLACE_SUPPORT_MODEL });
  const { axes: readiness_axes, score: commerce_readiness_score } = buildAxes(
    safeParse(c2.response.text()),
    VIDEO_AXES,
  );
  console.log("[commerce/video] Call 2 done — readiness:", commerce_readiness_score);
  logGeminiUsage(c25, { feature: "marketplace_analyze_video", model: MARKETPLACE_ANALYSIS_MODEL });
  const call25 = safeParse(c25.response.text());
  console.log("[commerce/video] Call 2.5 done");

  const alignmentVerdict = deriveVerdict(commerce_readiness_score);
  const readinessVerdict = fallbackVerdict(commerce_readiness_score);

  return {
    content_description:              call1.content_description ?? "",
    quality_score,
    top_strength:                      call1.top_strength ?? "",
    top_weakness:                      call1.top_weakness ?? "",
    readiness_axes,
    commerce_readiness_score,
    suggested_price_band:              call25.suggested_price_band ?? "starter($5-15)",
    suggested_categories:              call25.suggested_categories ?? [],
    suggested_tags:                    call25.suggested_tags ?? [],
    suggested_license_type:            call25.suggested_license_type ?? "cc",
    listing_description:               call25.listing_description ?? "",
    readiness_verdict:                 readinessVerdict,
    recommended_next_commerce_action:  fallbackNextAction(commerce_readiness_score, call1.top_weakness),
    listing_readiness_status:          commerce_readiness_score >= 60 ? "ready" : "needs_work",
    alignmentVerdict,
  };
}
