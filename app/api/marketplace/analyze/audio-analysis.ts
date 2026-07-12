import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import Replicate from "replicate";
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

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MARKETPLACE_ANALYSIS_MODEL = "gemini-3.1-pro-preview";
const MARKETPLACE_SUPPORT_MODEL = "gemini-3.1-flash-lite";

const AUDIO_AXES: Record<string, string> = {
  soundQuality:       "Sound Quality",
  composition:        "Composition & Arrangement",
  emotionalImpact:    "Emotional Impact",
  audienceFit:        "Audience Fit",
  originality:        "Originality",
  packagingReadiness: "Packaging Readiness",
};

// ── Replicate: Genre classification ──────────────────────────────────────────
async function classifyGenre(audioUrl: string, replicate: Replicate) {
  try {
    const output: any = await replicate.run(
      "mtg/effnet-discogs:1532dd069fb4f0e27c6833e28815f6b8c194dfec76fd9cd73460540fd720ffe1",
      { input: { audio: audioUrl, top_n: 6, output_format: "JSON" } },
    );
    const fileUrl = output.url();
    const res = await fetch(fileUrl);
    const result = await res.json();
    const genres = Object.entries(result)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 6)
      .map(([key, value]: [string, any]) => ({
        genre: key.replace("---", " → "),
        confidence: Math.round((value as number) * 100),
      }));
    console.log("[commerce/audio] genre classification done —", genres.length, "genres");
    return genres;
  } catch (e) {
    console.warn("[commerce/audio] genre classification failed:", e);
    return [];
  }
}

// ── Replicate: Structure (BPM + key + sections) ───────────────────────────────
async function analyzeStructure(audioUrl: string, replicate: Replicate) {
  try {
    const output: any = await replicate.run(
      "cwalo/all-in-one-music-structure-analysis:6deeba047db17da69e9826c0285cd137cd2a81af05eb44ff496b7acd69b3a383",
      { input: { music_input: audioUrl, visualize: false, demix: false } },
    );
    const files = output as any[];
    const fileUrl = files[0].url();
    const res = await fetch(fileUrl);
    const result = await res.json();
    const bpm = Math.round((result.bpm || result.tempo || 0) * 10) / 10;
    const key = result.key || "unknown";
    const sections = (result.segments || result.sections || []).map((s: any) => ({
      section: s.label || s.section || "unknown",
      startTime: s.start || 0,
      endTime: s.end || 0,
    }));
    console.log(`[commerce/audio] structure done — BPM: ${bpm}, Key: ${key}, ${sections.length} sections`);
    return { bpm, key, sections };
  } catch (e) {
    console.warn("[commerce/audio] structure analysis failed:", e);
    return { bpm: 0, key: "unknown", sections: [] as any[] };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
export async function analyzeAudioCommerce(
  file: File,
  audioUrl: string,
): Promise<CommerceAnalysisResult> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

  // ── Run 2 ML models in parallel (same approach as Decision Layer) ──
  console.log("[commerce/audio] Running ML models in parallel...");
  const [genres, structure] = await Promise.all([
    classifyGenre(audioUrl, replicate),
    analyzeStructure(audioUrl, replicate),
  ]);
  console.log("[commerce/audio] ML complete");

  // Build compact ML summary for Gemini calls
  const genreText = genres.length
    ? genres.map((g) => `${g.genre} (${g.confidence}%)`).join(", ")
    : "No genres detected";
  const structureText = `BPM: ${structure.bpm || "unknown"} | Key: ${structure.key} | Sections: ${structure.sections.length}`;

  const mlBlock = `GENRE: ${genreText}\nSTRUCTURE: ${structureText}`;

  // ── Call 1: Description + quality (pro, 800 tokens) ──────────────────────
  console.log("[commerce/audio] Call 1: description");
  const c1 = await genai
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

Analyze this audio for marketplace readiness using the ML signal data below.
Do NOT fabricate — base description on the ML data only.

${mlBlock}

{
  "quality_score": <1-10>,
  "content_description": "<2-3 sentences: genre, mood, tempo feel, production impression — based on ML data>",
  "top_strength": "<single most commercially valuable quality>",
  "top_weakness": "<single biggest thing holding it back from selling>"
}`,
      },
    ]);
  logGeminiUsage(c1, { feature: "marketplace_analyze_audio", model: MARKETPLACE_ANALYSIS_MODEL });
  const call1 = safeParse(c1.response.text());
  const quality_score = Math.round(((call1.quality_score ?? 5) / 10) * 100);
  console.log("[commerce/audio] Call 1 done — score:", quality_score);

  // ── Call 2 + 2.5: parallel scoring and metadata ───────────────────────────
  console.log("[commerce/audio] Call 2: 6-axis");
  console.log("[commerce/audio] Call 2.5: metadata");
  const [c2, c25] = await Promise.all([
    genai
      .getGenerativeModel({
        model: MARKETPLACE_SUPPORT_MODEL,
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0,
          responseMimeType: "application/json",
        },
      })
      .generateContent([
        {
          text: `${COMMERCE_PERSONA}

Audio: ${call1.content_description}
${mlBlock}
Quality: ${quality_score}%

Use this scale strictly:
- 1 = broken, unusable, or clear commercial failure
- 2 = weak and needs substantial improvement
- 3 = competent, average, or commercially usable but common
- 4 = strong and sellable with minor improvements
- 5 = exceptional, highly polished, and commercially standout

Do not give 1 unless the asset clearly fails on that axis.
Score on 6 commerce axes (1-5). One sentence each. Base on ML data.

{
  "soundQuality":       { "score": <1-5>, "note": "<1 sentence>" },
  "composition":        { "score": <1-5>, "note": "<1 sentence>" },
  "emotionalImpact":    { "score": <1-5>, "note": "<1 sentence>" },
  "audienceFit":        { "score": <1-5>, "note": "<1 sentence>" },
  "originality":        { "score": <1-5>, "note": "<1 sentence>" },
  "packagingReadiness": { "score": <1-5>, "note": "<1 sentence>" }
}`,
        },
      ]),
    genai
      .getGenerativeModel({
        model: MARKETPLACE_SUPPORT_MODEL,
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0,
          responseMimeType: "application/json",
        },
      })
      .generateContent([
        {
          text: `${COMMERCE_PERSONA}

Audio: ${call1.content_description}
${mlBlock}
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
      ]),
  ]);
  const { axes: readiness_axes, score: commerce_readiness_score } = buildAxes(
    (logGeminiUsage(c2, { feature: "marketplace_analyze_audio", model: MARKETPLACE_SUPPORT_MODEL }), safeParse(c2.response.text())),
    AUDIO_AXES,
  );
  console.log("[commerce/audio] Call 2 done — readiness:", commerce_readiness_score);
  logGeminiUsage(c25, { feature: "marketplace_analyze_audio", model: MARKETPLACE_SUPPORT_MODEL });
  const call25 = safeParse(c25.response.text());
  console.log("[commerce/audio] Call 2.5 done");

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
