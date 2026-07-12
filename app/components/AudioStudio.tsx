"use client";

import { useState, useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import {
  Play,
  Pause,
  Download,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";

interface AudioStudioProps {
  generatedUrl: string;
  onRegenerate?: () => void;
}

export default function AudioStudio({
  generatedUrl,
  onRegenerate,
}: AudioStudioProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState("0:00");
  const [currentTime, setCurrentTime] = useState("0:00");
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);

    if (waveformRef.current && !wavesurfer.current) {
      try {
        wavesurfer.current = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: "rgba(255, 255, 255, 0.15)",
          progressColor: "#C41E3A",
          cursorColor: "#C41E3A",
          cursorWidth: 2,
          barWidth: 2,
          barGap: 1,
          barRadius: 0,
          height: 80,
          normalize: true,
          backend: "WebAudio",
        });

        wavesurfer.current.on("ready", () => {
          if (!isMountedRef.current) return;
          const dur = wavesurfer.current?.getDuration() || 0;
          setDuration(formatTime(dur));
          setIsLoading(false);
        });

        wavesurfer.current.on("audioprocess", () => {
          if (!isMountedRef.current) return;
          const time = wavesurfer.current?.getCurrentTime() || 0;
          const dur = wavesurfer.current?.getDuration() || 1;
          setCurrentTime(formatTime(time));
          setProgress((time / dur) * 100);
        });

        wavesurfer.current.on("play", () => {
          if (!isMountedRef.current) return;
          setIsPlaying(true);
        });

        wavesurfer.current.on("pause", () => {
          if (!isMountedRef.current) return;
          setIsPlaying(false);
        });

        wavesurfer.current.on("finish", () => {
          if (!isMountedRef.current) return;
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime("0:00");
        });

        wavesurfer.current.on("error", (error) => {
          console.error("WaveSurfer error:", error);
          setIsLoading(false);
        });

        wavesurfer.current.load(generatedUrl);
      } catch (error) {
        console.error("Failed to create WaveSurfer:", error);
        setIsLoading(false);
      }
    }

    return () => {
      isMountedRef.current = false;
      if (wavesurfer.current) {
        try {
          wavesurfer.current.pause();
          wavesurfer.current.unAll();
          wavesurfer.current.destroy();
        } catch (error) {
          console.log("WaveSurfer cleanup:", error);
        }
        wavesurfer.current = null;
      }
    };
  }, [generatedUrl]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = () => {
    if (!wavesurfer.current) return;
    try {
      wavesurfer.current.playPause();
    } catch (error) {
      console.error("Play/Pause error:", error);
    }
  };

  const handleMute = () => {
    if (!wavesurfer.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    wavesurfer.current.setMuted(newMuted);
  };

  const handleDownload = () => {
    try {
      const a = document.createElement("a");
      a.href = generatedUrl;
      a.download = `kaizora-audio-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Main container */}
      <div className="border border-white/10 bg-black/60">
        {/* Top bar — mode + time */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-600" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Audio Output
            </span>
          </div>
        <div className="flex items-center gap-3">
  {isLoading ? (
    <>
      <div className="w-8 h-3 bg-white/10 animate-pulse" />
      <span className="text-[11px] font-mono text-gray-600">/</span>
      <div className="w-8 h-3 bg-white/10 animate-pulse" />
    </>
  ) : (
    <>
      <span className="text-[11px] font-mono text-red-500">{currentTime}</span>
      <span className="text-[11px] font-mono text-gray-600">/</span>
      <span className="text-[11px] font-mono text-gray-500">{duration}</span>
    </>
  )}
</div>
        </div>

        {/* Waveform area */}
        <div className="relative px-4 py-5">
       {isLoading && (
  <div className="space-y-3">
    {/* Fake waveform skeleton */}
    <div className="flex items-end justify-center gap-[3px] h-[80px]">
      {Array.from({ length: 60 }).map((_, i) => {
        const height = 15 + Math.sin(i * 0.4) * 25 + Math.random() * 30;
        return (
          <div
            key={i}
            className="w-[2px] bg-white/10 animate-pulse"
            style={{
              height: `${height}%`,
              animationDelay: `${i * 30}ms`,
              animationDuration: "1.2s",
            }}
          />
        );
      })}
    </div>
    {/* Skeleton progress bar */}
    <div className="h-[2px] bg-white/5 w-full overflow-hidden">
      <div className="h-full w-1/3 bg-red-600/30 animate-[shimmer_1.5s_infinite]" />
    </div>
  </div>
)}
          <div
            ref={waveformRef}
            className={`w-full ${isLoading ? "hidden" : ""}`}
          />

          {/* Progress line at bottom */}
          {!isLoading && (
            <div className="mt-3 h-[2px] bg-white/5 w-full">
              <div
                className="h-full bg-red-600 transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

   {/* Controls bar */}
<div className="flex items-center gap-1 px-3 py-2.5 border-t border-white/10">
  {isLoading ? (
    <>
      <div className="w-10 h-10 bg-white/5 animate-pulse" />
      <div className="w-10 h-10 bg-white/5 animate-pulse" />
      <div className="flex-1" />
      <div className="w-16 h-10 bg-white/5 animate-pulse" />
      <div className="w-20 h-10 bg-white/5 animate-pulse" />
    </>
  ) : (
    <>
      {/* Play/Pause */}
      <button
        onClick={handlePlayPause}
        className="flex items-center justify-center w-10 h-10 bg-red-600 hover:bg-red-700 text-white transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      {/* Mute */}
      <button
        onClick={handleMute}
        className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors"
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>

      <div className="flex-1" />

      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="flex items-center gap-1.5 px-3 h-10 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-600/50 text-gray-400 hover:text-white text-[10px] uppercase tracking-wider transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Redo
        </button>
      )}

      <button
        onClick={handleDownload}
        className="flex items-center gap-1.5 px-3 h-10 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-600/50 text-gray-400 hover:text-white text-[10px] uppercase tracking-wider transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>
    </>
  )}
</div>
      </div>
    </div>
  );
}
