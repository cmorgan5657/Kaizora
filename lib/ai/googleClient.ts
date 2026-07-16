import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { getGoogleAiProvider } from "@/lib/ai/provider";
import { VertexGoogleGenerativeAI } from "@/lib/ai/vertex";

export function getGoogleAiClient() {
  if (getGoogleAiProvider() === "vertex") {
    return new VertexGoogleGenerativeAI();
  }

  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}
