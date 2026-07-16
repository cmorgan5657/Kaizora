// Centralized Vertex Gemini token-usage + cost logger.
// Fire-and-forget: never throws, never blocks the caller.
//
// This mirrors geminiUsage so we can switch providers without disturbing the
// existing Gemini API Studio path. Models are stored as `vertex:<model>` in
// `ai_usage_logs` so the superadmin UI can distinguish Vertex spend.

import { supabaseAdmin } from "@/lib/supabaseServer";
import { serverLog } from "@/lib/debugLogs";

interface ModelPrice {
  inputText: number;
  inputAudio: number;
  cachedInput: number;
  output: number;
  highThreshold: number;
  highInputText: number;
  highInputAudio: number;
  highCachedInput: number;
  highOutput: number;
}

const PRICING: Record<string, ModelPrice> = {
  "gemini-3.1-pro-preview": {
    inputText: 2.0,
    inputAudio: 2.0,
    cachedInput: 0.2,
    output: 12.0,
    highThreshold: 200_000,
    highInputText: 4.0,
    highInputAudio: 4.0,
    highCachedInput: 0.4,
    highOutput: 18.0,
  },
  "gemini-3.1-flash-lite": {
    inputText: 0.5,
    inputAudio: 1.0,
    cachedInput: 0.125,
    output: 3.0,
    highThreshold: Infinity,
    highInputText: 0.5,
    highInputAudio: 1.0,
    highCachedInput: 0.125,
    highOutput: 3.0,
  },
};

const DEFAULT_PRICE: ModelPrice = PRICING["gemini-3.1-pro-preview"];

export interface VertexUsageMeta {
  feature: string;
  model: string;
  userId?: string | null;
}

interface UsageBreakdown {
  input: number;
  output: number;
  thinking: number;
  cached: number;
  audio: number;
  total: number;
}

function normalizeVertexModelName(model: string) {
  return model.replace(/^vertex:/, "").replace(/^models\//, "");
}

function toVertexStoredModel(model: string) {
  const normalized = normalizeVertexModelName(model);
  return `vertex:${normalized}`;
}

function extractUsage(source: any): UsageBreakdown | null {
  const meta =
    source?.response?.usageMetadata ??
    source?.usageMetadata ??
    (source?.promptTokenCount !== undefined ? source : null);
  if (!meta) return null;

  const input = meta.promptTokenCount || 0;
  const output = meta.candidatesTokenCount || 0;
  const thinking = meta.thoughtsTokenCount || 0;
  const cached = meta.cachedContentTokenCount || 0;

  let audio = 0;
  const details = meta.promptTokensDetails || meta.promptTokenDetails || [];
  if (Array.isArray(details)) {
    for (const d of details) {
      if (String(d?.modality || "").toUpperCase() === "AUDIO") {
        audio += d?.tokenCount || 0;
      }
    }
  }

  const total = meta.totalTokenCount || input + output + thinking;
  return { input, output, thinking, cached, audio, total };
}

function estimateCost(model: string, u: UsageBreakdown): number {
  const p = PRICING[normalizeVertexModelName(model)] || DEFAULT_PRICE;
  const useHigh = u.input > p.highThreshold;
  const rInputText = useHigh ? p.highInputText : p.inputText;
  const rInputAudio = useHigh ? p.highInputAudio : p.inputAudio;
  const rCached = useHigh ? p.highCachedInput : p.cachedInput;
  const rOutput = useHigh ? p.highOutput : p.output;

  const freshInput = Math.max(0, u.input - u.cached);
  const audioFresh = Math.min(u.audio, freshInput);
  const textFresh = Math.max(0, freshInput - audioFresh);

  const inputCost =
    textFresh * rInputText +
    audioFresh * rInputAudio +
    u.cached * rCached;

  const outputCost = (u.output + u.thinking) * rOutput;
  const cost = (inputCost + outputCost) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function logVertexUsage(
  source: any,
  meta: VertexUsageMeta,
): Promise<void> {
  try {
    const usage = extractUsage(source);
    if (!usage) return;

    const resolvedModel = normalizeVertexModelName(source?.__modelUsed || meta.model);
    const storedModel = toVertexStoredModel(resolvedModel);
    const cost_usd = estimateCost(resolvedModel, usage);

    serverLog("KAIZORA_LOG_VERTEX_USAGE", "info", "[vertexUsage] call summary", {
      feature: meta.feature,
      modelUsed: storedModel,
      usage: {
        input: usage.input,
        output: usage.output,
        thinking: usage.thinking,
        cached: usage.cached,
        audio: usage.audio,
        total: usage.total,
      },
      costUsd: cost_usd,
    });

    await supabaseAdmin.from("ai_usage_logs").insert({
      user_id: meta.userId || null,
      feature: meta.feature,
      model: storedModel,
      input_tokens: usage.input,
      output_tokens: usage.output,
      total_tokens: usage.total,
      cached_tokens: usage.cached,
      thinking_tokens: usage.thinking,
      audio_tokens: usage.audio,
      cost_usd,
    });
  } catch (err) {
    serverLog("KAIZORA_LOG_VERTEX_USAGE", "error", "[vertexUsage] log failed", err);
  }
}
