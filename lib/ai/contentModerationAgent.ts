import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import {
  extractVideoFrames,
  extractAudioTrack,
} from "@/app/api/decision-layer/utils/frame-extractor";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Multimodal model — handles images, video frames and audio.
const MODEL = "gemini-3.1-flash-lite";

// How many frames to sample across a video for the safety scan.
const VIDEO_FRAME_COUNT = 16;

// Hard cap on text-file content sent to the model (chars).
const TEXT_SCAN_CHAR_LIMIT = 30000;

export interface ModerationScores {
  nudity: number;
  violence: number;
  explicit_content: number;
  hate_speech: number;
  celebrity_likeness: number;
}

export interface ModerationResult {
  is_safe: boolean;
  severity: "none" | "medium" | "high";
  scores: ModerationScores;
  explanation: string;
  high_threshold: number;
  medium_threshold: number;
  /** What was actually inspected — useful for the admin panel / debugging. */
  scanned: string;
}

const ZERO_SCORES: ModerationScores = {
  nudity: 0,
  violence: 0,
  explicit_content: 0,
  hate_speech: 0,
  celebrity_likeness: 0,
};

// ── Thresholds ───────────────────────────────────────────────────────────────
async function getThresholds(): Promise<{ high: number; medium: number }> {
  try {
    const { data } = await supabaseAdmin
      .from("moderation_settings")
      .select("high_threshold, medium_threshold")
      .limit(1)
      .single();
    return {
      high: data?.high_threshold ?? 85,
      medium: data?.medium_threshold ?? 50,
    };
  } catch {
    return { high: 85, medium: 50 };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function clampScore(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function normalize(parsed: any): {
  scores: ModerationScores;
  explanation: string;
} {
  return {
    scores: {
      nudity: clampScore(parsed?.nudity),
      violence: clampScore(parsed?.violence),
      explicit_content: clampScore(parsed?.explicit_content),
      hate_speech: clampScore(parsed?.hate_speech),
      celebrity_likeness: clampScore(parsed?.celebrity_likeness),
    },
    explanation:
      typeof parsed?.explanation === "string" && parsed.explanation.trim()
        ? parsed.explanation.trim()
        : "Content scan completed",
  };
}

function publicUrl(path: string, bucket = "assets"): string {
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Guess an audio/image MIME type from a file extension. */
function mimeFromPath(path: string, fallback: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    mp3: "audio/mp3",
    mpeg: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/mp4",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[ext] || fallback;
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchInlineData(
  url: string,
  path: string,
  fallbackMime: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const header = (res.headers.get("content-type") || "").split(";")[0].trim();
    const mimeType =
      header && header !== "application/octet-stream"
        ? header
        : mimeFromPath(path, fallbackMime);
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { data, mimeType };
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, TEXT_SCAN_CHAR_LIMIT);
  } catch {
    return null;
  }
}

// ── Prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(
  asset: { content_type: string; title: string; description?: string | null },
  modalityInstruction: string,
): string {
  return `You are a STRICT content-moderation AI for KAIZORA, a digital asset marketplace.

Detect policy violations in the content provided. Score EACH category from 0 to 100:
- 0   = definitely absent
- 50  = uncertain / borderline
- 100 = clearly and obviously present

Categories:
- nudity: sexual nudity, exposed genitals, explicit sexual imagery, pornographic content. In audio: explicit sexual sounds.
- violence: graphic violence, gore, blood, brutal scenes, weapons used to harm people, or instructions to cause harm.
- explicit_content: strongly sexual but not fully nude, suggestive/NSFW material, explicit sexual lyrics or speech.
- hate_speech: hate symbols, slurs, or content targeting race, religion, gender, ethnicity or sexual orientation.
- celebrity_likeness: detect ANY real-world famous or publicly known person — this includes but is not limited to: Bollywood/Hollywood actors (Shah Rukh Khan, Salman Khan, Deepika Padukone, Tom Cruise, etc.), musicians (Taylor Swift, Arijit Singh, BTS, etc.), athletes (Virat Kohli, Cristiano Ronaldo, LeBron James, etc.), politicians & world leaders (Narendra Modi, Donald Trump, etc.), tech billionaires (Elon Musk, Jeff Bezos, etc.), social media influencers, news anchors, or ANY other person who could be considered a public figure with recognizable likeness rights. Also flag AI-generated or digitally altered images that clearly depict a real famous person. Score 90-100 if the identity is unmistakable. Score 60-89 if highly likely but not 100% certain. Score 30-59 if there is a reasonable resemblance. Score 0 only if there is absolutely no famous person present or it is purely fictional/animated with no real-world likeness.

Be precise and strict. Even partial nudity or mild violence MUST score above 0.

Asset context:
- Title: "${asset.title}"
- Type: ${asset.content_type}
- Description: "${asset.description || "none"}"

${modalityInstruction}

Return ONLY valid JSON, no markdown:
{
  "nudity": <integer 0-100>,
  "violence": <integer 0-100>,
  "explicit_content": <integer 0-100>,
  "hate_speech": <integer 0-100>,
  "celebrity_likeness": <integer 0-100>,
  "explanation": "<concise summary: name every policy violation found, identify any famous person by full name, and state why the content is flagged>"
}`;
}

async function runGemini(parts: any[], userId?: string | null): Promise<{
  scores: ModerationScores;
  explanation: string;
}> {
  const model = genAI.getGenerativeModel({ model: MODEL });
  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });
  logGeminiUsage(result, { feature: "moderation", model: MODEL, userId: userId ?? undefined });
  return normalize(JSON.parse(result.response.text()));
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function moderateAsset(asset: {
  id: string;
  content_type: string;
  storage_path: string;
  thumbnail_path?: string | null;
  title: string;
  description?: string | null;
  bucket?: string;
  user_id?: string | null;
}): Promise<ModerationResult> {
  const { high, medium } = await getThresholds();
  const type = (asset.content_type || "").toLowerCase();
  const bucket = asset.bucket || "assets";

  let scores: ModerationScores = { ...ZERO_SCORES };
  let explanation = "Content scan completed";
  let scanned = "metadata";

  try {
    // ── IMAGE — scan the real image ──────────────────────────────────────
    if (type === "image") {
      const img = await fetchInlineData(
        publicUrl(asset.storage_path, bucket),
        asset.storage_path,
        "image/jpeg",
      );
      if (img) {
        const prompt = buildPrompt(
          asset,
          "You are given the IMAGE ITSELF. Analyze every visible element.",
        );
        ({ scores, explanation } = await runGemini([
          { inlineData: img },
          { text: prompt },
        ], asset.user_id));
        scanned = "image";
      } else {
        throw new Error("image unavailable");
      }
    }

    // ── VIDEO — scan real frames + the audio track ───────────────────────
    else if (type === "video") {
      const buffer = await fetchBuffer(publicUrl(asset.storage_path, bucket));
      let frameParts: any[] = [];
      let audioPart: any = null;
      let frameCount = 0;
      let hasAudio = false;

      if (buffer) {
        const fileName = asset.storage_path.split("/").pop() || "video.mp4";
        try {
          const { frames } = await extractVideoFrames(
            buffer,
            fileName,
            VIDEO_FRAME_COUNT,
          );
          frameParts = frames.map((f) => ({
            inlineData: {
              mimeType: "image/jpeg",
              data: f.base64.startsWith("data:")
                ? f.base64.split(",")[1]
                : f.base64,
            },
          }));
          frameCount = frames.length;
        } catch (e) {
          console.warn("[moderation] video frame extraction failed", e);
        }
        try {
          const audio = await extractAudioTrack(buffer, fileName);
          if (audio.hasAudio && audio.audioBase64) {
            audioPart = {
              inlineData: { mimeType: "audio/mp3", data: audio.audioBase64 },
            };
            hasAudio = true;
          }
        } catch (e) {
          console.warn("[moderation] video audio extraction failed", e);
        }
      }

      if (frameParts.length > 0) {
        const prompt = buildPrompt(
          asset,
          `You are given ${frameCount} FRAMES sampled evenly across the entire video` +
            (hasAudio ? ", plus the video's AUDIO TRACK" : "") +
            `. Inspect EVERY frame${hasAudio ? " and listen to the audio" : ""}. ` +
            "A violation in ANY single frame or in the audio means the whole video is unsafe.",
        );
        const parts = [...frameParts];
        if (audioPart) parts.push(audioPart);
        parts.push({ text: prompt });
        ({ scores, explanation } = await runGemini(parts, asset.user_id));
        scanned = hasAudio
          ? `video (${frameCount} frames + audio)`
          : `video (${frameCount} frames)`;
      } else {
        // Frame extraction failed — fall back to the thumbnail.
        const thumb = asset.thumbnail_path
          ? await fetchInlineData(
              publicUrl(asset.thumbnail_path, bucket),
              asset.thumbnail_path,
              "image/jpeg",
            )
          : null;
        if (thumb) {
          const prompt = buildPrompt(
            asset,
            "Video frames were unavailable. You are given the video THUMBNAIL only.",
          );
          ({ scores, explanation } = await runGemini([
            { inlineData: thumb },
            { text: prompt },
          ], asset.user_id));
          scanned = "video (thumbnail fallback)";
        } else {
          throw new Error("video unavailable");
        }
      }
    }

    // ── AUDIO — scan the real audio file ─────────────────────────────────
    else if (type === "audio") {
      const audio = await fetchInlineData(
        publicUrl(asset.storage_path, bucket),
        asset.storage_path,
        "audio/mp3",
      );
      if (audio) {
        const prompt = buildPrompt(
          asset,
          "You are given the AUDIO FILE. Listen to the entire track — analyze " +
            "spoken words, lyrics and sounds for violations.",
        );
        ({ scores, explanation } = await runGemini([
          { inlineData: audio },
          { text: prompt },
        ], asset.user_id));
        scanned = "audio";
      } else {
        throw new Error("audio unavailable");
      }
    }

    // ── TEXT / CODE / PROMPT — scan the real file content ────────────────
    else if (type === "text" || type === "code" || type === "prompt") {
      const body = await fetchText(publicUrl(asset.storage_path, bucket));
      const prompt = buildPrompt(
        asset,
        body
          ? "You are given the FULL FILE CONTENT below. Analyze the actual " +
              "content for violations.\n\n--- FILE CONTENT ---\n" +
              body +
              "\n--- END OF FILE CONTENT ---"
          : "The file content could not be retrieved. Analyze the title and " +
              "description only.",
      );
      ({ scores, explanation } = await runGemini([{ text: prompt }], asset.user_id));
      scanned = body ? "file content" : "metadata";
    }

    // ── UNKNOWN TYPE — metadata only ─────────────────────────────────────
    else {
      const prompt = buildPrompt(
        asset,
        "Only the title and description are available for this asset.",
      );
      ({ scores, explanation } = await runGemini([{ text: prompt }], asset.user_id));
      scanned = "metadata";
    }
  } catch (e) {
    console.error("[moderation] scan failed — approving by default", e);
    // Fail-open: never block an upload because the scan errored.
    return {
      is_safe: true,
      severity: "none",
      scores: { ...ZERO_SCORES },
      explanation: "Moderation scan unavailable — approved by default",
      high_threshold: high,
      medium_threshold: medium,
      scanned: "unavailable",
    };
  }

  const maxScore = Math.max(
    scores.nudity,
    scores.violence,
    scores.explicit_content,
    scores.hate_speech,
  );

  // Celebrity likeness uses a stricter independent threshold:
  // any score ≥ 30 goes to admin review (medium), ≥ 70 is auto-blocked (high).
  const CELEB_HIGH = 70;
  const CELEB_MEDIUM = 30;

  let severity: "none" | "medium" | "high" = "none";
  if (maxScore >= high || scores.celebrity_likeness >= CELEB_HIGH) severity = "high";
  else if (maxScore >= medium || scores.celebrity_likeness >= CELEB_MEDIUM) severity = "medium";

  return {
    is_safe: severity === "none",
    severity,
    scores,
    explanation,
    high_threshold: high,
    medium_threshold: medium,
    scanned,
  };
}
