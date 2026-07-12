// Centralized Gemini token-usage + cost logger.
// Fire-and-forget: never throws, never blocks the caller.
//
// Every Gemini response (streaming or not) carries `usageMetadata` with the
// token counts. This helper reads those counts, converts them to a dollar
// estimate using the price map below, and writes one row into `ai_usage_logs`,
// tagged with which feature spent the money.
//
// Required SQL (run once in Supabase SQL editor):
//
//   create table if not exists ai_usage_logs (
//     id uuid primary key default gen_random_uuid(),
//     user_id uuid,                       -- nullable: some calls have no user (cron/agents)
//     feature text not null,              -- e.g. 'moderation' | 'decision_layer_image' | 'pricing_agent'
//     model text not null,                -- e.g. 'gemini-3.1-pro-preview' | 'gemini-3.1-flash-lite'
//     input_tokens int not null default 0,
//     output_tokens int not null default 0,
//     total_tokens int not null default 0,
//     cached_tokens int not null default 0,    -- cheaper cached-context prompt tokens
//     thinking_tokens int not null default 0,  -- reasoning tokens, billed as output
//     audio_tokens int not null default 0,     -- audio prompt tokens, billed at audio rate
//     cost_usd numeric(12,6) not null default 0,
//     created_at timestamptz not null default now()
//   );
//   create index if not exists ai_usage_logs_feature_idx on ai_usage_logs (feature, created_at desc);
//   create index if not exists ai_usage_logs_created_idx on ai_usage_logs (created_at desc);

import { supabaseAdmin } from "@/lib/supabaseServer";
import { serverLog } from "@/lib/debugLogs";
import { getGeminiTrace } from "@/lib/ai/gemini";

// ── Per-model pricing (USD per 1,000,000 tokens) ──────────────────────────────
// UPDATE THESE in one place if Google changes preview pricing.
// Unknown models fall back to DEFAULT_PRICE so cost is still estimated.
//
// To match Google's real billing we price each token component separately:
//   - inputText  : fresh (non-cached) text/image/video prompt tokens
//   - inputAudio : fresh audio prompt tokens (billed higher than text)
//   - cachedInput: cached-context prompt tokens (billed much cheaper)
//   - output     : output tokens — INCLUDING reasoning/"thinking" tokens
//   - highThreshold/highInput*/highOutput: the >200k-token prompt tier (Pro only)
interface ModelPrice {
  inputText: number;
  inputAudio: number;
  cachedInput: number;
  output: number;
  // Long-context tier (prompts above `highThreshold` tokens). Infinity = no tier.
  highThreshold: number;
  highInputText: number;
  highInputAudio: number;
  highCachedInput: number;
  highOutput: number;
}

const PRICING: Record<string, ModelPrice> = {
  // Gemini 3.1 Pro Preview — Standard tier. Source: ai.google.dev/pricing
  // ≤200k: input $2 / output $12 / cached (context) $0.20
  // >200k: input $4 / output $18
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
  // Gemini 3 Flash Preview — Standard paid tier. Source: ai.google.dev/pricing
  // input (text/img/video) $0.50 · audio input $1.00 · output $3.00
  // cached input ≈ $0.125 (¼ of input — verify against your invoice).
  // No documented long-context price jump → highThreshold = Infinity.
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

export interface GeminiUsageMeta {
  feature: string;
  model: string;
  userId?: string | null;
}

interface UsageBreakdown {
  input: number; // total prompt tokens (incl. cached)
  output: number; // candidate tokens (excl. thinking)
  thinking: number; // reasoning/"thoughts" tokens — billed as output
  cached: number; // cached-context prompt tokens — billed cheaper
  audio: number; // audio prompt tokens — billed at audio rate
  total: number; // grand total tokens
}

// Pulls usageMetadata out of whatever Gemini handed back. Accepts:
//   - a GenerateContentResult (has .response.usageMetadata)
//   - a response object directly (has .usageMetadata)
//   - the usageMetadata object itself
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

  // Audio prompt tokens come from the per-modality breakdown if present.
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

// Exact-ish cost: prices each token component the way Google bills it.
function estimateCost(model: string, u: UsageBreakdown): number {
  const p = PRICING[model] || DEFAULT_PRICE;
  const useHigh = u.input > p.highThreshold;
  const rInputText = useHigh ? p.highInputText : p.inputText;
  const rInputAudio = useHigh ? p.highInputAudio : p.inputAudio;
  const rCached = useHigh ? p.highCachedInput : p.cachedInput;
  const rOutput = useHigh ? p.highOutput : p.output;

  // Split the prompt: cached < — billed cheap; of the fresh remainder, audio
  // tokens bill at the audio rate, everything else at the text/img/video rate.
  const freshInput = Math.max(0, u.input - u.cached);
  const audioFresh = Math.min(u.audio, freshInput);
  const textFresh = Math.max(0, freshInput - audioFresh);

  const inputCost =
    textFresh * rInputText +
    audioFresh * rInputAudio +
    u.cached * rCached;

  // Output bill includes reasoning/"thinking" tokens.
  const outputCost = (u.output + u.thinking) * rOutput;

  const cost = (inputCost + outputCost) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000; // round to 6 dp
}

/**
 * Log one Gemini call's token usage + cost. Fire-and-forget.
 *
 * @param source  The Gemini result/response (e.g. `result` from generateContent,
 *                or `await stream.response` from generateContentStream).
 * @param meta    feature + model + optional userId.
 */
export async function logGeminiUsage(
  source: any,
  meta: GeminiUsageMeta,
): Promise<void> {
  try {
    const usage = extractUsage(source);
    if (!usage) return; // nothing to log

    const resolvedModel = source?.__modelUsed || meta.model;
    const trace = getGeminiTrace(source);
    const cost_usd = estimateCost(resolvedModel, usage);

    serverLog("KAIZORA_LOG_GEMINI_USAGE", "info", "[geminiUsage] call summary", {
      feature: meta.feature,
      requestedModel: trace?.requestedModel || meta.model,
      modelUsed: resolvedModel,
      usedFallback: trace?.usedFallback || false,
      fallbackModel: trace?.fallbackModel || null,
      retries: trace?.retries || 0,
      attempts:
        trace?.attempts.map((attempt) => ({
          label: attempt.label,
          model: attempt.model,
          outcome: attempt.outcome,
          durationMs: attempt.durationMs,
          status: attempt.status,
          statusText: attempt.statusText,
        })) || [],
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
      model: resolvedModel,
      input_tokens: usage.input,
      output_tokens: usage.output,
      total_tokens: usage.total,
      // exact-billing components (require the columns added via ALTER TABLE)
      cached_tokens: usage.cached,
      thinking_tokens: usage.thinking,
      audio_tokens: usage.audio,
      cost_usd,
    });
  } catch (err) {
    serverLog("KAIZORA_LOG_GEMINI_USAGE", "error", "[geminiUsage] log failed", err);
  }
}
