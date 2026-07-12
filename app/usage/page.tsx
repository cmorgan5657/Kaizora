"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Image,
  Video,
  Music,
  BookOpen,
  RefreshCw,
  Clock,
  Activity,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  availableBalance,
  isCreditsExpired,
  daysUntilExpiry,
} from "@/lib/creditExpiry";
import { syncSubscriptionCredits } from "@/lib/syncSubscriptionCredits";
import LegacyCreditsNotice from "@/app/components/LegacyCreditsNotice";

type Transaction = {
  id: string;
  user_id: string;
  type: "deduction" | "purchase" | "bonus" | "expiry";
  action: string | null;
  amount: number;
  description: string | null;
  created_at: string;
};

type ActionCost = {
  id: string;
  action: string;
  credits: number;
  note: string;
  icon: string;
  sort_order: number;
};

type ActionSummary = {
  action: string;
  total: number;
  count: number;
};

const ACTION_LABELS: Record<string, string> = {
  decision_layer_image: "Image Analysis",
  decision_layer_video: "Video Analysis",
  decision_layer_text: "Text Analysis",
  decision_layer_audio: "Audio Analysis",
  remix_image: "Remix Image",
  remix_video: "Remix Video",
  remix_video_5s: "Remix Video 5s",
  remix_video_10s: "Remix Video 10s",
  remix_audio: "Remix Audio",
  credit_expiry: "Credits Expired",
  legacy_flush: "Credits Expired (legacy)",
  credit_purchase: "Purchase",
  auto_topup: "Auto Top-up",
  challenge_prize: "Challenge Prize",
};

const ACTION_COLORS: Record<string, string> = {
  decision_layer_image: "text-blue-400 bg-blue-500/10",
  decision_layer_video: "text-purple-400 bg-purple-500/10",
  decision_layer_text: "text-emerald-400 bg-emerald-500/10",
  decision_layer_audio: "text-amber-400 bg-amber-500/10",
  remix_image: "text-pink-400 bg-pink-500/10",
  remix_video: "text-indigo-400 bg-indigo-500/10",
  remix_video_5s: "text-indigo-400 bg-indigo-500/10",
  remix_video_10s: "text-violet-400 bg-violet-500/10",
  remix_audio: "text-teal-400 bg-teal-500/10",
};

const ACTION_ICONS: Record<string, any> = {
  decision_layer_image: Image,
  decision_layer_video: Video,
  decision_layer_text: BookOpen,
  decision_layer_audio: Music,
  remix_image: RefreshCw,
  remix_video: RefreshCw,
  remix_video_5s: RefreshCw,
  remix_video_10s: RefreshCw,
  remix_audio: RefreshCw,
};

const ROWS_PER_PAGE = 15;

export default function UsagePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalPurchased, setTotalPurchased] = useState(0);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [actionSummary, setActionSummary] = useState<ActionSummary[]>([]);
  const [actionCosts, setActionCosts] = useState<ActionCost[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterRange, setFilterRange] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [showAllDeductions, setShowAllDeductions] = useState(false);

  // Loading
  const [loading, setLoading] = useState(true);

  // Fetch balance
  const fetchBalance = async (userId: string) => {
    await syncSubscriptionCredits();

    const { data } = await supabase
      .from("user_credits")
      .select("balance, total_spent, total_purchased, expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      setBalance(availableBalance(data.balance, data.expires_at));
      setExpiresAt(data.expires_at ?? null);
      setTotalSpent(data.total_spent ?? 0);
      setTotalPurchased(data.total_purchased ?? 0);
    }
  };

  // Fetch transactions
  const fetchTransactions = async (userId: string) => {
    const { data } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (data) setTransactions(data);
  };

  // Fetch action summary (group deductions by action)
  const fetchActionSummary = async (userId: string) => {
    const { data } = await supabase
      .from("credit_transactions")
      .select("action, amount")
      .eq("user_id", userId)
      .eq("type", "deduction");

    if (data) {
      const map: Record<string, { total: number; count: number }> = {};
      data.forEach((t) => {
        const key = t.action || "unknown";
        if (!map[key]) map[key] = { total: 0, count: 0 };
        map[key].total += Math.abs(t.amount);
        map[key].count += 1;
      });
      const summary = Object.entries(map)
        .map(([action, { total, count }]) => ({ action, total, count }))
        .sort((a, b) => b.total - a.total);
      setActionSummary(summary);
    }
  };

  // Fetch action costs
  const fetchActionCosts = async () => {
    const { data } = await supabase
      .from("credit_action_costs")
      .select("*")
      .order("sort_order", { ascending: true });
    if (data) setActionCosts(data);
  };

  useEffect(() => {
    async function init() {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
        return;
      }
      setUser(data.user);
      await Promise.all([
        fetchBalance(data.user.id),
        fetchTransactions(data.user.id),
        fetchActionSummary(data.user.id),
        fetchActionCosts(),
      ]);
      setLoading(false);
    }
    init();

    // Realtime: user_credits
    const creditsChannel = supabase
      .channel("usage-credits-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits" },
        () => {
          supabase.auth.getUser().then(({ data }) => {
            if (data.user) fetchBalance(data.user.id);
          });
        },
      )
      .subscribe();

    // Realtime: credit_transactions
    const txChannel = supabase
      .channel("usage-tx-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "credit_transactions" },
        () => {
          supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
              fetchTransactions(data.user.id);
              fetchActionSummary(data.user.id);
            }
          });
        },
      )
      .subscribe();

    // Realtime: action costs
    const costsChannel = supabase
      .channel("usage-costs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_action_costs" },
        () => fetchActionCosts(),
      )
      .subscribe();

    // Custom event
    const handleCreditsUpdated = () => {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          fetchBalance(data.user.id);
          fetchTransactions(data.user.id);
          fetchActionSummary(data.user.id);
        }
      });
    };
    window.addEventListener("credits-updated", handleCreditsUpdated);

    return () => {
      creditsChannel.unsubscribe();
      txChannel.unsubscribe();
      costsChannel.unsubscribe();
      window.removeEventListener("credits-updated", handleCreditsUpdated);
    };
  }, []);

  // Filtered transactions
  const filtered = transactions.filter((tx) => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterAction !== "all" && tx.action !== filterAction) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchDesc = tx.description?.toLowerCase().includes(q);
      const matchAction = tx.action?.toLowerCase().includes(q);
      const matchType = tx.type.toLowerCase().includes(q);
      if (!matchDesc && !matchAction && !matchType) return false;
    }
    if (filterRange !== "all") {
      const now = Date.now();
      const created = new Date(tx.created_at).getTime();
      const days = filterRange === "7d" ? 7 : filterRange === "30d" ? 30 : 90;
      if (now - created > days * 86400000) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = filtered.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE,
  );

  // CSV export
  const exportCSV = () => {
    const headers = ["Date", "Type", "Action", "Amount", "Description"];
    const rows = filtered.map((tx) => [
      new Date(tx.created_at).toLocaleString(),
      tx.type,
      tx.action || "-",
      tx.amount.toString(),
      tx.description || "-",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kaizora-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Unique actions from transactions for filter dropdown
  const uniqueActions = Array.from(
    new Set(transactions.filter((t) => t.action).map((t) => t.action!)),
  );

  // Total credits spent in summary
  const totalActionSpend = actionSummary.reduce((s, a) => s + a.total, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading usage data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full px-3 md:px-6 pt-18 md:pt-20 pb-6 md:pb-10">
        <LegacyCreditsNotice />

        {/* Header */}
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <div>
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-1.5">
              <Activity className="w-4 h-4 md:w-5 md:h-5 text-red-500" />
              Usage & History
            </h1>
            <p className="text-gray-500 text-[10px] md:text-xs mt-0.5">
              Your complete credit lifecycle
            </p>
          </div>
          <button
            onClick={() => router.push("/credits")}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] md:text-xs border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all cursor-pointer"
          >
            <Zap className="w-2.5 h-2.5 text-red-500" />
            Top Up
          </button>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-5">
          <div className="border border-white/10 p-2.5 md:p-3.5">
            <div className="flex items-center gap-1 mb-0.5">
              <Zap className="h-2.5 w-2.5 text-red-500" />
              <p className="text-[9px] md:text-[11px] text-gray-500">Balance</p>
            </div>
            <p className="text-lg md:text-2xl font-bold">
              {balance.toLocaleString()}
            </p>
            <p className="text-[8px] md:text-[10px] text-gray-600">credits</p>
            {expiresAt && balance > 0 && !isCreditsExpired(expiresAt) && (
              <p className="text-[8px] md:text-[10px] text-amber-500/80 mt-0.5">
                Expires in {daysUntilExpiry(expiresAt)}d (
                {new Date(expiresAt).toLocaleDateString()})
              </p>
            )}
            {isCreditsExpired(expiresAt) && (
              <p className="text-[8px] md:text-[10px] text-red-500/80 mt-0.5">
                Expired
              </p>
            )}
          </div>
          <div className="border border-white/10 p-2.5 md:p-3.5">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
              <p className="text-[9px] md:text-[11px] text-gray-500">Purchased</p>
            </div>
            <p className="text-lg md:text-2xl font-bold">
              {totalPurchased.toLocaleString()}
            </p>
            <p className="text-[8px] md:text-[10px] text-gray-600">total</p>
          </div>
          <div className="border border-white/10 p-2.5 md:p-3.5">
            <div className="flex items-center gap-1 mb-0.5">
              <Calendar className="h-2.5 w-2.5 text-amber-500" />
              <p className="text-[9px] md:text-[11px] text-gray-500">Spent</p>
            </div>
            <p className="text-lg md:text-2xl font-bold">
              {totalSpent.toLocaleString()}
            </p>
            <p className="text-[8px] md:text-[10px] text-gray-600">total</p>
          </div>
        </div>

        {/* Action Breakdown */}
        {actionSummary.length > 0 && (
          <div className="border border-white/10 p-3 md:p-4 mb-3 md:mb-4">
            <h2 className="text-xs md:text-sm font-semibold mb-3">
              Usage by Action
            </h2>
            <div className="space-y-2">
              {actionSummary.map((item) => {
                const label =
                  ACTION_LABELS[item.action] ||
                  item.action.replace(/_/g, " ");
                const colorClass =
                  ACTION_COLORS[item.action] || "text-gray-400 bg-white/5";
                const Icon = ACTION_ICONS[item.action] || Zap;
                const pct =
                  totalActionSpend > 0
                    ? ((item.total / totalActionSpend) * 100).toFixed(1)
                    : "0";

                return (
                  <div key={item.action}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-5 h-5 md:w-6 md:h-6 rounded flex items-center justify-center ${colorClass}`}
                        >
                          <Icon className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        </div>
                        <div>
                          <p className="text-[9px] md:text-xs font-medium">
                            {label}
                          </p>
                          <p className="text-[7px] md:text-[10px] text-gray-600">
                            {item.count} usage{item.count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] md:text-xs font-semibold">
                          {item.total} cr
                        </p>
                        <p className="text-[7px] md:text-[10px] text-gray-600">
                          {pct}%
                        </p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500/60 rounded-full transition-all duration-500"
                        style={{
                          width: `${totalActionSpend > 0 ? (item.total / totalActionSpend) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Credit Deductions */}
        <div className="border border-white/10 p-3 md:p-4 mb-3 md:mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xs md:text-sm font-semibold">Credits Used</h2>
              <p className="text-[8px] md:text-[10px] text-gray-600">Recent deductions</p>
            </div>
            {transactions.filter((tx) => tx.type === "deduction").length > 5 && (
              <button
                onClick={() => setShowAllDeductions(true)}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] md:text-[10px] border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all cursor-pointer"
              >
                See All
                <ChevronRight className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {(() => {
            const deductions = transactions.filter((tx) => tx.type === "deduction");
            if (deductions.length === 0) {
              return (
                <p className="text-[10px] text-gray-600 text-center py-4">
                  No credits used yet.
                </p>
              );
            }
            return (
              <div className="space-y-0">
                {deductions.slice(0, 5).map((tx) => {
                  const label = tx.action
                    ? ACTION_LABELS[tx.action] || tx.action.replace(/_/g, " ")
                    : "Unknown";
                  const colorClass = tx.action
                    ? ACTION_COLORS[tx.action] || "text-gray-400 bg-white/5"
                    : "text-gray-400 bg-white/5";
                  const Icon = tx.action
                    ? ACTION_ICONS[tx.action] || Zap
                    : Zap;
                  const timeAgo = (() => {
                    const diff = Date.now() - new Date(tx.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 1) return "just now";
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h ago`;
                    const days = Math.floor(hrs / 24);
                    return `${days}d ago`;
                  })();
                  return (
                    <div key={tx.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                      <div className={`w-5 h-5 md:w-6 md:h-6 rounded flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon className="w-2.5 h-2.5 md:w-3 md:h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] md:text-xs font-medium truncate">{label}</p>
                        <p className="text-[7px] md:text-[10px] text-gray-600 truncate">
                          {tx.description || tx.action?.replace(/_/g, " ") || "-"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[9px] md:text-xs font-semibold text-red-400">-{Math.abs(tx.amount)} cr</p>
                        <p className="text-[7px] md:text-[9px] text-gray-600">{timeAgo}</p>
                      </div>
                    </div>
                  );
                })}
                {deductions.length > 5 && (
                  <button
                    onClick={() => setShowAllDeductions(true)}
                    className="w-full text-center text-[9px] md:text-[10px] text-gray-500 hover:text-white pt-2 transition-colors cursor-pointer"
                  >
                    + {deductions.length - 5} more
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* All Deductions Modal */}
        {showAllDeductions && (() => {
          const deductions = transactions.filter((tx) => tx.type === "deduction");
          return (
            <>
              <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={() => setShowAllDeductions(false)} />
              <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-lg bg-black border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between p-3 border-b border-white/10">
                  <div>
                    <h3 className="text-xs md:text-sm font-semibold">All Credit Deductions</h3>
                    <p className="text-[8px] md:text-[10px] text-gray-600">{deductions.length} total</p>
                  </div>
                  <button onClick={() => setShowAllDeductions(false)} className="p-1 hover:bg-white/10 transition-colors cursor-pointer">
                    <span className="text-gray-500 text-sm">✕</span>
                  </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto p-3">
                  {deductions.map((tx) => {
                    const label = tx.action
                      ? ACTION_LABELS[tx.action] || tx.action.replace(/_/g, " ")
                      : "Unknown";
                    const colorClass = tx.action
                      ? ACTION_COLORS[tx.action] || "text-gray-400 bg-white/5"
                      : "text-gray-400 bg-white/5";
                    const Icon = tx.action
                      ? ACTION_ICONS[tx.action] || Zap
                      : Zap;
                    const timeAgo = (() => {
                      const diff = Date.now() - new Date(tx.created_at).getTime();
                      const mins = Math.floor(diff / 60000);
                      if (mins < 1) return "just now";
                      if (mins < 60) return `${mins}m ago`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h ago`;
                      const days = Math.floor(hrs / 24);
                      return `${days}d ago`;
                    })();
                    return (
                      <div key={tx.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                        <div className={`w-5 h-5 md:w-6 md:h-6 rounded flex items-center justify-center shrink-0 ${colorClass}`}>
                          <Icon className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] md:text-xs font-medium truncate">{label}</p>
                          <p className="text-[7px] md:text-[10px] text-gray-600 truncate">
                            {tx.description || tx.action?.replace(/_/g, " ") || "-"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[9px] md:text-xs font-semibold text-red-400">-{Math.abs(tx.amount)} cr</p>
                          <p className="text-[7px] md:text-[9px] text-gray-600">{timeAgo}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-3 border-t border-white/10 bg-white/[0.02]">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] md:text-[10px] text-gray-500">{deductions.length} deduction{deductions.length !== 1 ? "s" : ""}</span>
                    <span className="text-[9px] md:text-xs font-semibold text-red-400">
                      Total: {deductions.reduce((s, t) => s + Math.abs(t.amount), 0)} cr
                    </span>
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* Transaction Log */}
        <div className="border border-white/10 p-3 md:p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs md:text-sm font-semibold">
              Transaction History
            </h2>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1 px-2 py-0.5 text-[9px] md:text-[10px] border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all cursor-pointer"
            >
              <Download className="w-3 h-3" />
              Export CSV
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-white/[0.03] border border-white/10 text-white text-[10px] md:text-xs pl-7 pr-3 py-1.5 focus:outline-none focus:border-red-500/50 transition-colors"
              />
            </div>

            {/* Type filter */}
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(1);
              }}
              className="bg-white/[0.03] border border-white/10 text-gray-300 text-[10px] md:text-xs px-2 py-1.5 focus:outline-none focus:border-red-500/50 cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="deduction">Deductions</option>
              <option value="purchase">Purchases</option>
              <option value="bonus">Bonuses</option>
            </select>

            {/* Action filter */}
            <select
              value={filterAction}
              onChange={(e) => {
                setFilterAction(e.target.value);
                setPage(1);
              }}
              className="bg-white/[0.03] border border-white/10 text-gray-300 text-[10px] md:text-xs px-2 py-1.5 focus:outline-none focus:border-red-500/50 cursor-pointer"
            >
              <option value="all">All Actions</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a] || a.replace(/_/g, " ")}
                </option>
              ))}
            </select>

            {/* Date range */}
            <select
              value={filterRange}
              onChange={(e) => {
                setFilterRange(e.target.value);
                setPage(1);
              }}
              className="bg-white/[0.03] border border-white/10 text-gray-300 text-[10px] md:text-xs px-2 py-1.5 focus:outline-none focus:border-red-500/50 cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-[9px] md:text-xs text-gray-500 uppercase tracking-wider font-medium pb-2 pr-4">
                    Date
                  </th>
                  <th className="text-[9px] md:text-xs text-gray-500 uppercase tracking-wider font-medium pb-2 pr-4">
                    Type
                  </th>
                  <th className="text-[9px] md:text-xs text-gray-500 uppercase tracking-wider font-medium pb-2 pr-4">
                    Action
                  </th>
                  <th className="text-[9px] md:text-xs text-gray-500 uppercase tracking-wider font-medium pb-2 pr-4">
                    Description
                  </th>
                  <th className="text-[9px] md:text-xs text-gray-500 uppercase tracking-wider font-medium pb-2 text-right">
                    Credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-8 text-xs text-gray-600"
                    >
                      {transactions.length === 0
                        ? "No transactions yet"
                        : "No matching transactions"}
                    </td>
                  </tr>
                ) : (
                  paginated.map((tx) => {
                    const isPositive =
                      tx.type === "purchase" ||
                      tx.type === "bonus";
                    return (
                      <tr
                        key={tx.id}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="text-[9px] md:text-xs py-2.5 pr-4 text-gray-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-gray-600 hidden md:block" />
                            {new Date(tx.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                              },
                            )}
                            <span className="text-gray-600 hidden sm:inline">
                              {new Date(tx.created_at).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="text-[9px] md:text-xs py-2.5 pr-4">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] md:text-[10px] font-medium uppercase tracking-wider ${
                              tx.type === "deduction"
                                ? "bg-red-500/10 text-red-400"
                                : tx.type === "purchase"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : tx.type === "bonus"
                                    ? "bg-blue-500/10 text-blue-400"
                                    : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {isPositive ? (
                              <ArrowDownLeft className="w-2.5 h-2.5" />
                            ) : (
                              <ArrowUpRight className="w-2.5 h-2.5" />
                            )}
                            {tx.type}
                          </span>
                        </td>
                        <td className="text-[9px] md:text-xs py-2.5 pr-4 text-gray-300">
                          {tx.action
                            ? ACTION_LABELS[tx.action] ||
                              tx.action.replace(/_/g, " ")
                            : "-"}
                        </td>
                        <td className="text-[9px] md:text-xs py-2.5 pr-4 text-gray-500 max-w-[150px] md:max-w-[250px] truncate">
                          {tx.description || "-"}
                        </td>
                        <td
                          className={`text-[9px] md:text-xs py-2.5 text-right font-semibold whitespace-nowrap ${
                            isPositive ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {tx.amount}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
              <p className="text-[9px] md:text-xs text-gray-600">
                {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
                {filterType !== "all" || filterAction !== "all" || searchQuery
                  ? " (filtered)"
                  : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-1 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="text-[9px] md:text-xs text-gray-500">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-1 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Current Action Costs Reference */}
        <div className="border border-white/10 p-3 md:p-4 mt-3 md:mt-4">
          <h2 className="text-xs md:text-sm font-semibold mb-2">
            Current Credit Costs
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {actionCosts.map((item) => {
              const Icon = ACTION_ICONS[item.action] || Zap;
              const colorClass =
                ACTION_COLORS[item.action] || "text-gray-400 bg-white/5";
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 p-2 bg-white/[0.02] border border-white/5"
                >
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${colorClass}`}
                  >
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[8px] md:text-[10px] font-medium truncate">
                      {ACTION_LABELS[item.action] ||
                        item.action.replace(/_/g, " ")}
                    </p>
                    <p className="text-[7px] md:text-[9px] text-red-400 font-semibold">
                      {item.credits} cr
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
