"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Sparkles, Plus, Image, Video, Clock, Library } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getLicenseRule, normalizeLicenseSlug } from "@/lib/licenses";

export default function RemixHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [recentRemixes, setRecentRemixes] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/login?redirectTo=/remix");
        return;
      }

      setUser(currentUser);

      // ============================================
      // 1. Load user's own assets (always remixable)
      // ============================================
      const { data: ownAssets } = await supabase
        .from("assets")
        .select(
          "id, title, content_type, thumbnail_path, storage_path, created_at",
        )
        .eq("owner_id", currentUser.id)
        .eq("is_remix", false)
        .order("created_at", { ascending: false })
        .limit(3);

      console.log("✅ Own assets:", ownAssets);

      // ============================================
      // 2. Load purchased assets (simpler approach)
      // ============================================
      const { data: purchasedAssets } = await supabase
        .from("purchased_assets")
        .select("asset_id")
        .eq("buyer_id", currentUser.id);

      console.log("✅ Purchased asset IDs:", purchasedAssets);

      const purchasedAssetIds = (purchasedAssets || []).map((p) => p.asset_id);

      // ============================================
      // 3. Check which have remix permissions
      // ============================================
      let remixableAssets: any[] = [];

      if (purchasedAssetIds.length > 0) {
        // Get the licenses the user holds, then keep only those that allow
        // remixing per the KAIZORA license model (Commercial / Royalty-Free).
        const { data: licensesWithRemix } = await supabase
          .from("purchased_licenses")
          .select(`asset_id, license_type:license_types(slug)`)
          .eq("buyer_id", currentUser.id)
          .in("asset_id", purchasedAssetIds);

        console.log("✅ Purchased licenses:", licensesWithRemix);

        const remixableAssetIds = (licensesWithRemix || [])
          .filter((l) => {
            const raw = Array.isArray((l as any).license_type)
              ? (l as any).license_type[0]?.slug
              : (l as any).license_type?.slug;
            return getLicenseRule(normalizeLicenseSlug(raw))?.canRemix;
          })
          .map((l) => l.asset_id);

        // Get full asset details for remixable ones
        if (remixableAssetIds.length > 0) {
          const { data: assetsData } = await supabase
            .from("assets")
            .select(
              "id, title, content_type, thumbnail_path, storage_path, created_at",
            )
            .in("id", remixableAssetIds)
            .limit(3);

          remixableAssets = assetsData || [];
          console.log("✅ Remixable assets:", remixableAssets);
        }
      }

      // ============================================
      // 4. Combine and deduplicate
      // ============================================
      const allRemixableAssets = [...(ownAssets || []), ...remixableAssets];

      const uniqueAssets = allRemixableAssets.filter((asset, index, self) => {
        if (!asset?.id) return false;
        return index === self.findIndex((a) => a?.id === asset.id);
      });

      console.log("✅ Final unique assets:", uniqueAssets);

      setRecentRemixes(uniqueAssets.slice(0, 3));
      setLoading(false);
    }
    loadData();
  }, [router]);

  function storageUrl(path?: string | null) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }
  function renderThumbnail(asset: any) {
    const url = storageUrl(asset.storage_path);

    if (!url) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <Image className="w-8 h-8 text-gray-600" />
        </div>
      );
    }

    if (asset.content_type === "image") {
      return (
        <img
          src={url}
          alt={asset.title}
          className="w-full h-full object-cover"
        />
      );
    }

    if (asset.content_type === "video") {
      return (
        <video
          src={url}
          className="w-full h-full object-cover"
          controls
          preload="metadata"
          onClick={(e) => e.stopPropagation()}
        />
      );
    }

    if (asset.content_type === "audio") {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-4 px-4">
          <div className="text-5xl">🎧</div>
          <p className="text-gray-400 text-xs font-light text-center truncate w-full">
            {asset.title || "Audio"}
          </p>
          <audio
            src={url}
            controls
            className="w-full"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      );
    }

    const icons: any = {
      code: <div className="text-4xl">💻</div>,
      text: <div className="text-4xl">📄</div>,
      prompt: <div className="text-4xl">✨</div>,
    };

    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        {icons[asset.content_type] || (
          <Image className="w-8 h-8 text-gray-600" />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="border-b border-white/10">
          <div className="max-w-7xl mx-auto px-3 md:px-8 py-4 md:py-8">
            <Skeleton className="h-7 md:h-10 w-36 md:w-48 bg-white/10 mb-2" />
            <Skeleton className="h-3 md:h-4 w-48 md:w-64 bg-white/10" />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-3 md:px-8 py-4 md:py-12">
          <Skeleton className="h-3 md:h-4 w-28 md:w-32 bg-white/10 mb-4 md:mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-square bg-white/10" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header - Clean & Minimal */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 md:px-8 py-4 md:py-8">
          <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
            <Sparkles className="w-4 h-4 md:w-6 md:h-6 text-red-500" />
            <h1 className="text-xl md:text-4xl font-extralight tracking-tight">Remix</h1>
          </div>
          <p className="text-gray-500 text-xs md:text-sm font-light">
            Your creative workspace
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 md:px-8 py-4 md:py-12">
        {/* Recent Projects Section */}
        <div className="mb-8 md:mb-16">
          <h2 className="text-xs uppercase tracking-wider text-gray-600 font-light mb-3 md:mb-6">
            Recent Projects
          </h2>

          {recentRemixes.length === 0 ? (
            // Empty State
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-6">
              <div className="aspect-square bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 md:gap-3">
                <Clock className="w-6 h-6 md:w-8 md:h-8 text-gray-600" />
                <span className="text-gray-600 text-xs md:text-sm font-light">
                  No recent projects
                </span>
              </div>
            </div>
          ) : (
            // Recent Remixes Grid
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-6">
              {recentRemixes.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => router.push(`/remix/select-mode/${asset.id}`)}
                  className="group aspect-square bg-white/5 border border-white/10 hover:border-red-500/40 transition-all duration-500 overflow-hidden relative cursor-pointer"
                >
                  {/* Real content */}
                  <div className="w-full h-full">{renderThumbnail(asset)}</div>

                  {/* Animated border glow */}
                  <div className="absolute inset-0 pointer-events-none rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500 ring-1 ring-red-500/30 shadow-[inset_0_0_20px_rgba(239,68,68,0.08)]" />

                  {/* Title bar — always visible on mobile, hover-only on md+ */}
                  <div className="absolute top-0 left-0 right-0 translate-y-0 md:-translate-y-full md:group-hover:translate-y-0 transition-transform duration-300 ease-out bg-gradient-to-b from-black/80 to-transparent px-2 md:px-3 py-2 pointer-events-none">
                    <div className="text-[10px] md:text-xs font-light text-white truncate">
                      {asset.title || "Untitled"}
                    </div>
                    <div className="text-[9px] md:text-[10px] text-gray-400 uppercase tracking-wider">
                      {asset.content_type}
                    </div>
                  </div>

                  {/* Remix button — always visible on mobile, hover-only on md+ */}
                  <div className="absolute bottom-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 bg-black/70 text-white text-[10px] px-2 py-1 uppercase tracking-wider pointer-events-none">
                    Remix →
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Start New Remix Section */}
        <div>
          <h2 className="text-xs uppercase tracking-wider text-gray-600 font-light mb-3 md:mb-6">
            Start New Remix
          </h2>

          <button
            onClick={() => router.push("/library?action=select-for-remix")}
            className="group w-full max-w-md border border-white/10 bg-white/5 hover:bg-white/10 hover:border-red-500/30 transition-all duration-300 p-6 md:p-12 flex flex-col items-center justify-center gap-3 md:gap-4"
          >
            <div className="w-12 h-12 md:w-16 md:h-16 border border-white/20 group-hover:border-red-500/50 transition-colors duration-300 flex items-center justify-center">
              <Plus className="w-6 h-6 md:w-8 md:h-8 text-gray-600 group-hover:text-red-500 transition-colors duration-300" />
            </div>

            <div className="text-center">
              <div className="text-xs md:text-sm font-light mb-1 group-hover:text-white transition-colors duration-300">
                Select Asset from Library
              </div>
              <div className="text-[10px] md:text-xs text-gray-600 font-light">
                Choose an asset you own to begin remixing
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
