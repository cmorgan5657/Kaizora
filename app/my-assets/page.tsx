"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowRight,
  Calendar,
  Download,
  Eye,
  FileText,
  FolderDown,
  Grid3X3,
  Image as ImageIcon,
  Music4,
  Package,
  Shield,
  Sparkles,
  Video,
  Repeat,
  X,
  Loader2,
  Lock,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getLicenseRule,
  normalizeLicenseSlug,
  LICENSE_RULES,
  ACTIVE_LICENSE_SLUGS,
} from "@/lib/licenses";

type LicenseType = {
  slug?: string | null;
  name?: string | null;
  description?: string | null;
  allows_commercial_use?: boolean | null;
  can_modify?: boolean | null;
  can_resell?: boolean | null;
};

type Purchase = {
  id: string;
  asset_id: string;
  purchased_at: string;
  purchase_price: number;
  download_count?: number | null;
  asset?: {
    id?: string;
    title?: string | null;
    description?: string | null;
    content_type?: string | null;
    storage_path?: string | null;
    thumbnail_path?: string | null;
  } | null;
  license?: {
    id?: string;
    license_number?: string | null;
    certificate_url?: string | null;
    license_type?: LicenseType | null;
  } | null;
};

type PurchasedLicense = {
  id?: string;
  asset_id: string;
  buyer_id: string;
  license_number?: string | null;
  certificate_url?: string | null;
  license_type?: LicenseType | null;
};

const filters = [
  { value: "all", label: "All Assets" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Text & Code" },
] as const;

const MY_ASSETS_PAGE_SIZE = 9;

export default function MyAssetsPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
  const [visibleCount, setVisibleCount] = useState(MY_ASSETS_PAGE_SIZE);
  // Resell modal state
  const [resellTarget, setResellTarget] = useState<Purchase | null>(null);
  const [resellPrice, setResellPrice] = useState("");
  const [resellLicense, setResellLicense] = useState("royalty-free");
  const [resellSubmitting, setResellSubmitting] = useState(false);
  const [resellError, setResellError] = useState("");
  const [resellDone, setResellDone] = useState(false);

  useEffect(() => {
    async function loadPurchases() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirectTo=/my-assets");
        return;
      }

      const { data: assetsData, error } = await supabase
        .from("purchased_assets")
        .select(
          `
            *,
            asset:assets(
              id,
              title,
              description,
              content_type,
              storage_path,
              thumbnail_path
            )
          `,
        )
        .eq("buyer_id", user.id)
        .order("purchased_at", { ascending: false });

      if (error) {
        console.error("Error loading purchases:", error);
        setLoading(false);
        return;
      }

      const assetIds = (assetsData || []).map((purchase) => purchase.asset_id);

      let licensesData: PurchasedLicense[] = [];
      if (assetIds.length > 0) {
        const { data: licenses } = await supabase
          .from("purchased_licenses")
          .select(
            `
              id,
              asset_id,
              buyer_id,
              license_number,
              certificate_url,
              license_type:license_types(
                slug,
                name,
                description,
                allows_commercial_use,
                can_modify,
                can_resell
              )
            `,
          )
          .eq("buyer_id", user.id)
          .in("asset_id", assetIds);

        licensesData = ((licenses || []) as Array<
          Omit<PurchasedLicense, "license_type"> & {
            license_type?: LicenseType[] | LicenseType | null;
          }
        >).map((license) => ({
          ...license,
          license_type: Array.isArray(license.license_type)
            ? license.license_type[0] || null
            : license.license_type || null,
        }));
      }

      const formattedData = (assetsData || []).map((purchase) => {
        const matchingLicense = licensesData.find(
          (license) =>
            license.asset_id === purchase.asset_id && license.buyer_id === user.id,
        );

        return {
          ...purchase,
          license: matchingLicense || null,
        };
      });

      setPurchases(formattedData as Purchase[]);
      setLoading(false);
    }

    loadPurchases();
  }, [router]);

  function storageUrl(path?: string | null) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }

  async function handleDownload(purchase: Purchase) {
    try {
      await supabase
        .from("purchased_assets")
        .update({
          download_count: (purchase.download_count || 0) + 1,
          last_downloaded_at: new Date().toISOString(),
        })
        .eq("id", purchase.id);

      const url = storageUrl(purchase.asset?.storage_path);
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.download = purchase.asset?.title || "download";
        link.click();

        setPurchases((prev) =>
          prev.map((item) =>
            item.id === purchase.id
              ? { ...item, download_count: (item.download_count || 0) + 1 }
              : item,
          ),
        );
      }
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download asset");
    }
  }

  // ── Resale ──────────────────────────────────────────────────────────────
  function heldLicenseSlug(p: Purchase): string | null {
    return normalizeLicenseSlug(p.license?.license_type?.slug);
  }

  function purchaseCanResell(p: Purchase): boolean {
    return !!getLicenseRule(heldLicenseSlug(p))?.canResell;
  }

  function openResell(p: Purchase) {
    setResellTarget(p);
    setResellPrice(((p.purchase_price || 0) / 100).toFixed(2));
    const slug = heldLicenseSlug(p);
    // Commercial → locked to Commercial. Royalty-Free → default + changeable.
    setResellLicense(slug === "commercial" ? "commercial" : "royalty-free");
    setResellError("");
    setResellDone(false);
  }

  async function submitResell() {
    if (!resellTarget) return;
    const priceNum = Math.round(parseFloat(resellPrice || "0") * 100);
    if (isNaN(priceNum) || priceNum < 0) {
      setResellError("Enter a valid price.");
      return;
    }
    setResellSubmitting(true);
    setResellError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/assets/resell", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          asset_id: resellTarget.asset_id,
          price_cents: priceNum,
          license_slug: resellLicense,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setResellDone(true);
      } else {
        setResellError(json.error || "Failed to list for resale.");
      }
    } catch {
      setResellError("Failed to list for resale.");
    } finally {
      setResellSubmitting(false);
    }
  }

  const resellLocked =
    !!resellTarget && heldLicenseSlug(resellTarget) === "commercial";

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      if (filter === "all") return true;
      if (filter === "other") {
        return !["image", "video", "audio"].includes(
          purchase.asset?.content_type || "",
        );
      }
      return purchase.asset?.content_type === filter;
    });
  }, [filter, purchases]);

  // Reset the visible window when the filter changes.
  useEffect(() => {
    setVisibleCount(MY_ASSETS_PAGE_SIZE);
  }, [filter]);

  const visiblePurchases = filteredPurchases.slice(0, visibleCount);
  const hasMore = visibleCount < filteredPurchases.length;

  const stats = useMemo(() => {
    const totalSpent = purchases.reduce(
      (sum, purchase) => sum + (purchase.purchase_price || 0),
      0,
    );
    const totalDownloads = purchases.reduce(
      (sum, purchase) => sum + (purchase.download_count || 0),
      0,
    );
    const licensed = purchases.filter((purchase) => purchase.license).length;

    return [
      { label: "Purchased", value: purchases.length.toString() },
      { label: "Downloads", value: totalDownloads.toString() },
      { label: "Licensed", value: licensed.toString() },
      { label: "Spend", value: `$${(totalSpent / 100).toFixed(2)}` },
    ];
  }, [purchases]);

  function assetTypeIcon(type?: string | null) {
    const normalized = type?.toLowerCase();
    if (normalized === "image") return ImageIcon;
    if (normalized === "video") return Video;
    if (normalized === "audio") return Music4;
    if (normalized === "text" || normalized === "prompt") return FileText;
    if (normalized === "code") return Grid3X3;
    return Package;
  }

  function prettyType(type?: string | null) {
    if (!type) return "Asset";
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  function renderCardPreview(purchase: Purchase) {
    const ct = purchase.asset?.content_type?.toLowerCase();
    const thumb = storageUrl(purchase.asset?.thumbnail_path);
    const main = storageUrl(purchase.asset?.storage_path);
    const TypeIcon = assetTypeIcon(ct);
    const title = purchase.asset?.title || "Purchased asset";

    // Image — show the actual image
    if (ct === "image" && main) {
      return (
        <img
          src={main}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.04]"
        />
      );
    }

    // Video — prefer a thumbnail image; only use <video> if no thumbnail
    if (ct === "video") {
      if (thumb) {
        return (
          <img
            src={thumb}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.04]"
          />
        );
      }
      if (main) {
        return (
          <video
            src={main}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        );
      }
    }

    // Audio — show artwork thumbnail if present, with a music badge
    if (ct === "audio" && thumb) {
      return (
        <>
          <img
            src={thumb}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.04]"
          />
          <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.14] bg-black/60 backdrop-blur-sm">
            <Music4 className="h-4 w-4 text-gray-200" />
          </div>
        </>
      );
    }

    // Fallback — icon + type label (audio w/o art, text, code, prompt)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.03]">
          <TypeIcon className="h-7 w-7 text-gray-500" />
        </div>
        <p className="text-sm text-gray-500">
          {prettyType(purchase.asset?.content_type)}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070707] text-white">
        <section className="border-b border-white/[0.05]">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <Skeleton className="mb-4 h-7 w-36 rounded-full bg-white/[0.05]" />
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
                  <Skeleton className="h-3 w-full rounded-lg bg-white/[0.04]" />
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
            My Assets
          </div>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="mb-3 text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
                Everything you have purchased, licensed, and can download anytime.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-gray-400 md:text-[15px]">
                Manage your purchased marketplace assets, review license rights,
                reopen certificates, and keep your downloads organized from one
                cleaner ownership dashboard.
              </p>
            </div>
            <button
              onClick={() => router.push("/marketplace")}
              className="inline-flex items-center gap-2 self-start rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-red-400 hover:to-red-500"
            >
              Browse Marketplace
              <ArrowRight className="h-4 w-4" />
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
              Purchased Filters
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Narrow the collection by media type and jump into the assets you
              need fastest.
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

        {filteredPurchases.length === 0 ? (
          <div className="rounded-[28px] border border-white/[0.06] bg-[#0f0f0f] px-6 py-14 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/10">
              <Package className="h-7 w-7 text-red-400" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-white">
              {filter === "all"
                ? "No purchased assets yet"
                : `No ${filter} purchases in this view`}
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-sm leading-6 text-gray-500">
              {filter === "all"
                ? "Once you purchase something from the marketplace it will show up here with download access and license details."
                : "Try another filter or head back to the marketplace to expand your collection."}
            </p>
            <button
              onClick={() => router.push("/marketplace")}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-red-400 hover:to-red-500"
            >
              <FolderDown className="h-4 w-4" />
              Browse Marketplace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visiblePurchases.map((purchase) => {
              const isExpanded = expandedId === purchase.id;
              const licRule = getLicenseRule(
                purchase.license?.license_type?.slug,
              );
              const permissions = licRule
                ? [
                    licRule.slug !== "personal" ? "Commercial Use" : null,
                    licRule.canRemix ? "Can Remix" : null,
                    licRule.canResell ? "Can Resell" : null,
                  ].filter(Boolean)
                : [];

              return (
                <article
                  key={purchase.id}
                  className="self-start overflow-hidden rounded-[28px] border border-white/[0.06] bg-[#0f0f0f] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-2xl hover:shadow-black/50"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#0b0b0b]">
                    {renderCardPreview(purchase)}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

                    <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/[0.12] bg-black/60 px-3 py-1 text-[11px] font-medium text-gray-200 backdrop-blur-sm">
                        {prettyType(purchase.asset?.content_type)}
                      </span>
                      {purchase.license?.license_type?.name && (
                        <span className="rounded-full border border-red-500/25 bg-red-500/15 px-3 py-1 text-[11px] font-medium text-red-300 backdrop-blur-sm">
                          {purchase.license.license_type.name}
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="mb-1 truncate text-lg font-semibold text-white">
                          {purchase.asset?.title || "Untitled asset"}
                        </h2>
                        <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
                          Purchased {new Date(purchase.purchased_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/[0.12] bg-black/55 px-3 py-2 text-right backdrop-blur-sm">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">
                          Price
                        </p>
                        <p className="text-sm font-semibold text-white">
                          ${(purchase.purchase_price / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="mb-4 space-y-3">
                      <p className="line-clamp-2 text-sm leading-6 text-gray-500">
                        {purchase.asset?.description ||
                          "Purchased from the marketplace and available for download whenever you need it."}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-red-400/70" />
                          {new Date(purchase.purchased_at).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Download className="h-3.5 w-3.5 text-red-400/70" />
                          {purchase.download_count || 0} downloads
                        </span>
                      </div>
                    </div>

                    <div className="mb-4 flex gap-2">
                      <button
                        onClick={() => handleDownload(purchase)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-red-400 hover:to-red-500"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </button>
                      <button
                        onClick={() => router.push(`/assets/${purchase.asset?.id}`)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </button>
                    </div>

                    {purchaseCanResell(purchase) && (
                      <button
                        onClick={() => openResell(purchase)}
                        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300 transition-all hover:bg-emerald-500/15"
                      >
                        <Repeat className="h-4 w-4" />
                        Resell on Marketplace
                      </button>
                    )}

                    <button
                      onClick={() =>
                        setExpandedId(isExpanded ? null : purchase.id)
                      }
                      className="flex w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left transition-all hover:border-white/[0.14] hover:bg-white/[0.05]"
                    >
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-red-400/80" />
                        <span className="text-sm font-medium text-gray-200">
                          License Details
                        </span>
                      </div>
                      <span className="text-xs uppercase tracking-[0.14em] text-gray-500">
                        {isExpanded ? "Hide" : "Show"}
                      </span>
                    </button>

                    {purchase.license && (
                      <div
                        className={`grid transition-all duration-300 ease-out ${
                          isExpanded
                            ? "mt-4 grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="rounded-3xl border border-white/[0.06] bg-black/20 p-4">
                            <div className="mb-4 grid gap-4 md:grid-cols-2">
                              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                                  License
                                </p>
                                <div className="space-y-3 text-xs text-gray-300">
                                  <div className="space-y-1.5">
                                    <span className="block text-gray-500">
                                      Number
                                    </span>
                                    <span className="block min-w-0 break-all text-left text-[11px] leading-[18px] text-gray-200">
                                      {purchase.license.license_number ||
                                        "Pending"}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    <span className="block text-gray-500">
                                      Type
                                    </span>
                                    <span className="block min-w-0 break-all text-left text-[11px] leading-[18px] text-gray-200">
                                      {purchase.license.license_type?.name ||
                                        "Standard"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                                  Permissions
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {permissions.length > 0 ? (
                                    permissions.map((permission) => (
                                      <span
                                        key={permission}
                                        className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300"
                                      >
                                        {permission}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-sm text-gray-500">
                                      No additional permissions listed.
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {purchase.license.license_type?.description && (
                              <p className="mb-4 text-sm leading-6 text-gray-500">
                                {purchase.license.license_type.description}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-3">
                              {purchase.license.certificate_url ? (
                                <button
                                  onClick={() =>
                                    window.open(
                                      purchase.license?.certificate_url || "",
                                      "_blank",
                                    )
                                  }
                                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-300 transition-all hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white"
                                >
                                  <FileText className="h-4 w-4" />
                                  Download Certificate
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <button
              onClick={() =>
                setVisibleCount((count) => count + MY_ASSETS_PAGE_SIZE)
              }
              className="cursor-pointer rounded-xl border border-white/[0.09] bg-white/[0.04] px-6 py-2.5 text-sm font-medium text-gray-300 transition-all hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white active:scale-[0.97]"
            >
              Load More
            </button>
            <p className="text-[12px] text-gray-600">
              Showing {visiblePurchases.length} of {filteredPurchases.length}
            </p>
          </div>
        )}
      </section>

      {/* Resell modal */}
      {resellTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !resellSubmitting && setResellTarget(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c0c] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-base font-light text-white">
                Resell on Marketplace
              </h3>
              <button
                onClick={() => !resellSubmitting && setResellTarget(null)}
                className="text-gray-600 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resellDone ? (
              <div className="p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
                  <Repeat className="h-5 w-5 text-emerald-400" />
                </div>
                <p className="text-sm text-white font-light mb-1">
                  Your listing is live on the marketplace.
                </p>
                <p className="text-xs text-gray-500 font-light mb-5">
                  It now sells under your account at the price you set.
                </p>
                <button
                  onClick={() => setResellTarget(null)}
                  className="px-5 py-2 text-sm font-light bg-red-600 hover:bg-red-500 rounded-lg transition-colors text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="text-sm font-light text-gray-300 truncate">
                  {resellTarget.asset?.title || "Untitled asset"}
                </div>

                {/* Price */}
                <div>
                  <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1.5">
                    Your resale price (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={resellPrice}
                    onChange={(e) => setResellPrice(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm font-light text-white outline-none focus:border-red-500/40"
                    placeholder="0.00"
                  />
                </div>

                {/* License */}
                <div>
                  <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1.5">
                    License
                  </label>
                  {resellLocked ? (
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-light text-gray-400">
                      <Lock className="w-3.5 h-3.5 text-gray-500" />
                      Commercial — locked
                    </div>
                  ) : (
                    <select
                      value={resellLicense}
                      onChange={(e) => setResellLicense(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm font-light text-white outline-none focus:border-red-500/40"
                    >
                      {ACTIVE_LICENSE_SLUGS.map((s) => (
                        <option key={s} value={s} className="bg-[#111]">
                          {LICENSE_RULES[s].name}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-[11px] text-gray-600 mt-1.5 leading-relaxed">
                    {resellLocked
                      ? "You bought this under a Commercial license — it must be resold as Commercial, and 3% of every sale goes to the original creator."
                      : "You hold full rights — choose any license. No royalty is owed to the original creator."}
                  </p>
                </div>

                {resellError && (
                  <p className="text-xs text-red-400 font-light">{resellError}</p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setResellTarget(null)}
                    disabled={resellSubmitting}
                    className="px-4 py-2 text-sm font-light text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitResell}
                    disabled={resellSubmitting}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-light bg-red-600 hover:bg-red-500 rounded-lg transition-colors text-white disabled:opacity-50"
                  >
                    {resellSubmitting && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    List for Resale
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


