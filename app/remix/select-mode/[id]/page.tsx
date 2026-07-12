"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Crop,
  Sparkles,
  Lock,
  AlertCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getLicenseRule, normalizeLicenseSlug } from "@/lib/licenses";

export default function SelectModePage() {
  const router = useRouter();
  const params = useParams();
  const assetId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<any>(null);
  const [remixRights, setRemixRights] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function loadAsset() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/login?redirectTo=/remix");
        return;
      }

      setUser(currentUser);

      const { data: assetData, error } = await supabase
        .from("assets")
        .select(
          `
          id,
          title,
          description,
          content_type,
          storage_path,
          thumbnail_path,
          owner_id
        `,
        )
        .eq("id", assetId)
        .single();

      if (error || !assetData) {
        router.push("/remix");
        return;
      }

      setAsset(assetData);

      const isOwner = assetData.owner_id === currentUser.id;

      // Remix permission comes from the KAIZORA license model:
      //   Personal     → cannot remix
      //   Commercial   → can remix
      //   Royalty-Free → can remix
      let canRemix = isOwner;

      if (!isOwner) {
        const { data: plRows } = await supabase
          .from("purchased_licenses")
          .select("license_type:license_types(slug)")
          .eq("buyer_id", currentUser.id)
          .eq("asset_id", assetId);

        for (const row of plRows || []) {
          const raw = Array.isArray((row as any).license_type)
            ? (row as any).license_type[0]?.slug
            : (row as any).license_type?.slug;
          if (getLicenseRule(normalizeLicenseSlug(raw))?.canRemix) {
            canRemix = true;
            break;
          }
        }
      }

      const rights = {
        canTransform: canRemix,
        canAIRegenerate: canRemix,
        canMakeVideo: canRemix && assetData.content_type === "image",
        requiresAttribution: false,
        revenueShare: 0,
      };

      setRemixRights(rights);
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

  function renderPreview() {
    if (!asset) return null;

    const url = storageUrl(asset.storage_path);

    if (!url) {
      return (
        <div className="w-full h-full flex items-center justify-center text-2xl">
          📦
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
          preload="metadata"
          onClick={(e) => e.stopPropagation()}
        />
      );
    }

    if (asset.content_type === "audio") {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black gap-2 px-2">
          <div className="text-2xl">🎧</div>
          <div className="flex items-end gap-0.5 h-6">
            {[3, 6, 4, 8, 5, 7, 3, 6, 4, 5, 8, 4, 6, 3, 7].map((h, i) => (
              <div
                key={i}
                className="w-0.5 bg-red-500/60 rounded-full animate-pulse"
                style={{ height: `${h * 3}px`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>
      );
    }

    const icons: any = {
      code: <div className="text-2xl">💻</div>,
      text: <div className="text-2xl">📄</div>,
      prompt: <div className="text-2xl">✨</div>,
    };

    return (
      <div className="w-full h-full flex items-center justify-center">
        {icons[asset.content_type] || <div className="text-2xl">📦</div>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="border-b border-white/10">
          <div className="max-w-4xl mx-auto px-3 py-2">
            <Skeleton className="h-3 w-20 bg-white/10 mb-1.5" />
            <Skeleton className="h-5 w-40 bg-white/10" />
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-3 py-3 md:py-4">
          <div className="grid md:grid-cols-[300px,1fr] gap-4">
            <Skeleton className="aspect-square bg-white/10" />
            <div className="space-y-2">
              <Skeleton className="h-16 bg-white/10" />
              <Skeleton className="h-16 bg-white/10" />
              <Skeleton className="h-16 bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!asset || !remixRights) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-[10px] font-light text-gray-400">
            Asset not found
          </p>
        </div>
      </div>
    );
  }

  const allModes = [
    {
      id: "transform",
      name: "Transform",
      description: "Manual editing",
      icon: <Crop className="w-4 h-4" />,
      available: remixRights.canTransform,
      route: `/remix/studio/transform/${assetId}`,
    },
    {
      id: "regenerate",
      name: "Regenerate",
      description: "AI variations",
      icon: <Sparkles className="w-4 h-4" />,
      available: remixRights.canAIRegenerate,
      route: `/remix/studio/regenerate/${assetId}`,
    },
  ];

  const modes = allModes;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Ultra Compact Header */}
      <div className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-3 py-2">
          <button
            onClick={() => router.push("/remix")}
            className="flex items-center gap-1.5 text-gray-600 hover:text-white transition-colors text-[10px] font-light mb-2"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>

          <h1 className="text-base font-extralight tracking-tight mb-0.5">
            {asset.title || "Untitled"}
          </h1>
          <p className="text-[9px] uppercase tracking-wider text-gray-600 font-light">
            {asset.content_type}
          </p>
        </div>
      </div>

      {/* Ultra Compact Main Content */}
      <div className="max-w-3xl mx-auto px-3 py-2 md:py-4">
        {/* Small Preview Thumbnail at Top */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/10">
          <div className="w-20 h-20 bg-white/5 border border-white/10 overflow-hidden flex-shrink-0">
            {renderPreview()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[9px] uppercase tracking-wider text-gray-600 font-light mb-1">
              Source Asset
            </h2>
            {asset.description && (
              <p className="text-[10px] font-light text-gray-500 leading-tight line-clamp-2">
                {asset.description}
              </p>
            )}
          </div>
        </div>

        {/* License gate notice — shown when no remix modes are available */}
        {!remixRights.canTransform && !remixRights.canAIRegenerate && (
          <div className="mb-4 flex items-start gap-2.5 border border-red-500/20 bg-red-500/[0.06] p-3">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-light text-red-300">
                Remixing is not available for this asset
              </p>
              <p className="text-[10px] font-light text-gray-500 mt-0.5 leading-relaxed">
                Your license does not include remix rights. A Commercial or
                Royalty-Free license is required to remix this asset.
              </p>
            </div>
          </div>
        )}

        {/* Mode Cards - Full Width */}
        <div>
          <h2 className="text-[9px] uppercase tracking-wider text-gray-600 font-light mb-2">
            Select Mode
          </h2>

          <div className="space-y-2">
            {modes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => mode.available && router.push(mode.route)}
                disabled={!mode.available}
                className={`w-full text-left border transition-all duration-300 p-3 ${
                  mode.available
                    ? "bg-white/5 border-white/10 hover:bg-white/10 hover:border-red-500/30 cursor-pointer"
                    : "bg-white/5 border-white/10 opacity-40 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {/* Icon */}
                  <div
                    className={`flex-shrink-0 ${
                      mode.available ? "text-red-500" : "text-gray-600"
                    }`}
                  >
                    {mode.available ? mode.icon : <Lock className="w-4 h-4" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-light mb-0.5">{mode.name}</h3>
                    <p className="text-[10px] font-light text-gray-500">
                      {mode.description}
                    </p>
                    {!mode.available && (
                      <p className="text-[9px] font-light text-red-400 mt-0.5">
                        Locked
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  {mode.available && (
                    <div className="flex-shrink-0 text-gray-600">
                      <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
