import ffmpeg from "fluent-ffmpeg";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readFile } from "fs/promises";
import { resolve } from "path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

function pickExistingPath(
  candidates: Array<string | null | undefined>,
  fallbackCommand: string,
): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    // Command names (ffmpeg/ffprobe) should be passed through for PATH lookup.
    if (!candidate.includes("/") && !candidate.includes("\\")) return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return fallbackCommand;
}

const ffmpegManualPath = resolve(
  process.cwd(),
  "node_modules",
  "ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
);
const ffprobeManualPath = resolve(
  process.cwd(),
  "node_modules",
  "ffprobe-static",
  "bin",
  process.platform === "win32" ? "win32" : process.platform,
  process.arch === "x64" ? "x64" : process.arch,
  process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
);

const ffmpegResolvedPath = pickExistingPath([
  process.env.FFMPEG_PATH,
  ffmpegStatic || null,
  ffmpegManualPath,
  "ffmpeg",
], "ffmpeg");
const ffprobeResolvedPath = pickExistingPath([
  process.env.FFPROBE_PATH,
  ffprobeStatic?.path,
  ffprobeManualPath,
  "ffprobe",
], "ffprobe");

ffmpeg.setFfmpegPath(ffmpegResolvedPath);
ffmpeg.setFfprobePath(ffprobeResolvedPath);

console.log("FFmpeg path selected:", ffmpegResolvedPath);
console.log("FFprobe path selected:", ffprobeResolvedPath);

export interface ExtractedFrame {
  frameNumber: number;
  timestamp: string;
  base64: string;
}

export async function extractVideoFrames(
  videoBuffer: Buffer,
  videoName: string,
  frameCount: number = 40,
): Promise<{ frames: ExtractedFrame[]; duration: number; metadata: any }> {
  const tempDir = join(tmpdir(), `video-analysis-${Date.now()}`);
  const videoPath = join(tempDir, videoName);

  try {
    // Create temp directory
    mkdirSync(tempDir, { recursive: true });

    // Write video to temp file
    const writeStream = createWriteStream(videoPath);
    writeStream.write(videoBuffer);
    writeStream.end();
    await new Promise<void>((resolve) =>
      writeStream.on("finish", () => resolve()),
    );

    // Get video metadata
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const duration = metadata.format.duration || 0;
    const videoStream = metadata.streams.find(
      (s: any) => s.codec_type === "video",
    );

    console.log(`  Video duration: ${duration}s`);
    console.log(`  Resolution: ${videoStream?.width}x${videoStream?.height}`);

    // Calculate frame extraction times (evenly distributed)
    const frameInterval = duration / (frameCount + 1);
    const frameTimes: number[] = [];
    for (let i = 1; i <= frameCount; i++) {
      frameTimes.push(frameInterval * i);
    }

    // Extract frames
    const frames: ExtractedFrame[] = [];

    for (let i = 0; i < frameTimes.length; i++) {
      const time = frameTimes[i];
      const outputPath = join(tempDir, `frame-${i}.jpg`);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(time)
          .frames(1)
          .output(outputPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });

      // Read frame and convert to base64
      const frameBuffer = await readFile(outputPath);
      const base64 = frameBuffer.toString("base64");

      frames.push({
        frameNumber: i + 1,
        timestamp: formatTimestamp(time),
        base64: `data:image/jpeg;base64,${base64}`,
      });

      console.log(
        `  ✓ Extracted frame ${i + 1}/${frameCount} at ${formatTimestamp(time)}`,
      );
    }

    return { frames, duration, metadata: videoStream };
  } finally {
    // Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }
}
export async function extractAudioTrack(
  videoBuffer: Buffer,
  videoName: string,
): Promise<{
  audioBase64: string | null;
  hasAudio: boolean;
  durationSeconds: number;
}> {
  const tempDir = join(tmpdir(), `audio-extract-${Date.now()}`);
  const videoPath = join(tempDir, videoName);
  const audioPath = join(tempDir, "audio.mp3");

  try {
    mkdirSync(tempDir, { recursive: true });

    const writeStream = createWriteStream(videoPath);
    writeStream.write(videoBuffer);
    writeStream.end();
    await new Promise<void>((resolve) =>
      writeStream.on("finish", () => resolve()),
    );

    // Check if video has an audio stream
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const audioStream = metadata.streams.find(
      (s: any) => s.codec_type === "audio",
    );

    if (!audioStream) {
      console.log("  ⚠️ No audio stream found in video");
      return { audioBase64: null, hasAudio: false, durationSeconds: 0 };
    }

    const duration = metadata.format.duration || 0;

    const maxDuration = Math.min(duration, 60);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("64k")
        .audioChannels(1)
        .duration(maxDuration)
        .output(audioPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    const audioBuffer = await readFile(audioPath);
    const audioBase64 = audioBuffer.toString("base64");

    console.log(
      `  ✓ Audio extracted: ${(audioBuffer.length / 1024).toFixed(0)}KB, ${maxDuration.toFixed(1)}s`,
    );

    return {
      audioBase64,
      hasAudio: true,
      durationSeconds: maxDuration,
    };
  } catch (e) {
    console.error("  ⚠️ Audio extraction failed:", e);
    return { audioBase64: null, hasAudio: false, durationSeconds: 0 };
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Audio cleanup error:", e);
    }
  }
}
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}
