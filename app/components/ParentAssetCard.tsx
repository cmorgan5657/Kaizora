"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowRight, User } from "lucide-react";

interface ParentAssetCardProps {
  assetId: string;
}

export default function ParentAssetCard({ assetId }: ParentAssetCardProps) {
  const router = useRouter();
  const [parentAsset, setParentAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadParentAsset() {
      try {
        // Get parent asset ID from remix_relations
        const { data: relation, error: relationError } = await supabase
          .from("remix_relations")
          .select("original_asset_id")
          .eq("derived_asset_id", assetId)
          .single();

        if (!relation) {
          console.error("Remix relation not found:", relationError);
          setLoading(false);
          return;
        }

        // Get parent asset details
        const { data: asset, error: assetError } = await supabase
          .from("assets")
          .select(
            "id, title, thumbnail_path, storage_path, content_type, owner_id"
          )
          .eq("id", relation.original_asset_id)
          .single();

        if (!asset) {
          console.error("Parent asset not found:", assetError);
          setLoading(false);
          return;
        }

        // Separately get owner profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, full_name")
          .eq("id", asset.owner_id)
          .single();

        setParentAsset({
          ...asset,
          profiles: profile,
        });
      } catch (error) {
        console.error("Error loading parent asset:", error);
      } finally {
        setLoading(false);
      }
    }

    loadParentAsset();
  }, [assetId]);

  function storageUrl(path?: string | null) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }

  if (loading) {
    return (
      <div className="bg-white/5 border border-white/10 p-4 animate-pulse">
        <div className="flex gap-4">
          <div className="w-24 h-24 bg-white/10"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/10 w-3/4"></div>
            <div className="h-3 bg-white/10 w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!parentAsset) {
    return (
      <div className="bg-white/5 border border-white/10 p-4">
        <p className="text-xs text-gray-600 font-light">
          Original asset not found
        </p>
      </div>
    );
  }

  const thumbnail = storageUrl(
    parentAsset.thumbnail_path || parentAsset.storage_path
  );
  const creator = parentAsset.profiles;

  return (
    <div className="bg-white/5 border border-white/10 hover:border-red-500/30 transition-all duration-300 group">
      <div className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div
            onClick={() => router.push(`/assets/${parentAsset.id}`)}
            className="w-24 h-24 bg-black border border-white/10 shrink-0 overflow-hidden cursor-pointer group-hover:border-red-500/30 transition-colors"
          >
            {parentAsset.content_type === "image" && thumbnail ? (
              <img
                src={thumbnail}
                alt={parentAsset.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl">
                {parentAsset.content_type === "video" && "🎥"}
                {parentAsset.content_type === "audio" && "🎧"}
                {(!parentAsset.content_type ||
                  parentAsset.content_type === "other") &&
                  "📦"}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-light mb-2 truncate">
              {parentAsset.title || "Untitled"}
            </h4>

            {creator && (
              <div className="flex items-center gap-2 text-xs text-gray-600 font-light mb-3">
                <User className="w-3 h-3" />
                <span>
                  by {creator.full_name || creator.username || "Unknown"}
                </span>
              </div>
            )}

            <button
              onClick={() => router.push(`/assets/${parentAsset.id}`)}
              className="inline-flex items-center gap-2 text-xs font-light text-red-400 hover:text-red-300 transition-colors"
            >
              View Original
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
