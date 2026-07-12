"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Save,
  Store,
  Download,
  Music,
  Sparkles,
  Lock,
  Clock,
  Ratio,
  Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeLicenseSlug } from "@/lib/licenses";

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const assetId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [remixData, setRemixData] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?redirectTo=/remix");
        return;
      }

      if (assetId === "new") {
        // Decision Layer mode — build asset from session
        try {
          const raw = sessionStorage.getItem("kaizora_remix_session");
          if (raw) {
            const session = JSON.parse(raw);
            const firstFile = session.uploadedAssets?.[0];
            const contentType = firstFile?.content_type?.startsWith("video/")
              ? "video"
              : firstFile?.content_type?.startsWith("audio/")
                ? "audio"
                : "image";
            const tempUrl = firstFile
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/decision-layer-temp/${firstFile.storagePath}`
              : null;

            setAsset({
              id: "new",
              title: firstFile?.name || "Decision Layer Content",
              content_type: contentType,
              storage_path: null,
              _tempStorageUrl: tempUrl,
            });
          }
        } catch (e) {
          console.error("Session load error:", e);
        }
      } else {
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
      }

      const saved = sessionStorage.getItem(`remix_${assetId}`);
      if (saved) setRemixData(JSON.parse(saved));

      setLoading(false);
    }
    if (assetId) loadData();
  }, [assetId, router]);

  function storageUrl(path?: string | null) {
    if (asset?._tempStorageUrl) return asset._tempStorageUrl;
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }

  async function uploadFromUrl(
    url: string,
    userId: string,
    contentType: string,
  ): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch");
      const blob = await response.blob();
      const ext =
        contentType === "video"
          ? "mp4"
          : contentType === "audio"
            ? "mp3"
            : "png";
      const mime =
        contentType === "video"
          ? "video/mp4"
          : contentType === "audio"
            ? "audio/mpeg"
            : "image/png";
      const fileName = `remixed/${userId}/${Date.now()}_${assetId}.${ext}`;
      const { data, error } = await supabase.storage
        .from("assets")
        .upload(fileName, blob, { contentType: mime });
      if (error) return null;
      return data.path;
    } catch {
      return null;
    }
  }

  const detectContentType = (url: string, originalType: string) => {
    const u = url.toLowerCase();
    if (u.includes(".mp4") || u.includes("video")) return "video";
    if (u.includes(".mp3") || u.includes(".wav") || u.includes("audio"))
      return "audio";
    return "image";
  };

  // Works out the lineage tags for a remix of the current source asset.
  //  - Commercial source  → origin stays the ORIGINAL creator, locked to Commercial
  //  - Royalty-Free source → the remixer becomes the new origin, not locked
  //  - Own asset           → inherit the asset's own tags
  //  - "new" / Decision Layer → the remixer is the origin
  async function computeLineage(
    userId: string,
  ): Promise<{ originCreatorId: string; originLicense: string | null }> {
    let originCreatorId: string = userId;
    let originLicense: string | null = null;

    if (assetId !== "new" && asset) {
      if (asset.owner_id === userId) {
        originCreatorId = asset.origin_creator_id || userId;
        originLicense = asset.origin_license || null;
      } else {
        const { data: pl } = await supabase
          .from("purchased_licenses")
          .select("license_type:license_types(slug)")
          .eq("buyer_id", userId)
          .eq("asset_id", asset.id)
          .limit(1)
          .maybeSingle();
        const rawSlug = Array.isArray((pl as any)?.license_type)
          ? (pl as any)?.license_type[0]?.slug
          : (pl as any)?.license_type?.slug;
        const slug = normalizeLicenseSlug(rawSlug);

        if (slug === "commercial") {
          originCreatorId = asset.origin_creator_id || asset.owner_id;
          originLicense = "commercial";
        } else {
          originCreatorId = userId;
          originLicense = null;
        }
      }
    }

    return { originCreatorId, originLicense };
  }

  const handleSaveToLibrary = async () => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert("Please log in");
        setSaving(false);
        return;
      }

      const generatedUrl = remixData?.generatedUrl;
      const contentType = detectContentType(
        generatedUrl || "",
        asset.content_type,
      );
      const uploadedPath = await uploadFromUrl(
        generatedUrl,
        user.id,
        contentType,
      );

      if (!uploadedPath) {
        alert("Upload failed. Please try again.");
        setSaving(false);
        return;
      }

      // Lineage tags — who the remix's origin creator is + whether it's license-locked.
      const { originCreatorId, originLicense } = await computeLineage(user.id);

      const { error } = await supabase.from("assets").insert({
        owner_id: user.id,
        title: `${asset.title} (Remixed)`,
        description: `Remixed with ${remixData?.modeLabel || "AI"} — ${remixData?.modelLabel || ""}`,
        content_type: contentType,
        storage_path: uploadedPath,
        thumbnail_path: uploadedPath,
        is_public: false,
        is_remix: true,
        remix_type: "ai_regenerate",
        remix_data: {
          originalAssetId: asset.id,
          ...remixData,
        },
        origin_creator_id: originCreatorId,
        origin_license: originLicense,
      });

      if (error) {
        alert("Failed to save");
        setSaving(false);
        return;
      }

      if (assetId !== "new") {
        await supabase
          .from("remix_relations")
          .insert({
            original_asset_id: asset.id,
            derived_asset_id: (
              await supabase
                .from("assets")
                .select("id")
                .eq("storage_path", uploadedPath)
                .single()
            ).data?.id,
          })
          .then(() => {});
      }

      sessionStorage.removeItem(`remix_${assetId}`);
      router.push("/library");
    } catch {
      alert("Failed to save");
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!remixData?.generatedUrl) return;
    try {
      const response = await fetch(remixData.generatedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentType = detectContentType(
        remixData.generatedUrl,
        asset.content_type,
      );
      a.download = `remixed_${asset.title || "asset"}.${contentType === "video" ? "mp4" : contentType === "audio" ? "mp3" : "png"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Download failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-3 md:p-8">
        <Skeleton className="h-6 md:h-8 w-36 md:w-48 bg-white/10 mb-4 md:mb-8" />
        <div className="grid md:grid-cols-2 gap-3 md:gap-8">
          <Skeleton className="h-48 md:h-96 bg-white/10" />
          <Skeleton className="h-48 md:h-96 bg-white/10" />
        </div>
      </div>
    );
  }

  if (!asset) return null;

  const imageUrl = storageUrl(asset.storage_path);
  const generatedUrl = remixData?.generatedUrl;
  const contentType = generatedUrl
    ? detectContentType(generatedUrl, asset.content_type)
    : "image";

  return (
    <div className="min-h-screen md:h-screen bg-black text-white flex flex-col overflow-auto md:overflow-hidden" data-lenis-prevent>
      {/* 3 Panel Layout */}
      <div className="flex-1 flex flex-col md:flex-row gap-0 md:overflow-hidden">
        {/* LEFT PANEL — Original */}
        <div className="md:flex-1 border-b md:border-b-0 md:border-r border-white/10 flex flex-col">
          <div className="px-3 md:px-4 py-2 md:py-3 border-b border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-600">
              Original
            </p>
            <p className="text-xs text-white font-medium mt-0.5 truncate">
              {asset.title}
            </p>
            <p className="text-[10px] text-gray-600">{asset.content_type}</p>
          </div>
          <div className="flex items-center justify-center p-3 md:p-4 bg-white/[0.02]">
            <div className="w-full max-w-xs aspect-square bg-white/5 border border-white/10 overflow-hidden mx-auto">
              {asset.content_type === "image" && imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Original"
                  className="w-full h-full object-cover"
                />
              ) : asset.content_type === "video" && imageUrl ? (
                <video
                  src={imageUrl}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : asset.content_type === "audio" && imageUrl ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6">
                  <div className="w-16 h-16 bg-white/5 border border-white/10 flex items-center justify-center">
                    <Music className="w-8 h-8 text-red-500" />
                  </div>
                  <p className="text-[10px] text-gray-400 truncate max-w-full">
                    {asset.title}
                  </p>
                  <audio
                    src={imageUrl}
                    controls
                    className="w-full h-10"
                    style={{ filter: "invert(1) hue-rotate(180deg)" }}
                  />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl">
                  📦
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE PANEL — Result */}
        <div className="md:flex-1 border-b md:border-b-0 md:border-r border-white/10 flex flex-col">
          <div className="px-3 md:px-4 py-2 md:py-3 border-b border-white/10 flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 flex-1">
              AI Result
            </p>
            {remixData?.modelLabel && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-600/10 border border-red-600/30 text-[9px] text-red-400 uppercase tracking-wider">
                <Sparkles className="w-2.5 h-2.5" />
                {remixData.modelLabel}
              </div>
            )}
            {remixData?.modeLabel && (
              <div className="px-2 py-1 bg-white/5 border border-white/10 text-[9px] text-gray-400 uppercase tracking-wider">
                {remixData.modeLabel}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center p-3 md:p-6 bg-white/[0.02]">
            {generatedUrl ? (
              contentType === "video" ? (
                <video
                  src={generatedUrl}
                  controls
                  className="max-w-sm max-h-96 object-contain border border-white/10"
                  crossOrigin="anonymous"
                />
              ) : contentType === "audio" ? (
                <div className="w-full max-w-md flex flex-col gap-4">
                  <div className="border border-white/10 bg-black/60">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-600" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                          Audio Result
                        </span>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col items-center gap-4">
                      <div className="w-14 h-14 bg-white/5 border border-white/10 flex items-center justify-center">
                        <Music className="w-7 h-7 text-red-500" />
                      </div>
                      <audio
                        src={generatedUrl}
                        controls
                        className="w-full h-10"
                        style={{ filter: "invert(1) hue-rotate(180deg)" }}
                      />
                    </div>
                    <div className="flex items-center gap-1 px-3 py-2.5 border-t border-white/10">
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 px-3 h-9 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-600/50 text-gray-400 hover:text-white text-[10px] uppercase tracking-wider transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={generatedUrl}
                  alt="Generated"
                  className="max-w-sm max-h-96 object-contain border border-red-600/20"
                  crossOrigin="anonymous"
                />
              )
            ) : (
              <div className="text-gray-600 text-xs">No result</div>
            )}
          </div>
          <div className="px-4 py-3 border-t border-white/10 text-[10px] text-gray-600">
            {contentType} · AI Generated
          </div>
        </div>

        {/* RIGHT PANEL — Details + Actions */}
        <div className="md:flex-1 flex flex-col overflow-y-auto" data-lenis-prevent>
          <div className="px-3 md:px-4 py-2 md:py-3 border-b border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-gray-600">
              Details & Actions
            </p>
          </div>

          <div className="flex-1 overflow-y-auto" data-lenis-prevent>
            {/* Generation Details */}
            <div className="px-4 py-4 border-b border-white/10 space-y-0 divide-y divide-white/10">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-[11px] text-gray-500">Mode</span>
                <span className="text-[11px] text-white font-medium">
                  {remixData?.modeLabel || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-[11px] text-gray-500">Model</span>
                <span className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
                  <Sparkles className="w-3 h-3" />
                  {remixData?.modelLabel || "—"}
                </span>
              </div>
              {remixData?.prompt && (
                <div className="py-2.5">
                  <span className="text-[11px] text-gray-500 block mb-1">
                    Prompt
                  </span>
                  <span className="text-[11px] text-white leading-relaxed line-clamp-4">
                    {remixData.prompt}
                  </span>
                </div>
              )}
              {remixData?.aspectRatio && contentType === "image" && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-[11px] text-gray-500">
                    Aspect Ratio
                  </span>
                  <span className="text-[11px] text-white">
                    {remixData.aspectRatio}
                  </span>
                </div>
              )}
              {remixData?.duration && remixData?.aiMode !== "aud2aud" && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-[11px] text-gray-500">Duration</span>
                  <span className="text-[11px] text-white">
                    {remixData.duration}s
                  </span>
                </div>
              )}
              {remixData?.quality && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-[11px] text-gray-500">Quality</span>
                  <span className="text-[11px] text-white capitalize">
                    {remixData.quality}
                  </span>
                </div>
              )}
              {remixData?.lockCharacter && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-[11px] text-gray-500">
                    Lock Character
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-red-400">
                    <Lock className="w-3 h-3" /> On
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-4 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">
                Save Options
              </p>

              <button
                onClick={handleSaveToLibrary}
                disabled={saving}
                className="w-full flex items-center gap-3 px-4 py-3 bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Save className="w-4 h-4 text-white flex-shrink-0" />
                <div className="flex-1 text-left">
                  <div className="text-xs font-semibold text-white">
                    {saving ? "Saving..." : "Save to Library"}
                  </div>
                  <div className="text-[10px] text-red-200 mt-0.5">
                    Keep private in your library
                  </div>
                </div>
              </button>

              <button
                onClick={async () => {
                  // Carry the lineage tags through to the create page so a
                  // Commercial remix keeps its royalty link to the original creator.
                  let lineage: {
                    originCreatorId: string;
                    originLicense: string | null;
                  } | null = null;
                  try {
                    const {
                      data: { user },
                    } = await supabase.auth.getUser();
                    if (user) lineage = await computeLineage(user.id);
                  } catch {
                    /* ignore — create page falls back to fresh-original tagging */
                  }
                  sessionStorage.setItem(
                    "decisionLayerData",
                    JSON.stringify({
                      evaluation: {
                        title: `${asset.title} (Remixed)`,
                        reason: `Remixed with ${remixData?.modeLabel || "AI"} using ${remixData?.modelLabel || ""}${remixData?.prompt ? ". Prompt: " + remixData.prompt : ""}`,
                        honestPricing: {
                          low: remixData?.price || 2.99,
                        },
                        suggestions: [],
                      },
                      context: {
                        contentType: contentType,
                        targetAudience: "",
                        qualityLevel: remixData?.quality || "balanced",
                      },
                      uploadedFiles: generatedUrl
                        ? [
                            {
                              name: `remixed_${asset.title}.${contentType === "video" ? "mp4" : contentType === "audio" ? "mp3" : "png"}`,
                              type: contentType,
                              base64: generatedUrl,
                            },
                          ]
                        : [],
                      // Lineage tags for the create page (null = fresh original)
                      lineage,
                    }),
                  );
                  router.push("/creator/assets/create");
                }}
                disabled={saving}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 hover:border-amber-500/40 hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Store className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div className="flex-1 text-left">
                  <div className="text-xs font-medium text-white">
                    List on Marketplace
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Sell your AI asset
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-white/10">
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Original asset remains unchanged. New asset created with lineage
              tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
