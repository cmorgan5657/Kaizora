"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { trackUpload } from "@/lib/usageTracking";
import { getLicenseRule } from "@/lib/licenses";
import {
  Upload,
  SpinnerGap,
  Image as ImageIcon,
  FileVideo,
  MusicNote,
  FileText,
  Code as CodeIcon,
  File as FileIcon,
  Check,
  X,
  MagicWand,
} from "phosphor-react";
//
// Add this custom hook after imports

//
export default function CreateAssetPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  // Lineage tags carried in from a remix's "List on Marketplace" button.
  // null = fresh original (uploader is the origin creator).
  const lineageRef = useRef<{
    originCreatorId: string;
    originLicense: string | null;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState("image");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [price, setPrice] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [licenseTypes, setLicenseTypes] = useState<any[]>([]);
  const [selectedLicenses, setSelectedLicenses] = useState<Record<string, any>>(
    {},
  );
  const [loadingLicenses, setLoadingLicenses] = useState(true);
  const contentTypes = [
    { value: "image", label: "Image", icon: ImageIcon },
    { value: "video", label: "Video", icon: FileVideo },
    { value: "audio", label: "Audio", icon: MusicNote },
    { value: "text", label: "Text", icon: FileText },
    { value: "code", label: "Code", icon: CodeIcon },
    { value: "other", label: "Other", icon: FileIcon },
  ];

  // KAIZORA Marketplace Categories (AI-native, creator-first, agent-ready)
  const marketplaceCategories = {
    visual: {
      label: "Visual",
      icon: ImageIcon,
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
      icon: FileVideo,
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
      icon: MusicNote,
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

  // Category state
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login?redirectTo=/creator/assets/create");
      } else {
        setUser(data.user);

        // Load automation preference
        const { data: profile } = await supabase
          .from("profiles")
          .select("automation_enabled, auto_license_preferences")
          .eq("id", data.user.id)
          .single();

        if (profile) {
          setAutomationEnabled(profile.automation_enabled);
        }
        // Load available license types
        const { data: licenses } = await supabase
          .from("license_types")
          .select("*")
          .eq("is_active", true)
          .order("price_multiplier", { ascending: true });

        if (licenses) {
          setLicenseTypes(licenses);

          // Use user's license preferences from Settings
          if (profile?.auto_license_preferences) {
            const autoLicenses: Record<string, any> = {};

            licenses.forEach((license) => {
              if (profile.auto_license_preferences[license.slug] === true) {
                autoLicenses[license.id] = {
                  license_type_id: license.id,
                  price_override: null,
                  is_available: true,
                };
              }
            });

            // If preferences found, use them; otherwise fallback to Personal
            if (Object.keys(autoLicenses).length > 0) {
              setSelectedLicenses(autoLicenses);
            } else {
              const personalLicense = licenses.find(
                (l) => l.slug === "personal",
              );
              if (personalLicense) {
                setSelectedLicenses({
                  [personalLicense.id]: {
                    license_type_id: personalLicense.id,
                    price_override: null,
                    is_available: true,
                  },
                });
              }
            }
          }
        }
        setLoadingLicenses(false);
        loadDecisionLayerData();
      }
    }
    loadUser();
  }, []);

  async function createVideoThumbnailFromFirstFrame(videoFile: File) {
    const objectUrl = URL.createObjectURL(videoFile);

    try {
      return await new Promise<Blob | null>((resolve) => {
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = objectUrl;

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
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function detectContentTypeFromFile(selectedFile: File) {
    const mime = (selectedFile.type || "").toLowerCase();
    const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "";

    if (
      mime.startsWith("image/") ||
      ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)
    ) {
      return "image";
    }

    if (
      mime.startsWith("video/") ||
      ["mp4", "mov", "webm", "mkv", "avi", "m4v"].includes(ext)
    ) {
      return "video";
    }

    if (
      mime.startsWith("audio/") ||
      ["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext)
    ) {
      return "audio";
    }

    if (
      mime.includes("javascript") ||
      mime.includes("typescript") ||
      mime.includes("json") ||
      mime.includes("xml") ||
      mime.includes("x-python") ||
      [
        "js",
        "jsx",
        "ts",
        "tsx",
        "py",
        "java",
        "cpp",
        "c",
        "cs",
        "go",
        "rb",
        "php",
        "rs",
        "swift",
        "kt",
        "sql",
        "html",
        "css",
        "xml",
        "yml",
        "yaml",
        "json",
      ].includes(ext)
    ) {
      return "code";
    }

    if (
      mime.startsWith("text/") ||
      ["txt", "md", "rtf", "csv", "log"].includes(ext)
    ) {
      return "text";
    }

    return "other";
  }

  async function handleCreateAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !user) return;

    const priceCents = price ? Math.round(parseFloat(price) * 100) : 0;
    if (priceCents > 0 && Object.keys(selectedLicenses).length === 0) {
      alert("Select at least one license before publishing a paid asset.");
      return;
    }

    setLoading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("assets")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Upload thumbnail for audio/video. For videos, default to first frame.
      let thumbnailPath = null;
      let selectedThumbnail: File | Blob | null = thumbnail;

      if (
        contentType === "video" &&
        !selectedThumbnail &&
        file.type.startsWith("video/")
      ) {
        selectedThumbnail = await createVideoThumbnailFromFirstFrame(file);
      }

      if (
        selectedThumbnail &&
        (contentType === "video" || contentType === "audio")
      ) {
        const thumbExt =
          selectedThumbnail instanceof File
            ? selectedThumbnail.name.split(".").pop() || "jpg"
            : "jpg";
        const thumbFileName = `${user.id}/thumbnails/${Date.now()}.${thumbExt}`;

        const { error: thumbError } = await supabase.storage
          .from("assets")
          .upload(thumbFileName, selectedThumbnail);

        if (!thumbError) {
          thumbnailPath = thumbFileName;
        }
      }

      const { data: assetRow, error: assetInsertError } = await supabase
        .from("assets")
        .insert({
          owner_id: user.id,
          title,
          description,
          content_type: contentType,
          category: selectedCategory,
          subcategory: selectedSubcategory,
          storage_path: fileName,
          thumbnail_path: thumbnailPath,
          price_cents: priceCents,
          ai_model: aiModel || null,
          tags: tags.length > 0 ? tags : null,
          is_public: false,
          moderation_status: "pending",
          // Lineage tags: if a remix was carried in via "List on Marketplace",
          // use its tags so the royalty link to the original creator is kept.
          // Otherwise this is a fresh original — the uploader is the origin.
          origin_creator_id: lineageRef.current?.originCreatorId || user.id,
          origin_license: lineageRef.current?.originLicense || null,
        })
        .select()
        .single();

      if (assetInsertError) throw assetInsertError;
      // Save selected licenses
      const licensesToInsert = Object.values(selectedLicenses).map(
        (license) => ({
          asset_id: assetRow.id,
          license_type_id: license.license_type_id,
          price_override: license.price_override,
          is_available: license.is_available,
        }),
      );

      if (licensesToInsert.length > 0) {
        const { error: licenseError } = await supabase
          .from("asset_licenses")
          .insert(licensesToInsert);

        if (licenseError) console.error("License save error:", licenseError);
      }
      const metadata: {
        asset_id: string;
        file_size: number;
        width: number | null;
        height: number | null;
        duration_seconds: number | null;
        word_count: number | null;
        language: string | null;
        programming_language: string | null;
      } = {
        asset_id: assetRow.id,
        file_size: file.size,
        width: null,
        height: null,
        duration_seconds: null,
        word_count: null,
        language: null,
        programming_language: null,
      };

      if (contentType === "image") {
        await new Promise<void>((resolve) => {
          const img = document.createElement("img");
          img.onload = () => {
            metadata.width = img.width;
            metadata.height = img.height;
            resolve();
          };
          img.src = URL.createObjectURL(file);
        });
      }

      if (
        contentType === "text" ||
        contentType === "prompt" ||
        contentType === "code"
      ) {
        const textContent = await file.text();
        metadata.word_count = textContent.split(/\s+/).length;
      }

      const { error: metaError } = await supabase
        .from("asset_metadata")
        .insert(metadata);

      if (metaError) throw metaError;

      await trackUpload(user.id);

      // ── AI Content Moderation (non-blocking) ──
      // Fire-and-forget with keepalive so the scan survives the redirect below.
      try {
        const { data: { session: modSession } } = await supabase.auth.getSession();
        fetch("/api/assets/moderate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(modSession?.access_token ? { Authorization: `Bearer ${modSession.access_token}` } : {}),
          },
          body: JSON.stringify({ asset_id: assetRow.id }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Silent — moderation failure should not block upload
      }

      router.push("/creator/assets");
    } catch (err: any) {
      console.error(err);
      alert("Error creating asset: " + err.message);
    }

    setLoading(false);
  }

  //
  async function analyzeFile(file: File, detectedType?: string) {
    setAnalyzing(true);
    setAiSuggestions(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contentType", detectedType || contentType);

      const res = await fetch("/api/ai/analyze-asset", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.error) {
        console.error("AI Error:", data.error);
        alert("AI analysis failed. Please fill manually.");
      } else {
        setAiSuggestions(data);
        setShowSuggestions(true);

        // Auto-submit if automation is ON
        if (automationEnabled) {
          setTimeout(() => {
            setTitle(data.title || "");
            setDescription(data.description || "");
            setContentType(data.contentType || contentType);
            setPrice(data.suggestedPrice?.toString() || "");
            setSelectedCategory(data.category || "");
            setSelectedSubcategory(data.subcategory || "");

            setTimeout(() => {
              document
                .querySelector("form")
                ?.dispatchEvent(
                  new Event("submit", { bubbles: true, cancelable: true }),
                );
            }, 1000);
          }, 500);
        }
      }
    } catch (error) {
      console.error("Analysis error:", error);
      alert("AI analysis failed. Please fill manually.");
    } finally {
      setAnalyzing(false);
    }
  }

  function applySuggestion(field: string) {
    if (!aiSuggestions) return;

    switch (field) {
      case "title":
        setTitle(aiSuggestions.title || "");
        break;
      case "description":
        setDescription(aiSuggestions.description || "");
        break;
      case "contentType":
        setContentType(aiSuggestions.contentType || contentType);
        break;
      case "price":
        setPrice(aiSuggestions.suggestedPrice?.toString() || "");
        break;
      case "category":
        setSelectedCategory(aiSuggestions.category || "");
        break;
      case "subcategory":
        setSelectedSubcategory(aiSuggestions.subcategory || "");
        break;
      case "tags":
        if (Array.isArray(aiSuggestions.tags)) {
          setTags(aiSuggestions.tags.slice(0, 8));
        }
        break;
      case "all":
        setTitle(aiSuggestions.title || "");
        setDescription(aiSuggestions.description || "");
        setContentType(aiSuggestions.contentType || contentType);
        setPrice(aiSuggestions.suggestedPrice?.toString() || "");
        setSelectedCategory(aiSuggestions.category || "");
        setSelectedSubcategory(aiSuggestions.subcategory || "");
        if (Array.isArray(aiSuggestions.tags)) {
          setTags(aiSuggestions.tags.slice(0, 8));
        }
        setShowSuggestions(false);
        break;
    }
  }
  //
  // AI Suggestions Content Component with Typing Effects
  function AISuggestionsContent({
    aiSuggestions,
    applySuggestion,
  }: {
    aiSuggestions: any;
    applySuggestion: (field: string) => void;
  }) {
    return (
      <div className="space-y-6">
        {/* Quality Score */}
        {aiSuggestions.qualityScore && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Quality Score</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full">
                <div
                  className="h-full bg-red-500 rounded-full transition-all duration-1000"
                  style={{ width: `${aiSuggestions.qualityScore * 10}%` }}
                />
              </div>
              <span className="text-sm">{aiSuggestions.qualityScore}/10</span>
            </div>
          </div>
        )}

        {/* Title */}
        {aiSuggestions.title && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Suggested Title</p>
            <div className="bg-white/5 p-3 rounded">
              <p className="text-sm">{aiSuggestions.title}</p>
            </div>
            <button
              onClick={() => applySuggestion("title")}
              type="button"
              className="text-xs text-red-400 hover:text-red-300 mt-2"
            >
              Apply →
            </button>
          </div>
        )}

        {/* Description */}
        {aiSuggestions.description && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Suggested Description</p>
            <div
              className="bg-white/5 p-3 rounded max-h-32 overflow-y-auto"
              data-lenis-prevent
            >
              <p className="text-xs text-gray-300">
                {aiSuggestions.description}
              </p>
            </div>
            <button
              onClick={() => applySuggestion("description")}
              type="button"
              className="text-xs text-red-400 hover:text-red-300 mt-2"
            >
              Apply →
            </button>
          </div>
        )}

        {/* Tags */}
        {aiSuggestions.tags && aiSuggestions.tags.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Tags</p>
            <div className="flex flex-wrap gap-2">
              {aiSuggestions.tags.slice(0, 6).map((tag: string, i: number) => (
                <span key={i} className="px-2 py-1 bg-white/10 text-xs rounded">
                  {tag}
                </span>
              ))}
            </div>
            <button
              onClick={() => applySuggestion("tags")}
              type="button"
              className="text-xs text-red-400 hover:text-red-300 mt-2"
            >
              Apply →
            </button>
          </div>
        )}

        {/* Category & Subcategory */}
        {(aiSuggestions.category || aiSuggestions.subcategory) && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Suggested Category</p>
            <div className="bg-white/5 p-3 rounded">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium capitalize">
                  {aiSuggestions.category}
                </span>
                {aiSuggestions.subcategory && (
                  <>
                    <span className="text-gray-500">→</span>
                    <span className="text-sm text-red-400">
                      {aiSuggestions.subcategory}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                applySuggestion("category");
                applySuggestion("subcategory");
              }}
              type="button"
              className="text-xs text-red-400 hover:text-red-300 mt-2"
            >
              Apply →
            </button>
          </div>
        )}

        {/* Recommendations */}
        {aiSuggestions.recommendations &&
          aiSuggestions.recommendations.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Recommendations</p>
              <ul className="space-y-1">
                {aiSuggestions.recommendations
                  .slice(0, 4)
                  .map((rec: string, i: number) => (
                    <li key={i} className="text-xs text-gray-300 flex gap-2">
                      <span className="text-red-400">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

        {/* Apply All */}
        <button
          onClick={() => applySuggestion("all")}
          type="button"
          className="w-full py-2 bg-red-600 hover:bg-red-500 text-sm rounded flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" weight="bold" />
          Apply All
        </button>
      </div>
    );
  }
  //
  function mapContentType(contextType: string): string {
    const mapping: Record<string, string> = {
      "logo-branding": "image",
      illustration: "image",
      "photo-realistic": "image",
      "3d-render": "image",
      abstract: "image",
      audio: "audio",
      video: "video",
      other: "other",
    };
    return mapping[contextType] || contextType;
  }

  function extractPrice(pricingString?: string): number {
    if (!pricingString) return 0;
    const match = pricingString.match(/\$?(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
  //
  function toggleLicense(licenseTypeId: string) {
    setSelectedLicenses((prev) => {
      const newState = { ...prev };
      if (newState[licenseTypeId]) {
        delete newState[licenseTypeId];
      } else {
        newState[licenseTypeId] = {
          license_type_id: licenseTypeId,
          price_override: null,
          is_available: true,
        };
      }
      return newState;
    });
  }

  function updateLicensePrice(licenseTypeId: string, priceOverride: string) {
    setSelectedLicenses((prev) => ({
      ...prev,
      [licenseTypeId]: {
        ...prev[licenseTypeId],
        price_override: priceOverride ? parseInt(priceOverride) * 100 : null,
      },
    }));
  }

  // ADD THIS FUNCTION
  function loadDecisionLayerData() {
    const storedData = sessionStorage.getItem("decisionLayerData");
    if (!storedData) return;

    try {
      const data = JSON.parse(storedData);
      const { evaluation, context = {}, uploadedFiles, lineage } = data;

      // Remember lineage tags (set when a remix is listed via "List on Marketplace").
      lineageRef.current = lineage || null;

      // Pre-populate with evaluation data (initial suggestions from Decision Layer)
      setAiSuggestions({
        title: evaluation.title || "",
        description: evaluation.reason || "",
        contentType: mapContentType(context.contentType),
        suggestedPrice:
          evaluation.honestPricing?.low ||
          extractPrice(evaluation.pricingGuidance?.currentRange) ||
          extractPrice(evaluation.pricingGuidance?.range) ||
          0,
        qualityScore: 8,
        tags: [
          context.contentType,
          context.targetAudience,
          context.qualityLevel,
        ].filter(Boolean),
        recommendations: evaluation.suggestions || [],
      });
      // Auto-set category based on content type
      const ct = mapContentType(context.contentType);
      setContentType(ct);
      if (ct === "audio") setSelectedCategory("audio");
      else if (ct === "video") setSelectedCategory("video");
      else setSelectedCategory("visual");
      setPrice(
        (
          evaluation.honestPricing?.low ||
          extractPrice(evaluation.pricingGuidance?.currentRange) ||
          extractPrice(evaluation.pricingGuidance?.range) ||
          0
        ).toString(),
      );
      // Load the first uploaded image file
      if (uploadedFiles && uploadedFiles.length > 0) {
        const firstFile = uploadedFiles[0];
        // Convert base64 back to File object
        fetch(firstFile.base64)
          .then((res) => res.blob())
          .then((blob) => {
            const mimeMap: Record<string, string> = {
              mp3: "audio/mpeg",
              wav: "audio/wav",
              mp4: "video/mp4",
              png: "image/png",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              webp: "image/webp",
            };
            const ext = firstFile.name.split(".").pop()?.toLowerCase() || "";
            const mime = mimeMap[ext] || `${firstFile.type}/${ext}`;
            const file = new File([blob], firstFile.name, { type: mime });
            setFile(file);

            // ADD THIS: Trigger AI re-analysis for refined suggestions
            analyzeFile(file);
          })
          .catch((err) => console.error("Error loading file:", err));
      } else {
        // If no file but have suggestions, just show them
        setShowSuggestions(true);
      }

      // Clear storage after loading
      sessionStorage.removeItem("decisionLayerData");
    } catch (error) {
      console.error("Error loading decision layer data:", error);
    }
  }

  //

  if (!user) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-400 text-sm font-light">
          Checking authentication...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-white/5 bg-black/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-light tracking-tight">Create Asset</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Upload and configure your digital asset
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-asset-form"
              disabled={loading || !file}
              className="px-5 py-2 bg-red-600 hover:bg-red-500 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <SpinnerGap className="w-3 h-3 animate-spin" />}
              {loading ? "Creating..." : "Create Asset"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-6">
        <form id="create-asset-form" onSubmit={handleCreateAsset}>
          <div className="flex flex-col md:flex-row gap-0 items-start w-full">
            <div
              className={`transition-all duration-500 ease-in-out flex flex-col md:flex-row gap-4 md:gap-8 ${
                showSuggestions || analyzing
                  ? "w-full md:w-2/3 md:pr-8"
                  : "w-full"
              }`}
            >
              {/* Left: File Upload */}
              <div className="w-full md:w-64 shrink-0">
                <input
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.txt,.md,.json,.js,.jsx,.ts,.tsx,.py,.css,.html,.xml,.yml,.yaml"
                  onChange={async (e) => {
                    const selectedFile = e.target.files?.[0] || null;
                    setFile(selectedFile);
                    if (!selectedFile) {
                      setThumbnail(null);
                      return;
                    }

                    const detectedType =
                      detectContentTypeFromFile(selectedFile);
                    setContentType(detectedType);

                    if (detectedType === "video") {
                      const generatedThumbBlob =
                        await createVideoThumbnailFromFirstFrame(selectedFile);

                      if (generatedThumbBlob) {
                        const baseName = selectedFile.name.replace(
                          /\.[^/.]+$/,
                          "",
                        );
                        setThumbnail(
                          new File(
                            [generatedThumbBlob],
                            `${baseName}-thumb.jpg`,
                            {
                              type: "image/jpeg",
                            },
                          ),
                        );
                      } else {
                        setThumbnail(null);
                      }
                    } else {
                      setThumbnail(null);
                    }

                    await analyzeFile(selectedFile, detectedType);

                    // If automation is ON, auto-publish the asset
                    if (automationEnabled) {
                      // Wait for AI analysis to complete
                      setTimeout(() => {
                        if (aiSuggestions) {
                          applySuggestion("all"); // Apply all AI suggestions

                          // Auto-submit form
                          setTimeout(() => {
                            const form = document.querySelector("form");
                            if (form) {
                              form.dispatchEvent(
                                new Event("submit", {
                                  bubbles: true,
                                  cancelable: true,
                                }),
                              );
                            }
                          }, 500);
                        }
                      }, 3000); // Wait 3 seconds for AI analysis
                    }
                  }}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="block w-full h-full min-h-[320px] p-4 bg-white/[0.02] border border-white/10 hover:border-red-500/30 transition-all cursor-pointer relative overflow-hidden"
                >
                  {file ? (
                    // File Preview
                    <div className="h-full flex flex-col">
                      {/* Preview Area */}
                      <div className="flex-1 flex items-center justify-center mb-4">
                        {file.type.startsWith("image/") ? (
                          <img
                            src={URL.createObjectURL(file)}
                            alt="Preview"
                            className="max-w-full max-h-full object-contain rounded"
                          />
                        ) : file.type.startsWith("video/") ? (
                          <video
                            src={URL.createObjectURL(file)}
                            controls
                            className="max-w-full max-h-full rounded"
                          />
                        ) : file.type.startsWith("audio/") ? (
                          <div className="w-full">
                            <MusicNote className="w-16 h-16 text-red-400 mb-4 mx-auto" />
                            <audio
                              src={URL.createObjectURL(file)}
                              controls
                              className="w-full"
                            />
                          </div>
                        ) : (
                          <div className="text-center">
                            {contentType === "code" ? (
                              <CodeIcon className="w-16 h-16 text-red-400 mb-2 mx-auto" />
                            ) : contentType === "text" ? (
                              <FileText className="w-16 h-16 text-red-400 mb-2 mx-auto" />
                            ) : (
                              <FileIcon className="w-16 h-16 text-red-400 mb-2 mx-auto" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* File Info */}
                      <div className="bg-black/60 backdrop-blur-sm p-3 rounded space-y-1">
                        <p className="text-xs text-white font-medium truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {(file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                  ) : (
                    // Default Upload UI
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <Upload className="w-8 h-8 text-gray-700 mb-3" />
                      <p className="text-xs font-medium text-gray-400 mb-1">
                        Drop file or click
                      </p>
                      <p className="text-[10px] text-gray-600">
                        AI analyzes automatically
                      </p>
                    </div>
                  )}
                </label>

                {(contentType === "video" || contentType === "audio") && (
                  <div className="mt-3">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Thumbnail (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        setThumbnail(e.target.files?.[0] || null)
                      }
                      className="hidden"
                      id="thumbnail-upload"
                    />
                    <label
                      htmlFor="thumbnail-upload"
                      className="block w-full p-4 bg-white/5 border border-dashed border-white/20 hover:border-red-500/40 transition-all cursor-pointer"
                    >
                      {thumbnail ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={URL.createObjectURL(thumbnail)}
                            alt="Thumbnail"
                            className="w-16 h-16 object-cover rounded"
                          />
                          <div className="flex-1">
                            <p className="text-xs text-white truncate">
                              {thumbnail.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(thumbnail.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setThumbnail(null);
                            }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <ImageIcon className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                          <p className="text-xs text-gray-500">
                            Add cover image for your {contentType}
                          </p>
                          {contentType === "video" && (
                            <p className="text-[10px] text-gray-600 mt-1">
                              First video frame is used automatically if left
                              empty
                            </p>
                          )}
                        </div>
                      )}
                    </label>
                  </div>
                )}
              </div>
              {/* Middle: Form Fields */}
              <div className="flex-1 space-y-3">
                {/* Title & Description Row */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Title
                    </label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 focus:border-red-500/50 outline-none text-sm transition-all"
                      placeholder="Asset name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 focus:border-red-500/50 outline-none text-sm min-h-[80px] resize-none transition-all"
                      placeholder="Describe your asset..."
                    />
                  </div>
                </div>

                {/* 4-Column Grid for dropdowns */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Type
                    </label>
                    <select
                      value={contentType}
                      onChange={(e) => setContentType(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 focus:border-red-500/50 outline-none text-sm appearance-none cursor-pointer transition-all"
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
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Price
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-white/[0.03] border border-white/10 focus:border-red-500/50 outline-none text-sm transition-all"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  {/* Marketplace Category */}
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Category
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setSelectedSubcategory("");
                        if (e.target.value === "visual")
                          setContentType("image");
                        else if (e.target.value === "video")
                          setContentType("video");
                        else if (e.target.value === "audio")
                          setContentType("audio");
                      }}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 focus:border-red-500/50 outline-none text-sm appearance-none cursor-pointer transition-all"
                      required
                    >
                      <option value="" className="bg-black">
                        Select
                      </option>
                      {Object.entries(marketplaceCategories).map(
                        ([key, category]) => (
                          <option key={key} value={key} className="bg-black">
                            {category.label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  {/* Subcategory */}
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Subcategory
                    </label>
                    <select
                      value={selectedSubcategory}
                      onChange={(e) => setSelectedSubcategory(e.target.value)}
                      className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 focus:border-red-500/50 outline-none text-sm appearance-none cursor-pointer transition-all disabled:opacity-40"
                      disabled={!selectedCategory}
                      required
                    >
                      <option value="" className="bg-black">
                        {selectedCategory ? "Select" : "—"}
                      </option>
                      {selectedCategory &&
                        marketplaceCategories[
                          selectedCategory as keyof typeof marketplaceCategories
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
                </div>

                {/* AI Model */}
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                    AI Model
                  </label>
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="e.g. Midjourney v6.1, DALL-E 3, Suno v4"
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 focus:border-red-500/50 outline-none text-sm transition-all"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                    Tags
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-white/[0.03] border border-white/10 focus-within:border-red-500/50 transition-all min-h-[38px]">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-[11px] text-red-200 rounded"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() =>
                            setTags((prev) => prev.filter((t) => t !== tag))
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
                          if (t && !tags.includes(t) && tags.length < 8) {
                            setTags((prev) => [...prev, t]);
                          }
                          setTagInput("");
                        } else if (
                          e.key === "Backspace" &&
                          !tagInput &&
                          tags.length > 0
                        ) {
                          setTags((prev) => prev.slice(0, -1));
                        }
                      }}
                      placeholder={
                        tags.length === 0
                          ? "Add tags (press Enter or comma)"
                          : tags.length >= 8
                            ? "Max 8 tags"
                            : "Add another…"
                      }
                      disabled={tags.length >= 8}
                      className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-white placeholder-gray-600"
                    />
                  </div>
                </div>

                {/* License Selection */}
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-2 uppercase tracking-wider">
                    Available Licenses
                  </label>

                  {loadingLicenses ? (
                    <div className="text-xs text-gray-500">
                      Loading licenses...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {licenseTypes.map((license) => {
                        const isSelected = !!selectedLicenses[license.id];
                        const basePrice = price ? parseFloat(price) : 0;
                        const calculatedPrice =
                          basePrice * parseFloat(license.price_multiplier);
                        const customPrice = selectedLicenses[license.id]
                          ?.price_override
                          ? selectedLicenses[license.id].price_override / 100
                          : null;

                        return (
                          <div
                            key={license.id}
                            onClick={() => toggleLicense(license.id)}
                            className={`p-3 border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-red-500/5 border-red-500/20"
                                : "bg-white/[0.02] border-white/5 hover:border-white/10"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="w-3.5 h-3.5 accent-red-500 cursor-pointer"
                                />
                                <span className="text-xs font-medium">
                                  {license.name}
                                </span>
                                <span className="text-[10px] text-gray-600">
                                  ×{license.price_multiplier}
                                </span>
                                {isSelected && (
                                  <span className="text-xs text-red-400 ml-auto">
                                    $
                                    {customPrice?.toFixed(2) ||
                                      calculatedPrice.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
                                <span className="text-[10px] text-gray-500">
                                  Custom:
                                </span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder={calculatedPrice.toFixed(2)}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    updateLicensePrice(
                                      license.id,
                                      e.target.value,
                                    )
                                  }
                                  className="w-20 px-2 py-1 bg-white/5 border border-white/10 text-[10px] text-right"
                                />
                                <div className="flex gap-1 ml-auto">
                                  {(() => {
                                    const rule = getLicenseRule(license.slug);
                                    if (!rule) return null;
                                    return (
                                      <>
                                        {rule.canRemix && (
                                          <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[9px]">
                                            Remix
                                          </span>
                                        )}
                                        {rule.canResell && (
                                          <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-[9px]">
                                            Resell
                                          </span>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {price &&
                    parseFloat(price) > 0 &&
                    Object.keys(selectedLicenses).length === 0 &&
                    !loadingLicenses && (
                      <p className="text-xs text-red-400 mt-2">
                        Select at least one license before publishing a paid asset.
                      </p>
                    )}
                </div>
              </div>
            </div>
            {/* Right: AI Suggestions */}
            {(showSuggestions || analyzing) && (
              <div
                className="w-full md:w-1/3 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-8 md:sticky md:top-24"
                style={{ maxHeight: "calc(100vh - 8rem)" }}
              >
                <div className="flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <MagicWand className="w-4 h-4 text-red-400" />
                      <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">
                        AI Analysis
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowSuggestions(false)}
                      className="text-gray-500 hover:text-white transition-colors cursor-pointer"
                      type="button"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {analyzing ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12">
                      <SpinnerGap className="w-6 h-6 text-red-400 mb-3 animate-spin" />
                      <p className="text-xs text-gray-500">Analyzing...</p>
                    </div>
                  ) : aiSuggestions ? (
                    <AISuggestionsContent
                      aiSuggestions={aiSuggestions}
                      applySuggestion={applySuggestion}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
