export const CREDIT_COST_FALLBACKS: Record<string, number> = {
  decision_layer_image: 10,
  decision_layer_video: 16,
  decision_layer_text: 6,
  decision_layer_audio: 10,
  remix_image: 20,
  remix_audio: 24,
  remix_video_5s: 30,
  remix_video_10s: 50,
};

export function getFallbackCreditCost(
  action: string | null | undefined,
): number | null {
  if (!action) return null;
  return CREDIT_COST_FALLBACKS[action] ?? null;
}

export function getRemixCreditActionKey(
  mode: string,
  durationSeconds?: number,
): string {
  if (["video", "vid2vid"].includes(mode)) {
    return durationSeconds === 10 ? "remix_video_10s" : "remix_video_5s";
  }
  if (["audio", "aud2aud"].includes(mode)) return "remix_audio";
  return "remix_image";
}
