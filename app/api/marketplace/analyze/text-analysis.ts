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

const genai = getGoogleAiClient();
const MARKETPLACE_ANALYSIS_MODEL = "gemini-3.1-pro-preview";
const MARKETPLACE_SUPPORT_MODEL = "gemini-3.1-flash-lite";

const TEXT_AXES: Record<string, string> = {
  writingClarity:      "Writing Clarity",
  contentDepth:        "Content Depth",
  structuralCoherence: "Structural Coherence",
  audienceFit:         "Audience Fit",
  originality:         "Originality",
  packagingReadiness:  "Packaging Readiness",
};

export async function analyzeTextCommerce(
  file: File,
): Promise<CommerceAnalysisResult> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let textContent = "";
  let pdfBase64 = "";

  if (isPdf) {
    pdfBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    textContent = `[PDF: ${file.name}, ${(file.size / 1024 / 1024).toFixed(2)}MB]`;
  } else {
    textContent = await file.text();
    // Truncate to 8k words for commerce (lighter than DL's 15k)
    const words = textContent.split(/\s+/);
    if (words.length > 8000) {
      textContent =
        words.slice(0, 8000).join(" ") +
        `\n\n[TRUNCATED — original has ${words.length} words, showing first 8000]`;
    }
  }

  const call1Parts: any[] = [];
  const descriptionText = `${COMMERCE_PERSONA}

Analyze this text content for marketplace readiness. Be specific about what you actually read.

${isPdf ? "The PDF is attached. Read and analyze its contents." : `Text content:\n---\n${textContent}\n---`}

Respond in this EXACT JSON:
{
  "quality_score": <1-10>,
  "content_description": "<2-3 sentences: content type, main topic, writing style, and overall impression>",
  "top_strength": "<single most commercially valuable quality>",
  "top_weakness": "<single biggest thing holding it back from selling>"
}`;

  call1Parts.push({ text: descriptionText });
  if (isPdf && pdfBase64) {
    call1Parts.push({ inlineData: { mimeType: "application/pdf" as any, data: pdfBase64 } });
  }

  // ── Call 1: Content description + quality (pro, 1200 tokens) ─────────────
  console.log("[commerce/text] Call 1: description");
  const c1 = await genai
    .getGenerativeModel({
      model: MARKETPLACE_ANALYSIS_MODEL,
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0,
        responseMimeType: "application/json",
      },
    })
    .generateContent(call1Parts);
  logGeminiUsage(c1, { feature: "marketplace_analyze_text", model: MARKETPLACE_ANALYSIS_MODEL });
  const call1 = safeParse(c1.response.text());
  const quality_score = Math.round(((call1.quality_score ?? 5) / 10) * 100);
  console.log("[commerce/text] Call 1 done — score:", quality_score);

  const call25Parts: any[] = [
    {
      text: `${COMMERCE_PERSONA}

Content: ${call1.content_description}
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
  ];
  if (isPdf && pdfBase64) {
    call25Parts.push({ inlineData: { mimeType: "application/pdf" as any, data: pdfBase64 } });
  }

  // ── Call 2 + 2.5: parallel scoring and metadata ───────────────────────────
  console.log("[commerce/text] Call 2: 6-axis");
  console.log("[commerce/text] Call 2.5: metadata");
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

Content: ${call1.content_description}
Quality: ${quality_score}%

Use this scale strictly:
- 1 = broken, unusable, or clear commercial failure
- 2 = weak and needs substantial improvement
- 3 = competent, average, or commercially usable but common
- 4 = strong and sellable with minor improvements
- 5 = exceptional, highly polished, and commercially standout

Do not give 1 unless the content clearly fails on that axis.
Score on 6 commerce axes (1-5 each). One sentence justification per axis.

{
  "writingClarity":      { "score": <1-5>, "note": "<1 sentence>" },
  "contentDepth":        { "score": <1-5>, "note": "<1 sentence>" },
  "structuralCoherence": { "score": <1-5>, "note": "<1 sentence>" },
  "audienceFit":         { "score": <1-5>, "note": "<1 sentence>" },
  "originality":         { "score": <1-5>, "note": "<1 sentence>" },
  "packagingReadiness":  { "score": <1-5>, "note": "<1 sentence>" }
}`,
        },
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
      .generateContent(call25Parts),
  ]);
  const { axes: readiness_axes, score: commerce_readiness_score } = buildAxes(
    (logGeminiUsage(c2, { feature: "marketplace_analyze_text", model: MARKETPLACE_SUPPORT_MODEL }), safeParse(c2.response.text())),
    TEXT_AXES,
  );
  console.log("[commerce/text] Call 2 done — readiness:", commerce_readiness_score);
  logGeminiUsage(c25, { feature: "marketplace_analyze_text", model: MARKETPLACE_ANALYSIS_MODEL });
  const call25 = safeParse(c25.response.text());
  console.log("[commerce/text] Call 2.5 done");

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
