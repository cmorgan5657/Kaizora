import { supabaseAdmin } from "@/lib/supabaseServer";

const ELEVENLABS_TTS_PRICES_USD_PER_1K_CHARS: Record<string, number> = {
  "eleven_multilingual_v2": 0.1,
};

export async function logElevenLabsTTSUsage({
  userId,
  modelId,
  characters,
}: {
  userId?: string | null;
  modelId: string;
  characters: number;
}): Promise<void> {
  try {
    const pricePer1K = ELEVENLABS_TTS_PRICES_USD_PER_1K_CHARS[modelId] ?? 0.1;
    const billableCharacters = Math.max(0, characters);
    const cost_usd = Math.round((billableCharacters / 1000) * pricePer1K * 1_000_000) / 1_000_000;

    await supabaseAdmin.from("ai_usage_logs").insert({
      user_id: userId || null,
      feature: "decision_layer_tts",
      model: modelId,
      input_tokens: billableCharacters,
      output_tokens: 0,
      total_tokens: billableCharacters,
      cost_usd,
    });
  } catch (err) {
    console.error("[elevenlabsUsage] log failed", err);
  }
}
