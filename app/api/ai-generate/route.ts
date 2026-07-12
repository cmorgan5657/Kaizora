import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { fal } from "@fal-ai/client";

import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";
import { logFalUsage, logReplicateUsage } from "@/lib/ai/genUsage";
import sharp from "sharp";
import { canAfford, forceDeduct } from "@/lib/credits";
import { getRemixCreditActionKey } from "@/lib/creditPricing";
import { maskSecret } from "@/lib/replicateDebug";
import { uploadAudioTempAndGetSignedUrl } from "@/lib/audioTempStorage";

// Local thin wrappers so existing call sites don't need to import these.
// The userId is captured from the outer route closure where available.
let _currentRequestUserId: string | null = null;
function trackFalUsage(modelId: string, _amount: number, meta: any = {}) {
  logFalUsage(modelId, { ...meta, user_id: _currentRequestUserId, feature: "remix_generation" });
}
function trackReplicateUsage(modelId: string, _amount: number, meta: any = {}) {
  logReplicateUsage(modelId, { ...meta, user_id: _currentRequestUserId, feature: "remix_generation" });
}

const GEMINI_MODEL = "gemini-3.1-pro-preview";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Thin helper that mimics openai.chat.completions.create for simple text exchanges.
async function geminiChat(
  messages: { role: string; content: any }[],
  opts: { max_tokens?: number; temperature?: number; feature?: string } = {},
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const sys = messages.find((m) => m.role === "system")?.content as string | undefined;
  const userMsgs = messages.filter((m) => m.role !== "system");

  const parts: any[] = [];
  for (const m of userMsgs) {
    if (typeof m.content === "string") {
      parts.push({ text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c.type === "text") parts.push({ text: c.text });
        if (c.type === "image_url") {
          const url = c.image_url?.url || "";
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
      }
    }
  }

  const m = sys ? genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: sys }) : model;
  const result = await m.generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.max_tokens ?? 1000,
    },
  });
  logGeminiUsage(result, { feature: opts.feature || "ai_generate", model: GEMINI_MODEL });
  return result.response.text() || "";
}

fal.config({ credentials: process.env.FAL_AI_KEY! });

// Convert "1:1" / "16:9" style aspect ratio to Fal.ai's image_size enum.
function falImageSize(aspectRatio: string): string {
  switch (aspectRatio) {
    case "1:1": return "square_hd";
    case "16:9": return "landscape_16_9";
    case "9:16": return "portrait_16_9";
    case "4:3": return "landscape_4_3";
    case "3:4": return "portrait_4_3";
    default: return "square_hd";
  }
}

// Map mode to credit action key
function getRemixDescription(mode: string): string {
  if (["video", "vid2vid"].includes(mode)) return "Remix — Video Generation";
  if (["audio", "aud2aud"].includes(mode)) return "Remix — Audio Generation";
  return "Remix — Image Generation";
}

// Cache for image analysis to save costs
const analysisCache = new Map<
  string,
  { description: string; timestamp: number }
>();
const CACHE_DURATION = 3600000; // 1 hour

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
});

function safeSerialize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function getErrorLogPayload(error: any) {
  return {
    name: error?.name,
    message: error?.message,
    status: error?.status,
    statusText: error?.statusText,
    requestId: error?.requestId,
    timeoutType: error?.timeoutType,
    body: safeSerialize(error?.body),
    response: safeSerialize(error?.response),
    details: safeSerialize(error?.details),
    cause: safeSerialize(error?.cause),
    stack: error?.stack,
  };
}

function summarizeInputSource(value: string | null | undefined) {
  if (!value) {
    return { kind: "missing", host: null, preview: null };
  }

  if (value.startsWith("data:")) {
    return {
      kind: "data-uri",
      host: null,
      preview: value.slice(0, 48),
    };
  }

  try {
    const url = new URL(value);
    return {
      kind: "url",
      host: url.host,
      preview: `${url.protocol}//${url.host}${url.pathname.slice(0, 60)}`,
    };
  } catch {
    return {
      kind: "raw-string",
      host: null,
      preview: value.slice(0, 80),
    };
  }
}


// ============================================
// MULTI-MODEL IMAGE ANALYSIS ENSEMBLE
// ============================================
async function analyzeImageEnsemble(imageDataUri: string): Promise<string> {
  try {
    // Check cache first
    const cacheKey = imageDataUri.slice(0, 100); // Use first 100 chars as key
    const cached = analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log("🔄 Using cached analysis");
      return cached.description;
    }

    console.log("🔍 Running multi-model analysis ensemble...");

    let description = "";
    try {
      description = await analyzeWithGPT4Vision(imageDataUri);
    } catch (e) {
      description = "a detailed image";
    }
    // Cache the result
    analysisCache.set(cacheKey, { description, timestamp: Date.now() });

    console.log("✅ Ensemble analysis complete");
    return description;
  } catch (error) {
    console.error("Error in ensemble analysis:", error);
    return "a detailed image";
  }
}

async function analyzeWithGPT4Vision(imageDataUri: string): Promise<string> {
  return geminiChat([
    {
      role: "user",
      content: [
        { type: "text", text: "Describe only the scene, lighting, and background. Do NOT describe the person." },
        { type: "image_url", image_url: { url: imageDataUri } },
      ],
    },
  ], { max_tokens: 1000, feature: "ai_generate_vision" }) || "a detailed image";
}

async function analyzeWithFlorence2(imageDataUri: string): Promise<string> {
  try {
    const output = await replicate.run(
      "microsoft/florence-2-large:66ec52dc84bf05a9b93dd3f653e562e8c14afc6838fe86b2e6b0bdcba7bb34b7",
      {
        input: {
          image: imageDataUri,
          task: "detailed_caption",
        },
      },
    );

    return String(output);
  } catch (error) {
    console.error("Florence-2 failed:", error);
    return "";
  }
}

async function analyzeWithBLIP(imageDataUri: string): Promise<string> {
  try {
    const output = await replicate.run(
      "salesforce/blip:2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746",
      {
        input: {
          image: imageDataUri,
          task: "image_captioning",
        },
      },
    );

    return Array.isArray(output) ? String(output[0]) : String(output);
  } catch (error) {
    return "a detailed image";
  }
}

// ============================================
// GPT-4 PROMPT ENHANCEMENT
// ============================================
async function enhancePrompt(
  userPrompt: string,
  mode: string,
  imageDescription: string,
): Promise<string> {
  try {
    const enhanced = await geminiChat([
      { role: "system", content: `You are an AI prompt formatter. Your ONLY job is to take the user's prompt and return it EXACTLY as given, with only ", masterpiece, 8k, highly detailed, professional quality" added at the end. NEVER change, reinterpret, or add your own creative ideas. Return ONLY the prompt.` },
      { role: "user", content: `Mode: ${mode}\nUser prompt: ${userPrompt}\nImage context: ${imageDescription.slice(0, 200)}\n\nEnhance this prompt to be more detailed and effective:` },
    ], { max_tokens: 300, temperature: 0.7, feature: "ai_generate_enhance" });
    console.log("✨ Enhanced prompt:", enhanced);
    return enhanced || userPrompt;
  } catch (error) {
    console.error("Prompt enhancement failed:", error);
    return userPrompt;
  }
}

// ============================================
// IMAGE RESIZE & PREPROCESSING
// ============================================
async function resizeImage(
  imageUrl: string,
  maxSize: number = 1024,
): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const resizedBuffer = await sharp(buffer)
      .resize(maxSize, maxSize, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 95 })
      .toBuffer();

    const base64 = resizedBuffer.toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error("Error resizing image:", error);
    throw new Error("Failed to process image");
  }
}

// ============================================
// STYLE-SPECIFIC LORA MAPPINGS
// ============================================
const STYLE_CONFIGS: Record<
  string,
  { prompt: string; lora?: string; negative?: string }
> = {
  anime: {
    prompt:
      "anime art style, Studio Ghibli aesthetic, hand-painted backgrounds, cel-shaded characters, vibrant colors, soft lighting, whimsical atmosphere, highly detailed anime illustration, manga style, Japanese animation quality",
    negative:
      "realistic, photorealistic, 3d render, western cartoon, low quality",
  },
  oil: {
    prompt:
      "oil painting masterpiece, classical renaissance art, visible thick brushstrokes, impasto technique, rich color palette, textured canvas, museum quality, rembrandt lighting, chiaroscuro, painterly style, fine art",
    negative: "digital art, smooth, photorealistic, modern, flat",
  },
  watercolor: {
    prompt:
      "watercolor painting, flowing translucent colors, soft wet blending, artistic paper texture, delicate color washes, pigment granulation, fine art illustration, traditional watercolor technique, organic edges",
    negative: "digital, sharp edges, opaque, oil painting, acrylic",
  },
  sketch: {
    prompt:
      "detailed pencil sketch, hand-drawn illustration, crosshatching technique, graphite shading, artistic linework, traditional drawing, sketch marks visible, paper texture, charcoal effects, fine art draftsmanship",
    negative: "colored, painted, digital, photorealistic",
  },
  cyberpunk: {
    prompt:
      "cyberpunk aesthetic, neon lights everywhere, futuristic dystopian city, blade runner atmosphere, tech noir style, holographic elements, rain-soaked streets, purple and cyan color scheme, sci-fi technology, urban decay, cinematic lighting",
    negative: "natural, pastoral, historical, bright daylight, vintage",
  },
  fantasy: {
    prompt:
      "fantasy art masterpiece, magical atmosphere, ethereal lighting, enchanted realm, mystical glowing elements, concept art quality, dungeons and dragons style, epic fantasy illustration, otherworldly beauty, dramatic lighting, rich colors",
    negative: "realistic, modern, mundane, scientific, minimalist",
  },
};

// ============================================
// INTELLIGENT PROMPT BUILDING
// ============================================
function buildPrompt(
  mode: string,
  userPrompt: string | undefined,
  imageDescription: string,
): string {
  switch (mode) {
    case "variation":
      return `${imageDescription}, creative reimagining, alternative interpretation, unique perspective, high quality, 8k resolution, detailed, professional photography, masterpiece quality`;

    case "style":
      const styleKey = userPrompt || "anime";
      const styleConfig = STYLE_CONFIGS[styleKey] || STYLE_CONFIGS.anime;
      return `Transform into: ${styleConfig.prompt}. Based on: ${imageDescription}. Ultra detailed, masterpiece quality, professional art, dramatic transformation`;

    case "custom":
      if (userPrompt && userPrompt.trim().length > 0) {
        return `${userPrompt}. Professional quality, highly detailed, 8k resolution, photorealistic, cinematic lighting`;
      }
      return `${imageDescription}, creative variation, high quality`;

    default:
      return `${imageDescription}, high quality, detailed, professional quality`;
  }
}

function extractCompositionDetails(description: string): string {
  const keywords = [
    "lighting",
    "background",
    "composition",
    "atmosphere",
    "setting",
    "environment",
    "colors",
    "mood",
  ];
  const sentences = description.split(/[.!?]+/);
  const relevantSentences = sentences.filter((s) =>
    keywords.some((kw) => s.toLowerCase().includes(kw)),
  );
  return (
    relevantSentences.join(". ").trim() ||
    "cinematic lighting, professional photography"
  );
}

// ============================================
// UPSCALING FUNCTION
// ============================================
async function upscaleImage(imageUrl: string): Promise<string> {
  try {
    console.log("🔍 Upscaling image with Real-ESRGAN 4x (Replicate)...");
    const output = await replicate.run(
      "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b",
      {
        input: { image: imageUrl, scale: 4, face_enhance: true },
      },
    );
    trackReplicateUsage("nightmareai/real-esrgan", 0.002);
    return await handleReplicateOutput(output, "image");
  } catch (error) {
    console.error("Upscaling failed:", error);
    return imageUrl;
  }
}
async function toBase64DataUri(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = url.includes(".webp") ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return url;
  }
}
// ============================================
// MAIN API ROUTE
// ============================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageUrl,
      prompt: userPrompt,
      mode,
      upscale = false,
      aspectRatio = "1:1",
      quality = "balanced",
      lockCharacter = false,
      selectedModel = "default",
      userId,
      audioDuration,
    } = body;

    // Track user for usage logging
    _currentRequestUserId = userId && userId !== "anonymous" ? userId : null;

    // Pre-check credits based on content type (don't deduct yet)
    const actionKey = getRemixCreditActionKey(mode, audioDuration);
    let creditCost = 0;
    if (userId && userId !== "anonymous") {
      const check = await canAfford(userId, actionKey);
      if (!check.affordable) {
        return NextResponse.json({ error: `Insufficient credits. This action costs ${check.cost} credits but you have ${check.balance}.`, creditError: true }, { status: 402 });
      }
      creditCost = check.cost;
    }

    // Validation
    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: "Missing imageUrl parameter" },
        { status: 400 },
      );
    }

    if (!mode) {
      return NextResponse.json(
        { success: false, error: "Missing mode parameter" },
        { status: 400 },
      );
    }

    console.log("🚀 Starting generation:", {
      mode,
      userPrompt,
      upscale,
      selectedModel,
      aspectRatio,
      quality,
      audioDuration,
      hasImageUrl: Boolean(imageUrl),
      inputSource: summarizeInputSource(imageUrl),
      replicateConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
      replicateMasked: maskSecret(process.env.REPLICATE_API_TOKEN),
      falConfigured: Boolean(process.env.FAL_AI_KEY),
    });

    const imageDataUri =
      mode === "vid2vid" || mode === "aud2aud"
        ? imageUrl
        : await resizeImage(imageUrl, 1024);
    console.log("✅ Image processed");

    let output: any;
    let resultUrl: string = "";
    if (mode === "video" && selectedModel === "default") {
      console.log("🎬 Starting 2-step video generation...");

      let sceneImageUrl: string;
      let videoPrompt: string;

      sceneImageUrl = imageDataUri; // always use the uploaded image
      videoPrompt =
        userPrompt && userPrompt.trim().length > 0
          ? `${userPrompt}, cinematic motion, smooth movement`
          : "Smooth camera movement";

      // STEP 2: Animate
      console.log("🎬 Step 2: Animating...");

      await new Promise((res) => setTimeout(res, 7000));
      const minimaxRes = await fal.subscribe("fal-ai/minimax/hailuo-02/standard/image-to-video", {
        input: {
          prompt: videoPrompt,
          image_url: sceneImageUrl,
          prompt_optimizer: true,
        },
        logs: false,
      });
      trackFalUsage("fal-ai/minimax/hailuo-02/standard/image-to-video", 0.045, { duration_seconds: 6 });
      const minimaxData = minimaxRes.data as any;
      resultUrl = minimaxData?.video?.url || "";

      return NextResponse.json({
        success: true,
        url: resultUrl,
        sceneUrl: sceneImageUrl, // ✅ Return scene too
        mode: "video",
        twoStep: !!userPrompt,
      });
    }
    // MODE: AUDIO - MusicGen
    // ============================================
    // MODE: AUDIO - Smart Multi-Model Generation
    // ============================================
    // MODE: AUDIO - Multi-Model Smart Generation
    // ============================================
    if (mode === "audio") {
      const audioType = body.audioType || "music";
      const voiceType = body.voiceType || "narration";
      const duration = body.audioDuration || 8;
      const audioModel = body.audioModel || "high";

      console.log(`🎵 Generating ${audioType} audio...`);

      const audioPrompt =
        userPrompt && userPrompt.trim().length > 0
          ? userPrompt
          : "Upbeat electronic music, energetic, 128 BPM";

      // Route to appropriate model based on audio type
      if (audioType === "music") {
        let enhancedPrompt = audioPrompt;

        // Enhance music prompts with GPT-4
        try {
          const enhancement = await geminiChat([
              {
                role: "system",
                content: `Enhance music prompts by adding: instruments, BPM, key, mood, production style. Keep under 150 words. Return ONLY the enhanced prompt.`,
              },
              {
                role: "user",
                content: `Enhance: "${audioPrompt}"`,
              },
            ], { max_tokens: 150, temperature: 0.7, feature: "ai_generate" });
          enhancedPrompt =
            enhancement || audioPrompt;
          console.log("✨ Enhanced:", enhancedPrompt);
        } catch (e) {
          console.log("⚠️ Using original prompt");
        }

        const modelQuality =
          audioModel === "high"
            ? "stereo-large"
            : audioModel === "balanced"
              ? "melody-large"
              : "large";

        output = await replicate.run(
          "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
          {
            input: {
              prompt: enhancedPrompt,
              model_version: modelQuality,
              output_format: "mp3",
              duration: duration,
              normalization_strategy: "loudness",
              top_k: 250,
              classifier_free_guidance: 3,
            },
          },
        );

        resultUrl = await handleReplicateOutput(output, "audio");

        // Deduct credits after successful generation


        if (userId && userId !== "anonymous" && creditCost > 0) {


          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


        }


        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "audio",
          audioType: "music",
          prompt: enhancedPrompt,
          duration: `${duration} seconds`,
        });
        trackReplicateUsage("meta/musicgen", 0.051);
      }

      if (audioType === "song") {
        // SONG: Stable Audio - Music with vocals
        let enhancedPrompt = audioPrompt;

        try {
          const enhancement = await geminiChat([
              {
                role: "system",
                content: `Enhance song prompts by adding: vocal style (male/female), genre, instrumentation, mood. Keep under 150 words. Return ONLY the enhanced prompt.`,
              },
              {
                role: "user",
                content: `Enhance: "${audioPrompt}"`,
              },
            ], { max_tokens: 150, temperature: 0.7, feature: "ai_generate" });
          enhancedPrompt =
            enhancement || audioPrompt;
        } catch (e) {}

        const stableAudioRes = await fal.subscribe("fal-ai/stable-audio", {
          input: {
            prompt: enhancedPrompt,
            seconds_total: duration,
            steps:
              audioModel === "high" ? 100 : audioModel === "balanced" ? 50 : 25,
          },
          logs: false,
        });
        trackFalUsage("fal-ai/stable-audio", 0.000575, { duration_seconds: 37 });
        const stableAudioData = stableAudioRes.data as any;
        resultUrl =
          stableAudioData?.audio_file?.url ||
          stableAudioData?.audio?.url ||
          "";

        // Deduct credits after successful generation


        if (userId && userId !== "anonymous" && creditCost > 0) {


          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


        }


        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "audio",
          audioType: "song",
          prompt: enhancedPrompt,
          duration: `${duration} seconds`,
        });
      }

      if (audioType === "voice") {
        // VOICE: Bark - Text to speech
        output = await replicate.run(
          "suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787",
          {
            input: {
              prompt: audioPrompt,
              text_temp: 0.7,
              waveform_temp: 0.7,
            },
          },
        );

        resultUrl = await handleReplicateOutput(output, "audio");

        // Deduct credits after successful generation


        if (userId && userId !== "anonymous" && creditCost > 0) {


          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


        }


        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "audio",
          audioType: "voice",
          prompt: audioPrompt,
          voiceType: voiceType,
        });
        trackReplicateUsage("suno-ai/bark", 0.015);
      }

      if (audioType === "sfx") {
        // SOUND EFFECTS: AudioCraft
        output = await replicate.run(
          "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
          {
            input: {
              prompt: audioPrompt,
              model_version: "large",
              output_format: "mp3",
              duration: Math.min(duration, 10), // Max 10s for SFX
            },
          },
        );

        resultUrl = await handleReplicateOutput(output, "audio");

        // Deduct credits after successful generation


        if (userId && userId !== "anonymous" && creditCost > 0) {


          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


        }


        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "audio",
          audioType: "sfx",
          prompt: audioPrompt,
          duration: `${duration} seconds`,
        });
        trackReplicateUsage("meta/musicgen", 0.051);
      }
      if (audioType === "fullsong") {
        let enhancedPrompt = audioPrompt;
        try {
          const enhancement = await geminiChat([
              {
                role: "system",
                content: `Enhance song prompts for MiniMax Music 1.5. Add: vocal style, genre, instrumentation, BPM, mood. Keep under 200 words. Return ONLY the enhanced prompt.`,
              },
              { role: "user", content: `Enhance: "${audioPrompt}"` },
            ], { max_tokens: 200, temperature: 0.7, feature: "ai_generate" });
          enhancedPrompt =
            enhancement || audioPrompt;
        } catch (e) {}

        const minimaxMusicRes = await fal.subscribe("fal-ai/minimax-music", {
          input: {
            prompt: enhancedPrompt,
            ...(body.referenceAudioUrl
              ? { reference_audio_url: body.referenceAudioUrl }
              : {}),
          } as any,
          logs: false,
        });
        trackFalUsage("fal-ai/minimax-music", 0.035);
        const minimaxMusicData = minimaxMusicRes.data as any;
        resultUrl =
          minimaxMusicData?.audio?.url ||
          minimaxMusicData?.audio_file?.url ||
          "";
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "audio",
          audioType: "fullsong",
          prompt: enhancedPrompt,
        });
      }

      if (audioType === "acestep") {
        output = await replicate.run(
          "lucataco/ace-step:280fc4f9ee507577f880a167f639c02622421d8fecf492454320311217b688f1",
          {
            input: {
              tags: audioPrompt,
              lyrics: body.lyrics || "",
              audio_duration: Math.min(body.audioDuration || 30, 240),
              ...(body.referenceAudioUrl
                ? {
                    audio: body.referenceAudioUrl,
                    repaint: body.repaint || false,
                  }
                : {}),
            },
          },
        );
        resultUrl = await handleReplicateOutput(output, "audio");
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "audio",
          audioType: "acestep",
          prompt: audioPrompt,
        });
        trackReplicateUsage("lucataco/ace-step", 0.036);
      }
      throw new Error("Invalid audio type");
    }
    // ============================================
    // MODE: AUD2AUD - Smart Audio Router
    // ============================================
    if (mode === "aud2aud") {
      const audioPrompt =
        userPrompt && userPrompt.trim().length > 0
          ? userPrompt
          : "Remix in a new energetic style";

      const duration = body.audioDuration || 8;
      const remixModel = body.remixModel || "melody";
      console.log("🎧 Entering aud2aud pipeline", {
        audioPrompt,
        duration,
        remixModel,
        selectedModel,
        inputSource: summarizeInputSource(imageUrl),
      });

      // STEP 1: GPT-4o classifies intent
      let intent = "remix_melody"; // default
      try {
        const classification = await geminiChat([
            {
              role: "system",
              content: `You are an audio intent classifier. Given a user's prompt about audio processing, classify it into EXACTLY ONE of these categories. Return ONLY the category string, nothing else.

Categories:
- "remix_melody" — user wants a new version/remix/different style/genre change of the music
- "remix_chord" — user specifically mentions chords, harmony, chord progression changes
- "remix_vocal" — user wants remix but explicitly wants to keep/preserve original vocals
- "stem_separate" — user wants to separate/isolate/extract specific parts (vocals, drums, bass, instruments)
- "eq_master" — user mentions EQ, frequencies, muddiness, clarity, brightness, warmth, mixing, mastering, compression, limiting, loudness
- "effects" — user wants reverb, delay, echo, chorus, flanger, phaser, distortion, pitch shift
- "enhance" — user wants to improve/clean/denoise/enhance overall audio quality, remove noise, make clearer
- "upscale" — user wants higher quality/resolution/fidelity, upscale, super resolution

If the prompt mentions multiple things, pick the PRIMARY intent.
If unsure, default to "remix_melody".`,
            },
            { role: "user", content: `Classify: "${audioPrompt}"` },
          ], { max_tokens: 20, temperature: 0, feature: "ai_generate" });
        const classified =
          classification ||
          "remix_melody";
        if (
          [
            "remix_melody",
            "remix_chord",
            "remix_vocal",
            "stem_separate",
            "eq_master",
            "effects",
            "enhance",
            "upscale",
            "full_song",
            "text_to_song",
          ].includes(classified)
        ) {
          intent = classified;
        }
        console.log(`🧠 Audio intent classified: "${audioPrompt}" → ${intent}`);
      } catch (e) {
        console.log("⚠️ Classification failed, defaulting to remix_melody");
      }

      // Override with manual model selection if user picked specific model
      if (remixModel === "chord") intent = "remix_chord";
      if (remixModel === "remixer") intent = "remix_vocal";
      if (remixModel === "fullsong") intent = "full_song";
      if (remixModel === "acestep") intent = "text_to_song";
      console.log("🧭 aud2aud resolved intent", {
        intent,
        remixModel,
        selectedModel,
      });

      // ── REMIX ROUTES ──
      if (
        intent === "remix_melody" ||
        intent === "remix_chord" ||
        intent === "remix_vocal"
      ) {
        // Convert prompt to music-friendly format
        let enhancedPrompt = audioPrompt;
        try {
          const enhancement = await geminiChat([
              {
                role: "system",
                content: `You are a music prompt converter for AI music generation (MusicGen).
The user may give you technical audio engineering terms OR creative music descriptions.
ALWAYS convert into a music generation prompt describing: genre, instruments, BPM, mood, energy level, production style.
IGNORE any technical mixing/mastering instructions — MusicGen cannot do EQ, compression, or audio effects.
Instead, interpret the user's INTENT and describe the music they want.
Keep under 150 words. Return ONLY the music prompt.`,
              },
              { role: "user", content: `Convert: "${audioPrompt}"` },
            ], { max_tokens: 150, temperature: 0.7, feature: "ai_generate" });
          enhancedPrompt =
            enhancement || audioPrompt;
          console.log("✨ Music prompt:", enhancedPrompt);
        } catch (e) {
          console.log("⚠️ Using original prompt");
        }

        if (intent === "remix_vocal") {
          console.log("🔄 Using MusicGen Remixer (vocals preserved)...");
          console.log("🛰️ Replicate request", {
            model: "sakemin/musicgen-remixer:d7e98a2e92eaa33c4e1d43588fb4b37a9766b3ba2df634295218d165618dc733",
            inputField: "music_input",
            inputSource: summarizeInputSource(imageUrl),
            duration,
          });
          output = await replicate.run(
            "sakemin/musicgen-remixer:d7e98a2e92eaa33c4e1d43588fb4b37a9766b3ba2df634295218d165618dc733",
            {
              input: {
                prompt: enhancedPrompt,
                music_input: imageUrl,
                model_version: "stereo-chord",
                output_format: "mp3",
                normalization_strategy: "loudness",
              },
            },
          );
        } else if (intent === "remix_chord") {
          console.log("🎶 Using MusicGen Chord...");
          console.log("🛰️ Replicate request", {
            model: "sakemin/musicgen-chord:c940ab4308578237484f90f010b2b3871bf64008e95f26f4d567529ad019a3d6",
            inputField: "audio_chords",
            inputSource: summarizeInputSource(imageUrl),
            duration,
          });
          output = await replicate.run(
            "sakemin/musicgen-chord:c940ab4308578237484f90f010b2b3871bf64008e95f26f4d567529ad019a3d6",
            {
              input: {
                prompt: enhancedPrompt,
                audio_chords: imageUrl,
                duration: duration,
                output_format: "mp3",
                normalization_strategy: "loudness",
                multi_band_diffusion: false,
              },
            },
          );
        } else {
          console.log("🎵 Using MusicGen Melody...");
          console.log("🛰️ Replicate request", {
            model: "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
            inputField: "input_audio",
            inputSource: summarizeInputSource(imageUrl),
            duration,
          });
          output = await replicate.run(
            "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
            {
              input: {
                prompt: enhancedPrompt,
                input_audio: imageUrl,
                model_version: "stereo-melody-large",
                output_format: "mp3",
                duration: duration,
                continuation: false,
                normalization_strategy: "loudness",
                top_k: 250,
                classifier_free_guidance: 3,
              },
            },
          );
        }

        resultUrl = await handleReplicateOutput(output, "audio");
        console.log("✅ aud2aud remix output resolved", {
          intent,
          resultUrl,
        });
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "aud2aud",
          intent,
          prompt: enhancedPrompt,
          duration: `${duration} seconds`,
        });
          trackReplicateUsage("sakemin/musicgen-chord", 0.32);
          trackReplicateUsage("sakemin/musicgen-remixer", 0.53);
          trackReplicateUsage("meta/musicgen", 0.051);
      }

      // ── STEM SEPARATION ──
      if (intent === "stem_separate") {
        console.log("🎛️ Using Demucs HTDemucs for stem separation...");
        console.log("🌐 Fal request", {
          model: "fal-ai/demucs",
          inputSource: summarizeInputSource(imageUrl),
        });

        // Detect which stem user wants
        let stemType = "all"; // default: return all stems
        const promptLower = audioPrompt.toLowerCase();
        if (
          promptLower.includes("vocal") ||
          promptLower.includes("voice") ||
          promptLower.includes("singing")
        ) {
          stemType = "vocals";
        } else if (
          promptLower.includes("drum") ||
          promptLower.includes("beat") ||
          promptLower.includes("percussion")
        ) {
          stemType = "drums";
        } else if (promptLower.includes("bass")) {
          stemType = "bass";
        } else if (
          promptLower.includes("instrument") ||
          promptLower.includes("music") ||
          promptLower.includes("background")
        ) {
          stemType = "other";
        } else if (
          promptLower.includes("remove vocal") ||
          promptLower.includes("karaoke") ||
          promptLower.includes("no vocal")
        ) {
          stemType = "no_vocals";
        }

        const demucsRes = await fal.subscribe("fal-ai/demucs", {
          input: { audio_url: imageUrl },
          logs: false,
        });
        trackFalUsage("fal-ai/demucs", 0.0007, { duration_seconds: 60 });
        output = demucsRes.data as any;
        // Fal Demucs returns { vocals: {url}, drums: {url}, bass: {url}, other: {url} }
        const stemUrl = (key: string) =>
          (output as any)?.[key]?.url || (output as any)?.[key] || "";
        console.log("📦 Demucs output:", JSON.stringify(output, null, 2));

        if (stemType === "no_vocals") {
          resultUrl = String(stemUrl("other") || stemUrl("drums") || "");
        } else if (stemType !== "all") {
          resultUrl = String(stemUrl(stemType) || "");
        } else {
          // Return vocals as primary (most common request)
          resultUrl = String(stemUrl("vocals") || stemUrl("drums") || "");
        }

        // Deduct credits after successful generation


        if (userId && userId !== "anonymous" && creditCost > 0) {


          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


        }


        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "aud2aud",
          intent: "stem_separate",
          stemType,
          allStems: typeof output === "object" ? output : undefined,
          prompt: audioPrompt,
        });
      }

      // ── AUDIO ENHANCEMENT (denoise + quality boost) ──
      if (intent === "enhance") {
        console.log("✨ Using Resemble Enhance for audio enhancement...");
        output = await replicate.run(
          "resemble-ai/resemble-enhance:60b9d4a83dff4da16575fcba7e6a09d3bdb1e97e499f2bf0da27e51ca1076b21",
          {
            input: {
              audio: imageUrl,
              solver: "Midpoint",
              nfe: 64,
              prior_temperature: 0.5,
            },
          },
        );

        resultUrl = await handleReplicateOutput(output, "audio");
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "aud2aud",
          intent: "enhance",
          prompt: audioPrompt,
        });
        trackReplicateUsage("resemble-ai/resemble-enhance", 0.007);
      }

      // ── AUDIO SUPER RESOLUTION ──
      if (intent === "upscale") {
        console.log("🔍 Using Audio Super Resolution...");
        output = await replicate.run(
          "sakemin/audiosr-long-audio:6b73e4aeea5c43d1a4c38f8e35bc47b48508fd1abc50d1e9cc80839f04f4b6e3",
          {
            input: {
              input_file: imageUrl,
              ddim_steps: 50,
              guidance_scale: 3.5,
            },
          },
        );

        resultUrl = await handleReplicateOutput(output, "audio");
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "aud2aud",
          intent: "upscale",
          prompt: audioPrompt,
        });
        trackReplicateUsage("sakemin/audiosr-long-audio", 0.10);
      }

      // ── EQ / MASTERING / EFFECTS (FFmpeg) ──
      if (intent === "eq_master" || intent === "effects") {
        console.log("🎛️ Using GPT-4o to generate FFmpeg command...");

        // GPT-4o generates precise FFmpeg filter chain
        let ffmpegFilters = "";
        try {
          const ffmpegGen = await geminiChat([
              {
                role: "system",
                content: `You are an expert audio engineer. Given the user's request, generate ONLY an FFmpeg audio filter chain string.
Rules:
- Return ONLY the filter string, no explanation, no ffmpeg command, just the filters
- Use FFmpeg audio filters: equalizer, bass, treble, loudnorm, acompressor, aecho, chorus, flanger, aphaser, vibrato, tremolo, highpass, lowpass, bandpass
- Chain multiple filters with commas
- Be precise with frequency values and gains

Examples:
- "boost clarity, reduce muddiness" → "equalizer=f=300:t=q:w=2:g=-4,equalizer=f=3000:t=q:w=2:g=3,equalizer=f=8000:t=q:w=2:g=2"
- "add reverb" → "aecho=0.8:0.88:60:0.4"
- "make louder, master it" → "loudnorm=I=-14:TP=-1:LRA=11,acompressor=threshold=-20dB:ratio=4:attack=5:release=50"
- "warm tone, vinyl feel" → "equalizer=f=200:t=q:w=1:g=3,equalizer=f=8000:t=q:w=2:g=-2,tremolo=f=0.5:d=0.1"
- "boost bass, crisp highs" → "bass=g=6:f=100:w=0.5,treble=g=4:f=8000:w=0.5"
- "radio voice effect" → "highpass=f=300,lowpass=f=3400,acompressor=threshold=-15dB:ratio=6"
- "pitch up slightly" → "asetrate=44100*1.05,aresample=44100"`,
              },
              {
                role: "user",
                content: `Generate FFmpeg filter for: "${audioPrompt}"`,
              },
            ], { max_tokens: 200, temperature: 0.3, feature: "ai_generate" });
          ffmpegFilters = ffmpegGen.trim() || "";
          // Clean up any markdown or quotes
          ffmpegFilters = ffmpegFilters
            .replace(/```/g, "")
            .replace(/^["']|["']$/g, "")
            .trim();
          console.log("🎛️ FFmpeg filters:", ffmpegFilters);
        } catch (e) {
          console.error("FFmpeg filter generation failed:", e);
          ffmpegFilters = "loudnorm=I=-14:TP=-1:LRA=11";
        }

        if (!ffmpegFilters) {
          ffmpegFilters = "loudnorm=I=-14:TP=-1:LRA=11";
        }

        // Download the audio file
        const audioResponse = await fetch(imageUrl);
        if (!audioResponse.ok) {
          throw new Error("Failed to download audio file for processing");
        }
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

        // Process with FFmpeg
        const { execSync } = require("child_process");
        const fs = require("fs");
        const os = require("os");
        const path = require("path");

        const tmpDir = os.tmpdir();
        const inputPath = path.join(tmpDir, `input_${Date.now()}.mp3`);
        const outputPath = path.join(tmpDir, `output_${Date.now()}.mp3`);

        fs.writeFileSync(inputPath, audioBuffer);

        try {
          const cmd = `ffmpeg -y -i "${inputPath}" -af "${ffmpegFilters}" -codec:a libmp3lame -q:a 2 "${outputPath}" 2>&1`;
          console.log("🎛️ Running FFmpeg:", cmd);
          execSync(cmd, { timeout: 60000 });
        } catch (ffmpegError: any) {
          console.error("FFmpeg failed:", ffmpegError.message);
          // Fallback: just normalize
          try {
            execSync(
              `ffmpeg -y -i "${inputPath}" -af "loudnorm=I=-14:TP=-1:LRA=11" -codec:a libmp3lame -q:a 2 "${outputPath}" 2>&1`,
              { timeout: 60000 },
            );
          } catch (fallbackError) {
            // If even normalization fails, copy original
            fs.copyFileSync(inputPath, outputPath);
          }
        }

        // Upload processed file to Supabase
        const processedBuffer = fs.readFileSync(outputPath);
        const processedFileName = `processed-${Date.now()}.mp3`;

        const { path: storagePath, signedUrl } =
          await uploadAudioTempAndGetSignedUrl(
            processedFileName,
            processedBuffer,
            "audio/mpeg",
          );
        resultUrl = signedUrl;
        console.log("🔐 Processed audio signed URL generated", {
          storagePath,
          inputSource: summarizeInputSource(resultUrl),
        });

        // Cleanup temp files
        try {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        } catch (e) {}

        // Deduct credits after successful generation


        if (userId && userId !== "anonymous" && creditCost > 0) {


          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


        }


        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "aud2aud",
          intent,
          ffmpegFilters,
          prompt: audioPrompt,
        });
      }
      if (intent === "full_song") {
        console.log("🌐 Fal request", {
          model: "fal-ai/minimax-music",
          inputSource: summarizeInputSource(imageUrl),
          duration,
        });
        const fullSongRes = await fal.subscribe("fal-ai/minimax-music", {
          input: {
            prompt: audioPrompt,
            ...(imageUrl.startsWith("http")
              ? { reference_audio_url: imageUrl }
              : {}),
          } as any,
          logs: false,
        });
        trackFalUsage("fal-ai/minimax-music", 0.035);
        const fullSongData = fullSongRes.data as any;
        resultUrl =
          fullSongData?.audio?.url || fullSongData?.audio_file?.url || "";
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "aud2aud",
          intent: "full_song",
          prompt: audioPrompt,
        });
      }

      if (intent === "text_to_song") {
        console.log("🛰️ Replicate request", {
          model: "lucataco/ace-step:280fc4f9ee507577f880a167f639c02622421d8fecf492454320311217b688f1",
          audioDuration: Math.min(body.audioDuration || 30, 240),
          hasLyrics: Boolean(body.lyrics),
        });
        output = await replicate.run(
          "lucataco/ace-step:280fc4f9ee507577f880a167f639c02622421d8fecf492454320311217b688f1",
          {
            input: {
              tags: audioPrompt,
              lyrics: body.lyrics || "",
              audio_duration: Math.min(body.audioDuration || 30, 240),
            },
          },
        );
        resultUrl = await handleReplicateOutput(output, "audio");
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "aud2aud",
          intent: "text_to_song",
          prompt: audioPrompt,
        });
        trackReplicateUsage("lucataco/ace-step", 0.036);
      }
      // ── FALLBACK: default to melody remix ──
      console.log("🎵 Fallback: MusicGen Melody...");
      console.log("🛰️ Replicate fallback request", {
        model: "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
        inputField: "input_audio",
        inputSource: summarizeInputSource(imageUrl),
        duration,
      });
      let fallbackPrompt = audioPrompt;
      try {
        const enhancement = await geminiChat([
            {
              role: "system",
              content:
                "Convert this into a music generation prompt with genre, instruments, BPM, mood. Keep under 150 words. Return ONLY the prompt.",
            },
            { role: "user", content: `Convert: "${audioPrompt}"` },
          ], { max_tokens: 150, temperature: 0.7, feature: "ai_generate" });
        fallbackPrompt = enhancement || audioPrompt;
      } catch (e) {}

      output = await replicate.run(
        "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
        {
          input: {
            prompt: fallbackPrompt,
            input_audio: imageUrl,
            model_version: "stereo-melody-large",
            output_format: "mp3",
            duration: duration,
            continuation: false,
            normalization_strategy: "loudness",
            top_k: 250,
            classifier_free_guidance: 3,
          },
        },
      );

      resultUrl = await handleReplicateOutput(output, "audio");
      // Deduct credits after successful generation

      if (userId && userId !== "anonymous" && creditCost > 0) {

        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

      }

      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "aud2aud",
        intent: "remix_melody",
        prompt: fallbackPrompt,
        duration: `${duration} seconds`,
      });
      trackReplicateUsage("meta/musicgen", 0.051);
    }
    // ============================================
    // ANALYZE IMAGE (for all image modes)
    // ============================================
    console.log("🔍 Analyzing image with multi-model ensemble...");
    const imageDescription = await analyzeImageEnsemble(imageDataUri);

    // ============================================
    // MODE: CUSTOM - Flux Dev with GPT-4 Enhancement
    // ============================================
    if (
      mode === "custom" &&
      selectedModel === "default" &&
      userPrompt &&
      userPrompt.trim().length > 0
    ) {
      console.log("🎨 Using Flux Dev for custom transformation...");

      // Enhance prompt with GPT-4
      const enhancedPrompt = await enhancePrompt(
        userPrompt,
        "custom",
        imageDescription,
      );

      const compositionDetails = extractCompositionDetails(imageDescription);
      const fluxPrompt = `${enhancedPrompt}, ${compositionDetails}, professional photography, highly detailed, 8k resolution, photorealistic, masterpiece quality`;

      console.log("📝 Final Flux prompt:", fluxPrompt);

      const fluxDevRes = await fal.subscribe("fal-ai/flux/dev", {
        input: {
          prompt: fluxPrompt,
          guidance_scale: 3.5,
          num_images: 1,
          image_size: falImageSize(aspectRatio) as any,
          num_inference_steps: 28,
        },
        logs: false,
      });
      trackFalUsage("fal-ai/flux/dev", 0.025, { width: 1024, height: 1024 });
      const fluxDevData = fluxDevRes.data as any;
      resultUrl = fluxDevData?.images?.[0]?.url || "";
      resultUrl = await toBase64DataUri(resultUrl);
      // Optional upscaling
      if (upscale) {
        resultUrl = await upscaleImage(resultUrl);
      }

      // Deduct credits after successful generation


      if (userId && userId !== "anonymous" && creditCost > 0) {


        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


      }


      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "custom",
        prompt: fluxPrompt,
        description: imageDescription,
      });
    }

    // ============================================
    // MODE: VARIATION - Flux Pro 1.1 Ultra
    // ============================================
    if (mode === "variation") {
      console.log("🎨 Using Flux Pro 1.1 Ultra for variation...");

      const variationPrompt =
        userPrompt && userPrompt.trim().length > 0
          ? `${userPrompt}, masterpiece, 8k resolution, highly detailed, professional quality`
          : `${imageDescription}, creative reimagining, alternative interpretation, unique artistic perspective, professional quality, 8k resolution, masterpiece`;

      console.log("📝 Variation prompt:", variationPrompt);

      const fluxUltraRes = await fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
        input: {
          prompt: variationPrompt,
          aspect_ratio: aspectRatio as any,
          output_format: "jpeg",
          safety_tolerance: "2",
        } as any,
        logs: false,
      });
      trackFalUsage("fal-ai/flux-pro/v1.1-ultra", 0.06);
      const fluxUltraData = fluxUltraRes.data as any;
      resultUrl = fluxUltraData?.images?.[0]?.url || "";
      resultUrl = await toBase64DataUri(resultUrl);
      // Optional upscaling
      if (upscale) {
        resultUrl = await upscaleImage(resultUrl);
      }

      // Deduct credits after successful generation


      if (userId && userId !== "anonymous" && creditCost > 0) {


        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


      }


      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "variation",
        prompt: variationPrompt,
        description: imageDescription,
      });
    }

    // ============================================
    // MODE: STYLE - Flux Pro with Style Enhancement
    // ============================================
    if (mode === "style") {
      console.log("🎨 Using Flux Pro for style transformation...");

      const styleKey = userPrompt || "anime";
      const styleConfig = STYLE_CONFIGS[styleKey] || STYLE_CONFIGS.anime;

      // Enhance the style prompt
      const enhancedStylePrompt = await enhancePrompt(
        styleConfig.prompt,
        "style",
        imageDescription,
      );

      const finalStylePrompt = `Transform into: ${enhancedStylePrompt}. Based on: ${imageDescription}. Ultra detailed, masterpiece quality, professional art`;

      console.log("📝 Style prompt:", finalStylePrompt);

      const fluxProRes = await fal.subscribe("fal-ai/flux-pro/v1.1", {
        input: {
          prompt: finalStylePrompt,
          image_size: falImageSize(aspectRatio) as any,
          output_format: "jpeg",
          safety_tolerance: "2",
        } as any,
        logs: false,
      });
      trackFalUsage("fal-ai/flux-pro/v1.1", 0.05);
      const fluxProData = fluxProRes.data as any;
      resultUrl = fluxProData?.images?.[0]?.url || "";
      resultUrl = await toBase64DataUri(resultUrl);
      // Optional upscaling
      if (upscale) {
        resultUrl = await upscaleImage(resultUrl);
      }

      // Deduct credits after successful generation


      if (userId && userId !== "anonymous" && creditCost > 0) {


        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


      }


      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "style",
        prompt: finalStylePrompt,
        description: imageDescription,
      });
    }
    // ============================================
    // MODE: CUSTOM with IDEOGRAM
    // ============================================
    if (mode === "custom" && selectedModel === "ideogram" && userPrompt) {
      const ideogramPrompt = `${userPrompt}, masterpiece, 8k, highly detailed, professional quality`;
      const ideoRes = await fal.subscribe("fal-ai/ideogram/v2/turbo", {
        input: {
          prompt: ideogramPrompt,
          aspect_ratio:
            aspectRatio === "3:4"
              ? "3:4"
              : aspectRatio === "16:9"
                ? "16:9"
                : aspectRatio === "9:16"
                  ? "9:16"
                  : "1:1",
          expand_prompt: false,
        },
        logs: false,
      });
      trackFalUsage("fal-ai/ideogram/v2/turbo", 0.05);
      const ideoData = ideoRes.data as any;
      resultUrl = ideoData?.images?.[0]?.url || "";
      resultUrl = await toBase64DataUri(resultUrl);
      if (upscale) resultUrl = await upscaleImage(resultUrl);
      // Deduct credits after successful generation

      if (userId && userId !== "anonymous" && creditCost > 0) {

        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

      }

      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "custom",
        model: "ideogram",
      });
    }

    // ============================================
    // MODE: CHAR with FLUX PULID (face lock)
    // ============================================
    if (mode === "char" && lockCharacter) {
      const pulidPrompt = `
${userPrompt || "person in a new scene"},
photorealistic, natural skin texture, DSLR photo, cinematic lighting
`;
      output = await replicate.run(
        "bytedance/flux-pulid:8baa7ef2255075b46f4d91cd238c21d31181b3e6a864463f967960bb0112525b",
        {
          input: {
            main_face_image: imageDataUri,
            prompt: pulidPrompt,
            num_steps: 20,
            start_step: 4,
            guidance: 4,
            id_weight: 0.6,
            neg_prompt:
              "cartoon, 3d render, cgi, plastic skin, doll face, bad anatomy, deformed face, blurry, low quality, watermark,animal face, dog face, hybrid, morphed, text",
            true_cfg: 5,
            timestep_to_start_cfg: 1,
            max_sequence_length: 128,
          },
        },
      );
      resultUrl = await handleReplicateOutput(output, "image");
      resultUrl = await toBase64DataUri(resultUrl);
      if (upscale) resultUrl = await upscaleImage(resultUrl);
      // Deduct credits after successful generation

      if (userId && userId !== "anonymous" && creditCost > 0) {

        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

      }

      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "char",
        model: "pulid",
      });
      trackReplicateUsage("bytedance/flux-pulid", 0.019);
    }

    // ============================================
    // MODE: VIDEO with KLING
    // ============================================
    if (mode === "video" && selectedModel === "kling") {
      const klingPrompt =
        userPrompt && userPrompt.trim().length > 0
          ? `${userPrompt}, cinematic motion, smooth movement`
          : "Smooth cinematic camera movement";
      await new Promise((res) => setTimeout(res, 7000));
      const klingRes = await fal.subscribe(
        "fal-ai/kling-video/v2.1/pro/image-to-video",
        {
          input: {
            prompt: klingPrompt,
            image_url: imageDataUri,
            duration: body.audioDuration === 10 ? "10" : "5",
          },
          logs: false,
        },
      );
      const klingData = klingRes.data as any;
      resultUrl = klingData?.video?.url || "";
      // Deduct credits after successful generation

      if (userId && userId !== "anonymous" && creditCost > 0) {

        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

      }

      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "video",
        model: "kling",
      });
      trackFalUsage("fal-ai/kling-video/v2.1/pro/image-to-video", 0.07, { duration_seconds: 5 });
    }

    // ============================================
    // MODE: VIDEO with SEEDDANCE 2.0 (fal.ai)
    // ============================================
    if (mode === "video" && selectedModel === "seeddance") {
      const seedPrompt =
        userPrompt && userPrompt.trim().length > 0
          ? `${userPrompt}, fluid motion, high quality video`
          : "Smooth natural motion, cinematic quality";

      const falResult = await fal.subscribe("bytedance/seedance-2.0/image-to-video", {
        input: {
          prompt: seedPrompt,
          image_url: imageUrl,
          resolution: "720p",
          duration: 5,
          generate_audio: true,
        },
        logs: false,
      });

      trackFalUsage("bytedance/seedance-2.0/image-to-video", 0.3024, { duration_seconds: 5 });
      const falData = falResult.data as any;
      resultUrl = falData?.video?.url || falData?.video_url || null;

      if (!resultUrl) throw new Error("SeedDance returned no video URL");

      if (userId && userId !== "anonymous" && creditCost > 0) {
        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));
      }

      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "video",
        model: "seeddance",
      });
    }

    // ============================================
    // MODE: CUSTOM / IMAGE with NANO BANANA PRO (fal.ai)
    // ============================================
    if (mode === "custom" && selectedModel === "nanobanana" && userPrompt) {
      const nbPrompt = `${userPrompt}, masterpiece, 8k, highly detailed, professional quality`;

      let falResult;
      try {
        falResult = await fal.subscribe("fal-ai/nano-banana-pro", {
          input: {
            prompt: nbPrompt,
            aspect_ratio: aspectRatio || "1:1",
            resolution: "1K",
            num_images: 1,
          },
          logs: true,
          onQueueUpdate: (update) => {
            if (update.status === "IN_PROGRESS") {
              console.log("Nano Banana Pro progress:", update.logs);
            }
          },
        });
        trackFalUsage("fal-ai/nano-banana-pro", 0.0398);
      } catch (falError: any) {
        console.error("Nano Banana Pro fal.ai error:", {
          message: falError?.message,
          name: falError?.name,
          status: falError?.status,
          body: falError?.body,
          cause: falError?.cause,
        });
        throw falError;
      }

      const falData = falResult.data as any;
      const imgUrl =
        falData?.images?.[0]?.url ||
        falData?.image?.url ||
        falData?.output;

      if (!imgUrl) throw new Error("Nano Banana Pro returned no image URL");

      resultUrl = imgUrl;

      if (userId && userId !== "anonymous" && creditCost > 0) {
        await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));
      }

      return NextResponse.json({
        success: true,
        url: resultUrl,
        mode: "custom",
        model: "nanobanana",
      });
    }

    if (mode === "vid2vid") {
      const vidPrompt =
        userPrompt && userPrompt.trim().length > 0
          ? userPrompt
          : "Transform with enhanced visuals, smooth motion, cinematic quality";

      // luma/modify-video requires a URL, not base64
      // If imageUrl is a public URL (Supabase storage), use it directly
      // If it's base64, fall back to first-frame extraction with wan
      const isUrl = imageUrl.startsWith("http");

      if (isUrl) {
        console.log("🎬 Using Luma Modify Video (Replicate)...");
        output = await replicate.run("luma/modify-video", {
          input: { video: imageUrl, prompt: vidPrompt, mode: "flex_1" },
        });
        trackReplicateUsage("luma/modify-video", 0.50, { duration: 6 });
        resultUrl = await handleReplicateOutput(output, "video");
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "vid2vid",
          model: "luma-modify",
        });
      } else {
        // Fallback: base64 input — extract first frame concept, use wan i2v
        console.log("🎬 Using Wan 2.1 i2v (first frame from base64)...");
        await new Promise((res) => setTimeout(res, 7000));

        const wanRes = await fal.subscribe("fal-ai/wan-i2v", {
          input: {
            image_url: imageDataUri,
            prompt: vidPrompt,
            num_frames: 81,
            num_inference_steps: 20,
            frames_per_second: 16,
            guidance_scale: 5,
          } as any,
          logs: false,
        });
        trackFalUsage("fal-ai/wan-i2v", 0.05, { duration_seconds: 5 });
        const wanData = wanRes.data as any;
        resultUrl = wanData?.video?.url || "";
        // Deduct credits after successful generation

        if (userId && userId !== "anonymous" && creditCost > 0) {

          await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));

        }

        return NextResponse.json({
          success: true,
          url: resultUrl,
          mode: "vid2vid",
          model: "wan-i2v",
        });
      }
    }
    // ============================================
    // FALLBACK: SDXL (should not reach here normally)
    // ============================================
    const finalPrompt = buildPrompt(mode, userPrompt, imageDescription);
    console.log("📝 Final prompt:", finalPrompt);

    output = await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          image: imageDataUri,
          prompt: finalPrompt,
          negative_prompt:
            "blurry, low quality, distorted, ugly, bad anatomy, duplicate, watermark, text, signature",
          num_outputs: 1,
          guidance_scale: 8.5,
          num_inference_steps: 40,
          prompt_strength: 0.5,
          width: 1024,
          height: 1024,
        },
      },
    );

    resultUrl = await handleReplicateOutput(output, "image");
    resultUrl = await toBase64DataUri(resultUrl);
    console.log("✅ Generation complete");

    // Deduct credits after successful generation


    if (userId && userId !== "anonymous" && creditCost > 0) {


      await forceDeduct(userId, creditCost, actionKey, getRemixDescription(mode));


    }


    return NextResponse.json({
      success: true,
      url: resultUrl,
      mode,
      prompt: finalPrompt,
      description: imageDescription,
    });
    trackReplicateUsage("stability-ai/sdxl", 0.0052);
  } catch (error: any) {
    console.error("❌ Generation error:", getErrorLogPayload(error));

    let errorMessage = "AI generation failed";
    let statusCode = 500;

    if (
      error.message?.includes("429") ||
      error.message?.includes("Too Many Requests")
    ) {
      errorMessage = "Too many requests. Please try again.";
      statusCode = 429;
    } else if (error.message?.includes("Failed to fetch image")) {
      errorMessage = "Could not access the image. Please check the URL.";
      statusCode = 400;
    } else if (error.message?.includes("CUDA out of memory")) {
      errorMessage = "Image too large. Please try a smaller image.";
      statusCode = 413;
    } else if (error.message?.includes("timeout")) {
      errorMessage = "Generation timed out. Please try again.";
      statusCode = 504;
    } else if (error.message?.includes("API token")) {
      errorMessage = "API configuration error. Please contact support.";
      statusCode = 500;
    } else if (error?.status === 403) {
      errorMessage =
        error?.body?.detail ||
        error?.body?.message ||
        error?.message ||
        "Provider rejected the request (403 Forbidden).";
      statusCode = 403;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details:
          process.env.NODE_ENV === "development"
            ? getErrorLogPayload(error)
            : undefined,
      },
      { status: statusCode },
    );
  }
}

// ============================================
// REPLICATE OUTPUT HANDLER
// ============================================
// ============================================
// REPLICATE OUTPUT HANDLER
// ============================================
async function handleReplicateOutput(
  output: any,
  type: "image" | "video" | "audio",
): Promise<string> {
  console.log("📦 Processing output...", {
    type,
    outputType: typeof output,
    isArray: Array.isArray(output),
    outputKeys: typeof output === "object" ? Object.keys(output || {}) : [],
  });
  if (output && typeof output.url === "function") {
    return output.url().href;
  }
  if (output && output[0] && typeof output[0].url === "function") {
    return output[0].url().href;
  }
  if (output && typeof output[0] === "string") {
    return output[0];
  }
  // Handle direct URL strings
  if (typeof output === "string") {
    return output;
  }

  // Handle arrays
  if (Array.isArray(output)) {
    const firstItem = output[0];

    // If first item is a string URL
    if (typeof firstItem === "string") {
      return firstItem;
    }

    // If first item is an object with url/audio properties
    if (typeof firstItem === "object" && firstItem !== null) {
      return String(
        firstItem.url ||
          firstItem.audio ||
          firstItem.audio_out ||
          firstItem.output ||
          firstItem,
      );
    }

    // If array contains ReadableStream
    if (firstItem instanceof ReadableStream) {
      return await processStream(firstItem, type);
    }
  }

  // Handle objects
  if (typeof output === "object" && output !== null) {
    // Check for common URL properties (Bark uses 'audio_out')
    if (output.url)
      return output.url instanceof URL ? output.url.href : String(output.url);
    if (output.audio) return String(output.audio);
    if (output.audio_out) return String(output.audio_out);
    if (output.output) return String(output.output);

    // Handle ReadableStream
    if (output instanceof ReadableStream) {
      return await processStream(output, type);
    }

    // If object has a first item
    if (output[0]) {
      const firstItem = output[0];
      if (typeof firstItem === "string") {
        return firstItem;
      }
      if (typeof firstItem === "object" && firstItem !== null) {
        return String(
          firstItem.url || firstItem.audio || firstItem.audio_out || firstItem,
        );
      }
    }
  }

  // Handle ReadableStream at top level
  if (output instanceof ReadableStream) {
    return await processStream(output, type);
  }

  console.error(
    "❌ Unexpected output format:",
    JSON.stringify(output, null, 2),
  );
  throw new Error("Unexpected output format from Replicate");
}

// Helper function to process streams
async function processStream(
  stream: ReadableStream,
  type: "image" | "video" | "audio",
): Promise<string> {
  const reader = stream.getReader();
  const chunks: BlobPart[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as BlobPart);
  }

  const mimeType =
    type === "video"
      ? "video/mp4"
      : type === "audio"
        ? "audio/mpeg"
        : "image/png";

  const blob = new Blob(chunks, { type: mimeType });
  const buffer = Buffer.from(await blob.arrayBuffer());
  const base64 = buffer.toString("base64");

  return `data:${mimeType};base64,${base64}`;
}
