"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowRight,
  Eye,
  Grid3X3,
  Image as ImageIcon,
  Library as LibraryIcon,
  Music4,
  Plus,
  Sparkles,
  Trash2,
  Loader2,
  Video,
  Wand2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Asset = {
  id: string;
  title?: string | null;
  content_type?: string | null;
  storage_path?: string | null;
  thumbnail_path?: string | null;
  is_remix?: boolean | null;
  remix_type?: string | null;
  created_at?: string | null;
};

const filters = [
  { value: "all", label: "All Assets" },
  { value: "original", label: "Originals" },
  { value: "remix", label: "Remixes" },
] as const;

export default function LibraryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);

  useEffect(() => {
    async function loadAssets() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/login?redirectTo=/library");
        return;
      }

      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("owner_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading assets:", error);
      }

      setAssets((data || []) as Asset[]);
      setLoading(false);
    }

    loadAssets();
  }, [router]);

  function storageUrl(path?: string | null) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }

  async function handleDelete(assetId: string) {
    if (!confirm("Are you sure you want to delete this asset?")) return;

    try {
      setDeletingAssetId(assetId);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        alert("Your session has expired. Please log in again.");
        router.push("/login?redirectTo=/library");
        return;
      }

      const response = await fetch(`/api/creator/assets/${assetId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        alert(`Failed to delete asset: ${payload?.error || "Unknown error"}`);
        console.error(payload);
        return;
      }

      setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
    } finally {
      setDeletingAssetId(null);
    }
  }

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (filter === "all") return true;
      if (filter === "original") return !asset.is_remix;
      if (filter === "remix") return Boolean(asset.is_remix);
      return true;
    });
  }, [assets, filter]);

  const stats = useMemo(() => {
    const originalCount = assets.filter((asset) => !asset.is_remix).length;
    const remixCount = assets.filter((asset) => asset.is_remix).length;
    const types = new Set(
      assets.map((asset) => asset.content_type).filter(Boolean),
    ).size;

    return [
      { label: "Total assets", value: assets.length },
      { label: "Originals", value: originalCount },
      { label: "Remixes", value: remixCount },
      { label: "Formats", value: types },
    ];
  }, [assets]);

  function assetTypeIcon(type?: string | null) {
    const normalized = type?.toLowerCase();
    if (normalized === "image") return ImageIcon;
    if (normalized === "video") return Video;
    if (normalized === "audio") return Music4;
    return Grid3X3;
  }

  function prettyType(type?: string | null) {
    if (!type) return "Asset";
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070707] text-white">
        <section className="border-b border-white/[0.05]">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <Skeleton className="mb-4 h-7 w-32 rounded-full bg-white/[0.05]" />
            <Skeleton className="mb-3 h-14 w-full max-w-xl rounded-2xl bg-white/[0.05]" />
            <Skeleton className="h-5 w-full max-w-2xl rounded-xl bg-white/[0.04]" />
          </div>
        </section>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-28 rounded-2xl bg-white/[0.04]"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0f0f0f]"
              >
                <Skeleton className="aspect-[4/3] w-full bg-white/[0.04]" />
                <div className="space-y-3 p-4">
                  <Skeleton className="h-4 w-2/3 rounded-lg bg-white/[0.05]" />
                  <Skeleton className="h-3 w-1/2 rounded-lg bg-white/[0.04]" />
                  <Skeleton className="h-10 w-full rounded-xl bg-white/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <section className="relative overflow-hidden border-b border-white/[0.05]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-red-600/[0.055] blur-[130px]" />
          <div className="absolute right-[10%] top-14 h-[220px] w-[220px] rounded-full bg-rose-700/[0.04] blur-[90px]" />
          <div
            className="absolute inset-0 opacity-[0.018]"
            style={{
              backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
              backgroundSize: "30px 30px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-24 sm:px-6 lg:px-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-red-500/[0.18] bg-red-500/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-400/90">
            <Sparkles className="h-3 w-3" />
            My Vault
          </div>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="mb-3 text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
                Your private archive for originals, remixes, and launch-ready assets.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-gray-400 md:text-[15px]">
                Keep everything you have created in one place, jump back into a
                remix flow in seconds, and manage the work that is ready for the
                marketplace.
              </p>
            </div>
            <button
              onClick={() => router.push("/creator/assets/create")}
              className="inline-flex items-center gap-2 self-start rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-red-400 hover:to-red-500"
            >
              <Plus className="h-4 w-4" />
              Add New Asset
            </button>
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.05]">
        <div className="mx-auto grid max-w-7xl gap-3 px-4 py-6 sm:px-6 md:grid-cols-4 lg:px-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/[0.06] bg-[#0f0f0f] p-5"
            >
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                {stat.label}
              </p>
              <p className="text-3xl font-bold tracking-tight text-white">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/[0.06] bg-[#0f0f0f] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-400/80">
              Vault Filters
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Switch views to focus on the assets you want to refine, inspect,
              or publish next.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.value}
                onClick={() => setFilter(item.value)}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                  filter === item.value
                    ? "border-red-500/25 bg-red-500/10 text-red-300"
                    : "border-white/[0.08] bg-white/[0.03] text-gray-400 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="rounded-[28px] border border-white/[0.06] bg-[#0f0f0f] px-6 py-14 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/10">
              <LibraryIcon className="h-7 w-7 text-red-400" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-white">
              {filter === "all"
                ? "Your vault is ready for its first asset"
                : `No ${filter === "remix" ? "remix" : "original"} assets yet`}
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-sm leading-6 text-gray-500">
              {filter === "all"
                ? "Upload a creation, store it here, and come back anytime to remix it or prepare it for marketplace release."
                : "Try another filter or add new work to start building out this view."}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => router.push("/creator/assets/create")}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-red-400 hover:to-red-500"
              >
                <Plus className="h-4 w-4" />
                Create Asset
              </button>
              <button
                onClick={() => router.push("/marketplace")}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white"
              >
                Browse Marketplace
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.map((asset) => {
              const previewUrl = storageUrl(
                asset.thumbnail_path || asset.storage_path,
              );
              const TypeIcon = assetTypeIcon(asset.content_type);

              return (
                <article
                  key={asset.id}
                  className="group overflow-hidden rounded-[28px] border border-white/[0.06] bg-[#0f0f0f] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-2xl hover:shadow-black/50"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#0b0b0b]">
                    {asset.content_type === "image" && previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={asset.title || "Asset preview"}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      />
                    ) : asset.content_type === "video" && previewUrl ? (
                      <video
                        src={previewUrl}
                        className="h-full w-full object-cover"
                        controls
                        preload="metadata"
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : asset.content_type === "audio" && previewUrl ? (
                      <div className="flex h-full flex-col items-center justify-center gap-4 px-5">
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.03]">
                          <Music4 className="h-6 w-6 text-red-400" />
                        </div>
                        <p className="max-w-[220px] truncate text-sm font-medium text-gray-200">
                          {asset.title || "Audio asset"}
                        </p>
                        <audio
                          src={previewUrl}
                          controls
                          className="w-full"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.03]">
                          <TypeIcon className="h-6 w-6 text-gray-500" />
                        </div>
                        <p className="text-sm text-gray-500">
                          {prettyType(asset.content_type)}
                        </p>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

                    <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/[0.12] bg-black/60 px-3 py-1 text-[11px] font-medium text-gray-200 backdrop-blur-sm">
                        {prettyType(asset.content_type)}
                      </span>
                      {asset.is_remix && (
                        <span className="rounded-full border border-red-500/25 bg-red-500/15 px-3 py-1 text-[11px] font-medium text-red-300 backdrop-blur-sm">
                          Remix
                        </span>
                      )}
                    </div>

                    <div className="absolute right-4 top-4 flex gap-2 opacity-100 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
                      <button
                        onClick={() => router.push(`/assets/${asset.id}`)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-black/55 text-gray-200 backdrop-blur-sm transition-all hover:border-white/25 hover:bg-black/75 hover:text-white"
                        title="View asset"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(asset.id)}
                        disabled={deletingAssetId === asset.id}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-300 backdrop-blur-sm transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                        title={deletingAssetId === asset.id ? "Deleting asset" : "Delete asset"}
                      >
                        {deletingAssetId === asset.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    <div className="absolute bottom-4 left-4 right-4">
                      <h2 className="mb-1 line-clamp-1 text-lg font-semibold text-white">
                        {asset.title || "Untitled asset"}
                      </h2>
                      <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
                        {asset.is_remix
                          ? asset.remix_type || "derived asset"
                          : "original creation"}
                      </p>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="mb-4 flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-red-400/70" />
                        <span>{prettyType(asset.content_type)}</span>
                      </div>
                      <span>
                        {asset.created_at
                          ? new Date(asset.created_at).toLocaleDateString()
                          : "Recently added"}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/assets/${asset.id}`)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </button>
                      <button
                        onClick={() => router.push(`/remix/select-mode/${asset.id}`)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-red-400 hover:to-red-500"
                      >
                        <Wand2 className="h-4 w-4" />
                        Remix
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
