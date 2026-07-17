"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminPagination from "@/app/components/AdminPagination";
import { usePagination } from "@/app/hooks/usePagination";
import {
  Rows,
  Trophy,
  Broadcast,
  Trash,
  PlusCircle,
  X,
  Check,
  WarningCircle,
} from "phosphor-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Post = {
  id: string;
  title: string;
  content_type: string;
  created_at: string;
  is_public: boolean;
  user_id: string;
  storage_path: string | null;
  thumbnail_path: string | null;
  description: string | null;
  profiles?: { display_name: string | null };
};

// Build a public URL for a file in the given storage bucket.
function storageUrl(bucket: string, p?: string | null): string | null {
  return p
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${p}`
    : null;
}
// Posts bucket (community feed).
function postsUrl(p?: string | null): string | null {
  return storageUrl("posts", p);
}
// Challenge entries bucket.
function entriesUrl(p?: string | null): string | null {
  return storageUrl("challenge-entries", p);
}

type Challenge = {
  id: string;
  title: string;
  theme: string | null;
  badge: string | null;
  prize: string | null;
  prize_credits: number | null;
  content_type: string; // 'any' | 'image' | 'video' | 'audio' | 'text'
  requires_join: boolean;
  start_at: string | null;
  deadline: string | null;
  entries_count: number;
  categories: string[] | null;
  judging: string | null;
  rules: string[];
  status: string;
  description: string | null;
  winner_user_id: string | null;
  created_at: string;
};

const CHALLENGE_CONTENT_TYPES = [
  { value: "any", label: "Any content" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "text", label: "Text" },
] as const;

// Format any date value as DD-MM-YYYY (optionally with HH:MM).
function fmtDMY(value?: string | null, withTime = false): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const base = `${dd}-${mm}-${yyyy}`;
  if (!withTime) return base;
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${base} ${hh}:${min}`;
}

// Derive status purely from the schedule so it can never drift out of sync.
function deriveStatus(
  startAt: string | null,
  deadline: string | null,
): "upcoming" | "active" | "ended" {
  const now = Date.now();
  const start = startAt ? new Date(startAt).getTime() : null;
  const end = deadline ? new Date(deadline).getTime() : null;
  if (start && now < start) return "upcoming";
  if (end && now > end) return "ended";
  return "active";
}

type Signal = {
  id: string;
  tag: string;
  tag_color: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  published_at: string | null;
  created_at: string;
};

const COMMUNITY_PAGE_SIZE = 15;
const COMMUNITY_ENTRY_PAGE_SIZE = 15;

// ─── Empty forms ─────────────────────────────────────────────────────────────

const EMPTY_CHALLENGE: Omit<Challenge, "id" | "created_at" | "entries_count" | "winner_user_id"> =
  {
    title: "",
    theme: "",
    badge: "",
    prize: "",
    prize_credits: null,
    content_type: "any",
    requires_join: true,
    start_at: "",
    deadline: "",
    categories: [],
    judging: "",
    rules: [],
    status: "active",
    description: "",
  };

const EMPTY_SIGNAL: Omit<Signal, "id" | "created_at"> = {
  tag: "",
  tag_color: "#ef4444",
  title: "",
  subtitle: "",
  description: "",
  published_at: new Date().toISOString().slice(0, 16),
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "posts" | "challenges" | "signals";

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  msg,
  type,
  onDone,
}: {
  msg: string;
  type: "success" | "error";
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm shadow-xl border ${
        type === "success"
          ? "bg-emerald-950 border-emerald-500/30 text-emerald-300"
          : "bg-red-950 border-red-500/30 text-red-300"
      }`}
    >
      {type === "success" ? (
        <Check size={15} weight="bold" />
      ) : (
        <WarningCircle size={15} weight="bold" />
      )}
      {msg}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperadminCommunityPage() {
  const [tab, setTab] = useState<Tab>("posts");
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") =>
    setToast({ msg, type });

  return (
    <div className="text-white min-h-screen">
      {toast && (
        <Toast
          msg={toast.msg}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">
          Community Management
        </h1>
        <p className="text-gray-500 text-sm">
          Manage posts, challenges, and signals across the community.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 border-b border-white/10">
        {(
          [
            { id: "posts", label: "Posts", Icon: Rows },
            { id: "challenges", label: "Challenges", Icon: Trophy },
            { id: "signals", label: "Signals", Icon: Broadcast },
          ] as { id: Tab; label: string; Icon: any }[]
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? "border-red-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Icon size={16} weight={tab === id ? "fill" : "regular"} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "posts" && <PostsTab showToast={showToast} />}
      {tab === "challenges" && <ChallengesTab showToast={showToast} />}
      {tab === "signals" && <SignalsTab showToast={showToast} />}
    </div>
  );
}

// ─── Posts Tab ────────────────────────────────────────────────────────────────

function PostsTab({
  showToast,
}: {
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Post | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select(
        "id, title, content_type, created_at, is_public, user_id, storage_path, thumbnail_path, description, profiles(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) {
      const normalizedPosts: Post[] = data.map((post: any) => ({
        id: post.id,
        title: post.title,
        content_type: post.content_type,
        created_at: post.created_at,
        is_public: post.is_public,
        user_id: post.user_id,
        storage_path: post.storage_path ?? null,
        thumbnail_path: post.thumbnail_path ?? null,
        description: post.description ?? null,
        profiles: Array.isArray(post.profiles)
          ? (post.profiles[0] ?? { display_name: null })
          : post.profiles,
      }));
      setPosts(normalizedPosts);
    }
    setLoading(false);
  };

  const deletePost = async (post: Post) => {
    if (!confirm(`Delete post "${post.title}"? This cannot be undone.`)) return;
    setDeleting(post.id);
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      showToast("Failed to delete post.", "error");
    } else {
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      showToast("Post deleted.");
    }
    setDeleting(null);
  };

  const filtered = posts.filter(
    (p) =>
      p.title?.toLowerCase().includes(search.toLowerCase()) ||
      (p.profiles?.display_name || "")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const {
    currentPage,
    setCurrentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedItems,
  } = usePagination(filtered, {
    pageSize: COMMUNITY_PAGE_SIZE,
    resetKeys: [search, filtered.length],
  });

  return (
    <div>
      {/* Search */}
      <div className="mb-5 flex items-center gap-3">
        <input
          type="text"
          placeholder="Search posts or creators…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 w-72"
        />
        <span className="text-gray-600 text-xs">
          {filtered.length} post{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div className="text-gray-600 text-sm py-8 text-center">
          Loading posts…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-600 text-sm py-8 text-center">
          No posts found.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-white/[0.08] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/[0.08]">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Content
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Title
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Creator
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Visibility
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Date
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(paginatedItems as Post[]).map((post, i) => (
                  <tr
                    key={post.id}
                    className={`border-b border-white/[0.05] ${i % 2 === 0 ? "" : "bg-white/[0.015]"} hover:bg-white/[0.04] transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <ContentThumb post={post} onOpen={() => setPreview(post)} />
                    </td>
                    <td className="px-4 py-3 text-white max-w-[240px] truncate">
                      {post.title || (
                        <span className="text-gray-600">Untitled</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {post.profiles?.display_name || (
                        <span className="text-gray-600">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-gray-400">
                        {post.content_type || "post"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${post.is_public ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-gray-500/10 text-gray-500 border border-gray-500/20"}`}
                      >
                        {post.is_public ? "Public" : "Private"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                      {new Date(post.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deletePost(post)}
                        disabled={deleting === post.id}
                        className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <Trash size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            currentPage={currentPage}
            totalItems={totalItems}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            itemLabel="posts"
            className="mt-4"
          />
        </>
      )}

      {preview && (
        <PreviewModal post={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

// ─── Content preview helpers ───────────────────────────────────────────────────

function ContentThumb({ post, onOpen, bucket = "posts" }: { post: Post; onOpen: () => void; bucket?: string }) {
  const type = (post.content_type || "text").toLowerCase();
  const hasFile = !!post.storage_path || !!post.thumbnail_path;
  const urlFn = (p?: string | null) => storageUrl(bucket, p);

  const base =
    "w-12 h-12 rounded-lg border border-white/[0.08] flex items-center justify-center overflow-hidden bg-white/[0.03] hover:border-white/30 transition-colors";

  const imgSrc =
    type === "image"
      ? urlFn(post.storage_path || post.thumbnail_path)
      : type === "video"
        ? urlFn(post.thumbnail_path)
        : null;

  if (imgSrc) {
    return (
      <button
        onClick={onOpen}
        className={`${base} relative`}
        title="Preview"
      >
        <img
          src={imgSrc}
          alt={post.title || "preview"}
          className="w-full h-full object-cover"
        />
        {type === "video" && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm">
            ▶
          </span>
        )}
      </button>
    );
  }

  const label =
    type === "video"
      ? "🎬"
      : type === "audio"
        ? "🎵"
        : type === "image"
          ? "🖼️"
          : hasFile
            ? "📄"
            : "📝";

  return (
    <button
      onClick={onOpen}
      className={`${base} text-lg`}
      title={hasFile ? "Preview" : "View text"}
    >
      {label}
    </button>
  );
}

function PreviewModal({ post, onClose, bucket = "posts" }: { post: Post; onClose: () => void; bucket?: string }) {
  const type = (post.content_type || "text").toLowerCase();
  const fileUrl = storageUrl(bucket, post.storage_path);
  const imgUrl = storageUrl(bucket, post.storage_path || post.thumbnail_path);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0c0c] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>

        <div className="mb-1 text-xs text-gray-500 uppercase tracking-wide">
          {type}
        </div>
        <h3 className="text-white text-base font-medium mb-4 pr-8">
          {post.title || "Untitled"}
        </h3>

        <div className="rounded-xl overflow-hidden bg-black/40 flex items-center justify-center mb-4">
          {type === "image" && imgUrl ? (
            <img
              src={imgUrl}
              alt={post.title || "image"}
              className="max-h-[60vh] max-w-full object-contain"
            />
          ) : type === "video" && fileUrl ? (
            <video
              src={fileUrl}
              controls
              className="max-h-[60vh] max-w-full"
            />
          ) : type === "audio" && fileUrl ? (
            <audio src={fileUrl} controls className="w-full p-4" />
          ) : post.description ? (
            <p className="text-sm text-gray-300 whitespace-pre-wrap p-4 w-full leading-relaxed">
              {post.description}
            </p>
          ) : fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-sky-400 hover:underline p-6"
            >
              Open file ↗
            </a>
          ) : (
            <p className="text-sm text-gray-600 p-6">No content to preview.</p>
          )}
        </div>

        {post.description && type !== "text" && (
          <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">
            {post.description}
          </p>
        )}

        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-4 text-xs text-sky-400 hover:underline"
          >
            Open original file ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Challenges Tab ───────────────────────────────────────────────────────────

function ChallengesTab({
  showToast,
}: {
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [form, setForm] =
    useState<Omit<Challenge, "id" | "created_at" | "entries_count" | "winner_user_id">>(
      EMPTY_CHALLENGE,
    );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [categoriesInput, setCategoriesInput] = useState("");
  const [participantsFor, setParticipantsFor] = useState<Challenge | null>(null);
  const {
    currentPage,
    setCurrentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedItems,
  } = usePagination(challenges, {
    pageSize: COMMUNITY_PAGE_SIZE,
    resetKeys: [challenges.length],
  });

  useEffect(() => {
    fetchChallenges();
  }, []);

  const fetchChallenges = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setChallenges(data as Challenge[]);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_CHALLENGE);
    setCategoriesInput("");
    setShowForm(true);
  };

  const openEdit = (c: Challenge) => {
    setEditing(c);
    setForm({
      title: c.title,
      theme: c.theme || "",
      badge: c.badge || "",
      prize: c.prize || "",
      prize_credits: c.prize_credits ?? null,
      content_type: c.content_type || "any",
      requires_join: c.requires_join ?? true,
      start_at: c.start_at ? c.start_at.slice(0, 16) : "",
      deadline: c.deadline ? c.deadline.slice(0, 16) : "",
      categories: c.categories || [],
      judging: c.judging || "",
      rules: c.rules || [],
      status: c.status,
      description: c.description || "",
    });
    setCategoriesInput((c.categories || []).join(", "));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      showToast("Title is required.", "error");
      return;
    }
    setSaving(true);
    const startIso = form.start_at ? new Date(form.start_at).toISOString() : null;
    const deadlineIso = form.deadline
      ? new Date(form.deadline).toISOString()
      : null;
    const payload = {
      title: form.title.trim(),
      description: form.description || null,
      content_type: form.content_type,
      prize_credits:
        form.prize_credits != null && form.prize_credits > 0
          ? Math.floor(form.prize_credits)
          : null,
      requires_join: form.requires_join,
      rules: (form.rules || []).filter((r) => r.trim()),
      start_at: startIso,
      deadline: deadlineIso,
      status: deriveStatus(startIso, deadlineIso),
    };

    if (editing) {
      const { error } = await supabase
        .from("challenges")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        showToast("Failed to update challenge.", "error");
      } else {
        showToast("Challenge updated.");
        fetchChallenges();
        setShowForm(false);
      }
    } else {
      const { error } = await supabase
        .from("challenges")
        .insert({ ...payload, entries_count: 0 });
      if (error) {
        showToast("Failed to create challenge.", "error");
      } else {
        showToast("Challenge created.");
        fetchChallenges();
        setShowForm(false);
      }
    }
    setSaving(false);
  };

  const deleteChallenge = async (c: Challenge) => {
    if (!confirm(`Delete challenge "${c.title}"?`)) return;
    setDeleting(c.id);
    const { error } = await supabase.from("challenges").delete().eq("id", c.id);
    if (error) {
      showToast("Failed to delete.", "error");
    } else {
      setChallenges((prev) => prev.filter((x) => x.id !== c.id));
      showToast("Challenge deleted.");
    }
    setDeleting(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <span className="text-gray-600 text-xs">
          {challenges.length} challenge{challenges.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
        >
          <PlusCircle size={16} weight="bold" />
          New Challenge
        </button>
      </div>

      {loading ? (
        <div className="text-gray-600 text-sm py-8 text-center">
          Loading challenges…
        </div>
      ) : challenges.length === 0 ? (
        <div className="text-gray-600 text-sm py-8 text-center">
          No challenges yet.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {(paginatedItems as Challenge[]).map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-4 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-4 hover:border-white/[0.14] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium text-sm truncate">
                      {c.title}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${
                        c.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : c.status === "ended"
                            ? "bg-gray-500/10 text-gray-500 border-gray-500/20"
                            : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                    <span className="capitalize">
                      Content: {c.content_type || "any"}
                    </span>
                    {c.prize_credits ? (
                      <span className="text-amber-400/80">
                        Prize: {c.prize_credits.toLocaleString()} credits
                      </span>
                    ) : (
                      c.prize && <span>Prize: {c.prize}</span>
                    )}
                    {c.requires_join && <span>Join required</span>}
                    {c.start_at && <span>Starts: {fmtDMY(c.start_at)}</span>}
                    {c.deadline && <span>Deadline: {fmtDMY(c.deadline)}</span>}
                    <span>{c.entries_count} entries</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setParticipantsFor(c)}
                    className="text-xs px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 rounded-lg transition-colors"
                  >
                    Entries
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    className="text-xs px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteChallenge(c)}
                    disabled={deleting === c.id}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <AdminPagination
            currentPage={currentPage}
            totalItems={totalItems}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            itemLabel="challenges"
            className="mt-4"
          />
        </>
      )}

      {/* Participants Modal */}
      {participantsFor && (
        <ParticipantsModal
          challenge={participantsFor}
          showToast={showToast}
          onClose={() => setParticipantsFor(null)}
          onWinnerSet={fetchChallenges}
        />
      )}

      {/* Challenge Form Modal */}
      {showForm && (
        <ChallengeFormModal
          form={form}
          setForm={setForm}
          categoriesInput={categoriesInput}
          setCategoriesInput={setCategoriesInput}
          editing={editing}
          saving={saving}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

type Entry = {
  post: Post;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
  rating: number; // 0 = unrated
};

// Clickable 1–5 star rating row.
function StarRating({
  value,
  onRate,
  busy,
}: {
  value: number;
  onRate: (v: number) => void;
  busy: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={busy}
            onMouseEnter={() => setHover(n)}
            onClick={() => onRate(n)}
            className={`text-base leading-none transition-colors disabled:opacity-40 ${
              filled ? "text-amber-400" : "text-gray-600 hover:text-amber-400/60"
            }`}
            title={`${n} star${n > 1 ? "s" : ""}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function ParticipantsModal({
  challenge,
  showToast,
  onClose,
  onWinnerSet,
}: {
  challenge: Challenge;
  showToast: (msg: string, type?: "success" | "error") => void;
  onClose: () => void;
  onWinnerSet: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [winnerId, setWinnerId] = useState<string | null>(
    challenge.winner_user_id ?? null,
  );
  const [awarding, setAwarding] = useState<string | null>(null);
  const [ratingBusy, setRatingBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Post | null>(null);
  const {
    currentPage,
    setCurrentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedItems,
  } = usePagination(entries, {
    pageSize: COMMUNITY_ENTRY_PAGE_SIZE,
    resetKeys: [challenge.id, entries.length],
  });

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Entries are stored in challenge_entries (separate from posts).
      const { data: posts } = await supabase
        .from("challenge_entries")
        .select(
          "id, title, content_type, created_at, user_id, storage_path, thumbnail_path, description",
        )
        .eq("challenge_id", challenge.id)
        .order("created_at", { ascending: true });

      const ids = Array.from(
        new Set((posts || []).map((p: any) => p.user_id)),
      );
      const profileMap = new Map<string, any>();
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        (profiles || []).forEach((p: any) => profileMap.set(p.id, p));
      }

      // Existing ratings for this challenge.
      const ratingMap = new Map<string, number>();
      const { data: ratings } = await supabase
        .from("challenge_ratings")
        .select("entry_id, rating")
        .eq("challenge_id", challenge.id);
      (ratings || []).forEach((r: any) => ratingMap.set(r.entry_id, r.rating));

      setEntries(
        (posts || []).map((p: any) => ({
          post: {
            id: p.id,
            title: p.title,
            content_type: p.content_type,
            created_at: p.created_at,
            is_public: true,
            user_id: p.user_id,
            storage_path: p.storage_path ?? null,
            thumbnail_path: p.thumbnail_path ?? null,
            description: p.description ?? null,
          },
          display_name: profileMap.get(p.user_id)?.display_name ?? null,
          avatar_url: profileMap.get(p.user_id)?.avatar_url ?? null,
          joined_at: p.created_at,
          rating: ratingMap.get(p.id) ?? 0,
        })),
      );
      setLoading(false);
    })();
  }, [challenge.id]);

  const rateEntry = async (postId: string, rating: number) => {
    setRatingBusy(postId);
    // optimistic
    setEntries((prev) =>
      prev.map((e) => (e.post.id === postId ? { ...e, rating } : e)),
    );
    const { error } = await supabase.from("challenge_ratings").upsert(
      {
        challenge_id: challenge.id,
        entry_id: postId,
        rating,
      },
      { onConflict: "challenge_id,entry_id" },
    );
    if (error) showToast("Failed to save rating.", "error");
    setRatingBusy(null);
  };

  const awardWinner = async (e: Entry) => {
    const credits = challenge.prize_credits || 0;
    if (
      !confirm(
        `Set "${e.display_name || "this user"}" as winner` +
          (credits > 0 ? ` and award ${credits} credits?` : "?"),
      )
    )
      return;
    setAwarding(e.post.user_id);
    try {
      await supabase
        .from("challenges")
        .update({ winner_user_id: e.post.user_id })
        .eq("id", challenge.id);

      if (credits > 0) {
        const { data: existing } = await supabase
          .from("user_credits")
          .select("balance, subscription_credits, purchased_credits")
          .eq("user_id", e.post.user_id)
          .maybeSingle();

        if (existing) {
          const subscriptionCredits = Math.max(
            0,
            Number((existing as any).subscription_credits || 0),
          );
          const purchasedCredits =
            (existing as any).purchased_credits != null
              ? Math.max(0, Number((existing as any).purchased_credits || 0))
              : Math.max(0, Number(existing.balance || 0));
          await supabase
            .from("user_credits")
            .update({
              subscription_credits: subscriptionCredits,
              purchased_credits: purchasedCredits + credits,
              balance: subscriptionCredits + purchasedCredits + credits,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", e.post.user_id);
        } else {
          await supabase.from("user_credits").insert({
            user_id: e.post.user_id,
            subscription_credits: 0,
            purchased_credits: credits,
            balance: credits,
            total_purchased: 0,
            total_spent: 0,
          });
        }

        await supabase.from("credit_transactions").insert({
          user_id: e.post.user_id,
          amount: credits,
          type: "bonus",
          action: "challenge_prize",
          description: `Prize for winning "${challenge.title}"`,
        });

        await supabase.from("notifications").insert({
          user_id: e.post.user_id,
          type: "credits_purchased",
          title: "🏆 You won a challenge!",
          body: `${credits.toLocaleString()} credits were added for winning "${challenge.title}"`,
          link: "/community/feed",
        });
      }

      setWinnerId(e.post.user_id);
      onWinnerSet();
      showToast(
        credits > 0 ? `Winner set — ${credits} credits awarded.` : "Winner set.",
      );
    } catch {
      showToast("Failed to set winner.", "error");
    }
    setAwarding(null);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-white/[0.1] rounded-2xl w-full max-w-4xl flex flex-col"
        style={{ maxHeight: "calc(100vh - 80px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
          <div>
            <h3 className="text-white font-semibold text-sm">Entries</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[420px]">
              {challenge.title}
              {challenge.prize_credits
                ? ` · Prize: ${challenge.prize_credits.toLocaleString()} credits`
                : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3 overflow-y-auto flex-1 min-h-0" data-lenis-prevent>
          {loading ? (
            <div className="text-gray-600 text-sm py-8 text-center">
              Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="text-gray-600 text-sm py-8 text-center">
              No entries submitted yet.
            </div>
          ) : (
            <>
              <div className="columns-2 md:columns-4 gap-3">
                {(paginatedItems as Entry[]).map((e) => {
                  const isWinner = winnerId === e.post.user_id;
                  const type = (e.post.content_type || "").toLowerCase();
                  const thumb = storageUrl("challenge-entries", e.post.thumbnail_path || e.post.storage_path);
                  return (
                    <div
                      key={e.post.id}
                      className={`break-inside-avoid mb-3 rounded-xl border overflow-hidden ${
                        isWinner ? "border-amber-500/40 ring-1 ring-amber-500/20" : "border-white/[0.06]"
                      } bg-[#111]`}
                    >
                      {/* Media — click to preview full */}
                      <button onClick={() => setPreview(e.post)} className="relative block w-full group">
                        {isWinner && (
                          <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-amber-500/90 text-black text-[10px] font-bold">🏆 Winner</span>
                        )}
                        {(type === "image" || type === "video") && thumb ? (
                          <img src={thumb} alt={e.post.title || ""} className="w-full max-h-44 object-cover" />
                        ) : (
                          <div className="h-32 flex items-center justify-center bg-gradient-to-br from-white/[0.04] to-[#0b0b0c] text-4xl">
                            {type === "audio" ? "🎵" : type === "video" ? "🎬" : "📝"}
                          </div>
                        )}
                        {type === "video" && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white text-lg">▶</span>
                        )}
                      </button>

                      {/* Info + controls */}
                      <div className="px-3 py-2.5">
                        <p className="text-[12.5px] font-semibold text-white truncate">
                          {e.post.title || <span className="text-gray-600">Untitled</span>}
                        </p>
                        <p className="text-[10.5px] text-gray-500 truncate mb-2">
                          {e.display_name || "Unknown"} · {fmtDMY(e.joined_at)}
                        </p>
                        <StarRating
                          value={e.rating}
                          busy={ratingBusy === e.post.id}
                          onRate={(v) => rateEntry(e.post.id, v)}
                        />
                        {!isWinner && (
                          <button
                            onClick={() => awardWinner(e)}
                            disabled={awarding === e.post.user_id}
                            className="mt-2 w-full text-[11px] px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded-lg transition-colors disabled:opacity-40"
                          >
                            {awarding === e.post.user_id ? "…" : "Set winner"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <AdminPagination
                currentPage={currentPage}
                totalItems={totalItems}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                itemLabel="entries"
                className="mt-4"
              />
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.08] text-[11px] text-gray-600 shrink-0">
          {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
        </div>
      </div>

      {preview && (
        <PreviewModal post={preview} onClose={() => setPreview(null)} bucket="challenge-entries" />
      )}
    </div>
  );
}

function ChallengeFormModal({
  form,
  setForm,
  categoriesInput,
  setCategoriesInput,
  editing,
  saving,
  onSave,
  onClose,
}: {
  form: Omit<Challenge, "id" | "created_at" | "entries_count" | "winner_user_id">;
  setForm: React.Dispatch<
    React.SetStateAction<Omit<Challenge, "id" | "created_at" | "entries_count" | "winner_user_id">>
  >;
  categoriesInput: string;
  setCategoriesInput: (v: string) => void;
  editing: Challenge | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const field = (
    label: string,
    key: keyof typeof form,
    opts?: { type?: string; placeholder?: string; textarea?: boolean },
  ) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      {opts?.textarea ? (
        <textarea
          value={(form[key] as string) || ""}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, [key]: e.target.value }))
          }
          placeholder={opts?.placeholder}
          rows={3}
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
        />
      ) : (
        <input
          type={opts?.type || "text"}
          value={(form[key] as string) || ""}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, [key]: e.target.value }))
          }
          placeholder={opts?.placeholder}
          onClick={(e) => {
            // Open the native date/time picker on click anywhere in the field.
            const el = e.currentTarget as HTMLInputElement & {
              showPicker?: () => void;
            };
            if (
              (opts?.type === "datetime-local" ||
                opts?.type === "date" ||
                opts?.type === "time") &&
              typeof el.showPicker === "function"
            ) {
              try {
                el.showPicker();
              } catch {}
            }
          }}
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 [color-scheme:dark]"
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-white/[0.1] rounded-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "calc(100vh - 80px)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
          <h3 className="text-white font-semibold text-sm">
            {editing ? "Edit Challenge" : "New Challenge"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — 2-column grid */}
        <div
          className="p-5 grid grid-cols-2 gap-4 overflow-y-auto flex-1 min-h-0"
          data-lenis-prevent
        >
          <div className="col-span-2">
            {field("Title *", "title", { placeholder: "Challenge title" })}
          </div>

          {/* Accepted content type */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Accepted content
            </label>
            <select
              value={form.content_type}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, content_type: e.target.value }))
              }
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500/50 [&>option]:bg-[#0d0d0d] [&>option]:text-white"
            >
              {CHALLENGE_CONTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-[#0d0d0d] text-white">
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Prize credits */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Prize (credits to winner)
            </label>
            <input
              type="number"
              min={0}
              value={form.prize_credits ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  prize_credits:
                    e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder="e.g. 500"
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
            />
          </div>

          {/* Scheduling */}
          <div>
            {field("Starts", "start_at", { type: "datetime-local" })}
            {form.start_at && (
              <p className="mt-1 text-[11px] text-gray-500">
                {fmtDMY(form.start_at, true)}
              </p>
            )}
          </div>
          <div>
            {field("Deadline", "deadline", { type: "datetime-local" })}
            {form.deadline && (
              <p className="mt-1 text-[11px] text-gray-500">
                {fmtDMY(form.deadline, true)}
              </p>
            )}
          </div>

          <div className="col-span-2">
            {field("Description", "description", {
              placeholder: "Challenge details…",
              textarea: true,
            })}
          </div>

          {/* Rules — point by point */}
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-2">Rules</label>
            <div className="space-y-2">
              {(form.rules || []).map((rule, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[11px] text-gray-600 pt-2.5 w-5 shrink-0">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={rule}
                    onChange={(e) => {
                      const updated = [...(form.rules || [])];
                      updated[i] = e.target.value;
                      setForm((prev) => ({ ...prev, rules: updated }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const updated = [...(form.rules || [])];
                        updated.splice(i + 1, 0, "");
                        setForm((prev) => ({ ...prev, rules: updated }));
                        // Focus next input after render
                        setTimeout(() => {
                          const inputs = document.querySelectorAll<HTMLInputElement>(
                            "[data-rule-input]",
                          );
                          inputs[i + 1]?.focus();
                        }, 0);
                      }
                      if (
                        e.key === "Backspace" &&
                        rule === "" &&
                        (form.rules || []).length > 1
                      ) {
                        e.preventDefault();
                        const updated = [...(form.rules || [])];
                        updated.splice(i, 1);
                        setForm((prev) => ({ ...prev, rules: updated }));
                        setTimeout(() => {
                          const inputs = document.querySelectorAll<HTMLInputElement>(
                            "[data-rule-input]",
                          );
                          inputs[Math.max(0, i - 1)]?.focus();
                        }, 0);
                      }
                    }}
                    data-rule-input
                    placeholder={`Rule ${i + 1}…`}
                    className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...(form.rules || [])].filter(
                        (_, j) => j !== i,
                      );
                      setForm((prev) => ({ ...prev, rules: updated }));
                    }}
                    className="mt-1 p-1.5 text-gray-700 hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    rules: [...(prev.rules || []), ""],
                  }))
                }
                className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-white transition-colors py-1"
              >
                <PlusCircle size={14} />
                Add rule
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Signals Tab ──────────────────────────────────────────────────────────────

function SignalsTab({
  showToast,
}: {
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Signal | null>(null);
  const [form, setForm] =
    useState<Omit<Signal, "id" | "created_at">>(EMPTY_SIGNAL);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const {
    currentPage,
    setCurrentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedItems,
  } = usePagination(signals, {
    pageSize: COMMUNITY_PAGE_SIZE,
    resetKeys: [signals.length],
  });

  useEffect(() => {
    fetchSignals();
  }, []);

  const fetchSignals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setSignals(data as Signal[]);
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_SIGNAL,
      published_at: new Date().toISOString().slice(0, 16),
    });
    setShowForm(true);
  };

  const openEdit = (s: Signal) => {
    setEditing(s);
    setForm({
      tag: s.tag,
      tag_color: s.tag_color || "#ef4444",
      title: s.title,
      subtitle: s.subtitle || "",
      description: s.description || "",
      published_at: s.published_at ? s.published_at.slice(0, 16) : "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.tag.trim()) {
      showToast("Title and Tag are required.", "error");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      published_at: form.published_at
        ? new Date(form.published_at).toISOString()
        : null,
    };

    if (editing) {
      const { error } = await supabase
        .from("signals")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        showToast("Failed to update signal.", "error");
      } else {
        showToast("Signal updated.");
        fetchSignals();
        setShowForm(false);
      }
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        showToast("Session expired. Please log in again.", "error");
        setSaving(false);
        return;
      }

      const response = await fetch("/api/superadmin/community/signals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      let result: { error?: string } = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (!response.ok) {
        showToast(result.error || "Failed to create signal.", "error");
      } else {
        showToast("Signal created.");
        fetchSignals();
        setShowForm(false);
      }
    }
    setSaving(false);
  };

  const deleteSignal = async (s: Signal) => {
    if (!confirm(`Delete signal "${s.title}"?`)) return;
    setDeleting(s.id);
    const { error } = await supabase.from("signals").delete().eq("id", s.id);
    if (error) {
      showToast("Failed to delete.", "error");
    } else {
      setSignals((prev) => prev.filter((x) => x.id !== s.id));
      showToast("Signal deleted.");
    }
    setDeleting(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <span className="text-gray-600 text-xs">
          {signals.length} signal{signals.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
        >
          <PlusCircle size={16} weight="bold" />
          New Signal
        </button>
      </div>

      {loading ? (
        <div className="text-gray-600 text-sm py-8 text-center">
          Loading signals…
        </div>
      ) : signals.length === 0 ? (
        <div className="text-gray-600 text-sm py-8 text-center">
          No signals yet.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {(paginatedItems as Signal[]).map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between gap-4 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-4 hover:border-white/[0.14] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                      style={{
                        background: `${s.tag_color || "#ef4444"}22`,
                        color: s.tag_color || "#ef4444",
                        border: `1px solid ${s.tag_color || "#ef4444"}40`,
                      }}
                    >
                      {s.tag}
                    </span>
                    <span className="text-white font-medium text-sm truncate">
                      {s.title}
                    </span>
                  </div>
                  {s.subtitle && (
                    <p className="text-xs text-gray-500 truncate">{s.subtitle}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 text-xs text-gray-600 mt-0.5">
                    {s.published_at && (
                      <span>
                        Published: {new Date(s.published_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => openEdit(s)}
                    className="text-xs px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteSignal(s)}
                    disabled={deleting === s.id}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <AdminPagination
            currentPage={currentPage}
            totalItems={totalItems}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            itemLabel="signals"
            className="mt-4"
          />
        </>
      )}

      {/* Signal Form Modal */}
      {showForm && (
        <SignalFormModal
          form={form}
          setForm={setForm}
          editing={editing}
          saving={saving}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function SignalFormModal({
  form,
  setForm,
  editing,
  saving,
  onSave,
  onClose,
}: {
  form: Omit<Signal, "id" | "created_at">;
  setForm: React.Dispatch<
    React.SetStateAction<Omit<Signal, "id" | "created_at">>
  >;
  editing: Signal | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const field = (
    label: string,
    key: keyof typeof form,
    opts?: { type?: string; placeholder?: string; textarea?: boolean },
  ) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      {opts?.textarea ? (
        <textarea
          value={(form[key] as string) || ""}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, [key]: e.target.value }))
          }
          placeholder={opts?.placeholder}
          rows={3}
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
        />
      ) : (
        <input
          type={opts?.type || "text"}
          value={(form[key] as string) || ""}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, [key]: e.target.value }))
          }
          placeholder={opts?.placeholder}
          onClick={(e) => {
            // Open the native date/time picker on click anywhere in the field.
            const el = e.currentTarget as HTMLInputElement & {
              showPicker?: () => void;
            };
            if (
              (opts?.type === "datetime-local" ||
                opts?.type === "date" ||
                opts?.type === "time") &&
              typeof el.showPicker === "function"
            ) {
              try {
                el.showPicker();
              } catch {}
            }
          }}
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 [color-scheme:dark]"
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#0d0d0d] border border-white/[0.1] rounded-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "calc(100vh - 80px)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
          <h3 className="text-white font-semibold text-sm">
            {editing ? "Edit Signal" : "New Signal"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-white rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — 2-column grid */}
        <div
          className="p-5 grid grid-cols-2 gap-4 overflow-y-auto flex-1 min-h-0"
          data-lenis-prevent
        >
          {field("Tag *", "tag", { placeholder: "e.g. TREND, ALERT, HOT" })}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Tag Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.tag_color || "#ef4444"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tag_color: e.target.value }))
                }
                className="w-9 h-9 rounded cursor-pointer bg-transparent border border-white/10 flex-shrink-0"
              />
              <input
                type="text"
                value={form.tag_color || "#ef4444"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, tag_color: e.target.value }))
                }
                placeholder="#ef4444"
                className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
              />
            </div>
          </div>
          {field("Title *", "title", { placeholder: "Signal headline" })}
          {field("Subtitle", "subtitle", {
            placeholder: "Short supporting text",
          })}
          {field("Publish Date", "published_at", { type: "datetime-local" })}
          <div />
          <div className="col-span-2">
            {field("Description", "description", {
              placeholder: "Full signal description…",
              textarea: true,
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Signal"}
          </button>
        </div>
      </div>
    </div>
  );
}
