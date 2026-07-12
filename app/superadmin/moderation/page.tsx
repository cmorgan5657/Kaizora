"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminPagination from "@/app/components/AdminPagination";
import { usePagination } from "@/app/hooks/usePagination";
import {
  Shield, CheckCircle, X, ArrowsClockwise, Image as ImageIcon,
  Robot, Flag, Trash, Eye, Warning, SlidersHorizontal, Info, User,
  FunnelSimple, Clock, DotsThreeVertical,
} from "phosphor-react";

interface ContentFlag {
  id: string;
  asset_id: string;
  source: "ai_scan" | "user_report";
  status: "pending" | "approved" | "removed";
  severity: "high" | "medium" | null;
  categories: Record<string, number> | null;
  ai_explanation: string | null;
  report_reason: string | null;
  report_description: string | null;
  created_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
  kind?: "asset" | "post";
  asset: {
    id: string; title: string; content_type: string;
    storage_path: string; thumbnail_path: string | null;
    is_public: boolean;
    owner: { display_name: string; email: string } | null;
    kind?: "asset" | "post";
    preview_url?: string | null;
  } | null;
  reporter: { display_name: string; email: string } | null;
}

interface ModerationSettings { id: string; high_threshold: number; medium_threshold: number; auto_delete_community: boolean }

const REASONS: Record<string, string> = {
  copyright: "Copyright / DMCA", nudity: "Nudity / Explicit", violence: "Violence / Gore",
  hate_speech: "Hate Speech", spam: "Spam / Misleading", other: "Other",
};
const CATS: Record<string, string> = {
  nudity: "Nudity",
  violence: "Violence",
  explicit_content: "Explicit",
  hate_speech: "Hate Speech",
  celebrity_likeness: "Celebrity",
};
const PAGE_SIZE = 15;

export default function ModerationPage() {
  const [flags, setFlags] = useState<ContentFlag[]>([]);
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "approved" | "removed" | "results">("pending");
  const [source, setSource] = useState<"all" | "ai_scan" | "user_report">("all");
  const [modal, setModal] = useState<ContentFlag | null>(null);
  const [note, setNote] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hiT, setHiT] = useState(85);
  const [midT, setMidT] = useState(50);
  const [autoDeleteCommunity, setAutoDeleteCommunity] = useState(false);
  const [saving, setSaving] = useState(false);

  const url = (p: string | null) =>
    p ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${p}` : null;

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }
    const res = await fetch("/api/admin/moderation/flags", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(r => r.json());
    if (res.error) console.error(res.error);
    setFlags(res.flags || []);
    try {
      const s = await supabase.from("moderation_settings").select("*").limit(1).single();
      if (s.data) { setSettings(s.data); setHiT(s.data.high_threshold); setMidT(s.data.medium_threshold); setAutoDeleteCommunity(s.data.auto_delete_community ?? false); }
    } catch { /**/ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(flagId: string, action: "approve" | "remove") {
    setActionLoading(flagId + action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/moderation/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ flag_id: flagId, action, admin_note: note }),
      }).then(r => r.json());
      if (res.success) { setModal(null); setNote(""); await load(); }
      else alert(res.error || "Something went wrong.");
    } catch { alert("Something went wrong."); }
    finally { setActionLoading(null); }
  }

  async function saveSettings() {
    if (!settings) return;
    if (midT >= hiT) { alert("'Flag for Review' must be lower than 'Block Immediately'."); return; }
    setSaving(true);
    await supabase.from("moderation_settings").update({ high_threshold: hiT, medium_threshold: midT, auto_delete_community: autoDeleteCommunity }).eq("id", settings.id);
    setSaving(false); setSettingsOpen(false); await load();
  }

  const list = tab === "results"
    ? flags.filter(f => f.source === "ai_scan")
    : flags.filter(f => f.status === tab && (source === "all" || f.source === source));
  const {
    currentPage,
    setCurrentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedItems,
  } = usePagination(list, {
    pageSize: PAGE_SIZE,
    resetKeys: [tab, source, list.length],
  });
  const counts = { pending: flags.filter(f => f.status === "pending").length, approved: flags.filter(f => f.status === "approved").length, removed: flags.filter(f => f.status === "removed").length, results: flags.filter(f => f.source === "ai_scan").length };

  function topIssue(cats: ContentFlag["categories"]) {
    if (!cats) return null;
    const top = (Object.entries(cats) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 50 ? { name: CATS[top[0]] || top[0], score: top[1] } : null;
  }
  function isLowConfidenceAiFlag(flag: ContentFlag) {
    if (flag.source !== "ai_scan" || flag.severity !== "medium" || !flag.categories) {
      return false;
    }
    const maxScore = Math.max(...Object.values(flag.categories), 0);
    const explanation = (flag.ai_explanation || "").toLowerCase();
    return (
      maxScore < 50 &&
      (explanation.includes("no policy violations") ||
        explanation.includes("no celebrities detected"))
    );
  }
  const sColor = (n: number) => n >= 85 ? "text-red-400" : n >= 50 ? "text-yellow-400" : "text-emerald-400";
  const sBg = (n: number) => n >= 85 ? "bg-red-500" : n >= 50 ? "bg-yellow-500" : "bg-emerald-500";
  const ago = (d: string) => { const m = Math.floor((Date.now() - +new Date(d)) / 60000); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };

  if (loading) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-600">
        <ArrowsClockwise size={18} className="animate-spin" />
        <span className="text-sm">Loading moderation data…</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080808] text-white">

      {/* ── Top Header ── */}
      <div className="border-b border-white/[0.06] bg-[#080808] sticky top-0 z-10">
        <div className="px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/20 flex items-center justify-center">
              <Shield size={20} className="text-red-400" weight="fill" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white tracking-tight">Content Moderation</h1>
              <p className="text-xs text-gray-500 mt-0.5">Review flagged content · view AI scan logs · take action</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-xl transition-all cursor-pointer">
              <SlidersHorizontal size={13} />AI Settings
            </button>
            <button onClick={load}
              className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-xl transition-all cursor-pointer">
              <ArrowsClockwise size={13} />Refresh
            </button>
          </div>
        </div>

        {/* Stat row */}
        <div className="px-8 pb-5 grid grid-cols-4 gap-3">
          {([
            { key: "pending", label: "Needs Review", icon: Clock, accent: "yellow", count: counts.pending, desc: "Awaiting action" },
            { key: "approved", label: "Approved Logs", icon: CheckCircle, accent: "emerald", count: counts.approved, desc: "Safe scans + kept content" },
            { key: "removed", label: "Removed", icon: Trash, accent: "red", count: counts.removed, desc: "Taken down" },
            { key: "results", label: "Scan Results", icon: Robot, accent: "blue", count: counts.results, desc: "All AI scan logs" },
          ] as const).map(({ key, label, icon: Icon, accent, count, desc }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`relative text-left px-5 py-4 rounded-2xl border transition-all cursor-pointer overflow-hidden group ${
                tab === key
                  ? accent === "yellow" ? "border-yellow-500/30 bg-yellow-500/[0.07]"
                    : accent === "emerald" ? "border-emerald-500/30 bg-emerald-500/[0.07]"
                    : accent === "blue" ? "border-blue-500/30 bg-blue-500/[0.07]"
                    : "border-red-500/30 bg-red-500/[0.07]"
                  : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]"
              }`}>
              {tab === key && (
                <div className={`absolute inset-x-0 top-0 h-px ${
                  accent === "yellow" ? "bg-yellow-500/60" : accent === "emerald" ? "bg-emerald-500/60" : accent === "blue" ? "bg-blue-500/60" : "bg-red-500/60"
                }`} />
              )}
              <div className="flex items-start justify-between">
                <div>
                  <div className={`text-3xl font-light tracking-tight mb-1 ${
                    tab === key
                      ? accent === "yellow" ? "text-yellow-400" : accent === "emerald" ? "text-emerald-400" : accent === "blue" ? "text-blue-400" : "text-red-400"
                      : "text-white"
                  }`}>{count}</div>
                  <div className="text-xs font-medium text-white">{label}</div>
                  <div className="text-[11px] text-gray-600 mt-0.5">{desc}</div>
                </div>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  accent === "yellow" ? "bg-yellow-500/10" : accent === "emerald" ? "bg-emerald-500/10" : accent === "blue" ? "bg-blue-500/10" : "bg-red-500/10"
                }`}>
                  <Icon size={15} weight="fill" className={
                    accent === "yellow" ? "text-yellow-500" : accent === "emerald" ? "text-emerald-500" : accent === "blue" ? "text-blue-500" : "text-red-500"
                  } />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-8 py-6">

        {/* Source filter + count — hidden on results tab */}
        {tab !== "results" && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
              {([
                { key: "all", label: "All" },
                { key: "ai_scan", label: "AI Detected" },
                { key: "user_report", label: "User Reports" },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setSource(f.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                    source === f.key ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                  }`}>
                  {f.key === "ai_scan" && <Robot size={11} />}
                  {f.key === "user_report" && <Flag size={11} />}
                  {f.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-600">{list.length} result{list.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {/* ── Scan Results tab ── */}
        {tab === "results" && (
          <>
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs text-gray-600">All AI scan logs — read only</p>
              <span className="text-xs text-gray-600">{list.length} scan{list.length !== 1 ? "s" : ""}</span>
            </div>

            {list.length === 0 && (
              <div className="max-w-lg mx-auto mt-10 border border-white/[0.07] bg-white/[0.02] rounded-3xl px-8 py-14 text-center">
                <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 mx-auto">
                  <Robot size={28} className="text-blue-700" weight="duotone" />
                </div>
                <p className="text-sm font-light text-gray-400 mb-1">No scan results yet</p>
                <p className="text-xs text-gray-700">AI scan logs appear here after assets or posts are uploaded.</p>
              </div>
            )}

            {list.length > 0 && (
              <>
              <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 bg-white/[0.02] border-b border-white/[0.06]">
                  {["Asset / Owner", "Status", "Nudity", "Violence", "Explicit / Hate"].map((h, i) => (
                    <div key={i} className="text-[11px] font-medium text-gray-600 uppercase tracking-wider">{h}</div>
                  ))}
                </div>
                {(paginatedItems as ContentFlag[]).map((flag, i) => {
                  const asset = flag.asset;
                  const thumb = asset?.preview_url ?? url(asset?.content_type === "image" ? (asset.storage_path ?? null) : (asset?.thumbnail_path ?? null));
                  const cats = flag.categories;
                  const lowConfidenceAiFlag = isLowConfidenceAiFlag(flag);
                  return (
                    <div key={flag.id}
                      className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 items-center px-5 py-4 border-b border-white/[0.04] last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>

                      {/* Asset */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 shrink-0 rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={13} className="text-gray-700" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="text-sm text-white font-light truncate">{asset?.title || "Untitled"}</div>
                            {flag.kind === "post" && (
                              <span className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/15">Post</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-600 truncate">{asset?.owner?.display_name || asset?.owner?.email || "Unknown"} · {ago(flag.created_at)}</div>
                        </div>
                      </div>

                      {/* Status */}
                      <div>
                        {flag.status === "approved" && !flag.severity ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                            <CheckCircle size={10} weight="fill" /> Safe
                          </span>
                        ) : flag.severity === "high" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-red-500/10 text-red-400 border border-red-500/15">
                            <Warning size={10} weight="fill" /> Blocked
                          </span>
                        ) : flag.severity === "medium" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/15">
                            <Warning size={10} weight="fill" /> {lowConfidenceAiFlag ? "Review" : "Flagged"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                            <CheckCircle size={10} weight="fill" /> Safe
                          </span>
                        )}
                      </div>

                      {/* Nudity */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${sBg(cats?.nudity ?? 0)}`} style={{ width: `${cats?.nudity ?? 0}%`, opacity: 0.8 }} />
                        </div>
                        <span className={`text-[11px] font-mono w-6 text-right ${sColor(cats?.nudity ?? 0)}`}>{cats?.nudity ?? "—"}</span>
                      </div>

                      {/* Violence */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${sBg(cats?.violence ?? 0)}`} style={{ width: `${cats?.violence ?? 0}%`, opacity: 0.8 }} />
                        </div>
                        <span className={`text-[11px] font-mono w-6 text-right ${sColor(cats?.violence ?? 0)}`}>{cats?.violence ?? "—"}</span>
                      </div>

                      {/* Explicit + Hate */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-700 w-10 shrink-0">Expl.</span>
                          <div className="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${sBg(cats?.explicit_content ?? 0)}`} style={{ width: `${cats?.explicit_content ?? 0}%`, opacity: 0.8 }} />
                          </div>
                          <span className={`text-[10px] font-mono w-5 text-right ${sColor(cats?.explicit_content ?? 0)}`}>{cats?.explicit_content ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-700 w-10 shrink-0">Hate</span>
                          <div className="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${sBg(cats?.hate_speech ?? 0)}`} style={{ width: `${cats?.hate_speech ?? 0}%`, opacity: 0.8 }} />
                          </div>
                          <span className={`text-[10px] font-mono w-5 text-right ${sColor(cats?.hate_speech ?? 0)}`}>{cats?.hate_speech ?? "—"}</span>
                        </div>
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
                itemLabel="scan results"
                className="mt-4"
              />
              </>
            )}
            {list.length === 0 && (
              <AdminPagination
                currentPage={currentPage}
                totalItems={totalItems}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                itemLabel="scan results"
                className="mt-4"
              />
            )}
          </>
        )}

        {/* ── Default tabs (pending / approved / removed) ── */}
        {tab !== "results" && (
          <>
            {/* Empty */}
            {list.length === 0 && (
              <div className="max-w-lg mx-auto mt-10 border border-white/[0.07] bg-white/[0.02] rounded-3xl px-8 py-14 text-center">
                <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 mx-auto">
                  <Shield size={28} className="text-gray-700" weight="duotone" />
                </div>
                <p className="text-sm font-light text-gray-400 mb-1">
                  {tab === "pending" ? "All clear — nothing to review" : tab === "approved" ? "No approved scan logs yet" : `No ${tab} content`}
                </p>
                <p className="text-xs text-gray-700">
                  {tab === "pending" ? "New flags will appear here automatically." : tab === "approved" ? "Safe AI moderation results will appear here after upload or manual scan." : "Reviewed items will appear here."}
                </p>
              </div>
            )}

            {/* Table */}
            {list.length > 0 && (
              <>
              <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
                {/* Table head */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-white/[0.02] border-b border-white/[0.06]">
                  {["Asset", "Source", "Risk", "Date", ""].map((h, i) => (
                    <div key={i} className="text-[11px] font-medium text-gray-600 uppercase tracking-wider">{h}</div>
                  ))}
                </div>

                {/* Rows */}
                {(paginatedItems as ContentFlag[]).map((flag, i) => {
                  const asset = flag.asset;
                  const thumb = asset?.preview_url ?? url(asset?.content_type === "image" ? (asset.storage_path ?? null) : (asset?.thumbnail_path ?? null));
                  const issue = topIssue(flag.categories);
                  const lowConfidenceAiFlag = isLowConfidenceAiFlag(flag);
                  return (
                    <div key={flag.id}
                      className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-center px-5 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors group ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>

                      {/* Asset */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={14} className="text-gray-700" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-sm text-white font-light truncate">{asset?.title || "Untitled"}</div>
                            {flag.kind === "post" && (
                              <span className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/15">Post</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-600 truncate">{asset?.owner?.display_name || asset?.owner?.email || "Unknown"}</div>
                        </div>
                      </div>

                      {/* Source */}
                      <div>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
                          flag.source === "ai_scan" ? "bg-blue-500/10 text-blue-400 border border-blue-500/15" : "bg-orange-500/10 text-orange-400 border border-orange-500/15"
                        }`}>
                          {flag.source === "ai_scan" ? <Robot size={10} /> : <Flag size={10} />}
                          {flag.source === "ai_scan" ? "AI Scan" : "Report"}
                        </span>
                      </div>

                      {/* Risk */}
                      <div>
                        {flag.severity ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                            flag.severity === "high"
                              ? "bg-red-500/10 text-red-400 border-red-500/15"
                              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/15"
                          }`}>
                            <Warning size={10} weight="fill" />
                            {flag.severity === "high" ? "High" : lowConfidenceAiFlag ? "Review" : "Medium"}
                          </span>
                        ) : flag.source === "user_report" ? (
                          <span className="text-xs text-gray-600">{REASONS[flag.report_reason || ""] || flag.report_reason || "—"}</span>
                        ) : (
                          <span className="text-xs text-gray-700">—</span>
                        )}
                      </div>

                      {/* Date */}
                      <div className="text-xs text-gray-600">{ago(flag.created_at)}</div>

                      {/* Action */}
                      <div>
                        <button
                          onClick={() => { setModal(flag); setNote(""); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] rounded-xl transition-all cursor-pointer opacity-0 group-hover:opacity-100">
                          <Eye size={12} />Review
                        </button>
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
                itemLabel="flags"
                className="mt-4"
              />
              </>
            )}
            {list.length === 0 && (
              <AdminPagination
                currentPage={currentPage}
                totalItems={totalItems}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                itemLabel="flags"
                className="mt-4"
              />
            )}
          </>
        )}
      </div>

      {/* ══ REVIEW MODAL ══ */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setModal(null)} />
          <div className="relative w-full max-w-4xl bg-[#0e0e0e] border border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "calc(100vh - 80px)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-sm font-semibold text-white">{modal.asset?.title || "Untitled"}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                  modal.source === "ai_scan"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                }`}>
                  {modal.source === "ai_scan" ? "AI Detected" : "User Report"}
                </span>
                    {modal.severity && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                        modal.severity === "high" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      }`}>
                    {modal.severity === "high" ? "⚠ High Risk" : isLowConfidenceAiFlag(modal) ? "⚡ Needs Review" : "⚡ Medium Risk"}
                      </span>
                    )}
              </div>
              <button onClick={() => setModal(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/[0.08] text-gray-500 hover:text-white transition-all cursor-pointer">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-[1fr_380px]">

                {/* LEFT */}
                <div className="p-7 border-r border-white/[0.07] space-y-6">

                  {/* Asset preview */}
                  {(() => {
                    const a = modal.asset;
                    const t = a?.preview_url ?? url(a?.content_type === "image" ? (a.storage_path ?? null) : (a?.thumbnail_path ?? null));
                    return (
                      <div className="flex gap-5">
                        <div className="w-28 h-28 shrink-0 rounded-2xl overflow-hidden bg-black border border-white/[0.08] flex items-center justify-center">
                          {t ? <img src={t} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={30} className="text-gray-700" />}
                        </div>
                        <div className="flex-1 pt-1 space-y-2">
                          <div className="text-base font-light text-white">{a?.title || "Untitled"}</div>
                          <div className="text-xs text-gray-500 capitalize">{a?.content_type} · {a?.is_public ? "Public" : "Hidden"}</div>
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-600 uppercase tracking-wider w-14">Creator</span>
                              <span className="text-xs text-gray-300">{a?.owner?.display_name || "Unknown"}</span>
                              <span className="text-[11px] text-gray-600">{a?.owner?.email}</span>
                            </div>
                            {modal.reporter && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-600 uppercase tracking-wider w-14">Reporter</span>
                                <span className="text-xs text-orange-300">{modal.reporter.display_name || "Unknown"}</span>
                                <span className="text-[11px] text-gray-600">{modal.reporter.email}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Flag details */}
                  <div>
                    <div className="text-[11px] text-gray-600 uppercase tracking-widest mb-3 font-medium">
                      {modal.source === "ai_scan" ? "AI Analysis" : "Report Details"}
                    </div>

                    {modal.source === "ai_scan" && modal.categories && (
                      <div className="space-y-3 bg-white/[0.02] rounded-2xl border border-white/[0.06] p-5">
                        {Object.entries(modal.categories).map(([key, score]) => (
                          <div key={key} className="flex items-center gap-4">
                            <span className="text-xs text-gray-500 w-28 shrink-0">{CATS[key]}</span>
                            <div className="flex-1 h-2 bg-white/[0.05] rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${sBg(score as number)}`}
                                style={{ width: `${score}%`, opacity: 0.8 }} />
                            </div>
                            <span className={`text-xs w-7 text-right font-mono tabular-nums ${sColor(score as number)}`}>{score}</span>
                          </div>
                        ))}
                        {modal.ai_explanation && (
                          <div className="pt-3 mt-1 border-t border-white/[0.06] flex items-start gap-2">
                            <Info size={12} className="text-gray-600 mt-0.5 shrink-0" />
                            <p className="text-xs text-gray-400 leading-relaxed">{modal.ai_explanation}</p>
                          </div>
                        )}
                        {isLowConfidenceAiFlag(modal) && (
                          <div className="pt-3 mt-1 border-t border-white/[0.06] flex items-start gap-2">
                            <Info size={12} className="text-yellow-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-yellow-300/80 leading-relaxed">
                              This was sent for manual review because the AI produced low-confidence scores, not because it found a strong policy violation.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {modal.source === "user_report" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4">
                            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Reason</div>
                            <div className="text-sm text-white font-light">{REASONS[modal.report_reason || ""] || modal.report_reason || "—"}</div>
                          </div>
                          {modal.reporter && (
                            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4">
                              <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Reported by</div>
                              <div className="text-sm text-white font-light">{modal.reporter.display_name}</div>
                              <div className="text-[11px] text-gray-600 mt-0.5">{modal.reporter.email}</div>
                            </div>
                          )}
                        </div>
                        {modal.report_description && (
                          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4">
                            <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Message</div>
                            <p className="text-sm text-gray-300 leading-relaxed">"{modal.report_description}"</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT */}
                <div className="p-7 flex flex-col gap-5 bg-white/[0.01]">

                  {/* Already decided */}
                  {modal.status !== "pending" && (
                    <div className={`rounded-2xl border p-5 ${
                      modal.status === "approved" ? "border-emerald-500/20 bg-emerald-500/[0.05]" : "border-red-500/20 bg-red-500/[0.05]"
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {modal.status === "approved"
                          ? <CheckCircle size={16} weight="fill" className="text-emerald-400" />
                          : <Trash size={16} weight="fill" className="text-red-400" />}
                        <span className={`text-sm font-medium ${modal.status === "approved" ? "text-emerald-400" : "text-red-400"}`}>
                          {modal.status === "approved" ? "Approved" : "Removed"}
                        </span>
                      </div>
                      {modal.reviewed_at && <div className="text-xs text-gray-600">Reviewed {new Date(modal.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}
                      {modal.admin_note && <div className="text-xs text-gray-500 mt-2 leading-relaxed">Note: "{modal.admin_note}"</div>}
                    </div>
                  )}

                  {/* Decision */}
                  {modal.status === "pending" && (
                    <>
                      <div>
                        <div className="text-[11px] text-gray-600 uppercase tracking-widest mb-3 font-medium">Your Decision</div>
                        <div className="space-y-2">
                          <button
                            onClick={() => act(modal.id, "approve")}
                            disabled={!!actionLoading}
                            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/20 hover:bg-emerald-500/[0.14] hover:border-emerald-500/35 text-emerald-400 transition-all cursor-pointer disabled:opacity-40 group">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                              <CheckCircle size={18} weight="fill" />
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-medium">{actionLoading === modal.id + "approve" ? "Approving…" : "Keep It"}</div>
                              <div className="text-[11px] opacity-60 mt-0.5">Asset stays visible on platform</div>
                            </div>
                          </button>
                          <button
                            onClick={() => act(modal.id, "remove")}
                            disabled={!!actionLoading}
                            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-red-500/[0.08] border border-red-500/20 hover:bg-red-500/[0.14] hover:border-red-500/35 text-red-400 transition-all cursor-pointer disabled:opacity-40">
                            <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                              <Trash size={18} weight="fill" />
                            </div>
                            <div className="text-left">
                              <div className="text-sm font-medium">{actionLoading === modal.id + "remove" ? "Removing…" : "Remove It"}</div>
                              <div className="text-[11px] opacity-60 mt-0.5">Hidden + creator notified by email</div>
                            </div>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-500 mb-2">
                          Note to creator <span className="text-gray-700">(optional, sent on removal only)</span>
                        </label>
                        <textarea
                          value={note}
                          onChange={e => setNote(e.target.value)}
                          rows={4}
                          placeholder="Explain why this content was removed…"
                          className="w-full bg-black/40 border border-white/[0.08] rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-white/20 resize-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Meta */}
                  <div className="mt-auto pt-5 border-t border-white/[0.06] space-y-2">
                    {[
                      ["Flag ID", modal.id.slice(0, 8) + "…"],
                      ["Flagged", new Date(modal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })],
                      ["Asset type", modal.asset?.content_type || "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-600">{k}</span>
                        <span className="text-[11px] text-gray-400 font-mono">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ SETTINGS MODAL ══ */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setSettingsOpen(false)} />
          <div className="relative w-full max-w-md bg-[#0e0e0e] border border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "calc(100vh - 80px)" }}>

            <div className="flex items-center justify-between px-7 py-5 border-b border-white/[0.07] shrink-0">
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal size={16} className="text-gray-400" />
                <span className="text-sm font-semibold text-white">AI Sensitivity Settings</span>
              </div>
              <button onClick={() => setSettingsOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/[0.08] text-gray-500 hover:text-white transition-all cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-7 space-y-7">
              <div className="flex items-start gap-3 bg-blue-500/[0.07] border border-blue-500/15 rounded-2xl p-4">
                <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300/80 leading-relaxed">
                  Every uploaded asset is scored 0–100 by our AI across 4 risk categories. Set thresholds below to control what triggers automatic action.
                </p>
              </div>

              {[
                { label: "Block Immediately", sub: "Asset hidden before anyone sees it", val: hiT, set: setHiT, min: 51, max: 99, color: "red", accent: "accent-red-500" },
                { label: "Flag for Review", sub: "Hidden — you decide what to do", val: midT, set: setMidT, min: 10, max: 84, color: "yellow", accent: "accent-yellow-500" },
              ].map(({ label, sub, val, set, min, max, color, accent }) => (
                <div key={label} className="space-y-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{label}</div>
                      <div className="text-xs text-gray-600 mt-0.5">{sub}</div>
                    </div>
                    <div className={`text-3xl font-light tabular-nums ${color === "red" ? "text-red-400" : "text-yellow-400"}`}>{val}</div>
                  </div>
                  <input type="range" min={min} max={max} value={val}
                    onChange={e => set(parseInt(e.target.value))}
                    className={`w-full ${accent} cursor-pointer h-1.5 rounded-full`} />
                  <div className="flex justify-between text-[11px] text-gray-700">
                    <span>← Stricter</span><span>Looser →</span>
                  </div>
                </div>
              ))}

              {/* Auto-delete community posts toggle */}
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Auto-delete community posts</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {autoDeleteCommunity
                        ? "Flagged community posts are permanently deleted immediately — no admin review needed."
                        : "Flagged community posts are hidden and sent to you for review before any deletion."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoDeleteCommunity((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${autoDeleteCommunity ? "bg-red-500" : "bg-white/[0.1]"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoDeleteCommunity ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-3">
                <div className="text-[11px] text-gray-600 uppercase tracking-widest font-medium mb-1">How it works now</div>
                {[
                  { dot: "bg-emerald-500", text: `Score 0–${midT - 1}`, result: "Published normally", c: "text-emerald-400" },
                  { dot: "bg-yellow-500", text: `Score ${midT}–${hiT - 1}`, result: "Hidden, flagged for your review", c: "text-yellow-400" },
                  { dot: "bg-red-500", text: `Score ${hiT}–100`, result: "Blocked immediately", c: "text-red-400" },
                ].map(({ dot, text, result, c }) => (
                  <div key={text} className="flex items-center gap-3 text-xs">
                    <div className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
                    <span className="text-gray-500 w-24 shrink-0">{text}</span>
                    <span className="text-gray-700">→</span>
                    <span className={c}>{result}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-7 py-5 border-t border-white/[0.07] shrink-0">
              <button onClick={saveSettings} disabled={saving || !settings}
                className="w-full py-3 bg-white text-black text-sm font-medium rounded-2xl hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-40">
                {saving ? "Saving…" : "Save Settings"}
              </button>
              {!settings && <p className="text-[11px] text-gray-700 text-center mt-2">Settings table not configured yet</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
