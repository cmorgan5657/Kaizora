import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@/lib/ai/gemini";
import { logGeminiUsage } from "@/lib/ai/geminiUsage";

const MODEL = "gemini-3.1-pro-preview";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const geminiModel = genAI.getGenerativeModel({ model: MODEL });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const contentType = formData.get("contentType") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileType = file.type;
    const fileName = file.name;
    const fileSize = file.size;

    console.log("Analyzing file:", fileName, "Type:", fileType);

    let messageContent: any[] = [];

    // ===== IMAGES - AI CAN SEE =====
    if (fileType.startsWith("image/")) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${fileType};base64,${base64}`;

      messageContent = [
        {
          type: "text",
          text: `You are analyzing an image asset for the KAIZORA marketplace. Look at this image carefully and provide detailed analysis.

File: ${fileName}
Size: ${(fileSize / 1024).toFixed(2)} KB

KAIZORA VISUAL SUBCATEGORIES (pick the most fitting one):
- ai-images: General AI-generated images
- ai-illustrations: Digital illustrations, artwork
- concept-art: Concept art for games, films, projects
- character-designs: Character sheets, designs
- environments-worlds: Landscapes, environments, world-building
- backgrounds-textures: Background images, seamless textures
- icons-ui-assets: Icons, UI elements, interface assets
- logos-brand-elements: Logos, brand marks, identity elements
- posters-cover-art: Posters, album covers, book covers
- social-media-visuals: Social media posts, banners, thumbnails
- print-ready-assets: Print-quality assets, merchandise designs
- stock-style-imagery: Stock photo style images
- generative-art-collections: Abstract generative art, patterns

Analyze the image and provide JSON with:
{
  "title": "descriptive title based on what you see (max 60 chars)",
  "description": "detailed description of the image content, colors, composition, subjects, mood (150-200 words)",
  "contentType": "image",
  "category": "visual",
  "subcategory": "exact-slug-from-list-above (e.g. ai-images, concept-art, logos-brand-elements)",
  "suggestedPrice": number (1-100 based on quality, resolution, commercial value),
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"] (relevant keywords),
  "qualityScore": number 1-10 (clarity, composition, lighting, resolution),
  "recommendations": ["improvement 1", "improvement 2", "use case 1", "use case 2"]
}

Respond ONLY with valid JSON.`,
        },
        {
          type: "image_url",
          image_url: { url: dataUrl },
        },
      ];
    }

    // ===== PDFs - GEMINI READS FULL CONTENT =====
    else if (fileType === "application/pdf") {
      try {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString("base64");

        const pdfPrompt = `You are analyzing a PDF document for the KAIZORA marketplace. Read this PDF carefully and provide detailed analysis.

File: ${fileName}
Size: ${(fileSize / 1024).toFixed(2)} KB

KAIZORA TEXT/DOC SUBCATEGORIES (pick the most fitting one):
- templates: Document templates, business templates
- guides-tutorials: How-to guides, tutorials, educational content
- ebooks: E-books, digital books
- worksheets: Worksheets, workbooks, planners
- business-docs: Business plans, proposals, reports
- creative-writing: Stories, scripts, creative pieces
- research-papers: Research, whitepapers, academic content
- checklists: Checklists, cheat sheets, reference cards
- print-ready-assets: Print-ready designs, brochures, flyers

Based on the actual PDF content, provide JSON with:
{
  "title": "descriptive title based on what you read (max 60 chars)",
  "description": "detailed description of what this PDF contains, its purpose, structure, and value (150-200 words)",
  "contentType": "text",
  "category": "text",
  "subcategory": "exact-slug-from-list-above",
  "suggestedPrice": number (5-75 based on content quality, depth, and usefulness),
  "tags": ["pdf", "tag2", "tag3", "tag4", "tag5"] (relevant keywords from actual content),
  "qualityScore": number 1-10 (content quality, formatting, depth, usefulness),
  "recommendations": ["improvement 1", "use case 1", "formatting tip", "value-add suggestion"]
}

Respond ONLY with valid JSON.`;

        const geminiRes = await geminiModel.generateContent({
          contents: [{
            role: "user",
            parts: [
              { text: pdfPrompt },
              { inlineData: { mimeType: "application/pdf", data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0.5, responseMimeType: "application/json" },
        });
        logGeminiUsage(geminiRes, { feature: "analyze_asset_pdf", model: "gemini-3.1-pro-preview" });

        const geminiContent = geminiRes.response.text();
        console.log("Gemini PDF Response:", geminiContent);

        const suggestions = JSON.parse(geminiContent);
        return NextResponse.json(suggestions);
      } catch (pdfError) {
        console.error("Gemini PDF analysis failed, falling back to metadata:", pdfError);
        messageContent = [
          {
            type: "text",
            text: `You are analyzing a PDF document. Full content analysis failed, use metadata only.

File: ${fileName}
Size: ${(fileSize / 1024).toFixed(2)} KB

Provide JSON with suggestions based on filename and size:
{
  "title": "descriptive title based on filename (max 60 chars)",
  "description": "professional description for a PDF document (150-200 words)",
  "contentType": "text",
  "suggestedPrice": number (5-50 based on file size - larger = more valuable),
  "tags": ["pdf", "document", "tag3", "tag4", "tag5"] (relevant keywords from filename),
  "qualityScore": number 1-10 (estimate based on file size),
  "recommendations": ["add preview images", "create summary", "optimize file size", "add metadata"]
}

Respond ONLY with valid JSON.`,
          },
        ];
      }
    }

    // ===== AUDIO - GEMINI LISTENS DIRECTLY (no Whisper) =====
    else if (fileType.startsWith("audio/")) {
      const extension = fileName.split(".").pop()?.toLowerCase();

      try {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Audio = buffer.toString("base64");

        // Gemini accepts audio inline — analyze content directly.
        const audioPrompt = `You are analyzing an audio file for the KAIZORA marketplace. Listen to the audio content carefully.

File: ${fileName}
Format: ${extension?.toUpperCase()}
Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB
Duration: ~${Math.round(fileSize / 16000)} seconds (estimate)

KAIZORA AUDIO SUBCATEGORIES (pick the most fitting one):
- ai-music-tracks: Full AI-generated music tracks
- beats-instrumentals: Beats, instrumentals, backing tracks
- sound-effects-sfx: Sound effects for games, videos, apps
- ambience-atmospheres: Ambient sounds, atmosphere loops
- vocal-samples: Vocal samples, choir, voice snippets
- ai-voice-clips: AI-generated voice clips
- narration-audio: Narration, voiceover audio
- dialogue-packs: Dialogue recordings, conversation packs
- audio-loops: Loopable audio segments
- podcast-assets: Podcast intros, outros, transitions

Based on what you hear, provide JSON with:
{
  "title": "descriptive title based on audio content (max 60 chars)",
  "description": "detailed description of what this audio contains, topics discussed, tone, quality (150-200 words)",
  "contentType": "audio",
  "category": "audio",
  "subcategory": "exact-slug-from-list-above",
  "suggestedPrice": number (10-75),
  "tags": ["audio", "tag2", "tag3", "tag4", "tag5"],
  "qualityScore": number 1-10,
  "recommendations": ["improvement 1", "use case 1", "distribution tip", "content suggestion"]
}

Respond ONLY with valid JSON.`;

        const audioResult = await geminiModel.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                { text: audioPrompt },
                { inlineData: { mimeType: fileType, data: base64Audio } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
        });
        logGeminiUsage(audioResult, {
          feature: "analyze_asset_audio",
          model: MODEL,
        });
        return NextResponse.json(JSON.parse(audioResult.response.text()));
      } catch (audioError) {
        console.error("Audio analysis failed:", audioError);
        messageContent = [
          {
            type: "text",
            text: `Audio analysis failed. Analyzing metadata only.

File: ${fileName}
Format: ${extension?.toUpperCase()}
Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB

Pick from these KAIZORA AUDIO SUBCATEGORIES:
- ai-music-tracks: Full AI-generated music tracks
- beats-instrumentals: Beats, instrumentals, backing tracks
- sound-effects-sfx: Sound effects for games, videos, apps
- ambience-atmospheres: Ambient sounds, atmosphere loops
- vocal-samples: Vocal samples, choir, voice snippets
- ai-voice-clips: AI-generated voice clips
- narration-audio: Narration, voiceover audio
- dialogue-packs: Dialogue recordings, conversation packs
- audio-loops: Loopable audio segments
- podcast-assets: Podcast intros, outros, transitions

Based on the audio transcription, provide JSON with:
{
  "title": "descriptive title based on audio content (max 60 chars)",
  "description": "detailed description of what this audio contains, topics discussed, tone, quality (150-200 words)",
  "contentType": "audio",
  "category": "audio",
  "subcategory": "exact-slug-from-list-above (e.g. ai-music-tracks, sound-effects-sfx, narration-audio)",
  "suggestedPrice": number (10-75 based on content quality, usefulness, length),
  "tags": ["audio", "tag2", "tag3", "tag4", "tag5"] (relevant keywords from content),
  "qualityScore": number 1-10 (content quality, clarity, usefulness),
  "recommendations": ["improvement 1", "use case 1", "distribution tip", "content suggestion"]
}

Respond ONLY with valid JSON.`,
          },
        ];
      }
    }
    // ===== TEXT/CODE - AI CAN READ =====
    else if (
      fileType.startsWith("text/") ||
      fileType === "application/json" ||
      fileName.endsWith(".js") ||
      fileName.endsWith(".jsx") ||
      fileName.endsWith(".py") ||
      fileName.endsWith(".ts") ||
      fileName.endsWith(".tsx") ||
      fileName.endsWith(".jsx") ||
      fileName.endsWith(".md") ||
      fileName.endsWith(".css") ||
      fileName.endsWith(".html") ||
      fileName.endsWith(".xml") ||
      fileName.endsWith(".yml") ||
      fileName.endsWith(".yaml") ||
      fileName.endsWith(".json")
    ) {
      const textContent = await file.text();
      const preview = textContent.substring(0, 5000);
      const extension = fileName.split(".").pop()?.toLowerCase();

      messageContent = [
        {
          type: "text",
          text: `You are analyzing a text/code file. Read this content carefully.

File: ${fileName}
Extension: .${extension}
Size: ${(fileSize / 1024).toFixed(2)} KB
Lines: ~${textContent.split("\n").length}

CONTENT:
\`\`\`${extension}
${preview}
${textContent.length > 5000 ? "\n... (content continues)" : ""}
\`\`\`

Analyze the code/text and provide JSON with:
{
  "title": "descriptive title based on content (max 60 chars)",
  "description": "detailed explanation of what this code/text does, its purpose, quality (150-200 words)",
  "contentType": "${
    extension === "md" || extension === "txt" ? "text" : "code"
  }",
  "suggestedPrice": number (5-75 based on complexity, usefulness, documentation),
  "tags": ["language/framework", "tag2", "tag3", "tag4", "tag5"] (tech stack, purpose),
  "qualityScore": number 1-10 (code quality, readability, best practices, documentation),
  "recommendations": ["improvement 1", "best practice 1", "use case 1", "optimization tip"]
}

Respond ONLY with valid JSON.`,
        },
      ];
    }
    // ===== VIDEOS - AI ANALYZES METADATA =====
    else if (fileType.startsWith("video/")) {
      const extension = fileName.split(".").pop()?.toLowerCase();

      messageContent = [
        {
          type: "text",
          text: `You are analyzing a video file for the KAIZORA marketplace.

File: ${fileName}
Format: ${extension?.toUpperCase()}
Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB

KAIZORA VIDEO SUBCATEGORIES (pick the most fitting one based on filename):
- ai-video-clips: General AI-generated video clips
- cinematic-sequences: Cinematic footage, film-style sequences
- motion-graphics: Animated graphics, kinetic typography
- transitions: Video transitions, wipes, effects
- overlays: Video overlays, light leaks, bokeh
- animated-backgrounds: Looping animated backgrounds
- short-form-video-assets: TikTok/Reels/Shorts ready content
- video-templates: Editable video templates
- reels-shorts-assets: Social media short-form assets
- b-roll-footage: Supplementary B-roll footage
- visual-effects-vfx: VFX elements, explosions, particles
- ai-generated-animations: AI-created animations

Based on file characteristics, provide JSON with:
{
  "title": "descriptive title for this video (max 60 chars)",
  "description": "detailed description of what this video likely contains based on filename and format (100-150 words)",
  "contentType": "video",
  "category": "video",
  "subcategory": "exact-slug-from-list-above (e.g. ai-video-clips, motion-graphics, visual-effects-vfx)",
  "suggestedPrice": number (10-100, larger files = higher quality = higher price),
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"] (video, format, likely content),
  "qualityScore": number 1-10 (estimate: file size and format quality),
  "recommendations": ["encoding tip", "use case 1", "distribution tip", "optimization tip"]
}

Respond ONLY with valid JSON.`,
        },
      ];
    }
    // ===== OTHER FILES =====
    else {
      messageContent = [
        {
          type: "text",
          text: `You are analyzing a file.

File: ${fileName}
Type: ${fileType}
Size: ${(fileSize / 1024).toFixed(2)} KB

Provide JSON with generic suggestions:
{
  "title": "title based on filename (max 60 chars)",
  "description": "generic description for this file type (100 words)",
  "contentType": "other",
  "suggestedPrice": number (5-30),
  "tags": ["file-type", "tag2", "tag3"],
  "qualityScore": 6,
  "recommendations": ["tip 1", "tip 2", "use case"]
}

Respond ONLY with valid JSON.`,
        },
      ];
    }

    // Convert OpenAI-style messageContent to Gemini parts.
    const geminiParts: any[] = messageContent.map((c: any) => {
      if (c.type === "text") return { text: c.text };
      if (c.type === "image_url") {
        // c.image_url.url is data:<mime>;base64,<data>
        const url = c.image_url?.url || "";
        const m = url.match(/^data:([^;]+);base64,(.+)$/);
        if (m) return { inlineData: { mimeType: m[1], data: m[2] } };
      }
      return { text: "" };
    });

    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: geminiParts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
        responseMimeType: "application/json",
      },
    });
    logGeminiUsage(result, { feature: "analyze_asset", model: MODEL });

    const content = result.response.text() || "{}";
    const cleanContent = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const suggestions = JSON.parse(cleanContent);
    return NextResponse.json(suggestions);
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json(
      {
        error: "Analysis failed",
        message: error.message,
        title: "Error analyzing file",
        description: "Please fill in details manually.",
        contentType: "other",
        suggestedPrice: 10,
        tags: [],
        qualityScore: 5,
        recommendations: ["Manual review needed"],
      },
      { status: 200 },
    );
  }
}
