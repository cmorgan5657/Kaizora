"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  Heart,
  X,
  Sparkles,
  Users,
  TrendingUp,
  LayoutGrid,
  ImageIcon,
  Upload,
  CheckCircle2,
  AlertCircle,
  Plus,
  Tag,
  Loader2,
  ShoppingBag,
  Check,
  Trash2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import MarketplaceAssistant from "@/app/components/MarketplaceAssistant";

// ─── Terminal log helper (fire-and-forget, mirrors to dev server terminal) ───
function logServer(tag: string, data?: any) {
  try {
    fetch("/api/debug/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, data }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CONTENT_TYPES = [
  "All Types",
  "Image",
  "Video",
  "Audio",
  "Text",
  "Code",
  "Prompt",
];
const CATALOG_SCOPES = ["All Listings", "Assets Only", "Bundles Only"];
const RECENCY_OPTIONS = [
  { value: "all", label: "Any Time" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];
const UPLOAD_CONTENT_TYPES = [
  "Image",
  "Video",
  "Audio",
  "Text",
  "Code",
  "Prompt",
];
const AI_MODELS = [
  // 🖼️ Image
  "Midjourney v6.1",
  "Midjourney v6",
  "Midjourney v5.2",
  "DALL-E 3",
  "DALL-E 2",
  "Stable Diffusion 3.5",
  "Stable Diffusion XL",
  "Stable Diffusion 1.5",
  "Flux 1.1 Pro",
  "Flux Dev",
  "Flux Schnell",
  "Adobe Firefly 3",
  "Ideogram 2.0",
  "Leonardo Phoenix",
  "Playground v3",
  "Recraft v3",
  // 🎬 Video
  "Runway Gen-3 Alpha",
  "Runway Gen-2",
  "Kling 1.6",
  "Kling 1.5",
  "Sora",
  "Pika 2.0",
  "Pika 1.5",
  "LumaLabs Dream Machine 1.5",
  "Hailuo AI",
  "Wan 2.1",
  // 🎵 Audio
  "Suno v4",
  "Suno v3.5",
  "Udio 1.5",
  "ElevenLabs v3",
  "Mubert",
  "Stability Audio",
  // 💬 Text / Code
  "GPT-4o",
  "GPT-4o mini",
  "Claude 3.5 Sonnet",
  "Claude 3 Opus",
  "Gemini 2.0 Flash",
  "Gemini 1.5 Pro",
  "Llama 3.3",
  "Mistral Large",
  // Other
  "Other",
];
const LICENSE_TYPES = [
  { value: "personal", label: "Personal Use" },
  { value: "commercial", label: "Commercial Use" },
  { value: "royalty-free", label: "Royalty-Free" },
];
const MARKETPLACE_PAGE_SIZE = 12;
const MY_COMMERCE_SECTION_PAGE_SIZE = 6;
const TEMP_ASSET_BUCKET = "asset-temp";
const MARKETPLACE_UPLOAD_DEBUG =
  process.env.NEXT_PUBLIC_MARKETPLACE_UPLOAD_DEBUG === "true";
const TEMP_META_CACHE_KEY = "kaizora_temp_asset_meta";

type LicenseOption = {
  id?: string;
  slug: string;
  name: string;
};

type CommerceProfile = {
  commerce_readiness_score?: number;
  listing_readiness_status?: "ready" | "needs_work";
  readiness_verdict?: "ready" | "not-yet" | "not-ready";
  suggested_price_band?: string;
  suggested_categories?: string[];
  recommended_next_commerce_action?: string;
  content_description?: string;
  listing_description?: string;
  suggested_license_type?: string;
  suggested_tags?: string[];
  // New fields from commerce analyzer
  quality_score?: number;
  top_strength?: string;
  top_weakness?: string;
  readiness_axes?: { axis: string; score: number; note: string }[];
};

type CommerceMeta = {
  title: string;
  desc: string;
  aiModel: string;
  license: string;
  isFree: boolean;
  priceCents: number;
  tags: string[];
  contentType: string;
  preview: string | null;
  imageFit?: "contain" | "cover";
};

type ListingAssetRecord = {
  id: string;
  title?: string;
  description?: string;
  content_type?: string;
  thumbnail_path?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  ai_model?: string | null;
  tags?: string[];
  price_cents?: number | null;
  license_type?: string | null;
  is_temp?: boolean;
  is_public?: boolean;
};

type TempAssetRecord = ListingAssetRecord & {
  user_id: string;
  file_size?: number | null;
  analysis_status?: "pending" | "analyzing" | "completed" | "failed";
  readiness_score?: number | null;
  readiness_verdict?: "ready" | "not-yet" | "not-ready" | null;
  analysis_completed_at?: string | null;
  commerce_profile?: CommerceProfile | null;
  created_at?: string;
  updated_at?: string;
};

type CommercePendingEntry = {
  analyzing: boolean;
  profile: CommerceProfile | null;
  meta: CommerceMeta;
  startedAtMs?: number;
};

type CommerceBucketItem = {
  asset: ListingAssetRecord;
  hasListing: boolean;
  pending?: CommercePendingEntry;
};

function upsertRowById<T extends { id: string }>(rows: T[], nextRow: T) {
  const next = [nextRow, ...rows.filter((row) => row.id !== nextRow.id)];
  next.sort((a: any, b: any) => {
    const aTs = Date.parse(a?.created_at || "");
    const bTs = Date.parse(b?.created_at || "");
    return (Number.isNaN(bTs) ? 0 : bTs) - (Number.isNaN(aTs) ? 0 : aTs);
  });
  return next;
}

const MIN_IMAGE_WIDTH = 100;
const MIN_IMAGE_HEIGHT = 100;
const MAX_IMAGE_ASPECT_RATIO = 3;

function getTempPreviewFitMode(meta?: CommerceMeta | null) {
  return meta?.imageFit === "contain" ? "object-contain" : "object-cover";
}

function formatElapsedAnalysisTime(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

async function getImageDimensions(file: File): Promise<{
  width: number;
  height: number;
}> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        image.onerror = () => reject(new Error("Unable to read image dimensions."));
        image.src = objectUrl;
      },
    );

    return dimensions;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function validateUploadFile(file: File, contentType: string) {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("File size must be under 20 MB.");
  }

  if (
    contentType.toLowerCase() !== "image" ||
    !file.type.toLowerCase().startsWith("image/")
  ) {
    return { imageFit: "cover" as const };
  }

  const { width, height } = await getImageDimensions(file);
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const aspectRatio = longSide / shortSide;

  if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) {
    throw new Error(
      `Images must be at least ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}px.`,
    );
  }

  if (aspectRatio > MAX_IMAGE_ASPECT_RATIO) {
    throw new Error(
      "Image aspect ratio is too extreme. Please upload something closer to square, portrait, or standard landscape.",
    );
  }

  return { imageFit: "contain" as const };
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const router = useRouter();

  // Tab
  const [activeTab, setActiveTab] = useState<"browse" | "commerce">("browse");

  // Bundles (mixed into browse)
  const [bundles, setBundles] = useState<any[]>([]);
  const [bundlesLoaded, setBundlesLoaded] = useState(false);

  // Auth
  const [user, setUser] = useState<any>(null);

  // Browse state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState("All Types");
  const [selectedCatalogScope, setSelectedCatalogScope] = useState("All Listings");
  const [selectedLicense, setSelectedLicense] = useState("all");
  const [selectedPrice, setSelectedPrice] = useState("all");
  const [selectedRecency, setSelectedRecency] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [purchasedAssetIds, setPurchasedAssetIds] = useState<Set<string>>(new Set());
  const [purchasedBundleIds, setPurchasedBundleIds] = useState<Set<string>>(new Set());

  // My Commerce state
  const [myAssets, setMyAssets] = useState<any[]>([]);
  const [tempAssets, setTempAssets] = useState<TempAssetRecord[]>([]);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [commerceLoading, setCommerceLoading] = useState(false);
  const [commerceVisibleCounts, setCommerceVisibleCounts] = useState({
    analyzing: MY_COMMERCE_SECTION_PAGE_SIZE,
    ready: MY_COMMERCE_SECTION_PAGE_SIZE,
    needsWork: MY_COMMERCE_SECTION_PAGE_SIZE,
  });

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("My Amazing AI Creation");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadContentType, setUploadContentType] = useState("Image");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFilePreview, setUploadFilePreview] = useState<string | null>(
    null,
  );
  const [uploadAiModel, setUploadAiModel] = useState("");
  const [uploadLicense, setUploadLicense] = useState("personal");
  const [uploadFree, setUploadFree] = useState(false);
  const [uploadPrice, setUploadPrice] = useState("");
  const [uploadYear, setUploadYear] = useState(
    new Date().getFullYear().toString(),
  );
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadTagInput, setUploadTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Background analysis flow
  const [pendingAnalyses, setPendingAnalyses] = useState<
    Record<string, CommercePendingEntry>
  >({});
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [compareAssetId, setCompareAssetId] = useState<string | null>(null);
  // Market-based pricing for the compare modal (fetched from /api/commerce/pricing/market)
  const [comparePricing, setComparePricing] = useState<{
    loading: boolean;
    data: any | null;
  }>({ loading: false, data: null });
  const [authToken, setAuthToken] = useState("");
  const [tempMetaCache, setTempMetaCache] = useState<
    Record<string, CommerceMeta>
  >({});
  const [availableLicenses, setAvailableLicenses] = useState<LicenseOption[]>([]);
  const [reportingAssetId, setReportingAssetId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportToast, setReportToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // IDs that were seen with analyzing:true during this session (so we know it's a fresh completion, not pre-existing)
  const wasAnalyzingRef = useRef<Set<string>>(new Set());
  // IDs whose modal has already been auto-shown (prevent re-triggering)
  const autoShownRef = useRef<Set<string>>(new Set());

  // ── Load auth + public listings ────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    supabase.auth
      .getSession()
      .then(({ data }) => setAuthToken(data.session?.access_token ?? ""));
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setAuthToken(session?.access_token ?? "");
        if (!session?.user) setActiveTab("browse");
      },
    );
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadLicenseTypes() {
      const { data } = await supabase
        .from("license_types")
        .select("id, slug, name")
        .eq("is_active", true)
        .order("price_multiplier", { ascending: true });

      const licenses = (data || [])
        .filter((license: any) => license.slug && license.name)
        .map((license: any) => ({
          id: license.id,
          slug: license.slug,
          name: license.name,
        }));

      setAvailableLicenses(licenses);
      if (licenses.length > 0 && !licenses.some((license) => license.slug === uploadLicense)) {
        setUploadLicense(licenses[0].slug);
      }
    }

    void loadLicenseTypes();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(TEMP_META_CACHE_KEY);
      if (!raw) return;
      setTempMetaCache(JSON.parse(raw));
    } catch {
      setTempMetaCache({});
    }
  }, []);

  // Fetch purchased asset IDs + bundle IDs whenever user changes
  useEffect(() => {
    if (!user) {
      setPurchasedAssetIds(new Set());
      setPurchasedBundleIds(new Set());
      return;
    }
    supabase
      .from("purchased_assets")
      .select("asset_id")
      .eq("buyer_id", user.id)
      .then(({ data }) => {
        setPurchasedAssetIds(new Set((data || []).map((r: any) => r.asset_id)));
      });
    supabase
      .from("bundle_purchases")
      .select("bundle_id")
      .eq("buyer_id", user.id)
      .eq("status", "paid")
      .then(({ data }) => {
        setPurchasedBundleIds(new Set((data || []).map((r: any) => r.bundle_id)));
      });
  }, [user]);

  useEffect(() => {
    async function loadListings() {
      // Query published assets directly — no listings table
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false });
      if (error || !data?.length) {
        setLoading(false);
        return;
      }

      const creatorIds = [
        ...new Set(
          data
            .flatMap((a: any) => [a.owner_id, a.origin_creator_id])
            .filter(Boolean),
        ),
      ];
      const assetIds = data.map((a: any) => a.id);

      const [{ data: profiles }, { data: commerceProfiles }, purchaseCountRes] =
        await Promise.all([
          supabase.from("profiles").select("id, display_name").in("id", creatorIds),
          supabase
            .from("asset_commerce_profiles")
            .select("asset_id, suggested_keywords, suggested_tags")
            .in("asset_id", assetIds),
          fetch("/api/marketplace/purchase-counts")
            .then((r) => r.json())
            .catch(() => ({ counts: {} })),
        ]);

      // Purchase counts across ALL buyers (service-role, RLS-safe)
      const purchaseCountMap: Record<string, number> =
        purchaseCountRes?.counts ?? {};

      // Shape as listing-like so existing browse-tab render code keeps working
      setListings(
        data.map((a: any) => {
          const cp = commerceProfiles?.find((c: any) => c.asset_id === a.id);
          return {
            id: a.id,
            creator_id: a.owner_id,
            cover_asset_id: a.id,
            title: a.title,
            description: a.description,
            ai_model: a.ai_model,
            tags: a.tags,
            price_cents: a.price_cents,
            category: a.category,
            license_type: null,
            status: "public",
            created_at: a.created_at,
            views_count: a.views_count ?? 0,
            purchases_count: purchaseCountMap[a.id] ?? 0,
            suggested_keywords: cp?.suggested_keywords ?? [],
            suggested_tags: cp?.suggested_tags ?? [],
            _profile: profiles?.find((p: any) => p.id === a.owner_id) ?? null,
            // Resold listing: the original creator differs from the seller.
            _origin_profile:
              a.origin_creator_id && a.origin_creator_id !== a.owner_id
                ? profiles?.find((p: any) => p.id === a.origin_creator_id) ?? null
                : null,
            _asset: a,
            // Stable random key — for shuffling non-fresh assets in the grid.
            _rand: Math.random(),
          };
        }),
      );
      setLoading(false);
    }
    loadListings();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("marketplace-public-assets")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assets",
        },
        (payload) => {
          const asset = (payload.new || payload.old) as ListingAssetRecord | null;
          if (!asset?.id) return;

          if (payload.eventType === "DELETE" || !asset.is_public) {
            setListings((prev) => prev.filter((listing) => listing.id !== asset.id));
            return;
          }

          setListings((prev) =>
            prev.map((listing) =>
              listing.id === asset.id
                ? {
                    ...listing,
                    title: asset.title,
                    description: asset.description,
                    ai_model: asset.ai_model,
                    tags: asset.tags,
                    price_cents: asset.price_cents,
                    category: (asset as any).category,
                    created_at: (asset as any).created_at,
                    _asset: { ...listing._asset, ...asset },
                  }
                : listing,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // ── Load bundles once alongside assets ────────────────────────────────────
  useEffect(() => {
    if (bundlesLoaded) return;
    fetch("/api/bundles")
      .then(r => r.json())
      .then(data => { setBundles(data.bundles || []); setBundlesLoaded(true); })
      .catch(() => setBundlesLoaded(true));
  }, []);

  // ── Load My Commerce data when tab is active ───────────────────────────────
  useEffect(() => {
    if (activeTab !== "commerce" || !user) return;
    async function loadCommerce() {
      setCommerceLoading(true);
      const [{ data: assets }, { data: tempRows }] = await Promise.all([
        supabase
          .from("assets")
          .select("*")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("temp_assets")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      setMyAssets(assets ?? []);
      setTempAssets((tempRows as TempAssetRecord[]) ?? []);
      setMyListings([]); // no listings table use — kept empty for prop compat

      // Hydrate stored analysis scores so cards survive page refresh
      const assetIds = (assets ?? []).map((a: any) => a.id);
      if (assetIds.length > 0) {
        const { data: profiles } = await supabase
          .from("asset_commerce_profiles")
          .select("*")
          .in("asset_id", assetIds);

        const hydrated: Record<string, any> = {};
        (profiles ?? []).forEach((p: any) => {
          const asset = (assets ?? []).find((a: any) => a.id === p.asset_id);
          if (!asset) return;
          // Skip already-published assets — they've been through the flow
          if (asset.is_public) return;
          hydrated[p.asset_id] = {
            analyzing: false,
            profile: p,
            meta: {
              title: asset.title ?? "",
              desc: asset.description ?? "",
              aiModel: asset.ai_model ?? "",
              license: getDefaultLicenseSlug(),
              isFree: !asset.price_cents,
              priceCents: asset.price_cents ?? 0,
              tags: asset.tags ?? [],
              contentType: asset.content_type ?? "other",
              preview: asset.thumbnail_path
                ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${asset.thumbnail_path}`
                : null,
            },
          };
        });
        const hydratedTemps: Record<string, CommercePendingEntry> = {};
        ((tempRows as TempAssetRecord[]) ?? []).forEach((tempAsset) => {
          hydratedTemps[tempAsset.id] =
            buildPendingEntryFromTempAsset(tempAsset);
        });
        if (
          Object.keys(hydrated).length > 0 ||
          Object.keys(hydratedTemps).length > 0
        ) {
          setPendingAnalyses((prev) => ({
            ...hydrated,
            ...hydratedTemps,
            ...prev,
          }));
        }
      } else if ((tempRows as TempAssetRecord[])?.length) {
        const hydratedTemps: Record<string, CommercePendingEntry> = {};
        ((tempRows as TempAssetRecord[]) ?? []).forEach((tempAsset) => {
          hydratedTemps[tempAsset.id] =
            buildPendingEntryFromTempAsset(tempAsset);
        });
        setPendingAnalyses((prev) => ({
          ...hydratedTemps,
          ...prev,
        }));
      }

      setCommerceLoading(false);
    }
    loadCommerce();
  }, [activeTab, user, tempMetaCache]);

  useEffect(() => {
    if (activeTab !== "commerce" || !user) return;

    const channel = supabase
      .channel(`temp-assets-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assets",
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const asset = (payload.new || payload.old) as ListingAssetRecord | null;
          if (!asset?.id) return;

          if (payload.eventType === "DELETE") {
            setMyAssets((prev) => prev.filter((row) => row.id !== asset.id));
            setPendingAnalyses((prev) => {
              const next = { ...prev };
              delete next[asset.id];
              return next;
            });
            return;
          }

          setMyAssets((prev) => upsertRowById(prev, asset));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "temp_assets",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const tempAsset = (payload.new || payload.old) as TempAssetRecord;

          if (payload.eventType === "DELETE") {
            setTempAssets((prev) =>
              prev.filter((asset) => asset.id !== tempAsset.id),
            );
            setPendingAnalyses((prev) => {
              const next = { ...prev };
              delete next[tempAsset.id];
              return next;
            });
            return;
          }

          setTempAssets((prev) => {
            const index = prev.findIndex((asset) => asset.id === tempAsset.id);
            if (index === -1) return [tempAsset, ...prev];
            const next = [...prev];
            next[index] = { ...next[index], ...tempAsset };
            return next;
          });

          setPendingAnalyses((prev) => ({
            ...prev,
            [tempAsset.id]: buildPendingEntryFromTempAsset(
              tempAsset,
              prev[tempAsset.id],
            ),
          }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeTab, user, tempMetaCache]);

  // ── Filters / sort ─────────────────────────────────────────────────────────
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    listings.forEach((l) =>
      (l.tags ?? []).forEach((t: string) =>
        counts.set(t, (counts.get(t) ?? 0) + 1),
      ),
    );
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [listings]);

  const filteredListings = useMemo(() => {
    // Hide assets the user already purchased. Keep creator-owned assets visible
    // so creators can confirm their published listings from the marketplace.
    let r = listings.filter((l) => {
      if (purchasedAssetIds.has(l.id)) return false;
      return true;
    });
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      r = r.filter((l) => {
        const tags = Array.isArray(l.tags) ? l.tags : [];
        const skw = Array.isArray(l.suggested_keywords) ? l.suggested_keywords : [];
        const stags = Array.isArray(l.suggested_tags) ? l.suggested_tags : [];
        return (
          (l.title ?? "").toLowerCase().includes(q) ||
          (l.category ?? "").toLowerCase().includes(q) ||
          (l._profile?.display_name ?? "").toLowerCase().includes(q) ||
          (l.ai_model ?? "").toLowerCase().includes(q) ||
          tags.some((t: string) => (t ?? "").toLowerCase().includes(q)) ||
          skw.some((k: string) => (k ?? "").toLowerCase().includes(q)) ||
          stags.some((t: string) => (t ?? "").toLowerCase().includes(q))
        );
      });
    }
    if (selectedType !== "All Types")
      r = r.filter((l) =>
        (l._asset?.content_type ?? "")
          .toLowerCase()
          .includes(selectedType.toLowerCase()),
      );
    if (selectedLicense !== "all")
      r = r.filter((l) => l.license_type === selectedLicense);
    if (selectedPrice === "free")
      r = r.filter((l) => !l.price_cents || l.price_cents === 0);
    else if (selectedPrice === "paid")
      r = r.filter((l) => l.price_cents && l.price_cents > 0);
    if (selectedRecency !== "all") {
      const now = Date.now();
      const windowMs =
        selectedRecency === "24h"
          ? 24 * 60 * 60 * 1000
          : selectedRecency === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000;
      r = r.filter((l) => now - new Date(l.created_at).getTime() <= windowMs);
    }
    if (selectedTags.length > 0)
      r = r.filter((l) => selectedTags.some((t) => (l.tags ?? []).includes(t)));
    // Newly-created assets stay pinned to the front for a freshness window
    // (3 days); everything else appears in a stable random order.
    const FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const isFresh = (l: any) =>
      nowMs - new Date(l.created_at).getTime() < FRESH_WINDOW_MS;

    return [...r].sort((a, b) => {
      if (sortBy === "popular")
        return (b.views_count ?? 0) - (a.views_count ?? 0);
      if (sortBy === "purchases")
        return (b.purchases_count ?? 0) - (a.purchases_count ?? 0);

      // Default ("newest") view: fresh first, then random.
      const aFresh = isFresh(a);
      const bFresh = isFresh(b);
      if (aFresh && bFresh) {
        // Both fresh → newest first.
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      if (aFresh) return -1;
      if (bFresh) return 1;
      // Neither fresh → stable random shuffle.
      return (a._rand ?? 0) - (b._rand ?? 0);
    });
  }, [
    listings,
    searchQuery,
    selectedType,
    selectedCatalogScope,
    selectedLicense,
    selectedPrice,
    selectedRecency,
    selectedTags,
    sortBy,
    purchasedAssetIds,
    user,
  ]);


  // Build a single mixed grid — bundles scattered randomly among assets
  const gridItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const showAssets = selectedCatalogScope !== "Bundles Only";
    const showBundles =
      selectedCatalogScope !== "Assets Only" && selectedType === "All Types";
    const visibleBundles = showBundles
      ? bundles.filter((b: any) => {
          if (purchasedBundleIds.has(b.id)) return false;

          const skw = Array.isArray(b.suggested_keywords) ? b.suggested_keywords : [];
          const stags = Array.isArray(b.suggested_tags) ? b.suggested_tags : [];

          // License filter — bundles don't have license_type yet; keep them unless paid/free mismatches
          if (selectedPrice === "free" && (b.total_price_cents ?? 0) > 0) return false;
          if (selectedPrice === "paid" && (b.total_price_cents ?? 0) === 0) return false;
          if (selectedRecency !== "all") {
            const now = Date.now();
            const windowMs =
              selectedRecency === "24h"
                ? 24 * 60 * 60 * 1000
                : selectedRecency === "7d"
                  ? 7 * 24 * 60 * 60 * 1000
                  : 30 * 24 * 60 * 60 * 1000;
            if (now - new Date(b.created_at).getTime() > windowMs) return false;
          }

          // Tag filter — match against bundle's AI tags + keywords
          if (selectedTags.length > 0) {
            const haystack = [...skw, ...stags].map((t: string) => (t ?? "").toLowerCase());
            const matched = selectedTags.some((t) => haystack.includes(t.toLowerCase()));
            if (!matched) return false;
          }

          // Search query
          if (q) {
            const matched =
              (b.name ?? "").toLowerCase().includes(q) ||
              (b.description ?? "").toLowerCase().includes(q) ||
              skw.some((k: string) => (k ?? "").toLowerCase().includes(q)) ||
              stags.some((t: string) => (t ?? "").toLowerCase().includes(q));
            if (!matched) return false;
          }

          return true;
        })
      : [];

    const assetItems = showAssets
      ? filteredListings.map(data => ({ type: "asset" as const, data }))
      : [];

    if (visibleBundles.length === 0) return assetItems;

    // Splice each bundle at a spread-out position, offset by bundle ID char for stable "randomness"
    const result: Array<{ type: "asset" | "bundle"; data: any }> = [...assetItems];
    visibleBundles.forEach((bundle: any, i: number) => {
      const spread = Math.floor((result.length + 1) / (visibleBundles.length + 1));
      const base = spread * (i + 1);
      const offset = (bundle.id.charCodeAt(0) + bundle.id.charCodeAt(4)) % Math.max(spread, 1);
      const pos = Math.min(Math.max(base + offset - Math.floor(spread / 2), 0), result.length);
      result.splice(pos, 0, { type: "bundle" as const, data: bundle });
    });

    return result;
  }, [
    filteredListings,
    bundles,
    purchasedBundleIds,
    selectedType,
    selectedCatalogScope,
    selectedPrice,
    selectedRecency,
    selectedTags,
    searchQuery,
  ]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(
    1,
    Math.ceil(gridItems.length / MARKETPLACE_PAGE_SIZE),
  );
  // Keep the current page in range when the result set shrinks.
  const safePage = Math.min(currentPage, totalPages);
  // "Load more" — accumulate every page up to the current one.
  const pagedItems = gridItems.slice(0, safePage * MARKETPLACE_PAGE_SIZE);
  const hasMore = safePage < totalPages;

  // Reset to page 1 whenever the filters / search / sort change.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    selectedType,
    selectedCatalogScope,
    selectedLicense,
    selectedPrice,
    selectedRecency,
    selectedTags,
    sortBy,
  ]);

  const activeFilterCount =
    (selectedType !== "All Types" ? 1 : 0) +
    (selectedCatalogScope !== "All Listings" ? 1 : 0) +
    selectedTags.length +
    (selectedLicense !== "all" ? 1 : 0) +
    (selectedPrice !== "all" ? 1 : 0) +
    (selectedRecency !== "all" ? 1 : 0);

  function toggleTag(t: string) {
    setSelectedTags((p) =>
      p.includes(t) ? p.filter((x) => x !== t) : [...p, t],
    );
  }
  async function handleReport(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!reportReason || !reportingAssetId) return;
    setReportLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setReportToast("Please sign in to report content."); setReportLoading(false); return; }
      const res = await fetch("/api/dmca/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ asset_id: reportingAssetId, reason: reportReason, description: reportDescription }),
      });
      const data = await res.json();
      if (data.success) {
        setReportToast("Report submitted. Our team will review it within 48 hours.");
        setReportingAssetId(null);
        setReportReason("");
        setReportDescription("");
      } else {
        setReportToast(data.error || "Failed to submit report.");
      }
    } catch {
      setReportToast("Failed to submit report.");
    } finally {
      setReportLoading(false);
      setTimeout(() => setReportToast(""), 4000);
    }
  }

  function toggleLike(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setLiked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function clearAll() {
    setSelectedType("All Types");
    setSelectedCatalogScope("All Listings");
    setSelectedLicense("all");
    setSelectedPrice("all");
    setSelectedRecency("all");
    setSelectedTags([]);
    setSearchQuery("");
  }

  function storageUrl(path?: string | null) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }
  function tempStorageUrl(path?: string | null) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${TEMP_ASSET_BUCKET}/${path}`;
  }
  function getLicenseBadge(lt: string) {
    if (!lt) return "Paid";
    const l = lt.toLowerCase();
    if (l.includes("cc") || l.includes("creative")) return "CC";
    if (l.includes("personal")) return "Personal";
    if (l.includes("commercial")) return "Commercial";
    return "Paid";
  }

  // ── My Commerce stats ──────────────────────────────────────────────────────
  const commerceBuckets = useMemo(() => {
    const readyToList: CommerceBucketItem[] = [];
    const needsWork: CommerceBucketItem[] = [];
    const unanalyzed: CommerceBucketItem[] = [];
    const published: CommerceBucketItem[] = [];

    const combinedAssets: ListingAssetRecord[] = [
      ...tempAssets.map((asset) => ({ ...asset, is_temp: true })),
      ...myAssets,
    ];

    combinedAssets.forEach((asset) => {
      const pending = pendingAnalyses[asset.id];
      const item = { asset, hasListing: !!asset.is_public, pending };

      // Permanent assets with is_public = true → Published bucket
      if (!asset.is_temp && asset.is_public) {
        published.push(item);
        return;
      }

      // Permanent private assets can still be analyzed/listed from My Commerce.
      if (!asset.is_temp) {
        if (!pending || pending.analyzing || !pending.profile) {
          unanalyzed.push(item);
          return;
        }

        const score = pending.profile?.commerce_readiness_score ?? 0;
        if (score >= 60) readyToList.push(item);
        else needsWork.push(item);
        return;
      }

      if (!pending || pending.analyzing || !pending.profile) {
        unanalyzed.push(item);
        return;
      }

      const score = pending.profile?.commerce_readiness_score ?? 0;
      if (score >= 60) readyToList.push(item);
      else needsWork.push(item);
    });

    return { readyToList, needsWork, unanalyzed, published };
  }, [myAssets, pendingAnalyses, tempAssets]);

  const tempAnalysisItems = useMemo(
    () =>
      commerceBuckets.unanalyzed.filter(
        ({ asset, pending }) => asset.is_temp && pending?.analyzing,
      ),
    [commerceBuckets.unanalyzed],
  );

  useEffect(() => {
    setCommerceVisibleCounts({
      analyzing: MY_COMMERCE_SECTION_PAGE_SIZE,
      ready: MY_COMMERCE_SECTION_PAGE_SIZE,
      needsWork: MY_COMMERCE_SECTION_PAGE_SIZE,
    });
  }, [
    tempAnalysisItems.length,
    commerceBuckets.readyToList.length,
    commerceBuckets.needsWork.length,
  ]);

  // Auto-open compare modal when analysis finishes with score >= 60 but <= 80.
  // Scores above 80 are auto-published with AI suggestions.
  // Only fires for assets that transitioned analyzing:true → false THIS session (not pre-existing)
  useEffect(() => {
    Object.entries(pendingAnalyses).forEach(([id, entry]) => {
      const score = entry.profile?.commerce_readiness_score ?? 0;
      if (entry.analyzing) {
        // Mark as "was in-progress this session"
        wasAnalyzingRef.current.add(id);
      } else if (
        wasAnalyzingRef.current.has(id) &&   // must have been analyzing this session
        entry.profile &&
        score >= 60 &&
        score <= 80 &&
        !autoShownRef.current.has(id) &&      // not already shown
        compareAssetId === null               // no modal already open
      ) {
        autoShownRef.current.add(id);
        setCompareAssetId(id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnalyses]);

  // When compare modal opens, fetch market-aware pricing in background
  // Always fetch — even for free assets (user might want to price it)
  useEffect(() => {
    if (!compareAssetId) {
      setComparePricing({ loading: false, data: null });
      return;
    }
    const entry = pendingAnalyses[compareAssetId];
    if (!entry?.profile) return;
    const { profile, meta } = entry;

    setComparePricing({ loading: true, data: null });
    fetch("/api/commerce/pricing/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: meta.contentType?.toLowerCase() || "other",
        category: profile.suggested_categories?.[0] ?? null,
        tags: profile.suggested_tags ?? meta.tags ?? [],
        commerce_readiness_score: profile.commerce_readiness_score,
        suggested_price_band: profile.suggested_price_band,
        suggested_license_type: profile.suggested_license_type,
        title: meta.title,
        description: profile.listing_description || profile.content_description,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setComparePricing({ loading: false, data });
        } else {
          setComparePricing({ loading: false, data: null });
        }
      })
      .catch(() => setComparePricing({ loading: false, data: null }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareAssetId]);

  useEffect(() => {
    if (!compareAssetId || typeof document === "undefined") return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [compareAssetId]);

  const stats = [
    {
      icon: CheckCircle2,
      label: "Ready to List",
      value: commerceBuckets.readyToList.length,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      icon: AlertCircle,
      label: "Needs Work",
      value: commerceBuckets.needsWork.length,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ];

  // ── Upload handlers ────────────────────────────────────────────────────────
  function addTag() {
    const t = uploadTagInput.trim();
    if (!t || uploadTags.includes(t) || uploadTags.length >= 10) return;
    setUploadTags((p) => [...p, t]);
    setUploadTagInput("");
  }
  function removeTag(t: string) {
    setUploadTags((p) => p.filter((x) => x !== t));
  }

  function updateTempMetaCache(tempAssetId: string, meta: CommerceMeta | null) {
    setTempMetaCache((prev) => {
      const next = { ...prev };
      if (meta) next[tempAssetId] = meta;
      else delete next[tempAssetId];

      if (typeof window !== "undefined") {
        localStorage.setItem(TEMP_META_CACHE_KEY, JSON.stringify(next));
      }

      return next;
    });
  }

  function buildPendingEntryFromTempAsset(
    tempAsset: TempAssetRecord,
    existing?: CommercePendingEntry,
  ): CommercePendingEntry {
    const cachedMeta = tempMetaCache[tempAsset.id];
    const meta: CommerceMeta = existing?.meta ||
      cachedMeta || {
        title: tempAsset.title ?? "Untitled",
        desc: tempAsset.description ?? "",
        aiModel: "",
        license: getDefaultLicenseSlug(),
        isFree: true,
        priceCents: 0,
        tags: tempAsset.tags ?? [],
        contentType: tempAsset.content_type ?? "other",
        preview:
          tempStorageUrl(tempAsset.thumbnail_path || tempAsset.storage_path) ??
          null,
        imageFit: tempAsset.content_type === "image" ? "contain" : "cover",
      };

    const score = tempAsset.readiness_score ?? null;
    // Prefer the full persisted profile if we have one (set by the evaluate route)
    const storedProfile = tempAsset.commerce_profile ?? null;
    const profile: CommerceProfile | null =
      storedProfile ??
      (score === null
        ? (existing?.profile ?? null)
        : {
            ...existing?.profile,
            commerce_readiness_score: score,
            listing_readiness_status: score >= 60 ? "ready" : "needs_work",
            readiness_verdict:
              tempAsset.readiness_verdict ??
              (score >= 80 ? "ready" : score >= 55 ? "not-yet" : "not-ready"),
            recommended_next_commerce_action:
              existing?.profile?.recommended_next_commerce_action ||
              (score >= 60
                ? "This upload is ready to publish."
                : "Run Deep Analysis or publish with your original data."),
          });

    return {
      analyzing:
        tempAsset.analysis_status === "pending" ||
        tempAsset.analysis_status === "analyzing",
      profile,
      meta,
      startedAtMs:
        tempAsset.analysis_status === "pending" ||
        tempAsset.analysis_status === "analyzing"
          ? Date.parse(tempAsset.updated_at || tempAsset.created_at || "") ||
            existing?.startedAtMs ||
            Date.now()
          : existing?.startedAtMs,
    };
  }

  async function getLicenseTypeId(slug: string) {
    const { data: licenseType } = await supabase
      .from("license_types")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    return licenseType?.id ?? null;
  }

  function getLicenseOptions() {
    return availableLicenses.length > 0
      ? availableLicenses.map((license) => ({
          value: license.slug,
          label: license.name,
        }))
      : LICENSE_TYPES;
  }

  function getDefaultLicenseSlug() {
    return getLicenseOptions()[0]?.value || "personal";
  }

  function normalizeLicenseSlug(licenseSlug: string | null | undefined) {
    const normalized = licenseSlug?.toLowerCase()?.trim();
    const options = getLicenseOptions();
    return options.some((license) => license.value === normalized)
      ? normalized!
      : getDefaultLicenseSlug();
  }

  async function validatePaidPublishLicense(
    licenseSlug: string | null | undefined,
    priceCents: number,
  ) {
    if (priceCents <= 0) return true;

    if (!licenseSlug) {
      setUploadError("Select a license before publishing a paid asset.");
      return false;
    }

    const licenseTypeId = await getLicenseTypeId(licenseSlug);
    if (!licenseTypeId) {
      setUploadError("Selected license is not available. Choose another license.");
      return false;
    }

    return true;
  }

  async function ensurePaidAssetLicense(
    assetId: string,
    licenseSlug: string | null | undefined,
    priceCents: number,
  ) {
    if (priceCents <= 0) return;
    if (!licenseSlug) {
      throw new Error("Select a license before publishing a paid asset.");
    }

    const licenseTypeId = await getLicenseTypeId(licenseSlug);
    if (!licenseTypeId) {
      throw new Error("Selected license is not available. Choose another license.");
    }

    const { data: existingLicense } = await supabase
      .from("asset_licenses")
      .select("id, is_available")
      .eq("asset_id", assetId)
      .eq("license_type_id", licenseTypeId)
      .maybeSingle();

    if (existingLicense) {
      if (!existingLicense.is_available) {
        await supabase
          .from("asset_licenses")
          .update({ is_available: true })
          .eq("id", existingLicense.id);
      }
      return;
    }

    const { error } = await supabase.from("asset_licenses").insert({
      asset_id: assetId,
      license_type_id: licenseTypeId,
      price_override: null,
      is_available: true,
    });

    if (error) throw error;
  }

  async function materializeTempAsset(
    tempAssetId: string,
    meta: CommerceMeta,
  ): Promise<{ assetRow: any; tempAsset: TempAssetRecord }> {
    const tempAsset = tempAssets.find((asset) => asset.id === tempAssetId);
    if (!tempAsset) throw new Error("Temp asset not found.");

    const { data: tempFile, error: tempFileError } = await supabase.storage
      .from(TEMP_ASSET_BUCKET)
      .download(tempAsset.storage_path || "");
    if (tempFileError || !tempFile) {
      throw new Error(tempFileError?.message || "Failed to read temp upload.");
    }

    const ext =
      tempAsset.storage_path?.split(".").pop() ||
      tempAsset.mime_type?.split("/").pop() ||
      "bin";
    const finalStoragePath = `${user.id}/${Date.now()}-${tempAssetId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("assets")
      .upload(finalStoragePath, tempFile, {
        contentType: tempAsset.mime_type || tempFile.type || undefined,
      });
    if (uploadError) throw uploadError;

    const finalContentType = (
      tempAsset.content_type ||
      meta.contentType ||
      "other"
    ).toLowerCase();

    const { data: assetRow, error: assetInsertError } = await supabase
      .from("assets")
      .insert({
        owner_id: user.id,
        title: meta.title.trim(),
        description: meta.desc.trim(),
        content_type: finalContentType,
        storage_path: finalStoragePath,
        thumbnail_path: finalContentType === "image" ? finalStoragePath : null,
        ai_model: meta.aiModel,
        tags: meta.tags,
        price_cents: meta.priceCents,
        is_public: false,
        // Tag 1: this is a fresh original — the uploader is the origin creator.
        origin_creator_id: user.id,
      })
      .select()
      .single();
    if (assetInsertError) throw assetInsertError;

    if (tempAsset.file_size) {
      await supabase.from("asset_metadata").insert({
        asset_id: assetRow.id,
        file_size: tempAsset.file_size,
        width: null,
        height: null,
        duration_seconds: null,
        word_count: null,
        language: null,
        programming_language: null,
      });
    }

    const licenseTypeId = await getLicenseTypeId(meta.license);
    if (licenseTypeId) {
      await supabase.from("asset_licenses").insert({
        asset_id: assetRow.id,
        license_type_id: licenseTypeId,
        price_override: null,
        is_available: true,
      });
    }

    return { assetRow, tempAsset };
  }

  async function cleanupTempAsset(
    tempAssetId: string,
    storagePath?: string | null,
  ) {
    if (storagePath) {
      await supabase.storage.from(TEMP_ASSET_BUCKET).remove([storagePath]);
    }
    await supabase.from("temp_assets").delete().eq("id", tempAssetId);
    setTempAssets((prev) => prev.filter((asset) => asset.id !== tempAssetId));
    setPendingAnalyses((prev) => {
      const next = { ...prev };
      delete next[tempAssetId];
      return next;
    });
    updateTempMetaCache(tempAssetId, null);
  }

  async function handleDeleteCommerceAsset(asset: ListingAssetRecord) {
    const label = asset.title?.trim() || "this asset";
    if (!window.confirm(`Delete ${label}? This action cannot be undone.`)) {
      return;
    }

    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.add(asset.id);
      return next;
    });

    try {
      if (asset.is_temp) {
        await cleanupTempAsset(asset.id, asset.storage_path);
      } else {
        const accessToken = authToken || (await supabase.auth.getSession()).data.session?.access_token;

        if (!accessToken) {
          alert("Your session has expired. Please log in again.");
          router.push("/login?redirectTo=/marketplace");
          return;
        }

        const response = await fetch(`/api/creator/assets/${asset.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to delete asset");
        }

        setMyAssets((prev) => prev.filter((row) => row.id !== asset.id));
        setPendingAnalyses((prev) => {
          const next = { ...prev };
          delete next[asset.id];
          return next;
        });
      }

      if (compareAssetId === asset.id) {
        setCompareAssetId(null);
      }
    } catch (error: any) {
      alert(error?.message || "Failed to delete asset.");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
    }
  }

  function cleanupTempAssetLocally(tempAssetId: string) {
    setTempAssets((prev) => prev.filter((asset) => asset.id !== tempAssetId));
    setPendingAnalyses((prev) => {
      const next = { ...prev };
      delete next[tempAssetId];
      return next;
    });
    updateTempMetaCache(tempAssetId, null);
  }

  async function cleanupTempAssetRemotely(
    tempAssetId: string,
    storagePath?: string | null,
  ) {
    if (storagePath) {
      await supabase.storage.from(TEMP_ASSET_BUCKET).remove([storagePath]);
    }
    await supabase.from("temp_assets").delete().eq("id", tempAssetId);
  }

  function resetUpload() {
    setUploadTitle("");
    setUploadDesc("");
    setUploadContentType("Image");
    setUploadFile(null);
    setUploadFilePreview(null);
    setUploadAiModel("");
    setUploadLicense(getDefaultLicenseSlug());
    setUploadFree(false);
    setUploadPrice("");
    setUploadYear(new Date().getFullYear().toString());
    setUploadTags([]);
    setUploadTagInput("");
    setUploadError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function refreshListingsData() {
    // Jump back to page 1 so freshly published content is visible first.
    setCurrentPage(1);
    // Load this user's own assets (private + published)
    const { data: assets } = await supabase
      .from("assets")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setMyAssets(assets ?? []);
    setMyListings([]); // kept in state for prop compat, always empty now

    // Refresh public marketplace — query assets directly, no listings
    const { data: publicAssets } = await supabase
      .from("assets")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false });
    if (publicAssets) {
      const creatorIds = [
        ...new Set(
          publicAssets
            .flatMap((a: any) => [a.owner_id, a.origin_creator_id])
            .filter(Boolean),
        ),
      ];
      const { data: profiles } = creatorIds.length
        ? await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", creatorIds)
        : { data: [] as any[] };
      // Shape as listing-like so existing browse-tab render code keeps working
      setListings(
        publicAssets.map((a: any) => ({
          id: a.id,
          creator_id: a.owner_id,
          cover_asset_id: a.id,
          title: a.title,
          description: a.description,
          ai_model: a.ai_model,
          tags: a.tags,
          price_cents: a.price_cents,
          category: a.category,
          license_type: null,
          status: "public",
          created_at: a.created_at,
          _profile: profiles?.find((p: any) => p.id === a.owner_id) ?? null,
          _origin_profile:
            a.origin_creator_id && a.origin_creator_id !== a.owner_id
              ? profiles?.find((p: any) => p.id === a.origin_creator_id) ?? null
              : null,
          _asset: a,
          _rand: Math.random(),
        })),
      );
    }
  }

  function openBrowseAfterPublish() {
    setCompareAssetId(null);
    clearAll();
    setActiveTab("browse");
    void refreshListingsData();
    router.refresh();
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ── Upload: file + asset row, then kick off background analysis ───────────
  async function handleUpload(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!user) {
      setUploadError("You must be logged in to upload.");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError("Title is required.");
      return;
    }
    if (!uploadFile) {
      setUploadError("Please select a file to upload.");
      return;
    }
    if (!uploadAiModel) {
      setUploadError("Please select an AI model.");
      return;
    }

    setUploading(true);
    setUploadError("");
    logMarketplaceUpload("start", {
      title: uploadTitle.trim(),
      contentType: uploadContentType,
      aiModel: uploadAiModel,
      fileName: uploadFile?.name || null,
      fileSizeMb: uploadFile
        ? Number((uploadFile.size / 1024 / 1024).toFixed(2))
        : null,
    });
    try {
      const { imageFit } = await validateUploadFile(
        uploadFile,
        uploadContentType,
      );
      const fileSize = uploadFile.size;
      const ext = uploadFile.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from(TEMP_ASSET_BUCKET)
        .upload(fileName, uploadFile);
      if (storageErr) throw storageErr;

      const { data: tempAssetRow, error: tempAssetErr } = await supabase
        .from("temp_assets")
        .insert({
          user_id: user.id,
          title: uploadTitle.trim(),
          description: uploadDesc.trim(),
          content_type: uploadContentType.toLowerCase(),
          storage_path: fileName,
          thumbnail_path: uploadFile.type.startsWith("image/")
            ? fileName
            : null,
          mime_type: uploadFile.type || null,
          file_size: fileSize,
          analysis_status: "pending",
        })
        .select()
        .single();
      if (tempAssetErr) throw tempAssetErr;

      // Capture form data before resetting
      const capturedMeta = {
        title: uploadTitle.trim(),
        desc: uploadDesc.trim(),
        aiModel: uploadAiModel,
        license: uploadLicense,
        isFree: uploadFree,
        priceCents: uploadFree
          ? 0
          : Math.round(parseFloat(uploadPrice || "0") * 100),
        tags: [...uploadTags],
        contentType: uploadContentType,
        preview: uploadFilePreview || tempStorageUrl(fileName),
        imageFit,
      };
      updateTempMetaCache(tempAssetRow.id, capturedMeta);

      setTempAssets((prev) => [tempAssetRow as TempAssetRecord, ...prev]);
      setPendingAnalyses((prev) => ({
        ...prev,
        [tempAssetRow.id]: {
          analyzing: true,
          profile: null,
          meta: capturedMeta,
          startedAtMs: Date.now(),
        },
      }));

      // Close modal + reset form right away
      setUploadOpen(false);
      resetUpload();

      // Fire analysis in background — no await
      logMarketplaceUpload("background-analysis-queued", {
        tempAssetId: tempAssetRow.id,
        storagePath: fileName,
      });
      void runAnalysisInBackground(
        tempAssetRow.id,
        capturedMeta,
        uploadFile,
        fileName,
      );
    } catch (err: any) {
      logMarketplaceUpload("upload-failed", {
        message: err?.message ?? "Upload failed. Please try again.",
      });
      setUploadError(err?.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // Runs after modal closes — updates the card in the grid when done
  async function runAnalysisInBackground(
    tempAssetId: string,
    meta: any,
    file: File,
    storagePath: string,
  ) {
    const startedAtMs = Date.now();
    try {
      logMarketplaceUpload("analysis-start", {
        tempAssetId,
        storagePath,
        fileName: file.name,
        fileType: file.type,
        startedAtMs,
      });
      const formData = new FormData();
      formData.append("files", file);
      formData.append("tempAssetId", tempAssetId);
      formData.append("storagePath", storagePath);
      formData.append("bucketName", TEMP_ASSET_BUCKET);

      const res = await fetch("/api/marketplace/evaluate", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      logMarketplaceUpload("analysis-response", {
        tempAssetId,
        success: !!data.success,
        score: data.profile?.commerce_readiness_score ?? null,
        verdict: data.profile?.readiness_verdict ?? null,
        modelsUsed: data.debug?.models_used ?? [],
        elapsedMs: Date.now() - startedAtMs,
      });
      const profile =
        data.success && data.profile
          ? data.profile
          : {
              commerce_readiness_score: 0,
              recommended_next_commerce_action:
                "Analysis unavailable. You can still list your asset.",
            };
      setPendingAnalyses((prev) => ({
        ...prev,
        [tempAssetId]: { analyzing: false, profile, meta },
      }));

      if ((profile.commerce_readiness_score ?? 0) > 80) {
        setReportToast("High-scoring asset detected. Publishing automatically with AI suggestions.");
        setTimeout(() => setReportToast(""), 4000);
        const published = await handleQuickPublishAsset(
          tempAssetId,
          true,
          true,
          { analyzing: false, profile, meta },
        );
        if (published) {
          setReportToast("Asset auto-published with AI suggestions.");
          setTimeout(() => setReportToast(""), 4000);
        }
      }
    } catch {
      logMarketplaceUpload("analysis-failed", {
        tempAssetId,
        fileName: file.name,
        elapsedMs: Date.now() - startedAtMs,
      });
      setPendingAnalyses((prev) => ({
        ...prev,
        [tempAssetId]: {
          analyzing: false,
          profile: {
            commerce_readiness_score: 0,
            recommended_next_commerce_action:
              "Analysis failed. You can still list your asset.",
          },
          meta,
        },
      }));
    }
  }

  // Run the AI moderation scan and wait for the verdict before treating the asset as live.
  async function triggerModerationScan(assetId: string): Promise<{
    safe: boolean;
    severity?: string | null;
  }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("You must be signed in to publish assets.");
    }

    const response = await fetch("/api/assets/moderate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ asset_id: assetId }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "Moderation failed.");
    }

    return {
      safe: !!payload?.safe,
      severity: payload?.severity ?? null,
    };
  }

  async function runMarketplacePostPublishTasks(
    finalAssetId: string,
    assetId: string,
    tempStoragePath: string | null,
    tempAsset: TempAssetRecord | undefined,
  ) {
    try {
      logServer("quickPublish:moderation:start", { finalAssetId });
      const moderationResult = await triggerModerationScan(finalAssetId);
      logServer("quickPublish:moderation:done", {
        finalAssetId,
        moderationResult,
      });

      if (!moderationResult.safe) {
        setUploadError(
          moderationResult.severity === "high"
            ? "This asset was blocked by moderation."
            : "This asset was flagged for review and remains hidden until an admin reviews it.",
        );
      }
    } catch (err: any) {
      logServer("quickPublish:moderation:error", {
        finalAssetId,
        message: err?.message,
      });
      setUploadError(
        err?.message ?? "Moderation is still processing in the background.",
      );
    } finally {
      if (tempAsset) {
        await cleanupTempAssetRemotely(assetId, tempStoragePath);
        logServer("quickPublish:cleanup:done", { assetId, mode: "remote" });
      } else {
        setPendingAnalyses((prev) => {
          const n = { ...prev };
          delete n[assetId];
          return n;
        });
      }

      await refreshListingsData();
      logServer("quickPublish:refresh:done", { finalAssetId });
    }
  }

  // Quick Publish — use AI-suggested data
  async function handleQuickPublishAsset(
    assetId: string,
    useAiPrice = false,
    waitForAssetVisible = false,
    entryOverride?: CommercePendingEntry,
  ) {
    const entry = entryOverride || pendingAnalyses[assetId];
    logServer("quickPublish:click", {
      assetId,
      hasUser: !!user,
      userId: user?.id,
      hasEntry: !!entry,
      alreadyPublishing: publishingIds.has(assetId),
    });
    if (!user) {
      logServer("quickPublish:abort", { reason: "no_user" });
      return false;
    }
    if (!entry) {
      logServer("quickPublish:abort", {
        reason: "no_pending_entry",
        pendingKeys: Object.keys(pendingAnalyses),
      });
      return false;
    }
    const { profile, meta } = entry;
    logServer("quickPublish:entry", {
      meta,
      profile: profile
        ? {
            price_band: profile.suggested_price_band,
            tags: profile.suggested_tags,
            categories: profile.suggested_categories,
            has_description: !!profile.content_description,
        }
        : null,
    });

    const previewPriceBandMap: Record<string, number> = {
      free: 0,
      "micro($1-5)": 300,
      "starter($5-15)": 999,
      "standard($15-50)": 2999,
      "premium($50-200)": 9900,
      "enterprise($200+)": 29900,
    };
    const previewSuggestedPriceBand = profile?.suggested_price_band;
    const previewAiRecommendedCents: number | null =
      comparePricing.data?.pricing?.recommended_price_cents ?? null;
    const previewPriceCents = useAiPrice
      ? previewAiRecommendedCents !== null && previewAiRecommendedCents > 0
        ? previewAiRecommendedCents
        : previewSuggestedPriceBand && previewPriceBandMap[previewSuggestedPriceBand] > 0
        ? previewPriceBandMap[previewSuggestedPriceBand]
        : meta.priceCents || 0
      : meta.isFree
      ? 0
      : meta.priceCents && meta.priceCents > 0
      ? meta.priceCents
      : (previewSuggestedPriceBand && previewPriceBandMap[previewSuggestedPriceBand]) || 0;
    const previewLicenseChoice = useAiPrice
      ? normalizeLicenseSlug(profile?.suggested_license_type || meta.license)
      : normalizeLicenseSlug(meta.license || profile?.suggested_license_type);
    if (!(await validatePaidPublishLicense(previewLicenseChoice, previewPriceCents))) {
      return false;
    }

    setPublishingIds((prev) => new Set([...prev, assetId]));
    setUploadError("");
    try {
      const tempAsset = tempAssets.find((asset) => asset.id === assetId);
      let finalAssetId = assetId;
      let tempStoragePath: string | null = null;
      if (tempAsset) {
        logServer("quickPublish:materialize:start", { tempAssetId: assetId });
        const materialized = await materializeTempAsset(assetId, meta);
        finalAssetId = materialized.assetRow.id;
        tempStoragePath = materialized.tempAsset.storage_path || null;
        logServer("quickPublish:materialize:done", {
          finalAssetId,
          tempStoragePath,
        });
      } else {
        logServer("quickPublish:noTempAsset", { finalAssetId });
      }

      const priceBandMap: Record<string, number> = {
        free: 0,
        "micro($1-5)": 300,
        "starter($5-15)": 999,
        "standard($15-50)": 2999,
        "premium($50-200)": 9900,
        "enterprise($200+)": 29900,
      };
      const suggestedPriceBand = profile?.suggested_price_band;
      // Use the SAME price the user just saw in the modal (from the market pricing agent)
      // This is the "Use AI suggestions" path — must apply the price they confirmed visually.
      const aiRecommendedCents: number | null =
        comparePricing.data?.pricing?.recommended_price_cents ?? null;

      // When triggered via "Use AI suggestions":
      //   1. Market agent price (recommended_price_cents)
      //   2. Band default (what was shown in modal fallback)
      //   3. Never 0 — user chose AI pricing, don't publish free
      // When triggered via direct "Quick Publish" or "Use my data":
      //   1. User's entered price
      //   2. 0 if marked free
      let priceCents: number;
      if (useAiPrice) {
        const bandFallback = (suggestedPriceBand && priceBandMap[suggestedPriceBand]) || 0;
        priceCents =
          aiRecommendedCents !== null && aiRecommendedCents > 0
            ? aiRecommendedCents
            : bandFallback > 0
            ? bandFallback
            : meta.priceCents && meta.priceCents > 0
            ? meta.priceCents
            : 0;
      } else {
        priceCents = meta.isFree
          ? 0
          : meta.priceCents && meta.priceCents > 0
          ? meta.priceCents
          : (suggestedPriceBand && priceBandMap[suggestedPriceBand]) || 0;
      }
      const licenseChoice = useAiPrice
        ? normalizeLicenseSlug(profile?.suggested_license_type || meta.license)
        : normalizeLicenseSlug(meta.license || profile?.suggested_license_type);
      if (priceCents > 0 && !licenseChoice) {
        throw new Error("Select a license before publishing a paid asset.");
      }
      const updatePayload = {
        is_public: false,
        moderation_status: "pending",
        title: meta.title,
        description: profile?.content_description || meta.desc,
        ai_model: meta.aiModel,
        tags: profile?.suggested_tags?.slice(0, 8) || meta.tags,
        price_cents: priceCents,
        category: profile?.suggested_categories?.[0] || null,
      };
      logServer("quickPublish:update:start", { finalAssetId, updatePayload });
      // Publish the asset directly — no listings row. Apply AI-suggested metadata.
      const { data: publishedAsset, error: publishErr } = await supabase
        .from("assets")
        .update(updatePayload)
        .eq("id", finalAssetId)
        .select("*")
        .single();
      if (publishErr) {
        logServer("quickPublish:update:error", {
          message: publishErr.message,
          details: publishErr.details,
          hint: publishErr.hint,
          code: publishErr.code,
        });
        throw publishErr;
      }
      await ensurePaidAssetLicense(finalAssetId, licenseChoice, priceCents);
      logServer("quickPublish:update:done", {
        finalAssetId,
        moderationStatus: "pending",
      });
      if (publishedAsset) {
        setMyAssets((prev) =>
          upsertRowById(prev, {
            ...publishedAsset,
            is_public: false,
            moderation_status: "pending",
          }),
        );
      }
      if (tempAsset) {
        cleanupTempAssetLocally(assetId);
        logServer("quickPublish:cleanup:done", { assetId, mode: "local" });
      } else {
        setPendingAnalyses((prev) => {
          const n = { ...prev };
          delete n[assetId];
          return n;
        });
      }
      const postPublishPromise = runMarketplacePostPublishTasks(
        finalAssetId,
        assetId,
        tempStoragePath,
        tempAsset,
      );
      if (waitForAssetVisible) {
        await postPublishPromise;
      }
      return true;
    } catch (err: any) {
      logServer("quickPublish:catch", {
        message: err?.message,
        stack: err?.stack,
      });
      setUploadError(err?.message ?? "Publish failed.");
      return false;
    } finally {
      setPublishingIds((prev) => {
        const n = new Set(prev);
        n.delete(assetId);
        return n;
      });
    }
  }

  // List Anyway — use original user-entered data
  async function handleListAnywayAsset(
    assetId: string,
    waitForAssetVisible = false,
  ) {
    if (!user) return false;
    const entry = pendingAnalyses[assetId];
    if (!entry) return false;
    const { meta } = entry;
    const licenseChoice = normalizeLicenseSlug(meta.license);
    if (!(await validatePaidPublishLicense(licenseChoice, meta.priceCents))) {
      return false;
    }

    setPublishingIds((prev) => new Set([...prev, assetId]));
    setUploadError("");
    try {
      const tempAsset = tempAssets.find((asset) => asset.id === assetId);
      let finalAssetId = assetId;
      let tempStoragePath: string | null = null;
      if (tempAsset) {
        const materialized = await materializeTempAsset(assetId, meta);
        finalAssetId = materialized.assetRow.id;
        tempStoragePath = materialized.tempAsset.storage_path || null;
      }

      if (meta.priceCents > 0 && !licenseChoice) {
        throw new Error("Select a license before publishing a paid asset.");
      }

      // Publish the asset directly — no listings row. Use the user's original metadata.
      const { data: publishedAsset, error: publishErr } = await supabase
        .from("assets")
        .update({
          is_public: false,
          moderation_status: "pending",
          title: meta.title,
          description: meta.desc,
          ai_model: meta.aiModel,
          tags: meta.tags,
          price_cents: meta.priceCents,
        })
        .eq("id", finalAssetId)
        .select("id, is_public, moderation_status")
        .single();
      if (publishErr) throw publishErr;
      await ensurePaidAssetLicense(finalAssetId, licenseChoice, meta.priceCents);
      if (publishedAsset) {
        setMyAssets((prev) =>
          upsertRowById(prev, {
            ...publishedAsset,
            is_public: false,
            moderation_status: "pending",
          }),
        );
      }
      if (tempAsset) {
        cleanupTempAssetLocally(assetId);
      } else {
        setPendingAnalyses((prev) => {
          const n = { ...prev };
          delete n[assetId];
          return n;
        });
      }
      const postPublishPromise = runMarketplacePostPublishTasks(
        finalAssetId,
        assetId,
        tempStoragePath,
        tempAsset,
      );
      if (waitForAssetVisible) {
        await postPublishPromise;
      }
      return true;
    } catch (err: any) {
      setUploadError(err?.message ?? "Publish failed.");
      return false;
    } finally {
      setPublishingIds((prev) => {
        const n = new Set(prev);
        n.delete(assetId);
        return n;
      });
    }
  }

  // Analyze an existing unlisted asset (same background flow)
  async function handleAnalyzeExistingAsset(asset: any) {
    if (!user || pendingAnalyses[asset.id]) return;
    const img = storageUrl(asset.thumbnail_path || asset.storage_path);
    const meta = {
      title: asset.title || "Untitled",
      desc: asset.description || "",
      aiModel: asset.ai_model || "",
      license: getDefaultLicenseSlug(),
      isFree: true,
      priceCents: 0,
      tags: asset.tags || [],
      contentType: asset.content_type || "other",
      preview: img,
    };
    setPendingAnalyses((prev) => ({
      ...prev,
      [asset.id]: {
        analyzing: true,
        profile: null,
        meta,
        startedAtMs: Date.now(),
      },
    }));
    try {
      const res = await fetch("/api/commerce/profile/build", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          asset_id: asset.id,
          entry_point: "marketplace_direct",
        }),
      });
      const data = await res.json();
      setPendingAnalyses((prev) => ({
        ...prev,
        [asset.id]: {
          analyzing: false,
          profile:
            data.success && data.profile
              ? data.profile
              : {
                  commerce_readiness_score: 0,
                  recommended_next_commerce_action:
                    "Analysis unavailable. You can still list your asset.",
                },
          meta,
        },
      }));

      const profile =
        data.success && data.profile
          ? data.profile
          : {
              commerce_readiness_score: 0,
              recommended_next_commerce_action:
                "Analysis unavailable. You can still list your asset.",
            };

      if ((profile.commerce_readiness_score ?? 0) > 80) {
        setReportToast("High-scoring asset detected. Publishing automatically with AI suggestions.");
        setTimeout(() => setReportToast(""), 4000);
        const published = await handleQuickPublishAsset(
          asset.id,
          true,
          true,
          { analyzing: false, profile, meta },
        );
        if (published) {
          setReportToast("Asset auto-published with AI suggestions.");
          setTimeout(() => setReportToast(""), 4000);
        }
      }
    } catch {
      setPendingAnalyses((prev) => ({
        ...prev,
        [asset.id]: {
          analyzing: false,
          profile: {
            commerce_readiness_score: 0,
            recommended_next_commerce_action:
              "Analysis failed. You can still list your asset.",
          },
          meta,
        },
      }));
    }
  }

  // Deep Analysis — send to decision layer
  function handleDeepAnalysisAsset(
    assetId: string,
    contentType?: string | null,
    storagePath?: string | null,
    assetTitle?: string | null,
    mimeType?: string | null,
  ) {
    const tempAsset = tempAssets.find((asset) => asset.id === assetId);
    if (tempAsset) {
      const entry = pendingAnalyses[assetId];
      if (!entry) return;
      setPublishingIds((prev) => new Set([...prev, assetId]));
      void (async () => {
        try {
          const materialized = await materializeTempAsset(assetId, entry.meta);
          await cleanupTempAsset(
            assetId,
            materialized.tempAsset.storage_path || null,
          );
          await refreshListingsData();

          const params = new URLSearchParams({
            asset_id: materialized.assetRow.id,
          });
          if (materialized.assetRow.content_type) {
            params.set("content_type", materialized.assetRow.content_type);
          }
          if (materialized.assetRow.storage_path) {
            params.set("storage_path", materialized.assetRow.storage_path);
          }
          if (materialized.assetRow.title) {
            params.set("asset_title", materialized.assetRow.title);
          }
          if (materialized.assetRow.mime_type) {
            params.set("mime_type", materialized.assetRow.mime_type);
          }
          router.push(`/decision-layer?${params.toString()}`);
        } catch (err: any) {
          setUploadError(err?.message ?? "Failed to open deep analysis.");
        } finally {
          setPublishingIds((prev) => {
            const n = new Set(prev);
            n.delete(assetId);
            return n;
          });
        }
      })();
      return;
    }

    const params = new URLSearchParams({ asset_id: assetId });
    if (contentType) params.set("content_type", contentType);
    if (storagePath) params.set("storage_path", storagePath);
    if (assetTitle) params.set("asset_title", assetTitle);
    if (mimeType) params.set("mime_type", mimeType);
    router.push(`/decision-layer?${params.toString()}`);
  }

  // ── Sidebar (browse) ───────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Filters
        </p>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-[10px] font-medium text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full transition-all"
          >
            <X className="w-2.5 h-2.5" />
            Clear {activeFilterCount}
          </button>
        )}
      </div>
      <FilterGroup label="Content Type">
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all duration-150 ${
                selectedType === t
                  ? "bg-red-500/15 border-red-500/30 text-red-300"
                  : "border-white/[0.07] text-gray-600 hover:border-white/[0.16] hover:text-gray-300 hover:bg-white/[0.04]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </FilterGroup>
      <FilterGroup label="Catalog">
        <SelectInput
          value={selectedCatalogScope}
          onChange={setSelectedCatalogScope}
          options={CATALOG_SCOPES.map((scope) => ({
            value: scope,
            label: scope,
          }))}
        />
      </FilterGroup>
      <FilterGroup label="License">
        <SelectInput
          value={selectedLicense}
          onChange={setSelectedLicense}
          options={[
            { value: "all", label: "All Licenses" },
            { value: "personal", label: "Personal" },
            { value: "commercial", label: "Commercial" },
            { value: "extended", label: "Extended" },
          ]}
        />
      </FilterGroup>
      <FilterGroup label="Price">
        <SelectInput
          value={selectedPrice}
          onChange={setSelectedPrice}
          options={[
            { value: "all", label: "All Prices" },
            { value: "free", label: "Free" },
            { value: "paid", label: "Paid" },
          ]}
        />
      </FilterGroup>
      <FilterGroup label="Freshness">
        <SelectInput
          value={selectedRecency}
          onChange={setSelectedRecency}
          options={RECENCY_OPTIONS}
        />
      </FilterGroup>
      {allTags.length > 0 && (
        <>
          <div className="h-px bg-white/[0.05]" />
          <FilterGroup label="Popular Tags">
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {allTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all duration-150 ${
                      active
                        ? "bg-red-500/15 border-red-500/30 text-red-300"
                        : "border-white/[0.07] text-gray-600 hover:border-white/[0.16] hover:text-gray-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </FilterGroup>
        </>
      )}
    </div>
  );

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#070707] text-white">
      {/* ═══════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════ */}
      <section className="relative overflow-hidden border-b border-white/[0.05]">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-red-600/[0.055] rounded-full blur-[130px]" />
          <div className="absolute top-0 right-[10%] w-[350px] h-[280px] bg-rose-700/[0.04] rounded-full blur-[90px]" />
          <div
            className="absolute inset-0 opacity-[0.018]"
            style={{
              backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
              backgroundSize: "30px 30px",
            }}
          />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-10 md:pt-28 md:pb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/[0.07] border border-red-500/[0.18] text-red-400/90 text-[11px] font-semibold tracking-wide uppercase mb-4">
            <Sparkles className="w-3 h-3" />
            AI-Powered Commerce Platform
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-[-0.02em] leading-[1.1] mb-3">
            Marketplace{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-red-400 via-red-500 to-rose-500">
              Commerce OS
            </span>
          </h1>
          <p className="text-gray-500 text-sm md:text-[15px] max-w-lg leading-relaxed mb-6">
            Upload assets, get AI-powered commerce intelligence, and publish
            optimized drops — all in one flow.
          </p>

          {/* ── Tab bar ── */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.07] w-fit mb-6">
            <TabBtn
              active={activeTab === "browse"}
              onClick={() => setActiveTab("browse")}
              icon={<LayoutGrid className="w-3.5 h-3.5" />}
              label="Browse Assets"
            />
            {user && (
              <TabBtn
                active={activeTab === "commerce"}
                onClick={() => setActiveTab("commerce")}
                icon={<ShoppingBag className="w-3.5 h-3.5" />}
                label="My Commerce"
              />
            )}
          </div>


          {/* Stats (browse tab) */}
          {activeTab === "browse" && !loading && listings.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {[
                { icon: LayoutGrid, label: "assets", value: listings.length },
                {
                  icon: TrendingUp,
                  label: "free assets",
                  value: listings.filter(
                    (l) => !l.price_cents || l.price_cents === 0,
                  ).length,
                },
                {
                  icon: Users,
                  label: "creators",
                  value: new Set(
                    listings.map((l) => l.creator_id).filter(Boolean),
                  ).size,
                },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-red-500/50" />
                  <span className="text-xs text-gray-600">
                    <span className="text-gray-300 font-semibold tabular-nums">
                      {value.toLocaleString()}
                    </span>{" "}
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          TAB CONTENT
      ═══════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7">
        {/* ─── BROWSE LISTINGS ──────────────────────────────────── */}
        {activeTab === "browse" && (
          <div id="listings-grid">
            {/* Sticky search + horizontal filters */}
            <div className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3 pb-3 bg-[#070707]/95 backdrop-blur-md border-b border-white/[0.06] mb-5">
              {/* Search */}
              <div className="relative mb-2.5">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-gray-600 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search content, creators, AI models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 focus:border-red-500/25 hover:border-white/[0.13] transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.13] transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Horizontal filter dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                <SelectDropdown
                  label="Type"
                  value={selectedType}
                  onChange={setSelectedType}
                  options={CONTENT_TYPES.map((t) => ({ value: t, label: t }))}
                />
                <SelectDropdown
                  label="Catalog"
                  value={selectedCatalogScope}
                  onChange={setSelectedCatalogScope}
                  options={CATALOG_SCOPES.map((scope) => ({
                    value: scope,
                    label: scope,
                  }))}
                />
                <SelectDropdown
                  label="License"
                  value={selectedLicense}
                  onChange={setSelectedLicense}
                  options={[
                    { value: "all", label: "All Licenses" },
                    { value: "personal", label: "Personal" },
                    { value: "commercial", label: "Commercial" },
                    { value: "royalty-free", label: "Royalty-Free" },
                  ]}
                />
                <SelectDropdown
                  label="Price"
                  value={selectedPrice}
                  onChange={setSelectedPrice}
                  options={[
                    { value: "all", label: "All Prices" },
                    { value: "free", label: "Free" },
                    { value: "paid", label: "Paid" },
                  ]}
                />
                <SelectDropdown
                  label="Freshness"
                  value={selectedRecency}
                  onChange={setSelectedRecency}
                  options={RECENCY_OPTIONS}
                />
                {allTags.length > 0 && (
                  <MultiSelectDropdown
                    label="Tags"
                    options={allTags}
                    selected={selectedTags}
                    onToggle={toggleTag}
                    onClear={() => setSelectedTags([])}
                  />
                )}
                <SelectDropdown
                  label="Sort"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: "newest", label: "Newest" },
                    { value: "popular", label: "Popular" },
                    { value: "purchases", label: "Top Sellers" },
                  ]}
                />
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition-all"
                  >
                    <X className="w-3 h-3" />
                    Clear all ({activeFilterCount})
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0">

              {/* Active filter chips */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedType !== "All Types" && (
                    <Chip
                      label={selectedType}
                      onRemove={() => setSelectedType("All Types")}
                      accent
                    />
                  )}
                  {selectedCatalogScope !== "All Listings" && (
                    <Chip
                      label={selectedCatalogScope}
                      onRemove={() => setSelectedCatalogScope("All Listings")}
                    />
                  )}
                  {selectedTags.map((t) => (
                    <Chip key={t} label={t} onRemove={() => toggleTag(t)} />
                  ))}
                  {selectedLicense !== "all" && (
                    <Chip
                      label={selectedLicense}
                      onRemove={() => setSelectedLicense("all")}
                    />
                  )}
                  {selectedPrice !== "all" && (
                    <Chip
                      label={selectedPrice}
                      onRemove={() => setSelectedPrice("all")}
                    />
                  )}
                  {selectedRecency !== "all" && (
                    <Chip
                      label={
                        RECENCY_OPTIONS.find(
                          (option) => option.value === selectedRecency,
                        )?.label || selectedRecency
                      }
                      onRemove={() => setSelectedRecency("all")}
                    />
                  )}
                </div>
              )}

              <p className="text-[12px] text-gray-600 mb-5">
                {loading ? (
                  ""
                ) : (
                  <>
                    <span className="text-gray-400 font-medium">
                      {filteredListings.length}
                    </span>{" "}
                    result{filteredListings.length !== 1 ? "s" : ""}
                  </>
                )}
              </p>

              {/* Grid */}
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-5">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-2xl overflow-hidden bg-[#0f0f0f] border border-white/[0.05]"
                    >
                      <div className="aspect-[4/3] bg-white/[0.03] animate-pulse" />
                      <div className="p-4 space-y-3">
                        <Skeleton className="h-4 w-3/4 bg-white/[0.04] rounded-lg" />
                        <Skeleton className="h-3 w-full bg-white/[0.03] rounded-lg" />
                        <div className="flex gap-2 pt-1">
                          <Skeleton className="h-9 flex-1 bg-white/[0.04] rounded-xl" />
                          <Skeleton className="h-9 flex-1 bg-white/[0.03] rounded-xl" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : gridItems.length === 0 ? (
                <EmptyState
                  activeFilterCount={activeFilterCount}
                  onClear={clearAll}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-5">
                  {pagedItems.map((item) => {
                    if (item.type === "bundle") {
                      return <BundleCard key={`bundle-${item.data.id}`} bundle={item.data} />;
                    }
                    const listing = item.data;
                    const asset = listing._asset;
                    const isPaid = listing.price_cents && listing.price_cents > 0;
                    const imgUrl = storageUrl(asset?.thumbnail_path || asset?.storage_path);
                    const contentType = asset?.content_type ?? "asset";
                    const displayType = contentType.charAt(0).toUpperCase() + contentType.slice(1);
                    const licenseBadge = getLicenseBadge(listing.license_type);
                    const priceDisplay = isPaid ? `$${(listing.price_cents / 100).toFixed(2)}` : "Free";
                    const creatorName = listing._profile?.display_name ?? "creator";
                    const originCreatorName =
                      listing._origin_profile?.display_name ?? null;
                    const aiModel = listing.ai_model ?? listing.model ?? null;
                    const isLiked = liked.has(listing.id);
                    const isOwnListing = user && listing.creator_id === user.id;
                    const initials = creatorName.slice(0, 2).toUpperCase();
                    const createdAtLabel = new Date(
                      listing.created_at,
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });

                    return (
                      <article
                        key={listing.id}
                        onClick={() => router.push(`/assets/${listing.id}`)}
                        className="group relative rounded-2xl overflow-hidden bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.13] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/60 transition-all duration-300 cursor-pointer flex flex-col"
                      >
                        {/* Image */}
                        <div className="relative aspect-[4/3] bg-[#0b0b0b] overflow-hidden flex-shrink-0">
                          {imgUrl ? (
                            <div className="relative w-full h-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.18))] p-2">
                              <img
                                src={imgUrl}
                                alt={listing.title}
                                className="w-full h-full object-contain rounded-xl group-hover:scale-[1.03] transition-transform duration-700 ease-out"
                              />
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                              <div className="w-11 h-11 rounded-xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-gray-700" />
                              </div>
                              <span className="text-[10px] text-gray-700">No preview</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
                          <button
                            onClick={(e) => toggleLike(listing.id, e)}
                            className={`absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-md border transition-all duration-200 ${isLiked ? "bg-red-500/25 border-red-400/40 shadow-lg shadow-red-500/20" : "bg-black/45 border-white/[0.14] hover:bg-black/65 hover:border-white/25"}`}
                          >
                            <Heart className={`w-3.5 h-3.5 transition-all duration-200 ${isLiked ? "text-red-400 fill-red-400" : "text-gray-300"}`} />
                          </button>
                          {user && !isOwnListing && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setReportingAssetId(listing.id); setReportReason(""); setReportDescription(""); }}
                              className="absolute top-3 left-3 z-10 w-8 h-8 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-full backdrop-blur-md bg-black/45 border border-white/[0.14] hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-200"
                              title="Report this asset"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 hover:text-red-400"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                            </button>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 pb-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm border border-white/[0.1] text-[10px] text-gray-200 font-medium">{displayType}</span>
                              {/* Only show license badge when it's a real license (CC / Personal / Commercial) — hide the redundant "Paid" tag */}
                              {licenseBadge !== "Paid" && (
                                <span className={`px-2 py-0.5 rounded-md backdrop-blur-sm border text-[10px] font-medium ${licenseBadge === "CC" ? "bg-sky-500/20 border-sky-500/25 text-sky-300" : !isPaid ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-300" : "bg-black/60 border-white/[0.1] text-gray-300"}`}>{licenseBadge}</span>
                              )}
                            </div>
                            <span className={`text-sm font-bold tracking-tight drop-shadow-sm ${isPaid ? "text-white" : "text-emerald-400"}`}>{priceDisplay}</span>
                          </div>
                        </div>
                        {/* Body */}
                        <div className="p-4 flex flex-col flex-1">
                          <h3 className="text-[13.5px] font-semibold text-white/90 line-clamp-1 mb-1.5 group-hover:text-red-400 transition-colors duration-200">{listing.title}</h3>
                          <p className="text-[11.5px] text-gray-600 line-clamp-2 leading-[1.6] mb-4 flex-1">{listing.description || listing.category || "No description provided."}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            <span className="px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] text-gray-500">
                              {createdAtLabel}
                            </span>
                            {aiModel && (
                              <span className="px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] text-gray-500 truncate max-w-[170px]">
                                {aiModel}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mb-3.5">
                            <div className="w-[22px] h-[22px] flex-shrink-0 rounded-full bg-gradient-to-br from-red-500/30 to-rose-600/30 border border-white/[0.1] flex items-center justify-center">
                              <span className="text-[8px] font-bold text-red-300/90">{initials}</span>
                            </div>
                            <p className="text-[11px] text-gray-600 truncate min-w-0">
                              {aiModel && <span>via <span className="text-gray-500">{aiModel}</span> · </span>}
                              {originCreatorName ? (
                                <>
                                  by <span className="text-gray-400">@{originCreatorName}</span>
                                  {" · resold by "}
                                  <span className="text-gray-400">@{creatorName}</span>
                                </>
                              ) : (
                                <>by <span className="text-gray-400">@{creatorName}</span></>
                              )}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/assets/${listing.id}`); }} className="flex-1 py-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[12px] font-semibold hover:from-red-400 hover:to-red-500 active:scale-[0.97] transition-all shadow-md shadow-red-600/20">{isOwnListing ? "View" : "Buy"}</button>
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/remix?asset=${listing.id}`); }} className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[12px] text-gray-300 hover:bg-white/[0.09] hover:text-white hover:border-white/[0.16] active:scale-[0.97] transition-all">Remix</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Load more */}
              {!loading && hasMore && (
                <div className="mt-10 flex flex-col items-center gap-3">
                  <button
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="cursor-pointer px-6 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-sm font-medium text-gray-300 hover:bg-white/[0.08] hover:text-white hover:border-white/[0.16] active:scale-[0.97] transition-all"
                  >
                    Load More
                  </button>
                  <p className="text-[12px] text-gray-600">
                    Showing {pagedItems.length} of {gridItems.length}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MY COMMERCE ──────────────────────────────────────── */}
        {activeTab === "commerce" && (
          <div>
            {!user ? (
              /* Not logged in */
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="w-14 h-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center mb-4">
                  <ShoppingBag className="w-6 h-6 text-gray-700" />
                </div>
                <p className="text-gray-300 text-sm font-semibold mb-1.5">
                  Sign in to access My Commerce
                </p>
                <p className="text-gray-600 text-xs mb-5 max-w-xs">
                  Track your assets, publish to the marketplace, and earn from
                  your AI creations.
                </p>
                <button
                  onClick={() => router.push("/login?redirectTo=/marketplace")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-sm font-semibold hover:from-red-400 hover:to-red-500 transition-all shadow-lg shadow-red-600/20"
                >
                  Sign In
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3">
                  {commerceLoading
                    ? Array.from({ length: 2 }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-2xl bg-[#0f0f0f] border border-white/[0.06] p-4 animate-pulse"
                        >
                          <Skeleton className="h-8 w-8 rounded-xl bg-white/[0.05] mb-3" />
                          <Skeleton className="h-6 w-12 rounded-lg bg-white/[0.04] mb-1" />
                          <Skeleton className="h-3 w-20 rounded bg-white/[0.03]" />
                        </div>
                      ))
                    : stats.map(({ icon: Icon, label, value, color, bg }) => (
                        <div
                          key={label}
                          className="rounded-2xl bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.1] p-4 transition-all"
                        >
                          <div
                            className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-3`}
                          >
                            <Icon className={`w-4 h-4 ${color}`} />
                          </div>
                          <p className="text-2xl font-bold text-white tabular-nums mb-0.5">
                            {value}
                          </p>
                          <p className="text-[11px] text-gray-600">{label}</p>
                        </div>
                      ))}
                </div>

                {/* Upload banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-[#0f0f0f] border border-white/[0.06] px-5 py-4">
                  <div>
                    <p className="text-[14px] font-semibold text-white mb-0.5">
                      Upload New Asset
                    </p>
                    <p className="text-[12px] text-gray-500">
                      Upload content and get instant AI commerce intelligence
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      resetUpload();
                      setUploadOpen(true);
                    }}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[13px] font-semibold hover:from-red-400 hover:to-red-500 active:scale-[0.98] transition-all shadow-md shadow-red-600/20"
                  >
                    <Upload className="w-4 h-4" />
                    Upload
                  </button>
                </div>

                {uploadError && (
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[12px] text-red-300">{uploadError}</p>
                  </div>
                )}

                {/* My assets grid */}
                {commerceLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="rounded-2xl overflow-hidden bg-[#0f0f0f] border border-white/[0.05]"
                      >
                        <div className="aspect-[4/3] bg-white/[0.03] animate-pulse" />
                        <div className="p-3 space-y-2">
                          <Skeleton className="h-3.5 w-3/4 bg-white/[0.04] rounded" />
                          <Skeleton className="h-3 w-1/2 bg-white/[0.03] rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : myAssets.length === 0 && tempAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-white/[0.05] border-dashed">
                    <div className="w-12 h-12 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center mb-4">
                      <Upload className="w-5 h-5 text-gray-700" />
                    </div>
                    <p className="text-gray-400 text-sm font-semibold mb-1">
                      No assets yet
                    </p>
                    <p className="text-gray-600 text-xs mb-5">
                      Upload your first AI-generated asset to get started
                    </p>
                    <button
                      onClick={() => {
                        resetUpload();
                        setUploadOpen(true);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[13px] font-semibold hover:from-red-400 hover:to-red-500 transition-all shadow-md shadow-red-600/20"
                    >
                      Upload Now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {tempAnalysisItems.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          <p className="text-[13px] font-semibold text-blue-300">
                             Analizing
                          </p>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold bg-blue-500/20 text-blue-300">
                            {tempAnalysisItems.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {tempAnalysisItems
                            .slice(0, commerceVisibleCounts.analyzing)
                            .map(({ asset, pending }) => (
                            <CommerceAnalysisCard
                              key={asset.id}
                              asset={asset}
                              pending={pending}
                              isPublishing={publishingIds.has(asset.id)}
                              onQuickPublish={async () => {
                                const published =
                                  await handleQuickPublishAsset(asset.id, false, true);
                                if (published) openBrowseAfterPublish();
                              }}
                              onListAnyway={() => setCompareAssetId(asset.id)}
                              onDeepAnalysis={() =>
                                handleDeepAnalysisAsset(
                                  asset.id,
                                  asset.content_type ||
                                    pending?.meta.contentType,
                                  asset.storage_path,
                                  asset.title,
                                  asset.mime_type,
                                )
                              }
                              onDelete={() => handleDeleteCommerceAsset(asset)}
                              isDeleting={deletingIds.has(asset.id)}
                              storageUrl={storageUrl}
                            />
                          ))}
                        </div>
                        {commerceVisibleCounts.analyzing <
                          tempAnalysisItems.length && (
                          <div className="flex justify-center pt-1">
                            <button
                              onClick={() =>
                                setCommerceVisibleCounts((prev) => ({
                                  ...prev,
                                  analyzing:
                                    prev.analyzing +
                                    MY_COMMERCE_SECTION_PAGE_SIZE,
                                }))
                              }
                              className="px-4 py-2 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-blue-500/40 hover:bg-white/5 transition-all rounded-xl"
                            >
                              Load more
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Ready to List ── */}
                    {commerceBuckets.readyToList.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <p className="text-[13px] font-semibold text-emerald-300">
                            Ready to List
                          </p>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-500/20 text-emerald-300">
                            {commerceBuckets.readyToList.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {commerceBuckets.readyToList
                            .slice(0, commerceVisibleCounts.ready)
                            .map(
                            ({ asset, pending }) => (
                              <CommerceAnalysisCard
                                key={asset.id}
                                asset={asset}
                                pending={pending}
                                isPublishing={publishingIds.has(asset.id)}
                                onQuickPublish={async () => {
                                  const published =
                                    await handleQuickPublishAsset(asset.id, false, true);
                                  if (published) openBrowseAfterPublish();
                                }}
                                onListAnyway={() =>
                                  setCompareAssetId(asset.id)
                                }
                                onDeepAnalysis={() =>
                                  handleDeepAnalysisAsset(
                                    asset.id,
                                    asset.content_type ||
                                      pending?.meta.contentType,
                                    asset.storage_path,
                                    asset.title,
                                    asset.mime_type,
                                  )
                                }
                                onDelete={() => handleDeleteCommerceAsset(asset)}
                                isDeleting={deletingIds.has(asset.id)}
                                storageUrl={storageUrl}
                              />
                            ),
                          )}
                        </div>
                        {commerceVisibleCounts.ready <
                          commerceBuckets.readyToList.length && (
                          <div className="flex justify-center pt-1">
                            <button
                              onClick={() =>
                                setCommerceVisibleCounts((prev) => ({
                                  ...prev,
                                  ready:
                                    prev.ready + MY_COMMERCE_SECTION_PAGE_SIZE,
                                }))
                              }
                              className="px-4 py-2 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-emerald-500/40 hover:bg-white/5 transition-all rounded-xl"
                            >
                              Load more
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Needs Work ── */}
                    {commerceBuckets.needsWork.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                          <p className="text-[13px] font-semibold text-amber-300">
                            Needs Work
                          </p>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold bg-amber-500/20 text-amber-300">
                            {commerceBuckets.needsWork.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {commerceBuckets.needsWork
                            .slice(0, commerceVisibleCounts.needsWork)
                            .map(
                            ({ asset, pending }) => (
                              <CommerceAnalysisCard
                                key={asset.id}
                                asset={asset}
                                pending={pending}
                                isPublishing={publishingIds.has(asset.id)}
                                onQuickPublish={async () => {
                                  const published =
                                    await handleQuickPublishAsset(asset.id, false, true);
                                  if (published) openBrowseAfterPublish();
                                }}
                                onListAnyway={() =>
                                  setCompareAssetId(asset.id)
                                }
                                onDeepAnalysis={() =>
                                  handleDeepAnalysisAsset(
                                    asset.id,
                                    asset.content_type ||
                                      pending?.meta.contentType,
                                    asset.storage_path,
                                    asset.title,
                                    asset.mime_type,
                                  )
                                }
                                onDelete={() => handleDeleteCommerceAsset(asset)}
                                isDeleting={deletingIds.has(asset.id)}
                                storageUrl={storageUrl}
                              />
                            ),
                          )}
                        </div>
                        {commerceVisibleCounts.needsWork <
                          commerceBuckets.needsWork.length && (
                          <div className="flex justify-center pt-1">
                            <button
                              onClick={() =>
                                setCommerceVisibleCounts((prev) => ({
                                  ...prev,
                                  needsWork:
                                    prev.needsWork +
                                    MY_COMMERCE_SECTION_PAGE_SIZE,
                                }))
                              }
                              className="px-4 py-2 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-amber-500/40 hover:bg-white/5 transition-all rounded-xl"
                            >
                              Load more
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          FILTER DRAWER (mobile / < xl)
      ═══════════════════════════════════════════════ */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-[6px]"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 sm:w-80 bg-[#0d0d0d] border-r border-white/[0.08] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-gray-500" />
                <span className="text-[13px] font-semibold text-white">
                  Filters
                </span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.07] transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <SidebarContent />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          UPLOAD MODAL
      ═══════════════════════════════════════════════ */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => !uploading && setUploadOpen(false)}
          />

          <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[#0d0d0d] border border-white/[0.09] rounded-2xl shadow-2xl shadow-black/70">
            {/* Modal header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#0d0d0d] border-b border-white/[0.06]">
              <div>
                <p className="text-[15px] font-bold text-white">
                  Upload Content
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  Share your AI-generated content with the KAIZORA community
                </p>
              </div>
              {!uploading && (
                <button
                  onClick={() => setUploadOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.07] transition-all flex-shrink-0 ml-3"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <form onSubmit={handleUpload} className="p-6 lg:p-7">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="space-y-5 lg:col-span-7">
                  {/* Title */}
                  <FieldGroup label="Title" required>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="My Amazing AI Creation"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[13px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 focus:border-red-500/25 transition-all"
                    />
                  </FieldGroup>

                  {/* Description */}
                  <FieldGroup label="Description">
                    <div className="relative">
                      <textarea
                        value={uploadDesc}
                        onChange={(e) =>
                          setUploadDesc(e.target.value.slice(0, 1000))
                        }
                        placeholder="Tell us about your creation..."
                        rows={5}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[13px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 focus:border-red-500/25 transition-all resize-none"
                      />
                      <span className="absolute bottom-2.5 right-3 text-[10px] text-gray-700">
                        {uploadDesc.length}/1000
                      </span>
                    </div>
                  </FieldGroup>

                  {/* File upload */}
                  <FieldGroup label="File" required>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                        uploadFile
                          ? "border-red-500/30 bg-red-500/[0.06]"
                          : "border-white/[0.09] bg-white/[0.03] hover:border-white/[0.15] hover:bg-white/[0.05]"
                      }`}
                    >
                      <Upload
                        className={`w-4 h-4 flex-shrink-0 ${uploadFile ? "text-red-400" : "text-gray-600"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[13px] truncate ${uploadFile ? "text-white" : "text-gray-500"}`}
                        >
                          {uploadFile ? uploadFile.name : "Choose file"}
                        </p>
                        <p className="text-[10px] text-gray-700 mt-0.5">
                          Max size: 20 MB · Images: min {MIN_IMAGE_WIDTH}x{MIN_IMAGE_HEIGHT}
                        </p>
                      </div>
                      {uploadFile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadFile(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = "";
                            }
                          }}
                          className="w-5 h-5 flex items-center justify-center rounded-full bg-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.15] transition-all flex-shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (!f) {
                          setUploadFile(null);
                          setUploadFilePreview(null);
                          setUploadError("");
                          return;
                        }

                        try {
                          await validateUploadFile(f, uploadContentType);
                          setUploadFile(f);
                          setUploadFilePreview(URL.createObjectURL(f));
                          setUploadError("");
                        } catch (error: any) {
                          setUploadFile(null);
                          setUploadFilePreview(null);
                          setUploadError(
                            error?.message || "That file cannot be uploaded.",
                          );
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }
                      }}
                    />
                  </FieldGroup>

                  {/* Tags */}
                  <FieldGroup
                    label={`Tags (Max 10)${uploadTags.length > 0 ? ` · ${uploadTags.length}/10` : ""}`}
                  >
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={uploadTagInput}
                        onChange={(e) => setUploadTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                        placeholder="Add a tag..."
                        className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[13px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 transition-all"
                      />
                      <button
                        type="button"
                        onClick={addTag}
                        disabled={
                          !uploadTagInput.trim() || uploadTags.length >= 10
                        }
                        className="px-3.5 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-[13px] text-gray-300 hover:bg-white/[0.1] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>
                    {uploadTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {uploadTags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-medium"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {t}
                            <button
                              type="button"
                              onClick={() => removeTag(t)}
                              className="ml-0.5 text-red-400/60 hover:text-red-300 transition-colors"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </FieldGroup>
                </div>

                <div className="space-y-5 lg:col-span-5">
                  {/* Content Type */}
                  <FieldGroup label="Content Type" required>
                    <div className="relative">
                      <select
                        value={uploadContentType}
                        onChange={(e) => setUploadContentType(e.target.value)}
                        className="w-full px-3.5 py-2.5 pr-9 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[13px] text-gray-300 focus:outline-none focus:ring-1 focus:ring-red-500/30 appearance-none cursor-pointer transition-all hover:border-white/[0.14]"
                      >
                        {UPLOAD_CONTENT_TYPES.map((t) => (
                          <option key={t} value={t} className="bg-[#111]">
                            {t}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
                    </div>
                  </FieldGroup>

                  {/* AI Model */}
                  <FieldGroup label="AI Model Used" required>
                    <div className="relative">
                      <select
                        value={uploadAiModel}
                        onChange={(e) => setUploadAiModel(e.target.value)}
                        className="w-full px-3.5 py-2.5 pr-9 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[13px] text-gray-300 focus:outline-none focus:ring-1 focus:ring-red-500/30 appearance-none cursor-pointer transition-all hover:border-white/[0.14]"
                      >
                        <option value="" disabled className="bg-[#111]">
                          Select AI model
                        </option>
                        {AI_MODELS.map((m) => (
                          <option key={m} value={m} className="bg-[#111]">
                            {m}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
                    </div>
                  </FieldGroup>

                  {/* License + Free toggle */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FieldGroup label="License Type" required>
                      <div className="relative">
                        <select
                          value={uploadLicense}
                          onChange={(e) => setUploadLicense(e.target.value)}
                          className="w-full px-3 py-2.5 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[12px] text-gray-300 focus:outline-none focus:ring-1 focus:ring-red-500/30 appearance-none cursor-pointer transition-all hover:border-white/[0.14]"
                        >
                          {getLicenseOptions().map((l) => (
                            <option
                              key={l.value}
                              value={l.value}
                              className="bg-[#111]"
                            >
                              {l.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none" />
                      </div>
                    </FieldGroup>

                    <FieldGroup label="Pricing">
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <div
                            onClick={() => setUploadFree((p) => !p)}
                            className={`relative w-9 h-5 rounded-full border transition-all ${uploadFree ? "bg-red-500 border-red-500" : "bg-white/[0.07] border-white/[0.12]"}`}
                          >
                            <div
                              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${uploadFree ? "left-[18px]" : "left-0.5"}`}
                            />
                          </div>
                          <span className="text-[12px] text-gray-400">
                            Free Content
                          </span>
                        </label>
                        {!uploadFree && (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-[13px]">
                              $
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={uploadPrice}
                              onChange={(e) => setUploadPrice(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-6 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[13px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 transition-all"
                            />
                          </div>
                        )}
                      </div>
                    </FieldGroup>
                  </div>

                  {/* Year */}
                  <FieldGroup label="Year Created (Optional)">
                    <input
                      type="number"
                      min="2020"
                      max={new Date().getFullYear()}
                      value={uploadYear}
                      onChange={(e) => setUploadYear(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-red-500/30 transition-all"
                    />
                  </FieldGroup>

                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
                    <p className="text-[11px] font-semibold text-gray-300 mb-1">
                      Upload checklist
                    </p>
                    <p className="text-[11px] text-gray-600">
                      Set an AI model, choose a license, and add clear tags for
                      better marketplace discovery.
                    </p>
                  </div>
                </div>
              </div>

              {/* Error */}
              {uploadError && (
                <div className="mt-5 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-red-300">{uploadError}</p>
                </div>
              )}

              {/* Submit */}
              <div className="pt-5 mt-5 border-t border-white/[0.06]">
                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full py-3 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[13px] font-semibold hover:from-red-400 hover:to-red-500 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload Content
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          COMPARE METADATA MODAL — auto-opens when analysis is ready
      ═══════════════════════════════════════════════ */}
      {compareAssetId &&
        (() => {
          const compareAsset = [...tempAssets, ...myAssets].find(
            (a) => a.id === compareAssetId,
          );
          const isCompareTempAsset = tempAssets.some(
            (asset) => asset.id === compareAssetId,
          );
          const pending = pendingAnalyses[compareAssetId];
          if (!pending) return null;
          const { meta, profile } = pending;

          // ── Resolve asset image for modal preview ────────────────────────
          const modalImageUrl = isCompareTempAsset
            ? tempStorageUrl(
                compareAsset?.thumbnail_path || compareAsset?.storage_path,
              )
            : storageUrl(
                (compareAsset as any)?.thumbnail_path ||
                  compareAsset?.storage_path,
              );
          const resolvedModalImage =
            (meta.preview && !meta.preview.startsWith("blob:") ? meta.preview : null) ||
            modalImageUrl;
          const isImageType =
            !meta.contentType ||
            meta.contentType?.toLowerCase() === "image" ||
            meta.contentType?.toLowerCase() === "template";

          // ── Price calculations (market-aware) ───────────────────────────
          const myPriceStr = meta.isFree
            ? "Free"
            : `$${((meta.priceCents || 0) / 100).toFixed(2)}`;

          // Market pricing from the agent (fires when modal opens)
          const marketPricing = comparePricing.data?.pricing ?? null;
          const marketContext = comparePricing.data?.market_context ?? null;
          const marketPriceCents: number | null = marketPricing?.recommended_price_cents ?? null;

          let aiPriceNode: React.ReactNode;
          if (comparePricing.loading) {
            aiPriceNode = (
              <span className="flex items-center gap-1.5 text-gray-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Analyzing market…
              </span>
            );
          } else if (marketPriceCents !== null) {
            aiPriceNode = (
              <div className="space-y-1">
                <span className="text-emerald-300 font-bold text-[13px]">
                  ${(marketPriceCents / 100).toFixed(2)}
                </span>
                {marketPricing?.pricing_band && (
                  <span className="ml-1.5 text-[10px] text-gray-500 capitalize">
                    · {marketPricing.pricing_band.replace("_", " ")}
                  </span>
                )}
                {marketContext && marketContext.sample_count > 0 && (
                  <p className="text-[10px] text-gray-600 leading-snug">
                    Based on {marketContext.sample_count} similar assets
                    {marketContext.proven_sample_count > 0
                      ? ` · ${marketContext.proven_sample_count} confirmed sales`
                      : ""}
                    {marketContext.median_price_cents
                      ? ` · market median $${(marketContext.median_price_cents / 100).toFixed(2)}`
                      : ""}
                  </p>
                )}
                {marketPricing?.pricing_strategy && (
                  <p className="text-[10px] text-gray-500 leading-snug italic">
                    {marketPricing.pricing_strategy}
                  </p>
                )}
              </div>
            );
          } else {
            // Fallback to band-based estimate
            const priceBandMap: Record<string, number> = {
              free: 0, "micro($1-5)": 300, "starter($5-15)": 999,
              "standard($15-50)": 2999, "premium($50-200)": 9900, "enterprise($200+)": 29900,
            };
            const bandCents = profile?.suggested_price_band
              ? (priceBandMap[profile.suggested_price_band] ?? null)
              : null;
            aiPriceNode = bandCents !== null
              ? `$${(bandCents / 100).toFixed(2)} · ${profile?.suggested_price_band}`
              : "—";
          }

          const isPublishing = publishingIds.has(compareAssetId);

          // ── AI fills empty fields ────────────────────────────────────────
          // Title: if user left empty, AI fills from content_description excerpt
          const myTitle = meta.title?.trim() || "";
          const aiTitle = myTitle || profile?.top_strength || profile?.content_description?.split(".")[0] || "Untitled";
          // Description: use listing_description as AI's copywriting version; my side falls back to content_description if empty
          const myDesc = meta.desc?.trim() || "";
          const aiDesc = profile?.listing_description || profile?.content_description || "—";
          // License: validate AI suggestion against real active licenses.
          const licenseOptions = getLicenseOptions();
          const defaultLicense = getDefaultLicenseSlug();
          const validLicenses = licenseOptions.map((l) => l.value);
          const aiLicenseRaw = profile?.suggested_license_type?.toLowerCase()?.trim() ?? "";
          const aiLicense = validLicenses.includes(aiLicenseRaw) ? aiLicenseRaw : defaultLicense;
          const aiLicenseLabel =
            licenseOptions.find((l) => l.value === aiLicense)?.label ?? aiLicense;
          const myLicenseLabel =
            licenseOptions.find((l) => l.value === meta.license)?.label ?? meta.license;

          const Field = ({
            label,
            my,
            ai,
          }: {
            label: string;
            my: React.ReactNode;
            ai: React.ReactNode;
          }) => (
            <div className="grid grid-cols-2 gap-3 py-3 border-b border-white/[0.05]">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-gray-600 mb-1">
                  {label}
                </p>
                <div className="text-[11.5px] text-gray-200 break-words">
                  {my || <span className="text-gray-600">—</span>}
                </div>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wider text-red-400/70 mb-1">
                  {label}
                </p>
                <div className="text-[11.5px] text-gray-200 break-words">
                  {ai || <span className="text-gray-600">—</span>}
                </div>
              </div>
            </div>
          );

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4"
              data-lenis-prevent
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <div
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
                onClick={() => !isPublishing && setCompareAssetId(null)}
              />
              <div
                className="relative flex h-[90dvh] max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden bg-[#0d0d0d] border border-white/[0.09] rounded-2xl shadow-2xl shadow-black/70"
                data-lenis-prevent
              >
                {isPublishing && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/65 backdrop-blur-sm">
                    <div className="relative">
                      <div className="h-12 w-12 rounded-full border-4 border-white/10 border-t-red-500 animate-spin" />
                      <Sparkles className="absolute inset-0 m-auto h-4 w-4 text-red-300" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-white">
                        Publishing your asset...
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Making it public and opening Browse next.
                      </p>
                    </div>
                  </div>
                )}

                {/* Header */}
                <div className="flex flex-shrink-0 items-center justify-between px-5 py-4 bg-[#0d0d0d] border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    {/* Asset thumbnail mini */}
                    {resolvedModalImage && isImageType ? (
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/[0.08] bg-white/[0.03]">
                        <img
                          src={resolvedModalImage}
                          alt={myTitle || "Asset"}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-4 h-4 text-gray-700" />
                      </div>
                    )}
                    <div>
                      <p className="text-[13px] font-bold text-white leading-snug">
                        {myTitle || "Untitled Asset"}
                      </p>
                      <p className="text-[10px] text-emerald-400 font-medium">
                        Ready to publish · AI analysis complete
                      </p>
                    </div>
                  </div>
                  {!isPublishing && (
                    <button
                      onClick={() => setCompareAssetId(null)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.07] transition-all flex-shrink-0 ml-3"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                  data-lenis-prevent
                  onWheel={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                >
                  {/* Asset image — full width preview */}
                  {resolvedModalImage && isImageType && (
                    <div className="relative w-full aspect-[16/7] overflow-hidden bg-[#0b0b0b]">
                      <img
                        src={resolvedModalImage}
                        alt={myTitle || "Asset"}
                        className={`w-full h-full ${getTempPreviewFitMode(meta)}`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-transparent to-transparent pointer-events-none" />
                      {/* Score badge overlaid */}
                      {profile?.commerce_readiness_score !== undefined && (
                        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 backdrop-blur-sm">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span className="text-[13px] font-bold text-emerald-300 tabular-nums">
                            {profile.commerce_readiness_score}%
                          </span>
                          <span className="text-[10px] text-emerald-400/70">readiness</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Column headers */}
                  <div className="grid grid-cols-2 gap-3 px-5 pt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      <p className="text-[11px] font-semibold text-gray-300">
                        My data
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-red-400" />
                      <p className="text-[11px] font-semibold text-red-300">
                        AI suggested
                      </p>
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="px-5 pb-4">
                    <Field label="Title" my={myTitle || <span className="italic text-gray-600">empty</span>} ai={aiTitle} />
                    <Field
                      label="Description"
                      my={myDesc || <span className="italic text-gray-600">empty — AI will fill</span>}
                      ai={aiDesc}
                    />
                    <Field
                      label="Tags"
                      my={
                        meta.tags?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {meta.tags.map((t: string) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[11px] text-gray-300"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : <span className="italic text-gray-600">none — AI will fill</span>
                      }
                      ai={
                        profile?.suggested_tags?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {profile.suggested_tags
                              .slice(0, 8)
                              .map((t: string) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-[11px] text-red-200"
                                >
                                  {t}
                                </span>
                              ))}
                          </div>
                        ) : null
                      }
                    />
                    <Field
                      label="Category"
                      my={null}
                      ai={profile?.suggested_categories?.[0]}
                    />
                    <Field label="Price" my={myPriceStr} ai={aiPriceNode} />
                    <Field
                      label="License"
                      my={myLicenseLabel || meta.license}
                      ai={aiLicenseLabel}
                    />
                    <Field label="AI model" my={meta.aiModel || <span className="italic text-gray-600">not set</span>} ai={meta.aiModel || <span className="italic text-gray-600">not set</span>} />
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex flex-shrink-0 flex-col sm:flex-row gap-2 px-5 py-4 bg-[#0d0d0d] border-t border-white/[0.06]">
                  <button
                    disabled={isPublishing}
                    onClick={async () => {
                      const id = compareAssetId;
                      if (!id) return;
                      const published = await handleListAnywayAsset(id, true);
                      if (published) openBrowseAfterPublish();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[12.5px] font-semibold text-gray-200 hover:bg-white/[0.09] hover:text-white disabled:opacity-50 transition-all"
                  >
                    {isPublishing ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Publishing...
                      </span>
                    ) : (
                      "Use my data"
                    )}
                  </button>
                  <button
                    disabled={isPublishing}
                    onClick={async () => {
                      const id = compareAssetId;
                      if (!id) return;
                      const published = await handleQuickPublishAsset(id, true, true);
                      if (published) openBrowseAfterPublish();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[11.5px] font-semibold hover:from-red-400 hover:to-red-500 disabled:opacity-60 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-red-600/20"
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Use AI suggestions
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ═══════════════════════════════════════════════
          MARKETPLACE ASSISTANT
      ═══════════════════════════════════════════════ */}
      <MarketplaceAssistant
        listings={listings}
        myAssets={myAssets}
        myListings={myListings}
        bundles={bundles}
        activeTab={activeTab}
        isLoggedIn={!!user}
      />

      {/* ── Report Toast ── */}
      {reportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-[#111] border border-white/10 rounded-xl text-sm text-white shadow-2xl">
          {reportToast}
        </div>
      )}

      {/* ── Report Modal ── */}
      {reportingAssetId && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setReportingAssetId(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[#0e0e0e] border border-white/10 rounded-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-light">Report / DMCA</h3>
                <button onClick={() => setReportingAssetId(null)} className="text-gray-600 hover:text-white transition-colors cursor-pointer">✕</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Reason *</label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg text-white text-sm py-2.5 px-3 focus:outline-none focus:border-white/20"
                  >
                    <option value="" className="bg-black">Select a reason...</option>
                    <option value="copyright" className="bg-black">Copyright / DMCA Violation</option>
                    <option value="nudity" className="bg-black">Nudity / Explicit Content</option>
                    <option value="violence" className="bg-black">Violence / Gore</option>
                    <option value="hate_speech" className="bg-black">Hate Speech / Discrimination</option>
                    <option value="spam" className="bg-black">Spam / Misleading Content</option>
                    <option value="other" className="bg-black">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Description (optional)</label>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    rows={3}
                    placeholder="Provide additional details..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg text-white text-sm py-2.5 px-3 focus:outline-none focus:border-white/20 resize-none placeholder-gray-700"
                  />
                </div>
                <p className="text-xs text-gray-600">False reports may result in account suspension. Our team reviews all reports within 48 hours.</p>
                <button
                  onClick={handleReport}
                  disabled={!reportReason || reportLoading}
                  className="w-full py-2.5 rounded-xl text-sm bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {reportLoading ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tiny shared components ───────────────────────────────────────────────────

const SUPABASE_STORAGE = process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/object/public/assets/";

function BundleCollage({ urls }: { urls: string[] }) {
  const filled = [...urls, ...Array(4).fill(null)].slice(0, 4);
  if (urls.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0b0b0b]">
        <ShoppingBag className="w-8 h-8 text-gray-700" />
      </div>
    );
  }
  if (urls.length === 1) {
    return <img src={urls[0]} alt="" className="w-full h-full object-cover" />;
  }
  return (
    <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5">
      {filled.map((url, i) =>
        url ? (
          <img key={i} src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div key={i} className="w-full h-full bg-[#111]" />
        )
      )}
    </div>
  );
}

function BundleCard({ bundle }: { bundle: any }) {
  const collageUrls: string[] = bundle.collage_urls || [];
  const assetCount = bundle.asset_ids?.length || 0;
  const isPaid = bundle.total_price_cents > 0;
  const priceDisplay = isPaid ? `$${(bundle.total_price_cents / 100).toFixed(2)}` : "Free";

  return (
    <article
      onClick={() => window.location.href = `/marketplace/bundles/${bundle.id}`}
      className="group relative rounded-2xl overflow-hidden bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.13] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/60 transition-all duration-300 cursor-pointer flex flex-col"
    >
      {/* Collage — same aspect ratio as asset cards */}
      <div className="relative aspect-[4/3] bg-[#0b0b0b] overflow-hidden flex-shrink-0">
        <BundleCollage urls={collageUrls} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
        {/* Bottom row: badges + price */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-red-500/90 backdrop-blur-sm text-[10px] text-white font-semibold uppercase tracking-wide flex items-center gap-1">
              <ShoppingBag className="w-2.5 h-2.5" />
              Bundle
            </span>
            <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm border border-white/[0.1] text-[10px] text-gray-300">
              {assetCount} assets
            </span>
          </div>
          <span className={`text-sm font-bold tracking-tight drop-shadow-sm ${isPaid ? "text-white" : "text-emerald-400"}`}>
            {priceDisplay}
          </span>
        </div>
      </div>

      {/* Body — identical structure to asset cards */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-[13.5px] font-semibold text-white/90 line-clamp-1 mb-1.5 group-hover:text-red-400 transition-colors duration-200">
          {bundle.name}
        </h3>
        <p className="text-[11.5px] text-gray-600 line-clamp-2 leading-[1.6] mb-4 flex-1">
          {bundle.description || `${assetCount} assets · ${bundle.bundle_type?.replace(/_/g, " ") || "bundle"}`}
        </p>
        <div className="flex items-center gap-2 mb-3.5">
          <div className="w-[22px] h-[22px] flex-shrink-0 rounded-full bg-gradient-to-br from-red-500/30 to-rose-600/30 border border-white/[0.1] flex items-center justify-center">
            <ShoppingBag className="w-2.5 h-2.5 text-red-300/90" />
          </div>
          <p className="text-[11px] text-gray-600 truncate min-w-0">
            <span className="text-gray-500">{assetCount} assets</span> · curated bundle
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={e => { e.stopPropagation(); window.location.href = `/marketplace/bundles/${bundle.id}`; }}
            className="flex-1 py-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[12px] font-semibold hover:from-red-400 hover:to-red-500 active:scale-[0.97] transition-all shadow-md shadow-red-600/20"
          >
            Buy Bundle
          </button>
          <button
            onClick={e => { e.stopPropagation(); window.location.href = `/marketplace/bundles/${bundle.id}`; }}
            className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[12px] text-gray-300 hover:bg-white/[0.09] hover:text-white hover:border-white/[0.16] active:scale-[0.97] transition-all"
          >
            Preview
          </button>
        </div>
      </div>
    </article>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
        active
          ? "bg-white/[0.09] text-white shadow-sm"
          : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-gray-600 mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-gray-300 px-3 py-2 pr-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500/25 focus:border-red-500/20 appearance-none cursor-pointer transition-all hover:bg-white/[0.06] hover:border-white/[0.13]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#111]">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600 pointer-events-none" />
    </div>
  );
}

// ─── Smart filter dropdown (button + popover + click-outside) ───────────────
function FilterDropdown({
  label,
  display,
  active,
  width = "w-52",
  children,
}: {
  label: string;
  display: string;
  active?: boolean;
  width?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 pl-3 pr-2.5 py-2 rounded-xl border text-[12.5px] whitespace-nowrap transition-all ${
          active
            ? "bg-red-500/10 border-red-500/30 text-red-300"
            : open
              ? "bg-white/[0.07] border-white/[0.16] text-gray-200"
              : "bg-white/[0.04] border-white/[0.08] text-gray-400 hover:border-white/[0.15] hover:text-gray-200"
        }`}
      >
        <span className="text-gray-500 font-medium">{label}</span>
        <span className="font-semibold">{display}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          className={`absolute left-0 mt-2 ${width} bg-[#101010] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/60 z-40 overflow-hidden`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function SelectDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  const isDefault = options[0]?.value === value;
  return (
    <FilterDropdown
      label={label}
      display={current?.label || "—"}
      active={!isDefault}
    >
      {(close) => (
        <div className="py-1">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value);
                close();
              }}
              className={`flex items-center justify-between w-full px-3 py-2 text-[12.5px] text-left transition-colors ${
                o.value === value
                  ? "text-red-300 bg-red-500/[0.07]"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              {o.label}
              {o.value === value && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </FilterDropdown>
  );
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = query.trim()
    ? options.filter((t) => t.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  return (
    <FilterDropdown
      label={label}
      display={selected.length ? `${selected.length} selected` : "Any"}
      active={selected.length > 0}
      width="w-64"
    >
      {() => (
        <div>
          <div className="p-2 border-b border-white/[0.07]">
            <input
              type="text"
              autoFocus
              placeholder={`Search ${options.length} tags...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-white placeholder-gray-600 focus:outline-none focus:border-red-500/30"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1" data-lenis-prevent>
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-gray-600">
                No tags match
              </div>
            )}
            {filtered.map((t) => {
              const on = selected.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => onToggle(t)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 text-[12.5px] text-left transition-colors ${
                    on
                      ? "text-red-300"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      on ? "bg-red-500 border-red-500" : "border-white/20"
                    }`}
                  >
                    {on && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="truncate">{t}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button
              onClick={onClear}
              className="w-full px-3 py-2 text-[11px] font-medium text-gray-500 hover:text-red-300 border-t border-white/[0.07] transition-colors"
            >
              Clear tags
            </button>
          )}
        </div>
      )}
    </FilterDropdown>
  );
}

function Chip({
  label,
  onRemove,
  accent,
}: {
  label: string;
  onRemove: () => void;
  accent?: boolean;
}) {
  return (
    <span
      onClick={onRemove}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer transition-all ${
        accent
          ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15"
          : "bg-white/[0.05] border-white/[0.09] text-gray-400 hover:border-white/[0.17] hover:text-gray-200"
      }`}
    >
      {label}
      <X className="w-2.5 h-2.5 flex-shrink-0" />
    </span>
  );
}

function FieldGroup({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11.5px] font-semibold text-gray-400 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function EmptyState({
  activeFilterCount,
  onClear,
}: {
  activeFilterCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="w-14 h-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center mb-4">
        <Search className="w-6 h-6 text-gray-700" />
      </div>
      <p className="text-gray-300 text-sm font-semibold mb-1">
        No assets found
      </p>
      <p className="text-gray-600 text-xs mb-5 max-w-xs">
        Try adjusting your filters or search with different keywords.
      </p>
      {activeFilterCount > 0 && (
        <button
          onClick={onClear}
          className="text-[12px] text-red-400 hover:text-red-300 bg-red-500/8 hover:bg-red-500/12 border border-red-500/15 px-4 py-2 rounded-xl transition-all"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

function CommerceSection({
  icon: Icon,
  title,
  description,
  accent,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: "emerald" | "amber" | "blue" | "red";
  children: React.ReactNode;
}) {
  const accentClasses = {
    emerald: "text-emerald-300 border-emerald-500/20 bg-emerald-500/10",
    amber: "text-amber-300 border-amber-500/20 bg-amber-500/10",
    blue: "text-blue-300 border-blue-500/20 bg-blue-500/10",
    red: "text-red-300 border-red-500/20 bg-red-500/10",
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div
              className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${accentClasses[accent]}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-white">
              {title}
            </h2>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-gray-500">
            {description}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function CommerceAnalysisCard({
  asset,
  pending,
  isPublishing,
  isDeleting,
  onQuickPublish,
  onListAnyway,
  onDeepAnalysis,
  onDelete,
  storageUrl,
}: {
  asset: ListingAssetRecord;
  pending: CommerceBucketItem["pending"];
  isPublishing: boolean;
  isDeleting: boolean;
  onQuickPublish: () => void;
  onListAnyway: () => void;
  onDeepAnalysis: () => void;
  onDelete: () => void;
  storageUrl: (path?: string | null) => string | null;
}) {
  if (!pending) return null;

  const { analyzing, profile, meta, startedAtMs } = pending;
  const score = profile?.commerce_readiness_score ?? 0;
  const isReady = score >= 60;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const resolvedUrl = asset.is_temp
    ? `${SUPABASE_URL}/storage/v1/object/public/asset-temp/${asset.storage_path}`
    : storageUrl(asset.thumbnail_path || asset.storage_path);
  // Use meta.preview only if it's not a dead blob URL
  const previewUrl =
    meta.preview && !meta.preview.startsWith("blob:") ? meta.preview : null;
  const imageUrl = previewUrl || resolvedUrl;
  // Dedicated audio src — always points directly to the file (never uses thumbnail_path)
  const audioSrc = asset.is_temp
    ? asset.storage_path
      ? `${SUPABASE_URL}/storage/v1/object/public/asset-temp/${asset.storage_path}`
      : null
    : storageUrl(asset.storage_path);

  // Score ring color
  const scoreColor = isReady
    ? "text-emerald-400"
    : score >= 45
      ? "text-amber-400"
      : "text-red-400";
  const scoreBorder = isReady
    ? "border-emerald-500/30"
    : score >= 45
      ? "border-amber-500/30"
      : "border-red-500/30";
  const scoreBg = isReady
    ? "bg-emerald-500/10"
    : score >= 45
      ? "bg-amber-500/10"
      : "bg-red-500/10";
  const [elapsedNowMs, setElapsedNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!analyzing) return;

    setElapsedNowMs(Date.now());
    const timer = window.setInterval(() => {
      setElapsedNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [analyzing]);

  const elapsedLabel =
    analyzing && startedAtMs
      ? formatElapsedAnalysisTime(elapsedNowMs - startedAtMs)
      : null;

  return (
    <div
      className={`rounded-2xl overflow-hidden bg-[#0f0f0f] border transition-all flex flex-col ${
        analyzing
          ? "border-white/[0.08]"
          : isReady
            ? "border-emerald-500/20"
            : "border-amber-500/20"
      }`}
    >
      {/* ── Thumbnail ── */}
      <div className="relative aspect-[16/9] bg-[#0b0b0b] overflow-hidden flex-shrink-0">
        {meta.contentType?.toLowerCase() === "video" &&
        !asset.thumbnail_path &&
        imageUrl ? (
          <video
            src={imageUrl}
            className="w-full h-full object-cover"
            controls
            playsInline
            autoPlay
            muted
            onCanPlay={(e) => {
              (e.target as HTMLVideoElement).pause();
            }}
          />
        ) : meta.contentType?.toLowerCase() === "audio" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-4">
            <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
              <svg
                className="w-6 h-6 text-gray-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
              </svg>
            </div>
            <span className="text-[11px] text-gray-500 line-clamp-1 text-center">
              {meta.title}
            </span>
            <audio
              src={audioSrc ?? undefined}
              controls
              preload="metadata"
              className="w-full h-8"
              style={{ colorScheme: "dark" }}
            />
          </div>
        ) : meta.contentType?.toLowerCase() === "text" ||
          meta.contentType?.toLowerCase() === "pdf" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>
            <span className="text-[10px] text-gray-700">{meta.title}</span>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={meta.title}
            className={`w-full h-full ${getTempPreviewFitMode(meta)}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-gray-800" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

        {/* Analyzing overlay */}
        {analyzing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-[2px]">
            <div className="w-9 h-9 rounded-full border-[3px] border-white/10 border-t-red-500 animate-spin" />
            <span className="text-[10px] text-white/60 font-medium tracking-wide">
              Analyzing...
            </span>
            {elapsedLabel && (
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium tabular-nums text-white/75">
                {elapsedLabel}
              </span>
            )}
          </div>
        )}

        {/* Status badge */}
        {!analyzing && profile && (
          <span
            className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border backdrop-blur-sm ${
              isReady
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                : "bg-amber-500/20 border-amber-500/30 text-amber-300"
            }`}
          >
            {isReady ? (
              <CheckCircle2 className="w-2.5 h-2.5" />
            ) : (
              <AlertCircle className="w-2.5 h-2.5" />
            )}
            {isReady ? "Ready to List" : "Needs Work"}
          </span>
        )}

        {/* Score pill on image bottom-right */}
        {!analyzing && profile && (
          <div
            className={`absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-xl border backdrop-blur-sm ${scoreBg} ${scoreBorder}`}
          >
            <span
              className={`text-[14px] font-bold tabular-nums ${scoreColor}`}
            >
              {score}%
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting || isPublishing}
          className="absolute top-2.5 right-2.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/45 text-gray-300 backdrop-blur-sm transition-all hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Delete asset"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        {/* Title + content type */}
        <div className="flex items-start gap-2">
          <p className="text-[13px] font-semibold text-white/90 line-clamp-1 flex-1 leading-snug">
            {meta.title}
          </p>
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[9px] text-gray-500 capitalize mt-0.5">
            {meta.contentType}
          </span>
        </div>

        {/* ── Analyzing skeleton ── */}
        {analyzing && (
          <div className="space-y-2 mt-1">
            {elapsedLabel && (
              <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tabular-nums text-white/70">
                Time elapsed: {elapsedLabel}
              </div>
            )}
            <div className="h-2 rounded-full bg-white/[0.05] animate-pulse" />
            <div className="h-2 w-5/6 rounded-full bg-white/[0.04] animate-pulse" />
            <div className="h-2 w-3/4 rounded-full bg-white/[0.03] animate-pulse" />
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-5 rounded-lg bg-white/[0.04] animate-pulse"
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Analysis result ── */}
        {!analyzing && profile && (
          <>
            {/* Content description */}
            {profile.content_description && (
              <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">
                {profile.content_description}
              </p>
            )}

            {/* Next action for needs-work */}
            {!isReady && profile.recommended_next_commerce_action && (
              <p className="text-[10px] text-amber-400/70 line-clamp-2 leading-relaxed border-t border-white/[0.05] pt-2">
                {profile.recommended_next_commerce_action}
              </p>
            )}

            {/* Buttons */}
            <div className="flex gap-2 mt-auto pt-1">
              {isReady ? (
                <>
                  <button
                    onClick={onQuickPublish}
                    disabled={isPublishing || isDeleting}
                    className="flex-1 py-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[11px] font-semibold hover:from-red-400 hover:to-red-500 disabled:opacity-60 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-red-600/20"
                  >
                    {isPublishing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {isPublishing ? "Publishing..." : "Quick Publish"}
                  </button>
                  <button
                    onClick={onListAnyway}
                    disabled={isPublishing || isDeleting}
                    className="px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[11px] text-gray-500 hover:text-gray-200 hover:bg-white/[0.09] disabled:opacity-50 transition-all"
                  >
                    My Data
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onDeepAnalysis}
                    disabled={isDeleting}
                    className="flex-1 py-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[11px] font-semibold hover:from-red-400 hover:to-red-500 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-red-600/20"
                  >
                    <Sparkles className="w-3 h-3" />
                    Deep Analysis
                  </button>
                  <button
                    onClick={onListAnyway}
                    disabled={isPublishing || isDeleting}
                    className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[11px] text-gray-300 hover:bg-white/[0.09] hover:text-white disabled:opacity-50 transition-all flex items-center justify-center"
                  >
                    {isPublishing ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        Publishing...
                      </>
                    ) : (
                      "List Anyway"
                    )}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CommerceAssetCard({
  asset,
  badgeLabel,
  badgeTone,
  actionLabel,
  onCardClick,
  onAction,
  storageUrl,
}: {
  asset: ListingAssetRecord;
  badgeLabel: string;
  badgeTone: "emerald" | "amber" | "blue";
  actionLabel?: string;
  onCardClick: () => void;
  onAction?: () => void;
  storageUrl: (path?: string | null) => string | null;
}) {
  const imageUrl = storageUrl(asset.thumbnail_path || asset.storage_path);
  // Dedicated audio src — always points directly to the file, never thumbnail_path
  const audioSrc = storageUrl(asset.storage_path);
  const badgeClasses = {
    emerald: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300",
    amber: "bg-amber-500/15 border-amber-500/25 text-amber-300",
    blue: "bg-blue-500/15 border-blue-500/25 text-blue-300",
  };

  return (
    <div className="group rounded-2xl overflow-hidden bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.13] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/50 transition-all">
      <div
        className="relative aspect-[4/3] bg-[#0b0b0b] overflow-hidden cursor-pointer"
        onClick={onCardClick}
      >
        {asset.content_type === "video" && !asset.thumbnail_path && imageUrl ? (
          <video
            src={imageUrl}
            className="w-full h-full object-cover"
            controls
            playsInline
            autoPlay
            muted
            onCanPlay={(e) => {
              (e.target as HTMLVideoElement).pause();
            }}
          />
        ) : asset.content_type === "audio" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-4">
            <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
              <svg
                className="w-6 h-6 text-gray-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
              </svg>
            </div>
            <span className="text-[11px] text-gray-500 line-clamp-1 text-center">
              {asset.title}
            </span>
            <audio
              src={audioSrc ?? undefined}
              controls
              preload="metadata"
              className="w-full h-8"
              style={{ colorScheme: "dark" }}
            />
          </div>
        ) : asset.content_type === "text" || asset.content_type === "pdf" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>
            <span className="text-[10px] text-gray-700">{asset.title}</span>
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={asset.title}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-gray-800" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        <span
          className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-medium border backdrop-blur-sm ${badgeClasses[badgeTone]}`}
        >
          {badgeLabel}
        </span>
      </div>
      <div className="p-3">
        <p
          className="text-[13px] font-medium text-white/85 line-clamp-1 group-hover:text-red-400 transition-colors cursor-pointer"
          onClick={onCardClick}
        >
          {asset.title || "Untitled"}
        </p>
        <p className="text-[11px] text-gray-600 mt-0.5 capitalize">
          {asset.content_type || "asset"}
        </p>
        {actionLabel && onAction && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className="mt-2.5 w-full py-2 rounded-xl bg-white/[0.05] border border-white/[0.09] text-[11px] text-gray-300 hover:bg-red-500/10 hover:border-red-500/25 hover:text-red-300 transition-all flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3 h-3" />
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
  const logMarketplaceUpload = (
    event: string,
    payload?: Record<string, unknown>,
  ) => {
    if (!MARKETPLACE_UPLOAD_DEBUG) return;
    if (payload) {
      console.info(`[marketplace][upload] ${event}`, payload);
      return;
    }
    console.info(`[marketplace][upload] ${event}`);
  };
