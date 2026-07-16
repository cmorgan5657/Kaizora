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
} from "./types";

const genai = getGoogleAiClient();

const IMAGE_AXES: Record<string, string> = {
  creativeClarity:     "Creative Clarity",
  technicalQuality:    "Technical Quality",
  consistencyControl:  "Consistency Control",
  audienceFit:         "Audience Fit",
  differentiation:     "Differentiation",
  packagingReadiness:  "Packaging Readiness",
};

export async function analyzeImageCommerce(
  file: File,
): Promise<CommerceAnalysisResult> {
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mime = file.type as any;

  // ── Call 1: Content description + quality (pro, 1200 tokens) ─────────────
  console.log("[commerce/image] Call 1: description");
  const c1 = await genai
    .getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    })
    .generateContent([
      {
        text: `${COMMERCE_PERSONA}

Analyze this image for marketplace readiness. Be specific about what you actually see.

Respond in this EXACT JSON:
{
  "quality_score": <1-10>,
  "content_description": "<2-3 sentences: what this image shows, its visual style, and overall impression>",
  "top_strength": "<single most commercially valuable quality>",
  "top_weakness": "<single biggest thing holding it back from selling>"
}`,
      },
      { inlineData: { mimeType: mime, data: base64 } },
    ]);
  logGeminiUsage(c1, { feature: "marketplace_analyze_image", model: "gemini-3.1-pro-preview" });
  const call1 = safeParse(c1.response.text());
  const quality_score = Math.round(((call1.quality_score ?? 5) / 10) * 100);
  console.log("[commerce/image] Call 1 done — score:", quality_score);

  // ── Call 2: 6-axis scoring (flash, 800 tokens) ────────────────────────────
  console.log("[commerce/image] Call 2: 6-axis");
  const c2 = await genai
    .getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    })
    .generateContent([
      {
        text: `${COMMERCE_PERSONA}

Image: ${call1.content_description}
Quality: ${quality_score}%

Score on 6 commerce axes (1-5 each). One sentence justification per axis.

{
  "creativeClarity":    { "score": <1-5>, "note": "<1 sentence>" },
  "technicalQuality":   { "score": <1-5>, "note": "<1 sentence>" },
  "consistencyControl": { "score": <1-5>, "note": "<1 sentence>" },
  "audienceFit":        { "score": <1-5>, "note": "<1 sentence>" },
  "differentiation":    { "score": <1-5>, "note": "<1 sentence>" },
  "packagingReadiness": { "score": <1-5>, "note": "<1 sentence>" }
}`,
      },
    ]);
  const { axes: readiness_axes, score: commerce_readiness_score } = buildAxes(
    (logGeminiUsage(c2, { feature: "marketplace_analyze_image", model: "gemini-3-flash-preview" }), safeParse(c2.response.text())),
    IMAGE_AXES,
  );
  console.log("[commerce/image] Call 2 done — readiness:", commerce_readiness_score);

  // ── Call 2.5: Marketplace metadata (pro, 800 tokens) ─────────────────────
  console.log("[commerce/image] Call 2.5: metadata");
  const c25 = await genai
    .getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    })
    .generateContent([
      {
        text: `${COMMERCE_PERSONA}

Image: ${call1.content_description}
Readiness: ${commerce_readiness_score}%
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
      { inlineData: { mimeType: mime, data: base64 } },
    ]);
  logGeminiUsage(c25, { feature: "marketplace_analyze_image", model: "gemini-3.1-pro-preview" });
  const call25 = safeParse(c25.response.text());
  console.log("[commerce/image] Call 2.5 done");

  // ── Call 3: Verdict + next action (flash, 400 tokens) ────────────────────
  console.log("[commerce/image] Call 3: verdict");
  const c3 = await genai
    .getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        maxOutputTokens: 400,
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    })
    .generateContent([
      {
        text: `${COMMERCE_PERSONA}

Readiness score: ${commerce_readiness_score}%
Top weakness: ${call1.top_weakness}

{
  "readiness_verdict": "<ready|not-yet|not-ready>",
  "recommended_next_commerce_action": "<one specific actionable sentence>"
}`,
      },
    ]);
  logGeminiUsage(c3, { feature: "marketplace_analyze_image", model: "gemini-3-flash-preview" });
  const call3 = safeParse(c3.response.text());
  console.log("[commerce/image] Call 3 done");

  const alignmentVerdict = deriveVerdict(commerce_readiness_score);

  return {
    content_description:               call1.content_description ?? "",
    quality_score,
    top_strength:                       call1.top_strength ?? "",
    top_weakness:                       call1.top_weakness ?? "",
    readiness_axes,
    commerce_readiness_score,
    suggested_price_band:               call25.suggested_price_band ?? "starter($5-15)",
    suggested_categories:               call25.suggested_categories ?? [],
    suggested_tags:                     call25.suggested_tags ?? [],
    suggested_license_type:             call25.suggested_license_type ?? "cc",
    listing_description:                call25.listing_description ?? "",
    readiness_verdict:
      call3.readiness_verdict ?? fallbackVerdict(commerce_readiness_score),
    recommended_next_commerce_action:
      call3.recommended_next_commerce_action ?? "Review and improve before publishing.",
    listing_readiness_status:           commerce_readiness_score >= 60 ? "ready" : "needs_work",
    alignmentVerdict,
  };
}
