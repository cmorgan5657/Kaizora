"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  AlertCircle,
  Lock,
  Upload,
  RotateCcw,
  Sparkles,
  Bot,
  Send,
  RefreshCw,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import AudioStudio from "@/app/components/AudioStudio";
import InsufficientCreditsBadge from "@/app/components/InsufficientCreditsBadge";
import CreditGate from "@/app/components/CreditGate";
import { useCreditBalance, useActionCost } from "@/app/hooks/useCreditStatus";
import { getRemixCreditActionKey } from "@/lib/creditPricing";

export default function RegenerateStudio() {
  const router = useRouter();
  const params = useParams();
  const assetId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("anonymous");
  const [showSettings, setShowSettings] = useState(false);

  const [aiMode, setAiMode] = useState("variation");

  const [selectedStyle, setSelectedStyle] = useState("anime");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  // ADD THESE NEW STATE VARIABLES:
  const [enableUpscale, setEnableUpscale] = useState(false);
  const [generationStage, setGenerationStage] = useState("");
  const [quality, setQuality] = useState<"fast" | "balanced" | "best">(
    "balanced",
  );
  const [audioDuration, setAudioDuration] = useState(8);
  const [audioModel, setAudioModel] = useState("stereo-large");

  // Credits: disable generation when the user can't afford the current action.
  const creditBalance = useCreditBalance();
  const actionCost = useActionCost(
    getRemixCreditActionKey(aiMode, audioDuration),
  );
  const creditsInsufficient =
    creditBalance !== null &&
    actionCost !== null &&
    actionCost > 0 &&
    creditBalance < actionCost;

  const [audioType, setAudioType] = useState("music");
  const [voiceType, setVoiceType] = useState("narration");
  const [scenePreview, setScenePreview] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{ url: string; mode: string; timestamp: number; sceneUrl?: string }>
  >([]);

  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [lockCharacter, setLockCharacter] = useState(true);
  const [selectedModel, setSelectedModel] = useState("default");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState<number | null>(null);
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const [clearedAsset, setClearedAsset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [agentMessages, setAgentMessages] = useState<
    Array<{
      id: string;
      role: "agent" | "user";
      content: string;
      actions?: Array<{
        label: string;
        icon: "refresh" | "external";
        onClick: () => void;
      }>;
    }>
  >([]);
  const [agentInput, setAgentInput] = useState("");
  const [isAILoading, setIsAILoading] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [vidMode, setVidMode] = useState("flex_1");
  const conversationHistory = useRef<Array<{ role: string; content: string }>>(
    [],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const agentInputRef = useRef<HTMLTextAreaElement>(null);
  const greetingFired = useRef(false);
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const uploadedPreviewUrls = useMemo(
    () => uploadedFiles.map((file) => URL.createObjectURL(file)),
    [uploadedFiles],
  );

  useEffect(() => {
    async function loadAsset() {
      if (assetId === "new") {
        try {
          const raw = sessionStorage.getItem("kaizora_remix_session");
          if (!raw) {
            sessionStorage.setItem("kz_decision_layer_welcome_trigger", "1");
            router.push("/decision-layer");
            return;
          }
          const session = JSON.parse(raw);
          // Build asset from Decision Layer temp storage
          const firstFile = session.uploadedAssets?.[0];
          const inferContentTypeFromPath = (path?: string) => {
            if (!path) return "";
            const ext = path.split(".").pop()?.toLowerCase();
            if (!ext) return "";
            if (["mp4", "mov", "webm", "mkv"].includes(ext)) {
              return "video/mp4";
            }
            if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) {
              return "audio/mpeg";
            }
            if (["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext)) {
              return "image/png";
            }
            return "";
          };

          const firstFileType =
            firstFile?.content_type ||
            inferContentTypeFromPath(firstFile?.storagePath);

          const contentType = firstFileType?.startsWith("video/")
            ? "video"
            : firstFileType?.startsWith("audio/")
              ? "audio"
              : "image";

          const publicTempStorageUrl = (path: string) =>
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/decision-layer-temp/${path}`;

          const resolveAccessibleTempUrl = async (path?: string) => {
            if (!path) return null;

            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("decision-layer-temp")
                .createSignedUrl(path, 60 * 60);

            if (!signedError && signedData?.signedUrl) {
              return signedData.signedUrl;
            }

            return publicTempStorageUrl(path);
          };

          const resolvedFirstFileUrl = await resolveAccessibleTempUrl(
            firstFile?.storagePath,
          );

          setAsset({
            id: "new",
            title: "Decision Layer Content",
            content_type: contentType,
            storage_path: null,
            _tempStorageUrl: resolvedFirstFileUrl,
          });

          // Download files into File objects for local previews/composition.
          if (session.uploadedAssets?.length > 0) {
            const files = await Promise.all(
              session.uploadedAssets.map(async (a: any) => {
                try {
                  const storagePath = a?.storagePath as string | undefined;
                  if (!storagePath) return null;

                  let blob: Blob | null = null;

                  const { data: downloadedBlob, error: downloadError } =
                    await supabase.storage
                      .from("decision-layer-temp")
                      .download(storagePath);

                  if (!downloadError && downloadedBlob) {
                    blob = downloadedBlob;
                  }

                  if (!blob) {
                    const url = await resolveAccessibleTempUrl(storagePath);
                    if (!url) return null;
                    const res = await fetch(url);
                    if (!res.ok) return null;
                    blob = await res.blob();
                  }

                  const fileName =
                    a?.name || storagePath.split("/").pop() || "asset";
                  const mimeType =
                    a?.content_type || blob.type || "application/octet-stream";

                  return new File([blob], fileName, { type: mimeType });
                } catch (error) {
                  console.error("Failed to load Decision Layer file:", error);
                  return null;
                }
              }),
            );

            const validFiles = files.filter((f): f is File => Boolean(f));
            if (validFiles.length > 0) {
              setUploadedFiles(validFiles);
              setClearedAsset(true);
            } else {
              // Keep original preview visible if file conversion failed.
              setClearedAsset(false);
            }
          }

          // Pre-fill prompt
          if (session.firstPrompt) {
            setCustomPrompt(session.firstPrompt);
          }
          // Store pricing from Decision Layer for later use
          if (session.suggestedPrice) {
            sessionStorage.setItem("kaizora_dl_price", session.suggestedPrice);
          }

          if (contentType === "video") {
            setAiMode("vid2vid");
          } else if (contentType === "audio") {
            setAiMode("aud2aud");
            setSelectedModel("auto"); // default aud2aud model
          } else {
            setAiMode("variation");
          }

          setLoading(false);
        } catch (e) {
          console.error("Session load error:", e);
          sessionStorage.setItem("kz_decision_layer_welcome_trigger", "1");
          router.push("/decision-layer");
        }
        return;
      }

      // ─── Normal mode: load from Supabase ───
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirectTo=/remix");
        return;
      }
      setCurrentUserId(user.id);

      const { data: assetData } = await supabase
        .from("assets")
        .select("*")
        .eq("id", assetId)
        .single();

      if (!assetData) {
        router.push("/remix");
        return;
      }

      setAsset(assetData);
      setLoading(false);
    }

    if (assetId) {
      loadAsset();
    }
  }, [assetId, router]);

  function storageUrl(path?: string | null) {
    // Decision Layer mode: use temp storage URL
    if (asset?._tempStorageUrl) return asset._tempStorageUrl;
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}`;
  }
  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratedUrl(null);
    setScenePreview(null); // ✅ ADD THIS LINE
    setGenerationStage("analyzing");
    try {
      let finalImageUrl = storageUrl(asset?.storage_path);

      if (clearedAsset && uploadedFiles.length > 0) {
        const file = uploadedFiles[0];

        // For vid2vid with video files we need an actual URL (not base64).
        if (file.type.startsWith("video/") && aiMode === "vid2vid") {
          if (asset?._tempStorageUrl) {
            finalImageUrl = asset._tempStorageUrl;
          } else {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            const userId = user?.id || "anonymous";
            const ext = file.name.split(".").pop() || "mp4";
            const storagePath = `${userId}/remix-video-${Date.now()}.${ext}`;

            const { error: uploadError } = await supabase.storage
              .from("decision-layer-temp")
              .upload(storagePath, file, {
                contentType: file.type,
                upsert: true,
              });

            if (uploadError) throw uploadError;

            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("decision-layer-temp")
                .createSignedUrl(storagePath, 60 * 60);

            if (signedError || !signedData?.signedUrl) {
              throw new Error("Failed to create signed URL for video remix.");
            }

            finalImageUrl = signedData.signedUrl;
          }
        } else if (file.type.startsWith("audio/") && aiMode === "aud2aud") {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const userId = user?.id || "anonymous";
          const fileName = `remix-audio-${Date.now()}.${file.name.split(".").pop()}`;
          const storagePath = `${userId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("audio-temp")
            .upload(storagePath, file, {
            contentType: file.type,
            upsert: true,
          });
          if (uploadError) throw uploadError;

          const { data: signedData, error: signedError } =
            await supabase.storage
              .from("audio-temp")
              .createSignedUrl(storagePath, 60 * 60);

          if (signedError || !signedData?.signedUrl) {
            throw new Error("Failed to create signed URL for audio remix.");
          }

          finalImageUrl = signedData.signedUrl;
        } else {
          finalImageUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        }
      }
      if (!finalImageUrl) {
        alert("No image source found");
        setGenerating(false);
        return;
      }
      // ✅ ADD THIS: For video with prompt, show scene generation stage
      if (aiMode === "video" && customPrompt.trim().length > 0) {
        setGenerationStage("generating_scene");
      } else {
        setGenerationStage("enhancing");
      }
      console.log("🔵 Requesting generation with imageUrl:", finalImageUrl);

      const response = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: finalImageUrl,
          prompt: aiMode === "style" ? selectedStyle : customPrompt,

          mode: aiMode,
          remixModel: selectedModel,
          upscale: enableUpscale,
          quality,
          audioDuration,
          audioModel,
          audioType:
            selectedModel === "fullsong"
              ? "fullsong"
              : selectedModel === "acestep"
                ? "acestep"
                : audioType,
          voiceType,
          aspectRatio,
          selectedModel: aiMode === "char" ? "pulid" : selectedModel,
          lockCharacter,
          userId: currentUserId,
          vidMode,
        }),
      });

      const result = await response.json();
      console.log("🔵 API Response:", result);
      setGenerationStage("finalizing");
      if (result.success) {
        console.log("🟢 Generated URL:", result.url);
        setGeneratedUrl(result.url);
        // Store intent from smart router for review page
        if (result.intent) {
          setSelectedModel(result.intent);
        }
        // ✅ ADD THIS: Store scene preview if 2-step generation
        if (result.sceneUrl) {
          setScenePreview(result.sceneUrl);
        }

        setHistory((prev) =>
          [
            {
              url: result.url,
              mode: aiMode,
              timestamp: Date.now(),
              sceneUrl: result.sceneUrl, // ✅ ADD THIS
            },
            ...prev,
          ].slice(0, 10),
        );
      } else {
        console.error("🔴 Generation failed:", result.error);
        alert(`Generation failed: ${result.error}`);
      }
    } catch (error) {
      console.error("🔴 Generation error:", error);
      alert("Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const handleUseGenerated = () => {
    const modeLabel = MODES.find((m) => m.value === aiMode)?.label || aiMode;
    const modelLabel =
      MODEL_OPTIONS[aiMode]?.find((m) => m.value === selectedModel)?.label ||
      selectedModel;
    const session = sessionStorage.getItem("kaizora_remix_session");
    const dlPrice = session
      ? JSON.parse(session)?.evaluation?.honestPricing?.low
      : null;

    sessionStorage.setItem(
      `remix_${assetId}`,
      JSON.stringify({
        mode: "regenerate",
        generatedUrl,
        aiMode,
        modeLabel,
        modelLabel,
        prompt: customPrompt,
        aspectRatio,
        duration: showDuration ? audioDuration : undefined,
        lockCharacter,
        quality,
        price: dlPrice || null,
      }),
    );
    router.push(`/remix/review/${assetId}`);
  };
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [agentMessages, showTyping]);
  useEffect(() => {
    const textarea = agentInputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [agentInput]);
  useEffect(() => {
    return () => {
      uploadedPreviewUrls.forEach((previewUrl) => {
        URL.revokeObjectURL(previewUrl);
      });
    };
  }, [uploadedPreviewUrls]);
  useEffect(() => {
    if (!asset || greetingFired.current) return;
    greetingFired.current = true;

    // ─── Decision Layer mode: show remix plan as greeting ───
    if (assetId === "new") {
      try {
        const raw = sessionStorage.getItem("kaizora_remix_session");
        if (raw) {
          const session = JSON.parse(raw);
          if (session.remixPlan) {
            const planId = uid();
            setAgentMessages([
              {
                id: uid(),
                role: "agent",
                content:
                  "**Welcome to Remix Studio!** Here's your remix plan from the Decision Layer:\n\n",
              },
              {
                id: planId,
                role: "agent",
                content: session.remixPlan,
              },
              {
                id: uid(),
                role: "agent",
                content:
                  "Your first prompt is pre-filled. Hit **Create** when ready, or ask me anything about the plan.",
              },
            ]);
            return;
          }
        }
      } catch (e) {
        console.error("Session greeting error:", e);
      }
    }

    // ─── Normal mode: stream greeting from API ───
    const greetingId = uid();
    let greetingStarted = false;
    setShowTyping(true);

    fetch("/api/creator-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isGreeting: true,
        userId: currentUserId,
        context: {
          assetTitle: asset?.title,
          assetType: asset?.content_type,
          currentMode: aiMode,
          hasResult: false,
        },
        messages: [],
      }),
    })
      .then(async (res) => {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let full = "";
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            full += decoder.decode(value, { stream: true });
            if (!greetingStarted) {
              greetingStarted = true;
              setShowTyping(false);
            }
            setAgentMessages([{ id: greetingId, role: "agent", content: full }]);
          }
        }
        if (!greetingStarted) {
          setShowTyping(false);
          setAgentMessages([
            {
              id: greetingId,
              role: "agent",
              content:
                `Welcome to the floor. We’ve got "${asset?.title || "your asset"}" locked and loaded, and we’re ready to push this into something iconic. Let’s break the mold—what’s the vision for this iteration? ⚡️`,
            },
          ]);
        }
      })
      .catch(() => {
        setShowTyping(false);
        setAgentMessages([
          {
            id: greetingId,
            role: "agent",
            content: `Welcome to the floor. We’ve got "${asset?.title || "your asset"}" locked and loaded, and we’re ready to push this into something iconic. Let’s break the mold—what’s the vision for this iteration? ⚡️`,
          },
        ]);
      });
  }, [asset]);
  // Watch generation state for agent messages
  useEffect(() => {
    if (generating) {
      addAgentMessage(
        `Starting ${aiMode === "video" ? "remix" : "regeneration"}…`,
      );
    }
  }, [generating]);

  useEffect(() => {
    if (generatedUrl) {
      triggerSuccessAnalysis();
    }
  }, [generatedUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Skeleton className="h-10 w-full bg-white/10" />
        <div className="max-w-3xl mx-auto px-3 py-3">
          <Skeleton className="h-96 w-full bg-white/5" />
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-xs font-light text-gray-400">Asset not found</p>
      </div>
    );
  }

  const imageUrl = storageUrl(asset.storage_path);
  const limitReached = false;
  const MODEL_OPTIONS: Record<
    string,
    Array<{ value: string; label: string; description?: string }>
  > = {
    variation: [{ value: "default", label: "Flux 1.1 Pro Ultra" }],
    custom: [
      { value: "default", label: "Flux Dev" },
      { value: "ideogram", label: "Ideogram V2 Turbo" },
      { value: "nanobanana", label: "Nano Banana Pro" },
    ],
    char: [{ value: "pulid", label: "Flux PuLID (Face Lock)" }],
    video: [
      { value: "default", label: "Minimax Video-01" },
      { value: "kling", label: "Kling 2.5 Turbo Pro" },
      { value: "seeddance", label: "SeedDance 2.0" },
    ],
    vid2vid: [
      { value: "default", label: "Luma Modify Video" },
      { value: "wan", label: "Wan 2.1 i2v (First Frame)" },
    ],
    aud2aud: [
      {
        value: "auto",
        label: "Smart Auto (AI Picks)",
        description: "AI picks the best model for your prompt",
      },
      {
        value: "melody",
        label: "MusicGen Melody",
        description: "Remixes in a new style. Max 30 seconds",
      },
      {
        value: "chord",
        label: "MusicGen Chord",
        description: "Chord-based remix. Max 30 seconds",
      },
      {
        value: "remixer",
        label: "MusicGen Remixer",
        description: "Remix but keeps your original vocals. Max 30 seconds",
      },
      {
        value: "fullsong",
        label: "MiniMax Music ✦ Full Song",
        description: "Full song with vocals + instruments. Up to 4 minutes",
      },
      {
        value: "acestep",
        label: "ACE-Step ✦ Full Song + Lyrics",
        description: "Full song with custom lyrics. Up to 4 minutes",
      },
    ],
    audio: [
      {
        value: "default",
        label: "MusicGen (30s)",
        description:
          "Quick instrumental clips up to 30 seconds from a text prompt",
      },
      {
        value: "fullsong",
        label: "MiniMax Music (4 min)",
        description:
          "Full songs with vocals and instrumentation, up to 4 minutes",
      },
      {
        value: "acestep",
        label: "ACE-Step (4 min + Lyrics)",
        description:
          "Full songs with custom lyrics and style tags, up to 4 minutes",
      },
    ],
    style: [{ value: "default", label: "Flux 1.1 Pro" }],
  };
  const MODES = [
    { value: "variation", label: "Img2Img", icon: "🖼️" },
    { value: "custom", label: "Txt2Img", icon: "✏️" },
    { value: "char", label: "Char2Img", icon: "🧑‍🎨" },
    { value: "video", label: "Img2Vid", icon: "🎬" },
    { value: "vid2vid", label: "Vid2Vid", icon: "🔄" },
    { value: "audio", label: "Generate Music", icon: "🎵" },
    { value: "aud2aud", label: "Aud2Aud", icon: "🔄" },
    { value: "style", label: "Editor Toolkits", icon: "🎨" },
  ];

  const ASPECT_RATIOS = [
    { value: "1:1", label: "Square" },
    { value: "3:4", label: "Portrait" },
    { value: "16:9", label: "Landscape" },
    { value: "9:16", label: "Tall" },
  ];

  const showComposition = [
    "variation",
    "char",
    "video",
    "vid2vid",
    "aud2aud",
  ].includes(aiMode);
  const showDuration = ["video", "vid2vid", "audio"].includes(aiMode);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(
      (f) => f.size <= 50 * 1024 * 1024,
    );
    setUploadedFiles((prev) => [...prev, ...files]);
  };
  const removeFile = (idx: number) =>
    setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));
  //
  const stageProgress =
    generationStage === "analyzing"
      ? 15
      : generationStage === "generating_scene"
        ? 35
        : generationStage === "enhancing"
          ? 55
          : generationStage === "generating"
            ? 75
            : generationStage === "finalizing"
              ? 90
              : 0;

  const circumference = 2 * Math.PI * 42;
  const strokeOffset = circumference - (stageProgress / 100) * circumference;

  //

  const addAgentMessage = (
    content: string,
    actions?: Array<{
      label: string;
      icon: "refresh" | "external";
      onClick: () => void;
    }>,
  ) => {
    setShowTyping(true);
    setTimeout(() => {
      setShowTyping(false);
      setAgentMessages((prev) => [
        ...prev,
        { id: uid(), role: "agent", content, actions },
      ]);
    }, 300);
  };

  const triggerSuccessAnalysis = () => {
    const analysisId = uid();
    setShowTyping(true);

    fetch("/api/creator-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isSuccessAnalysis: true,
        userId: currentUserId,
        context: {
          assetTitle: asset?.title,
          assetType: asset?.content_type,
          currentMode: aiMode,
          hasResult: true,
          originalImageUrl: storageUrl(asset?.storage_path),
          generatedImageUrl: generatedUrl,
          prompt: customPrompt,
          aspectRatio,
          mode: aiMode,
        },
        messages: [],
      }),
    })
      .then(async (res) => {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let full = "";
        let insertedMessage = false;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            full += decoder.decode(value, { stream: true });
            if (!insertedMessage) {
              insertedMessage = true;
              setShowTyping(false);
              setAgentMessages((prev) => [
                ...prev,
                { id: analysisId, role: "agent", content: full },
              ]);
              continue;
            }
            setAgentMessages((prev) =>
              prev.map((m) =>
                m.id === analysisId ? { ...m, content: full } : m,
              ),
            );
          }
        }
        if (!insertedMessage) {
          setShowTyping(false);
          setAgentMessages((prev) => [
            ...prev,
            { id: analysisId, role: "agent", content: full || "Ready when you are." },
          ]);
        }
      })
      .catch(() => {
        setShowTyping(false);
        setAgentMessages((prev) =>
          [
            ...prev,
            {
              id: analysisId,
              role: "agent",
              content:
                "**Great result!** Try a variation or animate it with video mode.",
            },
          ],
        );
      });
  };

  const parseMarkdown = (text: string) => {
    const parts = text.split(/\*\*(.+?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <strong key={i} className="text-red-400">
          {part}
        </strong>
      ) : (
        part.split("\n").map((line, j) => (
          <span key={j}>
            {line}
            {j < part.split("\n").length - 1 && <br />}
          </span>
        ))
      ),
    );
  };

  const handleAgentSubmit = async () => {
    if (!agentInput.trim() || isAILoading) return;
    const userMsg = agentInput.trim();
    setAgentInput("");
    setAgentMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content: userMsg },
    ]);
    conversationHistory.current.push({ role: "user", content: userMsg });
    setIsAILoading(true);
    setShowTyping(true);

    const placeholderId = uid();

    try {
      const res = await fetch("/api/creator-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationHistory.current,
          userId: currentUserId,
          context: {
            assetTitle: asset?.title,
            assetType: asset?.content_type,
            currentMode: aiMode,
            hasResult: !!generatedUrl,
            originalImageUrl: storageUrl(asset?.storage_path),
            generatedImageUrl: generatedUrl,
            prompt: customPrompt,
            aspectRatio,
            mode: aiMode,
          },
        }),
      });

      if (!res.ok) throw new Error("Agent request failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let insertedMessage = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          if (!insertedMessage) {
            insertedMessage = true;
            setShowTyping(false);
            setAgentMessages((prev) => [
              ...prev,
              { id: placeholderId, role: "agent", content: full },
            ]);
            continue;
          }
          setAgentMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId ? { ...m, content: full } : m,
            ),
          );
        }
      }

      if (!insertedMessage) {
        setShowTyping(false);
        setAgentMessages((prev) => [
          ...prev,
          { id: placeholderId, role: "agent", content: full || "I am here." },
        ]);
      }

      conversationHistory.current.push({ role: "assistant", content: full });
    } catch {
      setShowTyping(false);
      setAgentMessages((prev) =>
        [
          ...prev,
          {
            id: placeholderId,
            role: "agent",
            content: "Sorry, I ran into an issue. Try again?",
          },
        ],
      );
    } finally {
      setShowTyping(false);
      setIsAILoading(false);
    }
  };
  //
  const handleAISuggest = async () => {
    if (!customPrompt.trim() && !imageUrl) return;
    try {
      const res = await fetch("/api/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: customPrompt,
          mode: aiMode,
          userId: currentUserId,
        }),
      });
      const data = await res.json();
      if (data.creditError) {
        alert(data.error);
        return;
      }
      if (data.suggestion) setCustomPrompt(data.suggestion);
    } catch {
      alert("AI Suggest failed");
    }
  };

  const handleAIReverse = async () => {
    if (!imageUrl) return;
    try {
      const res = await fetch("/api/ai-reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, userId: currentUserId }),
      });
      const data = await res.json();
      if (data.description) setCustomPrompt(data.description);
    } catch {
      alert("AI Reverse failed");
    }
  };
  //

  //
  return (
    <div className="h-screen bg-black text-white overflow-hidden">
      <CreditGate />
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes fadeOut {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(-8px);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shrinkOut {
          from {
            max-height: 200px;
            opacity: 1;
            transform: scale(1);
          }
          to {
            max-height: 0;
            opacity: 0;
            transform: scale(0.95);
            padding: 0;
            margin: 0;
            border-width: 0;
          }
        }
        @keyframes waterRise {
          0% {
            transform: translateY(0);
            opacity: 0.6;
          }
          100% {
            transform: translateY(-60px);
            opacity: 0;
          }
        }
      `}</style>
      <div
        className="max-w-9xl mx-auto px-2 md:px-6 lg:px-12 py-2 md:py-4 lg:py-6 h-full overflow-y-auto md:overflow-hidden"
        data-lenis-prevent
      >
        <div className="grid md:grid-cols-4 gap-2 md:gap-5 h-full">
          <div className="md:col-span-1 flex flex-col md:h-full overflow-hidden">
            <div
              className="flex-1 overflow-y-auto space-y-5 pb-4 pr-1"
              data-lenis-prevent
            >
              {/* Header */}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                Controls
              </p>

              {/* 1. Mode */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Mode
                </p>
                <select
                  value={aiMode}
                  onChange={(e) => {
                    setAiMode(e.target.value);
                    setSelectedModel("default");
                  }}
                  disabled={limitReached}
                  className="w-full px-2.5 py-2 bg-black border border-white/15 text-white text-xs rounded-none cursor-pointer focus:outline-none focus:border-red-600 disabled:opacity-50"
                >
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.icon} {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Vid2Vid Edit Style */}
              {aiMode === "vid2vid" && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Edit Style
                  </p>
                  <select
                    value={vidMode}
                    onChange={(e) => setVidMode(e.target.value)}
                    className="w-full px-2.5 py-2 bg-black border border-white/15 text-white text-xs rounded-none focus:outline-none focus:border-red-600"
                  >
                    <option value="adhere_1">Adhere 1 — stays close</option>
                    <option value="adhere_2">Adhere 2</option>
                    <option value="adhere_3">Adhere 3</option>
                    <option value="flex_1">Flex 1 — balanced</option>
                    <option value="flex_2">Flex 2</option>
                    <option value="flex_3">Flex 3</option>
                    <option value="reimagine_1">Reimagine 1 — creative</option>
                    <option value="reimagine_2">Reimagine 2</option>
                    <option value="reimagine_3">Reimagine 3</option>
                  </select>
                </div>
              )}
              {/* 2. Model */}
              {MODEL_OPTIONS[aiMode]?.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Model
                  </p>
                  <div className="space-y-1.5">
                    {MODEL_OPTIONS[aiMode].map((m) => (
                      <button
                        key={m.value}
                        onClick={() => setSelectedModel(m.value)}
                        disabled={limitReached}
                        className={`w-full text-left px-3 py-2.5 border rounded-none transition-colors disabled:opacity-50 ${
                          selectedModel === m.value
                            ? "bg-red-600/15 border-red-600 text-white"
                            : "bg-white/[0.03] border-white/10 text-gray-400 hover:border-white/25"
                        }`}
                      >
                        <p className="text-xs font-medium">{m.label}</p>
                        {m.description && (
                          <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                            {m.description}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* 3. Composition Upload */}
              {showComposition && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Composition
                  </p>

                  {/* Preloaded asset */}
                  {asset && !clearedAsset && (
                    <div className="relative border border-red-600/60 rounded-none overflow-hidden bg-white/5">
                      <div className="aspect-video relative">
                        {asset.content_type === "image" && imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={asset.title}
                            className="w-full h-full object-cover"
                          />
                        ) : asset.content_type === "video" && imageUrl ? (
                          <video
                            src={imageUrl}
                            muted
                            autoPlay
                            loop
                            className="w-full h-full object-cover"
                          />
                        ) : asset.content_type === "audio" && imageUrl ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3">
                            <span className="text-2xl">🎵</span>
                            <audio
                              src={imageUrl}
                              controls
                              className="w-full h-8"
                              style={{ filter: "invert(1) hue-rotate(180deg)" }}
                            />
                          </div>
                        ) : (
                          <div className="w-full h-full bg-white/5" />
                        )}
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-[9px] uppercase tracking-wider text-red-500 border border-red-600/40 rounded-none">
                          {asset.content_type}
                        </span>
                        <button
                          onClick={() => setClearedAsset(true)}
                          className="absolute top-1.5 right-1.5 p-1 bg-black/70 cursor-pointer hover:bg-black rounded-none border border-white/10"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="px-2 py-1.5 text-[10px] text-gray-400 truncate">
                        {asset.title || "Untitled"}
                      </p>
                    </div>
                  )}

                  {((asset &&
                    !clearedAsset &&
                    (asset.content_type === "image" ||
                      asset.content_type === "video")) ||
                    (uploadedFiles.length > 0 &&
                      (uploadedFiles[0]?.type.startsWith("image/") ||
                        uploadedFiles[0]?.type.startsWith("video/")))) &&
                    ["char"].includes(aiMode) && (
                      <button
                        onClick={() => {
                          const newLock = !lockCharacter;
                          setLockCharacter(newLock);
                          if (newLock) setSelectedModel("pulid");
                          else setSelectedModel("default");
                        }}
                        className={`mt-1 flex items-center gap-2 w-full px-3 py-2 rounded-none border text-xs font-medium transition-colors ${
                          lockCharacter
                            ? "bg-red-600/20 border-red-600 text-red-500"
                            : "bg-white/5 border-white/15 text-gray-400 hover:border-white/30"
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Lock Character
                        <span className="ml-auto text-[9px] font-normal opacity-60">
                          Pin as visual reference
                        </span>
                      </button>
                    )}

                  {/* Upload zone */}
                  {(clearedAsset || !asset) && uploadedFiles.length === 0 && (
                    <>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-white/20 hover:border-red-600/60 rounded-none p-6 flex flex-col items-center gap-2 transition-colors group"
                      >
                        <Upload className="w-5 h-5 text-gray-500 group-hover:text-red-500 transition-colors" />
                        <p className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors text-center">
                          Click to upload or drag & drop
                        </p>
                        <p className="text-[9px] text-gray-600">
                          image/*, video/* · max 50MB
                        </p>
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*,audio/*"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </>
                  )}

                  {/* Uploaded file list */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      {uploadedFiles.map((file, idx) => {
                        const src = uploadedPreviewUrls[idx];
                        const isVid = file.type.startsWith("video/");
                        const isAud = file.type.startsWith("audio/");
                        return (
                          <div
                            key={idx}
                            className="relative border border-white/10 rounded-none overflow-hidden bg-white/5 transition-all duration-300"
                            style={
                              removingIdx === idx
                                ? {
                                    animation:
                                      "shrinkOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                                    overflow: "hidden",
                                  }
                                : undefined
                            }
                          >
                            {isVid ? (
                              <div className="aspect-video relative">
                                <video
                                  src={src}
                                  controls
                                  muted
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-[9px] uppercase tracking-wider text-red-500 border border-red-600/40">
                                  video
                                </span>
                              </div>
                            ) : isAud ? (
                              <div className="p-3 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">🎵</span>
                                  <p className="flex-1 text-[10px] text-gray-400 truncate">
                                    {file.name}
                                  </p>
                                </div>
                                <audio
                                  src={src}
                                  controls
                                  className="w-full h-8"
                                  style={{
                                    filter: "invert(1) hue-rotate(180deg)",
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="aspect-video relative">
                                <img
                                  src={src}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-[9px] uppercase tracking-wider text-red-500 border border-red-600/40">
                                  image
                                </span>
                              </div>
                            )}
                            <div
                              className="flex items-center justify-between px-2 py-1.5 overflow-hidden"
                              style={
                                removingIdx === idx
                                  ? {
                                      animation:
                                        "shrinkOut 0.3s ease-out forwards",
                                    }
                                  : undefined
                              }
                            >
                              {pendingDeleteIdx === idx ? (
                                <div
                                  className="flex items-center gap-2 w-full"
                                  style={{
                                    animation:
                                      "fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                                  }}
                                >
                                  <p className="text-[10px] text-red-400 whitespace-nowrap">
                                    Remove this file?
                                  </p>
                                  <div className="flex items-center gap-1.5 ml-auto">
                                    <button
                                      onClick={() => {
                                        setRemovingIdx(idx);
                                        setTimeout(() => {
                                          removeFile(idx);
                                          setPendingDeleteIdx(null);
                                          setRemovingIdx(null);
                                        }, 300);
                                      }}
                                      className="px-2.5 py-1 text-[9px] bg-red-600 hover:bg-red-500 text-white transition-all duration-200 hover:scale-105"
                                    >
                                      Yes, remove
                                    </button>
                                    <button
                                      onClick={() => setPendingDeleteIdx(null)}
                                      className="px-2.5 py-1 text-[9px] bg-white/10 hover:bg-white/20 text-gray-300 transition-all duration-200 hover:scale-105"
                                    >
                                      Keep
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="flex items-center justify-between w-full"
                                  style={
                                    pendingDeleteIdx === null
                                      ? { animation: "slideUp 0.2s ease-out" }
                                      : undefined
                                  }
                                >
                                  <p className="text-[10px] text-gray-400 truncate flex-1">
                                    {file.name}
                                  </p>
                                  <button
                                    onClick={() => setPendingDeleteIdx(idx)}
                                    className="p-1 hover:text-red-400 text-gray-600 flex-shrink-0 transition-all duration-200 hover:scale-110 hover:rotate-90"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Prompt */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Prompt
                </p>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={
                    aiMode === "variation"
                      ? "Describe changes to make..."
                      : aiMode === "custom"
                        ? "Describe the image to generate..."
                        : aiMode === "char"
                          ? "Describe your character in the new scene..."
                          : aiMode === "video"
                            ? "Describe how to animate this image..."
                            : aiMode === "vid2vid"
                              ? "Describe how to transform this video..."
                              : aiMode === "audio"
                                ? "Describe the music or sound..."
                                : aiMode === "aud2aud"
                                  ? "e.g. remix in jazz style, remove vocals, boost clarity, add reverb..."
                                  : "Describe..."
                  }
                  maxLength={2000}
                  disabled={limitReached}
                  rows={4}
                  className="w-full px-2.5 py-2 bg-black border border-white/15 text-white text-xs rounded-none cursor-pointer focus:outline-none focus:border-red-600 resize-none disabled:opacity-50 min-h-[100px]"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAIReverse}
                    disabled={limitReached || !imageUrl}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] bg-white/5 cursor-pointer hover:bg-white/10 border border-white/10 hover:border-red-600/50 rounded-none text-gray-400 hover:text-white transition-colors disabled:opacity-40"
                  >
                    <RotateCcw className="w-3 h-3" /> AI Reverse
                  </button>
                  <span className="ml-auto text-[9px] text-gray-600">
                    {customPrompt.length}/2000
                  </span>
                </div>
              </div>

              {/* 5. Aspect Ratio */}
              {!["video", "vid2vid", "audio", "aud2aud"].includes(aiMode) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Aspect Ratio
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ASPECT_RATIOS.map((ar) => (
                      <button
                        key={ar.value}
                        onClick={() => setAspectRatio(ar.value)}
                        disabled={limitReached}
                        className={`px-2.5 py-2 rounded-none text-xs font-medium border transition-colors disabled:opacity-50 ${
                          aspectRatio === ar.value
                            ? "bg-red-600 border-red-600 text-white"
                            : "bg-white/5 border-white/10 text-gray-400 hover:border-white/25"
                        }`}
                      >
                        {ar.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. Duration */}
              {showDuration && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Duration
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[5, 10].map((s) => (
                      <button
                        key={s}
                        onClick={() => setAudioDuration(s)}
                        disabled={limitReached}
                        className={`px-3 py-2 rounded-none text-xs font-medium border transition-colors disabled:opacity-50 ${
                          audioDuration === s
                            ? "bg-red-600 border-red-600 text-white"
                            : "bg-white/5 border-white/10 text-gray-400 hover:border-white/25"
                        }`}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 8. Create Button — sticky bottom */}
            <div className="pt-3 border-t border-white/10 mt-2">
              {generating && (
                <div className="mb-2 space-y-1">
                  <div className="h-1 bg-white/10 rounded-none overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all duration-500"
                      style={{
                        width:
                          generationStage === "analyzing"
                            ? "20%"
                            : generationStage === "generating_scene"
                              ? "40%"
                              : generationStage === "enhancing"
                                ? "60%"
                                : generationStage === "generating"
                                  ? "80%"
                                  : "100%",
                      }}
                    />
                  </div>
                  <p className="text-[9px] text-gray-500 text-center">
                    {generationStage === "analyzing" && "🔍 Analyzing..."}
                    {generationStage === "generating_scene" &&
                      "🎨 Creating scene (1/2)..."}
                    {generationStage === "enhancing" &&
                      "✨ Enhancing prompt..."}
                    {generationStage === "generating" &&
                      "🎬 Generating (2/2)..."}
                    {generationStage === "finalizing" && "⚡ Finalizing..."}
                  </p>
                </div>
              )}
              <InsufficientCreditsBadge
                actionKey={getRemixCreditActionKey(aiMode, audioDuration)}
                className="mb-2 w-full justify-center"
              />
              <button
                onClick={handleGenerate}
                disabled={generating || limitReached || creditsInsufficient}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 cursor-pointer hover:bg-red-700 text-white text-sm font-semibold rounded-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-none animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create
                  </>
                )}
              </button>
            </div>
          </div>
          <div
            className="md:col-span-2 relative flex flex-col bg-white/[0.02] border border-white/10 rounded-none overflow-hidden"
            style={{ minHeight: "280px" }}
          >
            {/* ── Canvas Area ── */}
            <div
              className="flex-1 flex items-center justify-center p-3 md:p-6 overflow-y-auto"
              data-lenis-prevent
            >
              {/* State 1: Generating */}
              {generating && (
                <div className="flex flex-col items-center gap-4">
                  <svg width="96" height="96" viewBox="0 0 96 96">
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      fill="none"
                      stroke="rgba(196,30,58,0.15)"
                      strokeWidth="6"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      fill="none"
                      stroke="#C41E3A"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeOffset}
                      transform="rotate(-90 48 48)"
                      style={{ transition: "stroke-dashoffset 0.5s ease" }}
                    />
                    <text
                      x="48"
                      y="53"
                      textAnchor="middle"
                      fill="#C41E3A"
                      fontSize="14"
                      fontWeight="600"
                    >
                      {stageProgress}%
                    </text>
                  </svg>
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">
                      {aiMode === "video"
                        ? "Rendering video…"
                        : "Generating preview…"}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      This may take a moment
                    </p>
                  </div>
                </div>
              )}

              {/* State 2: Result ready */}
              {!generating && generatedUrl && (
                <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-4">
                  {aiMode === "video" || aiMode === "vid2vid" ? (
                    <video
                      src={generatedUrl}
                      controls
                      className="w-full max-h-[60vh] object-contain rounded-none border border-white/10"
                    />
                  ) : aiMode === "audio" || aiMode === "aud2aud" ? (
                    <AudioStudio
                      generatedUrl={generatedUrl}
                      onRegenerate={() => {
                        setGeneratedUrl(null);
                        handleGenerate();
                      }}
                    />
                  ) : (
                    <img
                      src={generatedUrl}
                      alt="Generated"
                      className="w-full max-h-96 rounded-none border border-white/10 object-contain"
                    />
                  )}
                  {/* Action row */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleUseGenerated}
                      className="px-4 py-2 bg-green-600 cursor-pointer hover:bg-green-700 text-white text-xs font-semibold rounded-none transition-colors"
                    >
                      Use This
                    </button>
                    <button
                      onClick={() => {
                        setGeneratedUrl(null);
                        handleGenerate();
                      }}
                      className="px-4 py-2 bg-white/5 cursor-pointer hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-medium rounded-none transition-colors"
                    >
                      Regenerate
                    </button>
                    <a
                      href={generatedUrl}
                      download
                      className="px-4 py-2 bg-white/5 cursor-pointer hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-medium rounded-none transition-colors"
                    >
                      Download
                    </a>
                  </div>
                </div>
              )}

              {/* State 3: Empty */}
              {!generating && !generatedUrl && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-24 h-24 rounded-none flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-400">
                    Your creation will appear here
                  </p>
                  <p className="text-xs text-gray-600">
                    Configure your settings and click Create
                  </p>
                </div>
              )}
            </div>

            {/* ── Floating Prompt Bar ── */}
            <div className="absolute bottom-4 left-4 right-4">
              <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/10 rounded-none px-3 py-2">
                <input
                  type="text"
                  value={quickPrompt}
                  onChange={(e) => setQuickPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      quickPrompt.trim() &&
                      !generating
                    ) {
                      setCustomPrompt(quickPrompt);
                      setQuickPrompt("");
                      handleGenerate();
                    }
                  }}
                  placeholder="What would you like to generate today?"
                  className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (!quickPrompt.trim() || generating) return;
                    setCustomPrompt(quickPrompt);
                    setQuickPrompt("");
                    handleGenerate();
                  }}
                  disabled={!quickPrompt.trim() || generating}
                  className={`p-1.5 rounded-none transition-colors ${
                    quickPrompt.trim() && !generating
                      ? "text-red-500 cursor-pointer hover:bg-red-600/10"
                      : "text-gray-600 cursor-not-allowed"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <div
            className="md:col-span-1 flex flex-col bg-white/[0.02] border border-white/10 rounded-none overflow-hidden md:h-full"
            style={{ height: "660px" }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 flex-shrink-0">
              <div className="w-7 h-7 rounded-none flex items-center justify-center">
                <Bot className="w-4 h-4 text-red-500" />
              </div>
              <span className="text-sm font-semibold text-white flex-1">
                Remix Agent
              </span>
            </div>

            {/* Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto  space-y-3 min-h-0"
              data-lenis-prevent
            >
              {agentMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "agent" && (
                    <div className="w-6 h-6 rounded-none flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-3 h-3 text-red-500" />
                    </div>
                  )}
                  <div className={`max-w-[85%] space-y-2`}>
                    <div
                      className={`px-3 py-2 rounded-none text-[11px] leading-relaxed ${
                        msg.role === "user"
                          ? "bg-red-600 text-white "
                          : "bg-white/5 border border-white/10 text-gray-300 "
                      }`}
                    >
                      {msg.role === "agent"
                        ? parseMarkdown(msg.content)
                        : msg.content}
                    </div>
                    {/* Action buttons */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.actions.map((action, i) => (
                          <button
                            key={i}
                            onClick={action.onClick}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] border border-white/15 hover:border-red-600/50 bg-white/5 cursor-pointer hover:bg-red-600/10 text-gray-400 hover:text-white rounded transition-colors"
                          >
                            {action.icon === "refresh" ? (
                              <RefreshCw className="w-3 h-3" />
                            ) : (
                              <ExternalLink className="w-3 h-3" />
                            )}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {showTyping && (
                <div className="flex gap-2 justify-start">
                  <div className="w-6 h-6 rounded-none bg-red-600/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3 h-3 text-red-500" />
                  </div>
                  <div className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-none  flex items-center gap-1">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-none bg-red-600/60 animate-bounce"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="flex-shrink-0 border-t border-white/10 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={agentInputRef}
                  rows={1}
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAgentSubmit();
                    }
                  }}
                  placeholder="Ask me anything about your remix…"
                  disabled={isAILoading}
                  className="min-h-9 max-h-[140px] flex-1 resize-none overflow-y-auto px-3 py-2 bg-white/5 border border-white/10 text-white text-xs rounded-none placeholder-gray-600 focus:outline-none focus:border-red-600/50 disabled:opacity-50"
                />
                <button
                  onClick={handleAgentSubmit}
                  disabled={isAILoading || !agentInput.trim()}
                  className="h-9 w-9 flex items-center justify-center bg-red-600 cursor-pointer hover:bg-red-700 rounded-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {isAILoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Send className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
