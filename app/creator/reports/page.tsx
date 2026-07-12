"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Shield, Flag, Robot, CheckCircle, Trash, Clock,
  Warning, Image as ImageIcon, ArrowsClockwise, Info,
  FileX,
} from "phosphor-react";

interface FlagEntry {
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
  perspective: "received" | "submitted";
  asset: {
    id: string; title: string; content_type: string;
    storage_path: string; thumbnail_path: string | null;
    owner_name?: string;
  } | null;
  reporter: { display_name: string } | null;
}

const REASONS: Record<string, string> = {
  copyright: "Copyright / DMCA", nudity: "Nudity / Explicit",
  violence: "Violence / Gore", hate_speech: "Hate Speech",
  spam: "Spam / Misleading", other: "Other",
};
const CATS: Record<string, string> = {
  nudity: "Nudity",
  violence: "Violence",
  explicit_content: "Explicit",
  hate_speech: "Hate Speech",
  celebrity_likeness: "Celebrity",
};

export default function CreatorReportsPage() {
  const PAGE_SIZE = 12;
  const [received, setReceived] = useState<FlagEntry[]>([]);
  const [submitted, setSubmitted] = useState<FlagEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"received" | "submitted">("received");
  const [filterSource, setFilterSource] = useState<"all" | "ai_scan" | "user_report">("all");
  const [selected, setSelected] = useState<FlagEntry | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const getUrl = (path: string | null) =>
    path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${path}` : null;

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }
    const res = await fetch("/api/creator/reports", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(r => r.json());
    setReceived(res.received || []);
    setSubmitted(res.submitted || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingReceived = received.filter(f => f.status === "pending").length;

  const displayList = (activeTab === "received" ? received : submitted).filter(f =>
    filterSource === "all" || f.source === filterSource
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, filterSource, received, submitted]);

  function timeAgo(d: string) {
    const m = Math.floor((Date.now() - +new Date(d)) / 60000);
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function topCat(cats: FlagEntry["categories"]) {
    if (!cats) return null;
    const top = (Object.entries(cats) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 50 ? { name: CATS[top[0]] || top[0], score: top[1] } : null;
  }
  function isLowConfidenceAiFlag(flag: FlagEntry) {
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

  function scoreBg(n: number) { return n >= 85 ? "bg-red-500" : n >= 50 ? "bg-yellow-500" : "bg-emerald-500"; }
  function scoreColor(n: number) { return n >= 85 ? "text-red-400" : n >= 50 ? "text-yellow-400" : "text-emerald-400"; }

  if (loading) return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="w-32 h-6 bg-white/10 rounded-lg animate-pulse mb-2" />
        <div className="w-64 h-3 bg-white/5 rounded animate-pulse" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[380px] border-r border-white/[0.06] p-4 space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
        <div className="flex-1 p-6">
          <div className="h-full bg-white/[0.02] rounded-2xl animate-pulse" />
        </div>
      </div>
    </div>
  );

  const totalFlags = received.length + submitted.length;

  return (
    <div className="h-full flex flex-col bg-black text-white overflow-hidden">

      {/* ── Top Header ── */}
      <div className="shrink-0 px-6 py-4 border-b border-white/[0.06] bg-black">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Shield size={17} className="text-red-400" weight="fill" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-tight">Reports & Flags</h1>
              <p className="text-[11px] text-gray-600 mt-0.5">Content moderation activity for your account</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Live stats */}
            <div className="flex items-center gap-2">
              {pendingReceived > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-red-400 font-medium">{pendingReceived} under review</span>
                </div>
              )}
              {pendingReceived === 0 && totalFlags > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <CheckCircle size={12} className="text-emerald-400" weight="fill" />
                  <span className="text-xs text-emerald-400">All clear</span>
                </div>
              )}
            </div>
            <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-xl transition-all cursor-pointer">
              <ArrowsClockwise size={12} />Refresh
            </button>
          </div>
        </div>

        {/* Tab + filter row */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
            <button
              onClick={() => { setActiveTab("received"); setFilterSource("all"); setSelected(null); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeTab === "received" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              <Shield size={12} />
              Flags on My Content
              {received.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${pendingReceived > 0 ? "bg-red-500 text-white" : "bg-white/10 text-gray-400"}`}>
                  {received.length}
                </span>
              )}
            </button>
            <button
              onClick={() => { setActiveTab("submitted"); setFilterSource("all"); setSelected(null); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeTab === "submitted" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              <Flag size={12} />
              My Submitted Reports
              {submitted.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/10 text-gray-400">{submitted.length}</span>
              )}
            </button>
          </div>

          {/* Source filter */}
          {activeTab === "received" && (
            <div className="flex items-center gap-1">
              {([
                { key: "all", label: "All" },
                { key: "ai_scan", label: "🤖 AI" },
                { key: "user_report", label: "🚩 Reports" },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setFilterSource(f.key)}
                  className={`px-3 py-1.5 text-xs rounded-xl transition-all cursor-pointer ${filterSource === f.key ? "bg-white/10 text-white" : "text-gray-600 hover:text-gray-400"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: stat cards + list ── */}
        <div className="w-[380px] shrink-0 border-r border-white/[0.06] flex flex-col overflow-hidden">

          {/* Stat cards */}
          {(() => {
            const statCards = activeTab === "received"
              ? [
                  { label: "Under Review", count: received.filter(f => f.status === "pending").length, color: "yellow" },
                  { label: "Cleared", count: received.filter(f => f.status === "approved").length, color: "green" },
                  { label: "Removed", count: received.filter(f => f.status === "removed").length, color: "red" },
                ]
              : [
                  { label: "Pending", count: submitted.filter(f => f.status === "pending").length, color: "yellow" },
                  { label: "Action Taken", count: submitted.filter(f => f.status === "removed").length, color: "green" },
                  { label: "Dismissed", count: submitted.filter(f => f.status === "approved").length, color: "red" },
                ];
            return (
              <div className="grid grid-cols-3 gap-2 p-3 border-b border-white/[0.06] shrink-0">
                {statCards.map(({ label, count, color }) => (
                  <div key={label} className={`py-3 px-2 rounded-xl border text-center ${
                    color === "yellow" ? "border-yellow-500/20 bg-yellow-500/[0.06]"
                    : color === "green" ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                    : "border-red-500/20 bg-red-500/[0.06]"
                  }`}>
                    <div className={`text-xl font-light ${
                      color === "yellow" ? "text-yellow-400" : color === "green" ? "text-emerald-400" : "text-red-400"
                    }`}>{count}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* List count */}
          <div className="px-4 py-2 border-b border-white/[0.04] shrink-0">
            <span className="text-[11px] text-gray-600">{displayList.length} item{displayList.length !== 1 ? "s" : ""}</span>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {displayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <CheckCircle size={32} className="text-gray-800 mb-3" weight="duotone" />
                <p className="text-sm text-gray-500 font-light">
                  {activeTab === "received" ? "No flags on your content" : "No reports submitted yet"}
                </p>
                <p className="text-xs text-gray-700 mt-1">
                  {activeTab === "received" ? "All your assets are in good standing." : "Use the flag button on any asset to report it."}
                </p>
              </div>
            ) : (
              displayList.slice(0, visibleCount).map(flag => {
                const asset = flag.asset;
                const thumb = getUrl(asset?.content_type === "image" ? (asset.storage_path ?? null) : (asset?.thumbnail_path ?? null));
                const issue = topCat(flag.categories);
                const lowConfidenceAiFlag = isLowConfidenceAiFlag(flag);
                const isSelected = selected?.id === flag.id;

                return (
                  <button key={flag.id} onClick={() => setSelected(flag)}
                    className={`w-full text-left px-4 py-3 border-b border-white/[0.04] transition-colors cursor-pointer ${isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 shrink-0 rounded-xl overflow-hidden bg-white/5 border border-white/[0.08] flex items-center justify-center mt-0.5">
                        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={14} className="text-gray-700" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-white font-light truncate">{asset?.title || "Untitled"}</span>
                          <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                            flag.status === "pending" ? "bg-yellow-500" : flag.status === "removed" ? "bg-red-500" : "bg-emerald-500"
                          }`} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${flag.source === "ai_scan" ? "bg-blue-500/15 text-blue-400" : "bg-orange-500/15 text-orange-400"}`}>
                            {flag.source === "ai_scan" ? "AI" : "Report"}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                            flag.status === "pending" ? "bg-yellow-500/15 text-yellow-400"
                            : flag.status === "removed" ? "bg-red-500/15 text-red-400"
                            : "bg-emerald-500/15 text-emerald-400"
                          }`}>
                            {flag.status === "pending" ? "Under Review" : flag.status === "removed" ? "Removed" : activeTab === "submitted" ? "Dismissed" : "Cleared"}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-600 truncate">
                          {flag.source === "ai_scan" && issue ? <span className={scoreColor(issue.score)}>{issue.name} {issue.score}%</span> : null}
                          {flag.source === "ai_scan" && !issue && lowConfidenceAiFlag ? <span className="text-yellow-300/80">Low-confidence AI signal</span> : null}
                          {flag.source === "user_report" ? <span>{REASONS[flag.report_reason || ""] || flag.report_reason}</span> : null}
                          <span className="text-gray-700"> · {timeAgo(flag.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}

            {visibleCount < displayList.length && (
              <div className="p-4 border-t border-white/[0.04] flex justify-center">
                <button
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="px-4 py-2 text-xs text-gray-300 border border-white/[0.08] rounded-xl hover:text-white hover:border-red-500/30 hover:bg-white/[0.03] transition-all cursor-pointer"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Detail view ── */}
        <div className="flex-1 overflow-y-auto bg-black">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                <Shield size={26} className="text-gray-700" weight="duotone" />
              </div>
              <p className="text-sm text-gray-500 font-light">Select an item to view details</p>
              <p className="text-xs text-gray-700 mt-1">Click any entry on the left</p>
            </div>
          ) : (() => {
            const asset = selected.asset;
            const thumb = getUrl(asset?.content_type === "image" ? (asset.storage_path ?? null) : (asset?.thumbnail_path ?? null));
            const issue = topCat(selected.categories);
            const lowConfidenceAiFlag = isLowConfidenceAiFlag(selected);
            const isPending = selected.status === "pending";
            const isRemoved = selected.status === "removed";
            const isCleared = selected.status === "approved";

            return (
              <div className="p-6 space-y-5 max-w-2xl">

                {/* Title row */}
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border ${
                      selected.source === "ai_scan" ? "bg-blue-500/10 text-blue-400 border-blue-500/15" : "bg-orange-500/10 text-orange-400 border-orange-500/15"
                    }`}>
                      {selected.source === "ai_scan" ? <><Robot size={10} />AI Scan</> : <><Flag size={10} />User Report</>}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border ${
                      isPending ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/15"
                      : isRemoved ? "bg-red-500/10 text-red-400 border-red-500/15"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/15"
                    }`}>
                      {isPending ? <><Clock size={10} />Under Review</>
                        : isRemoved ? <><Trash size={10} weight="fill" />Removed</>
                        : <><CheckCircle size={10} weight="fill" />{activeTab === "submitted" ? "Dismissed" : "Cleared"}</>}
                    </span>
                    {selected.severity && (
                      <span className={`px-2.5 py-1 rounded-lg text-xs border ${selected.severity === "high" ? "bg-red-500/10 text-red-400 border-red-500/15" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/15"}`}>
                        {selected.severity === "high" ? "⚠ High Risk" : lowConfidenceAiFlag ? "⚡ Needs Review" : "⚡ Medium Risk"}
                      </span>
                    )}
                    <span className="text-xs text-gray-700 ml-auto">{timeAgo(selected.created_at)}</span>
                  </div>
                </div>

                {/* Asset card */}
                <div className="flex gap-4 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                  <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-black border border-white/[0.08] flex items-center justify-center">
                    {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={28} className="text-gray-700" />}
                  </div>
                  <div className="flex-1 space-y-1.5 pt-1">
                    <div className="text-base font-light text-white">{asset?.title || "Untitled"}</div>
                    <div className="text-xs text-gray-500 capitalize">{asset?.content_type}</div>
                    {activeTab === "submitted" && asset?.owner_name && (
                      <div className="text-xs text-gray-500">Creator: <span className="text-gray-300">{asset.owner_name}</span></div>
                    )}
                    {activeTab === "received" && selected.reporter && selected.source === "user_report" && (
                      <div className="text-xs text-gray-500">Reported by: <span className="text-orange-300">{selected.reporter.display_name}</span></div>
                    )}
                  </div>
                </div>

                {/* Status banner */}
                {isRemoved && activeTab === "received" && (
                  <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <FileX size={18} className="text-red-400 shrink-0 mt-0.5" weight="fill" />
                    <div>
                      <div className="text-sm font-medium text-red-400">Asset Removed</div>
                      <div className="text-xs text-red-300/70 mt-0.5">This asset has been removed from the platform following an admin review.</div>
                      {selected.admin_note && <div className="text-xs text-red-300/60 mt-2 italic">Admin note: "{selected.admin_note}"</div>}
                    </div>
                  </div>
                )}
                {isRemoved && activeTab === "submitted" && (
                  <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                    <CheckCircle size={18} className="text-emerald-400 shrink-0 mt-0.5" weight="fill" />
                    <div>
                      <div className="text-sm font-medium text-emerald-400">Report Resolved — Content Removed</div>
                      <div className="text-xs text-emerald-300/70 mt-0.5">An admin reviewed your report and removed the content from the platform.</div>
                    </div>
                  </div>
                )}
                {isCleared && activeTab === "submitted" && (
                  <div className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl">
                    <Info size={18} className="text-gray-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm text-gray-400">Report Dismissed</div>
                      <div className="text-xs text-gray-600 mt-0.5">An admin reviewed your report and determined no action was needed.</div>
                    </div>
                  </div>
                )}
                {isCleared && activeTab === "received" && (
                  <div className="flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                    <CheckCircle size={18} className="text-emerald-400 shrink-0 mt-0.5" weight="fill" />
                    <div>
                      <div className="text-sm font-medium text-emerald-400">Cleared — No Action Taken</div>
                      <div className="text-xs text-emerald-300/70 mt-0.5">An admin reviewed this flag and confirmed your content is fine.</div>
                    </div>
                  </div>
                )}
                {isPending && (
                  <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl">
                    <Clock size={18} className="text-yellow-400 shrink-0 mt-0.5" weight="fill" />
                    <div>
                      <div className="text-sm font-medium text-yellow-400">Under Review</div>
                      <div className="text-xs text-yellow-300/70 mt-0.5">
                        {activeTab === "received"
                          ? "An admin will review this flag and decide whether to keep or remove the content. You'll see the decision here."
                          : "Your report has been submitted and is pending review by an admin."}
                      </div>
                    </div>
                  </div>
                )}

                {selected.source === "ai_scan" && lowConfidenceAiFlag && (
                  <div className="flex items-start gap-3 p-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl">
                    <Info size={18} className="text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm text-yellow-300">Low-confidence AI review</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        The AI sent this for manual review because the scores were weak or borderline, not because it found a clear violation.
                      </div>
                    </div>
                  </div>
                )}

                {/* Flag details */}
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  <div className="px-5 py-3 border-b border-white/[0.06]">
                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-widest">
                      {selected.source === "ai_scan" ? "AI Scan Details" : "Report Details"}
                    </span>
                  </div>
                  <div className="p-5">
                    {selected.source === "ai_scan" && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 mb-4">
                          <Robot size={13} className="text-blue-400" />
                          <span className="text-xs text-blue-400">Our AI automatically scanned this content during upload</span>
                        </div>
                        {selected.categories && Object.entries(selected.categories).map(([key, score]) => (
                          <div key={key} className="flex items-center gap-3 py-1.5">
                            <span className="text-xs text-gray-500 w-28 shrink-0">{CATS[key]}</span>
                            <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${scoreBg(score as number)}`} style={{ width: `${score}%`, opacity: 0.75 }} />
                            </div>
                            <span className={`text-xs w-8 text-right font-mono tabular-nums ${scoreColor(score as number)}`}>{score}</span>
                          </div>
                        ))}
                        {selected.ai_explanation && (
                          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-start gap-2">
                            <Info size={12} className="text-gray-600 mt-0.5 shrink-0" />
                            <p className="text-xs text-gray-400 leading-relaxed">{selected.ai_explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {selected.source === "user_report" && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white/[0.03] rounded-xl p-3">
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Reason</div>
                            <div className="text-sm text-white font-light">{REASONS[selected.report_reason || ""] || selected.report_reason || "—"}</div>
                          </div>
                          {activeTab === "received" && selected.reporter && (
                            <div className="bg-white/[0.03] rounded-xl p-3">
                              <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Reported by</div>
                              <div className="text-sm text-orange-300">{selected.reporter.display_name}</div>
                            </div>
                          )}
                        </div>
                        {selected.report_description && (
                          <div className="bg-white/[0.03] rounded-xl p-4">
                            <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Their message</div>
                            <p className="text-sm text-gray-300 leading-relaxed">"{selected.report_description}"</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.01] p-4 space-y-2">
                  {[
                    ["Flagged", new Date(selected.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })],
                    ...(selected.reviewed_at ? [["Reviewed", new Date(selected.reviewed_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })]] : []),
                    ["Source", selected.source === "ai_scan" ? "Automated AI Scan" : "User Report"],
                    ["Flag ID", selected.id.slice(0, 8) + "…"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">{k}</span>
                      <span className="text-xs text-gray-400 font-mono">{v}</span>
                    </div>
                  ))}
                </div>

              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
