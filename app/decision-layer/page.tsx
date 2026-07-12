"use client";
import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowRight,
  UploadSimple,
  Sparkle,
  CheckCircle,
  Clock,
  XCircle,
  CircleNotch,
  X,
  Image as ImageIcon,
  VideoCamera,
  Lightning,
  ChatCircle,
} from "phosphor-react";
import { supabase } from "@/lib/supabaseClient";
import { useDecisionLayerTour } from "../hooks/useDecisionLayerTour";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import InsufficientCreditsBadge from "@/app/components/InsufficientCreditsBadge";
import CreditGate from "@/app/components/CreditGate";
import { useCreditBalance, useActionCost } from "@/app/hooks/useCreditStatus";
const DECISION_LAYER_WELCOME_TRIGGER_KEY = "kz_decision_layer_welcome_trigger";
const DECISION_LAYER_INPUT_DEBUG =
  process.env.NEXT_PUBLIC_DECISION_LAYER_INPUT_DEBUG === "true";
// ─── Skeleton Loaders ────────────────────────────────────────────────────
const AgentMessageSkeleton = () => (
  <div className="bg-zinc-900/50 p-3 space-y-2 animate-pulse">
    <Lightning size={14} weight="fill" className="text-red-500 mb-1" />
    <div className="h-2 bg-zinc-800 rounded w-3/4"></div>
    <div className="h-2 bg-zinc-800 rounded w-full"></div>
    <div className="h-2 bg-zinc-800 rounded w-2/3"></div>
  </div>
);
const ResultsSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="border-l-4 border-zinc-800 p-5 bg-zinc-900/10">
      <div className="h-4 bg-zinc-800 rounded w-1/2 mb-3"></div>
      <div className="h-2 bg-zinc-800 rounded w-full mb-2"></div>
      <div className="h-2 bg-zinc-800 rounded w-3/4"></div>
    </div>
    <div className="grid grid-cols-3 gap-px bg-zinc-800">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-black p-3">
          <div className="h-2 bg-zinc-800 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-zinc-800 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  </div>
);
const RemixStudioActionSkeleton = () => (
  <div className="mt-4 border border-red-500/30 bg-red-950/10 p-3 animate-pulse">
    <div className="flex items-center gap-2 mb-3">
      <CircleNotch size={14} className="text-red-400 animate-spin" />
      <p className="text-red-300 text-xs uppercase tracking-wider">
        Preparing your remix plan
      </p>
    </div>
    <div className="h-2 bg-zinc-800 rounded w-4/5 mb-2" />
    <div className="h-2 bg-zinc-800 rounded w-3/5 mb-3" />
    <div className="h-8 bg-zinc-800 rounded w-44" />
  </div>
);
// ─── URL detection ───────────────────────────────────────────────────────
const formatMessageWithLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-400 underline break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

const mapRawContentTypeToFileMode = (
  rawType?: string | null,
): "image" | "video" | "audio" | "text" | null => {
  if (!rawType) return null;
  const value = rawType.toLowerCase();

  if (
    value.startsWith("image/") ||
    ["image", "images", "visual", "photo", "illustration", "3d"].includes(value)
  ) {
    return "image";
  }
  if (
    value.startsWith("video/") ||
    ["video", "videos", "motion"].includes(value)
  ) {
    return "video";
  }
  if (
    value.startsWith("audio/") ||
    ["audio", "music", "sound"].includes(value)
  ) {
    return "audio";
  }
  if (
    value.startsWith("text/") ||
    ["text", "code", "prompt", "document", "json", "markdown"].includes(value)
  ) {
    return "text";
  }

  return null;
};

const mapContentTypeToContextMedia = (
  rawType?: string | null,
): string | null => {
  const mode = mapRawContentTypeToFileMode(rawType);
  if (mode === "image") return "images";
  if (mode === "video") return "video";
  if (mode === "audio") return "audio";
  if (mode === "text") return "text";
  return null;
};

const mapContextMediaToFileMode = (
  mediaType?: string | null,
): "image" | "video" | "audio" | "text" | null => {
  if (!mediaType) return null;
  if (mediaType === "images") return "image";
  if (mediaType === "video") return "video";
  if (mediaType === "audio") return "audio";
  if (mediaType === "text") return "text";
  return null;
};
// ─── Types ───────────────────────────────────────────────────────────────
interface UploadedFile {
  file: File;
  preview: string | null;
  type: string;
  role: "primary" | "supporting";
}
interface ReadinessAxis {
  axis: string;
  score: number;
  label: string;
  note: string;
}
interface CoachingPhase {
  phase?: number;
  title: string;
  timeframe?: string;
  timeEstimate?: string;
  actions: string[];
}
interface PricingTier {
  tier: string;
  range: string;
  justification: string;
  upgradeAction?: string;
}
interface AnalysisApiKey {
  label: string;
  masked: string;
}
interface AnalysisApiInfo {
  provider: string;
  models: string[];
  keys: AnalysisApiKey[];
  endpoint: string;
  statusLog?: string[];
}
type AnalysisMode = "fast" | "full";
const MB = 1024 * 1024;
const UPLOAD_LIMITS = {
  imageBytes: 25 * MB,
  audioBytes: 100 * MB,
  videoBytes: 200 * MB,
  pdfBytes: 25 * MB,
  textBytes: 10 * MB,
  maxVideoDurationSeconds: 120,
  maxPrimaryAssets: 1,
  maxSupportingAssets: 3,
  maxTotalAssets: 4,
} as const;
// Phase 2 Evaluation — unified for image and video
interface Evaluation {
  decision: "yes" | "not-yet" | "no";
  title: string;
  honestAssessment: string;
  evidenceUsed?: string | string[];
  worthIt: {
    verdict: "yes" | "maybe" | "no";
    explanation: string;
  };
  // NEW: 6-axis readiness
  readinessScores: ReadinessAxis[];
  overallReadiness: number;
  alignmentVerdict: string;
  // NEW: Coaching roadmap
  coachingRoadmap: CoachingPhase[];
  // NEW: Tiered pricing
  pricingGuidance: {
    tiers: PricingTier[];
    currentTier: string;
    currentRange: string;
    potentialRange: string;
    rationale: string;
    // Legacy fields
    range?: string;
    pricingTips?: string;
    licenseOptions?: { type: string; price: string }[];
  };
  // NEW: Pain point
  topPainPoint: string;
  // Existing fields
  whereToStart: { priority: string; steps: string[] };
  contentCritique: {
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
  nextSteps: string[];
  realTalk: string;
  KAIZORAStrategy?: {
    strategyType: string;
    features: string[];
    rationale: string;
  };
  marketReality?: { demand: string; competition: string; analysis: string };
  // ─── NEW Phase 3 fields ────────────────────────────
  whatISaw?: {
    subjects: string;
    lighting: string;
    color: string;
    composition: string;
    mood: string;
  };
  whatYouToldMe?: {
    goal: string;
    pain: string;
    constraints: string;
    buyerType: string;
  };
  realAlignment?: {
    score: number;
    gapSummary: string;
    blindSpots: string[];
  };
  myRecommendation?: {
    verdict: "Ready" | "Refine" | "Explore" | "Flag";
    reasoning: string;
  };
  exactEdits?: Array<{
    edit: string;
    why: string;
    effort: "Quick" | "Medium" | "Deep";
  }>;
  honestPricing?: {
    low: number;
    high: number;
    currency: string;
    reasoning: string;
    comparable: string;
  };
  fastestPath?: Array<{
    step: string;
    timeEstimate: string;
  }>;
  evidenceDetails?: {
    fileCount: number;
    resolution: string;
    framesAnalyzed: number;
    modelUsed: string;
    analysisTimestamp: string;
    signalsSummary: string;
    statusLog?: string[];
  };
  analysisStatusLog?: string[];
  // Text Intelligence (Phase 3 — text-specific)
  whatIRead?: {
    contentType: string;
    tone: string;
    structure: string;
    keyTopics: string;
    mood: string;
  };
  // Audio Intelligence (Phase 3 — audio-specific)
  whatIHeard?: {
    instruments: string;
    rhythm: string;
    tonality: string;
    production: string;
    mood: string;
  };
  audioIntelligence?: {
    genres: { genre: string; confidence: number }[];
    moods: { mood: string; confidence: number }[];
    instruments: string[];
    isVocal: boolean;
    vocalGender: string;
    danceability: number;
    engagement: number;
    approachability: number;
    bpm: number;
    key: string;
    structure: { section: string; startTime: number; endTime: number }[];
    hasSpeech: boolean;
    transcript: string;
  };
  // Video-specific legacy
  scores?: {
    overall: number;
    technical: number;
    commercial: number;
    narrative: number;
    confidence: number;
  };
  videoMetadata?: {
    duration: string;
    resolution: string;
    fileSize: string;
    format: string;
    framesAnalyzed: number;
  };
  technicalBreakdown?: {
    composition: string;
    technicalAssessment: string;
    visualDescription: string;
  };
  marketAnalysis?: {
    commercialPotential: string;
    targetAudience: string;
    bestPlatforms: string[];
    demandLevel: string;
  };
}
// ─── 6-Axis Radar Component ─────────────────────────────────────────────
const ReadinessRadar = ({ scores }: { scores: ReadinessAxis[] }) => {
  if (!scores || scores.length === 0) return null;
  const size = 240;
  const center = size / 2;
  const maxRadius = 80;
  const levels = 5;
  const angleStep = (2 * Math.PI) / scores.length;
  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2;
    const radius = (value / 100) * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };
  // Grid lines
  const gridLines = Array.from({ length: levels }, (_, i) => {
    const r = ((i + 1) / levels) * maxRadius;
    const points = scores.map((_, j) => {
      const angle = angleStep * j - Math.PI / 2;
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    });
    return points.join(" ");
  });
  // Data polygon
  const dataPoints = scores.map((s, i) => {
    const pt = getPoint(i, s.score);
    return `${pt.x},${pt.y}`;
  });
  // Axis labels
  const labels = scores.map((s, i) => {
    const pt = getPoint(i, 116);
    return { ...s, x: pt.x, y: pt.y };
  });
  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid */}
        {gridLines.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            stroke="#27272a"
            strokeWidth="0.5"
          />
        ))}
        {/* Axis lines */}
        {scores.map((_, i) => {
          const pt = getPoint(i, 100);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={pt.x}
              y2={pt.y}
              stroke="#27272a"
              strokeWidth="0.5"
            />
          );
        })}
        {/* Data area */}
        <polygon
          points={dataPoints.join(" ")}
          fill="rgba(239, 68, 68, 0.15)"
          stroke="#ef4444"
          strokeWidth="1.5"
        />
        {/* Data dots */}
        {scores.map((s, i) => {
          const pt = getPoint(i, s.score);
          return <circle key={i} cx={pt.x} cy={pt.y} r="3" fill="#ef4444" />;
        })}
        {/* Axis labels on SVG */}
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#71717a"
            fontSize="8"
          >
            {l.axis.length > 12 ? l.axis.slice(0, 11) + "…" : l.axis}
          </text>
        ))}
      </svg>
      {/* Labels below radar */}
      <div className="grid grid-cols-3 gap-2 mt-3 w-full">
        {scores.map((s, i) => (
          <div key={i} className="text-center">
            <p className="text-zinc-500 text-[10px] leading-tight">{s.axis}</p>
            <p className={`text-xs font-medium ${scoreColor(s.score)}`}>
              {s.score}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
// ─── Coaching Roadmap Component ──────────────────────────────────────────
const CoachingRoadmapDisplay = ({ roadmap }: { roadmap: CoachingPhase[] }) => {
  if (!roadmap || roadmap.length === 0) return null;
  const phaseColors = [
    "border-red-500",
    "border-yellow-500",
    "border-green-500",
  ];
  const phaseIcons = ["⚡", "📈", "🚀"];
  return (
    <div className="space-y-3">
      {roadmap.map((phase, i) => (
        <div
          key={i}
          className={`border-l-2 ${phaseColors[i] || "border-zinc-600"} pl-4`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">{phaseIcons[i]}</span>
            <p className="text-white text-xs font-medium">{phase.title}</p>
            <span className="text-zinc-600 text-[10px]">
              {phase.timeframe || phase.timeEstimate}
            </span>
          </div>
          <div className="space-y-1">
            {phase.actions.map((action, j) => (
              <div key={j} className="flex items-start gap-2">
                <span className="text-zinc-700 text-xs mt-0.5">→</span>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  {action}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
// ─── Tiered Pricing Component ────────────────────────────────────────────
const PricingTiersDisplay = ({ tiers }: { tiers: PricingTier[] }) => {
  if (!tiers || tiers.length === 0) return null;
  const tierColors = [
    "border-zinc-700 bg-zinc-900/30",
    "border-yellow-500/30 bg-yellow-950/10",
    "border-green-500/30 bg-green-950/10",
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {tiers.map((tier, i) => (
        <div
          key={i}
          className={`border ${tierColors[i] || "border-zinc-700"} p-3`}
        >
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">
            {tier.tier}
          </p>
          <p className="text-white text-sm font-medium mb-1">{tier.range}</p>
          <p className="text-zinc-600 text-[10px] leading-relaxed">
            {tier.justification}
          </p>
          {tier.upgradeAction && (
            <p className="text-red-500/70 text-[10px] mt-2 leading-relaxed">
              ↑ {tier.upgradeAction}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};
// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function DecisionLayerFlowContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handoffMediaType = mapContentTypeToContextMedia(
    searchParams?.get("content_type"),
  );
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [incomingAsset, setIncomingAsset] = useState<{
    file: File;
    title: string;
    contentType: string;
    suggestedMode: "image" | "video" | "audio" | "text" | null;
  } | null>(null);
  const injectedIncomingRef = useRef<boolean>(false);
  // Synchronously-updated ref so race conditions with async state never miss it
  const incomingMediaTypeRef = useRef<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState<number>(0);
  const [analysisApiInfo, setAnalysisApiInfo] =
    useState<AnalysisApiInfo | null>(null);
  const [otherTargetField, setOtherTargetField] = useState<string | null>(null);
  const [userType, setUserType] = useState<
    "hobbyist" | "professional" | "unsure"
  >("unsure");
  const [hasAskedPreQuestion, setHasAskedPreQuestion] =
    useState<boolean>(false);
  // Agent chat
  const [agentMessages, setAgentMessages] = useState<
    Array<{ role: "agent" | "user"; content: string }>
  >([]);
  const [userMessage, setUserMessage] = useState<string>("");
  const [isAgentTyping, setIsAgentTyping] = useState<boolean>(false);
  const [showButtons, setShowButtons] = useState<boolean>(false);
  const [buttons, setButtons] = useState<any[]>([]);
  const [isPreparingRemixStudio, setIsPreparingRemixStudio] =
    useState<boolean>(false);
  const [userIntent, setUserIntent] = useState<string>("");
  const [conversationPhase, setConversationPhase] = useState<
    | "greeting"
    | "pain-diagnosis"
    | "intent-summary"
    | "awaiting-upload"
    | "extracting-media"
    | "decision-evaluation"
    | "decision-options"
    | "companion"
  >("greeting");
  const [showUploadArea, setShowUploadArea] = useState<boolean>(false);
  const [fileMode, setFileMode] = useState<
    "image" | "video" | "audio" | "text" | null
  >(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("fast");
  const analysisStartedAtRef = useRef<number | null>(null);
  const analysisTimerRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Credits: disable actions when the user can't afford the current analysis.
  const creditBalance = useCreditBalance();
  const actionCost = useActionCost(
    fileMode ? `decision_layer_${fileMode}` : null,
  );
  const creditsInsufficient =
    creditBalance !== null &&
    actionCost !== null &&
    actionCost > 0 &&
    creditBalance < actionCost;

  const clearAnalysisTimer = () => {
    if (analysisTimerRef.current !== null) {
      window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
  };

  const startAnalysisTimer = () => {
    clearAnalysisTimer();
    analysisStartedAtRef.current = Date.now();
    setAnalysisElapsedMs(0);
    analysisTimerRef.current = window.setInterval(() => {
      if (analysisStartedAtRef.current !== null) {
        setAnalysisElapsedMs(Date.now() - analysisStartedAtRef.current);
      }
    }, 100);
  };

  const stopAnalysisTimer = () => {
    if (analysisStartedAtRef.current !== null) {
      setAnalysisElapsedMs(Date.now() - analysisStartedAtRef.current);
    }
    clearAnalysisTimer();
    analysisStartedAtRef.current = null;
  };

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 5000);
  };

  const formatAnalysisDuration = (ms: number) => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const buildErrorMessage = (data: any, fallback: string) => {
    const base =
      typeof data?.error === "string" && data.error.trim()
        ? data.error.trim()
        : fallback;
    const details =
      typeof data?.details === "string" && data.details.trim()
        ? data.details.trim()
        : "";

    if (!details || base.includes(details)) return base;
    return `${base}: ${details}`;
  };
  const extractAnalysisApiInfo = (data: any, endpoint: string) => ({
    provider: data.debug?.api?.provider || "Decision Layer API",
    models: Array.isArray(data.debug?.api?.models)
      ? data.debug.api.models
      : Array.isArray(data.debug?.models_used)
        ? data.debug.models_used
        : typeof data.debug?.model_used === "string"
          ? [data.debug.model_used]
          : [],
    keys: Array.isArray(data.debug?.api?.keys) ? data.debug.api.keys : [],
    endpoint,
    statusLog: Array.isArray(data.debug?.api?.statusLog)
      ? data.debug.api.statusLog
      : Array.isArray(data.evaluation?.analysisStatusLog)
        ? data.evaluation.analysisStatusLog
        : [],
  });
  const [analysisStatusLog, setAnalysisStatusLog] = useState<string[]>([]);
  const analysisStatusTimersRef = useRef<number[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializationLock = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [creatorContext, setCreatorContext] = useState<{
    goal?: string;
    buyer?: string;
    mediaType?: string;
    timeConstraint?: string;
    qualityLevel?: string;
    blocker?: string;
  }>({});
  const [stepProgress, setStepProgress] = useState<number>(0);
  const [showOtherInline, setShowOtherInline] = useState<boolean>(false);
  const [contextStep, setContextStep] = useState<number>(0);
  const [startOverProgress, setStartOverProgress] = useState(0);
  const [startOverActive, setStartOverActive] = useState(false);
  const startOverIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const [showInlineInput, setShowInlineInput] = useState<boolean>(false);
  const [inlineInputValue, setInlineInputValue] = useState<string>("");
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const audioUnlocked = useRef(false);
  const currentTTSAbortRef = useRef<AbortController | null>(null);
  const isSpeakingRef = useRef(false);
  const hasSpokenInitialGreetingRef = useRef(false);
  const shouldPlayWelcomeFromClickRef = useRef(false);
  const shouldLaunchTourFromTriggerRef = useRef(false);
  const [fileHash, setFileHash] = useState<string>("");
  const [evaluationFileHash, setEvaluationFileHash] = useState<string>("");
  const [clientSignals, setClientSignals] = useState<any[]>([]);
  const [localDescription, setLocalDescription] = useState<string>("");
  const [evaluationMessageIndex, setEvaluationMessageIndex] =
    useState<number>(-1);
  const GREETING_MESSAGE = "__GREETING__";
  const RETURN_MESSAGE = "__RETURN_GREETING__";
  const [leftWidth, setLeftWidth] = useState(55); // percentage
  const isDragging = useRef(false);

  const logDecisionLayerInput = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      if (!DECISION_LAYER_INPUT_DEBUG) return;
      if (payload) {
        console.info(`[decision-layer][input] ${event}`, payload);
        return;
      }
      console.info(`[decision-layer][input] ${event}`);
    },
    [],
  );

  const scrollDecisionLayerToBottom = useCallback(
    (reason: string, behavior: ScrollBehavior = "smooth") => {
      const anchor = messagesEndRef.current;
      const container = anchor?.parentElement;
      if (!anchor || !container) return;

      logDecisionLayerInput("auto-scroll", {
        reason,
        behavior,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });

      requestAnimationFrame(() => {
        anchor.scrollIntoView({ behavior, block: "end" });
      });
    },
    [logDecisionLayerInput],
  );

  const clearAnalysisStatusTimers = () => {
    analysisStatusTimersRef.current.forEach((timerId) =>
      window.clearTimeout(timerId),
    );
    analysisStatusTimersRef.current = [];
  };

  const scheduleAnalysisStatusLog = (
    mode: "image" | "video" | "audio" | "text" | null,
  ) => {
    clearAnalysisStatusTimers();

    const initialLog =
      mode === "image"
        ? [
            "Starting Decision Layer Analysis (Phase 2)...",
            "Images: 1, Videos: 0",
            "Analyzing 1 image(s) with 3-call pipeline...",
            "Analyzing image 1/1...",
            "Starting Gemini Vision Analysis (6-Axis + Coaching + Pricing)...",
            "Gemini Call 1: Visual Description...",
            "[gemini] generateContent:gemini-3.1-pro-preview attempt using gemini-3.1-pro-preview (requested gemini-3.1-pro-preview)",
          ]
        : mode === "video"
          ? [
              "Starting Decision Layer Analysis (Phase 2)...",
              "Extracting frames from the uploaded video.",
            ]
          : mode === "audio"
            ? [
                "Starting Decision Layer Analysis (Phase 2)...",
                "Preparing audio understanding pipeline.",
              ]
            : mode === "text"
              ? [
                  "Starting Decision Layer Analysis (Phase 2)...",
                  "Preparing text analysis pipeline.",
                ]
              : ["Starting Decision Layer Analysis (Phase 2)..."];

    setAnalysisStatusLog(initialLog);

    const scheduledEntries =
      mode === "image"
        ? [
            {
              delay: 2500,
              message:
                "[gemini] generateContent:gemini-3.1-pro-preview retrying after transient error on the Pro model...",
            },
            {
              delay: 6000,
              message:
                "[gemini] generateContent:gemini-3.1-pro-preview continuing on the Pro model only.",
            },
            {
              delay: 9000,
              message: "Waiting for visual verification result before scoring and coaching calls.",
            },
          ]
        : mode === "video"
          ? [
              {
                delay: 2500,
                message: "Analyzing extracted frames with Gemini.",
              },
              {
                delay: 6000,
                message: "Scoring technical, creative, and market readiness.",
              },
            ]
          : mode === "audio"
            ? [
                {
                  delay: 2500,
                  message: "Listening for structure, quality, and audience fit.",
                },
                {
                  delay: 6000,
                  message: "Scoring readiness and building recommendations.",
                },
              ]
            : [
                {
                  delay: 2500,
                  message: "Reading the content and extracting key signals.",
                },
                {
                  delay: 6000,
                  message: "Scoring readiness and building recommendations.",
                },
              ];

    analysisStatusTimersRef.current = scheduledEntries.map(({ delay, message }) =>
      window.setTimeout(() => {
        setAnalysisStatusLog((prev) =>
          prev.includes(message) ? prev : [...prev, message],
        );
      }, delay),
    );
  };
  const placeholderTexts = [
    "Talk to me instead...",
    "Ask me anything about your content...",
    "What's holding you back?",
    "Not sure where to start?",
    "What do you want to know?",
  ];
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
  const [phIndex, setPhIndex] = useState(0);
  const [phDeleting, setPhDeleting] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourEnabled, setTourEnabled] = useState<boolean>(true);
  useEffect(() => {
    return () => {
      clearAnalysisTimer();
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    setTourEnabled(
      localStorage.getItem("kz_decision_layer_tour_disabled") !== "1",
    );
  }, []);
  const handleTourEnd = useCallback(() => setShowTour(false), []);
  const logHandoffToTerminal = useCallback(
    async (stage: string, payload: Record<string, unknown> = {}) => {
      try {
        await fetch("/api/decision-layer/handoff-debug", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage, payload }),
        });
      } catch {}
    },
    [],
  );

  useDecisionLayerTour(showTour, handleTourEnd);

  // Lock page scroll and hide footer for this page
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const footer = document.querySelector("footer") as HTMLElement | null;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (footer) footer.style.display = "none";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
      if (footer) footer.style.display = "";
    };
  }, []);

  // ─── Pull asset from ?asset_id query param (deep-analysis handoff) ───
  useEffect(() => {
    const assetId = searchParams?.get("asset_id");
    const contentTypeParam = searchParams?.get("content_type");
    const storagePathParam = searchParams?.get("storage_path");
    const assetTitleParam = searchParams?.get("asset_title");
    const mimeTypeParam = searchParams?.get("mime_type");
    void logHandoffToTerminal("decision_layer_handoff_seen", {
      assetId: assetId || null,
      contentTypeParam: contentTypeParam || null,
      storagePathParam: storagePathParam || null,
      assetTitleParam: assetTitleParam || null,
      mimeTypeParam: mimeTypeParam || null,
      handoffMediaType: handoffMediaType || null,
      query: searchParams?.toString() || "",
    });

    if (handoffMediaType) {
      incomingMediaTypeRef.current = handoffMediaType;
      setCreatorContext((prev) =>
        prev.mediaType ? prev : { ...prev, mediaType: handoffMediaType },
      );
      const inferredMode = mapContextMediaToFileMode(handoffMediaType);
      if (inferredMode) {
        setFileMode((prev) => prev ?? inferredMode);
      }
    }

    if (!assetId) {
      void logHandoffToTerminal("decision_layer_handoff_missing_asset_id", {
        query: searchParams?.toString() || "",
      });
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { data: asset, error: assetLookupError } = await supabase
          .from("assets")
          .select("id, title, content_type, storage_path, mime_type")
          .eq("id", assetId)
          .maybeSingle();

        void logHandoffToTerminal("decision_layer_asset_lookup", {
          assetId,
          assetFound: !!asset,
          assetLookupError: assetLookupError?.message || null,
          storagePath: asset?.storage_path || null,
          assetContentType: asset?.content_type || null,
          mimeType: asset?.mime_type || null,
        });

        const resolvedAsset =
          asset && asset.storage_path
            ? asset
            : storagePathParam
              ? {
                  id: assetId,
                  title: assetTitleParam || "asset",
                  content_type: contentTypeParam || mimeTypeParam || "",
                  storage_path: storagePathParam,
                  mime_type: mimeTypeParam || null,
                }
              : null;

        if (!asset?.storage_path && resolvedAsset?.storage_path) {
          void logHandoffToTerminal("decision_layer_asset_lookup_fallback", {
            assetId,
            storagePath: resolvedAsset.storage_path,
            contentType: resolvedAsset.content_type || null,
            mimeType: resolvedAsset.mime_type || null,
          });
        }

        if (!resolvedAsset || !resolvedAsset.storage_path || cancelled) {
          void logHandoffToTerminal("decision_layer_asset_lookup_abort", {
            assetId,
            cancelled,
            hasAsset: !!asset,
            hasStoragePath: !!asset?.storage_path,
            hasFallbackStoragePath: !!storagePathParam,
          });
          return;
        }

        let blob: Blob | null = null;

        // First try authenticated storage access (works for private/unlisted assets).
        const { data: privateBlob, error: privateBlobError } =
          await supabase.storage
            .from("assets")
            .download(resolvedAsset.storage_path);

        void logHandoffToTerminal("decision_layer_private_download", {
          assetId,
          ok: !privateBlobError && !!privateBlob,
          error: privateBlobError?.message || null,
          size: privateBlob?.size ?? null,
          type: privateBlob?.type ?? null,
        });

        if (!privateBlobError && privateBlob) {
          blob = privateBlob;
        }

        // Fallback for public buckets/legacy paths.
        if (!blob) {
          const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${resolvedAsset.storage_path}`;
          const res = await fetch(url);
          void logHandoffToTerminal("decision_layer_public_download", {
            assetId,
            ok: res.ok,
            status: res.status,
          });
          if (res.ok) {
            blob = await res.blob();
            void logHandoffToTerminal("decision_layer_public_download_blob", {
              assetId,
              size: blob.size,
              type: blob.type || null,
            });
          }
        }

        if (!blob) {
          setError(
            "Could not auto-load this incoming asset. Please upload it manually.",
          );
          void logHandoffToTerminal("decision_layer_blob_missing", {
            assetId,
          });
          return;
        }
        if (cancelled) {
          void logHandoffToTerminal("decision_layer_handoff_cancelled", {
            assetId,
          });
          return;
        }

        const filename =
          resolvedAsset.storage_path.split("/").pop() ||
          resolvedAsset.title ||
          "asset";
        const file = new File([blob], filename, {
          type:
            blob.type || resolvedAsset.mime_type || "application/octet-stream",
        });

        const ct = (
          resolvedAsset.content_type ||
          resolvedAsset.mime_type ||
          ""
        ).toLowerCase();
        const suggestedMode = mapRawContentTypeToFileMode(ct);

        // mediaType value the creator-context flow expects
        const mediaTypeValue =
          suggestedMode === "image"
            ? "images"
            : suggestedMode === "video"
              ? "video"
              : suggestedMode === "audio"
                ? "audio"
                : suggestedMode === "text"
                  ? "text"
                  : null;

        setIncomingAsset({
          file,
          title: resolvedAsset.title || filename,
          contentType: ct,
          suggestedMode,
        });
        setError("");
        void logHandoffToTerminal("decision_layer_incoming_asset_ready", {
          assetId,
          fileName: filename,
          fileType: file.type,
          fileSize: file.size,
          suggestedMode: suggestedMode || null,
          mediaTypeValue: mediaTypeValue || null,
        });

        // Skip the media-type question + content-type picker since we know it
        if (suggestedMode) setFileMode(suggestedMode);
        if (mediaTypeValue) {
          incomingMediaTypeRef.current = mediaTypeValue;
          setCreatorContext((prev) =>
            prev.mediaType ? prev : { ...prev, mediaType: mediaTypeValue },
          );
        }
      } catch (err) {
        console.error("Failed to load incoming asset:", err);
        void logHandoffToTerminal("decision_layer_handoff_error", {
          assetId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, handoffMediaType, logHandoffToTerminal]);

  // ─── Auto-inject incoming asset file once user picks matching fileMode ──
  useEffect(() => {
    if (!incomingAsset || !fileMode) return;
    if (injectedIncomingRef.current) return;
    if (uploadedFiles.length > 0 || evaluation) return;
    if (
      incomingAsset.suggestedMode &&
      incomingAsset.suggestedMode !== fileMode
    ) {
      void logHandoffToTerminal("decision_layer_auto_inject_mode_mismatch", {
        fileMode,
        suggestedMode: incomingAsset.suggestedMode,
      });
      return; // User picked a different mode than the asset supports; stay quiet
    }

    injectedIncomingRef.current = true;
    void logHandoffToTerminal("decision_layer_auto_inject_triggered", {
      fileMode,
      suggestedMode: incomingAsset.suggestedMode || null,
      fileName: incomingAsset.file.name,
      fileType: incomingAsset.file.type,
      fileSize: incomingAsset.file.size,
    });
    const dt = new DataTransfer();
    dt.items.add(incomingAsset.file);
    void handleFileUpload({ target: { files: dt.files } } as any, {
      autoAnalyze: false,
      source: "incoming_handoff",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    incomingAsset,
    fileMode,
    uploadedFiles.length,
    evaluation,
    logHandoffToTerminal,
  ]);

  // Stop TTS immediately when user leaves the page
  useEffect(() => {
    return () => {
      currentTTSAbortRef.current?.abort();
      currentTTSAbortRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ─── Restore persisted session on mount ──────────────────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("kz_dl_session");
      if (!saved) return;
      const s = JSON.parse(saved);
      if (s.agentMessages?.length > 0) {
        initializationLock.current = true;
        setAgentMessages(s.agentMessages);
        setConversationPhase(s.conversationPhase || "greeting");
        setShowButtons(s.showButtons ?? false);
        setButtons(s.buttons ?? []);
        setCreatorContext(s.creatorContext ?? {});
        setFileMode(s.fileMode ?? null);
        setUserType(s.userType ?? "unsure");
        setUserIntent(s.userIntent ?? "");
        setEvaluationMessageIndex(s.evaluationMessageIndex ?? -1);
        setShowUploadArea(s.showUploadArea ?? false);
        setStepProgress(s.stepProgress ?? 0);
        setFileHash(s.fileHash ?? "");
        setEvaluationFileHash(s.evaluationFileHash ?? "");
        if (s.evaluation) setEvaluation(s.evaluation);
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Persist session on every key state change ───────────────────────
  useEffect(() => {
    if (agentMessages.length === 0) return;
    try {
      sessionStorage.setItem(
        "kz_dl_session",
        JSON.stringify({
          agentMessages,
          evaluation,
          conversationPhase,
          showButtons,
          buttons,
          creatorContext,
          fileMode,
          userType,
          userIntent,
          evaluationMessageIndex,
          showUploadArea,
          stepProgress,
          fileHash,
          evaluationFileHash,
        }),
      );
    } catch {}
  }, [
    agentMessages,
    evaluation,
    conversationPhase,
    showButtons,
    buttons,
    creatorContext,
    fileMode,
    userType,
    userIntent,
    evaluationMessageIndex,
    showUploadArea,
    stepProgress,
    fileHash,
    evaluationFileHash,
  ]);

  // ─── Initialize agent greeting (no GPT call) ───────────────────────
  useEffect(() => {
    if (initializationLock.current || agentMessages.length > 0) return;
    initializationLock.current = true;
    const greetings = ["__GREETING_3__"];
    setAgentMessages([
      {
        role: "agent",
        content: greetings[Math.floor(Math.random() * greetings.length)],
      },
    ]);
    setShowButtons(true);
    setButtons([
      { id: "quality", label: "Quality", description: "is it good enough?" },
      {
        id: "pricing",
        label: "Pricing",
        description: "I don't know what to charge",
      },
      {
        id: "platform",
        label: "Where to sell",
        description: "no idea where this fits",
      },
      { id: "time", label: "Time to package", description: "it takes forever" },
      {
        id: "consistency",
        label: "Consistency",
        description: "things keep drifting",
      },
      { id: "general", label: "Everything feels stuck", description: "" },
      { id: "other_option", label: "→ Custom", description: "" },
    ]);
  }, []);

  useEffect(() => {
    if (messagesEndRef.current && agentMessages.length > 1) {
      const lastMessage = agentMessages[agentMessages.length - 1];
      const shouldForceScroll = lastMessage?.role === "user" || isAgentTyping;
      if (evaluation && !shouldForceScroll) return;
      scrollDecisionLayerToBottom("messages-updated", "auto");
    }
  }, [agentMessages, evaluation, isAgentTyping, scrollDecisionLayerToBottom]);

  useEffect(() => {
    if (isAgentTyping && !isAnalyzing) {
      scrollDecisionLayerToBottom("agent-typing", "smooth");
    }
  }, [isAgentTyping, isAnalyzing, scrollDecisionLayerToBottom]);
  //
  useEffect(() => {
    const current = placeholderTexts[phIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (!phDeleting && animatedPlaceholder.length < current.length) {
      timeout = setTimeout(
        () =>
          setAnimatedPlaceholder(
            current.slice(0, animatedPlaceholder.length + 1),
          ),
        65,
      );
    } else if (!phDeleting && animatedPlaceholder.length === current.length) {
      timeout = setTimeout(() => setPhDeleting(true), 2200);
    } else if (phDeleting && animatedPlaceholder.length > 0) {
      timeout = setTimeout(
        () => setAnimatedPlaceholder((prev) => prev.slice(0, -1)),
        35,
      );
    } else if (phDeleting && animatedPlaceholder.length === 0) {
      setPhDeleting(false);
      setPhIndex((i) => (i + 1) % placeholderTexts.length);
    }

    return () => clearTimeout(timeout);
  }, [animatedPlaceholder, phDeleting, phIndex]);
  //
  // ─── Upload acknowledgement ───────────────────────────────────────────
  useEffect(() => {
    if (
      uploadedFiles.length > 0 &&
      conversationPhase === "greeting" &&
      !hasAskedPreQuestion
    ) {
      setConversationPhase("pain-diagnosis");
      setHasAskedPreQuestion(true);
      const acknowledgeUpload = async () => {
        setIsAgentTyping(true);
        try {
          const response = await fetch("/api/decision-layer/agent-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: agentMessages,
              phase: "pain-diagnosis",
              hasUploadedFiles: true,
              hasEvaluation: false,
              userIntent,
              fileCount: uploadedFiles.length,
              userType,
            }),
          });
          const data = await response.json();
          if (data.success) {
            setAgentMessages((prev) => [
              ...prev,
              { role: "agent", content: data.message },
            ]);
            if (data.showButtons) {
              setShowButtons(true);
              setButtons(data.buttons || []);
            }
          }
        } catch (error) {
          console.error("Agent error:", error);
        } finally {
          setIsAgentTyping(false);
        }
      };
      acknowledgeUpload();
    }
  }, [uploadedFiles.length, conversationPhase, hasAskedPreQuestion]);
  useEffect(() => {
    if (
      isAnalyzing &&
      (conversationPhase === "awaiting-upload" ||
        conversationPhase === "extracting-media")
    ) {
      setConversationPhase("decision-evaluation");
      const notifyAnalysis = async () => {
        setIsAgentTyping(true);
        try {
          const response = await fetch("/api/decision-layer/agent-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: agentMessages,
              phase: "decision-evaluation",
              hasUploadedFiles: true,
              hasEvaluation: false,
              userIntent,
            }),
          });
          const data = await response.json();
          if (data.success) {
            setAgentMessages((prev) => [
              ...prev,
              { role: "agent", content: data.message },
            ]);
          }
        } catch (error) {
          console.error("Agent error:", error);
        } finally {
          setIsAgentTyping(false);
        }
      };
      notifyAnalysis();
    }
  }, [isAnalyzing]);
  // ─── Stale state detection ────────────────────────────────────────
  useEffect(() => {
    if (
      evaluation &&
      evaluationFileHash &&
      fileHash &&
      fileHash !== evaluationFileHash
    ) {
      setEvaluation(null);
      setAgentMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content:
            "Your files changed since the last evaluation. The previous results have been cleared. Hit Analyze when you're ready to re-evaluate.",
        },
      ]);
      setShowButtons(false);
      setButtons([]);
      // Auto-start evaluation after a brief delay for preview to render
      setTimeout(() => {
        runEvaluation();
      }, 500);
    }
  }, [fileHash]);
  useEffect(() => {
    if (evaluation && conversationPhase === "decision-evaluation") {
      setConversationPhase("decision-options");
      const presentResults = async () => {
        setIsAgentTyping(true);
        try {
          const response = await fetch("/api/decision-layer/agent-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: agentMessages,
              phase: "decision-options",
              hasUploadedFiles: true,
              hasEvaluation: true,
              userIntent,
              evaluation,
              creatorContext,
            }),
          });
          const data = await response.json();
          if (data.success) {
            setAgentMessages((prev) => {
              const newMsg = { role: "agent" as const, content: data.message };
              const updated = [...prev, newMsg];
              setEvaluationMessageIndex(updated.length - 1);
              return updated;
            });
            speakText(data.message);
            // Scroll to top of results instead of bottom
            setTimeout(() => {
              const container = messagesEndRef.current?.parentElement;
              if (container) {
                const resultsEl = container.querySelector(
                  '[class*="border-l-4 p-5"]',
                );
                if (resultsEl) {
                  resultsEl.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }
              }
            }, 200);
            setConversationPhase("companion");
            setStepProgress(20);
            setShowButtons(true);
            setButtons([
              {
                id: "proceed_to_publish",
                label: "Publish Asset",
                description: "Publish to KAIZORA",
              },

              {
                id: "create_remix_plan",
                label: "Create Remix Plan",
                description: "AI remix strategy",
              },
              {
                id: "analyze_again",
                label: "Analyze Again",
                description: "Re-run evaluation",
              },
              {
                id: "improve_help",
                label: "Help Me Fix",
                description: "Coaching mode",
              },
            ]);
          }
        } catch (error) {
          console.error("Agent error:", error);
        } finally {
          setIsAgentTyping(false);
        }
      };
      presentResults();
    }
  }, [evaluation]);
  // ─── Button handler ───────────────────────────────────────────────────
  const handleButtonClick = async (buttonId: string) => {
    if (isAgentTyping) return;
    unlockAudio();
    currentTTSAbortRef.current?.abort();
    currentTTSAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    // Track progress for status bar
    setStepProgress((prev) => Math.min(prev + 1, 20));
    const choiceMessage =
      buttons.find((b) => b.id === buttonId)?.label || buttonId;
    if (buttonId === "upload_now") {
      if (uploadedFiles.length > 0) {
        setShowButtons(true);
        setButtons([
          {
            id: "analyze",
            label: "Analyze",
            description: "Run evaluation now",
          },
        ]);
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content:
              "Your content is already loaded. Click Analyze when you're ready.",
          },
        ]);
        speakText(
          "Your content is already loaded. Click Analyze when you're ready.",
        );
        return;
      }
      setShowButtons(false);
      setHasAskedPreQuestion(true);
      setConversationPhase("awaiting-upload");
      setShowUploadArea(true);
      return;
    }
    if (buttonId === "analyze") {
      setShowButtons(false);
      setButtons([]);
      runEvaluation();
      return;
    }

    if (buttonId === "proceed_to_publish") {
      proceedToPublish();
      return;
    }
    if (buttonId === "save_to_vault") {
      // Save to vault - same as proceed but different route
      if (evaluation) {
        const filesData = await Promise.all(
          uploadedFiles.map(async (f) => {
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(f.file);
            });
            return {
              name: f.file.name,
              type: f.type,
              size: f.file.size,
              base64,
            };
          }),
        );
        sessionStorage.setItem(
          "decisionLayerData",
          JSON.stringify({ evaluation, uploadedFiles: filesData }),
        );
        router.push("/vault");
      }
      return;
    }
    if (buttonId === "analyze_again") {
      setEvaluation(null);
      setConversationPhase("awaiting-upload");
      setShowButtons(false);
      setButtons([]);
      runEvaluation();
      return;
    }
    if (buttonId === "improve_help") {
      // Trigger companion mode with "improve" intent
      setShowButtons(false);
      setButtons([]);
      const msg = {
        role: "user" as const,
        content: "Help me improve this content",
      };
      setAgentMessages((prev) => [...prev, msg]);
      setIsAgentTyping(true);
      try {
        const response = await fetch("/api/decision-layer/agent-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...agentMessages, msg],
            phase: "companion",
            hasUploadedFiles: true,
            hasEvaluation: true,
            userIntent,
            evaluation,
            buttonClicked: "improve",
            creatorContext,
          }),
        });
        const data = await response.json();
        if (data.success) {
          setAgentMessages((prev) => [
            ...prev,
            { role: "agent", content: data.message },
          ]);
          speakText(data.message);
          setShowButtons(true);
          setButtons([
            {
              id: "continue_after_improve",
              label: "Continue",
              description: "Back to options",
            },
          ]);
        }
      } catch (error) {
        console.error("Improve help error:", error);
      } finally {
        setIsAgentTyping(false);
      }
      return;
    }
    if (buttonId === "create_remix_plan") {
      setShowButtons(false);
      setButtons([]);
      setIsPreparingRemixStudio(true);
      const msg = {
        role: "user" as const,
        content: "Create a remix plan for my content",
      };
      setAgentMessages((prev) => [...prev, msg]);
      setIsAgentTyping(true);
      try {
        const response = await fetch("/api/decision-layer/agent-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...agentMessages, msg],
            phase: "companion",
            hasUploadedFiles: true,
            hasEvaluation: true,
            userIntent,
            evaluation,
            buttonClicked: "create_remix_plan",
            creatorContext,
          }),
        });
        const data = await response.json();
        if (data.success) {
          setAgentMessages((prev) => [
            ...prev,
            { role: "agent", content: data.message },
          ]);
          speakText("Your remix plan is ready.");
          setIsAgentTyping(false);
          const promptMatch =
            data.message.match(/Prompt:\s*"([^"]+)"/i) ||
            data.message.match(/Prompt:\s*"(.+?)"/i) ||
            data.message.match(/Prompt:\s*(.+?)(?:\n|$)/i);
          const firstPrompt = promptMatch ? promptMatch[1].trim() : "";
          // Upload files to Supabase storage instead of base64
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const userId = user?.id || "anonymous";
          const timestamp = Date.now();

          const uploadedAssets = await Promise.all(
            uploadedFiles.map(async (f, i) => {
              const ext = f.file.name.split(".").pop() || "bin";
              const storagePath = `${userId}/${timestamp}_${i}.${ext}`;

              const { error: uploadError } = await supabase.storage
                .from("decision-layer-temp")
                .upload(storagePath, f.file, {
                  contentType: f.file.type,
                  upsert: true,
                });

              if (uploadError) {
                console.error("Upload error:", uploadError);
                return null;
              }

              return {
                name: f.file.name,
                content_type: f.file.type,
                size: f.file.size,
                type: f.type,
                storagePath,
              };
            }),
          );

          const validAssets = uploadedAssets.filter(Boolean);

          sessionStorage.setItem(
            "kaizora_remix_session",
            JSON.stringify({
              remixPlan: data.message,
              firstPrompt,
              uploadedAssets: validAssets,
              evaluation,
              creatorContext,
            }),
          );

          setShowButtons(true);
          setButtons([
            {
              id: "open_remix_studio",
              label: "Open Remix Studio",
              description: "Start with prefilled prompt",
            },
            {
              id: "create_remix_plan",
              label: "Create Remix Plan Again",
              description: "Regenerate the plan",
            },
          ]);
        }
      } catch (error) {
        console.error("Remix plan error:", error);
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content:
              "Something went wrong generating the remix plan. Try again.",
          },
        ]);
      } finally {
        setIsAgentTyping(false);
        setIsPreparingRemixStudio(false);
      }
      return;
    }

    if (buttonId === "open_remix_studio") {
      router.push("/remix/studio/regenerate/new");
      return;
    }
    if (buttonId === "ask_question_bottom") {
      setShowButtons(false);
      setButtons([]);
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    if (buttonId === "ask_question") {
      setShowButtons(false);
      setButtons([]);
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    if (buttonId === "continue_after_improve") {
      setShowButtons(true);
      setButtons([
        {
          id: "proceed_to_publish",
          label: "Publish Asset",
          description: "Publish to KAIZORA",
        },
        {
          id: "create_remix_plan",
          label: "Create Remix Plan",
          description: "AI remix strategy",
        },
        {
          id: "analyze_again",
          label: "Analyze Again",
          description: "Re-run evaluation",
        },
        {
          id: "improve_help",
          label: "Help Me Fix",
          description: "Coaching mode",
        },
      ]);
      return;
    }
    if (buttonId === "start_over") {
      triggerStartOver();
      return;
    }
    if (buttonId === "resume_context") {
      setShowButtons(false);
      setButtons([]);
      setShowInlineInput(false);
      // Pre-fill media type from incoming asset so the flow skips that question
      const knownMediaType = incomingMediaTypeRef.current || handoffMediaType;
      const effectiveMediaType =
        creatorContext.mediaType || knownMediaType || "";
      if (!creatorContext.mediaType && knownMediaType) {
        incomingMediaTypeRef.current = knownMediaType;
        setCreatorContext((prev) =>
          prev.mediaType ? prev : { ...prev, mediaType: knownMediaType },
        );
        const inferredMode = mapContextMediaToFileMode(knownMediaType);
        if (inferredMode) {
          setFileMode((prev) => prev ?? inferredMode);
        }
      }
      // Resume the context question flow from where we left off
      const nextStep = !creatorContext.goal
        ? 0
        : !creatorContext.buyer
          ? 1
          : !effectiveMediaType
            ? 2
            : !creatorContext.timeConstraint
              ? 3
              : !creatorContext.qualityLevel
                ? 4
                : !creatorContext.blocker
                  ? 5
                  : 6;
      if (nextStep === 0) {
        setShowButtons(true);
        setButtons([
          {
            id: "ctx_goal_monetize",
            label: "Monetize",
            description: "Make money from this",
          },
          {
            id: "ctx_goal_worth-continuing",
            label: "Worth Continuing?",
            description: "Should I keep going",
          },
          {
            id: "ctx_goal_pricing-packaging",
            label: "Pricing & Packaging",
            description: "How to price and sell",
          },
          {
            id: "ctx_goal_client-ready",
            label: "Client Ready?",
            description: "Good enough for clients",
          },
          {
            id: "ctx_goal_stuck",
            label: "Stuck & Overwhelmed",
            description: "Don't know what to do",
          },
          {
            id: "ctx_goal_exploring",
            label: "Just Exploring",
            description: "Seeing what's possible",
          },
          { id: "other_option", label: "→ Custom", description: "" },
        ]);
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content:
              "Alright, let's continue.\n\nWhat's your goal with this content?",
          },
        ]);
        speakText(
          "Alright, let's continue. What's your goal with this content?",
        );
      } else if (nextStep === 1) {
        setShowButtons(true);
        setButtons([
          {
            id: "ctx_buyer_product",
            label: "Product",
            description: "Sellable digital asset",
          },
          {
            id: "ctx_buyer_marketing",
            label: "Marketing Asset",
            description: "Promo or ad content",
          },
          {
            id: "ctx_buyer_portfolio",
            label: "Portfolio",
            description: "Showcase my work",
          },
          {
            id: "ctx_buyer_story-world",
            label: "Story World",
            description: "Part of a bigger universe",
          },
          {
            id: "ctx_buyer_client",
            label: "Client Deliverable",
            description: "For a specific client",
          },
          {
            id: "ctx_buyer_social",
            label: "Social Series",
            description: "Ongoing social content",
          },
          { id: "other_option", label: "→ Custom", description: "" },
        ]);
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content:
              "Let's pick up where we left off.\n\nWhat is this content becoming?",
          },
        ]);
        speakText(
          "Let's pick up where we left off. What is this content becoming?",
        );
      } else if (nextStep === 2) {
        setShowButtons(true);
        setButtons([
          {
            id: "ctx_media_images",
            label: "Images",
            description: "Photos, illustrations, graphics",
          },
          {
            id: "ctx_media_video",
            label: "Video",
            description: "Clips, reels, motion",
          },
          {
            id: "ctx_media_audio",
            label: "Audio",
            description: "Music, sound, podcasts",
          },
          {
            id: "ctx_media_text",
            label: "Text",
            description: "Guides, scripts, prompts, ebooks",
          },
          {
            id: "ctx_media_both",
            label: "Both",
            description: "Images and video",
          },
          {
            id: "ctx_media_audio-video",
            label: "Audio + Video",
            description: "Sound design included",
          },
          {
            id: "ctx_media_mixed",
            label: "Mixed Formats",
            description: "Multiple content types",
          },
        ]);
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content:
              "Back to it.\n\nWhat type of content are you working with?",
          },
        ]);
        speakText("Back to it. What type of content are you working with?");
      } else if (nextStep === 3) {
        setShowButtons(true);
        setButtons([
          {
            id: "ctx_time_under-1-hour",
            label: "Under 1 Hour",
            description: "Quick fixes only",
          },
          {
            id: "ctx_time_few-hours",
            label: "A Few Hours",
            description: "Some room to improve",
          },
          {
            id: "ctx_time_full-day",
            label: "A Full Day",
            description: "Solid work session",
          },
          {
            id: "ctx_time_week-or-more",
            label: "A Week or More",
            description: "Deep refinement",
          },
          {
            id: "ctx_time_no-deadline",
            label: "No Deadline",
            description: "Take as long as needed",
          },
          { id: "other_option", label: "→ Custom", description: "" },
        ]);
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content: "How much time do you have to work on this?",
          },
        ]);
        speakText("How much time do you have to work on this?");
      } else if (nextStep === 4) {
        setShowButtons(true);
        setButtons([
          {
            id: "ctx_quality_learning",
            label: "Learning",
            description: "Still figuring things out",
          },
          {
            id: "ctx_quality_posting",
            label: "Posting",
            description: "Good enough to share",
          },
          {
            id: "ctx_quality_selling",
            label: "Selling",
            description: "Ready to charge money",
          },
          {
            id: "ctx_quality_client",
            label: "Client Level",
            description: "Professional standard",
          },
          {
            id: "ctx_quality_cinema",
            label: "Cinema",
            description: "Highest production value",
          },
          { id: "other_option", label: "→ Custom", description: "" },
        ]);
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content: "Where are you at with your quality right now?",
          },
        ]);
        speakText("Where are you at with your quality right now?");
      } else if (nextStep === 5) {
        setShowButtons(true);
        setButtons([
          {
            id: "ctx_blocker_not-knowing-next",
            label: "Don't Know What's Next",
            description: "",
          },
          {
            id: "ctx_blocker_where-to-sell",
            label: "Don't Know Where to Sell",
            description: "",
          },
          {
            id: "ctx_blocker_pricing",
            label: "Pricing",
            description: "No idea what to charge",
          },
          {
            id: "ctx_blocker_consistency",
            label: "Consistency",
            description: "Things keep drifting",
          },
          {
            id: "ctx_blocker_packaging-time",
            label: "Packaging Takes Forever",
            description: "",
          },
          {
            id: "ctx_blocker_not-good-enough",
            label: "Not Good Enough Yet",
            description: "",
          },
          { id: "other_option", label: "→ Custom", description: "" },
        ]);
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content:
              "Last question — what's the biggest thing holding you back right now?",
          },
        ]);
        speakText(
          "Last question. What's the biggest thing holding you back right now?",
        );
      } else {
        const hasPreloadedFiles = uploadedFiles.length > 0;
        setShowButtons(true);
        setButtons(
          hasPreloadedFiles
            ? [
                {
                  id: "analyze",
                  label: "Analyze",
                  description: "Run evaluation now",
                },
              ]
            : [
                {
                  id: "upload_now",
                  label: "Upload Content",
                  description: "I'm ready to show you",
                },
              ],
        );
        setAgentMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content: hasPreloadedFiles
              ? "All questions answered. Your content is already loaded. Ready to analyze?"
              : "All questions answered. Ready to upload your content?",
          },
        ]);
        speakText(
          hasPreloadedFiles
            ? "All questions answered. Your content is already loaded. Ready to analyze?"
            : "All questions answered. Ready to upload your content?",
        );
      }
      return;
    }

    if (buttonId === "ask_another") {
      setShowButtons(false);
      setButtons([]);
      setShowInlineInput(true);
      setInlineInputValue("");
      setTimeout(() => inlineInputRef.current?.focus(), 100);
      return;
    }
    if (["quality", "consistency", "general"].includes(buttonId))
      setUserType("hobbyist");
    else if (["pricing", "platform", "time"].includes(buttonId))
      setUserType("professional");
    // Update phase based on what was clicked
    if (
      [
        "quality",
        "pricing",
        "platform",
        "time",
        "consistency",
        "general",
      ].includes(buttonId)
    ) {
      setConversationPhase("pain-diagnosis");
    }
    if (buttonId.startsWith("ctx_")) {
      setConversationPhase("pain-diagnosis");
    }
    const newUserMessage = { role: "user" as const, content: choiceMessage };
    if (buttonId.startsWith("ctx_goal_"))
      setCreatorContext((prev) => ({
        ...prev,
        goal: buttonId.replace("ctx_goal_", ""),
      }));
    if (buttonId.startsWith("ctx_buyer_"))
      setCreatorContext((prev) => ({
        ...prev,
        buyer: buttonId.replace("ctx_buyer_", ""),
      }));
    if (buttonId.startsWith("ctx_quality_"))
      setCreatorContext((prev) => ({
        ...prev,
        qualityLevel: buttonId.replace("ctx_quality_", ""),
      }));
    if (buttonId.startsWith("ctx_blocker_"))
      setCreatorContext((prev) => ({
        ...prev,
        blocker: buttonId.replace("ctx_blocker_", ""),
      }));
    if (buttonId.startsWith("ctx_media_"))
      setCreatorContext((prev) => ({
        ...prev,
        mediaType: buttonId.replace("ctx_media_", ""),
      }));
    if (buttonId.startsWith("ctx_time_"))
      setCreatorContext((prev) => ({
        ...prev,
        timeConstraint: buttonId.replace("ctx_time_", ""),
      }));
    setShowButtons(false);
    setButtons([]);
    setAgentMessages((prev) => [...prev, newUserMessage]);
    setIsAgentTyping(true);
    try {
      const response = await fetch("/api/decision-layer/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...agentMessages, newUserMessage],
          phase: conversationPhase,
          userType,
          hasUploadedFiles: uploadedFiles.length > 0,
          hasEvaluation: !!evaluation,
          userIntent,
          evaluation: evaluation || null,
          buttonClicked: buttonId,
          fileCount: uploadedFiles.length,
          creatorContext,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setAgentMessages((prev) => [
          ...prev,
          { role: "agent", content: data.message },
        ]);
        // Only speak API response if NOT in context question flow (next question speaks itself)
        const isContextFlow =
          buttonId.startsWith("ctx_") ||
          buttonId.startsWith("l3_") ||
          buttonId === "context_start" ||
          [
            "quality",
            "pricing",
            "platform",
            "time",
            "consistency",
            "general",
          ].includes(buttonId);
        if (!isContextFlow) {
          speakText(data.message);
        }

        // Force 4-question sequence instead of relying on API buttons
        if (
          conversationPhase === "greeting" ||
          conversationPhase === "pain-diagnosis"
        ) {
          // Build updated context including what was just clicked
          const updatedContext = { ...creatorContext };
          if (buttonId.startsWith("ctx_goal_"))
            updatedContext.goal = buttonId.replace("ctx_goal_", "");
          if (buttonId.startsWith("ctx_buyer_"))
            updatedContext.buyer = buttonId.replace("ctx_buyer_", "");
          if (buttonId.startsWith("ctx_media_"))
            updatedContext.mediaType = buttonId.replace("ctx_media_", "");
          if (buttonId.startsWith("ctx_time_"))
            updatedContext.timeConstraint = buttonId.replace("ctx_time_", "");
          if (buttonId.startsWith("ctx_quality_"))
            updatedContext.qualityLevel = buttonId.replace("ctx_quality_", "");
          if (buttonId.startsWith("ctx_blocker_"))
            updatedContext.blocker = buttonId.replace("ctx_blocker_", "");

          // If an asset is incoming with a known media type, inject it so the
          // flow never asks "what type of content are you working with?".
          const knownMediaType =
            incomingMediaTypeRef.current || handoffMediaType;
          if (!updatedContext.mediaType && knownMediaType) {
            updatedContext.mediaType = knownMediaType;
            incomingMediaTypeRef.current = knownMediaType;
            setCreatorContext((prev) =>
              prev.mediaType ? prev : { ...prev, mediaType: knownMediaType },
            );
            const inferredMode = mapContextMediaToFileMode(knownMediaType);
            if (inferredMode) {
              setFileMode((prev) => prev ?? inferredMode);
            }
          }

          const nextStep = !updatedContext.goal
            ? 0
            : !updatedContext.buyer
              ? 1
              : !updatedContext.mediaType
                ? 2
                : !updatedContext.timeConstraint
                  ? 3
                  : !updatedContext.qualityLevel
                    ? 4
                    : !updatedContext.blocker
                      ? 5
                      : 6;
          if (nextStep === 0) {
            setShowButtons(true);
            setButtons([
              {
                id: "ctx_goal_monetize",
                label: "Monetize",
                description: "Make money from this",
              },
              {
                id: "ctx_goal_worth-continuing",
                label: "Worth Continuing?",
                description: "Should I keep going",
              },
              {
                id: "ctx_goal_pricing-packaging",
                label: "Pricing & Packaging",
                description: "How to price and sell",
              },
              {
                id: "ctx_goal_client-ready",
                label: "Client Ready?",
                description: "Good enough for clients",
              },
              {
                id: "ctx_goal_stuck",
                label: "Stuck & Overwhelmed",
                description: "Don't know what to do",
              },
              {
                id: "ctx_goal_exploring",
                label: "Just Exploring",
                description: "Seeing what's possible",
              },
              { id: "other_option", label: "→ Custom", description: "" },
            ]);
            setAgentMessages((prev) => [
              ...prev,
              {
                role: "agent",
                content:
                  "Got it. Now let me understand your situation.\n\nWhat's your goal with this content?",
              },
            ]);
            setContextStep(1);
            speakText(
              "Got it. Now let me understand your situation. What's your goal with this content?",
            );
          } else if (nextStep === 1) {
            setShowButtons(true);
            setButtons([
              {
                id: "ctx_buyer_product",
                label: "Product",
                description: "Sellable digital asset",
              },
              {
                id: "ctx_buyer_marketing",
                label: "Marketing Asset",
                description: "Promo or ad content",
              },
              {
                id: "ctx_buyer_portfolio",
                label: "Portfolio",
                description: "Showcase my work",
              },
              {
                id: "ctx_buyer_story-world",
                label: "Story World",
                description: "Part of a bigger universe",
              },
              {
                id: "ctx_buyer_client",
                label: "Client Deliverable",
                description: "For a specific client",
              },
              {
                id: "ctx_buyer_social",
                label: "Social Series",
                description: "Ongoing social content",
              },
              { id: "other_option", label: "→ Custom", description: "" },
            ]);
            setAgentMessages((prev) => [
              ...prev,
              { role: "agent", content: "What is this content becoming?" },
            ]);
            setContextStep(2);
            speakText("What is this content becoming?");
          } else if (nextStep === 2) {
            setShowButtons(true);
            setButtons([
              {
                id: "ctx_media_images",
                label: "Images",
                description: "Photos, illustrations, graphics",
              },
              {
                id: "ctx_media_video",
                label: "Video",
                description: "Clips, reels, motion",
              },
              {
                id: "ctx_media_audio",
                label: "Audio",
                description: "Music, sound, podcasts",
              },
              {
                id: "ctx_media_text",
                label: "Text",
                description: "Guides, scripts, prompts, ebooks",
              },
            ]);
            setAgentMessages((prev) => [
              ...prev,
              {
                role: "agent",
                content: "What type of content are you working with?",
              },
            ]);
            setContextStep(3);
            speakText("What type of content are you working with?");
          } else if (nextStep === 3) {
            setShowButtons(true);
            setButtons([
              {
                id: "ctx_time_under-1-hour",
                label: "Under 1 Hour",
                description: "Quick fixes only",
              },
              {
                id: "ctx_time_few-hours",
                label: "A Few Hours",
                description: "Some room to improve",
              },
              {
                id: "ctx_time_full-day",
                label: "A Full Day",
                description: "Solid work session",
              },
              {
                id: "ctx_time_week-or-more",
                label: "A Week or More",
                description: "Deep refinement",
              },
              {
                id: "ctx_time_no-deadline",
                label: "No Deadline",
                description: "Take as long as needed",
              },
              { id: "other_option", label: "→ Custom", description: "" },
            ]);
            setAgentMessages((prev) => [
              ...prev,
              {
                role: "agent",
                content: "How much time do you usually spend on this?",
              },
            ]);
            setContextStep(4);
            speakText("How much time do you usually spend on this?");
          } else if (nextStep === 4) {
            setShowButtons(true);
            setButtons([
              {
                id: "ctx_quality_learning",
                label: "Learning",
                description: "Still figuring things out",
              },
              {
                id: "ctx_quality_posting",
                label: "Posting",
                description: "Good enough to share",
              },
              {
                id: "ctx_quality_selling",
                label: "Selling",
                description: "Ready to charge money",
              },
              {
                id: "ctx_quality_client",
                label: "Client Level",
                description: "Professional standard",
              },
              {
                id: "ctx_quality_cinema",
                label: "Cinema",
                description: "Highest production value",
              },
              { id: "other_option", label: "→ Custom", description: "" },
            ]);
            setAgentMessages((prev) => [
              ...prev,
              {
                role: "agent",
                content: "Where are you at with your quality right now?",
              },
            ]);
            setContextStep(5);
            speakText("Where are you at with your quality right now?");
          } else if (nextStep === 5) {
            setShowButtons(true);
            setButtons([
              {
                id: "ctx_blocker_not-knowing-next",
                label: "Don't Know What's Next",
                description: "",
              },
              {
                id: "ctx_blocker_where-to-sell",
                label: "Don't Know Where to Sell",
                description: "",
              },
              {
                id: "ctx_blocker_pricing",
                label: "Pricing",
                description: "No idea what to charge",
              },
              {
                id: "ctx_blocker_consistency",
                label: "Video Consistency",
                description: "Things keep drifting",
              },
              {
                id: "ctx_blocker_packaging-time",
                label: "Packaging Takes Forever",
                description: "",
              },
              {
                id: "ctx_blocker_not-good-enough",
                label: "Not Good Enough Yet",
                description: "",
              },
              { id: "other_option", label: "→ Custom", description: "" },
            ]);
            setAgentMessages((prev) => [
              ...prev,
              {
                role: "agent",
                content:
                  "Last question — what's the biggest thing holding you back right now?",
              },
            ]);
            setContextStep(6);
            speakText(
              "Last question. What's the biggest thing holding you back right now?",
            );
          } else {
            // Auto-set fileMode from Q3 media type
            const media = updatedContext.mediaType || "";
            if (media === "images") {
              setFileMode("image");
            } else if (media === "video") {
              setFileMode("video");
            } else if (media === "audio") {
              setFileMode("audio");
            } else if (media === "text") {
              setFileMode("text");
            }
            // media === "both" or "mixed" → fileMode stays null, user picks

            // Auto-show upload area
            const hasPreloadedFiles = uploadedFiles.length > 0;
            setShowUploadArea(true);
            setHasAskedPreQuestion(true);
            setConversationPhase("awaiting-upload");
            if (hasPreloadedFiles) {
              setShowButtons(true);
              setButtons([
                {
                  id: "analyze",
                  label: "Analyze",
                  description: "Run evaluation now",
                },
              ]);
            } else {
              setShowButtons(false);
              setButtons([]);
            }

            setAgentMessages((prev) => [
              ...prev,
              {
                role: "agent",
                content: `Here's what I understand:\n\n→ Goal: ${updatedContext.goal || "not set"}\n→ Content type: ${updatedContext.buyer || "not set"}\n→ Media: ${updatedContext.mediaType || "not set"}\n→ Time available: ${updatedContext.timeConstraint || "not set"}\n→ Quality level: ${updatedContext.qualityLevel || "not set"}\n→ Blocker: ${updatedContext.blocker || "not set"}\n\nI'll use all of this to give you a tailored evaluation. ${hasPreloadedFiles ? "Click Analyze when you're ready." : "Upload your content when you're ready."}`,
              },
            ]);
            speakText(
              `Here's what I understand. Your goal is ${updatedContext.goal || "not set"}. Content type: ${updatedContext.buyer || "not set"}. Media: ${updatedContext.mediaType || "not set"}. Time available: ${updatedContext.timeConstraint || "not set"}. Quality level: ${updatedContext.qualityLevel || "not set"}. Blocker: ${updatedContext.blocker || "not set"}. ${hasPreloadedFiles ? "Click Analyze when you're ready." : "Upload your content when you're ready."}`,
            );
          }
        } else {
          // Outside the greeting/pre-decision flow, use API buttons as normal
          setShowButtons(data.showButtons || false);
          setButtons(data.buttons || []);
        }
      }
    } catch (error) {
      console.error("Button click error:", error);
    } finally {
      setIsAgentTyping(false);
    }
  };

  //
  const sendInlineQuestion = async () => {
    if (otherTargetField) {
      const value = inlineInputValue.trim();
      setCreatorContext((prev) => ({ ...prev, [otherTargetField]: value }));
      setOtherTargetField(null);
      setInlineInputValue("");
      setShowInlineInput(false);
      handleButtonClick(
        `ctx_${otherTargetField === "buyer" ? "buyer" : otherTargetField === "mediaType" ? "media" : otherTargetField === "timeConstraint" ? "time" : otherTargetField === "qualityLevel" ? "quality" : otherTargetField === "blocker" ? "blocker" : "goal"}_${value.toLowerCase().replace(/\s+/g, "-")}`,
      );
      return;
    }
    if (!inlineInputValue.trim()) return;
    unlockAudio();
    const message = inlineInputValue.trim();
    setInlineInputValue("");
    setShowInlineInput(false);

    const newUserMessage = { role: "user" as const, content: message };
    setAgentMessages((prev) => [...prev, newUserMessage]);
    setIsAgentTyping(true);
    logDecisionLayerInput("inline-question-send", {
      message,
      phase: conversationPhase,
      hasUploadedFiles: uploadedFiles.length > 0,
      hasEvaluation: !!evaluation,
      creatorContext,
    });
    scrollDecisionLayerToBottom("inline-question-send");

    try {
      const response = await fetch("/api/decision-layer/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...agentMessages, newUserMessage],
          phase: conversationPhase,
          hasUploadedFiles: uploadedFiles.length > 0,
          hasEvaluation: !!evaluation,
          userIntent,
          evaluation: evaluation || null,
          creatorContext,
          freeFormDuringContext: true,
          streaming: true,
        }),
      });
      logDecisionLayerInput("inline-question-request-sent", {
        modelTarget: "gemini-3.1-flash-lite",
        streaming: true,
        responseStatus: response.status,
        phase: conversationPhase,
      });

      if (response.headers.get("X-Kaizora-Stream") === "1") {
        setAgentMessages((prev) => [...prev, { role: "agent", content: "" }]);
        scrollDecisionLayerToBottom("inline-question-stream-open");
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          setAgentMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "agent", content: fullText };
            return updated;
          });
        }
        logDecisionLayerInput("inline-question-stream-complete", {
          responsePreview: fullText.slice(0, 200),
          responseLength: fullText.length,
        });
        setIsAgentTyping(false);
        speakText(fullText);
        setShowButtons(true);
        setButtons([
          {
            id: "resume_context",
            label: "Continue",
            description: "Back to the questions",
          },
          {
            id: "ask_another",
            label: "Ask Another",
            description: "I have more questions",
          },
        ]);
      } else {
        const data = await response.json();
        if (data.success) {
          logDecisionLayerInput("inline-question-json-response", {
            responsePreview: data.message?.slice(0, 200),
          });
          setAgentMessages((prev) => [
            ...prev,
            { role: "agent", content: data.message },
          ]);
          setIsAgentTyping(false);
          speakText(data.message);
          setShowButtons(true);
          setButtons([
            {
              id: "resume_context",
              label: "Continue",
              description: "Back to the questions",
            },
            {
              id: "ask_another",
              label: "Ask Another",
              description: "I have more questions",
            },
          ]);
        }
      }
    } catch (error) {
      console.error("Inline question error:", error);
      setIsAgentTyping(false);
    }
  };
  //
  const sendToAgent = async (message: string) => {
    if (!message.trim()) return;
    unlockAudio();
    const newUserMessage = { role: "user" as const, content: message };
    setAgentMessages((prev) => [...prev, newUserMessage]);
    setUserMessage("");
    setIsAgentTyping(true);
    logDecisionLayerInput("send-message", {
      message,
      phase: conversationPhase,
      hasUploadedFiles: uploadedFiles.length > 0,
      hasEvaluation: !!evaluation,
      creatorContext,
      userIntent,
    });
    scrollDecisionLayerToBottom("send-message");
    try {
      // Determine if we're in context question flow
      const isInContextFlow =
        conversationPhase === "greeting" ||
        conversationPhase === "pain-diagnosis";

      const response = await fetch("/api/decision-layer/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...agentMessages, newUserMessage],
          phase: conversationPhase,
          hasUploadedFiles: uploadedFiles.length > 0,
          hasEvaluation: !!evaluation,
          userIntent,
          evaluation: evaluation || null,
          creatorContext,
          freeFormDuringContext: isInContextFlow,
          streaming: true,
        }),
      });
      logDecisionLayerInput("agent-chat-request-sent", {
        modelTarget: "gemini-3.1-flash-lite",
        streaming: true,
        responseStatus: response.status,
        phase: conversationPhase,
      });

      if (response.headers.get("X-Kaizora-Stream") === "1") {
        // ── Streaming path: text appears as model generates it ──
        setAgentMessages((prev) => [...prev, { role: "agent", content: "" }]);
        scrollDecisionLayerToBottom("agent-chat-stream-open");
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          setAgentMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "agent", content: fullText };
            return updated;
          });
        }
        logDecisionLayerInput("agent-chat-stream-complete", {
          responsePreview: fullText.slice(0, 200),
          responseLength: fullText.length,
        });
        setIsAgentTyping(false);
        speakText(fullText);
        if (isInContextFlow) {
          setShowButtons(true);
          setButtons([
            {
              id: "resume_context",
              label: "Continue",
              description: "Back to the questions",
            },
            {
              id: "ask_another",
              label: "Ask Another",
              description: "I have more questions",
            },
          ]);
        } else if (conversationPhase === "companion" && evaluation) {
          setShowButtons(true);
          setButtons([
            {
              id: "proceed_to_publish",
              label: "Publish Asset",
              description: "Publish to KAIZORA",
            },
            {
              id: "analyze_again",
              label: "Analyze Again",
              description: "Re-run evaluation",
            },
            {
              id: "improve_help",
              label: "Help Me Fix",
              description: "Coaching mode",
            },
          ]);
        } else if (conversationPhase === "awaiting-upload") {
          setShowButtons(true);
          setButtons([
            {
              id: "upload_now",
              label: "Upload Content",
              description: "I'm ready to show you",
            },
          ]);
        }
      } else {
        // ── JSON fallback ──
        const data = await response.json();
        if (data.success) {
          logDecisionLayerInput("agent-chat-json-response", {
            responsePreview: data.message?.slice(0, 200),
          });
          setAgentMessages((prev) => [
            ...prev,
            { role: "agent", content: data.message },
          ]);
          setIsAgentTyping(false);
          speakText(data.message);
        }
      }
    } catch (error) {
      setAgentMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: "I'm having trouble responding. Please try again.",
        },
      ]);
      setIsAgentTyping(false);
    }
  };
  // ─── File upload ──────────────────────────────────────────────────────
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList } },
    options?: { autoAnalyze?: boolean; source?: "manual" | "incoming_handoff" },
  ) => {
    const files = Array.from(e.target.files || []);
    const newFiles = await validateAndPrepareFiles(files);
    if (newFiles.length === 0) return;
    const updated = [...uploadedFiles, ...newFiles].slice(
      0,
      UPLOAD_LIMITS.maxTotalAssets,
    );
    setUploadedFiles(updated);
    setFileHash(computeFileHash(updated));
    setStepProgress((prev) => Math.max(prev, 10));
    const shouldAutoAnalyze = options?.autoAnalyze !== false;
    if (shouldAutoAnalyze) {
      void runEvaluation(updated);
    } else {
      void logHandoffToTerminal(
        "decision_layer_file_loaded_waiting_for_analyze",
        {
          source: options?.source || "manual",
          count: updated.length,
          analysisMode,
        },
      );
    }
    // Run client-side signal extraction
    Promise.all(updated.map((f) => extractSignals(f.file))).then((signals) => {
      setClientSignals(signals);
    });
  };
  const removeFile = (index: number) => {
    const removed = uploadedFiles[index];
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    const updated = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(updated);
    setFileHash(computeFileHash(updated));
  };
  // ─── Run evaluation ───────────────────────────────────────────────────
  const runEvaluation = async (filesToUse?: UploadedFile[]) => {
    const files = filesToUse || uploadedFiles;
    setIsAnalyzing(true);
    setStepProgress(15);
    setError("");
    setAnalysisApiInfo(null);
    scheduleAnalysisStatusLog(fileMode);
    startAnalysisTimer();
    setConversationPhase("extracting-media");
    // AI-generated upload acknowledgment
    try {
      const fileType =
        fileMode === "video"
          ? "video"
          : fileMode === "audio"
            ? "audio"
            : fileMode === "text"
              ? "text"
              : "image";
      const ackResponse = await fetch("/api/decision-layer/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: agentMessages,
          phase: "extracting-media",
          hasUploadedFiles: true,
          hasEvaluation: false,
          userIntent,
          fileCount: uploadedFiles.length,
          creatorContext,
          buttonClicked: `ack_upload_${fileType}`,
        }),
      });
      const ackData = await ackResponse.json();
      if (ackData.success && ackData.message) {
        setAgentMessages((prev) => [
          ...prev,
          { role: "agent", content: ackData.message },
        ]);
        speakText(ackData.message);
        await new Promise((r) =>
          setTimeout(r, analysisMode === "fast" ? 250 : 1500),
        );
      }
    } catch (e) {
      console.error("Upload ack error:", e);
    }

    const maxRetries = fileMode === "video" ? 3 : 1;

    const buildFormData = async () => {
      const formData = new FormData();
      files.forEach((item) => formData.append("files", item.file));
      if (customPrompt.trim()) formData.append("customPrompt", customPrompt);
      if (userIntent) formData.append("userIntent", userIntent);
      formData.append("creatorContext", JSON.stringify(creatorContext));
      formData.append("conversationContext", JSON.stringify(agentMessages));
      formData.append(
        "userConcern",
        buttons.find((b) => b.id)?.id || "general",
      );
      if (clientSignals.length > 0) {
        formData.append("clientSignals", JSON.stringify(clientSignals));
      }
      formData.append("analysisMode", analysisMode);
      // Add userId for credit deduction
      const {
        data: { user },
      } = await supabase.auth.getUser();
      formData.append("userId", user?.id || "anonymous");
      return formData;
    };

    const fetchWithTimeout = async (
      url: string,
      formData: FormData,
    ): Promise<Response> => {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });
      return response;
    };

    const apiUrl =
      fileMode === "video"
        ? "/api/decision-layer-video/evaluate"
        : fileMode === "audio"
          ? "/api/decision-layer-audio/evaluate"
          : fileMode === "text"
            ? "/api/decision-layer-text/evaluate"
            : "/api/decision-layer/evaluate";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          // Notify user of retry
          setAgentMessages((prev) => [
            ...prev,
            {
              role: "agent",
              content: `Frame extraction failed. Retrying... (attempt ${attempt}/${maxRetries})`,
            },
          ]);
          // Brief delay before retry
          await new Promise((r) => setTimeout(r, 2000));
        }

        const formData = await buildFormData();
        const response = await fetchWithTimeout(apiUrl, formData);
        const data = await response.json();

        if (!response.ok) {
          const apiInfo = extractAnalysisApiInfo(data, apiUrl);
          setAnalysisApiInfo(apiInfo);
          if (apiInfo.statusLog && apiInfo.statusLog.length > 0) {
            clearAnalysisStatusTimers();
            setAnalysisStatusLog(apiInfo.statusLog);
          }
          if (data.creditError) {
            const message = buildErrorMessage(
              data,
              "Failed to evaluate content",
            );
            stopAnalysisTimer();
            setError(message);
            setIsAnalyzing(false);
            clearAnalysisStatusTimers();
            showToast("error", message);
            setAgentMessages((prev) => [
              ...prev,
              { role: "agent", content: message },
            ]);
            return;
          }
          throw new Error(
            buildErrorMessage(data, "Failed to evaluate content"),
          );
        }

        if (data.success && data.evaluation) {
          setEvaluation(data.evaluation);
          setEvaluationFileHash(fileHash);
          const apiInfo = extractAnalysisApiInfo(data, apiUrl);
          setAnalysisApiInfo(apiInfo);
          clearAnalysisStatusTimers();
          setAnalysisStatusLog(
            apiInfo.statusLog && apiInfo.statusLog.length > 0
              ? apiInfo.statusLog
              : [],
          );
          stopAnalysisTimer();
          setIsAnalyzing(false);
          return; // Success — exit
        } else {
          throw new Error("Invalid response from server");
        }
      } catch (err: any) {
        const isTimeout = false;
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt) {
          console.error("Evaluation error after all retries:", err);
          const message =
            err.message || "Failed to evaluate content. Please try again.";
          stopAnalysisTimer();
          setError(message);
          clearAnalysisStatusTimers();
          showToast("error", message);
          setAgentMessages((prev) => [
            ...prev,
            {
              role: "agent",
              content: isTimeout
                ? "The analysis timed out. This can happen with large video files. Try a shorter clip or try again in a moment."
                : "I wasn't able to complete the analysis. Let's try again — sometimes it just needs another attempt.",
            },
          ]);
          setShowButtons(true);
          setButtons([
            {
              id: "analyze",
              label: "Try Again",
              description: "Re-run evaluation",
            },
          ]);
        } else {
          console.warn(`Attempt ${attempt} failed:`, err.message);
        }
      }
    }

    stopAnalysisTimer();
    setIsAnalyzing(false);
    clearAnalysisStatusTimers();
  };
  const cancelStartOver = () => {
    if (startOverIntervalRef.current)
      clearInterval(startOverIntervalRef.current);
    startOverIntervalRef.current = null;
    setStartOverActive(false);
    setStartOverProgress(0);
  };

  const triggerStartOver = () => {
    if (startOverActive) {
      cancelStartOver();
      return;
    }
    setStartOverActive(true);
    setStartOverProgress(0);
    let progress = 0;
    startOverIntervalRef.current = setInterval(() => {
      progress += 2;
      setStartOverProgress(progress);
      if (progress >= 100) {
        if (startOverIntervalRef.current)
          clearInterval(startOverIntervalRef.current);
        startOverIntervalRef.current = null;
        setStartOverActive(false);
        setStartOverProgress(0);
        reset();
      }
    }, 30);
  };

  const reset = () => {
    uploadedFiles.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    sessionStorage.removeItem("kz_dl_session");
    setUploadedFiles([]);
    setCustomPrompt("");
    setEvaluation(null);
    setError("");
    setToast(null);
    setUserIntent("");
    setConversationPhase("greeting");
    setFileMode(null);
    setShowUploadArea(false);
    setHasAskedPreQuestion(false);
    setAgentMessages([{ role: "agent", content: RETURN_MESSAGE }]);
    setShowButtons(true);
    setCreatorContext({});
    setStepProgress(0);
    setContextStep(0);
    setShowInlineInput(false);
    setShowOtherInline(false);
    setIsPreparingRemixStudio(false);
    setInlineInputValue("");
    setFileHash("");
    setEvaluationFileHash("");
    setAnalysisElapsedMs(0);
    setAnalysisApiInfo(null);
    setClientSignals([]);
    setLocalDescription("");
    setEvaluationMessageIndex(-1);
    setButtons([
      { id: "quality", label: "Quality", description: "is it good enough?" },
      {
        id: "pricing",
        label: "Pricing",
        description: "I don't know what to charge",
      },
      {
        id: "platform",
        label: "Where to sell",
        description: "no idea where this fits",
      },
      { id: "time", label: "Time to package", description: "it takes forever" },
      {
        id: "consistency",
        label: "Consistency",
        description: "things keep drifting",
      },
      { id: "general", label: "Everything feels stuck", description: "" },
    ]);
  };
  // ─── Proceed to publish ───────────────────────────────────────────────
  const proceedToPublish = async () => {
    if (!evaluation) return;
    const filesData = await Promise.all(
      uploadedFiles.map(async (f) => {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(f.file);
        });
        return { name: f.file.name, type: f.type, size: f.file.size, base64 };
      }),
    );
    sessionStorage.setItem(
      "decisionLayerData",
      JSON.stringify({
        evaluation,
        context: {
          contentType:
            creatorContext.mediaType === "images"
              ? "image"
              : creatorContext.mediaType || "image",
          targetAudience: creatorContext.buyer || "",
          qualityLevel: creatorContext.qualityLevel || "balanced",
        },
        uploadedFiles: filesData,
      }),
    );
    router.push("/creator/assets/create");
  };
  // ─── File hashing for stale detection ─────────────────────────────
  const computeFileHash = (files: UploadedFile[]): string => {
    if (files.length === 0) return "";
    return files
      .map((f) => `${f.file.name}_${f.file.size}_${f.file.lastModified}`)
      .sort()
      .join("|");
  };
  const isPdfFile = (file: File) => {
    const isMimePdf = file.type === "application/pdf";
    const hasPdfExt = file.name.toLowerCase().endsWith(".pdf");
    return isMimePdf || hasPdfExt;
  };
  const isTextFile = (file: File) => {
    const textTypes = [
      "text/plain",
      "text/markdown",
      "text/csv",
      "text/html",
      "text/rtf",
      "application/json",
    ];
    const textExts = [
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".json",
      ".html",
      ".rtf",
      ".log",
    ];
    return (
      textTypes.some((t) => file.type.includes(t)) ||
      textExts.some((ext) => file.name.toLowerCase().endsWith(ext))
    );
  };
  const isPrimaryTypeForMode = (
    file: File,
    mode: "image" | "video" | "audio" | "text",
  ) =>
    mode === "text"
      ? isTextFile(file) || isPdfFile(file)
      : file.type.startsWith(`${mode}/`);
  const getVideoDurationSeconds = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve(video.duration || 0);
        URL.revokeObjectURL(url);
      };
      video.onerror = () => {
        resolve(0);
        URL.revokeObjectURL(url);
      };
      video.src = url;
    });
  };
  const validateAndPrepareFiles = async (
    selectedFiles: File[],
  ): Promise<UploadedFile[]> => {
    if (!fileMode) {
      setError(
        "Choose a primary content type first (image, video, audio, or text).",
      );
      return [];
    }

    const prepared: UploadedFile[] = [];
    const errors: string[] = [];
    let primaryCount = uploadedFiles.filter((f) => f.role === "primary").length;
    let supportingCount = uploadedFiles.filter(
      (f) => f.role === "supporting",
    ).length;

    for (const file of selectedFiles) {
      const isPrimaryType = isPrimaryTypeForMode(file, fileMode);
      const isPdf = isPdfFile(file);

      if (!isPrimaryType && !isPdf) {
        errors.push(
          `${file.name}: unsupported type for ${fileMode} evaluation. Upload ${fileMode} files and optional PDF docs only.`,
        );
        continue;
      }

      const role: "primary" | "supporting" =
        isPrimaryType && primaryCount < UPLOAD_LIMITS.maxPrimaryAssets
          ? "primary"
          : "supporting";

      if (role === "supporting" && primaryCount === 0) {
        errors.push(
          `${file.name}: add one primary ${fileMode} file before supporting assets.`,
        );
        continue;
      }

      if (
        role === "primary" &&
        primaryCount >= UPLOAD_LIMITS.maxPrimaryAssets
      ) {
        errors.push(
          `Only ${UPLOAD_LIMITS.maxPrimaryAssets} primary asset is allowed.`,
        );
        continue;
      }

      if (
        role === "supporting" &&
        supportingCount >= UPLOAD_LIMITS.maxSupportingAssets
      ) {
        errors.push(
          `You can upload up to ${UPLOAD_LIMITS.maxSupportingAssets} supporting assets.`,
        );
        continue;
      }

      const maxSizeBytes = isPdf
        ? UPLOAD_LIMITS.pdfBytes
        : isPrimaryTypeForMode(file, "video")
          ? UPLOAD_LIMITS.videoBytes
          : isPrimaryTypeForMode(file, "audio")
            ? UPLOAD_LIMITS.audioBytes
            : isPrimaryTypeForMode(file, "text")
              ? UPLOAD_LIMITS.textBytes
              : UPLOAD_LIMITS.imageBytes;

      if (file.size > maxSizeBytes) {
        errors.push(
          `${file.name}: exceeds ${(maxSizeBytes / MB).toFixed(0)}MB limit.`,
        );
        continue;
      }

      if (isPrimaryTypeForMode(file, "video")) {
        const duration = await getVideoDurationSeconds(file);
        if (duration > 0 && duration > UPLOAD_LIMITS.maxVideoDurationSeconds) {
          errors.push(
            `${file.name}: exceeds ${UPLOAD_LIMITS.maxVideoDurationSeconds}s video duration limit.`,
          );
          continue;
        }
      }

      const isText = isPrimaryTypeForMode(file, "text");
      prepared.push({
        file,
        preview: isPdf || isText ? null : URL.createObjectURL(file),
        type: isPdf ? "pdf" : isText ? "text" : file.type.split("/")[0],
        role,
      });
      if (role === "primary") primaryCount += 1;
      else supportingCount += 1;
      if (primaryCount + supportingCount >= UPLOAD_LIMITS.maxTotalAssets) break;
    }

    if (
      selectedFiles.length + uploadedFiles.length >
      UPLOAD_LIMITS.maxTotalAssets
    ) {
      errors.push(
        `Max ${UPLOAD_LIMITS.maxTotalAssets} files per evaluation (1 primary + up to ${UPLOAD_LIMITS.maxSupportingAssets} supporting).`,
      );
    }

    if (errors.length > 0) {
      setError(errors[0]);
    } else {
      setError("");
    }

    return prepared;
  };
  // ─── Client-side signal extraction ────────────────────────────────
  const extractSignals = async (file: File): Promise<any> => {
    const signals: any = {
      fileName: file.name,
      fileSize: file.size,
      fileSizeMB: (file.size / (1024 * 1024)).toFixed(2),
      mimeType: file.type,
      isImage: file.type.startsWith("image/"),
      isVideo: file.type.startsWith("video/"),
      isText: isTextFile(file),
    };

    if (file.type.startsWith("image/")) {
      try {
        const bitmap = await createImageBitmap(file);
        signals.width = bitmap.width;
        signals.height = bitmap.height;
        signals.aspectRatio = (bitmap.width / bitmap.height).toFixed(2);
        signals.megapixels = ((bitmap.width * bitmap.height) / 1000000).toFixed(
          1,
        );

        // Resolution quality
        const mp = (bitmap.width * bitmap.height) / 1000000;
        signals.resolutionLabel =
          mp >= 8
            ? "Very High"
            : mp >= 4
              ? "High"
              : mp >= 2
                ? "Good"
                : mp >= 1
                  ? "Moderate"
                  : "Low";

        // Orientation
        signals.orientation =
          bitmap.width > bitmap.height
            ? "landscape"
            : bitmap.height > bitmap.width
              ? "portrait"
              : "square";

        // Basic color analysis via canvas sampling
        const canvas = document.createElement("canvas");
        const sampleSize = 64;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
          const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
          const data = imageData.data;

          let totalR = 0,
            totalG = 0,
            totalB = 0;
          let totalBrightness = 0;
          let darkPixels = 0,
            lightPixels = 0;
          let saturationSum = 0;
          const pixelCount = data.length / 4;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i],
              g = data[i + 1],
              b = data[i + 2];
            totalR += r;
            totalG += g;
            totalB += b;

            const brightness = r * 0.299 + g * 0.587 + b * 0.114;
            totalBrightness += brightness;
            if (brightness < 60) darkPixels++;
            if (brightness > 200) lightPixels++;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const sat = max === 0 ? 0 : (max - min) / max;
            saturationSum += sat;
          }

          const avgBrightness = totalBrightness / pixelCount;
          const avgSaturation = saturationSum / pixelCount;
          const darkRatio = darkPixels / pixelCount;
          const lightRatio = lightPixels / pixelCount;

          signals.avgBrightness = Math.round(avgBrightness);
          signals.avgSaturation = (avgSaturation * 100).toFixed(0);
          signals.dominantChannel =
            totalR >= totalG && totalR >= totalB
              ? "red"
              : totalG >= totalR && totalG >= totalB
                ? "green"
                : "blue";

          // Lighting mood
          signals.lightingMood =
            avgBrightness > 180
              ? "bright/high-key"
              : avgBrightness > 120
                ? "balanced"
                : avgBrightness > 70
                  ? "moody/low-key"
                  : "dark/noir";

          // Color mood
          signals.colorMood =
            avgSaturation > 0.6
              ? "vivid/saturated"
              : avgSaturation > 0.3
                ? "natural"
                : avgSaturation > 0.1
                  ? "muted/desaturated"
                  : "monochrome";

          // Contrast estimate
          signals.contrastLevel =
            darkRatio > 0.3 && lightRatio > 0.2
              ? "high contrast"
              : darkRatio > 0.5
                ? "low-key dominant"
                : lightRatio > 0.5
                  ? "high-key dominant"
                  : "balanced contrast";
        }

        bitmap.close();
      } catch (e) {
        console.error("Signal extraction error:", e);
      }
    }

    if (file.type.startsWith("video/")) {
      signals.format = file.name.split(".").pop()?.toLowerCase();
      // Video duration extraction
      try {
        const url = URL.createObjectURL(file);
        const duration = await new Promise<number>((resolve) => {
          const video = document.createElement("video");
          video.preload = "metadata";
          video.onloadedmetadata = () => {
            resolve(video.duration);
            URL.revokeObjectURL(url);
          };
          video.onerror = () => {
            resolve(0);
            URL.revokeObjectURL(url);
          };
          video.src = url;
        });
        signals.durationSeconds = Math.round(duration);
        signals.durationLabel =
          duration > 60
            ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`
            : `${Math.round(duration)}s`;
      } catch (e) {
        console.error("Video metadata error:", e);
      }
    }

    if (isTextFile(file)) {
      try {
        const text = await file.text();
        const words = text.split(/\s+/).filter(Boolean);
        signals.wordCount = words.length;
        signals.characterCount = text.length;
        signals.paragraphCount = (text.match(/\n\s*\n/g) || []).length + 1;
        signals.hasSections =
          /^#+\s/m.test(text) || /^[A-Z][A-Z\s]{3,}$/m.test(text);
        signals.lineCount = text.split("\n").length;
        // Estimate reading time (average 250 words/min)
        signals.readingTimeMinutes = Math.ceil(words.length / 250);
      } catch (e) {
        console.error("Text signal extraction error:", e);
      }
    }

    return signals;
  };
  // ─── Local content description (no AI) ────────────────────────────
  const buildLocalDescription = (signals: any[]): string => {
    if (!signals || signals.length === 0) return "";

    const sentences: string[] = [];

    // How many files
    const imageCount = signals.filter((s) => s.isImage).length;
    const videoCount = signals.filter((s) => s.isVideo).length;
    const textCount = signals.filter((s) => s.isText).length;
    if (imageCount > 0 && videoCount > 0) {
      sentences.push(
        `The upload contains ${imageCount} image${imageCount > 1 ? "s" : ""} and ${videoCount} video${videoCount > 1 ? "s" : ""}.`,
      );
    } else if (imageCount > 1) {
      sentences.push(`The upload contains ${imageCount} images.`);
    } else if (videoCount > 1) {
      sentences.push(`The upload contains ${videoCount} videos.`);
    } else if (textCount > 1) {
      sentences.push(`The upload contains ${textCount} text documents.`);
    }

    // Use first signal for primary description
    const primary = signals[0];

    if (primary.isImage) {
      // Subject sentence
      const resPart =
        primary.resolutionLabel === "Very High" ||
        primary.resolutionLabel === "High"
          ? "a high-resolution"
          : primary.resolutionLabel === "Good"
            ? "a decent-resolution"
            : "a lower-resolution";
      const orientPart = primary.orientation || "landscape";
      sentences.push(
        `The content appears to be ${resPart} ${orientPart} image at ${primary.width}×${primary.height} pixels.`,
      );

      // Style sentence from lighting + color
      if (primary.lightingMood && primary.colorMood) {
        const lightDesc =
          primary.lightingMood === "bright/high-key"
            ? "bright, well-lit"
            : primary.lightingMood === "balanced"
              ? "evenly lit"
              : primary.lightingMood === "moody/low-key"
                ? "moody with subdued lighting"
                : "dark with noir-like shadows";
        const colorDesc =
          primary.colorMood === "vivid/saturated"
            ? "vivid, saturated colors"
            : primary.colorMood === "natural"
              ? "natural color tones"
              : primary.colorMood === "muted/desaturated"
                ? "muted, desaturated tones"
                : "near-monochrome palette";
        sentences.push(`The visual style is ${lightDesc} with ${colorDesc}.`);
      }

      // Composition sentence
      if (primary.contrastLevel) {
        const contrastDesc =
          primary.contrastLevel === "high contrast"
            ? "strong contrast between light and dark areas"
            : primary.contrastLevel === "low-key dominant"
              ? "predominantly dark tones throughout"
              : primary.contrastLevel === "high-key dominant"
                ? "predominantly bright tones throughout"
                : "a balanced tonal range";
        sentences.push(`The composition shows ${contrastDesc}.`);
      }
    }

    if (primary.isVideo) {
      const sizePart = primary.fileSizeMB ? ` (${primary.fileSizeMB}MB)` : "";
      const durPart = primary.durationLabel
        ? `approximately ${primary.durationLabel} long`
        : "of unknown duration";
      const fmtPart = primary.format ? ` ${primary.format.toUpperCase()}` : "";
      sentences.push(
        `The content is a${fmtPart} video file${sizePart}, ${durPart}.`,
      );
    }

    if (primary.isText) {
      const ext = primary.fileName?.split(".").pop()?.toUpperCase() || "TXT";
      const sizePart = primary.fileSizeMB ? ` (${primary.fileSizeMB}MB)` : "";
      sentences.push(
        `The content is a ${ext} text file${sizePart} with ${primary.wordCount || "unknown"} words.`,
      );
      if (primary.readingTimeMinutes) {
        sentences.push(
          `Estimated reading time: ${primary.readingTimeMinutes} minute${primary.readingTimeMinutes > 1 ? "s" : ""}.`,
        );
      }
      if (primary.hasSections) {
        sentences.push("The document contains section headings.");
      }
    }

    // Multi-file note
    if (signals.length > 1) {
      const sizes = signals
        .filter((s) => s.fileSizeMB)
        .map((s) => parseFloat(s.fileSizeMB));
      if (sizes.length > 1) {
        const totalMB = sizes.reduce((a, b) => a + b, 0).toFixed(1);
        sentences.push(
          `Total upload size is approximately ${totalMB}MB across ${signals.length} files.`,
        );
      }
    }

    return sentences.join(" ");
  };
  // ─── Silent audio unlock (browser requirement) ────────────────────
  const unlockAudio = () => {
    if (audioUnlocked.current) return;
    audioUnlocked.current = true;
    try {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      // Speak empty string to unlock the audio context
      const silence = new SpeechSynthesisUtterance("");
      silence.volume = 0;
      window.speechSynthesis.speak(silence);
      // Keep-alive: cancel and re-speak silence every 10s to prevent browser timeout
      const keepAlive = setInterval(() => {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          clearInterval(keepAlive);
          return;
        }
        const ping = new SpeechSynthesisUtterance("");
        ping.volume = 0;
        window.speechSynthesis.speak(ping);
      }, 10000);
      // Clean up after 2 minutes (user should have interacted by then)
      setTimeout(() => clearInterval(keepAlive), 120000);
    } catch (e) {
      console.error("Audio unlock failed:", e);
    }
  };
  const speakText = async (
    text: string,
    options?: { onResponse?: () => void },
  ) => {
    if (isMuted) return;
    try {
      // Cancel any current speech/fetch immediately before starting a new one.
      currentTTSAbortRef.current?.abort();
      currentTTSAbortRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      isSpeakingRef.current = false;

      // Use API TTS for all messages to keep the same ElevenLabs voice.
      const abortController = new AbortController();
      currentTTSAbortRef.current = abortController;
      const response = await fetch("/api/decision-layer/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          userId: (await supabase.auth.getUser()).data.user?.id || "anonymous",
        }),
        signal: abortController.signal,
      });
      options?.onResponse?.();

      if (!response.ok) {
        let details: unknown = null;
        try {
          details = await response.json();
        } catch {
          details = await response.text();
        }
        console.error("Decision-layer TTS API failed:", details);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      isSpeakingRef.current = true;

      await new Promise<void>((resolve) => {
        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
          if (audioRef.current === audio) audioRef.current = null;
          if (currentTTSAbortRef.current === abortController) {
            currentTTSAbortRef.current = null;
          }
          isSpeakingRef.current = false;
          resolve();
        };

        audio.onended = cleanup;
        audio.onerror = cleanup;
        audio.onpause = () => {
          // Pause due to manual stop should resolve and allow next request.
          if (audio.currentTime < audio.duration) cleanup();
        };

        audio.play().catch(cleanup);
      });
    } catch (error) {
      options?.onResponse?.();
      if ((error as Error)?.name === "AbortError") return;
      isSpeakingRef.current = false;
      console.error("TTS error:", error);
    }
  };
  // Speak initial greeting once on entry. No repeats.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname !== "/decision-layer") return;
    const shouldTriggerWelcome =
      sessionStorage.getItem(DECISION_LAYER_WELCOME_TRIGGER_KEY) === "1";
    shouldPlayWelcomeFromClickRef.current = shouldTriggerWelcome;
    shouldLaunchTourFromTriggerRef.current = shouldTriggerWelcome;
    sessionStorage.removeItem(DECISION_LAYER_WELCOME_TRIGGER_KEY);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname !== "/decision-layer") return;
    if (!shouldLaunchTourFromTriggerRef.current || showTour || !tourEnabled)
      return;
    if (!showButtons || buttons.length === 0 || agentMessages.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      shouldLaunchTourFromTriggerRef.current = false;
      setShowTour(true);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    agentMessages.length,
    buttons.length,
    pathname,
    showButtons,
    showTour,
    tourEnabled,
  ]);

  useEffect(() => {
    const shouldSpeakInitialGreeting =
      shouldPlayWelcomeFromClickRef.current &&
      !hasSpokenInitialGreetingRef.current &&
      conversationPhase === "greeting" &&
      showButtons &&
      agentMessages.length > 0 &&
      !isMuted &&
      !isAgentTyping;

    if (!shouldSpeakInitialGreeting) return;

    const firstMessage = agentMessages[0]?.content;
    if (firstMessage !== "__GREETING_3__") return;

    hasSpokenInitialGreetingRef.current = true;
    const greetingNarration =
      "Welcome to the Decision Layer — the part of KAIZORA that thinks with you. Most creators have more content than they know what to do with. The problem isn't talent — it's knowing what's ready, what needs work, and what to charge. That's what I do. I'll analyze your work across creative clarity, technical quality, consistency, audience fit, differentiation, and packaging readiness — then tell you exactly where you stand and what to do next. No fluff. No generic advice. Everything tailored to your goals, your audience, and your blockers. Let's start — what are you stuck on right now?";
    void speakText(greetingNarration);
  }, [agentMessages, conversationPhase, isAgentTyping, isMuted, showButtons]);
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleDragMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current) return;
      const container = document.getElementById("split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const percentage = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      // Clamp between 30% and 70%
      setLeftWidth(Math.min(70, Math.max(30, percentage)));
    };

    const handleDragEnd = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
    };

    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
  };
  return (
    <>
      <CreditGate />
      <style jsx global>{`
        @keyframes arrowPulse {
          0%,
          100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(4px);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes glowPulse {
          0%,
          100% {
            box-shadow:
              0 0 4px rgba(239, 68, 68, 0.3),
              0 0 8px rgba(239, 68, 68, 0.1);
            border-color: rgba(239, 68, 68, 0.5);
          }
          50% {
            box-shadow:
              0 0 8px rgba(239, 68, 68, 0.6),
              0 0 16px rgba(239, 68, 68, 0.3);
            border-color: rgba(239, 68, 68, 1);
          }
        }
        @media (max-width: 767px) {
          #split-container {
            flex-direction: column !important;
          }
          #split-container > div[style] {
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
          }
          #split-resize-handle {
            display: none !important;
          }
        }
        .driver-popover {
          background: #09090b !important;
          border: 1px solid #27272a !important;
          color: #fff !important;
          border-radius: 0 !important;
        }
        .driver-popover-title {
          color: #ef4444 !important;
          font-size: 13px !important;
        }
        .driver-popover-description {
          color: #a1a1aa !important;
          font-size: 12px !important;
        }
        .driver-popover-next-btn,
        .driver-popover-prev-btn,
        .driver-popover-done-btn {
          background: #dc2626 !important;
          border: none !important;
          border-radius: 0 !important;
          color: #fff !important;
          font-size: 11px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
        }
        .driver-popover-prev-btn {
          background: #27272a !important;
        }
        .driver-popover-arrow-side-left::after,
        .driver-popover-arrow-side-right::after,
        .driver-popover-arrow-side-top::after,
        .driver-popover-arrow-side-bottom::after {
          border-color: #ef4444 transparent transparent transparent !important;
        }
        .driver-popover-arrow {
          border-color: #ef4444 !important;
        }
        .panel-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .panel-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .panel-scroll::-webkit-scrollbar-thumb {
          background: #3f3f46;
          border-radius: 3px;
        }
        .panel-scroll::-webkit-scrollbar-thumb:hover {
          background: #52525b;
        }
      `}</style>
      <div className="h-screen overflow-hidden bg-white text-black">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 max-w-md flex items-start gap-2 px-4 py-3 border backdrop-blur-md ${
              toast.type === "success"
                ? "bg-green-500/10 border-green-500/50 text-green-400"
                : "bg-red-500/10 border-red-500/50 text-red-300"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="text-xs leading-relaxed break-words">
              {toast.message}
            </span>
          </div>
        )}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-linear-to-b from-zinc-950 via-black to-black" />
        </div>
        <div className="relative z-10 w-full px-3 md:px-6 py-2 md:py-4">
          <div
            id="split-container"
            className="flex items-start"
            style={{ gap: 0 }}
          >
            {/* ═══════════════════════════════════════════════════════ */}
            {/* LEFT COLUMN: Agent Conversation */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div
              id="agent-chat-panel"
              className="border border-zinc-800 h-[60vh] md:h-[calc(100vh-140px)] flex flex-col bg-black"
              style={{ width: `${leftWidth}%`, flexShrink: 0 }}
            >
              {/* Chat Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-extralight text-white tracking-tight">
                  Your Creative Partner
                  <span className="ml-2 text-xs text-red-500 border border-red-500 px-2 py-0.5 animate-[glowPulse_2s_ease-in-out_infinite]">
                    AI AGENT
                  </span>
                </h3>
              </div>
              {/* Messages */}
              <div
                data-lenis-prevent
                className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 panel-scroll"
              >
                {agentMessages.map((msg, i) => {
                  // ═══ Render evaluation results inline after the summary message ═══
                  const showEvalAfterThis =
                    evaluation && i === evaluationMessageIndex;

                  if (
                    msg.content === "__GREETING_1__" ||
                    msg.content === "__GREETING_2__" ||
                    msg.content === "__GREETING_3__"
                  ) {
                    return (
                      <div key={i} className="bg-zinc-900/50 p-6 space-y-4">
                        {msg.content === "__GREETING_1__" && (
                          <>
                            <p className="text-white text-sm leading-relaxed">
                              <Lightning
                                size={14}
                                weight="fill"
                                className="text-red-500 inline mr-1.5 -mt-0.5"
                              />
                              Welcome, I'm your creative partner in KAIZORA.
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              I'll help you decide{" "}
                              <span className="text-red-500 font-medium italic">
                                what deserves more time
                              </span>
                              ,{" "}
                              <span className="text-red-500 font-medium italic">
                                what can monetize
                              </span>
                              , and{" "}
                              <span className="text-red-500 font-medium italic">
                                what is best left as exploration
                              </span>{" "}
                              — without wasting your energy.
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              Before you upload anything, I want to understand
                              your situation so I can guide you properly.
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              I'll look at your content across six dimensions —{" "}
                              <span className="text-white font-medium">
                                creative clarity
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                technical quality
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                consistency
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                audience fit
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                differentiation
                              </span>
                              , and{" "}
                              <span className="text-white font-medium">
                                packaging readiness
                              </span>{" "}
                              — then give you an honest verdict, a coaching
                              roadmap, and pricing guidance.
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              No hype. No pressure. Just a{" "}
                              <span className="text-red-500 font-medium">
                                clear-eyed second opinion
                              </span>{" "}
                              from someone who wants your work to land where it
                              deserves.
                            </p>
                          </>
                        )}
                        {msg.content === "__GREETING_2__" && (
                          <>
                            <p className="text-white text-sm leading-relaxed">
                              <Lightning
                                size={14}
                                weight="fill"
                                className="text-red-500 inline mr-1.5 -mt-0.5"
                              />
                              Hey — glad you're here. I'm the creative layer
                              behind KAIZORA.
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              Think of me as{" "}
                              <span className="text-red-500 font-medium italic">
                                a brutally honest friend
                              </span>{" "}
                              who also happens to understand{" "}
                              <span className="text-red-500 font-medium italic">
                                pricing
                              </span>
                              ,{" "}
                              <span className="text-red-500 font-medium italic">
                                packaging
                              </span>
                              , and{" "}
                              <span className="text-red-500 font-medium italic">
                                what actually sells
                              </span>
                              .
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              I won't tell you everything is great when it
                              isn't. I also won't tear your work apart without
                              showing you{" "}
                              <span className="text-white font-medium">
                                exactly how to improve it
                              </span>
                              .
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              I evaluate across six axes —{" "}
                              <span className="text-white font-medium">
                                clarity
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                quality
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                consistency
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                audience fit
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                uniqueness
                              </span>
                              , and{" "}
                              <span className="text-white font-medium">
                                packaging
                              </span>{" "}
                              — then build you a roadmap with{" "}
                              <span className="text-red-500 font-medium">
                                real pricing
                              </span>{" "}
                              and{" "}
                              <span className="text-red-500 font-medium">
                                next steps
                              </span>
                              .
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              But first, I need to understand{" "}
                              <span className="text-white font-medium">
                                where you're at
                              </span>{" "}
                              and{" "}
                              <span className="text-white font-medium">
                                what's blocking you
                              </span>
                              .
                            </p>
                          </>
                        )}
                        {msg.content === "__GREETING_3__" && (
                          <>
                            <p className="text-white text-sm leading-relaxed">
                              <Lightning
                                size={14}
                                weight="fill"
                                className="text-red-500 inline mr-1.5 -mt-0.5"
                              />
                              Welcome to the Decision Layer — the part of
                              KAIZORA that thinks with you.
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              Most creators have{" "}
                              <span className="text-red-500 font-medium italic">
                                more content than they know what to do with
                              </span>
                              . The problem isn't talent — it's knowing{" "}
                              <span className="text-red-500 font-medium italic">
                                what's ready
                              </span>
                              ,{" "}
                              <span className="text-red-500 font-medium italic">
                                what needs work
                              </span>
                              , and{" "}
                              <span className="text-red-500 font-medium italic">
                                what to charge
                              </span>
                              .
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              That's what I do. I'll analyze your work across{" "}
                              <span className="text-white font-medium">
                                creative clarity
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                technical quality
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                consistency
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                audience fit
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                differentiation
                              </span>
                              , and{" "}
                              <span className="text-white font-medium">
                                packaging readiness
                              </span>{" "}
                              — then tell you{" "}
                              <span className="text-red-500 font-medium">
                                exactly where you stand
                              </span>{" "}
                              and what to do next.
                            </p>
                            <p className="text-zinc-300 text-sm leading-relaxed">
                              No fluff. No generic advice. Everything tailored
                              to{" "}
                              <span className="text-white font-medium">
                                your goals
                              </span>
                              ,{" "}
                              <span className="text-white font-medium">
                                your audience
                              </span>
                              , and{" "}
                              <span className="text-white font-medium">
                                your blockers
                              </span>
                              .
                            </p>
                          </>
                        )}
                        <div className="w-full h-px bg-zinc-800 my-1" />
                        <p className="text-white text-sm leading-relaxed">
                          Let's start — what are you stuck on right now?
                        </p>
                      </div>
                    );
                  }
                  if (msg.content === "__RETURN_GREETING__") {
                    return (
                      <div
                        key={i}
                        className="bg-zinc-900/50 p-4 md:p-8 space-y-5"
                      >
                        <div className="space-y-1">
                          <p className="text-white text-xl md:text-2xl font-light tracking-tight">
                            <Lightning
                              size={16}
                              weight="fill"
                              className="text-red-500 inline mr-1.5 -mt-1"
                            />
                            Welcome back.
                          </p>
                          <p className="text-red-500 text-sm font-medium">
                            Fresh start. Let's make it count.
                          </p>
                        </div>

                        <p className="text-zinc-300 text-base md:text-lg font-light leading-relaxed">
                          Whatever you're working on next — a new piece of
                          content, a product, an idea you've been sitting on —
                          bring it here. I'll help you figure out if it's worth
                          pushing, how to price it, where to sell it, and what's
                          actually holding you back.
                        </p>
                        <p className="text-zinc-500 text-sm font-light">
                          What are you working on today?
                        </p>
                      </div>
                    );
                  }
                  // ─── Regular Messages ───────────────────────────
                  return (
                    <div key={i}>
                      <div
                        className={`${msg.role === "agent" ? "bg-zinc-900/50 text-white" : "bg-zinc-800 text-white ml-12"} p-4 text-sm leading-relaxed whitespace-pre-wrap`}
                      >
                        {msg.role === "agent" && (
                          <Lightning
                            size={14}
                            weight="fill"
                            className="text-red-500 inline mr-1.5 -mt-0.5"
                          />
                        )}
                        {formatMessageWithLinks(msg.content)}
                      </div>
                      {showEvalAfterThis && (
                        <div className="space-y-4 mt-4">
                          {/* Verdict Banner */}
                          <div
                            className={`border-l-4 p-5 ${
                              evaluation.decision === "yes"
                                ? "border-green-500 bg-green-950/10"
                                : evaluation.decision === "not-yet"
                                  ? "border-yellow-500 bg-yellow-950/10"
                                  : "border-red-500 bg-red-950/10"
                            }`}
                          >
                            <p
                              className={`text-sm font-medium mb-2 ${
                                evaluation.decision === "yes"
                                  ? "text-green-400"
                                  : evaluation.decision === "not-yet"
                                    ? "text-yellow-400"
                                    : "text-red-400"
                              }`}
                            >
                              {evaluation.title}
                            </p>
                            <p className="text-zinc-400 text-xs leading-relaxed">
                              {evaluation.honestAssessment}
                            </p>
                            {evaluation.evidenceUsed && (
                              <p className="text-zinc-600 text-[10px] mt-2 italic">
                                {Array.isArray(evaluation.evidenceUsed)
                                  ? evaluation.evidenceUsed.join(" · ")
                                  : evaluation.evidenceUsed}
                              </p>
                            )}
                            {(analysisApiInfo || analysisElapsedMs > 0) && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {analysisApiInfo && (
                                  <>
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 border border-zinc-700 px-2 py-1">
                                      API {analysisApiInfo.provider}
                                    </span>
                                    {analysisApiInfo.models.length > 0 && (
                                      <span className="text-[10px] text-zinc-500 border border-zinc-800 px-2 py-1">
                                        {analysisApiInfo.models.join(" + ")}
                                      </span>
                                    )}
                                    {analysisApiInfo.keys.map((key) => (
                                      <span
                                        key={key.label}
                                        className="text-[10px] text-zinc-500 border border-zinc-800 px-2 py-1"
                                      >
                                        {key.label}: {key.masked}
                                      </span>
                                    ))}
                                  </>
                                )}
                                {analysisElapsedMs > 0 && (
                                  <span className="text-[10px] text-zinc-400 border border-zinc-700 px-2 py-1">
                                    Eval time{" "}
                                    {formatAnalysisDuration(analysisElapsedMs)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {/* What I Heard (Audio) */}
                          {evaluation.whatIHeard && (
                            <div className="border border-zinc-800 p-5">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm">🔊</span>
                                <p className="text-xs text-zinc-600 uppercase tracking-wider">
                                  What I Heard
                                </p>
                              </div>
                              <div className="space-y-2">
                                {evaluation.whatIHeard.instruments && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Instruments
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatIHeard.instruments}
                                    </p>
                                  </div>
                                )}
                                {evaluation.whatIHeard.rhythm && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Rhythm
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatIHeard.rhythm}
                                    </p>
                                  </div>
                                )}
                                {evaluation.whatIHeard.tonality && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Tonality
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatIHeard.tonality}
                                    </p>
                                  </div>
                                )}
                                {evaluation.whatIHeard.production && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Production
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatIHeard.production}
                                    </p>
                                  </div>
                                )}
                                {evaluation.whatIHeard.mood && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Mood
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatIHeard.mood}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Audio Intelligence */}
                          {evaluation.audioIntelligence && (
                            <div className="border border-zinc-800 p-5">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm">🎵</span>
                                <p className="text-xs text-zinc-600 uppercase tracking-wider">
                                  Audio Intelligence
                                </p>
                              </div>

                              {/* BPM + Key + Vocal */}
                              <div className="grid grid-cols-3 gap-3 mb-4">
                                {evaluation.audioIntelligence.bpm > 0 && (
                                  <div className="bg-zinc-900/50 p-2 text-center">
                                    <p className="text-zinc-600 text-[9px] uppercase">
                                      BPM
                                    </p>
                                    <p className="text-white text-lg font-medium">
                                      {evaluation.audioIntelligence.bpm}
                                    </p>
                                  </div>
                                )}
                                {evaluation.audioIntelligence.key &&
                                  evaluation.audioIntelligence.key !==
                                    "unknown" && (
                                    <div className="bg-zinc-900/50 p-2 text-center">
                                      <p className="text-zinc-600 text-[9px] uppercase">
                                        Key
                                      </p>
                                      <p className="text-white text-lg font-medium">
                                        {evaluation.audioIntelligence.key}
                                      </p>
                                    </div>
                                  )}
                                <div className="bg-zinc-900/50 p-2 text-center">
                                  <p className="text-zinc-600 text-[9px] uppercase">
                                    Type
                                  </p>
                                  <p className="text-white text-sm font-medium">
                                    {evaluation.audioIntelligence.isVocal
                                      ? "Vocal"
                                      : "Instrumental"}
                                  </p>
                                </div>
                              </div>

                              {/* Genres */}
                              {evaluation.audioIntelligence.genres &&
                                evaluation.audioIntelligence.genres.length >
                                  0 && (
                                  <div className="mb-3">
                                    <p className="text-zinc-500 text-[10px] uppercase mb-2">
                                      Detected Genres
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {evaluation.audioIntelligence.genres.map(
                                        (g, idx) => (
                                          <span
                                            key={idx}
                                            className="text-[10px] text-zinc-300 bg-zinc-800 border border-zinc-700 px-2 py-1"
                                          >
                                            {g.genre}{" "}
                                            <span className="text-zinc-600">
                                              {g.confidence}%
                                            </span>
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}

                              {/* Moods */}
                              {evaluation.audioIntelligence.moods &&
                                evaluation.audioIntelligence.moods.length >
                                  0 && (
                                  <div className="mb-3">
                                    <p className="text-zinc-500 text-[10px] uppercase mb-2">
                                      Detected Moods
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {evaluation.audioIntelligence.moods.map(
                                        (m, idx) => (
                                          <span
                                            key={idx}
                                            className={`text-[10px] px-2 py-1 border ${
                                              m.confidence >= 50
                                                ? "text-green-400 bg-green-950/20 border-green-500/20"
                                                : m.confidence >= 25
                                                  ? "text-yellow-400 bg-yellow-950/20 border-yellow-500/20"
                                                  : "text-zinc-400 bg-zinc-900 border-zinc-700"
                                            }`}
                                          >
                                            {m.mood}{" "}
                                            <span className="opacity-60">
                                              {m.confidence}%
                                            </span>
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}

                              {/* Instruments */}
                              {evaluation.audioIntelligence.instruments &&
                                evaluation.audioIntelligence.instruments
                                  .length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-zinc-500 text-[10px] uppercase mb-2">
                                      Instruments Detected
                                    </p>
                                    <p className="text-zinc-300 text-xs">
                                      {evaluation.audioIntelligence.instruments.join(
                                        ", ",
                                      )}
                                    </p>
                                  </div>
                                )}

                              {/* Danceability / Engagement / Approachability bars */}
                              <div className="space-y-2 mb-3">
                                {[
                                  {
                                    label: "Danceability",
                                    value:
                                      evaluation.audioIntelligence.danceability,
                                  },
                                  {
                                    label: "Engagement",
                                    value:
                                      evaluation.audioIntelligence.engagement,
                                  },
                                  {
                                    label: "Approachability",
                                    value:
                                      evaluation.audioIntelligence
                                        .approachability,
                                  },
                                ].map(
                                  (item, idx) =>
                                    item.value > 0 && (
                                      <div
                                        key={idx}
                                        className="flex items-center gap-2"
                                      >
                                        <p className="text-zinc-500 text-[10px] w-24">
                                          {item.label}
                                        </p>
                                        <div className="flex-1 h-1.5 bg-zinc-900 rounded-full">
                                          <div
                                            className={`h-full rounded-full ${item.value >= 0.7 ? "bg-green-500" : item.value >= 0.4 ? "bg-yellow-500" : "bg-red-500"}`}
                                            style={{
                                              width: `${item.value * 100}%`,
                                            }}
                                          />
                                        </div>
                                        <p className="text-zinc-400 text-[10px] w-8 text-right">
                                          {Math.round(item.value * 100)}%
                                        </p>
                                      </div>
                                    ),
                                )}
                              </div>

                              {/* Structure sections */}
                              {evaluation.audioIntelligence.structure &&
                                evaluation.audioIntelligence.structure.length >
                                  0 && (
                                  <div className="mb-3">
                                    <p className="text-zinc-500 text-[10px] uppercase mb-2">
                                      Song Structure
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {evaluation.audioIntelligence.structure.map(
                                        (s, idx) => (
                                          <span
                                            key={idx}
                                            className="text-[9px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5"
                                          >
                                            {s.section} (
                                            {s.startTime.toFixed(0)}s-
                                            {s.endTime.toFixed(0)}s)
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}

                              {/* Transcript */}
                              {evaluation.audioIntelligence.hasSpeech &&
                                evaluation.audioIntelligence.transcript && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase mb-2">
                                      Speech Transcript
                                    </p>
                                    <p className="text-zinc-400 text-xs leading-relaxed italic">
                                      "
                                      {evaluation.audioIntelligence.transcript.slice(
                                        0,
                                        300,
                                      )}
                                      {evaluation.audioIntelligence.transcript
                                        .length > 300
                                        ? "..."
                                        : ""}
                                      "
                                    </p>
                                  </div>
                                )}
                            </div>
                          )}
                          {/* What I Actually See */}
                          {evaluation.whatISaw && (
                            <div className="border border-zinc-800 p-5">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm">👁️</span>
                                <p className="text-xs text-zinc-600 uppercase tracking-wider">
                                  What I Actually See
                                </p>
                              </div>
                              <div className="space-y-2">
                                {evaluation.whatISaw.subjects && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Subjects
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatISaw.subjects}
                                    </p>
                                  </div>
                                )}
                                {evaluation.whatISaw.lighting && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Lighting
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatISaw.lighting}
                                    </p>
                                  </div>
                                )}
                                {evaluation.whatISaw.color && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Color
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatISaw.color}
                                    </p>
                                  </div>
                                )}
                                {evaluation.whatISaw.composition && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Composition
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatISaw.composition}
                                    </p>
                                  </div>
                                )}
                                {evaluation.whatISaw.mood && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase">
                                      Mood
                                    </p>
                                    <p className="text-zinc-300 text-xs leading-relaxed">
                                      {evaluation.whatISaw.mood}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* What You Told Me */}
                          {evaluation.whatYouToldMe && (
                            <div className="border border-zinc-800/50 bg-zinc-900/20 p-4">
                              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">
                                What You Told Me
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-zinc-600 text-[10px]">
                                    Goal
                                  </p>
                                  <p className="text-zinc-400 text-xs">
                                    {evaluation.whatYouToldMe.goal}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-600 text-[10px]">
                                    Pain
                                  </p>
                                  <p className="text-zinc-400 text-xs">
                                    {evaluation.whatYouToldMe.pain}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-600 text-[10px]">
                                    Constraints
                                  </p>
                                  <p className="text-zinc-400 text-xs">
                                    {evaluation.whatYouToldMe.constraints}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-600 text-[10px]">
                                    Buyer Type
                                  </p>
                                  <p className="text-zinc-400 text-xs">
                                    {evaluation.whatYouToldMe.buyerType}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Real Alignment */}
                          {evaluation.realAlignment && (
                            <div className="border border-zinc-800 p-5">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs text-zinc-600 uppercase tracking-wider">
                                  Real Alignment
                                </p>
                                <span
                                  className={`text-lg font-medium px-2 py-0.5 ${
                                    evaluation.realAlignment.score >= 80
                                      ? "text-green-400 bg-green-950/30"
                                      : evaluation.realAlignment.score >= 50
                                        ? "text-yellow-400 bg-yellow-950/30"
                                        : "text-red-400 bg-red-950/30"
                                  }`}
                                >
                                  {evaluation.realAlignment.score}%
                                </span>
                              </div>
                              <p className="text-zinc-400 text-xs leading-relaxed mb-3">
                                {evaluation.realAlignment.gapSummary}
                              </p>
                              {evaluation.realAlignment.blindSpots &&
                                evaluation.realAlignment.blindSpots.length >
                                  0 && (
                                  <div>
                                    <p className="text-zinc-500 text-[10px] uppercase mb-2">
                                      Blind Spots
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {evaluation.realAlignment.blindSpots.map(
                                        (spot, idx) => (
                                          <span
                                            key={idx}
                                            className="text-[10px] text-yellow-400/80 bg-yellow-950/20 border border-yellow-500/20 px-2 py-1"
                                          >
                                            {spot}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}

                          {/* My Recommendation */}
                          {evaluation.myRecommendation && (
                            <div
                              className={`border-l-4 p-5 ${
                                evaluation.myRecommendation.verdict === "Ready"
                                  ? "border-green-500 bg-green-950/10"
                                  : evaluation.myRecommendation.verdict ===
                                      "Refine"
                                    ? "border-yellow-500 bg-yellow-950/10"
                                    : evaluation.myRecommendation.verdict ===
                                        "Explore"
                                      ? "border-blue-500 bg-blue-950/10"
                                      : "border-red-500 bg-red-950/10"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span
                                  className={`text-xs font-medium px-2 py-0.5 uppercase tracking-wider ${
                                    evaluation.myRecommendation.verdict ===
                                    "Ready"
                                      ? "text-green-400 bg-green-950/30"
                                      : evaluation.myRecommendation.verdict ===
                                          "Refine"
                                        ? "text-yellow-400 bg-yellow-950/30"
                                        : evaluation.myRecommendation
                                              .verdict === "Explore"
                                          ? "text-blue-400 bg-blue-950/30"
                                          : "text-red-400 bg-red-950/30"
                                  }`}
                                >
                                  {evaluation.myRecommendation.verdict}
                                </span>
                              </div>
                              <p className="text-zinc-400 text-xs leading-relaxed">
                                {evaluation.myRecommendation.reasoning}
                              </p>
                            </div>
                          )}
                          {/* Pain Point */}
                          {evaluation.topPainPoint && (
                            <div className="border border-red-500/20 bg-red-950/10 p-4">
                              <p className="text-red-400 text-xs font-medium mb-1">
                                🎯 Your #1 Blocker
                              </p>
                              <p className="text-zinc-400 text-xs leading-relaxed">
                                {evaluation.topPainPoint}
                              </p>
                            </div>
                          )}

                          {/* 6-Axis Radar */}
                          {evaluation.readinessScores &&
                            evaluation.readinessScores.length > 0 && (
                              <div className="border border-zinc-800 p-5">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-xs text-zinc-600 uppercase tracking-wider">
                                    Readiness Radar
                                  </p>
                                  <span
                                    className={`text-xs font-medium px-2 py-0.5 ${
                                      evaluation.overallReadiness >= 80
                                        ? "text-green-400 bg-green-950/30"
                                        : evaluation.overallReadiness >= 60
                                          ? "text-yellow-400 bg-yellow-950/30"
                                          : "text-red-400 bg-red-950/30"
                                    }`}
                                  >
                                    {evaluation.overallReadiness}%
                                  </span>
                                </div>
                                <ReadinessRadar
                                  scores={evaluation.readinessScores}
                                />
                                <div className="mt-4 space-y-2">
                                  {evaluation.readinessScores.map((s, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-3"
                                    >
                                      <div className="w-28">
                                        <p className="text-zinc-500 text-xs truncate">
                                          {s.axis}
                                        </p>
                                        {s.note && (
                                          <p
                                            className="text-zinc-700 text-[10px] truncate"
                                            title={s.note}
                                          >
                                            {s.note}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex-1 h-1 bg-zinc-900">
                                        <div
                                          className={`h-full ${s.score >= 80 ? "bg-green-500" : s.score >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                                          style={{
                                            width: `${s.score}%`,
                                          }}
                                        />
                                      </div>
                                      <p className="text-white text-xs w-6 text-right">
                                        {s.score}%
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                          {/* Content Critique */}
                          {evaluation.contentCritique && (
                            <div className="border border-zinc-800 p-5">
                              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                                Analysis
                              </p>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-green-500 text-xs mb-2">
                                    Strengths
                                  </p>
                                  {evaluation.contentCritique.strengths?.map(
                                    (s, idx) => (
                                      <p
                                        key={idx}
                                        className="text-zinc-400 text-xs mb-1"
                                      >
                                        + {s}
                                      </p>
                                    ),
                                  )}
                                </div>
                                <div>
                                  <p className="text-red-500 text-xs mb-2">
                                    Weaknesses
                                  </p>
                                  {evaluation.contentCritique.weaknesses?.map(
                                    (w, idx) => (
                                      <p
                                        key={idx}
                                        className="text-zinc-600 text-xs mb-1"
                                      >
                                        - {w}
                                      </p>
                                    ),
                                  )}
                                </div>
                                <div>
                                  <p className="text-yellow-500 text-xs mb-2">
                                    Improve
                                  </p>
                                  {evaluation.contentCritique.improvements?.map(
                                    (imp, idx) => (
                                      <p
                                        key={idx}
                                        className="text-zinc-400 text-xs mb-1"
                                      >
                                        → {imp}
                                      </p>
                                    ),
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          {/* Exact Edits */}
                          {evaluation.exactEdits &&
                            evaluation.exactEdits.length > 0 && (
                              <div className="border border-zinc-800 p-5">
                                <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                                  ✏️ Exact Edits
                                </p>
                                <div className="space-y-3">
                                  {evaluation.exactEdits.map((edit, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-start gap-3"
                                    >
                                      <span className="text-red-500 text-xs font-medium mt-0.5">
                                        {idx + 1}
                                      </span>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <p className="text-white text-xs font-medium">
                                            {edit.edit}
                                          </p>
                                          <span
                                            className={`text-[9px] px-1.5 py-0.5 uppercase tracking-wider ${
                                              edit.effort === "Quick"
                                                ? "text-green-400 bg-green-950/30 border border-green-500/20"
                                                : edit.effort === "Medium"
                                                  ? "text-yellow-400 bg-yellow-950/30 border border-yellow-500/20"
                                                  : "text-red-400 bg-red-950/30 border border-red-500/20"
                                            }`}
                                          >
                                            {edit.effort}
                                          </span>
                                        </div>
                                        <p className="text-zinc-500 text-[11px] leading-relaxed">
                                          {edit.why}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          {/* Coaching Roadmap */}
                          {evaluation.coachingRoadmap &&
                            evaluation.coachingRoadmap.length > 0 && (
                              <div className="border border-zinc-800 p-5">
                                <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                                  🧩 Your Creative Roadmap
                                </p>
                                <CoachingRoadmapDisplay
                                  roadmap={evaluation.coachingRoadmap}
                                />
                              </div>
                            )}

                          {/* Tiered Pricing */}
                          {evaluation.pricingGuidance?.tiers &&
                            evaluation.pricingGuidance.tiers.length > 0 && (
                              <div className="border border-zinc-800 p-5">
                                <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                                  💰 Pricing Tiers
                                </p>
                                <PricingTiersDisplay
                                  tiers={evaluation.pricingGuidance.tiers}
                                />
                                {evaluation.pricingGuidance.rationale && (
                                  <p className="text-zinc-500 text-xs leading-relaxed mt-3">
                                    {evaluation.pricingGuidance.rationale}
                                  </p>
                                )}
                              </div>
                            )}
                          {/* Honest Pricing */}
                          {evaluation.honestPricing && (
                            <div className="border border-zinc-800 p-5">
                              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                                💰 Honest Pricing
                              </p>
                              <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-white text-lg font-medium">
                                  {evaluation.honestPricing.currency === "USD"
                                    ? "$"
                                    : evaluation.honestPricing.currency}
                                  {evaluation.honestPricing.low}
                                </span>
                                <span className="text-zinc-600 text-sm">—</span>
                                <span className="text-white text-lg font-medium">
                                  {evaluation.honestPricing.currency === "USD"
                                    ? "$"
                                    : evaluation.honestPricing.currency}
                                  {evaluation.honestPricing.high}
                                </span>
                              </div>
                              <p className="text-zinc-400 text-xs leading-relaxed mb-2">
                                {evaluation.honestPricing.reasoning}
                              </p>
                              <p className="text-zinc-600 text-[10px] italic">
                                Comparable:{" "}
                                {evaluation.honestPricing.comparable}
                              </p>
                            </div>
                          )}

                          {/* Next Steps */}
                          {evaluation.nextSteps &&
                            evaluation.nextSteps.length > 0 && (
                              <div className="border border-zinc-800 p-5">
                                <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                                  Next Steps
                                </p>
                                {evaluation.nextSteps.map((step, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-start gap-2 mb-2"
                                  >
                                    <span className="text-red-500 text-xs mt-0.5">
                                      {idx + 1}
                                    </span>
                                    <p className="text-zinc-400 text-xs leading-relaxed">
                                      {step}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          {/* Fastest Path */}
                          {evaluation.fastestPath &&
                            evaluation.fastestPath.length > 0 && (
                              <div className="border border-zinc-800 p-5">
                                <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                                  ⚡ Fastest Path
                                </p>
                                <div className="space-y-3">
                                  {evaluation.fastestPath.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-start gap-3"
                                    >
                                      <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-red-500 text-[10px] font-medium">
                                          {idx + 1}
                                        </span>
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-zinc-300 text-xs leading-relaxed">
                                          {item.step}
                                        </p>
                                      </div>
                                      <span className="text-zinc-600 text-[10px] whitespace-nowrap bg-zinc-900 px-2 py-0.5">
                                        {item.timeEstimate}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          {/* Real Talk */}
                          {evaluation.realTalk && (
                            <div className="border-l-4 border-zinc-700 p-5 bg-zinc-900/10">
                              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
                                Real Talk
                              </p>
                              <p className="text-zinc-400 text-xs leading-relaxed">
                                {evaluation.realTalk}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {showInlineInput && (
                  <div className="mt-4 border border-zinc-800 p-3 bg-zinc-900/30">
                    <p className="text-zinc-500 text-xs mb-2">
                      Ask your question:
                    </p>
                    <div className="flex gap-2">
                      <input
                        ref={inlineInputRef}
                        type="text"
                        value={inlineInputValue}
                        onChange={(e) => setInlineInputValue(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && sendInlineQuestion()
                        }
                        placeholder="Type your question..."
                        className="flex-1 bg-black border border-zinc-700 text-white text-sm p-2 focus:border-red-500 focus:outline-none placeholder:text-zinc-700"
                        disabled={isAgentTyping}
                      />
                      <button
                        onClick={sendInlineQuestion}
                        disabled={isAgentTyping || !inlineInputValue.trim()}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        Ask
                      </button>
                    </div>
                  </div>
                )}
                {showButtons && buttons.length > 0 && !isAgentTyping && (
                  <div
                    id="decision-layer-quick-actions"
                    className="flex flex-wrap gap-2 mt-4"
                  >
                    {buttons.map((btn) => {
                      if (btn.id === "other_option" && showOtherInline) {
                        return (
                          <div
                            key="other-inline"
                            className="w-full border border-zinc-800 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-zinc-500 text-[10px] uppercase tracking-wider">
                                Describe your answer
                              </p>
                              <button
                                onClick={() => {
                                  setShowOtherInline(false);
                                  setInlineInputValue("");
                                }}
                                className="text-zinc-600 hover:text-white text-xs transition-colors"
                              >
                                ✕ Close
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={inlineInputValue}
                                onChange={(e) =>
                                  setInlineInputValue(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setShowOtherInline(false);
                                    sendInlineQuestion();
                                  }
                                  if (e.key === "Escape") {
                                    setShowOtherInline(false);
                                    setInlineInputValue("");
                                  }
                                }}
                                placeholder="Type your answer..."
                                className="flex-1 bg-black border border-zinc-700 text-white text-xs p-2 focus:border-red-500 focus:outline-none placeholder:text-zinc-700"
                              />
                              <button
                                onClick={() => {
                                  setShowOtherInline(false);
                                  sendInlineQuestion();
                                }}
                                disabled={!inlineInputValue.trim()}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 cursor-pointer text-white text-xs uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                              >
                                Answer
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (btn.id === "start_over") {
                        return (
                          <button
                            key={btn.id}
                            onClick={triggerStartOver}
                            className="relative border border-zinc-800 hover:border-red-500 p-2 text-left transition-all overflow-hidden min-w-[100px]"
                          >
                            {startOverActive && (
                              <span
                                className="absolute inset-0 bg-red-600/20 transition-none"
                                style={{ width: `${startOverProgress}%` }}
                              />
                            )}
                            <p className="relative text-zinc-300 text-xs flex items-center gap-1.5">
                              {startOverActive ? (
                                <>
                                  <span className="text-red-400">✕ Cancel</span>
                                </>
                              ) : (
                                btn.label
                              )}
                              {!startOverActive && btn.description && (
                                <span className="text-zinc-500">
                                  {" "}
                                  — {btn.description}
                                </span>
                              )}
                            </p>
                          </button>
                        );
                      }

                      return (
                        <button
                          key={btn.id}
                          onClick={() => {
                            if (btn.id === "other_option") {
                              const field = !creatorContext.goal
                                ? "goal"
                                : !creatorContext.buyer
                                  ? "buyer"
                                  : !creatorContext.mediaType
                                    ? "mediaType"
                                    : !creatorContext.timeConstraint
                                      ? "timeConstraint"
                                      : !creatorContext.qualityLevel
                                        ? "qualityLevel"
                                        : !creatorContext.blocker
                                          ? "blocker"
                                          : null;
                              setOtherTargetField(field);
                              setShowOtherInline(true);
                              setInlineInputValue("");
                              return;
                            }
                            handleButtonClick(btn.id);
                          }}
                          className="border border-zinc-800 hover:border-red-500 p-2 text-left transition-all"
                        >
                          <p className="text-zinc-300 text-xs flex items-center gap-1">
                            {btn.id === "ask_question" && (
                              <ChatCircle
                                size={12}
                                className="inline shrink-0"
                              />
                            )}
                            {btn.id === "other_option" ? (
                              <>
                                <span className="inline-block animate-[arrowPulse_1s_ease-in-out_infinite]">
                                  →
                                </span>{" "}
                                Custom
                              </>
                            ) : (
                              btn.label
                            )}
                            {btn.description && (
                              <span className="text-zinc-500">
                                {" "}
                                — {btn.description}
                              </span>
                            )}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Permanent Start Over button */}
                {!isAgentTyping && (
                  <div className="mt-3">
                    <button
                      onClick={triggerStartOver}
                      className="relative border border-zinc-800 hover:border-red-500 p-2 text-left transition-all overflow-hidden min-w-[100px]"
                    >
                      {startOverActive && (
                        <span
                          className="absolute inset-0 bg-red-600/20 transition-none"
                          style={{ width: `${startOverProgress}%` }}
                        />
                      )}
                      <p className="relative text-zinc-300 text-xs flex items-center gap-1.5">
                        {startOverActive ? (
                          <span className="text-red-400">✕ Cancel</span>
                        ) : (
                          <>
                            Start Over{" "}
                            <span className="text-zinc-500">— New content</span>
                          </>
                        )}
                      </p>
                    </button>
                  </div>
                )}
                {isPreparingRemixStudio && <RemixStudioActionSkeleton />}
                {isAnalyzing && (
                  <div className="bg-zinc-900/50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Lightning
                        size={14}
                        weight="fill"
                        className="text-red-500 mt-0.5 shrink-0"
                      />
                      <p className="text-white text-sm">
                        Cross-referencing your goals with what I see in your
                        content...
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pl-5">
                      <CircleNotch
                        size={12}
                        className="text-zinc-500 animate-spin"
                      />
                      <span className="text-zinc-500 text-xs">
                        Thinking... {formatAnalysisDuration(analysisElapsedMs)}
                      </span>
                    </div>
                  </div>
                )}
                {isAgentTyping && !isAnalyzing && <AgentMessageSkeleton />}

                <div ref={messagesEndRef} />
              </div>
              {/* Input - sticky at bottom */}
              <div className="p-4 border-t border-zinc-800 sticky bottom-0 bg-black z-10">
                <InsufficientCreditsBadge
                  actionKey={fileMode ? `decision_layer_${fileMode}` : null}
                  className="mb-2 w-full justify-center"
                />
                <div id="decision-layer-composer" className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    onFocus={() =>
                      scrollDecisionLayerToBottom("composer-focus", "smooth")
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" && sendToAgent(userMessage)
                    }
                    placeholder={animatedPlaceholder}
                    className="flex-1 bg-zinc-900 border border-zinc-800 text-white text-sm p-3 focus:border-red-500 focus:outline-none placeholder:text-zinc-700"
                    disabled={isAgentTyping}
                  />
                  <button
                    onClick={() => sendToAgent(userMessage)}
                    disabled={
                      isAgentTyping ||
                      !userMessage.trim() ||
                      creditsInsufficient
                    }
                    className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white text-xs uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
            {/* ═══ Resize Handle ═══ */}
            <div
              id="split-resize-handle"
              onMouseDown={handleDragStart}
              className="h-[calc(100vh-140px)] w-3 flex items-center justify-center cursor-col-resize group hover:bg-zinc-800/30 transition-colors shrink-0"
            >
              <div className="w-4 h-8 rounded-full bg-zinc-800  transition-colors flex items-center justify-center">
                <div className="flex flex-col gap-0.5">
                  <div className="w-0.5 h-0.5 rounded-full bg-zinc-600" />
                  <div className="w-0.5 h-0.5 rounded-full bg-zinc-600 " />
                  <div className="w-0.5 h-0.5 rounded-full bg-zinc-600 " />
                </div>
              </div>
            </div>
            {/* ═══════════════════════════════════════════════════════ */}
            {/* RIGHT COLUMN: Context Panel */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div
              data-lenis-prevent
              className="space-y-4 md:h-[calc(100vh-140px)] overflow-y-auto panel-scroll"
              style={{ width: `${100 - leftWidth}%`, flexShrink: 0 }}
            >
              {/* ─── Progress Bar + Mute (right panel only) ─────── */}
              <div id="progress-bar" className="flex items-center gap-3">
                <span
                  key={conversationPhase + contextStep}
                  className={`text-xs whitespace-nowrap px-2.5 py-1 rounded-full font-medium transition-all duration-500 animate-[fadeIn_0.3s_ease-out] ${
                    conversationPhase === "greeting"
                      ? "bg-zinc-800 text-zinc-400"
                      : conversationPhase === "pain-diagnosis"
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : conversationPhase === "intent-summary"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : conversationPhase === "awaiting-upload"
                            ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                            : conversationPhase === "extracting-media"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse"
                              : conversationPhase === "decision-evaluation"
                                ? "bg-orange-500/10 text-orange-400 border border-orange-500/20 animate-pulse"
                                : conversationPhase === "decision-options" ||
                                    conversationPhase === "companion"
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {conversationPhase === "greeting"
                    ? "Greeting"
                    : conversationPhase === "pain-diagnosis"
                      ? contextStep === 0
                        ? "Questions"
                        : `Q ${contextStep} / 6 — ${["Goal", "Buyer", "Media", "Time", "Quality", "Blocker"][contextStep - 1]}`
                      : conversationPhase === "intent-summary"
                        ? "Summary"
                        : conversationPhase === "awaiting-upload"
                          ? "Upload"
                          : conversationPhase === "extracting-media"
                            ? "Extracting..."
                            : conversationPhase === "decision-evaluation"
                              ? "Evaluating..."
                              : conversationPhase === "decision-options" ||
                                  conversationPhase === "companion"
                                ? "✓ Results"
                                : ""}
                </span>
                <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.min((stepProgress / 20) * 100, 100)}%`,
                    }}
                  />
                </div>
                <span className="text-zinc-600 text-[10px] whitespace-nowrap">
                  {Math.min(Math.round((stepProgress / 20) * 100), 100)}%
                </span>
                {isAnalyzing && (
                  <span className="text-[10px] whitespace-nowrap px-2 py-1 border border-orange-500/30 bg-orange-500/10 text-orange-300">
                    {formatAnalysisDuration(analysisElapsedMs)}
                  </span>
                )}
                {!isAnalyzing && evaluation && analysisElapsedMs > 0 && (
                  <span className="text-[10px] whitespace-nowrap px-2 py-1 border border-green-500/30 bg-green-500/10 text-green-300">
                    Total time {formatAnalysisDuration(analysisElapsedMs)}
                  </span>
                )}
                <button
                  onClick={() => {
                    setIsMuted((prev) => {
                      if (!prev) {
                        // Muting — abort fetch + stop audio immediately
                        currentTTSAbortRef.current?.abort();
                        currentTTSAbortRef.current = null;
                        if (audioRef.current) {
                          audioRef.current.pause();
                          audioRef.current = null;
                        }
                        isSpeakingRef.current = false;
                        if (
                          typeof window !== "undefined" &&
                          window.speechSynthesis
                        ) {
                          window.speechSynthesis.cancel();
                        }
                      }
                      return !prev;
                    });
                  }}
                  className="text-zinc-500 hover:text-white transition-all text-sm ml-1"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? "🔇" : "🔊"}
                </button>
                <button
                  onClick={() => {
                    setTourEnabled((prev) => {
                      const next = !prev;
                      localStorage.setItem(
                        "kz_decision_layer_tour_disabled",
                        next ? "0" : "1",
                      );
                      if (next) {
                        setShowTour(true);
                      } else {
                        setShowTour(false);
                      }
                      return next;
                    });
                  }}
                  className="text-zinc-500 hover:text-white transition-all text-sm ml-1"
                  title={tourEnabled ? "Disable tour" : "Enable tour"}
                >
                  {tourEnabled ? "🧭" : "🚫"}
                </button>
              </div>
              {/* {analysisStatusLog.length > 0 && (
                  <div className="border border-zinc-800 bg-black/40 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                        Analysis Log
                      </p>
                      <span className="text-[10px] text-zinc-600">
                        {isAnalyzing
                          ? "Latest analysis activity"
                          : "Last analysis activity"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {analysisStatusLog.map((entry, index) => (
                        <p
                          key={`${entry}-${index}`}
                          className="text-[11px] text-zinc-400 leading-relaxed"
                        >
                          {entry}
                        </p>
                      ))}
                    </div>
                  </div>
                )} */}
              {!evaluation && agentMessages.length <= 1 && (
                <div
                  id="decision-layer-analysis-preview"
                  className="border border-zinc-800 bg-black p-6"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkle size={16} className="text-red-600" />
                    <h3 className="text-sm font-medium text-white">
                      What I'll Do Once You Upload
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-600 mb-4">
                    Files are not needed yet
                  </p>
                  <div className="space-y-4">
                    {[
                      {
                        n: 1,
                        title: "Creative Clarity",
                        desc: "is the idea legible, do we understand what it is",
                      },
                      {
                        n: 2,
                        title: "Technical Quality",
                        desc: "resolution, motion quality, artifacts, audio clarity",
                      },
                      {
                        n: 3,
                        title: "Consistency Control",
                        desc: "character continuity, style drift, brand text stability",
                      },
                      {
                        n: 4,
                        title: "Audience Fit",
                        desc: "who would pay, who is it for, why they care",
                      },
                      {
                        n: 5,
                        title: "Differentiation",
                        desc: "what makes it not generic",
                      },
                      {
                        n: 6,
                        title: "Packaging Readiness",
                        desc: "how easy it is to turn into a product or deliverable",
                      },
                    ].map((item) => (
                      <div key={item.n} className="flex items-start gap-3">
                        <span className="text-red-500 text-sm font-medium">
                          {item.n}
                        </span>
                        <div>
                          <p className="text-white text-sm mb-1">
                            {item.title}
                          </p>
                          <p className="text-zinc-600 text-xs leading-relaxed">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 p-4 bg-zinc-900/50 border-l-2 border-zinc-800">
                    <p className="text-zinc-500 text-xs leading-relaxed italic">
                      The agent will ask you to upload when ready. Answer a few
                      questions first so I can give you the most relevant
                      evaluation.
                    </p>
                  </div>
                </div>
              )}
              {/* ─── Upload Area ────────────────────────────────── */}
              {error && !evaluation && (
                <div className="border border-red-500/30 bg-red-950/20 p-3">
                  <p className="text-red-300 text-xs leading-relaxed">
                    {error}
                  </p>
                  {(analysisApiInfo || analysisElapsedMs > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {analysisApiInfo && (
                        <>
                          <span className="text-[10px] uppercase tracking-wider text-red-200 border border-red-500/30 px-2 py-1">
                            API {analysisApiInfo.provider}
                          </span>
                          {analysisApiInfo.models.length > 0 && (
                            <span className="text-[10px] text-red-100/80 border border-red-500/20 px-2 py-1">
                              {analysisApiInfo.models.join(" + ")}
                            </span>
                          )}
                          {analysisApiInfo.keys.map((key) => (
                            <span
                              key={key.label}
                              className="text-[10px] text-red-100/80 border border-red-500/20 px-2 py-1"
                            >
                              {key.label}: {key.masked}
                            </span>
                          ))}
                        </>
                      )}
                      {analysisElapsedMs > 0 && (
                        <span className="text-[10px] text-red-100/80 border border-red-500/20 px-2 py-1">
                          Eval time {formatAnalysisDuration(analysisElapsedMs)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {uploadedFiles.length === 0 && !evaluation && showUploadArea && (
                <div className="border border-zinc-800 p-5">
                  <h3 className="text-xs font-medium text-white mb-3 uppercase tracking-wider">
                    Upload Content
                  </h3>
                  <div className="mb-4 border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                        Analysis Mode
                      </p>
                      <span className="text-[10px] text-zinc-600">
                        Choose speed vs depth before running evaluation
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAnalysisMode("fast")}
                        className={`border p-3 text-left transition-all ${
                          analysisMode === "fast"
                            ? "border-red-500 bg-red-950/20"
                            : "border-zinc-800 hover:border-red-500"
                        }`}
                      >
                        <p className="text-white text-sm">Fast</p>
                        <p className="text-zinc-500 text-[11px] mt-1">
                          Recommended when you want results quickly. Uses a shorter image pipeline and aims for sub-1-minute feedback.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnalysisMode("full")}
                        className={`border p-3 text-left transition-all ${
                          analysisMode === "full"
                            ? "border-red-500 bg-red-950/20"
                            : "border-zinc-800 hover:border-red-500"
                        }`}
                      >
                        <p className="text-white text-sm">Full</p>
                        <p className="text-zinc-500 text-[11px] mt-1">
                          Deepest evaluation with the current full workflow. Better for detailed coaching, but noticeably slower.
                        </p>
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
                      Pointer: pick <span className="text-zinc-300">Fast</span> when you need a quick decision and next actions. Pick <span className="text-zinc-300">Full</span> when you want the most detailed breakdown. Fast mode is optimized most aggressively for image analysis.
                    </p>
                  </div>
                  {incomingAsset && !injectedIncomingRef.current && (
                    <div className="mb-3 border border-red-500/30 bg-red-950/10 p-3 flex items-start gap-2">
                      <Sparkle
                        size={14}
                        weight="fill"
                        className="text-red-400 mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-red-200 text-[11px] leading-relaxed">
                          <span className="text-white/90">
                            "{incomingAsset.title}"
                          </span>{" "}
                          is ready from your marketplace asset.
                          {incomingAsset.suggestedMode ? (
                            <>
                              {" "}
                              Pick{" "}
                              <span className="text-white/90 capitalize">
                                {incomingAsset.suggestedMode}
                              </span>{" "}
                              below to load it.
                            </>
                          ) : (
                            " Pick a content type below to load it."
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  {!fileMode && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
                      <button
                        onClick={() => setFileMode("image")}
                        className="border border-zinc-800 hover:border-red-500 p-4 text-left transition-all"
                      >
                        <p className="text-white text-sm mb-1">Image</p>
                        <p className="text-zinc-600 text-xs">
                          jpg, png, webp • 25MB max
                        </p>
                      </button>
                      <button
                        onClick={() => setFileMode("video")}
                        className="border border-zinc-800 hover:border-red-500 p-4 text-left transition-all"
                      >
                        <p className="text-white text-sm mb-1">Video</p>
                        <p className="text-zinc-600 text-xs">
                          mp4, mov, webm • 200MB, 120s max
                        </p>
                      </button>
                      <button
                        onClick={() => setFileMode("audio")}
                        className="border border-zinc-800 hover:border-red-500 p-4 text-left transition-all"
                      >
                        <p className="text-white text-sm mb-1">Audio</p>
                        <p className="text-zinc-600 text-xs">
                          mp3, wav, flac, m4a • 50MB max
                        </p>
                      </button>
                      <button
                        onClick={() => setFileMode("text")}
                        className="border border-zinc-800 hover:border-red-500 p-4 text-left transition-all"
                      >
                        <p className="text-white text-sm mb-1">Text</p>
                        <p className="text-zinc-600 text-xs">
                          txt, md, csv, json • 10MB max
                        </p>
                      </button>
                    </div>
                  )}
                  {fileMode && (
                    <label
                      className="block cursor-pointer group"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const dt = e.dataTransfer;
                        if (dt?.files?.length) {
                          const dropEvent = {
                            target: { files: dt.files },
                          };
                          void handleFileUpload(dropEvent);
                        }
                      }}
                    >
                      <input
                        type="file"
                        multiple
                        accept={
                          fileMode === "video"
                            ? "video/*,.pdf,application/pdf"
                            : fileMode === "audio"
                              ? "audio/*,.pdf,application/pdf"
                              : fileMode === "text"
                                ? ".txt,.md,.markdown,.csv,.json,.html,.rtf,.log,.pdf,application/pdf,text/plain,text/markdown,text/csv,text/html,application/json"
                                : "image/*,.pdf,application/pdf"
                        }
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div className="border border-dashed border-zinc-800 hover:border-red-500/50 p-6 transition-all flex flex-col items-center justify-center gap-2 group-hover:bg-zinc-900/30">
                        {fileMode === "video" ? (
                          <VideoCamera
                            size={20}
                            weight="thin"
                            className="text-zinc-700 group-hover:text-red-500"
                          />
                        ) : (
                          <UploadSimple
                            size={20}
                            weight="thin"
                            className="text-zinc-700 group-hover:text-red-500"
                          />
                        )}
                        <p className="text-zinc-600 text-xs">
                          Click or drag{" "}
                          {fileMode === "audio"
                            ? "audio files"
                            : fileMode === "text"
                              ? "text files"
                              : `${fileMode} files`}
                        </p>
                        <p className="text-zinc-700 text-[10px] text-center">
                          1 primary (
                          {fileMode === "video"
                            ? "200MB, 120s max"
                            : fileMode === "audio"
                              ? "100MB max"
                              : fileMode === "text"
                                ? "10MB max"
                                : "25MB max"}
                          ) + up to 3 supporting assets (PDF up to 25MB)
                        </p>
                      </div>
                    </label>
                  )}
                </div>
              )}
              {/* ─── Uploaded Files ─────────────────────────────── */}
              {uploadedFiles.length > 0 && (
                <div className="border border-zinc-800 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-medium text-white uppercase tracking-wider">
                      Uploaded Files
                    </h3>
                    <span className="text-xs text-zinc-600">
                      {uploadedFiles.length}/{UPLOAD_LIMITS.maxTotalAssets}
                    </span>
                  </div>
                  <div className="mb-3 border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                          Selected Analysis
                        </p>
                        <p className="text-zinc-400 text-[11px] mt-1">
                          {analysisMode === "fast"
                            ? "Fast mode reduces image-analysis time with a shorter pipeline."
                            : "Full mode keeps the complete current pipeline for maximum depth."}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAnalysisMode("fast")}
                          className={`px-3 py-2 text-[11px] uppercase tracking-wider border transition-all ${
                            analysisMode === "fast"
                              ? "border-red-500 text-white bg-red-950/20"
                              : "border-zinc-800 text-zinc-500 hover:border-red-500"
                          }`}
                        >
                          Fast
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalysisMode("full")}
                          className={`px-3 py-2 text-[11px] uppercase tracking-wider border transition-all ${
                            analysisMode === "full"
                              ? "border-red-500 text-white bg-red-950/20"
                              : "border-zinc-800 text-zinc-500 hover:border-red-500"
                          }`}
                        >
                          Full
                        </button>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`grid gap-2 ${fileMode === "video" ? "grid-cols-2" : fileMode === "audio" ? "grid-cols-1" : "grid-cols-3"}`}
                  >
                    {uploadedFiles.map((item, index) => (
                      <div
                        key={index}
                        className={`relative group ${
                          item.type === "video"
                            ? "aspect-video"
                            : item.type === "audio" || item.type === "pdf"
                              ? ""
                              : "aspect-square"
                        }`}
                      >
                        {item.type === "audio" ? (
                          <div className="border border-zinc-800 p-3 flex items-center gap-3">
                            <span className="text-red-500 text-lg">🔊</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-zinc-300 text-xs truncate">
                                {item.file.name}
                              </p>
                              <p className="text-zinc-600 text-[10px]">
                                {(item.file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                              <audio
                                src={item.preview || ""}
                                controls
                                className="w-full mt-2 h-8"
                                style={{
                                  filter: "invert(1) hue-rotate(180deg)",
                                }}
                              />
                            </div>
                            <button
                              onClick={() => removeFile(index)}
                              className="w-4 h-4 bg-red-600 flex items-center justify-center shrink-0"
                            >
                              <X size={8} weight="bold" />
                            </button>
                          </div>
                        ) : item.type === "video" ? (
                          <video
                            src={item.preview || ""}
                            className="w-full h-full object-cover border border-zinc-800"
                            controls
                          />
                        ) : item.type === "image" && item.preview ? (
                          <img
                            src={item.preview}
                            alt={`Upload ${index + 1}`}
                            className="w-full h-full object-cover border border-zinc-800"
                          />
                        ) : (
                          <div className="w-full bg-zinc-900 border border-zinc-800 p-4 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              {item.type === "pdf" ? (
                                <span className="text-red-500 text-base shrink-0">
                                  📄
                                </span>
                              ) : (
                                <ImageIcon
                                  size={16}
                                  className="text-zinc-500 shrink-0"
                                />
                              )}
                              <p className="text-zinc-200 text-sm font-medium truncate">
                                {item.file.name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
                                {item.type === "pdf" ? "PDF" : "TEXT"}
                              </span>
                              <span className="text-zinc-700 text-[10px]">
                                ·
                              </span>
                              <span className="text-zinc-600 text-[10px]">
                                {(item.file.size / 1024).toFixed(0)} KB
                              </span>
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(index)}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100"
                        >
                          <X size={8} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {isAnalyzing && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                      <CircleNotch size={12} className="animate-spin" />
                      <span>
                        {fileMode === "video"
                          ? "Extracting frames and analyzing..."
                          : fileMode === "audio"
                            ? "Listening to audio with AI models..."
                            : "Analyzing..."}{" "}
                        {formatAnalysisDuration(analysisElapsedMs)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Client Signals (pre-evaluation) ────────── */}
              {clientSignals.length > 0 && !evaluation && (
                <div className="border border-zinc-800 p-4">
                  <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                    What I See (Pre-Analysis)
                  </p>
                  {clientSignals.map((s, i) => (
                    <div key={i} className="mb-3 last:mb-0">
                      <p className="text-zinc-400 text-xs font-medium mb-1 truncate">
                        {s.fileName}
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {s.width && (
                          <p className="text-zinc-600 text-[10px]">
                            Size:{" "}
                            <span className="text-zinc-400">
                              {s.width}×{s.height}
                            </span>
                          </p>
                        )}
                        {s.resolutionLabel && (
                          <p className="text-zinc-600 text-[10px]">
                            Quality:{" "}
                            <span
                              className={`${
                                s.resolutionLabel === "Very High" ||
                                s.resolutionLabel === "High"
                                  ? "text-green-400"
                                  : s.resolutionLabel === "Good"
                                    ? "text-yellow-400"
                                    : "text-red-400"
                              }`}
                            >
                              {s.resolutionLabel}
                            </span>
                          </p>
                        )}
                        {s.megapixels && (
                          <p className="text-zinc-600 text-[10px]">
                            Megapixels:{" "}
                            <span className="text-zinc-400">
                              {s.megapixels}MP
                            </span>
                          </p>
                        )}
                        {s.orientation && (
                          <p className="text-zinc-600 text-[10px]">
                            Orientation:{" "}
                            <span className="text-zinc-400">
                              {s.orientation}
                            </span>
                          </p>
                        )}
                        {s.lightingMood && (
                          <p className="text-zinc-600 text-[10px]">
                            Lighting:{" "}
                            <span className="text-zinc-400">
                              {s.lightingMood}
                            </span>
                          </p>
                        )}
                        {s.colorMood && (
                          <p className="text-zinc-600 text-[10px]">
                            Color:{" "}
                            <span className="text-zinc-400">{s.colorMood}</span>
                          </p>
                        )}
                        {s.contrastLevel && (
                          <p className="text-zinc-600 text-[10px]">
                            Contrast:{" "}
                            <span className="text-zinc-400">
                              {s.contrastLevel}
                            </span>
                          </p>
                        )}
                        {s.fileSizeMB && (
                          <p className="text-zinc-600 text-[10px]">
                            File:{" "}
                            <span className="text-zinc-400">
                              {s.fileSizeMB}MB
                            </span>
                          </p>
                        )}
                        {s.durationLabel && (
                          <p className="text-zinc-600 text-[10px]">
                            Duration:{" "}
                            <span className="text-zinc-400">
                              {s.durationLabel}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {evaluation && (
                <div className="space-y-3">
                  <div
                    className={`border-l-4 p-4 ${
                      evaluation.decision === "yes"
                        ? "border-green-500 bg-green-950/10"
                        : evaluation.decision === "not-yet"
                          ? "border-yellow-500 bg-yellow-950/10"
                          : "border-red-500 bg-red-950/10"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-sm font-medium ${
                          evaluation.decision === "yes"
                            ? "text-green-400"
                            : evaluation.decision === "not-yet"
                              ? "text-yellow-400"
                              : "text-red-400"
                        }`}
                      >
                        {evaluation.decision === "yes"
                          ? "Ready to List"
                          : evaluation.decision === "not-yet"
                            ? "Almost There"
                            : "Not Yet"}
                      </p>
                      <span
                        className={`text-lg font-medium ${
                          evaluation.overallReadiness >= 80
                            ? "text-green-400"
                            : evaluation.overallReadiness >= 60
                              ? "text-yellow-400"
                              : "text-red-400"
                        }`}
                      >
                        {evaluation.overallReadiness}%
                      </span>
                    </div>
                  </div>

                  {/* Mini Radar */}
                  {evaluation.readinessScores &&
                    evaluation.readinessScores.length > 0 && (
                      <div className="border border-zinc-800 p-4">
                        <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                          Readiness Snapshot
                        </p>
                        <div className="space-y-2">
                          {evaluation.readinessScores.map((s, i) => (
                            <div key={i} className="mb-3">
                              <div className="flex items-center gap-2">
                                <p className="text-zinc-500 text-[11px] w-24">
                                  {s.axis}
                                </p>
                                <div className="flex-1 h-1.5 bg-zinc-900 rounded-full">
                                  <div
                                    className={`h-full rounded-full ${s.score >= 80 ? "bg-green-500" : s.score >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                                    style={{ width: `${s.score}%` }}
                                  />
                                </div>
                                <p
                                  className={`text-[11px] font-medium w-5 text-right ${s.score >= 80 ? "text-green-400" : s.score >= 60 ? "text-yellow-400" : "text-red-400"}`}
                                >
                                  {s.score}%
                                </p>
                              </div>
                              {s.note && (
                                <p className="text-zinc-400 text-[10px] leading-relaxed mt-1">
                                  {s.note}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Quick Pricing */}
                  {evaluation.pricingGuidance && (
                    <div className="border border-zinc-800 p-4">
                      <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">
                        Pricing
                      </p>
                      <p className="text-white text-sm font-medium">
                        {evaluation.pricingGuidance.currentRange ||
                          evaluation.pricingGuidance.range}
                      </p>
                      {evaluation.pricingGuidance.potentialRange && (
                        <p className="text-zinc-500 text-[11px] mt-1">
                          Potential:{" "}
                          <span className="text-green-400">
                            {evaluation.pricingGuidance.potentialRange}
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Key Strengths & Weaknesses */}
                  {evaluation.contentCritique && (
                    <div className="border border-zinc-800 p-4">
                      <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">
                        Quick Summary
                      </p>
                      <div className="space-y-1">
                        {evaluation.contentCritique.strengths
                          ?.slice(0, 2)
                          .map((s, i) => (
                            <p
                              key={i}
                              className="text-green-400/80 text-[11px]"
                            >
                              + {s}
                            </p>
                          ))}
                        {evaluation.contentCritique.weaknesses
                          ?.slice(0, 2)
                          .map((w, i) => (
                            <p key={i} className="text-red-400/60 text-[11px]">
                              - {w}
                            </p>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Pain Point */}
                  {evaluation.topPainPoint && (
                    <div className="border border-red-500/20 bg-red-950/10 p-3">
                      <p className="text-red-400 text-[11px] font-medium">
                        🎯 {evaluation.topPainPoint}
                      </p>
                    </div>
                  )}
                  {/* Action Plan Checklist */}
                  {(evaluation.exactEdits || evaluation.fastestPath) && (
                    <div className="border border-zinc-800 p-4">
                      <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">
                        ✅ Action Plan
                      </p>
                      <div className="space-y-2">
                        {evaluation.exactEdits?.map((edit, i) => (
                          <label
                            key={`edit-${i}`}
                            className="flex items-start gap-2 cursor-pointer group"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-red-500"
                              onChange={(e) => {
                                const target = e.target
                                  .nextElementSibling as HTMLElement;
                                if (target) {
                                  target.style.textDecoration = e.target.checked
                                    ? "line-through"
                                    : "none";
                                  target.style.opacity = e.target.checked
                                    ? "0.4"
                                    : "1";
                                }
                              }}
                            />
                            <span className="text-zinc-400 text-[11px] leading-relaxed transition-all">
                              {edit.edit}
                              <span
                                className={`ml-1 text-[9px] ${
                                  edit.effort === "Quick"
                                    ? "text-green-500"
                                    : edit.effort === "Medium"
                                      ? "text-yellow-500"
                                      : "text-red-500"
                                }`}
                              >
                                [{edit.effort}]
                              </span>
                            </span>
                          </label>
                        ))}
                        {evaluation.fastestPath?.map((item, i) => (
                          <label
                            key={`path-${i}`}
                            className="flex items-start gap-2 cursor-pointer group"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-red-500"
                              onChange={(e) => {
                                const target = e.target
                                  .nextElementSibling as HTMLElement;
                                if (target) {
                                  target.style.textDecoration = e.target.checked
                                    ? "line-through"
                                    : "none";
                                  target.style.opacity = e.target.checked
                                    ? "0.4"
                                    : "1";
                                }
                              }}
                            />
                            <span className="text-zinc-400 text-[11px] leading-relaxed transition-all">
                              {item.step}
                              <span className="ml-1 text-[9px] text-zinc-600">
                                [{item.timeEstimate}]
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function DecisionLayerFlow() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <DecisionLayerFlowContent />
    </Suspense>
  );
}
