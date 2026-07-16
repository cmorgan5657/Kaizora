export type GoogleAiProvider = "gemini" | "vertex";

export function getGoogleAiProvider(): GoogleAiProvider {
  return process.env.KAIZORA_GOOGLE_AI_PROVIDER === "vertex" ? "vertex" : "gemini";
}

export function isVertexProvider() {
  return getGoogleAiProvider() === "vertex";
}

export function getGoogleAiProviderLabel() {
  return getGoogleAiProvider() === "vertex" ? "Vertex" : "Gemini";
}

export function getGoogleAiProviderDebugLabel() {
  return getGoogleAiProvider() === "vertex"
    ? "Google Cloud Vertex AI"
    : "Google Gemini";
}
