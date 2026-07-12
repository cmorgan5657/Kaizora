// Cost tracking for Fal.ai + Replicate generation calls.
// Logs to ai_usage_logs so the admin AI Costs page surfaces per-model spend.
import { supabaseAdmin } from "@/lib/supabaseServer";

// ─── Price map ───────────────────────────────────────────────────────────────
// Unit options:
//   "image"          → cost per image generated
//   "megapixel"      → cost per output megapixel
//   "second"         → cost per second of video/audio output
//   "compute_second" → cost per compute second (~runtime)
//   "run"            → cost per run (single shot)
//   "pixel_million"  → cost per million output pixels
export interface ModelPrice {
  provider: "fal" | "replicate" | "gemini";
  unit:
    | "image"
    | "megapixel"
    | "second"
    | "compute_second"
    | "run"
    | "pixel_million";
  amount_usd: number;
  label?: string;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // ── Fal.ai ─────────────────────────────────────────────────────────────────
  "fal-ai/flux/dev": { provider: "fal", unit: "megapixel", amount_usd: 0.025, label: "Flux Dev" },
  "fal-ai/flux-pro/v1.1": { provider: "fal", unit: "image", amount_usd: 0.05, label: "Flux 1.1 Pro" },
  "fal-ai/flux-pro/v1.1-ultra": { provider: "fal", unit: "image", amount_usd: 0.06, label: "Flux 1.1 Pro Ultra" },
  "fal-ai/ideogram/v2/turbo": { provider: "fal", unit: "image", amount_usd: 0.05, label: "Ideogram v2 Turbo" },
  "fal-ai/nano-banana-pro": { provider: "fal", unit: "image", amount_usd: 0.0398, label: "Nano Banana Pro" },
  "fal-ai/kling-video/v2.1/pro/image-to-video": { provider: "fal", unit: "second", amount_usd: 0.07, label: "Kling v2.5 Turbo Pro" },
  "fal-ai/minimax/hailuo-02/standard/image-to-video": { provider: "fal", unit: "second", amount_usd: 0.045, label: "MiniMax Hailuo-02 Standard" },
  "fal-ai/wan-i2v": { provider: "fal", unit: "second", amount_usd: 0.05, label: "Wan 2.1 i2v" },
  "bytedance/seedance-2.0/image-to-video": { provider: "fal", unit: "second", amount_usd: 0.3024, label: "SeedDance 2.0" },
  "fal-ai/minimax-music": { provider: "fal", unit: "run", amount_usd: 0.035, label: "MiniMax Music" },
  "fal-ai/stable-audio": { provider: "fal", unit: "compute_second", amount_usd: 0.000575, label: "Stable Audio (fal)" },
  "fal-ai/demucs": { provider: "fal", unit: "second", amount_usd: 0.0007, label: "Demucs" },

  // ── Replicate ──────────────────────────────────────────────────────────────
  "meta/musicgen": { provider: "replicate", unit: "run", amount_usd: 0.051, label: "MusicGen" },
  "suno-ai/bark": { provider: "replicate", unit: "run", amount_usd: 0.015, label: "Bark" },
  "sakemin/musicgen-remixer": { provider: "replicate", unit: "run", amount_usd: 0.53, label: "MusicGen Remixer" },
  "sakemin/musicgen-chord": { provider: "replicate", unit: "run", amount_usd: 0.32, label: "MusicGen Chord" },
  "resemble-ai/resemble-enhance": { provider: "replicate", unit: "run", amount_usd: 0.007, label: "Resemble Enhance" },
  "sakemin/audiosr-long-audio": { provider: "replicate", unit: "run", amount_usd: 0.10, label: "AudioSR" },
  "lucataco/ace-step": { provider: "replicate", unit: "run", amount_usd: 0.036, label: "ACE-Step" },
  "bytedance/flux-pulid": { provider: "replicate", unit: "run", amount_usd: 0.019, label: "Flux PULID" },
  "stability-ai/sdxl": { provider: "replicate", unit: "run", amount_usd: 0.0052, label: "SDXL" },
  "stability-ai/stable-audio": { provider: "replicate", unit: "run", amount_usd: 0.05, label: "Stable Audio" },
  "nightmareai/real-esrgan": { provider: "replicate", unit: "image", amount_usd: 0.002, label: "Real-ESRGAN" },
  "luma/modify-video": { provider: "replicate", unit: "pixel_million", amount_usd: 0.019, label: "Luma Modify Video" },
  "cjwbw/demucs": { provider: "replicate", unit: "run", amount_usd: 0.02, label: "Demucs (Replicate)" },
};

interface UsageMeta {
  /** number of images, seconds of output, runs, megapixels, compute_seconds, or millions of pixels — depending on the model's billing unit */
  units?: number;
  duration_seconds?: number;
  width?: number;
  height?: number;
  user_id?: string | null;
}

/**
 * Estimate cost for a generation call using the model's price unit.
 */
function estimateCost(modelId: string, meta: UsageMeta = {}): number {
  const price = MODEL_PRICES[modelId];
  if (!price) return 0;

  let units = meta.units ?? 1;

  switch (price.unit) {
    case "image":
      units = meta.units ?? 1;
      break;
    case "megapixel": {
      const w = meta.width || 1024;
      const h = meta.height || 1024;
      units = Math.max(1, Math.ceil((w * h) / 1_000_000));
      break;
    }
    case "second":
      units = meta.duration_seconds ?? meta.units ?? 5;
      break;
    case "compute_second":
      units = meta.duration_seconds ?? meta.units ?? 5;
      break;
    case "pixel_million": {
      const w = meta.width || 1024;
      const h = meta.height || 1024;
      const dur = meta.duration_seconds ?? 5;
      units = (w * h * dur) / 1_000_000;
      break;
    }
    case "run":
      units = 1;
      break;
  }

  return units * price.amount_usd;
}

/** Log a Fal.ai usage row. Fire-and-forget. */
export async function logFalUsage(
  modelId: string,
  meta: UsageMeta & { feature?: string } = {},
): Promise<void> {
  try {
    const price = MODEL_PRICES[modelId];
    if (!price) return;
    const cost_usd = estimateCost(modelId, meta);
    await supabaseAdmin.from("ai_usage_logs").insert({
      user_id: meta.user_id || null,
      feature: meta.feature || "generation",
      model: modelId,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cost_usd,
    });
  } catch (err) {
    console.error("[falUsage] log failed", err);
  }
}

/** Log a Replicate usage row. Fire-and-forget. */
export async function logReplicateUsage(
  modelId: string,
  meta: UsageMeta & { feature?: string } = {},
): Promise<void> {
  try {
    const price = MODEL_PRICES[modelId];
    if (!price) return;
    const cost_usd = estimateCost(modelId, meta);
    await supabaseAdmin.from("ai_usage_logs").insert({
      user_id: meta.user_id || null,
      feature: meta.feature || "generation",
      model: modelId,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cost_usd,
    });
  } catch (err) {
    console.error("[replicateUsage] log failed", err);
  }
}
