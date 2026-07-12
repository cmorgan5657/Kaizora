import { NextRequest, NextResponse } from "next/server";
import { logElevenLabsTTSUsage } from "@/lib/ai/elevenlabsUsage";
import { serverLog } from "@/lib/debugLogs";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

async function requestElevenTTS({
  apiKey,
  voiceId,
  modelId,
  text,
}: {
  apiKey: string;
  voiceId: string;
  modelId: string;
  text: string;
}) {
  serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "info", "[TTS] Sending ElevenLabs request", {
    voiceId,
    modelId,
    characters: text.length,
  });

  return fetch(
    `${ELEVENLABS_API_URL}/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const { text, userId } = await request.json();
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "info", "TTS request received", {
      textLength: text?.length,
      preview: text?.substring(0, 200),
      userId: userId || null,
    });

    if (!text) {
      serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "warn", "TTS error: No text provided");
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }
    // Clean text for more natural speech
    const cleanText = text
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#{1,6}\s/g, "")
      .replace(
        /🧩|📊|🎯|✅|⚡|💡|🔥|📋|💰|🎨|📈|🏷️|🚀|🎬|🔒|🎵|⏱️|👁️|🔊|✏️|→|←/g,
        "",
      )
      .replace(/[^\x00-\x7F]/g, " ") // catch any remaining non-ASCII including emojis
      .replace(/\n\n/g, ". ")
      .replace(/\n/g, ", ")
      .replace(/\s{2,}/g, " ")
      .trim();

    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "info", "TTS cleaned text", {
      cleanedLength: cleanText.length,
      cleanedPreview: cleanText.substring(0, 200),
    });

    // Skip TTS for very short or empty cleaned text
    if (cleanText.length < 5) {
      serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "warn", "TTS error: Text too short after cleaning");
      return NextResponse.json(
        { error: "Text too short for TTS" },
        { status: 400 },
      );
    }
    // Truncate to control TTS usage
    const truncated =
      cleanText.length > 800 ? cleanText.substring(0, 797) + "..." : cleanText;
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    const voiceId =
      (process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID).trim();
    const modelId =
      (process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID).trim();

    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "info", "[TTS] ElevenLabs config", {
      hasApiKey: Boolean(apiKey),
      voiceId,
      modelId,
      originalCharacters: text.length,
      cleanedCharacters: cleanText.length,
      billableCharacters: truncated.length,
    });

    if (!apiKey) {
      serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "error", "[TTS] Missing ELEVENLABS_API_KEY");
      return NextResponse.json(
        { error: "Missing ELEVENLABS_API_KEY" },
        { status: 500 },
      );
    }

    if (!voiceId || voiceId.length < 10) {
      serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "error", "[TTS] Invalid ELEVENLABS_VOICE_ID", { voiceId });
      return NextResponse.json(
        { error: "Invalid ELEVENLABS_VOICE_ID" },
        { status: 500 },
      );
    }

    let elevenRes = await requestElevenTTS({
      apiKey,
      voiceId,
      modelId,
      text: truncated,
    });

    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "info", "[TTS] ElevenLabs response", {
      ok: elevenRes.ok,
      status: elevenRes.status,
      statusText: elevenRes.statusText,
      voiceId,
      modelId,
    });

    // Common case: selected voice is not available to this API key/plan (402).
    // Retry once with a known default voice so TTS still works.
    if (!elevenRes.ok && voiceId !== DEFAULT_VOICE_ID && elevenRes.status === 402) {
      serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "warn", "[TTS] Retrying ElevenLabs with default voice", {
        failedVoiceId: voiceId,
        fallbackVoiceId: DEFAULT_VOICE_ID,
        status: elevenRes.status,
      });
      elevenRes = await requestElevenTTS({
        apiKey,
        voiceId: DEFAULT_VOICE_ID,
        modelId,
        text: truncated,
      });
      serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "info", "[TTS] ElevenLabs fallback response", {
        ok: elevenRes.ok,
        status: elevenRes.status,
        statusText: elevenRes.statusText,
        voiceId: DEFAULT_VOICE_ID,
        modelId,
      });
    }

    if (!elevenRes.ok) {
      const errorText = await elevenRes.text();
      serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "error", "[TTS] ElevenLabs failed", {
        status: elevenRes.status,
        statusText: elevenRes.statusText,
        voiceId,
        modelId,
        details: errorText,
      });
      return NextResponse.json(
        {
          error: "ElevenLabs TTS failed",
          details: errorText,
          voiceId,
          modelId,
          status: elevenRes.status,
        },
        { status: elevenRes.status || 500 },
      );
    }

    const audioBuffer = await elevenRes.arrayBuffer();
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "info", "[TTS] ElevenLabs audio received", {
      bytes: audioBuffer.byteLength,
      modelId,
      billableCharacters: truncated.length,
    });

    logElevenLabsTTSUsage({
      userId,
      modelId,
      characters: truncated.length,
    });
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "info", "[TTS] ElevenLabs usage log queued", {
      userId: userId || null,
      modelId,
      billableCharacters: truncated.length,
    });

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "error", "TTS FULL ERROR", error);
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "error", "TTS error message", { message });
    serverLog("KAIZORA_LOG_API_DECISION_LAYER_TTS", "error", "TTS error", error);
    return NextResponse.json(
      { error: "TTS failed", details: message },
      { status: 500 },
    );
  }
}
