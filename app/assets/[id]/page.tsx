"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { trackDownload } from "@/lib/usageTracking";
import {
  ArrowLeft,
  Download,
  Music,
  ImageIcon,
  CheckCircle,
  XCircle,
  ShoppingCart,
  User,
  ArrowRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ParentAssetCard from "../../components/ParentAssetCard";
import { getLicenseRule } from "@/lib/licenses";
export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const assetId = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<any | null>(null);
  const [metadata, setMetadata] = useState<any | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInCart, setIsInCart] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [availableLicenses, setAvailableLicenses] = useState<any[]>([]);
  const [selectedLicense, setSelectedLicense] = useState<any>(null);
  const [loadingLicenses, setLoadingLicenses] = useState(true);
  const [ownedLicenseIds, setOwnedLicenseIds] = useState<string[]>([]);
  const [ownsAsset, setOwnsAsset] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<any | null>(null);
  const [originCreatorProfile, setOriginCreatorProfile] = useState<any | null>(
    null,
  );

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  async function checkCartStatus() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user || !assetId) return;

    const { data: cartItem } = await supabase
      .from("cart")
      .select("id")
      .eq("user_id", data.user.id)
      .eq("asset_id", assetId)
      .single();

    setIsInCart(!!cartItem);
  }

  function storageUrl(path?: string | null) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }

  useEffect(() => {
    if (!assetId) return;
    let mounted = true;

    // Fire-and-forget view increment (skipped server-side if owner)
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(`/api/assets/${assetId}/view`, {
          method: "POST",
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
          keepalive: true,
        });
      } catch {
        /* silent */
      }
    })();

    async function load() {
      setLoading(true);

      const { data: assetData, error: assetErr } = await supabase
        .from("assets")
        .select(
          `
            id,
            owner_id,
            title,
            description,
            content_type,
            storage_path,
            thumbnail_path,
            price_cents,
            created_at,
            updated_at,
            is_public,
            origin_creator_id,
            origin_license,
              is_remix,
      remix_type,
      remix_data
          `,
        )
        .eq("id", assetId)
        .single();

      if (assetErr || !assetData) {
        if (mounted) {
          setAsset(null);
          setLoading(false);
        }
        return;
      }

      if (mounted) setAsset(assetData);

      // Seller / owner profile
      if (assetData.owner_id) {
        const { data: ownerProf } = await supabase
          .from("profiles")
          .select(
            "id, display_name, avatar_url, bio, twitter_url, linkedin_url, website_url",
          )
          .eq("id", assetData.owner_id)
          .single();
        if (mounted) setOwnerProfile(ownerProf || null);
      }

      // Original-creator profile — only for resold listings, where the
      // original creator differs from the current seller.
      if (
        assetData.origin_creator_id &&
        assetData.origin_creator_id !== assetData.owner_id
      ) {
        const { data: originProf } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .eq("id", assetData.origin_creator_id)
          .single();
        if (mounted) setOriginCreatorProfile(originProf || null);
      }

      const { data: metaDataRes } = await supabase
        .from("asset_metadata")
        .select("*")
        .eq("asset_id", assetId)
        .single();
      if (mounted) setMetadata(metaDataRes || null);
      //
      // Load available licenses
      const { data: licensesData } = await supabase
        .from("asset_licenses")
        .select(
          `
      id,
      price_override,
      is_available,
      license_type:license_types(*)
    `,
        )
        .eq("asset_id", assetId)
        .eq("is_available", true);

      // Check which licenses user already owns
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let userOwnedLicenseIds: string[] = [];

      if (user) {
        if (mounted) setCurrentUserId(user.id);
        const { data: purchasedLicenses } = await supabase
          .from("purchased_licenses")
          .select("license_id")
          .eq("buyer_id", user.id)
          .eq("asset_id", assetId);

        if (purchasedLicenses) {
          userOwnedLicenseIds = purchasedLicenses.map((pl) => pl.license_id);
          if (mounted) {
            setOwnedLicenseIds(userOwnedLicenseIds);
          }
        }

        // Check if user owns this asset in purchased_assets table
        const { data: ownedAsset } = await supabase
          .from("purchased_assets")
          .select("id")
          .eq("buyer_id", user.id)
          .eq("asset_id", assetId)
          .single();

        if (mounted) {
          // Owner always "owns" their own asset
          const isCreator = assetData?.owner_id === user.id;
          setOwnsAsset(!!ownedAsset || isCreator);
        }
      }
      if (mounted && licensesData) {
        const licenses = licensesData.map((l) => {
          const licenseType = Array.isArray(l.license_type)
            ? l.license_type[0]
            : l.license_type;

          const isOwned = userOwnedLicenseIds.includes(l.id);

          return {
            ...l,
            license_type: licenseType,
            isOwned: isOwned,
            final_price:
              l.price_override ||
              Math.round(
                assetData.price_cents *
                  parseFloat(licenseType?.price_multiplier || 1),
              ),
          };
        });

        setAvailableLicenses(licenses);

        // Pre-select cheapest license that user doesn't own
        const unownedLicenses = licenses.filter((l) => !l.isOwned);
        if (unownedLicenses.length > 0) {
          const cheapest = unownedLicenses.reduce((prev, curr) =>
            curr.final_price < prev.final_price ? curr : prev,
          );
          setSelectedLicense(cheapest);
        }
        setLoadingLicenses(false);
      }
      if (
        assetData.content_type === "text" ||
        assetData.content_type === "prompt" ||
        assetData.content_type === "code"
      ) {
        const url = storageUrl(assetData.storage_path);
        if (url) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const text = await res.text();
              if (mounted) setFileContent(text);
            }
          } catch {
            // ignore fetch failures
          }
        }
      }

      await checkCartStatus();
      if (mounted) setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [assetId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        {/* Header Skeleton */}
        <div className="border-b border-white/10">
          <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 md:gap-6">
                <Skeleton className="h-4 w-16 bg-white/10" />
                <Skeleton className="h-8 w-64 bg-white/10" />
              </div>
              <Skeleton className="h-4 w-20 bg-white/10" />
            </div>
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
            {/* Left: Preview Skeleton */}
            <div className="lg:col-span-2 space-y-4">
              <div className="border border-white/10 bg-white/5 overflow-hidden">
                <Skeleton className="w-full h-[180px] md:h-[240px] bg-white/10" />
              </div>

              {/* Asset Info Grid Skeleton */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-white/5 border border-white/10 p-2 md:p-3 space-y-2"
                  >
                    <Skeleton className="h-3 w-16 bg-white/10" />
                    <Skeleton className="h-4 w-20 bg-white/10" />
                  </div>
                ))}
              </div>

              {/* Related Assets Skeleton */}
              <div className="border border-white/10 p-3 md:p-4 bg-white/5">
                <Skeleton className="h-4 w-48 bg-white/10 mb-2 md:mb-4" />
                <div className="grid grid-cols-3 gap-1.5 md:gap-3">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-16 md:h-24 w-full bg-white/10" />
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Sidebar Skeleton */}
            <aside className="space-y-4">
              {/* Description Skeleton */}
              <div className="border border-white/10 p-3 md:p-4 bg-white/5 space-y-3">
                <Skeleton className="h-4 w-32 bg-white/10" />
                <Skeleton className="h-4 w-full bg-white/10" />
                <Skeleton className="h-4 w-full bg-white/10" />
                <Skeleton className="h-4 w-3/4 bg-white/10" />
              </div>

              {/* Buy Box Skeleton */}
              <div className="border border-white/10 p-3 md:p-4 bg-white/5 space-y-4">
                <Skeleton className="h-8 w-32 bg-white/10" />
                <Skeleton className="h-3 w-24 bg-white/10" />
                <Skeleton className="h-11 w-full bg-white/10" />
                <Skeleton className="h-12 w-full bg-white/10" />
              </div>

              {/* Additional Info Skeleton */}
              <div className="border border-white/10 p-3 md:p-4 bg-white/5 space-y-4">
                <Skeleton className="h-4 w-32 bg-white/10" />
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex justify-between py-2">
                      <Skeleton className="h-3 w-20 bg-white/10" />
                      <Skeleton className="h-3 w-16 bg-white/10" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Related Assets Skeleton */}
              <div className="border border-white/10 p-3 md:p-4 bg-white/5 space-y-3">
                <Skeleton className="h-4 w-24 bg-white/10" />
                <Skeleton className="h-12 w-full bg-white/10" />
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-sm text-gray-400 font-light">Asset not found</div>
      </div>
    );
  }
  async function handleReport() {
    if (!reportReason) return;
    setReportLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast("error", "Please sign in to report"); setReportLoading(false); return; }
      const res = await fetch("/api/dmca/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ asset_id: assetId, reason: reportReason, description: reportDescription }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", "Report submitted. Our team will review it.");
        setShowReportModal(false);
        setReportReason("");
        setReportDescription("");
      } else {
        showToast("error", data.error || "Failed to submit report");
      }
    } catch {
      showToast("error", "Failed to submit report");
    } finally {
      setReportLoading(false);
    }
  }

  async function handleAddToCart() {
    if (!asset?.is_public) {
      showToast("error", "This asset is not for sale");
      return;
    }

    // Check if license is selected
    if (!selectedLicense) {
      showToast("error", "Please select a license");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      router.push(
        `/login?redirectTo=${encodeURIComponent(window.location.pathname)}`,
      );
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      showToast("error", "Please log in again");
      return;
    }

    const listingRes = await fetch("/api/cart/ensure-listing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        asset_id: asset.id,
        license_id: selectedLicense.id,
      }),
    });
    const listingData = await listingRes.json();
    if (!listingRes.ok || !listingData.listing_id) {
      showToast("error", listingData.error || "Failed to prepare cart item");
      return;
    }

    const cartPayload = {
      user_id: data.user.id,
      asset_id: asset.id,
      listing_id: listingData.listing_id,
      license_id: selectedLicense.id,
      title: asset.title,
      price_cents: selectedLicense.final_price,
      thumbnail: asset.thumbnail_path || asset.storage_path,
    };

    const { data: existingCartItem, error: existingCartError } = await supabase
      .from("cart")
      .select("id")
      .eq("user_id", data.user.id)
      .eq("asset_id", asset.id)
      .maybeSingle();

    if (existingCartError) {
      showToast("error", existingCartError.message || "Failed to check cart");
      console.error("Cart check error:", JSON.stringify(existingCartError, null, 2));
      return;
    }

    const { error } = existingCartItem
      ? await supabase.from("cart").update(cartPayload).eq("id", existingCartItem.id)
      : await supabase.from("cart").insert(cartPayload);

    if (error) {
      showToast("error", error.message || "Failed to add to cart");
      console.error("Cart save error:", JSON.stringify(error, null, 2));
      return;
    }

    setIsInCart(true);
    showToast("success", existingCartItem ? "Cart updated" : "Added to cart");
  }

  async function handleBuyNow() {
    if (!asset?.is_public) {
      showToast("error", "This asset is not for sale");
      return;
    }

    if (!asset.price_cents || asset.price_cents === 0) {
      showToast("error", "This asset is not for sale");
      return;
    }

    if (!selectedLicense) {
      showToast("error", "Please select a license");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      router.push(
        `/login?redirectTo=${encodeURIComponent(window.location.pathname)}`,
      );
      return;
    }

    router.push(
      `/purchase/checkout?assetId=${encodeURIComponent(asset.id)}&licenseId=${encodeURIComponent(selectedLicense.id)}`,
    );
  }

  async function handleClaimFreeAsset() {
    if (!asset?.is_public) {
      showToast("error", "This asset is not available");
      return;
    }

    if (asset.price_cents && asset.price_cents > 0) {
      showToast("error", "This asset requires checkout");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      router.push(
        `/login?redirectTo=${encodeURIComponent(window.location.pathname)}`,
      );
      return;
    }

    const { error } = await supabase.from("purchased_assets").upsert(
      {
        buyer_id: data.user.id,
        seller_id: asset.owner_id || null,
        asset_id: asset.id,
        listing_id: null,
        purchase_price: 0,
        purchased_at: new Date().toISOString(),
      },
      { onConflict: "buyer_id,asset_id", ignoreDuplicates: true },
    );

    if (error) {
      console.error("Free asset claim error:", error);
      showToast("error", "Failed to add asset to your library");
      return;
    }

    setOwnsAsset(true);
    showToast("success", "Asset added to your library");
  }

  async function handleDownload() {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        showToast("error", "Please log in to download");
        return;
      }

      // Verify ownership in purchased_assets
      const { data: ownedAsset } = await supabase
        .from("purchased_assets")
        .select("id, download_count")
        .eq("buyer_id", data.user.id)
        .eq("asset_id", asset.id)
        .single();

      if (!ownedAsset) {
        showToast("error", "You don't own this asset");
        return;
      }

      // Update download count
      await supabase
        .from("purchased_assets")
        .update({
          download_count: (ownedAsset.download_count || 0) + 1,
          last_downloaded_at: new Date().toISOString(),
        })
        .eq("id", ownedAsset.id);

      // Trigger download
      const url = storageUrl(asset.storage_path);
      if (url) {
        const response = await fetch(url);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = asset.title || "download";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        await trackDownload(data.user.id);
        showToast("success", "Download started");
      }
    } catch (error) {
      console.error("Download error:", error);
      showToast("error", "Failed to download asset");
    }
  }
  function renderPreview() {
    const url = storageUrl(asset.storage_path);
    const thumbUrl = storageUrl(asset.thumbnail_path);

    // For text-based content, show icons only (no lock needed)
    if (
      asset.content_type === "text" ||
      asset.content_type === "code" ||
      asset.content_type === "prompt"
    ) {
      const iconMap = {
        code: <div className="text-8xl">💻</div>,
        text: <div className="text-8xl">📄</div>,
        prompt: <div className="text-8xl">✨</div>,
      };

      return (
        <div className="relative w-full h-full bg-black flex items-center justify-center">
          {iconMap[asset.content_type as keyof typeof iconMap]}
        </div>
      );
    }
    // Owner sees real content
    if (ownsAsset) {
      if (asset.content_type === "video")
        return (
          <video src={url!} controls className="w-full h-full object-contain" />
        );
      if (asset.content_type === "image")
        return (
          <img
            src={url!}
            alt={asset.title}
            className="w-full h-full object-contain"
          />
        );
      if (asset.content_type === "audio")
        return (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
            <Music className="w-12 h-12 text-gray-500" />
            <audio src={url!} controls className="w-4/5" />
          </div>
        );
    }
    // For audio with thumbnail, show the thumbnail

    if (asset.content_type === "audio") {
      if (asset.thumbnail_path) {
        return (
          <div className="relative w-full h-full bg-black flex items-center justify-center">
            <img
              src={thumbUrl!}
              alt={asset.title || "audio thumbnail"}
              className="w-full h-full object-cover"
            />
          </div>
        );
      }
      return (
        <div className="relative w-full h-full bg-black flex items-center justify-center">
          <Music className="w-20 h-20 text-gray-600" />
        </div>
      );
    }

    // For images and videos, show blurred content with lock overlay
    const renderContent = () => {
      switch (asset.content_type) {
        case "image":
          return (
            <img
              src={url!}
              alt={asset.title || "asset"}
              className="w-full h-full object-contain"
            />
          );
        case "video":
          // Use thumbnail for video if available
          if (asset.thumbnail_path) {
            return (
              <img
                src={thumbUrl!}
                alt={asset.title || "video thumbnail"}
                className="w-full h-full object-contain"
              />
            );
          }
          return (
            <video src={url!} className="w-full h-full object-contain" muted />
          );
        default:
          return <ImageIcon className="w-20 h-20 text-gray-300" />;
      }
    };

    return (
      <div className="relative w-full h-full bg-black">
        {/* Blurred content */}
        <div className="absolute inset-0">{renderContent()}</div>

        {/* Lock icon only */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center">
            <svg
              className="w-10 h-10 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  function niceBytes(bytes?: number | null) {
    if (!bytes && bytes !== 0) return "—";
    const b = Number(bytes);
    if (b === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let u = 0;
    let val = b;
    while (val >= 1024 && u < units.length - 1) {
      val /= 1024;
      u++;
    }
    return `${val.toFixed(val < 10 ? 2 : 1)} ${units[u]}`;
  }

  function formatDuration(sec?: number | null) {
    if (!sec && sec !== 0) return "—";
    const s = Number(sec);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs}s`;
  }

  // Build only the stats relevant to this asset's content type
  function getStats(): { label: string; value: string }[] {
    const stats: { label: string; value: string }[] = [];
    const ct = asset.content_type;

    if (metadata?.file_size != null) {
      stats.push({ label: "File Size", value: niceBytes(metadata.file_size) });
    }
    if ((ct === "image" || ct === "video") && metadata?.width && metadata?.height) {
      stats.push({
        label: "Dimensions",
        value: `${metadata.width} × ${metadata.height}`,
      });
    }
    if ((ct === "video" || ct === "audio") && metadata?.duration_seconds != null) {
      stats.push({
        label: "Duration",
        value: formatDuration(metadata.duration_seconds),
      });
    }
    if ((ct === "text" || ct === "prompt") && metadata?.word_count != null) {
      stats.push({ label: "Word Count", value: String(metadata.word_count) });
    }
    if (ct === "code" && metadata?.programming_language) {
      stats.push({ label: "Language", value: metadata.programming_language });
    }
    if (ct === "text" && metadata?.language) {
      stats.push({ label: "Language", value: metadata.language });
    }
    if (asset.created_at) {
      stats.push({
        label: "Uploaded",
        value: new Date(asset.created_at).toLocaleDateString(),
      });
    }
    return stats;
  }

  const stats = getStats();
  // A resold listing: the current seller (owner_id) is not the original creator.
  const isResale =
    !!asset.origin_creator_id && asset.origin_creator_id !== asset.owner_id;
  const isAvailable = !!asset.is_public;
  const isFreeAsset = !asset.price_cents || asset.price_cents === 0;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 border backdrop-blur-md transition-all duration-300 ${
            // Change the success colors from green to red
            toast.type === "success"
              ? "bg-red-500/10 border-red-500/50 text-red-400"
              : "bg-red-500/10 border-red-500/50 text-red-400"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <XCircle className="w-5 h-5" />
          )}
          <span className="text-sm font-light">{toast.message}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-6">
              <button
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-400 flex items-center gap-2 cursor-pointer text-xs md:text-sm font-light transition-colors duration-300"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <h1 className="text-base md:text-2xl font-extralight tracking-tight">
                {asset.title || "Untitled"}
              </h1>
            </div>

            <div className="text-xs text-gray-600 font-light">
              <div className="uppercase tracking-wider">
                {asset.content_type}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
          {/* Left: Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="border border-white/10 bg-white/5 overflow-hidden">
              <div className="w-full h-[280px] md:h-[460px] flex items-center justify-center bg-black">
                {renderPreview()}
              </div>
            </div>

            {/* Asset Info Grid — only relevant fields */}
            {stats.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                {stats.map((s) => (
                  <div
                    key={s.label}
                    className="bg-white/5 border border-white/10 p-2.5 md:p-3"
                  >
                    <div className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider mb-1">
                      {s.label}
                    </div>
                    <div className="text-xs md:text-sm text-white font-light truncate">
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Sidebar */}
          <aside className="space-y-4">
            {/* Description */}
            <div className="border border-white/10 p-3 md:p-4 bg-white/5">
              <h4 className="text-xs md:text-sm font-light mb-2 uppercase tracking-wider text-gray-400">
                Description
              </h4>
              <p
                className={`text-xs md:text-sm text-gray-400 font-light leading-relaxed ${
                  showFullDescription ? "" : "line-clamp-3"
                }`}
              >
                {asset.description || "No description"}
              </p>
              {asset.description && asset.description.length > 150 && (
                <button
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="text-xs text-red-400 hover:text-red-300 mt-2 font-light transition-colors cursor-pointer duration-300"
                >
                  {showFullDescription ? "Show less" : "Show more"}
                </button>
              )}
            </div>

            {/* Seller / Creator */}
            {ownerProfile && (
              <div className="border border-white/10 p-3 md:p-4 bg-white/5">
                <h4 className="text-xs md:text-sm font-light mb-3 uppercase tracking-wider text-gray-400">
                  {isResale ? "Seller" : "Creator"}
                </h4>
                <div className="flex items-center gap-3">
                  <img
                    src={
                      ownerProfile.avatar_url ||
                      `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(ownerProfile.id)}`
                    }
                    alt={ownerProfile.display_name || "Creator"}
                    className="w-12 h-12 rounded-full object-cover border border-white/15 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-light text-white truncate">
                      {ownerProfile.display_name || "KAIZORA Creator"}
                    </div>
                    {currentUserId === asset.owner_id ? (
                      <span className="text-[10px] text-red-400 font-light">
                        This is you{isResale ? " · Reseller" : ""}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-600 font-light uppercase tracking-wider">
                        {isResale ? "Reseller" : "Original Creator"}
                      </span>
                    )}
                  </div>
                </div>

                {isResale && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="text-[10px] text-gray-600 font-light uppercase tracking-wider mb-2">
                      Original Creator
                    </div>
                    {originCreatorProfile ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            originCreatorProfile.avatar_url ||
                            `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(originCreatorProfile.id)}`
                          }
                          alt={originCreatorProfile.display_name || "Creator"}
                          className="w-9 h-9 rounded-full object-cover border border-white/15 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-light text-white truncate">
                            {originCreatorProfile.display_name ||
                              "KAIZORA Creator"}
                          </div>
                          <span className="text-[10px] text-gray-600 font-light">
                            {asset.origin_license === "commercial"
                              ? "Earns a royalty on every resale"
                              : "Original author"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600 font-light">
                        Original author
                      </div>
                    )}
                  </div>
                )}

                {ownerProfile.bio && (
                  <p className="text-xs text-gray-500 font-light mt-3 leading-relaxed">
                    {ownerProfile.bio}
                  </p>
                )}

                {(ownerProfile.twitter_url ||
                  ownerProfile.linkedin_url ||
                  ownerProfile.website_url) && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    {ownerProfile.twitter_url && (
                      <a
                        href={ownerProfile.twitter_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-gray-500 hover:text-red-400 transition-colors"
                      >
                        Twitter
                      </a>
                    )}
                    {ownerProfile.linkedin_url && (
                      <a
                        href={ownerProfile.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-gray-500 hover:text-red-400 transition-colors"
                      >
                        LinkedIn
                      </a>
                    )}
                    {ownerProfile.website_url && (
                      <a
                        href={ownerProfile.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-gray-500 hover:text-red-400 transition-colors"
                      >
                        Website
                      </a>
                    )}
                  </div>
                )}

                <button
                  onClick={() =>
                    router.push(`/community/profile/${ownerProfile.id}`)
                  }
                  className="w-full mt-3 pt-3 border-t border-white/5 text-xs text-gray-500 hover:text-white transition-colors cursor-pointer text-left"
                >
                  View full profile →
                </button>
              </div>
            )}

            {/* Lineage Section - Show if this is a remix */}
            {asset.is_remix && (
              <div className="border border-white/10 p-3 md:p-4 bg-white/5">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-sm font-light uppercase tracking-wider text-gray-400">
                    Remixed From
                  </h4>
                </div>

                <ParentAssetCard assetId={asset.id} />

                {/* Remix Details */}
                {asset.remix_data && (
                  <div className="mt-4 p-3 bg-black/20 border border-white/10">
                    <div className="text-xs font-light text-gray-600 uppercase tracking-wider mb-2">
                      Transform Details
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-light">
                      {asset.remix_data.rotation !== 0 && (
                        <div className="text-gray-500">
                          Rotated:{" "}
                          <span className="text-white">
                            {asset.remix_data.rotation}°
                          </span>
                        </div>
                      )}
                      {asset.remix_data.scale !== 100 && (
                        <div className="text-gray-500">
                          Scaled:{" "}
                          <span className="text-white">
                            {asset.remix_data.scale}%
                          </span>
                        </div>
                      )}
                      {asset.remix_data.flipH && (
                        <div className="text-gray-500">
                          <span className="text-white">
                            Flipped Horizontally
                          </span>
                        </div>
                      )}
                      {asset.remix_data.flipV && (
                        <div className="text-gray-500">
                          <span className="text-white">Flipped Vertically</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Buy Box with License Selection */}
            <div className="border border-white/10 p-3 md:p-4 bg-white/5 space-y-4">
              {!isAvailable ? (
                <div>
                  <div className="text-sm text-gray-500 font-light mb-3">
                    Not for sale
                  </div>
                </div>
              ) : (
                <>
                  {/* Selected License Price */}
                  <div>
                    <div className="text-xl md:text-2xl font-light text-white mb-1">
                      {isFreeAsset
                        ? "Free"
                        : `$${selectedLicense
                            ? (selectedLicense.final_price / 100).toFixed(2)
                            : ((asset.price_cents ?? 0) / 100).toFixed(2)}`}
                    </div>
                    <div className="text-xs text-gray-600 font-light">
                      {isFreeAsset
                        ? "Free asset"
                        : selectedLicense?.license_type?.name ||
                          "Select a license"}{" "}
                      · Instant delivery
                    </div>
                  </div>

                  {/* License Selection */}
                  {isFreeAsset ? (
                    <div className="text-xs text-gray-500">
                      No payment required.
                    </div>
                  ) : loadingLicenses ? (
                    <div className="text-xs text-gray-500">
                      Loading licenses...
                    </div>
                  ) : availableLicenses.length > 0 ? (
                    <div className="space-y-2">
                      <label className="block text-xs text-gray-500 font-light uppercase tracking-wider mb-2">
                        Choose License
                      </label>
                      {availableLicenses.map((license) => (
                        <div
                          key={license.id}
                          onClick={() =>
                            !license.isOwned && setSelectedLicense(license)
                          }
                          className={`p-3 border transition-all ${
                            license.isOwned
                              ? "bg-green-500/10 border-green-500/30 cursor-not-allowed"
                              : selectedLicense?.id === license.id
                                ? "bg-red-500/10 border-red-500/30 cursor-pointer"
                                : "bg-white/5 border-white/10 hover:border-white/20 cursor-pointer"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="text-sm font-medium text-white">
                                  {license.license_type?.name}
                                </div>
                                {license.isOwned && (
                                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    Owned
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 font-light">
                                {license.license_type?.description}
                              </p>
                            </div>
                            <div className="text-sm font-light text-white ml-3">
                              {license.isOwned ? (
                                <span className="text-green-400">✓</span>
                              ) : (
                                `$${(license.final_price / 100).toFixed(2)}`
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5 text-xs">
                            {(() => {
                              const rule = getLicenseRule(
                                license.license_type?.slug,
                              );
                              if (!rule) return null;
                              const badges: {
                                label: string;
                                cls: string;
                              }[] = [
                                {
                                  label: "Download",
                                  cls: "bg-white/10 text-gray-300",
                                },
                              ];
                              if (rule.canRemix)
                                badges.push({
                                  label: "Remix",
                                  cls: "bg-blue-500/20 text-blue-400",
                                });
                              if (rule.canResell)
                                badges.push({
                                  label: "Resell",
                                  cls: "bg-purple-500/20 text-purple-400",
                                });
                              if (rule.owesRoyaltyToOriginalCreator)
                                badges.push({
                                  label: "Royalty to creator",
                                  cls: "bg-amber-500/20 text-amber-400",
                                });
                              return badges.map((b) => (
                                <span
                                  key={b.label}
                                  className={`px-1.5 py-0.5 ${b.cls} rounded text-xs`}
                                >
                                  {b.label}
                                </span>
                              ));
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-red-400">
                      No licenses available for this asset
                    </div>
                  )}

                  {/* Action Buttons */}
                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {ownsAsset ? (
                      // User owns the asset - Show download button
                      <>
                        <button
                          onClick={handleDownload}
                          className="w-full px-4 py-2 md:py-3 text-xs md:text-sm font-light transition-colors duration-300 flex items-center justify-center gap-2 bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          Download Asset
                        </button>

                        <button
                          onClick={() =>
                            router.push(
                              currentUserId === asset.owner_id
                                ? "/creator/assets"
                                : "/my-assets",
                            )
                          }
                          className="w-full px-4 py-2 text-xs font-light text-gray-500 hover:text-white transition-colors duration-300"
                        >
                          View All My Assets →
                        </button>
                      </>
                    ) : (
                      // User doesn't own - Show add to cart
                      <>
                        {isFreeAsset ? (
                          <button
                            onClick={handleClaimFreeAsset}
                            className="w-full px-4 py-2 md:py-3 text-xs md:text-sm font-light transition-colors duration-300 flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-200 cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                            Get Free Asset
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={handleAddToCart}
                              disabled={
                                isInCart ||
                                !selectedLicense ||
                                selectedLicense?.isOwned
                              }
                              className={`w-full px-4 py-2 md:py-3 text-xs md:text-sm font-light transition-colors duration-300 flex items-center justify-center gap-2 ${
                                isInCart
                                  ? "bg-green-500/20 text-green-400 border border-green-500/50 cursor-not-allowed"
                                  : selectedLicense?.isOwned
                                    ? "bg-gray-500/20 text-gray-400 border border-gray-500/50 cursor-not-allowed"
                                    : "bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              }`}
                            >
                              <ShoppingCart className="w-4 h-4" />
                              {isInCart
                                ? "Added to Cart"
                                : selectedLicense?.isOwned
                                  ? "Already Owned"
                                : "Add to Cart"}
                            </button>
                            <button
                              onClick={handleBuyNow}
                              disabled={!selectedLicense || selectedLicense?.isOwned}
                              className="w-full px-4 py-2 md:py-3 text-xs md:text-sm font-light transition-colors duration-300 flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <ArrowRight className="w-4 h-4" />
                              Buy Now
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Report button — only for non-owners + logged in */}
            {currentUserId && currentUserId !== asset.owner_id && (
              <button
                onClick={() => setShowReportModal(true)}
                className="w-full text-xs text-gray-600 hover:text-red-400 transition-colors py-2 border border-white/5 hover:border-red-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                Report / DMCA
              </button>
            )}

          </aside>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => setShowReportModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[#0e0e0e] border border-white/10 w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-light">Report / DMCA Takedown</h3>
                <button onClick={() => setShowReportModal(false)} className="text-gray-600 hover:text-white transition-colors cursor-pointer">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Reason *</label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white text-sm py-2 px-3 focus:outline-none focus:border-white/20"
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
                    placeholder="Provide additional details about your report..."
                    className="w-full bg-white/5 border border-white/10 text-white text-sm py-2 px-3 focus:outline-none focus:border-white/20 resize-none placeholder-gray-700"
                  />
                </div>

                <p className="text-xs text-gray-600">
                  False reports may result in account suspension. Our team reviews all reports within 48 hours.
                </p>

                <button
                  onClick={handleReport}
                  disabled={!reportReason || reportLoading}
                  className="w-full py-2.5 text-sm bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
