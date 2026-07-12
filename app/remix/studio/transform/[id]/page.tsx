"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Save,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function TransformStudio() {
  const router = useRouter();
  const params = useParams();
  const assetId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [scale, setScale] = useState(100);

  useEffect(() => {
    async function loadAsset() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirectTo=/remix");
        return;
      }

      const { data: assetData } = await supabase
        .from("assets")
        .select("*")
        .eq("id", assetId)
        .single();

      if (!assetData) {
        router.push("/remix");
        return;
      }

      setAsset(assetData);
      setLoading(false);
    }

    if (assetId) {
      loadAsset();
    }
  }, [assetId, router]);

  function storageUrl(path?: string | null) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }

  const handleSave = async () => {
    setSaving(true);
    const transformData = {
      rotation,
      flipH,
      flipV,
      scale,
      mode: "transform",
    };
    sessionStorage.setItem(`remix_${assetId}`, JSON.stringify(transformData));
    setTimeout(() => {
      setSaving(false);
      router.push(`/remix/review/${assetId}`);
    }, 1500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="border-b border-white/10">
          <div className="max-w-[1800px] mx-auto px-3 md:px-6 py-3">
            <Skeleton className="h-4 w-32 bg-white/10" />
          </div>
        </div>
        <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-80px)]">
          <Skeleton className="w-full h-[40vh] md:flex-1 bg-white/5" />
          <Skeleton className="w-full h-48 md:w-48 md:h-auto bg-white/5 border-t md:border-t-0 md:border-l border-white/10" />
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-xs font-light text-gray-400">Asset not found</p>
      </div>
    );
  }

  const imageUrl = storageUrl(asset.storage_path);
  const canvasTransform = `
    rotate(${rotation}deg) 
    scaleX(${flipH ? -1 : 1}) 
    scaleY(${flipV ? -1 : 1})
    scale(${scale / 100})
  `;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Compact Header */}
      <div className="border-b border-white/10 flex-shrink-0">
        <div className="max-w-[1800px] mx-auto px-3 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/remix/select-mode/${assetId}`)}
                className="text-gray-600 hover:text-white transition-colors text-xs font-light"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-base font-light">
                  {asset.title || "Untitled"}
                </h1>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider">
                  Transform
                </p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-light transition-colors disabled:opacity-50"
            >
              {saving ? "..." : "Save"}
            </button>
          </div>
        </div>
      </div>

    {/* Main Content */}
<div className="flex flex-col md:flex-row flex-1 overflow-hidden">
  {/* Canvas */}
  <div className="w-full h-[40vh] md:h-auto md:w-[60%] bg-black p-3 flex items-center justify-center overflow-hidden">
          <div className="relative w-full h-full flex items-center justify-center">
            {!imageUrl ? (
              <div className="text-6xl">📦</div>
            ) : asset.content_type === "image" ? (
              <img
                src={imageUrl}
                alt={asset.title}
                style={{
                  transform: canvasTransform,
                  transition: "transform 0.3s ease",
                  maxWidth: "38%",
                  maxHeight: "38%",
                }}
                className="object-contain"
              />
            ) : asset.content_type === "video" ? (
              <video
                src={imageUrl}
                className="object-contain"
                style={{ maxWidth: "38%", maxHeight: "38%" }}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : asset.content_type === "audio" ? (
              <div
                className="flex flex-col items-center justify-center gap-4"
                style={{ width: "38%" }}
              >
                <div className="text-5xl">🎧</div>
                <p className="text-gray-400 text-xs font-light">
                  {asset.title || "Audio"}
                </p>
                <div className="flex items-end gap-0.5 h-8">
                  {[
                    3, 6, 4, 8, 5, 7, 3, 6, 4, 5, 8, 4, 6, 3, 7, 5, 8, 4, 6, 3,
                  ].map((h, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-red-500/60 rounded-full animate-pulse"
                      style={{
                        height: `${h * 3}px`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-6xl">📦</div>
            )}
          </div>
        </div>

      {/* Super Compact Sidebar */}
<div className="w-full md:w-[40%] border-t md:border-t-0 md:border-l border-white/10 bg-white/5 overflow-y-auto flex-shrink-0" data-lenis-prevent>
          <div className="p-3 space-y-2">
            {/* Transform Grid */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setRotation((prev) => (prev + 90) % 360)}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-red-500/30 transition-all flex flex-col items-center gap-1"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span className="text-[9px] uppercase tracking-wider text-gray-500">
                  Rotate
                </span>
              </button>

              <button
                onClick={() => setFlipH(!flipH)}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-red-500/30 transition-all flex flex-col items-center gap-1"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                <span className="text-[9px] uppercase tracking-wider text-gray-500">
                  Flip H
                </span>
              </button>

              <button
                onClick={() => setFlipV(!flipV)}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-red-500/30 transition-all flex flex-col items-center gap-1"
              >
                <FlipVertical className="w-3.5 h-3.5" />
                <span className="text-[9px] uppercase tracking-wider text-gray-500">
                  Flip V
                </span>
              </button>

              <button
                onClick={() => {
                  setRotation(0);
                  setFlipH(false);
                  setFlipV(false);
                  setScale(100);
                }}
                className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-red-500/30 transition-all flex flex-col items-center gap-1"
              >
                <span className="text-xs">↻</span>
                <span className="text-[9px] uppercase tracking-wider text-gray-500">
                  Reset
                </span>
              </button>
            </div>

            {/* Zoom */}
            <div className="pt-2 border-t border-white/10">
              <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1.5 text-center">
                Zoom {scale}%
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setScale((prev) => Math.max(prev - 10, 50))}
                  disabled={scale <= 50}
                  className="p-1.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-red-500/30 transition-all disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  <ZoomOut className="w-3 h-3" />
                  <span className="text-[9px]">Out</span>
                </button>
                <button
                  onClick={() => setScale((prev) => Math.min(prev + 10, 200))}
                  disabled={scale >= 200}
                  className="p-1.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-red-500/30 transition-all disabled:opacity-30 flex items-center justify-center gap-1"
                >
                  <ZoomIn className="w-3 h-3" />
                  <span className="text-[9px]">In</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
