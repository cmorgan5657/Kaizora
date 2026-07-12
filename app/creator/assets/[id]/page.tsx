"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useParams } from "next/navigation";
import { getLicenseRule } from "@/lib/licenses";
import {
  Trash2,
  Download,
  ExternalLink,
  Sparkles,
  Image,
  Video,
  Music,
  FileText,
  Code,
  File as FileIcon,
  Loader2,
  X,
} from "lucide-react";

export default function AssetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [asset, setAsset] = useState<any>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newContentType, setNewContentType] = useState("image");
  const [newThumbnail, setNewThumbnail] = useState<File | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newAiModel, setNewAiModel] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [autoThumbnailing, setAutoThumbnailing] = useState(false);
  const autoThumbnailAttemptedRef = useRef<Set<string>>(new Set());
  const [licenseTypes, setLicenseTypes] = useState<any[]>([]);
  const [assetLicenses, setAssetLicenses] = useState<any[]>([]);
  const [loadingLicenses, setLoadingLicenses] = useState(true);
  const [feePercent, setFeePercent] = useState(10);
  const contentTypes = [
    { value: "image", label: "Image", icon: Image },
    { value: "video", label: "Video", icon: Video },
    { value: "audio", label: "Audio", icon: Music },
    { value: "text", label: "Text", icon: FileText },
    { value: "code", label: "Code", icon: Code },
    { value: "prompt", label: "Prompt", icon: Sparkles },
    { value: "other", label: "Other", icon: FileIcon },
  ];

  // KAIZORA Marketplace Categories
  const marketplaceCategories = {
    visual: {
      label: "Visual",
      subcategories: [
        { value: "ai-images", label: "AI Images" },
        { value: "ai-illustrations", label: "AI Illustrations" },
        { value: "concept-art", label: "Concept Art" },
        { value: "character-designs", label: "Character Designs" },
        { value: "environments-worlds", label: "Environments & Worlds" },
        { value: "backgrounds-textures", label: "Backgrounds & Textures" },
        { value: "icons-ui-assets", label: "Icons & UI Assets" },
        { value: "logos-brand-elements", label: "Logos & Brand Elements" },
        { value: "posters-cover-art", label: "Posters & Cover Art" },
        { value: "social-media-visuals", label: "Social Media Visuals" },
        { value: "print-ready-assets", label: "Print-Ready Assets" },
        { value: "stock-style-imagery", label: "Stock-Style Imagery" },
        {
          value: "generative-art-collections",
          label: "Generative Art Collections",
        },
      ],
    },
    video: {
      label: "Video",
      subcategories: [
        { value: "ai-video-clips", label: "AI Video Clips" },
        { value: "cinematic-sequences", label: "Cinematic Sequences" },
        { value: "motion-graphics", label: "Motion Graphics" },
        { value: "transitions", label: "Transitions" },
        { value: "overlays", label: "Overlays" },
        { value: "animated-backgrounds", label: "Animated Backgrounds" },
        { value: "short-form-video-assets", label: "Short-Form Video Assets" },
        { value: "video-templates", label: "Video Templates" },
        { value: "reels-shorts-assets", label: "Reels & Shorts Assets" },
        { value: "b-roll-footage", label: "B-Roll Footage" },
        { value: "visual-effects-vfx", label: "Visual Effects (VFX)" },
        { value: "ai-generated-animations", label: "AI-Generated Animations" },
      ],
    },
    audio: {
      label: "Audio",
      subcategories: [
        { value: "ai-music-tracks", label: "AI Music Tracks" },
        { value: "beats-instrumentals", label: "Beats & Instrumentals" },
        { value: "sound-effects-sfx", label: "Sound Effects (SFX)" },
        { value: "ambience-atmospheres", label: "Ambience & Atmospheres" },
        { value: "vocal-samples", label: "Vocal Samples" },
        { value: "ai-voice-clips", label: "AI Voice Clips" },
        { value: "narration-audio", label: "Narration Audio" },
        { value: "dialogue-packs", label: "Dialogue Packs" },
        { value: "audio-loops", label: "Audio Loops" },
        { value: "podcast-assets", label: "Podcast Assets" },
      ],
    },
  };

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace(`/login?redirectTo=/creator/assets/${id}`);
      } else {
        setUser(data.user);
      }
    }
    loadUser();
    supabase
      .from("platform_settings")
      .select("value_number")
      .eq("key", "platform_fee_percent")
      .maybeSingle()
      .then(({ data }) => { if (data?.value_number != null) setFeePercent(data.value_number); });
  }, []);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const { data: a } = await supabase
        .from("assets")
        .select("*")
        .eq("id", id)
        .eq("owner_id", user.id)
        .single();

      const { data: m } = await supabase
        .from("asset_metadata")
        .select("*")
        .eq("asset_id", id)
        .single();

      if (!a) {
        router.replace("/creator/assets");
        return;
      }

      setAsset(a);
      setMetadata(m);
      // Load license types
      const { data: types } = await supabase
        .from("license_types")
        .select("*")
        .eq("is_active", true)
        .order("price_multiplier", { ascending: true });

      if (types) setLicenseTypes(types);

      // Load existing asset licenses
      const { data: existingLicenses } = await supabase
        .from("asset_licenses")
        .select(
          `
    id,
    license_type_id,
    price_override,
    is_available,
    license_type:license_types(*)
  `,
        )
        .eq("asset_id", id);

      if (existingLicenses) {
        const licenses = existingLicenses.map((l) => ({
          ...l,
          license_type: Array.isArray(l.license_type)
            ? l.license_type[0]
            : l.license_type,
        }));
        setAssetLicenses(licenses);
      }

      setLoadingLicenses(false);
      setNewTitle(a.title || "");
      setNewDescription(a.description || "");
      setNewContentType(a.content_type || "image");
      setNewPrice(a.price_cents ? (a.price_cents / 100).toFixed(2) : "");
      setNewCategory(a.category || "");
      setNewSubcategory(a.subcategory || "");
      setNewAiModel(a.ai_model || "");
      setNewTags(Array.isArray(a.tags) ? a.tags : []);

      setLoading(false);
    }

    load();
  }, [user, id]);

  useEffect(() => {
    if (newContentType === "video" || newContentType === "audio") return;
    setNewThumbnail(null);
  }, [newContentType]);

  const thumbnailURL = asset?.thumbnail_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${asset.thumbnail_path}`
    : null;
  const actualFileURL = asset?.storage_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${asset.storage_path}`
    : "";
  const showThumbnailInput =
    newContentType === "video" || newContentType === "audio";

  useEffect(() => {
    if (!user?.id || !asset?.id || !asset?.storage_path) return;
    if (asset.content_type !== "video") return;
    if (asset.thumbnail_path) return;
    if (autoThumbnailAttemptedRef.current.has(asset.id)) return;

    autoThumbnailAttemptedRef.current.add(asset.id);

    let cancelled = false;

    async function ensureMissingVideoThumbnail() {
      setAutoThumbnailing(true);

      try {
        const generatedThumbnail = await createVideoThumbnailFromUrl(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${asset.storage_path}`,
        );

        if (!generatedThumbnail || cancelled) return;

        const thumbName = `${user.id}/thumbnails/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("assets")
          .upload(thumbName, generatedThumbnail);

        if (uploadError) throw uploadError;
        if (cancelled) return;

        const { error: updateError } = await supabase
          .from("assets")
          .update({ thumbnail_path: thumbName })
          .eq("id", asset.id);

        if (updateError) throw updateError;
        if (cancelled) return;

        setAsset((prev: any) =>
          prev ? { ...prev, thumbnail_path: thumbName } : prev,
        );
      } catch (error) {
        console.error("Auto thumbnail generation failed:", error);
      } finally {
        if (!cancelled) setAutoThumbnailing(false);
      }
    }

    void ensureMissingVideoThumbnail();

    return () => {
      cancelled = true;
    };
  }, [
    asset?.content_type,
    asset?.id,
    asset?.storage_path,
    asset?.thumbnail_path,
    user?.id,
  ]);

  if (loading || !asset) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm font-light">Loading asset...</p>
      </div>
    );
  }

  function renderPreview() {
    switch (asset.content_type) {
      case "image":
        return (
          <img
            src={actualFileURL}
            className="w-full h-full object-cover"
            alt="Asset preview"
          />
        );

      case "video":
        return (
          <video
            src={actualFileURL}
            controls
            className="w-full h-full object-cover bg-black"
          />
        );

      case "audio":
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 p-4">
            <Music className="w-8 h-8 text-gray-600 mb-2" />
            <audio src={actualFileURL} controls className="w-full mt-2" />
          </div>
        );

      case "text":
      case "prompt":
      case "code":
        return (
          <div className="w-full h-full flex items-center justify-center bg-white/5 p-4 text-gray-600 text-xs font-light">
            Text File
          </div>
        );

      default:
        return (
          <div className="w-full h-full flex items-center justify-center bg-white/5">
            <FileIcon className="w-8 h-8 text-gray-600" />
          </div>
        );
    }
  }

  async function createVideoThumbnailFromUrl(videoUrl: string) {
    return await new Promise<Blob | null>((resolve) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.src = videoUrl;

      const cleanup = () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      };

      const fail = () => {
        cleanup();
        resolve(null);
      };

      const capture = () => {
        const width = video.videoWidth;
        const height = video.videoHeight;

        if (!width || !height) {
          fail();
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");

        if (!context) {
          fail();
          return;
        }

        context.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            cleanup();

            if (!blob) {
              resolve(null);
              return;
            }

            resolve(blob);
          },
          "image/jpeg",
          0.92,
        );
      };

      video.addEventListener("loadeddata", capture, { once: true });
      video.addEventListener("error", fail, { once: true });
    });
  }

  async function handleSave() {
    setSaving(true);

    try {
      const priceCents = newPrice ? Math.round(parseFloat(newPrice) * 100) : 0;
      if (asset.is_public && priceCents > 0 && assetLicenses.length === 0) {
        alert("Select at least one license before publishing a paid asset.");
        return;
      }

      let nextThumbnailPath: string | null = asset.thumbnail_path ?? null;
      let oldThumbnailToDelete: string | null = null;

      // Keep thumbnails only for video/audio and allow replacing the existing thumbnail.
      if (showThumbnailInput) {
        let thumbnailToUpload: File | Blob | null = newThumbnail;

        if (
          newContentType === "video" &&
          !thumbnailToUpload &&
          (!asset.thumbnail_path || asset.content_type !== "video")
        ) {
          thumbnailToUpload = await createVideoThumbnailFromUrl(actualFileURL);
        }

        if (thumbnailToUpload) {
          const thumbExt =
            thumbnailToUpload instanceof File
              ? thumbnailToUpload.name.split(".").pop() || "jpg"
              : "jpg";
          const thumbName = `${user.id}/thumbnails/${Date.now()}.${thumbExt}`;

          const { error: thumbUploadError } = await supabase.storage
            .from("assets")
            .upload(thumbName, thumbnailToUpload);

          if (thumbUploadError) throw thumbUploadError;

          if (
            asset.thumbnail_path &&
            asset.thumbnail_path !== thumbName &&
            asset.thumbnail_path !== asset.storage_path
          ) {
            oldThumbnailToDelete = asset.thumbnail_path;
          }

          nextThumbnailPath = thumbName;
        }
      } else {
        if (
          asset.thumbnail_path &&
          asset.thumbnail_path !== asset.storage_path
        ) {
          oldThumbnailToDelete = asset.thumbnail_path;
        }
        nextThumbnailPath = null;
      }

      const { error } = await supabase
        .from("assets")
        .update({
          title: newTitle,
          description: newDescription,
          content_type: newContentType,
          price_cents: priceCents,
          category: newCategory,
          subcategory: newSubcategory,
          ai_model: newAiModel || null,
          tags: newTags.length > 0 ? newTags : null,
          thumbnail_path: nextThumbnailPath,
        })
        .eq("id", id);

      if (error) throw error;

      if (oldThumbnailToDelete) {
        await supabase.storage.from("assets").remove([oldThumbnailToDelete]);
      }

      setAsset((prev: any) => ({
        ...prev,
        title: newTitle,
        description: newDescription,
        content_type: newContentType,
        price_cents: priceCents,
        category: newCategory,
        subcategory: newSubcategory,
        ai_model: newAiModel || null,
        tags: newTags.length > 0 ? newTags : null,
        thumbnail_path: nextThumbnailPath,
      }));
      setNewThumbnail(null);
    } catch (error: any) {
      alert(`Failed to update asset: ${error?.message ?? "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm("Delete this asset permanently? This action cannot be undone.")
    )
      return;

    try {
      setDeleting(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        alert("Your session has expired. Please log in again.");
        router.push(`/login?redirectTo=/creator/assets/${id}`);
        return;
      }

      const response = await fetch(`/api/creator/assets/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("Delete error:", payload);
        alert(`Failed to delete asset: ${payload?.error || "Unknown error"}`);
        return;
      }

      router.push("/creator/assets");
    } catch (err: any) {
      console.error("Delete error:", err);
      alert("Failed to delete asset: " + err.message);
    } finally {
      setDeleting(false);
    }
  }
  async function handleToggleLicense(licenseTypeId: string) {
    const alreadyActive = assetLicenses.find(
      (l) => l.license_type_id === licenseTypeId,
    );
    if (alreadyActive) return; // clicking active radio does nothing

    // Remove all existing licenses first (single-select)
    if (assetLicenses.length > 0) {
      const ids = assetLicenses.map((l) => l.id);
      await supabase.from("asset_licenses").delete().in("id", ids);
    }

    // Add the selected license
    const { data, error } = await supabase
      .from("asset_licenses")
      .insert({
        asset_id: id,
        license_type_id: licenseTypeId,
        price_override: null,
        is_available: true,
      })
      .select(`id, license_type_id, price_override, is_available, license_type:license_types(*)`)
      .single();

    if (error) {
      alert("Failed to set license");
      return;
    }

    const newLicense = {
      ...data,
      license_type: Array.isArray(data.license_type) ? data.license_type[0] : data.license_type,
    };
    setAssetLicenses([newLicense]);
  }

  async function handleUpdateLicensePrice(
    licenseId: string,
    customPrice: string,
  ) {
    const priceCents = customPrice
      ? Math.round(parseFloat(customPrice) * 100)
      : null;

    const { error } = await supabase
      .from("asset_licenses")
      .update({ price_override: priceCents })
      .eq("id", licenseId);

    if (error) {
      alert("Failed to update license price");
      return;
    }

    setAssetLicenses(
      assetLicenses.map((l) =>
        l.id === licenseId ? { ...l, price_override: priceCents } : l,
      ),
    );
  }
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto py-4 md:py-8 px-3 md:px-6">
        <div className="mb-3 md:mb-6">
          <h1 className="text-xl md:text-3xl font-extralight tracking-tight">
            Edit Asset
          </h1>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Left: Preview */}
          <div className="w-full md:w-72">
            <div className="w-full h-[200px] md:h-[280px] bg-black border border-white/10 overflow-hidden mb-3">
              {renderPreview()}
            </div>

            {showThumbnailInput && (
              <div className="mb-3">
                <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                  Thumbnail (Optional)
                </label>
                {autoThumbnailing && asset.content_type === "video" && (
                  <p className="text-[10px] text-gray-500 mb-2">
                    Generating thumbnail from first frame...
                  </p>
                )}
                {newContentType === "video" && !newThumbnail && (
                  <p className="text-[10px] text-gray-600 mb-2">
                    If empty, first frame of the video is used on save
                  </p>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewThumbnail(e.target.files?.[0] ?? null)}
                  className="hidden"
                  id="edit-thumbnail-upload"
                />
                <label
                  htmlFor="edit-thumbnail-upload"
                  className="block w-full p-3 bg-white/5 border border-dashed border-white/20 hover:border-red-500/40 transition-all cursor-pointer"
                >
                  {newThumbnail ? (
                    <div className="space-y-1">
                      <p className="text-xs text-white truncate">
                        {newThumbnail.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(newThumbnail.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  ) : thumbnailURL ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={thumbnailURL}
                        alt="Current thumbnail"
                        className="w-12 h-12 object-cover rounded"
                      />
                      <p className="text-xs text-gray-400">
                        Current thumbnail set
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Add cover image for your {newContentType}
                    </p>
                  )}
                </label>
                {newThumbnail && (
                  <button
                    type="button"
                    onClick={() => setNewThumbnail(null)}
                    className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove selected thumbnail
                  </button>
                )}
              </div>
            )}

            {/* Technical Info */}
            <div className="space-y-2">
              <h3 className="text-xs font-light text-gray-500 uppercase tracking-wider mb-3">
                Technical Info
              </h3>
              <div className="p-2 bg-white/5 border border-white/10">
                <div className="text-xs text-gray-600">File Size</div>
                <div className="text-sm font-light">
                  {metadata?.file_size
                    ? (metadata.file_size / 1024).toFixed(2) + " KB"
                    : "N/A"}
                </div>
              </div>

              {metadata?.width && metadata?.height && (
                <div className="p-2 bg-white/5 border border-white/10">
                  <div className="text-xs text-gray-600">Dimensions</div>
                  <div className="text-sm font-light">
                    {metadata.width} × {metadata.height}
                  </div>
                </div>
              )}

              {metadata?.word_count && (
                <div className="p-2 bg-white/5 border border-white/10">
                  <div className="text-xs text-gray-600">Word Count</div>
                  <div className="text-sm font-light">
                    {metadata.word_count}
                  </div>
                </div>
              )}

              <div className="p-2 bg-white/5 border border-white/10">
                <div className="text-xs text-gray-600">Created</div>
                <div className="text-sm font-light">
                  {new Date(asset.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Edit Form */}
          <div className="flex-1 space-y-3">
            <div>
              <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                Title
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-white/20 outline-none text-sm"
                placeholder="Asset title"
              />
            </div>

            <div>
              <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                Description
              </label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-white/20 outline-none text-sm min-h-20 resize-none"
                placeholder="Describe your asset..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                  Content Type
                </label>
                <div className="relative">
                  <select
                    value={newContentType}
                    onChange={(e) => setNewContentType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 focus:border-white/20 outline-none text-sm appearance-none cursor-pointer"
                  >
                    {contentTypes.map((type) => (
                      <option
                        key={type.value}
                        value={type.value}
                        className="bg-black"
                      >
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {contentTypes.find((t) => t.value === newContentType)
                      ?.icon &&
                      (() => {
                        const Icon = contentTypes.find(
                          (t) => t.value === newContentType,
                        )!.icon;
                        return <Icon className="w-4 h-4 text-gray-600" />;
                      })()}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                  Price (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 bg-white/5 border border-white/10 focus:border-white/20 outline-none text-sm"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Category & Subcategory */}
              <div>
                <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => {
                    setNewCategory(e.target.value);
                    setNewSubcategory("");
                    if (e.target.value === "visual") setNewContentType("image");
                    else if (e.target.value === "video")
                      setNewContentType("video");
                    else if (e.target.value === "audio")
                      setNewContentType("audio");
                  }}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 focus:border-white/20 outline-none text-sm appearance-none cursor-pointer"
                >
                  <option value="" className="bg-black">
                    Select Category
                  </option>
                  {Object.entries(marketplaceCategories).map(([key, cat]) => (
                    <option key={key} value={key} className="bg-black">
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                  Subcategory
                </label>
                <select
                  value={newSubcategory}
                  onChange={(e) => setNewSubcategory(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 focus:border-white/20 outline-none text-sm appearance-none cursor-pointer disabled:opacity-40"
                  disabled={!newCategory}
                >
                  <option value="" className="bg-black">
                    {newCategory ? "Select Subcategory" : "—"}
                  </option>
                  {newCategory &&
                    marketplaceCategories[
                      newCategory as keyof typeof marketplaceCategories
                    ]?.subcategories.map((sub) => (
                      <option
                        key={sub.value}
                        value={sub.value}
                        className="bg-black"
                      >
                        {sub.label}
                      </option>
                    ))}
                </select>
              </div>

              {/* AI Model */}
              <div className="col-span-2">
                <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                  AI Model
                </label>
                <input
                  type="text"
                  value={newAiModel}
                  onChange={(e) => setNewAiModel(e.target.value)}
                  placeholder="e.g. Midjourney v6.1, DALL-E 3, Suno v4"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 focus:border-white/20 outline-none text-sm"
                />
              </div>

              {/* Tags */}
              <div className="col-span-2">
                <label className="block text-xs font-light text-gray-500 mb-2 uppercase tracking-wider">
                  Tags
                </label>
                <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-white/5 border border-white/10 focus-within:border-white/20 transition-all min-h-[40px]">
                  {newTags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-[11px] text-red-200 rounded"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() =>
                          setNewTags((prev) => prev.filter((t) => t !== tag))
                        }
                        className="text-red-300/70 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        (e.key === "Enter" || e.key === ",") &&
                        tagInput.trim()
                      ) {
                        e.preventDefault();
                        const t = tagInput.trim().replace(/,$/, "");
                        if (t && !newTags.includes(t) && newTags.length < 8) {
                          setNewTags((prev) => [...prev, t]);
                        }
                        setTagInput("");
                      } else if (
                        e.key === "Backspace" &&
                        !tagInput &&
                        newTags.length > 0
                      ) {
                        setNewTags((prev) => prev.slice(0, -1));
                      }
                    }}
                    placeholder={
                      newTags.length === 0
                        ? "Add tags (press Enter or comma)"
                        : newTags.length >= 8
                          ? "Max 8 tags"
                          : "Add another…"
                    }
                    disabled={newTags.length >= 8}
                    className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-white placeholder-gray-600"
                  />
                </div>
              </div>

              {/* License Management */}
              <div className="col-span-2 pt-4 border-t border-white/10">
                <label className="block text-xs font-light text-gray-500 mb-3 uppercase tracking-wider">
                  Available Licenses
                </label>

                {loadingLicenses ? (
                  <div className="text-xs text-gray-500">
                    Loading licenses...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {licenseTypes.map((licenseType) => {
                      const existingLicense = assetLicenses.find(
                        (l) => l.license_type_id === licenseType.id,
                      );
                      const isActive = !!existingLicense;
                      const basePrice = newPrice ? parseFloat(newPrice) : 0;
                      const calculatedPrice =
                        basePrice *
                        parseFloat(licenseType.price_multiplier || 1);
                      const customPrice = existingLicense?.price_override
                        ? existingLicense.price_override / 100
                        : null;

                      return (
                        <div
                          key={licenseType.id}
                          className={`p-3 border transition-all ${
                            isActive
                              ? "bg-red-500/10 border-red-500/30"
                              : "bg-white/5 border-white/10"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <input
                                type="radio"
                                checked={isActive}
                                onChange={() => handleToggleLicense(licenseType.id)}
                                className="mt-1 w-4 h-4 accent-red-500 cursor-pointer"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-medium">
                                    {licenseType.name}
                                  </h4>
                                  <span className="text-xs text-gray-500">
                                    ×{licenseType.price_multiplier}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 font-light mb-1">
                                  {licenseType.description}
                                </p>
                                <div className="flex flex-wrap gap-2 text-xs">
                                  {(() => {
                                    const rule = getLicenseRule(
                                      licenseType.slug,
                                    );
                                    if (!rule) return null;
                                    return (
                                      <>
                                        {rule.canRemix && (
                                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                            Can Remix
                                          </span>
                                        )}
                                        {rule.canResell && (
                                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                            Can Resell
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>

                            {isActive && (
                              <div className="ml-4 text-right">
                                <div className="text-xs text-gray-500 mb-0.5">Price</div>
                                <div className="text-base font-light">${calculatedPrice.toFixed(2)}</div>
                                {feePercent > 0 && (() => {
                                  const fee = Math.floor(calculatedPrice * feePercent) / 100;
                                  const youGet = calculatedPrice - fee;
                                  return (
                                    <div className="mt-2 space-y-0.5 border-t border-white/10 pt-2">
                                      <div className="text-[10px] text-gray-600">
                                        Fee ({feePercent}%): <span className="text-yellow-500/70">−${fee.toFixed(2)}</span>
                                      </div>
                                      <div className="text-[10px] text-gray-500">
                                        You get: <span className="text-emerald-400">${youGet.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {newPrice &&
                  parseFloat(newPrice) > 0 &&
                  assetLicenses.length === 0 &&
                  !loadingLicenses && (
                  <p className="text-xs text-yellow-400 mt-2">
                    Select at least one license before publishing a paid asset.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 md:pt-6 border-t border-white/10">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 md:px-4 py-2 text-red-400 hover:text-red-300 transition-colors text-xs md:text-sm font-light disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {deleting ? "Deleting..." : "Delete Asset"}
              </button>

              <div className="flex gap-2 md:gap-3">
                <button
                  onClick={() => router.back()}
                  className="px-3 md:px-6 py-2 md:py-2.5 text-gray-500 hover:text-gray-300 transition-colors text-xs md:text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 md:px-8 py-2 md:py-2.5 bg-linear-to-r from-red-600 to-red-700 text-xs md:text-sm hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
