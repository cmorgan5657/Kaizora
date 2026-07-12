"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Bot,
  Activity,
  Star,
  StarOff,
  Search,
  TrendingUp,
  Layers,
  Package,
  PackageX,
  DollarSign,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";

type AgentKey =
  | "search_optimization"
  | "post_launch"
  | "bundling"
  | "debundling"
  | "merchandising"
  | "catalog"
  | "feature"
  | "unfeature"
  | "pricing";

const AGENTS: { key: AgentKey; label: string; icon: any; tone: string; description: string }[] = [
  { key: "search_optimization", label: "Search", icon: Search, tone: "text-blue-400", description: "Optimizes assets + bundles for marketplace search discovery" },
  { key: "post_launch", label: "Post-Launch", icon: TrendingUp, tone: "text-emerald-400", description: "Re-evaluates assets after launch using performance signals" },
  { key: "bundling", label: "Bundling", icon: Package, tone: "text-purple-400", description: "Groups related assets into themed bundles automatically" },
  { key: "debundling", label: "Debundling", icon: PackageX, tone: "text-orange-400", description: "Delists underperforming or stale bundles" },
  { key: "merchandising", label: "Merchandising", icon: Layers, tone: "text-pink-400", description: "Selects which assets to feature on the storefront" },
  { key: "catalog", label: "Catalog", icon: Layers, tone: "text-cyan-400", description: "Builds portfolio strategy + cross-sell groups" },
  { key: "feature", label: "Feature", icon: Star, tone: "text-emerald-400", description: "Auto-features high-performing assets" },
  { key: "unfeature", label: "Unfeature", icon: StarOff, tone: "text-yellow-400", description: "Auto-unfeatures stale featured assets" },
  { key: "pricing", label: "Pricing", icon: DollarSign, tone: "text-red-400", description: "Adjusts asset prices using market + demand signals" },
];

export default function CommerceIntelligencePage() {
  const PAGE_SIZE = 12;
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [decisions, setDecisions] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<AgentKey>("search_optimization");
  const [filterQuery, setFilterQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      setUser(auth.user);
      await loadAll(auth.user.id);
      setLoading(false);
    }
    init();
  }, []);

  async function loadAll(userId: string) {
    const { data: assets } = await supabase
      .from("assets")
      .select("id, is_public")
      .eq("owner_id", userId);

    const ids = (assets || []).map((a: any) => a.id);
    if (ids.length === 0) return;

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: decs } = await supabase
      .from("agent_decisions")
      .select("*, assets(title)")
      .in("asset_id", ids)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(500);
    setDecisions(decs || []);
  }

  const stats = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const d of decisions) {
      const key = d.agent_type === "post_launch_optimizer" ? "post_launch" : d.agent_type;
      counts[key] = (counts[key] || 0) + 1;
      if (d.review_action === "auto_applied") counts.applied = (counts.applied || 0) + 1;
    }
    return counts;
  }, [decisions]);

  // Last run per agent
  const lastRunByAgent = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const d of decisions) {
      const key = d.agent_type === "post_launch_optimizer" ? "post_launch" : d.agent_type;
      if (!map[key]) map[key] = d.created_at;
    }
    return map;
  }, [decisions]);

  const tabDecisions = useMemo(() => {
    let base = decisions.filter((d) => {
      const key = d.agent_type === "post_launch_optimizer" ? "post_launch" : d.agent_type;
      return key === activeTab;
    });
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      base = base.filter((d) => {
        const blob = JSON.stringify({
          title: d.assets?.title,
          explanation: d.explanation,
          input: d.input,
          output: d.output,
        }).toLowerCase();
        return blob.includes(q);
      });
    }
    return base;
  }, [decisions, activeTab, filterQuery]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, filterQuery, decisions]);

  const lastRun = decisions[0]?.created_at;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  const activeAgent = AGENTS.find((a) => a.key === activeTab);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-light flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-red-500" />
            Commerce Intelligence
          </h1>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
            <Bot className="w-3 h-3" /> All agents · per-agent reports · last 30 days
          </p>
        </div>

        {/* Status banner */}
        <div className="border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <div className="flex-1 text-xs min-w-0">
            <p className="text-emerald-300">
              {decisions.length} actions in the last 30 days
              {lastRun && ` · most recent ${timeAgo(lastRun)}`}
            </p>
            <p className="text-gray-500">All agents run every 24 hours automatically</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-b border-white/10 flex gap-1 overflow-x-auto">
          {AGENTS.map((a) => {
            const Icon = a.icon;
            const lr = lastRunByAgent[a.key];
            const fresh = lr ? Date.now() - new Date(lr).getTime() < 7 * 24 * 3600 * 1000 : false;
            return (
              <TabBtn
                key={a.key}
                active={activeTab === a.key}
                onClick={() => { setActiveTab(a.key); setFilterQuery(""); }}
                icon={<Icon className={`w-3.5 h-3.5 ${a.tone}`} />}
                label={a.label}
                count={stats[a.key] || 0}
                fresh={fresh}
                stale={!!lr && !fresh}
                never={!lr}
              />
            );
          })}
        </div>


        {/* ── AGENT TABS ── */}
        {activeAgent && (
          <div className="space-y-4">
            {/* Agent header card */}
            <div className="border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <activeAgent.icon className={`w-5 h-5 ${activeAgent.tone}`} />
                    <h2 className="text-lg font-light text-white">{activeAgent.label} Agent</h2>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{activeAgent.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px]">
                    <span className="text-gray-600">
                      {tabDecisions.length} action{tabDecisions.length !== 1 ? "s" : ""} in last 30 days
                    </span>
                    {lastRunByAgent[activeAgent.key] ? (
                      <span className="flex items-center gap-1 text-gray-500">
                        <Clock className="w-3 h-3" />
                        last run {timeAgo(lastRunByAgent[activeAgent.key])}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-700">
                        <Clock className="w-3 h-3" />
                        never run for you
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Agent decisions */}
            <Section title={`${activeAgent.label} Reports`}>
              <FilterBox value={filterQuery} onChange={setFilterQuery} />
              {tabDecisions.length === 0 ? (
                <Empty msg={filterQuery ? `No matches for "${filterQuery}".` : `No ${activeAgent.label.toLowerCase()} actions yet — this agent runs automatically every 24 hours.`} />
              ) : (
                <DecisionList
                  items={tabDecisions}
                  visibleCount={visibleCount}
                  onLoadMore={() => setVisibleCount((count) => count + PAGE_SIZE)}
                />
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Components ─────────────────────────────────────────────────────────────

function TabBtn({
  active, onClick, icon, label, count, fresh, stale, never,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  fresh?: boolean;
  stale?: boolean;
  never?: boolean;
}) {
  const dotClass = fresh
    ? "bg-emerald-400"
    : stale
      ? "bg-yellow-400"
      : never
        ? "bg-gray-700"
        : null;
  return (
    <button
      onClick={onClick}
      title={fresh ? "Run this week" : stale ? "Run >7 days ago" : never ? "Never run for you" : undefined}
      className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] whitespace-nowrap border-b-2 -mb-px transition-all ${
        active
          ? "border-red-500 text-white"
          : "border-transparent text-gray-500 hover:text-gray-300"
      }`}
    >
      {icon}
      {label}
      {dotClass && <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />}
      <span className="text-[10px] opacity-60 tabular-nums">{count}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[10px] uppercase tracking-[0.15em] text-gray-500 mb-3 flex items-center gap-2">
        <span className="w-4 h-px bg-gray-700" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="p-8 border border-white/10 bg-white/[0.02] text-center text-xs text-gray-500">
      {msg}
    </div>
  );
}

function FilterBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative mb-3">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600 pointer-events-none" />
      <input
        type="text"
        placeholder="Filter reports — search by asset title, keyword, action…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-9 py-2 bg-white/[0.03] border border-white/10 text-[12px] text-white placeholder-gray-600 focus:outline-none focus:border-white/25 transition-all rounded"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.15] transition-all"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

function DecisionList({
  items,
  visibleCount,
  onLoadMore,
}: {
  items: any[];
  visibleCount: number;
  onLoadMore: () => void;
}) {
  return (
    <div className="border border-white/10 bg-white/[0.02]">
      {items.slice(0, visibleCount).map((d) => (
        <DecisionRow key={d.id} d={d} />
      ))}
      {visibleCount < items.length && (
        <div className="p-3 border-t border-white/5 flex justify-center">
          <button
            onClick={onLoadMore}
            className="px-4 py-2 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

function DecisionRow({ d }: { d: any }) {
  const normalized = d.agent_type === "post_launch_optimizer" ? "post_launch" : d.agent_type;
  const agent = AGENTS.find((a) => a.key === normalized);
  const Icon = agent?.icon || Activity;
  const tone = agent?.tone || "text-gray-400";
  const label = agent?.label || d.agent_type;

  let detail = "";
  const out = d.output || {};
  const inp = d.input || {};

  const fmt = (cents: any) =>
    typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "—";

  if (inp.subtype === "bundle") {
    detail = `bundle: ${inp.bundle_name || "?"} · ${out.new_keywords?.length || 0} kw`;
  } else if (out.action === "REPRICE") {
    detail = `${fmt(inp.old_price)} → ${fmt(out.new_price)}`;
  } else if (out.action === "RETITLE") {
    detail = `"${out.old_title || ""}" → "${out.new_title || ""}"`;
  } else if (out.new_tags && inp.old_tags) {
    detail = `tags: ${(inp.old_tags || []).length} → ${(out.new_tags || []).length}`;
  } else if (out.action === "FEATURE") {
    detail = "→ featured";
  } else if (out.action === "UNFEATURE") {
    detail = "→ unfeatured";
  } else if (out.action === "CREATE_BUNDLE") {
    detail = `bundle: ${out.bundle_name}`;
  } else if (out.action === "DELIST_BUNDLE") {
    detail = `delisted: ${out.bundle_name}`;
  } else if (out.action === "MARK_REMIX_CANDIDATE") {
    detail = "→ remix queue";
  }

  return (
    <div className="flex items-start gap-3 p-3 border-b border-white/5 last:border-0">
      <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${tone}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
          <span className="text-sm text-gray-200 truncate">{d.assets?.title || "Asset"}</span>
          {detail && <span className="text-xs text-gray-500">· {detail}</span>}
          {d.review_action === "auto_applied" && (
            <span className="text-[9px] uppercase tracking-wider text-emerald-400/70 flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> applied
            </span>
          )}
        </div>
        {d.explanation && <p className="text-xs text-gray-600 mt-0.5">{d.explanation}</p>}
      </div>
      <span className="text-[10px] text-gray-600 flex-shrink-0">{timeAgo(d.created_at)}</span>
    </div>
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
