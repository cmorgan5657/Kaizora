"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type Dispatch,
  type ChangeEvent,
  type MouseEvent,
  type SetStateAction,
} from "react";
import CommunityAssistant from "../../components/CommunityAssistant";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Search,
  Plus,
  Zap,
  Users,
  Star,
  ChevronRight,
  X,
  SlidersHorizontal,
  TrendingUp,
  Flame,
  Award,
  Radio,
  Sparkles,
  ImageIcon,
  ChevronLeft,
  Trophy,
  Repeat2,
  UserPlus,
  MessageSquare,
  ArrowRight,
  Clock,
  Activity,
  Megaphone,
  GitFork,
  Pencil,
  Play,
  Pause,
  RotateCcw,
  Music4,
  Trash2,
  Video,
  FileCode2,
  FileText,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Static data ──────────────────────────────────────────────────────────────
const CREATOR_SORT_FILTERS = [
  "Trending",
  "New",
  "Most Followed",
  "Most Remixed",
] as const;
const SAVED_SUB_TABS = ["All", "Posts", "Challenges", "Creators"] as const;
const FEED_CHALLENGE_STATUSES = ["active", "upcoming"];
const TAB_SEEN_STORAGE_KEY = "pulse_feed_tab_seen_at";
const CODE_FILE_EXTENSIONS = new Set([
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "json",
  "xml",
  "svg",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "php",
  "rb",
  "go",
  "rs",
  "swift",
  "kt",
  "sql",
  "sh",
  "bash",
  "zsh",
  "yml",
  "yaml",
  "toml",
  "ini",
  "env",
]);
const TEXT_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "rtf",
  "csv",
  "log",
]);
const PULSE_FILE_ACCEPT =
  "image/*,video/*,audio/*,text/*,.txt,.md,.markdown,.html,.htm,.css,.scss,.sass,.less,.js,.jsx,.ts,.tsx,.json,.xml,.svg,.py,.java,.c,.cpp,.h,.hpp,.cs,.php,.rb,.go,.rs,.swift,.kt,.sql,.sh,.bash,.zsh,.yml,.yaml,.toml,.ini,.env,.csv,.log,.rtf";

function createdAtMs(row: any) {
  const ts = Date.parse(row?.created_at || "");
  return Number.isNaN(ts) ? 0 : ts;
}

function upsertByIdAndSort(rows: any[], nextRow: any) {
  const merged = [nextRow, ...rows.filter((row) => row.id !== nextRow.id)];
  merged.sort((a, b) => createdAtMs(b) - createdAtMs(a));
  return merged;
}

function removePostStateById(
  postId: string,
  setters: {
    setAssets: Dispatch<SetStateAction<any[]>>;
    setLikedByMe: Dispatch<SetStateAction<Set<string>>>;
    setSavedPostIds: Dispatch<SetStateAction<Set<string>>>;
    setLikeCounts: Dispatch<SetStateAction<Map<string, number>>>;
    setCommentCounts: Dispatch<SetStateAction<Map<string, number>>>;
    setShareCounts: Dispatch<SetStateAction<Map<string, number>>>;
    setCommentsByPost: Dispatch<SetStateAction<Map<string, PostComment[]>>>;
    setOpenCommentPostIds: Dispatch<SetStateAction<Set<string>>>;
  },
) {
  setters.setAssets((prev) => prev.filter((item) => item.id !== postId));
  setters.setLikedByMe((prev) => {
    const next = new Set(prev);
    next.delete(postId);
    return next;
  });
  setters.setSavedPostIds((prev) => {
    const next = new Set(prev);
    next.delete(postId);
    return next;
  });
  setters.setLikeCounts((prev) => {
    const next = new Map(prev);
    next.delete(postId);
    return next;
  });
  setters.setCommentCounts((prev) => {
    const next = new Map(prev);
    next.delete(postId);
    return next;
  });
  setters.setShareCounts((prev) => {
    const next = new Map(prev);
    next.delete(postId);
    return next;
  });
  setters.setCommentsByPost((prev) => {
    const next = new Map(prev);
    next.delete(postId);
    return next;
  });
  setters.setOpenCommentPostIds((prev) => {
    const next = new Set(prev);
    next.delete(postId);
    return next;
  });
}

type PostComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type RawPostComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function detectPulsePostContentType(file: File) {
  const mime = (file.type || "").toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (CODE_FILE_EXTENSIONS.has(extension)) return "code";
  if (
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript")
  ) {
    return "code";
  }
  if (
    mime.startsWith("text/") ||
    TEXT_FILE_EXTENSIONS.has(extension) ||
    mime.includes("markdown") ||
    mime.includes("csv")
  ) {
    return "text";
  }

  return null;
}

function PulsePostMedia({
  asset,
  storageUrl,
  onOpenPost,
}: {
  asset: any;
  storageUrl: (path?: string) => string | null;
  onOpenPost: () => void;
}) {
  const mediaUrl = storageUrl(asset.storage_path);
  const imageUrl = storageUrl(
    asset.thumbnail_path ||
      (asset.content_type === "image" ? asset.storage_path : null),
  );
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const node = mediaRef.current;
    if (!node) return;

    const syncDuration = () => {
      setDuration(Number.isFinite(node.duration) ? node.duration : 0);
    };
    const syncTime = () => {
      setCurrentTime(node.currentTime || 0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    node.addEventListener("loadedmetadata", syncDuration);
    node.addEventListener("durationchange", syncDuration);
    node.addEventListener("timeupdate", syncTime);
    node.addEventListener("play", handlePlay);
    node.addEventListener("pause", handlePause);
    node.addEventListener("ended", handleEnded);

    syncDuration();
    syncTime();

    return () => {
      node.pause();
      node.removeEventListener("loadedmetadata", syncDuration);
      node.removeEventListener("durationchange", syncDuration);
      node.removeEventListener("timeupdate", syncTime);
      node.removeEventListener("play", handlePlay);
      node.removeEventListener("pause", handlePause);
      node.removeEventListener("ended", handleEnded);
    };
  }, [mediaUrl]);

  const handleTogglePlayback = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const node = mediaRef.current;
    if (!node) return;
    try {
      if (node.paused) await node.play();
      else node.pause();
    } catch {
      // Ignore playback failures from browser autoplay policies.
    }
  };

  const handleRestart = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const node = mediaRef.current;
    if (!node) return;
    node.currentTime = 0;
    setCurrentTime(0);
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const node = mediaRef.current;
    if (!node) return;
    const nextTime = Number(e.target.value);
    node.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const actionButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-gray-300 transition-all hover:border-red-500/30 hover:text-white";

  if (asset.content_type === "image" && imageUrl) {
    return (
      <button
        type="button"
        onClick={onOpenPost}
        className="mx-4 mb-3 w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0b0b0c] transition-all hover:border-white/[0.1]"
      >
        <div className="flex min-h-[14rem] max-h-[32rem] w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_45%),linear-gradient(180deg,rgba(17,17,19,1),rgba(10,10,12,1))] p-2 sm:p-3">
          <img
            src={imageUrl}
            alt={asset.title || "Pulse post"}
            className="max-h-[30rem] max-w-full rounded-xl object-contain"
          />
        </div>
      </button>
    );
  }

  if (asset.content_type === "video" && mediaUrl) {
    return (
      <div className="mx-4 mb-3 w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-white/[0.05] bg-[#0b0b0c]">
        <div
          className="flex min-h-[14rem] max-h-[32rem] w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_45%),linear-gradient(180deg,rgba(17,17,19,1),rgba(10,10,12,1))] p-2 sm:p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <video
            ref={(node) => {
              mediaRef.current = node;
            }}
            src={mediaUrl}
            poster={imageUrl || undefined}
            preload="metadata"
            playsInline
            className="max-h-[30rem] max-w-full rounded-xl object-contain"
          />
        </div>
        <div
          className="border-t border-white/[0.05] bg-white/[0.02] px-3 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePlayback}
              className={actionButtonClass}
              aria-label={isPlaying ? "Pause video" : "Play video"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="ml-0.5 h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className={actionButtonClass}
              aria-label="Restart video"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-gray-500">
              <Video className="h-3.5 w-3.5" />
              Video
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-9 text-[11px] font-medium text-gray-400">
              {formatMediaTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0)}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              onChange={handleSeek}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.1] accent-red-500"
              aria-label="Seek video"
            />
            <span className="w-9 text-right text-[11px] font-medium text-gray-500">
              {formatMediaTime(duration)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (asset.content_type === "audio" && mediaUrl) {
    return (
      <div
        className="mx-4 mb-3 overflow-hidden rounded-2xl border border-white/[0.05] bg-[linear-gradient(180deg,rgba(16,16,18,1),rgba(10,10,12,1))]"
        onClick={(e) => e.stopPropagation()}
      >
        <audio
          ref={(node) => {
            mediaRef.current = node;
          }}
          src={mediaUrl}
          preload="metadata"
        />
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.18),transparent_45%),linear-gradient(180deg,rgba(24,24,27,1),rgba(13,13,15,1))]">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={asset.title || "Audio cover"}
                className="h-full w-full object-cover"
              />
            ) : (
              <Music4 className="h-8 w-8 text-red-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlayback}
                className={actionButtonClass}
                aria-label={isPlaying ? "Pause audio" : "Play audio"}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className={actionButtonClass}
                aria-label="Restart audio"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <div className="ml-auto text-[10px] font-medium uppercase tracking-[0.14em] text-gray-500">
                Audio
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-9 text-[11px] font-medium text-gray-400">
                {formatMediaTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(duration, 0)}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={handleSeek}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.1] accent-red-500"
                aria-label="Seek audio"
              />
              <span className="w-9 text-right text-[11px] font-medium text-gray-500">
                {formatMediaTime(duration)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PulseFeedPage() {
  const router = useRouter();

  // Core state
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [connections, setConnections] = useState<Map<string, any>>(new Map());
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [totalNotifications, setTotalNotifications] = useState(0);
  const [assets, setAssets] = useState<any[]>([]);
  const [focusedUser, setFocusedUser] = useState<any>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [rulesChallenge, setRulesChallenge] = useState<any>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [challengeEntries, setChallengeEntries] = useState<any[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [userEntryIds, setUserEntryIds] = useState<Set<string>>(new Set());
  const [enteredChallengeIds, setEnteredChallengeIds] = useState<Set<string>>(new Set());
  const [openEntry, setOpenEntry] = useState<any>(null);
  const [challengeListFilter, setChallengeListFilter] = useState<"all" | "active" | "upcoming" | "results">("all");
  const [challengeSearch, setChallengeSearch] = useState("");
  const [favoriteCreators, setFavoriteCreators] = useState<Set<string>>(new Set());
  const [togglingFav, setTogglingFav] = useState<string | null>(null);

  // Signals
  const [signals, setSignals] = useState<any[]>([]);

  // Engagement
  const [likedByMe, setLikedByMe] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map());
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [shareCounts, setShareCounts] = useState<Map<string, number>>(new Map());
  const [likingPost, setLikingPost] = useState<string | null>(null);
  const [openCommentPostIds, setOpenCommentPostIds] = useState<Set<string>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Map<string, PostComment[]>>(new Map());
  const [loadingCommentPostIds, setLoadingCommentPostIds] = useState<Set<string>>(new Set());
  const [commentDrafts, setCommentDrafts] = useState<Map<string, string>>(new Map());
  const [commentErrors, setCommentErrors] = useState<Map<string, string>>(new Map());
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);

  // Saved items
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [savedChallengeIds, setSavedChallengeIds] = useState<Set<string>>(new Set());
  const [savingPost, setSavingPost] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<"pulse" | "challenges" | "signals" | "creators" | "saved">("pulse");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pulse_active_tab");
      if (saved && ["pulse", "challenges", "signals", "creators", "saved"].includes(saved)) {
        setActiveTab(saved as any);
      }
    } catch {}
  }, []);
  function changeTab(tab: "pulse" | "challenges" | "signals" | "creators" | "saved") {
    setActiveTab(tab);
    try {
      localStorage.setItem("pulse_active_tab", tab);
    } catch {}
  }
  const [tabSeenAt, setTabSeenAt] = useState<Partial<Record<"challenges" | "signals", number>>>({});

  // Feed (Pulse tab)
  const [searchQuery, setSearchQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "paid">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [activeCategory, setActiveCategory] = useState("All");
  const [assetPage, setAssetPage] = useState(1);
  const [creatorPage, setCreatorPage] = useState(1);
  const [signalsPage, setSignalsPage] = useState(1);
  const [challengeEntriesPage, setChallengeEntriesPage] = useState(1);
  const [savedPage, setSavedPage] = useState(1);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Creators tab
  const [creatorSearch, setCreatorSearch] = useState("");
  const [creatorSort, setCreatorSort] = useState<(typeof CREATOR_SORT_FILTERS)[number]>("Trending");

  // Saved tab
  const [savedSubTab, setSavedSubTab] = useState<(typeof SAVED_SUB_TABS)[number]>("All");

  // Create post modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [entryChallenge, setEntryChallenge] = useState<any>(null);
  const [postTitle, setPostTitle] = useState("");
  const [postDescription, setPostDescription] = useState("");
  const [postContentType, setPostContentType] = useState("image");
  const [postPrice, setPostPrice] = useState<"free" | "paid">("free");
  const [postPriceCents, setPostPriceCents] = useState("");
  const [postFile, setPostFile] = useState<File | null>(null);
  const [postFilePreview, setPostFilePreview] = useState<string | null>(null);
  const [postUploading, setPostUploading] = useState(false);
  const [postError, setPostError] = useState("");
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ASSETS_PER_PAGE = 15;

  const removePostFromFeed = (postId: string) => {
    removePostStateById(postId, {
      setAssets,
      setLikedByMe,
      setSavedPostIds,
      setLikeCounts,
      setCommentCounts,
      setShareCounts,
      setCommentsByPost,
      setOpenCommentPostIds,
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(TAB_SEEN_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<
        Record<"challenges" | "signals", number>
      >;
      setTabSeenAt(parsed);
    } catch {
      // Ignore malformed local storage payloads.
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "challenges" && activeTab !== "signals") return;

    const now = Date.now();
    setTabSeenAt((prev) => {
      const next = { ...prev, [activeTab]: now };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TAB_SEEN_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    const channel = supabase
      .channel("pulse-feed-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "posts",
        },
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            const deletedId = payload.old?.id;
            if (deletedId) removePostFromFeed(deletedId);
            return;
          }

          const incoming = payload.new;
          if (!incoming?.id) return;

          if (!incoming.is_public) {
            removePostFromFeed(incoming.id);
            return;
          }

          setAssets((prev) => {
            const existing = prev.find((item) => item.id === incoming.id);
            if (!existing) return prev;
            return upsertByIdAndSort(prev, { ...existing, ...incoming });
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenges",
        },
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            const deletedId = payload.old?.id;
            if (!deletedId) return;

            setChallenges((prev) =>
              prev.filter((challenge) => challenge.id !== deletedId),
            );
            return;
          }

          const incoming = payload.new;
          if (!incoming?.id) return;

          const status = String(incoming.status || "").toLowerCase();
          if (!FEED_CHALLENGE_STATUSES.includes(status)) {
            setChallenges((prev) =>
              prev.filter((challenge) => challenge.id !== incoming.id),
            );
            return;
          }

          setChallenges((prev) => upsertByIdAndSort(prev, incoming));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signals",
        },
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            const deletedId = payload.old?.id;
            if (!deletedId) return;

            setSignals((prev) =>
              prev.filter((signal) => signal.id !== deletedId),
            );
            return;
          }

          const incoming = payload.new;
          if (!incoming?.id) return;

          setSignals((prev) => upsertByIdAndSort(prev, incoming));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const ch = supabase
      .channel("notifs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_connections",
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        () => loadNotifs(currentUser.id),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        () => loadNotifs(currentUser.id),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [currentUser]);

  useEffect(() => {
    setAssetPage(1);
  }, [searchQuery, priceFilter, sortBy, activeCategory]);

  useEffect(() => {
    setCreatorPage(1);
  }, [creatorSearch, creatorSort]);

  useEffect(() => {
    setSignalsPage(1);
  }, [signals.length]);

  useEffect(() => {
    setChallengeEntriesPage(1);
  }, [selectedChallenge?.id]);

  useEffect(() => {
    setSavedPage(1);
  }, [savedSubTab]);

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadData() {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);

      const [
        { data: profilesData },
        { data: postsData },
        { data: challengesData },
        { data: signalsData },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, avatar_url, bio, created_at")
          .neq("id", user?.id || "")
          .order("created_at", { ascending: false }),
        supabase
          .from("posts")
          .select(
            "id, title, description, content_type, created_at, thumbnail_path, storage_path, price_cents, user_id, profiles(display_name, avatar_url)",
          )
          .eq("is_public", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("challenges")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("signals")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      setChallenges(challengesData || []);
      setSignals(signalsData || []);

      // Which challenges has this user already submitted an entry to?
      if (user?.id) {
        const { data: myEntries } = await supabase
          .from("challenge_entries")
          .select("challenge_id")
          .eq("user_id", user.id);
        setEnteredChallengeIds(new Set((myEntries || []).map((e: any) => e.challenge_id)));
      }

      const postIds = (postsData || []).map((a: any) => a.id);

      // Load engagement counts + user's liked/saved state in parallel
      let likesRes: any = { data: [] };
      let commentsRes: any = { data: [] };
      let sharesRes: any = { data: [] };

      if (postIds.length > 0) {
        [likesRes, commentsRes, sharesRes] = await Promise.all([
          supabase
            .from("post_likes")
            .select("post_id, user_id")
            .in("post_id", postIds),
          supabase
            .from("post_comments")
            .select("post_id")
            .in("post_id", postIds),
          supabase.from("post_shares").select("post_id").in("post_id", postIds),
        ]);
      }

      let favRes: any = null;
      let savedRes: any = null;
      let pdRes: any = null;

      if (user) {
        [favRes, savedRes, pdRes] = await Promise.all([
          supabase
            .from("creator_favorites")
            .select("creator_id")
            .eq("user_id", user.id),
          supabase
            .from("saved_items")
            .select("item_id, item_type")
            .eq("user_id", user.id),
          supabase
            .from("profiles")
            .select("avatar_url, display_name")
            .eq("id", user.id)
            .single(),
        ]);

        await Promise.all([loadConnections(user.id), loadNotifs(user.id)]);
      }

      // Engagement maps
      const lc = new Map<string, number>();
      const lbm = new Set<string>();
      (likesRes?.data || []).forEach((l: any) => {
        lc.set(l.post_id, (lc.get(l.post_id) ?? 0) + 1);
        if (user && l.user_id === user.id) lbm.add(l.post_id);
      });
      setLikeCounts(lc);
      setLikedByMe(lbm);

      const cc = new Map<string, number>();
      (commentsRes?.data || []).forEach((c: any) =>
        cc.set(c.post_id, (cc.get(c.post_id) ?? 0) + 1),
      );
      setCommentCounts(cc);

      const sc = new Map<string, number>();
      (sharesRes?.data || []).forEach((s: any) =>
        sc.set(s.post_id, (sc.get(s.post_id) ?? 0) + 1),
      );
      setShareCounts(sc);

      if (user) {
        if (favRes?.data)
          setFavoriteCreators(
            new Set(favRes.data.map((f: any) => f.creator_id)),
          );
        if (savedRes?.data) {
          setSavedPostIds(
            new Set(
              savedRes.data
                .filter((s: any) => s.item_type === "post")
                .map((s: any) => s.item_id),
            ),
          );
          setSavedChallengeIds(
            new Set(
              savedRes.data
                .filter((s: any) => s.item_type === "challenge")
                .map((s: any) => s.item_id),
            ),
          );
        }
        if (pdRes?.data) setCurrentUserProfile(pdRes.data);
      }

      // Users with real metrics
      const userIds = (profilesData || []).map((u: any) => u.id);
      const [{ data: reviewsData }, { data: assetCountsData }] =
        await Promise.all([
          supabase
            .from("user_reviews")
            .select("reviewed_user_id, rating")
            .in("reviewed_user_id", userIds),
          userIds.length > 0
            ? supabase
                .from("assets")
                .select("owner_id")
                .in("owner_id", userIds)
                .eq("is_public", true)
            : Promise.resolve({ data: [] }),
        ]);

      const reviewStats = new Map<
        string,
        { count: number; totalRating: number }
      >();
      (reviewsData || []).forEach((r: any) => {
        const s = reviewStats.get(r.reviewed_user_id) ?? {
          count: 0,
          totalRating: 0,
        };
        reviewStats.set(r.reviewed_user_id, {
          count: s.count + 1,
          totalRating: s.totalRating + r.rating,
        });
      });

      const assetCounts = new Map<string, number>();
      (assetCountsData || []).forEach((a: any) =>
        assetCounts.set(a.owner_id, (assetCounts.get(a.owner_id) ?? 0) + 1),
      );

      setUsers(
        (profilesData || []).map((u: any) => {
          const s = reviewStats.get(u.id) ?? { count: 0, totalRating: 0 };
          return {
            ...u,
            reviewCount: s.count,
            averageRating:
              s.count > 0 ? +(s.totalRating / s.count).toFixed(1) : 0,
            assetCount: assetCounts.get(u.id) ?? 0,
          };
        }),
      );

      setAssets(postsData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadConnections(uid: string) {
    const { data } = await supabase
      .from("community_connections")
      .select("*")
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);
    const map = new Map<string, any>();
    (data || []).forEach((c: any) => {
      const other = c.sender_id === uid ? c.receiver_id : c.sender_id;
      map.set(other, c);
    });
    setConnections(map);
  }

  async function loadNotifs(uid: string) {
    const [{ count: a }, { count: b }] = await Promise.all([
      supabase
        .from("community_connections")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", uid)
        .eq("status", "pending"),
      supabase
        .from("community_messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", uid)
        .eq("is_read", false),
    ]);
    setTotalNotifications((a ?? 0) + (b ?? 0));
  }

  async function handleConnect(rid: string) {
    if (!currentUser) return;
    setConnectingTo(rid);
    const { data, error } = await supabase
      .from("community_connections")
      .insert({
        sender_id: currentUser.id,
        receiver_id: rid,
        status: "pending",
      })
      .select()
      .single();
    if (!error && data)
      setConnections((p) => {
        const m = new Map(p);
        m.set(rid, data);
        return m;
      });
    setConnectingTo(null);
  }

  async function toggleFavorite(creatorId: string) {
    if (!currentUser || togglingFav) return;
    setTogglingFav(creatorId);
    const isFav = favoriteCreators.has(creatorId);
    if (isFav) {
      await supabase
        .from("creator_favorites")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("creator_id", creatorId);
      setFavoriteCreators((p) => {
        const n = new Set(p);
        n.delete(creatorId);
        return n;
      });
    } else {
      await supabase
        .from("creator_favorites")
        .insert({ user_id: currentUser.id, creator_id: creatorId });
      setFavoriteCreators((p) => {
        const n = new Set(p);
        n.add(creatorId);
        return n;
      });
    }
    setTogglingFav(null);
  }

  async function toggleLike(postId: string) {
    if (!currentUser || likingPost === postId) return;
    setLikingPost(postId);
    const isLiked = likedByMe.has(postId);
    if (isLiked) {
      await supabase
        .from("post_likes")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("post_id", postId);
      setLikedByMe((p) => {
        const n = new Set(p);
        n.delete(postId);
        return n;
      });
      setLikeCounts((p) => {
        const n = new Map(p);
        n.set(postId, Math.max(0, (n.get(postId) ?? 1) - 1));
        return n;
      });
    } else {
      await supabase
        .from("post_likes")
        .insert({ user_id: currentUser.id, post_id: postId });
      setLikedByMe((p) => {
        const n = new Set(p);
        n.add(postId);
        return n;
      });
      setLikeCounts((p) => {
        const n = new Map(p);
        n.set(postId, (n.get(postId) ?? 0) + 1);
        return n;
      });
    }
    setLikingPost(null);
  }

  async function toggleSavePost(postId: string) {
    if (!currentUser || savingPost === postId) return;
    setSavingPost(postId);
    const isSaved = savedPostIds.has(postId);
    if (isSaved) {
      await supabase
        .from("saved_items")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("item_id", postId)
        .eq("item_type", "post");
      setSavedPostIds((p) => {
        const n = new Set(p);
        n.delete(postId);
        return n;
      });
    } else {
      await supabase.from("saved_items").insert({
        user_id: currentUser.id,
        item_id: postId,
        item_type: "post",
      });
      setSavedPostIds((p) => {
        const n = new Set(p);
        n.add(postId);
        return n;
      });
    }
    setSavingPost(null);
  }

  async function enterChallenge(challengeId: string) {
    if (!currentUser || savedChallengeIds.has(challengeId)) return;
    await supabase.from("saved_items").insert({
      user_id: currentUser.id,
      item_id: challengeId,
      item_type: "challenge",
    });
    setSavedChallengeIds((p) => {
      const n = new Set(p);
      n.add(challengeId);
      return n;
    });
  }

  async function unsaveChallenge(challengeId: string) {
    if (!currentUser) return;
    await supabase
      .from("saved_items")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("item_id", challengeId)
      .eq("item_type", "challenge");
    setSavedChallengeIds((p) => {
      const n = new Set(p);
      n.delete(challengeId);
      return n;
    });
  }

  async function handleShare(postId: string, title: string) {
    try {
      const url = `${window.location.origin}/community/post/${postId}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: title || "Check this out on KAIZORA",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
      }
      if (currentUser) {
        await supabase
          .from("post_shares")
          .insert({ user_id: currentUser.id, post_id: postId });
        setShareCounts((p) => {
          const n = new Map(p);
          n.set(postId, (n.get(postId) ?? 0) + 1);
          return n;
        });
      }
    } catch (_) {
      // User cancelled share or clipboard failed
    }
  }

  async function loadPostComments(postId: string) {
    setLoadingCommentPostIds((prev) => {
      const next = new Set(prev);
      next.add(postId);
      return next;
    });
    setCommentErrors((prev) => {
      const next = new Map(prev);
      next.delete(postId);
      return next;
    });

    try {
      const { data: rawComments, error: commentsError } = await supabase
        .from("post_comments")
        .select("id, post_id, user_id, content, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });

      if (commentsError) throw commentsError;

      const comments = (rawComments || []) as RawPostComment[];
      const userIds = Array.from(
        new Set(
          comments
            .map((comment) => comment.user_id)
            .filter((id): id is string => !!id),
        ),
      );

      const profileMap = new Map<string, ProfileRow>();
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);

        (profileRows || []).forEach((profile) => {
          const row = profile as ProfileRow;
          profileMap.set(row.id, row);
        });
      }

      const normalized: PostComment[] = comments.map((comment) => ({
        ...comment,
        profile: profileMap.get(comment.user_id) ?? null,
      }));

      setCommentsByPost((prev) => {
        const next = new Map(prev);
        next.set(postId, normalized);
        return next;
      });
      setCommentCounts((prev) => {
        const next = new Map(prev);
        next.set(postId, normalized.length);
        return next;
      });
    } catch (error) {
      console.error(error);
      setCommentErrors((prev) => {
        const next = new Map(prev);
        next.set(postId, "Failed to load comments.");
        return next;
      });
    } finally {
      setLoadingCommentPostIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  }

  function toggleCommentSection(postId: string) {
    const willOpen = !openCommentPostIds.has(postId);

    setOpenCommentPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });

    if (willOpen && !commentsByPost.has(postId)) {
      void loadPostComments(postId);
    }
  }

  async function submitComment(postId: string) {
    if (!currentUser) {
      router.push("/login");
      return;
    }

    const draft = (commentDrafts.get(postId) || "").trim();
    if (!draft || submittingCommentPostId) return;

    setSubmittingCommentPostId(postId);
    setCommentErrors((prev) => {
      const next = new Map(prev);
      next.delete(postId);
      return next;
    });

    try {
      const { data: inserted, error } = await supabase
        .from("post_comments")
        .insert({
          user_id: currentUser.id,
          post_id: postId,
          content: draft,
        })
        .select("id, post_id, user_id, content, created_at")
        .single();

      if (error) throw error;

      const created = inserted as RawPostComment;
      const comment: PostComment = {
        ...created,
        profile: {
          display_name: currentUserProfile?.display_name ?? "You",
          avatar_url: currentUserProfile?.avatar_url ?? null,
        },
      };

      setCommentsByPost((prev) => {
        const next = new Map(prev);
        const existing = next.get(postId) ?? [];
        next.set(postId, [...existing, comment]);
        return next;
      });
      setCommentCounts((prev) => {
        const next = new Map(prev);
        next.set(postId, (next.get(postId) ?? 0) + 1);
        return next;
      });
      setCommentDrafts((prev) => {
        const next = new Map(prev);
        next.set(postId, "");
        return next;
      });
    } catch (error) {
      console.error(error);
      setCommentErrors((prev) => {
        const next = new Map(prev);
        next.set(postId, "Failed to post comment.");
        return next;
      });
    } finally {
      setSubmittingCommentPostId((prev) => (prev === postId ? null : prev));
    }
  }

  function openCreateModal() {
    setPostTitle("");
    setPostDescription("");
    setPostContentType("image");
    setPostPrice("free");
    setPostPriceCents("");
    setPostFile(null);
    setPostFilePreview(null);
    setPostError("");
    setEditingPost(null);
    setEntryChallenge(null);
    setShowCreateModal(true);
  }

  // Open the create modal in "challenge entry" mode. Locks the content type to
  // the challenge's accepted type (unless 'any') and tags the post on submit.
  async function selectChallenge(ch: any) {
    setSelectedChallenge(ch);
    setEntriesLoading(true);
    const { data: entries } = await supabase
      .from("challenge_entries")
      .select("id, title, description, content_type, storage_path, thumbnail_path, user_id, created_at")
      .eq("challenge_id", ch.id)
      .order("created_at", { ascending: false });

    // Fetch profiles separately.
    const userIds = Array.from(new Set((entries || []).map((e: any) => e.user_id)));
    const profileMap = new Map<string, any>();
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);
      (profiles || []).forEach((p: any) => profileMap.set(p.id, p));
    }
    let entriesWithProfiles = (entries || []).map((e: any) => ({
      ...e,
      profiles: profileMap.get(e.user_id) ?? null,
    }));
    // Winner's entry first when a winner has been chosen.
    if (ch.winner_user_id) {
      entriesWithProfiles = [
        ...entriesWithProfiles.filter((e: any) => e.user_id === ch.winner_user_id),
        ...entriesWithProfiles.filter((e: any) => e.user_id !== ch.winner_user_id),
      ];
    }

    // Check if current user has submitted an entry.
    if (currentUser) {
      const ids = new Set(entriesWithProfiles.filter((e: any) => e.user_id === currentUser.id).map((e: any) => e.id as string));
      setUserEntryIds(ids);
    }
    setChallengeEntries(entriesWithProfiles);
    setEntriesLoading(false);
  }

  function openChallengeEntry(ch: any) {
    const locked =
      ch.content_type && ch.content_type !== "any"
        ? ch.content_type
        : "image";
    setPostTitle("");
    setPostDescription("");
    setPostContentType(locked);
    setPostPrice("free");
    setPostPriceCents("");
    setPostFile(null);
    setPostFilePreview(null);
    setPostError("");
    setEditingPost(null);
    setEntryChallenge(ch);
    setShowCreateModal(true);
  }

  function openEditModal(post: any) {
    setEditingPost(post);
    setPostTitle(post.title || "");
    setPostDescription(post.description || "");
    setPostContentType(post.content_type || "image");
    setPostPrice(post.price_cents > 0 ? "paid" : "free");
    setPostPriceCents(
      post.price_cents > 0 ? (post.price_cents / 100).toFixed(2) : "",
    );
    setPostFile(null);
    setPostFilePreview(
      post.content_type === "image"
        ? storageUrl(post.thumbnail_path || post.storage_path)
        : null,
    );
    setPostError("");
    setShowCreateModal(true);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPostFile(f);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPostFilePreview(url);
    } else {
      setPostFilePreview(null);
    }
    const detectedType = detectPulsePostContentType(f);
    if (detectedType) setPostContentType(detectedType);
  }

  async function handleCreatePost() {
    if (!currentUser) return;
    if (!postTitle.trim()) {
      setPostError("Title is required");
      return;
    }
    setPostUploading(true);
    setPostError("");
    try {
      let storagePath: string | null = editingPost?.storage_path ?? null;
      let thumbnailPath: string | null = editingPost?.thumbnail_path ?? null;
      let replacedStoragePath: string | null = null;
      let replacedThumbnailPath: string | null = null;

      // Challenge entries go to the dedicated bucket; regular posts use "posts".
      const bucket = entryChallenge ? "challenge-entries" : "posts";

      if (postFile) {
        const ext = postFile.name.split(".").pop();
        const path = `${currentUser.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(path, postFile, { upsert: false });
        if (uploadErr) throw uploadErr;
        replacedStoragePath = editingPost?.storage_path ?? null;
        replacedThumbnailPath = editingPost?.thumbnail_path ?? null;
        storagePath = path;
        thumbnailPath = postFile.type.startsWith("image/") ? path : null;
      }

      const priceCents =
        postPrice === "paid"
          ? Math.round(parseFloat(postPriceCents || "0") * 100)
          : 0;

      if (editingPost) {
        const { data: updatedPost, error: updateErr } = await supabase
          .from("posts")
          .update({
            title: postTitle.trim(),
            description: postDescription.trim() || null,
            content_type: postContentType,
            storage_path: storagePath,
            thumbnail_path: thumbnailPath,
            price_cents: priceCents,
          })
          .eq("id", editingPost.id)
          .eq("user_id", currentUser.id)
          .select(
            "id, title, description, content_type, created_at, thumbnail_path, storage_path, price_cents, user_id",
          )
          .single();

        if (updateErr) throw updateErr;

        const postWithProfile = {
          ...updatedPost,
          profiles: editingPost.profiles || {
            display_name: currentUserProfile?.display_name,
            avatar_url: currentUserProfile?.avatar_url,
          },
        };

        setAssets((prev) =>
          prev.map((item) =>
            item.id === editingPost.id ? postWithProfile : item,
          ),
        );

        if (postFile) {
          const filesToRemove = Array.from(
            new Set(
              [replacedStoragePath, replacedThumbnailPath].filter(
                (value): value is string => !!value && value !== storagePath,
              ),
            ),
          );
          if (filesToRemove.length > 0) {
            await supabase.storage.from("posts").remove(filesToRemove);
          }
        }

        // Re-run AI moderation on edit — the title, description, or file may
        // have changed and could now violate policy. Fire-and-forget.
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token && updatedPost?.id) {
            fetch("/api/posts/moderate", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ post_id: updatedPost.id }),
            })
              .then(async (response) => {
                if (!response.ok) throw new Error("Post re-moderation failed");
                const moderation = await response.json();
                if (!moderation?.safe && updatedPost.id) {
                  removePostFromFeed(updatedPost.id);
                }
              })
              .catch((err) =>
                console.error("Post re-moderation trigger failed:", err),
              );
          }
        } catch {
          // ignore — moderation is best-effort
        }
      } else if (entryChallenge) {
        // ── Challenge entry → separate table + bucket ──────────────────
        const { error: insertErr } = await supabase
          .from("challenge_entries")
          .insert({
            challenge_id: entryChallenge.id,
            user_id: currentUser.id,
            title: postTitle.trim(),
            description: postDescription.trim() || null,
            content_type: postContentType,
            storage_path: storagePath,
            thumbnail_path: thumbnailPath,
          });

        if (insertErr) throw insertErr;

        // Bump entries counter on the challenge.
        await supabase
          .from("challenges")
          .update({ entries_count: (entryChallenge.entries_count || 0) + 1 })
          .eq("id", entryChallenge.id);

        // Mark this challenge as entered (global).
        setEnteredChallengeIds((prev) => new Set(prev).add(entryChallenge.id));

        // Refresh entries list if this challenge is selected.
        if (selectedChallenge?.id === entryChallenge.id) {
          selectChallenge(entryChallenge);
        }

      } else {
        // ── Regular public Pulse post ───────────────────────────────────
        const { data: newPost, error: insertErr } = await supabase
          .from("posts")
          .insert({
            user_id: currentUser.id,
            title: postTitle.trim(),
            description: postDescription.trim() || null,
            content_type: postContentType,
            storage_path: storagePath,
            thumbnail_path: thumbnailPath,
            price_cents: priceCents,
            is_public: true,
          })
          .select(
            "id, title, description, content_type, created_at, thumbnail_path, storage_path, price_cents, user_id",
          )
          .single();

        if (insertErr) throw insertErr;

        const postWithProfile = {
          ...newPost,
          profiles: {
            display_name: currentUserProfile?.display_name,
            avatar_url: currentUserProfile?.avatar_url,
          },
        };
        setAssets((p) => [postWithProfile, ...p]);

        // Fire-and-forget AI moderation scan.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token && newPost?.id) {
            fetch("/api/posts/moderate", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ post_id: newPost.id }),
            })
              .then(async (response) => {
                if (!response.ok) throw new Error("Post moderation failed");
                const moderation = await response.json();
                if (!moderation?.safe && newPost.id) {
                  removePostFromFeed(newPost.id);
                }
              })
              .catch(() => {});
          }
        } catch { /* ignore */ }
      }
      setShowCreateModal(false);
      setEditingPost(null);
      setEntryChallenge(null);
      setPostFile(null);
      setPostFilePreview(null);
    } catch (e: any) {
      setPostError(
        e.message || `Failed to ${editingPost ? "update" : "create"} post`,
      );
    } finally {
      setPostUploading(false);
    }
  }

  async function deletePost(post: any) {
    if (
      !currentUser ||
      currentUser.id !== post.user_id ||
      deletingPostId === post.id
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${post.title || "this post"}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingPostId(post.id);
    try {
      const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", post.id)
        .eq("user_id", currentUser.id);

      if (error) throw error;

      const filesToRemove = Array.from(
        new Set(
          [post.storage_path, post.thumbnail_path].filter(
            (value): value is string => !!value,
          ),
        ),
      );
      if (filesToRemove.length > 0) {
        await supabase.storage.from("posts").remove(filesToRemove);
      }

      removePostFromFeed(post.id);
      if (editingPost?.id === post.id) {
        setEditingPost(null);
        setShowCreateModal(false);
      }
    } catch (e: any) {
      setPostError(e.message || "Failed to delete post");
    } finally {
      setDeletingPostId(null);
    }
  }

  function connStatus(uid: string) {
    return connections.get(uid)?.status ?? "none";
  }
  function connDisabled(uid: string) {
    const s = connStatus(uid);
    return s === "pending" || s === "accepted" || connectingTo === uid;
  }
  function followLabel(uid: string) {
    const s = connStatus(uid);
    return s === "accepted"
      ? "Following"
      : s === "pending"
        ? "Requested"
        : "Follow";
  }

  function storageUrl(p?: string) {
    return p
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/posts/${p}`
      : null;
  }
  function entriesStorageUrl(p?: string | null) {
    return p
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/challenge-entries/${p}`
      : null;
  }
  function fmtChallengeDate(value?: string | null) {
    if (!value) return "soon";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "soon";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}-${d.getFullYear()}`;
  }

  // Always derive status live from start_at/deadline so it never gets
  // stale even if the admin hasn't re-saved the challenge after the date passes.
  function liveStatus(ch: any): "upcoming" | "active" | "ended" {
    const now = Date.now();
    const start = ch.start_at ? new Date(ch.start_at).getTime() : null;
    const end = ch.deadline ? new Date(ch.deadline).getTime() : null;
    if (start && now < start) return "upcoming";
    if (end && now > end) return "ended";
    return "active";
  }
  function timeAgo(d: string) {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }
  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const trendingTags = useMemo(() => {
    const m = new Map<string, number>();
    assets.forEach((a) => {
      if (a.content_type)
        m.set(a.content_type, (m.get(a.content_type) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [assets]);

  const filteredFeedAssets = useMemo(() => {
    let r = [...assets];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.profiles?.display_name?.toLowerCase().includes(q),
      );
    }
    if (activeCategory !== "All") {
      const categoryKey = activeCategory.toLowerCase();
      r = r.filter((a) => (a.content_type || "").toLowerCase() === categoryKey);
    }
    if (priceFilter === "free")
      r = r.filter((a) => !a.price_cents || a.price_cents === 0);
    if (priceFilter === "paid") r = r.filter((a) => a.price_cents > 0);
    if (sortBy === "oldest") {
      r.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    } else {
      r.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return r;
  }, [assets, searchQuery, activeCategory, priceFilter, sortBy]);

  const paginatedFeed = useMemo(
    () => filteredFeedAssets.slice(0, assetPage * ASSETS_PER_PAGE),
    [filteredFeedAssets, assetPage],
  );
  const hasMoreFeedAssets = paginatedFeed.length < filteredFeedAssets.length;

  const filteredCreators = useMemo(() => {
    let r = [...users];
    if (creatorSearch.trim()) {
      const q = creatorSearch.toLowerCase();
      r = r.filter(
        (u) =>
          u.display_name?.toLowerCase().includes(q) ||
          u.bio?.toLowerCase().includes(q),
      );
    }
    if (creatorSort === "New")
      r = r.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    else if (creatorSort === "Most Followed")
      r = r.sort((a, b) => (b.assetCount ?? 0) - (a.assetCount ?? 0));
    else if (creatorSort === "Most Remixed")
      r = r.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    else r = r.sort((a, b) => (b.assetCount ?? 0) - (a.assetCount ?? 0));
    return r;
  }, [users, creatorSearch, creatorSort]);
  const paginatedCreators = useMemo(
    () => filteredCreators.slice(0, creatorPage * ASSETS_PER_PAGE),
    [filteredCreators, creatorPage],
  );
  const hasMoreCreators = paginatedCreators.length < filteredCreators.length;

  const paginatedSignals = useMemo(
    () => signals.slice(0, signalsPage * ASSETS_PER_PAGE),
    [signals, signalsPage],
  );
  const hasMoreSignals = paginatedSignals.length < signals.length;

  const paginatedChallengeEntries = useMemo(
    () => challengeEntries.slice(0, challengeEntriesPage * ASSETS_PER_PAGE),
    [challengeEntries, challengeEntriesPage],
  );
  const hasMoreChallengeEntries =
    paginatedChallengeEntries.length < challengeEntries.length;

  const savedPostAssets = useMemo(
    () => assets.filter((a) => savedPostIds.has(a.id)),
    [assets, savedPostIds],
  );
  const savedChallengeList = useMemo(
    () => challenges.filter((c) => savedChallengeIds.has(c.id)),
    [challenges, savedChallengeIds],
  );
  const savedCreatorList = useMemo(
    () => users.filter((u) => favoriteCreators.has(u.id)),
    [users, favoriteCreators],
  );
  const paginatedSavedPosts = useMemo(
    () => savedPostAssets.slice(0, savedPage * ASSETS_PER_PAGE),
    [savedPostAssets, savedPage],
  );
  const hasMoreSavedPosts = paginatedSavedPosts.length < savedPostAssets.length;
  const paginatedSavedChallenges = useMemo(
    () => savedChallengeList.slice(0, savedPage * ASSETS_PER_PAGE),
    [savedChallengeList, savedPage],
  );
  const hasMoreSavedChallenges =
    paginatedSavedChallenges.length < savedChallengeList.length;
  const paginatedSavedCreators = useMemo(
    () => savedCreatorList.slice(0, savedPage * ASSETS_PER_PAGE),
    [savedCreatorList, savedPage],
  );
  const hasMoreSavedCreators =
    paginatedSavedCreators.length < savedCreatorList.length;

  const activeFilterCount = [
    priceFilter !== "all",
    sortBy !== "newest",
    activeCategory !== "All",
  ].filter(Boolean).length;
  const featuredCreators = useMemo(
    () =>
      [...users]
        .sort((a, b) => (b.assetCount ?? 0) - (a.assetCount ?? 0))
        .slice(0, 5),
    [users],
  );

  const latestChallengeUpdateAt = useMemo(
    () =>
      (challenges || []).reduce((latest: number, challenge: any) => {
        const timestamp = Date.parse(challenge?.created_at || "");
        return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp);
      }, 0),
    [challenges],
  );

  const latestSignalUpdateAt = useMemo(
    () =>
      (signals || []).reduce((latest: number, signal: any) => {
        const timestamp = Date.parse(signal?.created_at || "");
        return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp);
      }, 0),
    [signals],
  );

  const showChallengesDot =
    challenges.length > 0 &&
    latestChallengeUpdateAt > (tabSeenAt.challenges ?? 0);
  const showSignalsDot =
    signals.length > 0 && latestSignalUpdateAt > (tabSeenAt.signals ?? 0);

  useEffect(() => {
    if (activeTab !== "challenges") return;
    if (latestChallengeUpdateAt === 0) return;

    setTabSeenAt((prev) => {
      if ((prev.challenges ?? 0) >= latestChallengeUpdateAt) return prev;

      const next = { ...prev, challenges: Date.now() };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TAB_SEEN_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [activeTab, latestChallengeUpdateAt]);

  useEffect(() => {
    if (activeTab !== "signals") return;
    if (latestSignalUpdateAt === 0) return;

    setTabSeenAt((prev) => {
      if ((prev.signals ?? 0) >= latestSignalUpdateAt) return prev;

      const next = { ...prev, signals: Date.now() };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(TAB_SEEN_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [activeTab, latestSignalUpdateAt]);

  const TABS = [
    { key: "pulse", label: "Pulse", icon: Activity },
    { key: "challenges", label: "Challenges", icon: Trophy },
    { key: "signals", label: "Signals", icon: Megaphone },
    { key: "creators", label: "Creators", icon: Users },
    { key: "saved", label: "Saved", icon: Bookmark },
  ] as const;

  const renderLoadMoreControls = (
    shown: number,
    total: number,
    hasMore: boolean,
    onMore: () => void,
    onReset: () => void,
  ) => {
    if (total <= ASSETS_PER_PAGE) return null;

    return (
      <div className="flex flex-col items-center justify-center gap-3 pt-2">
        <span className="text-[12px] text-gray-600 px-2">
          Showing {shown} of {total}
        </span>
        {hasMore ? (
          <button
            onClick={onMore}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/[0.08] text-[12px] text-gray-300 hover:text-white hover:border-white/[0.2] transition-all"
          >
            Load more
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/[0.08] text-[12px] text-gray-400 hover:text-white hover:border-white/[0.2] transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back to top results
          </button>
        )}
      </div>
    );
  };

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="min-h-screen bg-[#070707] text-white">
        {/* shimmer keyframe injected inline */}
        <style>{`
          @keyframes shimmer {
            0% { background-position: -600px 0; }
            100% { background-position: 600px 0; }
          }
          .sk {
            background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%);
            background-size: 600px 100%;
            animation: shimmer 1.6s infinite linear;
            border-radius: 12px;
          }
        `}</style>

        {/* Topbar placeholder */}
        <div className="sticky top-17 z-40 bg-[#070707]/97 backdrop-blur-xl border-b border-white/[0.05]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-12 gap-4">
              <div className="sk h-4 w-16 rounded-lg" />
              <div className="sk h-4 w-20 rounded-lg" />
              <div className="sk h-4 w-16 rounded-lg" />
              <div className="sk h-4 w-20 rounded-lg" />
              <div className="sk h-4 w-14 rounded-lg" />
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
          {/* Left sidebar */}
          <div className="hidden lg:block w-[196px] flex-shrink-0">
            <div className="rounded-2xl bg-[#0e0e0e] border border-white/[0.06] p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="sk h-8 w-full" />
              ))}
            </div>
          </div>

          {/* Feed */}
          <div className="flex-1 space-y-4">
            {/* Search bar */}
            <div className="sk h-10 w-full" />

            {/* Post cards */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-[#0f0f0f] border border-white/[0.05] overflow-hidden">
                {/* Author row */}
                <div className="p-4 flex items-center gap-3">
                  <div className="sk w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="sk h-3 w-32" />
                    <div className="sk h-2.5 w-20" />
                  </div>
                </div>
                {/* Media */}
                <div className="sk mx-4 mb-4 rounded-xl" style={{ height: i === 0 ? 280 : 220 }} />
                {/* Actions */}
                <div className="px-4 pb-4 flex gap-3">
                  <div className="sk h-7 w-16" />
                  <div className="sk h-7 w-16" />
                  <div className="sk h-7 w-16" />
                </div>
              </div>
            ))}
          </div>

          {/* Right sidebar */}
          <div className="hidden xl:block w-60 flex-shrink-0 space-y-4">
            <div className="rounded-2xl bg-[#0e0e0e] border border-white/[0.06] p-4 space-y-3">
              <div className="sk h-3 w-24" />
              <div className="sk h-24 w-full" />
              <div className="sk h-3 w-32" />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="sk h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    );

  // ── Sidebar (Pulse tab only) ───────────────────────────────────────────────────
  const PulseSidebar = () => (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
        <input
          type="text"
          placeholder="Search Pulse…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 hover:border-white/[0.13] transition-all"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3" />
          Filters
        </p>
        {activeFilterCount > 0 && (
          <button
            onClick={() => {
              setActiveCategory("All");
              setPriceFilter("all");
              setSortBy("newest");
            }}
            className="flex items-center gap-1 text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full"
          >
            <X className="w-2.5 h-2.5" />
            Clear {activeFilterCount}
          </button>
        )}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 mb-2">
          Category
        </p>
        <div className="space-y-0.5">
          {["All", "Image", "Video", "Audio", "Code", "Text"].map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`w-full text-left px-3 py-2 text-[12.5px] rounded-lg transition-all ${activeCategory === cat ? "bg-red-500/10 text-red-300 border-l-2 border-red-500 pl-2.5" : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border-l-2 border-transparent"}`}
              >
                {cat}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="h-px bg-white/[0.05]" />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 mb-2">
          Sort By
        </p>
        <div className="space-y-0.5">
          {[
            ["newest", "Latest"],
            ["oldest", "Oldest"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setSortBy(v as any)}
              className={`w-full text-left px-3 py-2 text-[12.5px] rounded-lg transition-all ${sortBy === v ? "bg-red-500/10 text-red-300 border-l-2 border-red-500 pl-2.5" : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] border-l-2 border-transparent"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Post card helper ───────────────────────────────────────────────────────
  function renderPostCard({
    asset,
    showUnsave = false,
  }: {
    asset: any;
    showUnsave?: boolean;
  }) {
    const owner = asset.profiles;
    const isOwner = currentUser?.id === asset.user_id;
    const isPaid = asset.price_cents > 0;
    const isLiked = likedByMe.has(asset.id);
    const isSaved = savedPostIds.has(asset.id);
    const initials = (owner?.display_name || "C").slice(0, 2).toUpperCase();
    const likeCount = likeCounts.get(asset.id) ?? 0;
    const commentCount = commentCounts.get(asset.id) ?? 0;
    const shareCount = shareCounts.get(asset.id) ?? 0;
    const isCommentOpen = openCommentPostIds.has(asset.id);
    const comments = commentsByPost.get(asset.id) ?? [];
    const commentDraft = commentDrafts.get(asset.id) ?? "";
    const commentError = commentErrors.get(asset.id) ?? "";
    const commentsLoading = loadingCommentPostIds.has(asset.id);
    const isSubmittingComment = submittingCommentPostId === asset.id;

    const openPost = () => router.push(`/community/post/${asset.id}`);

    return (
      <article
        key={asset.id}
        className="group rounded-2xl bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.12] hover:shadow-xl hover:shadow-black/50 transition-all duration-300 overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          {owner?.avatar_url ? (
            <img
              src={owner.avatar_url}
              alt={owner.display_name}
              className="w-9 h-9 rounded-full object-cover border border-white/[0.1] cursor-pointer hover:border-red-500/40 transition-colors"
              onClick={() => router.push(`/community/profile/${asset.user_id}`)}
            />
          ) : (
            <button
              onClick={() => router.push(`/community/profile/${asset.user_id}`)}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500/30 to-rose-600/30 border border-white/[0.1] flex items-center justify-center flex-shrink-0"
            >
              <span className="text-[11px] font-bold text-red-300">
                {initials}
              </span>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <button
              onClick={() => router.push(`/community/profile/${asset.user_id}`)}
              className="text-[13px] font-semibold text-white hover:text-red-400 transition-colors"
            >
              {owner?.display_name || "Creator"}
            </button>
            <span className="text-gray-700 text-[10px] mx-1.5">·</span>
            <span className="text-[11px] text-gray-600">
              {timeAgo(asset.created_at)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={() => openEditModal(asset)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/[0.08] text-[10px] font-medium text-gray-400 hover:text-white hover:border-white/[0.14] transition-all"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deletePost(asset)}
                  disabled={deletingPostId === asset.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-500/18 text-[10px] font-medium text-red-300 hover:bg-red-500/10 hover:border-red-500/28 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  {deletingPostId === asset.id ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
            <span className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[10px] text-gray-500 capitalize font-medium">
              {asset.content_type || "post"}
            </span>
            {isPaid && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-semibold">
                ${(asset.price_cents / 100).toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <div>
          {(asset.title || asset.description) && (
            <div className="px-4 pb-3">
              {asset.title && (
                <button
                  type="button"
                  onClick={openPost}
                  className="mb-1 block line-clamp-1 text-left text-[13.5px] font-semibold text-white transition-colors hover:text-red-400"
                >
                  {asset.title}
                </button>
              )}
              {asset.description && (
                <button
                  type="button"
                  onClick={openPost}
                  className="block line-clamp-2 text-left text-[12px] leading-relaxed text-gray-600"
                >
                  {asset.description}
                </button>
              )}
            </div>
          )}
          <PulsePostMedia
            asset={asset}
            storageUrl={storageUrl}
            onOpenPost={openPost}
          />
        </div>
        <div className="flex items-center gap-1 px-4 py-3 border-t border-white/[0.05]">
          <ActionBtn
            onClick={() => toggleLike(asset.id)}
            active={isLiked}
            activeClass="bg-red-500/10 text-red-400"
            hoverClass="hover:text-red-400 hover:bg-red-500/[0.07]"
          >
            <Heart className={`w-3.5 h-3.5 ${isLiked ? "fill-red-400" : ""}`} />
            <span>{likeCount}</span>
          </ActionBtn>
          <ActionBtn
            onClick={() => toggleCommentSection(asset.id)}
            active={isCommentOpen}
            activeClass="bg-sky-500/10 text-sky-400"
            hoverClass="hover:text-sky-400 hover:bg-sky-500/[0.07]"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>{commentCount}</span>
          </ActionBtn>
          <ActionBtn hoverClass="hover:text-gray-300 hover:bg-white/[0.06]">
            <Repeat2 className="w-3.5 h-3.5" />
          </ActionBtn>
          <ActionBtn
            onClick={() => handleShare(asset.id, asset.title)}
            hoverClass="hover:text-gray-300 hover:bg-white/[0.06]"
          >
            <Share2 className="w-3.5 h-3.5" />
            {shareCount > 0 && <span>{shareCount}</span>}
          </ActionBtn>
          <ActionBtn
            onClick={() => toggleSavePost(asset.id)}
            active={isSaved}
            activeClass="bg-amber-500/10 text-amber-400"
            hoverClass="hover:text-amber-400 hover:bg-amber-500/[0.07]"
            className="ml-auto"
          >
            <Bookmark
              className={`w-3.5 h-3.5 ${isSaved ? "fill-amber-400" : ""}`}
            />
          </ActionBtn>
        </div>
        {isCommentOpen && (
          <div className="px-4 pb-4 border-t border-white/[0.05] bg-black/[0.15]">
            <div className="pt-3 space-y-3">
              {commentsLoading ? (
                <p className="text-[11px] text-gray-500">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-[11px] text-gray-500">
                  No comments yet. Start the conversation.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {comments.map((comment) => {
                    const commentName =
                      comment.profile?.display_name || "Creator";
                    const commentAvatar = comment.profile?.avatar_url;

                    return (
                      <div
                        key={comment.id}
                        className="flex items-start gap-2.5"
                      >
                        {commentAvatar ? (
                          <img
                            src={commentAvatar}
                            alt={commentName}
                            className="w-7 h-7 rounded-full object-cover border border-white/[0.1]"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-red-500/20 border border-red-500/30 text-[10px] font-semibold text-red-300 flex items-center justify-center">
                            {(commentName || "C").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[11px] text-gray-300 mb-0.5">
                            <span className="font-semibold text-white">
                              {commentName}
                            </span>
                            <span className="text-gray-700 mx-1">·</span>
                            <span className="text-gray-600">
                              {timeAgo(comment.created_at)}
                            </span>
                          </p>
                          <p className="text-[12px] text-gray-400 leading-relaxed whitespace-pre-wrap">
                            {comment.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {commentError && (
                <p className="text-[11px] text-red-400">{commentError}</p>
              )}

              {currentUser ? (
                <div className="flex items-end gap-2">
                  <textarea
                    value={commentDraft}
                    onChange={(e) =>
                      setCommentDrafts((prev) => {
                        const next = new Map(prev);
                        next.set(asset.id, e.target.value);
                        return next;
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitComment(asset.id);
                      }
                    }}
                    rows={2}
                    placeholder="Write a comment..."
                    className="flex-1 resize-none rounded-xl bg-white/[0.04] border border-white/[0.1] text-[12px] text-white placeholder:text-gray-600 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-red-500/40"
                  />
                  <button
                    onClick={() => void submitComment(asset.id)}
                    disabled={isSubmittingComment || !commentDraft.trim()}
                    className="px-3.5 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-[12px] text-red-300 font-medium hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSubmittingComment ? "Posting..." : "Post"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => router.push("/login")}
                  className="text-[12px] text-red-300 hover:text-red-200 transition-colors"
                >
                  Sign in to comment
                </button>
              )}
            </div>
          </div>
        )}
      </article>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#070707] text-white">
      {/* ══ TOPBAR ══════════════════════════════════════════════════════ */}
      <div className="sticky top-17 z-40 bg-[#070707]/97 backdrop-blur-xl border-b border-white/[0.05]">
        {/* Brand row — Pulse tab only */}
        {activeTab === "pulse" && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-12 gap-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Activity className="w-4 h-4 text-red-500" />
                <span className="text-[15px] font-bold tracking-tight">
                  Pulse
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              </div>
              <div className="flex items-center gap-2.5 ml-auto">
                {totalNotifications > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    {totalNotifications}
                  </span>
                )}
                {currentUser && (
                  <button
                    onClick={() =>
                      router.push(`/community/profile/${currentUser.id}`)
                    }
                  >
                    <img
                      src={
                        currentUserProfile?.avatar_url ||
                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.id}`
                      }
                      alt="me"
                      className="w-7 h-7 rounded-full object-cover border border-white/[0.1] hover:border-red-500/40 transition-colors"
                    />
                  </button>
                )}
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-gray-400 hover:text-white transition-all"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => openCreateModal()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[12px] font-semibold hover:from-red-400 hover:to-red-500 transition-all shadow-md shadow-red-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Create Post</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Tab nav row — always visible, scrollable on mobile */}
        <div className="border-t border-white/[0.04]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
              {TABS.map(({ key, label, icon: Icon }) => {
                const showUpdateDot =
                  (key === "challenges" && showChallengesDot) ||
                  (key === "signals" && showSignalsDot);

                return (
                  <button
                    key={key}
                    onClick={() => changeTab(key as any)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-[12px] font-medium whitespace-nowrap transition-all duration-150 border-b-2 flex-shrink-0 ${
                      activeTab === key
                        ? "border-red-500 text-white"
                        : "border-transparent text-gray-500 hover:text-gray-300 hover:border-white/[0.15]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {showUpdateDot && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* ══ PAGE HEADER — only on Pulse tab ════════════════════════════ */}
      {activeTab === "pulse" && (
        <div className="relative border-b border-white/[0.04] overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-red-600/[0.04] rounded-full blur-[110px]" />
            <div
              className="absolute inset-0 opacity-[0.015]"
              style={{
                backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-red-400/80 flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3 h-3" />
                AI-Native Creative Feed
              </p>
              <p className="text-gray-500 text-sm max-w-md">
                The live feed for AI-native creators to post, get signal, compete,
                and grow.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-600 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-red-500/50" />
                <span className="text-gray-400 font-semibold">
                  {users.length}
                </span>{" "}
                creators
              </div>
              <div className="w-px h-3 bg-white/[0.08]" />
              <div className="flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-red-500/50" />
                <span className="text-gray-400 font-semibold">
                  {assets.length}
                </span>{" "}
                posts
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ BODY ═════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ── PULSE TAB ─────────────────────────────────────────────── */}
        {activeTab === "pulse" && (
          <div className="flex gap-6">
            {/* Left sidebar */}
            <aside className="hidden lg:flex flex-col w-[196px] xl:w-[210px] flex-shrink-0">
              <div className="sticky top-[96px] bg-[#0e0e0e] rounded-2xl border border-white/[0.06] p-5 shadow-xl shadow-black/30">
                <PulseSidebar />
              </div>
            </aside>

            {/* Feed */}
            <main className="flex-1 min-w-0 space-y-4">
              {/* Compose bar */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.1] transition-all">
                <img
                  src={
                    currentUserProfile?.avatar_url ||
                    `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser?.id ?? "anon"}`
                  }
                  alt="you"
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-white/[0.1]"
                />
                <button
                  onClick={() => openCreateModal()}
                  className="flex-1 text-left text-[13px] text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Share something with the community...
                </button>
                <button
                  onClick={() => openCreateModal()}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[12px] font-medium hover:bg-red-500/15 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  Post
                </button>
              </div>

              <p className="text-[12px] text-gray-600">
                <span className="text-gray-400 font-medium">
                  {filteredFeedAssets.length}
                </span>{" "}
                posts
              </p>

              {paginatedFeed.length === 0 ? (
                <EmptyPane
                  icon={Radio}
                  title="No posts yet"
                  sub="Be the first to share something with the community"
                />
              ) : (
                <div className="space-y-4">
                  {paginatedFeed.map((asset) => renderPostCard({ asset }))}
                </div>
              )}

              {renderLoadMoreControls(
                paginatedFeed.length,
                filteredFeedAssets.length,
                hasMoreFeedAssets,
                () => setAssetPage((p) => p + 1),
                () => setAssetPage(1),
              )}
            </main>

            {/* Right sidebar */}
            <aside className="hidden xl:flex flex-col w-60 flex-shrink-0 space-y-4">
              {/* Live challenge card — only when challenges exist */}
              {challenges.length > 0 && (
                <div className="relative rounded-2xl overflow-hidden border border-red-500/20 bg-gradient-to-br from-red-950/50 via-[#0f0a0a] to-[#0a0a0a] p-4">
                  <div className="absolute top-0 right-0 w-28 h-28 bg-red-500/[0.07] rounded-full -translate-x-4 -translate-y-4 blur-xl" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                        Live Challenge
                      </span>
                    </div>
                    <h4 className="text-[14px] font-bold text-white mb-1">
                      {challenges[0]?.title}
                    </h4>
                    <p className="text-[11.5px] text-gray-500 leading-relaxed mb-3 line-clamp-3">
                      {challenges[0]?.description}
                    </p>
                    {liveStatus(challenges[0]) !== "upcoming" &&
                      (savedChallengeIds.has(challenges[0]?.id) ? (
                        <div className="w-full py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[12px] font-semibold text-center">
                          Entered ✓
                        </div>
                      ) : (
                        <button
                          onClick={() => changeTab("challenges")}
                          className="w-full py-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[12px] font-semibold hover:from-red-400 hover:to-red-500 transition-all shadow-md shadow-red-600/20"
                        >
                          Enter Challenge
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-[#0e0e0e] border border-white/[0.06] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Award className="w-3 h-3 text-red-500/60" />
                    Top Creators
                  </h4>
                  <button
                    onClick={() => changeTab("creators")}
                    className="text-[10px] text-gray-600 hover:text-red-400 flex items-center gap-0.5 transition-colors"
                  >
                    All
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-2">
                  {featuredCreators.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.1] transition-all cursor-pointer group"
                      onClick={() => router.push(`/community/profile/${c.id}`)}
                      onMouseEnter={() => {
                        if (hoverTimerRef.current)
                          clearTimeout(hoverTimerRef.current);
                        hoverTimerRef.current = setTimeout(
                          () => setFocusedUser(c),
                          800,
                        );
                      }}
                      onMouseLeave={() => {
                        if (hoverTimerRef.current)
                          clearTimeout(hoverTimerRef.current);
                      }}
                    >
                      {c.avatar_url ? (
                        <img
                          src={c.avatar_url}
                          alt={c.display_name}
                          className="w-8 h-8 rounded-full object-cover border border-white/[0.08]"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500/25 to-rose-600/25 border border-white/[0.08] flex items-center justify-center">
                          <span className="text-[9px] font-bold text-red-300">
                            {(c.display_name || "C").slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-white group-hover:text-red-400 transition-colors truncate">
                          {c.display_name || "Creator"}
                        </p>
                        <p className="text-[10px] text-gray-700">
                          {c.assetCount ?? 0} assets
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {trendingTags.length > 0 && (
                <div className="rounded-2xl bg-[#0e0e0e] border border-white/[0.06] p-4">
                  <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                    <TrendingUp className="w-3 h-3 text-red-500/60" />
                    Trending
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {trendingTags.map(([tag, count]) => (
                      <button
                        key={tag}
                        onClick={() => {
                          setActiveCategory(tag.charAt(0).toUpperCase() + tag.slice(1));
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/[0.07] text-gray-500 hover:border-red-500/25 hover:text-red-300 hover:bg-red-500/[0.07] capitalize transition-all"
                      >
                        {tag}
                        <span className="text-[9px] text-gray-700">
                          {count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ── CHALLENGES TAB ──────────────────────────────────────────── */}
        {activeTab === "challenges" && (
          <div className="max-w-7xl mx-auto">
            {challenges.length === 0 ? (
              <EmptyPane icon={Trophy} title="No active or upcoming challenges" sub="Check back soon for new challenges" />
            ) : (
              <div className="flex gap-5">
                {/* ── Left: entries feed ── */}
                <div className="flex-1 min-w-0">
                  {!selectedChallenge ? (
                    (() => {
                      // Featured = first LIVE (not ended) challenge the user has NOT entered yet.
                      const featured = challenges.find(
                        (c) => liveStatus(c) !== "ended" && !enteredChallengeIds.has(c.id),
                      );
                      if (!featured) {
                        return (
                          <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-white/[0.05] border-dashed">
                            <Trophy className="w-8 h-8 text-gray-700 mb-3" />
                            <p className="text-gray-500 text-sm">No open challenges right now</p>
                            <p className="text-gray-600 text-xs mt-1">Check "Results Out" or pick one from the list</p>
                          </div>
                        );
                      }
                      return (
                        <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0f0f0f]">
                          <div className="relative p-6 sm:p-8">
                            <div className="absolute inset-0 bg-gradient-to-br from-red-950/30 via-transparent to-transparent pointer-events-none" />
                            <div className="relative">
                              <div className="flex items-center gap-2 mb-4 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-semibold">
                                  <Trophy className="w-3 h-3" />
                                  Challenge
                                </span>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${liveStatus(featured) === "active" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : liveStatus(featured) === "upcoming" ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400" : "bg-gray-500/10 border border-gray-500/20 text-gray-500"}`}>
                                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
                                  {liveStatus(featured)}
                                </span>
                              </div>
                              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{featured.title}</h2>
                              {featured.description && (
                                <p className="text-[13px] text-gray-500 mb-5 max-w-lg">{featured.description}</p>
                              )}

                              {/* Deadline countdown */}
                              {featured.deadline && (
                                <div className="flex items-center gap-2 mb-6">
                                  <Clock className="w-3.5 h-3.5 text-gray-600" />
                                  <span className="text-[12px] text-gray-500 mr-2">Deadline:</span>
                                  {(() => {
                                    const diff = Math.max(0, new Date(featured.deadline).getTime() - Date.now());
                                    const days = Math.floor(diff / 86400000);
                                    const hrs = Math.floor((diff % 86400000) / 3600000);
                                    const min = Math.floor((diff % 3600000) / 60000);
                                    return [["days", days], ["hrs", hrs], ["min", min]].map(([u, v]) => (
                                      <div key={u as string} className="flex items-center gap-1.5">
                                        <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1] min-w-[36px] text-center">
                                          <span className="text-[14px] font-bold text-white tabular-nums">{String(v).padStart(2, "0")}</span>
                                        </div>
                                        <span className="text-[11px] text-gray-600">{u}</span>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              )}

                              {/* Stats */}
                              <div className="grid grid-cols-3 gap-4 mb-6 py-4 border-y border-white/[0.06]">
                                {[
                                  ["ENTRIES", String(featured.entries_count || 0), false],
                                  ["PRIZE", featured.prize_credits ? `${featured.prize_credits.toLocaleString()} Credits` : "—", true],
                                  ["CONTENT", featured.content_type === "any" ? "Any" : (featured.content_type || "Any"), false],
                                ].map(([label, val, hl]) => (
                                  <div key={label as string}>
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1">{label}</p>
                                    <p className={`text-[13px] font-semibold capitalize ${hl ? "text-amber-400" : "text-white"}`}>{val}</p>
                                  </div>
                                ))}
                              </div>

                              <div className="flex items-center gap-3">
                                {liveStatus(featured) === "active" && (
                                  enteredChallengeIds.has(featured.id) ? (
                                    <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                      <Trophy className="w-4 h-4" /> Entered ✓
                                    </span>
                                  ) : savedChallengeIds.has(featured.id) ? (
                                    <button onClick={() => openChallengeEntry(featured)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-400 hover:to-red-500 transition-all shadow-md shadow-red-600/20">
                                      <Trophy className="w-4 h-4" /> Submit Entry
                                    </button>
                                  ) : (
                                    <button onClick={() => enterChallenge(featured.id)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-400 hover:to-red-500 transition-all shadow-md shadow-red-600/20">
                                      <Trophy className="w-4 h-4" /> Join Challenge
                                    </button>
                                  )
                                )}
                                {liveStatus(featured) === "upcoming" && (
                                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-white/[0.04] border border-white/[0.08] text-gray-500">
                                    Starts {fmtChallengeDate(featured.start_at)}
                                  </span>
                                )}
                                <button onClick={() => selectChallenge(featured)} className="text-[13px] text-gray-500 hover:text-white transition-colors px-2 py-2">
                                  View Entries
                                </button>
                                {featured.rules?.length > 0 && (
                                  <button onClick={() => setRulesChallenge(featured)} className="text-[13px] text-gray-500 hover:text-white transition-colors px-2 py-2">
                                    View Rules
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="space-y-4">
                      {/* Selected challenge header — hidden once user has entered */}
                      {userEntryIds.size === 0 && (
                      <div className="rounded-2xl bg-[#0f0f0f] border border-white/[0.08] p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${liveStatus(selectedChallenge) === "active" ? "bg-emerald-500/10 text-emerald-400" : liveStatus(selectedChallenge) === "upcoming" ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-500/10 text-gray-500"}`}>
                                {liveStatus(selectedChallenge)}
                              </span>
                              {selectedChallenge.prize_credits && (
                                <span className="text-[11px] text-amber-400 font-semibold">🏆 {selectedChallenge.prize_credits.toLocaleString()} credits</span>
                              )}
                            </div>
                            <h2 className="text-lg font-bold text-white">{selectedChallenge.title}</h2>
                            {selectedChallenge.description && (
                              <p className="text-[12px] text-gray-500 mt-0.5">{selectedChallenge.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-600">
                              <span>{selectedChallenge.entries_count || 0} entries</span>
                              {selectedChallenge.content_type && selectedChallenge.content_type !== "any" && (
                                <span className="capitalize">· {selectedChallenge.content_type} only</span>
                              )}
                              {selectedChallenge.deadline && <span>· Deadline {fmtChallengeDate(selectedChallenge.deadline)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {selectedChallenge.rules?.length > 0 && (
                              <button onClick={() => setRulesChallenge(selectedChallenge)} className="text-[12px] text-gray-500 hover:text-white transition-colors">Rules</button>
                            )}
                            {liveStatus(selectedChallenge) === "active" && userEntryIds.size === 0 && (
                              savedChallengeIds.has(selectedChallenge.id) ? (
                                <button onClick={() => openChallengeEntry(selectedChallenge)} className="px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-400 transition-all">Submit Entry</button>
                              ) : (
                                <button onClick={() => enterChallenge(selectedChallenge.id)} className="px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 transition-all">Join</button>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                      )}

                      {/* Entries */}
                      {entriesLoading ? (
                        <div className="space-y-4">
                          <style>{`
                            @keyframes shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
                            .skc { background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%); background-size:600px 100%; animation: shimmer 1.6s infinite linear; border-radius:12px; }
                          `}</style>
                          {Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="rounded-2xl bg-[#0f0f0f] border border-white/[0.06] overflow-hidden">
                              <div className="flex items-center gap-3 px-4 py-3">
                                <div className="skc w-8 h-8 rounded-full" />
                                <div className="flex-1 space-y-2">
                                  <div className="skc h-3 w-28" />
                                  <div className="skc h-2.5 w-16" />
                                </div>
                              </div>
                              <div className="skc mx-4 mb-3 rounded-xl" style={{ height: 240 }} />
                              <div className="px-4 pb-4 space-y-2">
                                <div className="skc h-3.5 w-40" />
                                <div className="skc h-3 w-3/4" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : challengeEntries.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-white/[0.05] border-dashed">
                          <p className="text-gray-600 text-sm">No entries yet — be the first!</p>
                        </div>
                      ) : (
                        // Pinterest-style masonry grid of clickable entries.
                        <div className="[column-fill:_balance] columns-2 md:columns-3 gap-3 space-y-3">
                          {paginatedChallengeEntries.map((entry: any) => {
                            const isWinner = selectedChallenge.winner_user_id === entry.user_id;
                            const profile = entry.profiles;
                            const mediaUrl = entriesStorageUrl(entry.storage_path);
                            const thumbUrl = entriesStorageUrl(entry.thumbnail_path || entry.storage_path);
                            const type = (entry.content_type || "").toLowerCase();
                            return (
                              <button
                                key={entry.id}
                                onClick={() => setOpenEntry({ ...entry, isWinner })}
                                className={`group relative block w-full break-inside-avoid mb-3 text-left rounded-2xl border overflow-hidden transition-all hover:-translate-y-0.5 ${isWinner ? "border-amber-500/40 ring-1 ring-amber-500/20" : "border-white/[0.06] hover:border-white/[0.16]"} bg-[#0f0f0f]`}
                              >
                                {isWinner && (
                                  <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-black text-[10px] font-bold">
                                    🏆 Winner
                                  </span>
                                )}

                                {/* Media */}
                                {type === "image" && thumbUrl ? (
                                  <img src={thumbUrl} alt={entry.title} className="w-full object-cover" />
                                ) : type === "video" && (thumbUrl || mediaUrl) ? (
                                  <div className="relative">
                                    {thumbUrl ? (
                                      <img src={thumbUrl} alt={entry.title} className="w-full object-cover" />
                                    ) : (
                                      <video src={mediaUrl!} className="w-full" preload="metadata" />
                                    )}
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                                      <span className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white">▶</span>
                                    </span>
                                  </div>
                                ) : type === "audio" ? (
                                  <div className="aspect-square flex items-center justify-center bg-gradient-to-br from-red-950/40 to-[#0b0b0c] text-4xl">🎵</div>
                                ) : (
                                  <div className="aspect-square flex items-center justify-center bg-gradient-to-br from-white/[0.04] to-[#0b0b0c] text-4xl">📝</div>
                                )}

                                {/* Footer overlay */}
                                <div className="px-3 py-2.5">
                                  <p className="text-[12.5px] font-semibold text-white truncate">{entry.title}</p>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <div className="w-4 h-4 rounded-full overflow-hidden bg-white/[0.08] flex items-center justify-center text-[8px] text-gray-400 shrink-0">
                                      {profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        (profile?.display_name || "?").charAt(0).toUpperCase()
                                      )}
                                    </div>
                                    <span className="text-[10.5px] text-gray-500 truncate">{profile?.display_name || "Creator"}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {renderLoadMoreControls(
                        paginatedChallengeEntries.length,
                        challengeEntries.length,
                        hasMoreChallengeEntries,
                        () => setChallengeEntriesPage((p) => p + 1),
                        () => setChallengeEntriesPage(1),
                      )}
                    </div>
                  )}
                </div>

                {/* ── Right: challenge list ── */}
                {(() => {
                  // Active/upcoming = not past deadline. Results = past deadline WITH a winner.
                  // Ended without a winner is hidden entirely.
                  const liveList = challenges.filter((c) => liveStatus(c) !== "ended");
                  const resultsList = challenges.filter(
                    (c) => liveStatus(c) === "ended" && c.winner_user_id,
                  );
                  const fmtDeadline = (v?: string | null) => {
                    if (!v) return "";
                    const d = new Date(v);
                    if (isNaN(d.getTime())) return "";
                    const dd = String(d.getDate()).padStart(2, "0");
                    const mm = String(d.getMonth() + 1).padStart(2, "0");
                    const hh = String(d.getHours()).padStart(2, "0");
                    const mi = String(d.getMinutes()).padStart(2, "0");
                    return `${dd}-${mm}-${d.getFullYear()} · ${hh}:${mi}`;
                  };
                  const renderItem = (ch: any, isResult: boolean) => (
                    <button
                      key={ch.id}
                      onClick={() => {
                        if (selectedChallenge?.id === ch.id) {
                          setSelectedChallenge(null);
                          setChallengeEntries([]);
                          setUserEntryIds(new Set());
                        } else {
                          selectChallenge(ch);
                        }
                      }}
                      className={`relative w-full text-left pl-3.5 pr-3 py-2 rounded-lg border transition-all overflow-hidden ${selectedChallenge?.id === ch.id ? "bg-red-500/[0.08] border-red-500/40 ring-1 ring-red-500/30" : isResult ? "bg-amber-500/[0.04] border-amber-500/[0.15] hover:border-amber-500/30" : "bg-[#0f0f0f] border-white/[0.06] hover:border-white/[0.14]"}`}
                    >
                      {selectedChallenge?.id === ch.id && (
                        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500" />
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isResult ? "bg-amber-400" : liveStatus(ch) === "active" ? "bg-emerald-400" : "bg-yellow-400"}`} />
                        <p className={`text-[12.5px] font-semibold truncate flex-1 ${selectedChallenge?.id === ch.id ? "text-white" : isResult ? "text-amber-200" : "text-gray-300"}`}>{ch.title}</p>
                        {isResult && <span className="text-[10px]">🏆</span>}
                      </div>
                      <p className="text-[10.5px] text-gray-600 mt-0.5 pl-3">
                        {ch.entries_count || 0} entries
                        {ch.prize_credits ? ` · ${ch.prize_credits.toLocaleString()} cr` : ""}
                      </p>
                      {!isResult && ch.deadline && (
                        <p className="text-[10px] text-gray-600 mt-0.5 pl-3 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {fmtDeadline(ch.deadline)}
                        </p>
                      )}
                    </button>
                  );
                  // Apply search.
                  const q = challengeSearch.trim().toLowerCase();
                  const matchSearch = (c: any) => !q || (c.title || "").toLowerCase().includes(q);
                  const fActive = liveList.filter((c) => liveStatus(c) === "active").filter(matchSearch);
                  const fUpcoming = liveList.filter((c) => liveStatus(c) === "upcoming").filter(matchSearch);
                  const fResults = resultsList.filter(matchSearch);

                  const showActive = challengeListFilter === "all" || challengeListFilter === "active";
                  const showUpcoming = challengeListFilter === "all" || challengeListFilter === "upcoming";
                  const showResults = challengeListFilter === "all" || challengeListFilter === "results";

                  const filters: { key: typeof challengeListFilter; label: string; count: number }[] = [
                    { key: "all", label: "All", count: liveList.length + resultsList.length },
                    { key: "active", label: "Active", count: liveList.filter((c) => liveStatus(c) === "active").length },
                    { key: "upcoming", label: "Upcoming", count: liveList.filter((c) => liveStatus(c) === "upcoming").length },
                    { key: "results", label: "Results", count: resultsList.length },
                  ];

                  return (
                    <div className="w-72 shrink-0">
                      <div className="sticky top-[120px] max-h-[calc(100vh-140px)] flex flex-col">
                        {/* Search */}
                        <div className="relative mb-2.5">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
                          <input
                            value={challengeSearch}
                            onChange={(e) => setChallengeSearch(e.target.value)}
                            placeholder="Search challenges…"
                            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] text-white placeholder-gray-600 focus:outline-none focus:border-red-500/30"
                          />
                        </div>

                        {/* Filter chips */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {filters.map((f) => (
                            <button
                              key={f.key}
                              onClick={() => setChallengeListFilter(f.key)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${challengeListFilter === f.key ? "bg-red-500/15 border border-red-500/30 text-red-300" : "bg-white/[0.03] border border-white/[0.06] text-gray-500 hover:text-gray-300"}`}
                            >
                              {f.label}
                              <span className="ml-1 text-[9px] opacity-70">{f.count}</span>
                            </button>
                          ))}
                        </div>

                        {/* Scrollable list */}
                        <div className="overflow-y-auto pr-1 space-y-2 flex-1 min-h-0" data-lenis-prevent>
                          {showActive && fActive.length > 0 && (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70 mb-1.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                              </p>
                              {fActive.map((ch) => renderItem(ch, false))}
                            </>
                          )}
                          {showUpcoming && fUpcoming.length > 0 && (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500/70 mt-3 mb-1.5 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> Upcoming
                              </p>
                              {fUpcoming.map((ch) => renderItem(ch, false))}
                            </>
                          )}
                          {showResults && fResults.length > 0 && (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70 mt-3 mb-1.5 flex items-center gap-1.5">
                                <Trophy className="w-3 h-3" /> Results Out
                              </p>
                              {fResults.map((ch) => renderItem(ch, true))}
                            </>
                          )}
                          {((showActive ? fActive.length : 0) + (showUpcoming ? fUpcoming.length : 0) + (showResults ? fResults.length : 0)) === 0 && (
                            <p className="text-[11px] text-gray-700 px-1 py-4 text-center">No challenges found</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── ENTRY DETAIL MODAL (Pinterest click) ────────────────────── */}
        {openEntry && (() => {
          const profile = openEntry.profiles;
          const mediaUrl = entriesStorageUrl(openEntry.storage_path);
          const thumbUrl = entriesStorageUrl(openEntry.thumbnail_path || openEntry.storage_path);
          const type = (openEntry.content_type || "").toLowerCase();
          return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setOpenEntry(null)}>
              <div className="w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row bg-[#0c0c0c] border border-white/[0.1] rounded-2xl overflow-y-auto md:overflow-hidden shadow-2xl" data-lenis-prevent onClick={(e) => e.stopPropagation()}>
                {/* Media side */}
                <div className="md:flex-1 bg-black flex items-center justify-center min-h-[40vh] max-h-[90vh] overflow-hidden">
                  {type === "image" && thumbUrl ? (
                    <img src={thumbUrl} alt={openEntry.title} className="max-h-[90vh] max-w-full object-contain" />
                  ) : type === "video" && mediaUrl ? (
                    <video src={mediaUrl} controls autoPlay className="max-h-[90vh] max-w-full" />
                  ) : type === "audio" && mediaUrl ? (
                    <div className="p-8 w-full">
                      <div className="text-6xl text-center mb-6">🎵</div>
                      <audio src={mediaUrl} controls autoPlay className="w-full" />
                    </div>
                  ) : (
                    <div className="p-8 text-center text-6xl">📝</div>
                  )}
                </div>

                {/* Info side */}
                <div className="md:w-80 shrink-0 flex flex-col border-t md:border-t-0 md:border-l border-white/[0.08]">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-white/[0.08] border border-white/10 flex items-center justify-center text-xs text-gray-400 shrink-0">
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (profile?.display_name || "?").charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">{profile?.display_name || "Creator"}</p>
                        <p className="text-[10px] text-gray-600">{fmtChallengeDate(openEntry.created_at)}</p>
                      </div>
                    </div>
                    <button onClick={() => setOpenEntry(null)} className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="px-5 py-4 overflow-y-auto flex-1" data-lenis-prevent>
                    {openEntry.isWinner && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[12px] font-semibold mb-3">
                        🏆 Challenge Winner
                      </span>
                    )}
                    <h3 className="text-white text-base font-bold mb-2">{openEntry.title}</h3>
                    {openEntry.description && (
                      <p className="text-[13px] text-gray-400 leading-relaxed whitespace-pre-wrap">{openEntry.description}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── CHALLENGE RULES MODAL ───────────────────────────────────── */}
        {rulesChallenge && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setRulesChallenge(null)}
          >
            <div
              className="w-full max-w-md bg-[#0c0c0c] border border-white/[0.1] rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.08]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                      Challenge Rules
                    </span>
                  </div>
                  <h3 className="text-white font-semibold text-sm">
                    {rulesChallenge.title}
                  </h3>
                </div>
                <button
                  onClick={() => setRulesChallenge(null)}
                  className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Info strip */}
              <div className="flex items-center gap-4 px-5 py-3 bg-white/[0.02] border-b border-white/[0.06] text-[11px] text-gray-500">
                {rulesChallenge.prize_credits && (
                  <span className="text-amber-400 font-semibold">
                    🏆 {rulesChallenge.prize_credits.toLocaleString()} credits
                  </span>
                )}
                {rulesChallenge.content_type && rulesChallenge.content_type !== "any" && (
                  <span className="capitalize">Content: {rulesChallenge.content_type}</span>
                )}
                {rulesChallenge.deadline && (
                  <span>Deadline: {fmtChallengeDate(rulesChallenge.deadline)}</span>
                )}
              </div>

              {/* Rules list */}
              <div className="px-5 py-4 space-y-2.5 max-h-[60vh] overflow-y-auto" data-lenis-prevent>
                {rulesChallenge.description && (
                  <p className="text-[12.5px] text-gray-400 leading-relaxed mb-3">
                    {rulesChallenge.description}
                  </p>
                )}
                {(rulesChallenge.rules || []).map((rule: string, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-[13px] text-gray-300 leading-relaxed">{rule}</p>
                  </div>
                ))}
              </div>

              {/* Action */}
              <div className="px-5 py-4 border-t border-white/[0.08]">
                {liveStatus(rulesChallenge) === "active" && (
                  savedChallengeIds.has(rulesChallenge.id) ? (
                    <button
                      onClick={() => { setRulesChallenge(null); openChallengeEntry(rulesChallenge); }}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[13px] font-semibold hover:from-red-400 hover:to-red-500 transition-all"
                    >
                      Submit Entry
                    </button>
                  ) : (
                    <button
                      onClick={() => { enterChallenge(rulesChallenge.id); setRulesChallenge(null); }}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[13px] font-semibold hover:from-red-400 hover:to-red-500 transition-all"
                    >
                      Join Challenge
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── SIGNALS TAB ─────────────────────────────────────────────── */}
        {activeTab === "signals" && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Megaphone className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-white">
                  Official Signals
                </h2>
                <p className="text-[11.5px] text-gray-600">
                  Platform announcements, featured creators, and important
                  updates from KAIZORA.
                </p>
              </div>
            </div>

            {signals.length === 0 ? (
              <EmptyPane
                icon={Megaphone}
                title="No signals yet"
                sub="Official platform updates will appear here"
              />
            ) : (
              paginatedSignals.map((sig) => {
                const namedTagColors: Record<string, string> = {
                  emerald: "#34d399",
                  red: "#ef4444",
                  amber: "#f59e0b",
                  blue: "#3b82f6",
                  purple: "#a855f7",
                };
                const rawTagColor =
                  typeof sig.tag_color === "string" ? sig.tag_color.trim() : "";
                const resolvedTagColor = rawTagColor.startsWith("#")
                  ? rawTagColor
                  : namedTagColors[rawTagColor.toLowerCase()] || "#ef4444";
                return (
                  <article
                    key={sig.id}
                    className="rounded-2xl bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.12] transition-all overflow-hidden"
                  >
                    <div className="p-5 sm:p-6">
                      <div className="flex items-center gap-2.5 mb-3">
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider"
                          style={{
                            color: resolvedTagColor,
                            borderColor: resolvedTagColor,
                            backgroundColor: `${resolvedTagColor}1A`,
                          }}
                        >
                          {sig.tag}
                        </span>
                        <span className="text-[11px] text-gray-700">
                          {formatDate(sig.published_at || sig.created_at)}
                        </span>
                      </div>
                      <h3 className="text-[16px] font-bold text-white mb-1">
                        {sig.title}
                      </h3>
                      {sig.subtitle && (
                        <p className="text-[12.5px] text-gray-500 mb-2">
                          {sig.subtitle}
                        </p>
                      )}
                      <p className="text-[13px] text-gray-500 leading-relaxed mb-4">
                        {sig.description}
                      </p>
                    </div>
                  </article>
                );
              })
            )}
            {renderLoadMoreControls(
              paginatedSignals.length,
              signals.length,
              hasMoreSignals,
              () => setSignalsPage((p) => p + 1),
              () => setSignalsPage(1),
            )}
          </div>
        )}

        {/* ── CREATORS TAB ─────────────────────────────────────────────── */}
        {activeTab === "creators" && (
          <div className="space-y-0">
            {/* Sticky search/filter bar */}
            <div className="sticky top-[88px] z-20 bg-[#070707]/95 backdrop-blur-xl border-b border-white/[0.05] pb-3 pt-3 mb-5 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-xl">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search creators by name or bio…"
                    value={creatorSearch}
                    onChange={(e) => setCreatorSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-[#0f0f0f] border border-white/[0.07] text-[13px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/25 focus:border-red-500/20 hover:border-white/[0.12] transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {CREATOR_SORT_FILTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setCreatorSort(s)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium border transition-all ${creatorSort === s ? "bg-red-500/10 border-red-500/25 text-red-300" : "border-white/[0.07] text-gray-500 hover:border-white/[0.15] hover:text-gray-300"}`}
                    >
                      {s === "Trending" && <Flame className="w-3 h-3" />}
                      {s === "New" && <Sparkles className="w-3 h-3" />}
                      {s === "Most Followed" && <Users className="w-3 h-3" />}
                      {s === "Most Remixed" && <GitFork className="w-3 h-3" />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredCreators.length === 0 ? (
              <EmptyPane
                icon={Users}
                title="No creators found"
                sub="Try a different search term"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {paginatedCreators.map((creator) => {
                  const status = connStatus(creator.id);
                  const isFollowing = status === "accepted";
                  const initials = (creator.display_name || "C")
                    .slice(0, 2)
                    .toUpperCase();
                  const avatarColors = [
                    "from-red-500/40 to-rose-700/40",
                    "from-blue-500/40 to-indigo-700/40",
                    "from-emerald-500/40 to-teal-700/40",
                    "from-amber-500/40 to-orange-700/40",
                    "from-purple-500/40 to-violet-700/40",
                    "from-pink-500/40 to-rose-600/40",
                  ];
                  const colorIdx =
                    creator.id.charCodeAt(0) % avatarColors.length;

                  return (
                    <div
                      key={creator.id}
                      className="rounded-2xl bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.12] hover:shadow-xl hover:shadow-black/40 transition-all p-5"
                      onMouseEnter={() => {
                        if (hoverTimerRef.current)
                          clearTimeout(hoverTimerRef.current);
                        hoverTimerRef.current = setTimeout(
                          () => setFocusedUser(creator),
                          800,
                        );
                      }}
                      onMouseLeave={() => {
                        if (hoverTimerRef.current)
                          clearTimeout(hoverTimerRef.current);
                      }}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        {creator.avatar_url ? (
                          <img
                            src={creator.avatar_url}
                            alt={creator.display_name}
                            className="w-12 h-12 rounded-full object-cover border border-white/[0.1] flex-shrink-0 cursor-pointer"
                            onClick={() =>
                              router.push(`/community/profile/${creator.id}`)
                            }
                          />
                        ) : (
                          <button
                            onClick={() =>
                              router.push(`/community/profile/${creator.id}`)
                            }
                            className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarColors[colorIdx]} border border-white/[0.12] flex items-center justify-center flex-shrink-0`}
                          >
                            <span className="text-[14px] font-bold text-white/90">
                              {initials}
                            </span>
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() =>
                              router.push(`/community/profile/${creator.id}`)
                            }
                            className="text-[14px] font-bold text-white hover:text-red-400 transition-colors leading-tight block truncate"
                          >
                            {creator.display_name || "Creator"}
                          </button>
                          {creator.bio ? (
                            <p className="text-[11px] text-gray-600 line-clamp-2 leading-relaxed mt-0.5">
                              {creator.bio}
                            </p>
                          ) : (
                            <p className="text-[11px] text-gray-700 italic mt-0.5">
                              No bio yet
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-gray-600 mb-4 border-t border-white/[0.05] pt-3">
                        <div>
                          <span className="text-gray-300 font-semibold">
                            {creator.assetCount ?? 0}
                          </span>{" "}
                          assets
                        </div>
                        {creator.reviewCount > 0 && (
                          <div>
                            <span className="text-gray-300 font-semibold">
                              {creator.reviewCount}
                            </span>{" "}
                            reviews
                          </div>
                        )}
                        {creator.averageRating > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="text-gray-300 font-semibold">
                              {creator.averageRating}
                            </span>
                          </div>
                        )}
                        <div className="ml-auto text-gray-700 text-[10px]">
                          Joined {new Date(creator.created_at).getFullYear()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            !connDisabled(creator.id) &&
                            handleConnect(creator.id)
                          }
                          disabled={connDisabled(creator.id)}
                          className={`flex-1 py-1.5 rounded-xl text-[12px] font-medium transition-all flex items-center justify-center gap-1.5 ${isFollowing ? "bg-red-500/10 border border-red-500/20 text-red-400" : status === "pending" ? "bg-white/[0.04] border border-white/[0.08] text-gray-500" : "bg-white/[0.05] border border-white/[0.1] text-gray-300 hover:bg-white/[0.09]"}`}
                        >
                          <UserPlus className="w-3 h-3" />
                          {followLabel(creator.id)}
                        </button>
                        <button
                          onClick={() => toggleFavorite(creator.id)}
                          disabled={togglingFav === creator.id}
                          className={`py-1.5 px-3 rounded-xl text-[12px] font-medium transition-all flex items-center justify-center gap-1.5 ${favoriteCreators.has(creator.id) ? "bg-amber-500/10 border border-amber-500/20 text-amber-400" : "bg-white/[0.05] border border-white/[0.1] text-gray-300 hover:bg-amber-500/[0.07] hover:text-amber-400 hover:border-amber-500/20"}`}
                        >
                          <Star
                            className={`w-3 h-3 ${favoriteCreators.has(creator.id) ? "fill-amber-400" : ""}`}
                          />
                        </button>
                        <button
                          onClick={() =>
                            router.push(`/community/profile/${creator.id}`)
                          }
                          className="flex-1 py-1.5 rounded-xl text-[12px] font-medium bg-white/[0.05] border border-white/[0.1] text-gray-300 hover:bg-white/[0.09] transition-all flex items-center justify-center gap-1.5"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Message
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {renderLoadMoreControls(
              paginatedCreators.length,
              filteredCreators.length,
              hasMoreCreators,
              () => setCreatorPage((p) => p + 1),
              () => setCreatorPage(1),
            )}
          </div>
        )}

        {/* ── SAVED TAB ───────────────────────────────────────────────── */}
        {activeTab === "saved" && (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Bookmark className="w-5 h-5 text-amber-400" />
              <div>
                <h2 className="text-[15px] font-bold text-white flex items-center gap-2">
                  Saved
                  <span className="px-2 py-0.5 rounded-full bg-white/[0.07] text-[11px] text-gray-400 font-medium">
                    {savedPostIds.size +
                      savedChallengeIds.size +
                      favoriteCreators.size}
                  </span>
                </h2>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.07] w-fit">
              {SAVED_SUB_TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setSavedSubTab(t)}
                  className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${savedSubTab === t ? "bg-white/[0.09] text-white" : "text-gray-500 hover:text-gray-300"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ── All ── */}
            {savedSubTab === "All" &&
              (savedPostAssets.length === 0 &&
              savedChallengeList.length === 0 &&
              savedCreatorList.length === 0 ? (
                <EmptyPane
                  icon={Bookmark}
                  title="Nothing saved yet"
                  sub="Save posts, enter challenges, and favourite creators to see them here"
                />
              ) : (
                <div className="space-y-6">
                  {savedPostAssets.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-1.5">
                        <Bookmark className="w-3 h-3" />
                        Posts ({savedPostAssets.length})
                      </p>
                      <div className="space-y-4">
                        {paginatedSavedPosts.map((a) =>
                          renderPostCard({ asset: a }),
                        )}
                      </div>
                      {renderLoadMoreControls(
                        paginatedSavedPosts.length,
                        savedPostAssets.length,
                        hasMoreSavedPosts,
                        () => setSavedPage((p) => p + 1),
                        () => setSavedPage(1),
                      )}
                    </div>
                  )}
                  {savedChallengeList.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-1.5">
                        <Trophy className="w-3 h-3" />
                        Challenges ({savedChallengeList.length})
                      </p>
                      <div className="space-y-3">
                        {paginatedSavedChallenges.map((ch) => (
                          <div
                            key={ch.id}
                            className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-[#0f0f0f] border border-white/[0.06]"
                          >
                            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                              <Trophy className="w-4 h-4 text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-white">
                                {ch.title}
                              </p>
                              <p className="text-[11.5px] text-gray-600">
                                {ch.theme}
                              </p>
                            </div>
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-[11px] text-emerald-400 font-medium">
                              Entered ✓
                            </span>
                          </div>
                        ))}
                      </div>
                      {renderLoadMoreControls(
                        paginatedSavedChallenges.length,
                        savedChallengeList.length,
                        hasMoreSavedChallenges,
                        () => setSavedPage((p) => p + 1),
                        () => setSavedPage(1),
                      )}
                    </div>
                  )}
                  {savedCreatorList.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mb-3 flex items-center gap-1.5">
                        <Star className="w-3 h-3" />
                        Creators ({savedCreatorList.length})
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {paginatedSavedCreators.map((c) => {
                          const avatarColors = [
                            "from-red-500/40 to-rose-700/40",
                            "from-blue-500/40 to-indigo-700/40",
                            "from-emerald-500/40 to-teal-700/40",
                          ];
                          const colorIdx =
                            c.id.charCodeAt(0) % avatarColors.length;
                          return (
                            <div
                              key={c.id}
                              className="flex items-center gap-3 p-3 rounded-xl bg-[#0f0f0f] border border-white/[0.06]"
                            >
                              {c.avatar_url ? (
                                <img
                                  src={c.avatar_url}
                                  alt={c.display_name}
                                  className="w-9 h-9 rounded-full object-cover border border-white/[0.1]"
                                />
                              ) : (
                                <div
                                  className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColors[colorIdx]} flex items-center justify-center`}
                                >
                                  <span className="text-[11px] font-bold text-white/90">
                                    {(c.display_name || "C")
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <p className="flex-1 text-[13px] font-medium text-white truncate">
                                {c.display_name || "Creator"}
                              </p>
                              <button
                                onClick={() =>
                                  router.push(`/community/profile/${c.id}`)
                                }
                                className="text-[11px] text-gray-600 hover:text-red-400 transition-colors flex items-center gap-0.5"
                              >
                                View
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {renderLoadMoreControls(
                        paginatedSavedCreators.length,
                        savedCreatorList.length,
                        hasMoreSavedCreators,
                        () => setSavedPage((p) => p + 1),
                        () => setSavedPage(1),
                      )}
                    </div>
                  )}
                </div>
              ))}

            {/* ── Saved Posts ── */}
            {savedSubTab === "Posts" &&
              (savedPostAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-white/[0.05] border-dashed">
                  <div className="w-14 h-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center mb-4">
                    <Bookmark className="w-6 h-6 text-gray-700" />
                  </div>
                  <p className="text-gray-400 text-sm font-semibold mb-1">
                    No saved posts
                  </p>
                  <p className="text-gray-600 text-xs mb-5">
                    Tap the bookmark icon on any post to save it here.
                  </p>
                  <button
                    onClick={() => changeTab("pulse")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[12.5px] hover:bg-red-500/15 transition-all"
                  >
                    Browse Pulse <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSavedPosts.map((asset) =>
                      renderPostCard({ asset, showUnsave: true }),
                    )}
                  </div>
                  {renderLoadMoreControls(
                    paginatedSavedPosts.length,
                    savedPostAssets.length,
                    hasMoreSavedPosts,
                    () => setSavedPage((p) => p + 1),
                    () => setSavedPage(1),
                  )}
                </>
              ))}

            {/* ── Saved Challenges ── */}
            {savedSubTab === "Challenges" &&
              (savedChallengeList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-white/[0.05] border-dashed">
                  <div className="w-14 h-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center mb-4">
                    <Trophy className="w-6 h-6 text-gray-700" />
                  </div>
                  <p className="text-gray-400 text-sm font-semibold mb-1">
                    No saved challenges
                  </p>
                  <p className="text-gray-600 text-xs mb-5">
                    Enter a challenge and it will automatically appear here.
                  </p>
                  <button
                    onClick={() => changeTab("challenges")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[12.5px] hover:bg-red-500/15 transition-all"
                  >
                    View Challenges <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {paginatedSavedChallenges.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.12] transition-all group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <Trophy className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${liveStatus(ch) === "active" ? "bg-emerald-500/10 text-emerald-400" : liveStatus(ch) === "upcoming" ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-500/10 text-gray-500"}`}>
                            {liveStatus(ch)}
                          </span>
                          {ch.prize_credits && (
                            <span className="text-[10px] text-amber-400 font-semibold">
                              {ch.prize_credits.toLocaleString()} credits
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] font-semibold text-white group-hover:text-red-400 transition-colors">
                          {ch.title}
                        </p>
                        <p className="text-[11.5px] text-gray-600">
                          {ch.entries_count || 0} entries
                          {ch.deadline ? ` · Deadline ${fmtChallengeDate(ch.deadline)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => unsaveChallenge(ch.id)}
                          className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 transition-all"
                          title="Remove from saved"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        {liveStatus(ch) === "active" ? (
                          <button
                            onClick={() => openChallengeEntry(ch)}
                            className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400 font-medium hover:bg-red-500/15 transition-all"
                          >
                            Submit entry
                          </button>
                        ) : (
                          <span className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[12px] text-gray-500 font-medium">
                            {liveStatus(ch) === "upcoming" ? "Not started" : "Ended"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  </div>
                  {renderLoadMoreControls(
                    paginatedSavedChallenges.length,
                    savedChallengeList.length,
                    hasMoreSavedChallenges,
                    () => setSavedPage((p) => p + 1),
                    () => setSavedPage(1),
                  )}
                </>
              ))}

            {/* ── Favourite Creators ── */}
            {savedSubTab === "Creators" &&
              (savedCreatorList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-white/[0.05] border-dashed">
                  <div className="w-14 h-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center mb-4">
                    <Star className="w-6 h-6 text-gray-700" />
                  </div>
                  <p className="text-gray-400 text-sm font-semibold mb-1">
                    No favourite creators
                  </p>
                  <p className="text-gray-600 text-xs mb-5">
                    Star creators from the Creators tab to save them here.
                  </p>
                  <button
                    onClick={() => changeTab("creators")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[12.5px] hover:bg-red-500/15 transition-all"
                  >
                    Discover Creators <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3">
                    {paginatedSavedCreators.map((creator) => {
                    const avatarColors = [
                      "from-red-500/40 to-rose-700/40",
                      "from-blue-500/40 to-indigo-700/40",
                      "from-emerald-500/40 to-teal-700/40",
                      "from-amber-500/40 to-orange-700/40",
                      "from-purple-500/40 to-violet-700/40",
                      "from-pink-500/40 to-rose-600/40",
                    ];
                    const colorIdx =
                      creator.id.charCodeAt(0) % avatarColors.length;
                    const initials = (creator.display_name || "C")
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <div
                        key={creator.id}
                        className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#0f0f0f] border border-white/[0.06] hover:border-white/[0.12] transition-all"
                      >
                        {creator.avatar_url ? (
                          <img
                            src={creator.avatar_url}
                            alt={creator.display_name}
                            className="w-11 h-11 rounded-full object-cover border border-white/[0.1] flex-shrink-0 cursor-pointer"
                            onClick={() =>
                              router.push(`/community/profile/${creator.id}`)
                            }
                          />
                        ) : (
                          <button
                            onClick={() =>
                              router.push(`/community/profile/${creator.id}`)
                            }
                            className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatarColors[colorIdx]} border border-white/[0.12] flex items-center justify-center flex-shrink-0`}
                          >
                            <span className="text-[13px] font-bold text-white/90">
                              {initials}
                            </span>
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() =>
                              router.push(`/community/profile/${creator.id}`)
                            }
                            className="text-[13px] font-bold text-white hover:text-red-400 transition-colors"
                          >
                            {creator.display_name || "Creator"}
                          </button>
                          <p className="text-[11px] text-gray-600 truncate">
                            {creator.bio || `${creator.assetCount ?? 0} assets`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => toggleFavorite(creator.id)}
                            className="py-1.5 px-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[12px] font-medium hover:bg-amber-500/15 transition-all flex items-center gap-1.5"
                          >
                            <Star className="w-3 h-3 fill-amber-400" />
                            Saved
                          </button>
                          <button
                            onClick={() =>
                              router.push(`/community/profile/${creator.id}`)
                            }
                            className="py-1.5 px-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-gray-300 text-[12px] hover:bg-white/[0.09] transition-all flex items-center gap-1.5"
                          >
                            <MessageSquare className="w-3 h-3" />
                            Message
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                  {renderLoadMoreControls(
                    paginatedSavedCreators.length,
                    savedCreatorList.length,
                    hasMoreSavedCreators,
                    () => setSavedPage((p) => p + 1),
                    () => setSavedPage(1),
                  )}
                </>
              ))}
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-[6px]"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 sm:w-80 bg-[#0d0d0d] border-r border-white/[0.08] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <span className="text-[13px] font-semibold text-white">
                Filters
              </span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.07] transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b border-white/[0.06] space-y-1">
              {TABS.map(({ key, label, icon: Icon }) => {
                const showUpdateDot =
                  (key === "challenges" && showChallengesDot) ||
                  (key === "signals" && showSignalsDot);

                return (
                  <button
                    key={key}
                    onClick={() => {
                      changeTab(key as any);
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${activeTab === key ? "bg-red-500/10 text-red-300 border border-red-500/20" : "text-gray-500 hover:text-white hover:bg-white/[0.05]"}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                    {showUpdateDot && (
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === "pulse" && <PulseSidebar />}
            </div>
          </div>
        </div>
      )}

      <CommunityAssistant
        assets={assets}
        users={users}
        challenges={challenges}
        focusedUser={focusedUser}
        currentUser={currentUser}
      />

      {/* ══ CREATE POST MODAL ════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-[8px]"
            onClick={() => !postUploading && setShowCreateModal(false)}
          />

          {/* Modal panel */}
          <div className="relative w-full sm:max-w-2xl bg-[#0e0e0e] sm:rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[92dvh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  {editingPost ? (
                    <Pencil className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
                <h2 className="text-[14px] font-bold text-white">
                  {entryChallenge ? "Submit Challenge Entry" : editingPost ? "Edit Post" : "Create Post"}
                </h2>
              </div>
              <button
                onClick={() => !postUploading && setShowCreateModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/[0.07] transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0" data-lenis-prevent>
              {/* Author row */}
              <div className="flex items-center gap-2.5">
                <img
                  src={
                    currentUserProfile?.avatar_url ||
                    `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser?.id}`
                  }
                  alt="you"
                  className="w-9 h-9 rounded-full object-cover border border-white/[0.1] flex-shrink-0"
                />
                <div>
                  <p className="text-[13px] font-semibold text-white">
                    {currentUserProfile?.display_name || "You"}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    <span className="text-[10px] text-emerald-400 font-medium">
                      {entryChallenge
                        ? `Entering: ${entryChallenge.title}`
                        : editingPost
                        ? "Updating your Pulse post"
                        : "Posting to Pulse"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Give your post a title…"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  maxLength={80}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 focus:border-red-500/20 transition-all"
                />
                <div className="flex justify-end mt-1">
                  <span className="text-[10px] text-gray-700">
                    {postTitle.length}/80
                  </span>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">
                  Description
                </label>
                <textarea
                  placeholder="What's this post about? Describe your work, process, or idea…"
                  value={postDescription}
                  onChange={(e) => setPostDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-500/30 focus:border-red-500/20 transition-all resize-none leading-relaxed"
                />
                <div className="flex justify-end mt-1">
                  <span className="text-[10px] text-gray-700">
                    {postDescription.length}/500
                  </span>
                </div>
              </div>


              {/* Content type — hidden when challenge locks to a specific type */}
              {!(entryChallenge && entryChallenge.content_type && entryChallenge.content_type !== "any") && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">
                    Content Type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "image", label: "Image", emoji: "🖼️" },
                      { key: "video", label: "Video", emoji: "🎬" },
                      { key: "audio", label: "Audio", emoji: "🎵" },
                      { key: "code", label: "Code", emoji: "💻" },
                      { key: "text", label: "Text", emoji: "📝" },
                    ].map(({ key, label, emoji }) => (
                      <button
                        key={key}
                        onClick={() => setPostContentType(key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-all ${postContentType === key ? "bg-red-500/10 border-red-500/25 text-red-300" : "border-white/[0.08] text-gray-500 hover:border-white/[0.16] hover:text-gray-300"}`}
                      >
                        <span>{emoji}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Challenge rules */}
              {entryChallenge?.rules?.length > 0 && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Rules</p>
                  {entryChallenge.rules.map((rule: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-[12px] text-gray-300 leading-relaxed">{rule}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* File upload */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-2">
                  Attach Media{" "}
                  <span className="text-gray-700 font-normal normal-case">
                    (optional)
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    entryChallenge?.content_type && entryChallenge.content_type !== "any"
                      ? entryChallenge.content_type === "image" ? "image/*"
                        : entryChallenge.content_type === "video" ? "video/*"
                        : entryChallenge.content_type === "audio" ? "audio/*"
                        : entryChallenge.content_type === "text" ? "text/*,.txt,.md"
                        : PULSE_FILE_ACCEPT
                      : PULSE_FILE_ACCEPT
                  }
                  className="hidden"
                  onChange={onFileChange}
                />
                {postFilePreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-white/[0.08] group bg-[#0b0b0c]">
                    <div className="flex items-center justify-center max-h-52 min-h-[8rem] w-full">
                      <img
                        src={postFilePreview}
                        alt="preview"
                        className="max-h-52 max-w-full object-contain rounded-xl"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setPostFile(null);
                        setPostFilePreview(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : postFile ? (
                  <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                      {postContentType === "code" ? (
                        <FileCode2 className="w-4 h-4 text-red-400" />
                      ) : postContentType === "text" ? (
                        <FileText className="w-4 h-4 text-red-400" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-white font-medium truncate">
                        {postFile.name}
                      </p>
                      <p className="text-[10px] text-gray-600">
                        {postContentType.toUpperCase()} ·{" "}
                        {(postFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setPostFile(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-6 rounded-xl border border-dashed border-white/[0.1] flex flex-col items-center gap-2 text-gray-600 hover:border-red-500/25 hover:text-gray-400 hover:bg-red-500/[0.03] transition-all group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center group-hover:border-red-500/20 transition-all">
                      <FileCode2 className="w-4 h-4" />
                    </div>
                    <span className="text-[12px] font-medium">
                      {entryChallenge?.content_type && entryChallenge.content_type !== "any"
                        ? `Click to attach ${entryChallenge.content_type}`
                        : "Click to attach image, video, audio, code, or text"}
                    </span>
                    <span className="text-[10px] text-gray-700">
                      {entryChallenge?.content_type === "image" ? "JPG, PNG, GIF, WebP, SVG"
                        : entryChallenge?.content_type === "video" ? "MP4, MOV, WebM, AVI"
                        : entryChallenge?.content_type === "audio" ? "MP3, WAV, OGG, FLAC"
                        : entryChallenge?.content_type === "text" ? "TXT, MD, and text files"
                        : "JPG, PNG, MP4, MP3, HTML, TXT, JSON, JS, TS and more"}
                    </span>
                  </button>
                )}
              </div>

              {/* Error */}
              {postError && (
                <div className="px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
                  {postError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-white/[0.06] flex-shrink-0">
              <div className="flex-1" />
              <button
                onClick={() => !postUploading && setShowCreateModal(false)}
                disabled={postUploading}
                className="px-4 py-2 rounded-xl border border-white/[0.08] text-[12px] text-gray-400 hover:text-white hover:border-white/[0.16] transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePost}
                disabled={postUploading || !postTitle.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-b from-red-500 to-red-600 text-white text-[12px] font-semibold hover:from-red-400 hover:to-red-500 transition-all shadow-md shadow-red-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {postUploading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {editingPost ? "Saving…" : "Posting…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    {entryChallenge ? "Submit Entry" : editingPost ? "Save Changes" : "Post to Pulse"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────
function ActionBtn({
  onClick,
  active,
  activeClass,
  hoverClass,
  className,
  children,
}: {
  onClick?: () => void;
  active?: boolean;
  activeClass?: string;
  hoverClass?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-all ${active ? activeClass : `text-gray-600 ${hoverClass}`} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function EmptyPane({
  icon: Icon,
  title,
  sub,
}: {
  icon: any;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-white/[0.05] border-dashed">
      <div className="w-14 h-14 rounded-2xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-gray-700" />
      </div>
      <p className="text-gray-400 text-sm font-semibold mb-1">{title}</p>
      <p className="text-gray-600 text-xs">{sub}</p>
    </div>
  );
}
