"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Plus, Folder, Eye, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
export default function CreatorAssetsPage() {
  const PAGE_SIZE = 12;
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login?redirectTo=/creator/assets");
      } else {
        setUser(data.user);
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    if (!user) return;

    async function loadAssets() {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (!error) {
        setAssets(data);
      }

      setLoading(false);
    }

    loadAssets();
  }, [user]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [assets]);

  async function toggleVisibility(assetId: string, currentStatus: boolean) {
    const asset = assets.find((item) => item.id === assetId);

    if (!currentStatus && asset?.price_cents && asset.price_cents > 0) {
      const { data: licenses, error: licenseError } = await supabase
        .from("asset_licenses")
        .select("id")
        .eq("asset_id", assetId)
        .eq("is_available", true)
        .limit(1);

      if (licenseError || !licenses || licenses.length === 0) {
        alert("Select at least one license before publishing a paid asset.");
        router.push(`/creator/assets/${assetId}`);
        return;
      }
    }

    const { error } = await supabase
      .from("assets")
      .update({ is_public: !currentStatus })
      .eq("id", assetId);

    if (error) {
      alert("Failed to update visibility");
      return;
    }

    // Update local state
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, is_public: !currentStatus } : asset
      )
    );
  }

  function renderThumb(asset: any) {
    const thumbPath = asset.thumbnail_path;
    const storagePath = asset.storage_path;
    const thumbUrl = thumbPath ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${thumbPath}` : null;
    const fileUrl = storagePath ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${storagePath}` : null;
    const fallback =
      "w-full h-full flex items-center justify-center bg-white/5 text-gray-600 text-xs font-light";

    switch (asset.content_type) {
      case "image":
        return (
          <img src={thumbUrl || fileUrl || ""} className="w-full h-full object-cover" alt="preview" />
        );
      case "video":
        return (
          <video
            src={fileUrl || ""}
            poster={thumbUrl || undefined}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
            onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
            onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
          />
        );
      case "audio":
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 gap-2 px-3">
            <div className="text-3xl md:text-4xl">🎧</div>
            <p className="text-[10px] md:text-xs text-gray-500 font-light truncate w-full text-center">{asset.title || "Audio"}</p>
            <audio
              src={fileUrl || ""}
              controls
              className="w-full h-6 md:h-8"
              onClick={(e) => e.stopPropagation()}
              preload="metadata"
            />
          </div>
        );
      case "text":
      case "prompt":
        return <div className={fallback}>📄 TEXT</div>;
      case "code":
        return <div className={fallback}>💻 CODE</div>;
      default:
        return <div className={fallback}>📦 FILE</div>;
    }
  }

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 right-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-7xl mx-auto py-4 md:py-12 px-2 md:px-6">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between mb-6 md:mb-12">
            <div>
              <Skeleton className="h-7 md:h-10 w-36 md:w-48 bg-white/10 mb-2" />
              <Skeleton className="h-3 md:h-4 w-20 md:w-24 bg-white/10" />
            </div>
            <Skeleton className="h-9 md:h-12 w-28 md:w-36 bg-white/10" />
          </div>

          {/* Assets Grid Skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 overflow-hidden"
              >
                <Skeleton className="h-28 md:h-48 w-full bg-white/10" />

                <div className="p-2 md:p-5 border-t border-white/10 space-y-2 md:space-y-3">
                  <Skeleton className="h-4 md:h-5 w-3/4 bg-white/10" />
                  <Skeleton className="h-3 md:h-4 w-full bg-white/10" />

                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 md:h-5 w-12 md:w-16 bg-white/10" />
                    <Skeleton className="h-3 md:h-4 w-16 md:w-20 bg-white/10" />
                  </div>

                  <Skeleton className="h-7 md:h-8 w-full bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/2 w-96 h-96 bg-red-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-7xl mx-auto py-4 md:py-12 px-2 md:px-6">
        <div className="flex items-center justify-between mb-6 md:mb-12">
          <div>
            <h1 className="text-xl md:text-4xl font-extralight tracking-tight mb-1 md:mb-2">
              Your Assets
            </h1>
            <p className="text-gray-600 text-xs md:text-sm font-light">
              {assets.length} {assets.length === 1 ? "asset" : "assets"}
            </p>
          </div>
          <button
            onClick={() => router.push("/creator/assets/create")}
            className="group flex items-center space-x-2 px-3 md:px-6 py-2 md:py-3 bg-gradient-to-r from-red-600 to-red-700 text-xs md:text-sm font-light hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            <span>Create Asset</span>
          </button>
        </div>

        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 md:py-32">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 border border-white/10 flex items-center justify-center mb-4 md:mb-6">
              <Folder className="w-6 h-6 md:w-8 md:h-8 text-gray-700" />
            </div>
            <h3 className="text-sm md:text-lg font-light mb-1 md:mb-2">No assets yet</h3>
            <p className="text-gray-600 text-xs md:text-sm font-light mb-4 md:mb-8 text-center max-w-md">
              Upload your first asset to start building your portfolio
            </p>
            <button
              onClick={() => router.push("/creator/assets/create")}
              className="flex items-center space-x-2 px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-red-600 to-red-700 text-xs md:text-sm font-light hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300"
            >
              <Plus className="w-4 h-4" />
              <span>Create Asset</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-6">
              {assets.slice(0, visibleCount).map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => router.push(`/creator/assets/${asset.id}`)}
                  className="group relative bg-white/5 border border-white/10 hover:border-white/20 transition-all duration-300 cursor-pointer overflow-hidden"
                >
                  <div className="h-28 md:h-48 bg-black overflow-hidden">
                    {renderThumb(asset)}
                  </div>

                  <div className="p-2 md:p-5 border-t border-white/10">
                    <h3 className="text-xs md:text-base font-light mb-1 md:mb-2 truncate group-hover:text-red-400 transition-colors duration-300">
                      {asset.title || "Untitled Asset"}
                    </h3>
                    <p className="text-gray-600 text-[10px] md:text-sm font-light truncate mb-2 md:mb-4">
                      {asset.description || "No description"}
                    </p>

                    <div className="flex items-center justify-between text-[10px] md:text-xs font-light mb-2 md:mb-3">
                      <span className="px-1.5 md:px-2 py-0.5 bg-white/5 border border-white/10 text-gray-600">
                        {asset.content_type}
                      </span>
                      <span className="text-gray-600 hidden md:inline">
                        {new Date(asset.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Visibility Toggle - Bottom */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVisibility(asset.id, asset.is_public);
                      }}
                      className={`w-full flex items-center justify-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 border transition-all text-[10px] md:text-xs font-light ${
                        asset.is_public
                          ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                          : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10"
                      }`}
                    >
                      {asset.is_public ? (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>Public</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span>Private</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {visibleCount < assets.length && (
              <div className="flex justify-center">
                <button
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="px-4 md:px-5 py-2 border border-white/10 text-xs md:text-sm font-light text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
