"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  CheckCircle,
  XCircle,
  Clock,
  CaretDown,
  FunnelSimple,
  ArrowsClockwise,
  CreditCard,
  Lightning,
  Receipt,
  Warning,
  MagnifyingGlass,
  CalendarBlank,
  User,
  SortAscending,
  SortDescending,
  X,
  Export,
  CaretLeft,
  CaretRight,
} from "phosphor-react";
import AssetsTableSkeleton from "@/app/components/AssetsTableSkeleton";

// ─── Types ───

type WebhookLog = {
  id: string;
  event_type: string;
  event_id: string;
  status: string;
  payload: any;
  error_message: string | null;
  created_at: string;
};

type CreditTransaction = {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  action: string | null;
  description: string | null;
  stripe_session_id: string | null;
  created_at: string;
};

type DataSource = "webhooks" | "credits";

type SortDir = "desc" | "asc";

// ─── Filter Presets ───

interface FilterPreset {
  id: string;
  label: string;
  icon: any;
  source: DataSource;
  filters: Record<string, string>;
}

const PRESETS: FilterPreset[] = [
  {
    id: "all_webhooks",
    label: "All Webhook Events",
    icon: ArrowsClockwise,
    source: "webhooks",
    filters: {},
  },
  {
    id: "successful_webhooks",
    label: "Successful Webhooks",
    icon: CheckCircle,
    source: "webhooks",
    filters: { status: "success" },
  },
  {
    id: "failed_webhooks",
    label: "Failed Webhooks",
    icon: Warning,
    source: "webhooks",
    filters: { status: "failed" },
  },
  {
    id: "checkout_completed",
    label: "Checkout Completed",
    icon: CreditCard,
    source: "webhooks",
    filters: { event_type: "checkout.session.completed" },
  },
  {
    id: "payment_failed",
    label: "Payment Failed",
    icon: XCircle,
    source: "webhooks",
    filters: { event_type: "invoice.payment_failed" },
  },
  {
    id: "subscription_events",
    label: "Subscription Events",
    icon: ArrowsClockwise,
    source: "webhooks",
    filters: { event_type_like: "customer.subscription" },
  },
  {
    id: "all_credit_txns",
    label: "All Credit Transactions",
    icon: Receipt,
    source: "credits",
    filters: {},
  },
  {
    id: "credit_purchases",
    label: "Credit Purchases",
    icon: CreditCard,
    source: "credits",
    filters: { type: "purchase" },
  },
  {
    id: "credit_deductions",
    label: "Credit Deductions",
    icon: Lightning,
    source: "credits",
    filters: { type: "deduction" },
  },
];

// ─── Unique action types for credit filter
const CREDIT_ACTIONS = [
  "decision_layer",
  "remix_transform",
  "remix_regenerate",
  "video_5s",
  "video_10s",
  "audio_generation",
  "image_generation",
];

export default function ActivityPage() {
  // Data
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [creditTxns, setCreditTxns] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Preset dropdown
  const [activePreset, setActivePreset] = useState<string>("all_webhooks");
  const [presetOpen, setPresetOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [limit, setLimit] = useState(100);

  // Filter dropdowns
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const currentPreset = PRESETS.find((p) => p.id === activePreset)!;
  const source = currentPreset.source;

  // ─── Load Data ───

  const loadData = useCallback(async () => {
    setLoading(true);

    if (source === "credits") {
      let query = supabase
        .from("credit_transactions")
        .select("*")
        .order("created_at", { ascending: sortDir === "asc" })
        .limit(limit);

      // Preset filters
      if (currentPreset.filters.type) {
        query = query.eq("type", currentPreset.filters.type);
      }

      // User filter
      if (userIdFilter.trim()) {
        query = query.ilike("user_id", `%${userIdFilter.trim()}%`);
      }

      // Action filter
      if (actionFilter) {
        query = query.eq("action", actionFilter);
      }

      // Date range
      if (dateFrom) {
        query = query.gte("created_at", new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }

      const { data } = await query;
      setCreditTxns((data as CreditTransaction[]) || []);
      setWebhookLogs([]);
    } else {
      let query = supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: sortDir === "asc" })
        .limit(limit);

      // Preset filters
      if (currentPreset.filters.status) {
        query = query.eq("status", currentPreset.filters.status);
      }
      if (currentPreset.filters.event_type) {
        query = query.eq("event_type", currentPreset.filters.event_type);
      }
      if (currentPreset.filters.event_type_like) {
        query = query.ilike(
          "event_type",
          `%${currentPreset.filters.event_type_like}%`
        );
      }

      // Date range
      if (dateFrom) {
        query = query.gte("created_at", new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }

      const { data } = await query;
      setWebhookLogs(data || []);
      setCreditTxns([]);
    }

    setLoading(false);
  }, [activePreset, sortDir, limit, userIdFilter, actionFilter, dateFrom, dateTo, source, currentPreset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Client-side search filter ───

  const filteredWebhooks = webhookLogs.filter((log) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      log.event_type.toLowerCase().includes(s) ||
      log.event_id.toLowerCase().includes(s) ||
      log.error_message?.toLowerCase().includes(s) ||
      JSON.stringify(log.payload || {}).toLowerCase().includes(s)
    );
  });

  const filteredTxns = creditTxns.filter((txn) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      txn.user_id.toLowerCase().includes(s) ||
      txn.type.toLowerCase().includes(s) ||
      txn.action?.toLowerCase().includes(s) ||
      txn.description?.toLowerCase().includes(s)
    );
  });

  // ─── Stats ───

  const totalPurchased = creditTxns
    .filter((t) => t.type === "purchase")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDeducted = creditTxns
    .filter((t) => t.type === "deduction")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const successWebhooks = webhookLogs.filter(
    (l) => l.status === "success"
  ).length;
  const failedWebhooks = webhookLogs.filter(
    (l) => l.status === "failed"
  ).length;

  // ─── Active filter count ───

  const activeFilterCount = [
    dateFrom,
    dateTo,
    userIdFilter,
    actionFilter,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setUserIdFilter("");
    setActionFilter("");
    setSearch("");
    setPage(0);
  };

  const CurrentIcon = currentPreset.icon;
  const resultCount = source === "credits" ? filteredTxns.length : filteredWebhooks.length;
  const totalPages = Math.ceil(resultCount / PAGE_SIZE);
  const pagedTxns = filteredTxns.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pagedWebhooks = filteredWebhooks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold mb-1">Activity</h1>
          <p className="text-xs text-gray-500">
            Monitor events, credit transactions, and webhook logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer"
          >
            <ArrowsClockwise size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* ─── Controls ─── */}
      <div className="space-y-3 mb-5">
        {/* Row 1: Preset + Search + Results */}
        <div className="flex items-center gap-3">
          {/* Preset Dropdown */}
          <div className="relative">
            <button
              onClick={() => setPresetOpen(!presetOpen)}
              className="flex items-center gap-2 px-3 py-2 border border-white/10 bg-white/[0.02] hover:border-white/20 transition-colors cursor-pointer min-w-[240px]"
            >
              <CurrentIcon size={14} className="text-red-500" />
              <span className="text-xs text-white flex-1 text-left">
                {currentPreset.label}
              </span>
              <CaretDown
                size={12}
                className={`text-gray-500 transition-transform duration-200 ${
                  presetOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {presetOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPresetOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 w-full border border-white/10 bg-black z-50 overflow-hidden max-h-[400px] overflow-y-auto">
                  {/* Webhooks group */}
                  <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-gray-600 font-medium bg-white/[0.02] border-b border-white/5">
                    Webhook Events
                  </div>
                  {PRESETS.filter((p) => p.source === "webhooks").map((v) => {
                    const VIcon = v.icon;
                    return (
                      <button
                        key={v.id}
                        onClick={() => {
                          setActivePreset(v.id);
                          setPresetOpen(false);
                          clearFilters();
                        }}
                        className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                          activePreset === v.id
                            ? "bg-red-500/10 text-white"
                            : "text-gray-400 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        <VIcon
                          size={14}
                          className={
                            activePreset === v.id
                              ? "text-red-500"
                              : "text-gray-600"
                          }
                        />
                        {v.label}
                      </button>
                    );
                  })}

                  {/* Credits group */}
                  <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-gray-600 font-medium bg-white/[0.02] border-b border-white/5 border-t border-white/5">
                    Credit Transactions
                  </div>
                  {PRESETS.filter((p) => p.source === "credits").map((v) => {
                    const VIcon = v.icon;
                    return (
                      <button
                        key={v.id}
                        onClick={() => {
                          setActivePreset(v.id);
                          setPresetOpen(false);
                          clearFilters();
                        }}
                        className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-xs transition-colors cursor-pointer ${
                          activePreset === v.id
                            ? "bg-red-500/10 text-white"
                            : "text-gray-400 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        <VIcon
                          size={14}
                          className={
                            activePreset === v.id
                              ? "text-red-500"
                              : "text-gray-600"
                          }
                        />
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlass
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"
            />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search events, IDs, descriptions..."
              className="w-full bg-white/[0.02] border border-white/10 text-white text-xs px-3 py-2 pl-8 placeholder:text-gray-600 focus:outline-none focus:border-red-500/40 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border transition-colors cursor-pointer ${
              showFilters || activeFilterCount > 0
                ? "border-red-500/40 text-red-400 bg-red-500/5"
                : "border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
            }`}
          >
            <FunnelSimple size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-semibold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Sort */}
          <button
            onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-white/10 text-gray-400 hover:border-white/20 hover:text-white transition-colors cursor-pointer"
            title={sortDir === "desc" ? "Newest first" : "Oldest first"}
          >
            {sortDir === "desc" ? (
              <SortDescending size={14} />
            ) : (
              <SortAscending size={14} />
            )}
          </button>

          {/* Results count */}
          <span className="text-[10px] text-gray-600 px-2 py-1.5 bg-white/[0.03] border border-white/5 shrink-0">
            {resultCount} results
          </span>
        </div>

        {/* Row 2: Expanded Filters */}
        {showFilters && (
          <div className="flex items-end gap-3 p-3 border border-white/10 bg-white/[0.01]">
            {/* Date From */}
            <div className="flex-1">
              <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 block">
                From
              </label>
              <div className="relative">
                <CalendarBlank
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"
                />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 text-white text-xs px-3 py-1.5 pl-7 focus:outline-none focus:border-red-500/40 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Date To */}
            <div className="flex-1">
              <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 block">
                To
              </label>
              <div className="relative">
                <CalendarBlank
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 text-white text-xs px-3 py-1.5 pl-7 focus:outline-none focus:border-red-500/40 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>

            {/* User ID */}
            {source === "credits" && (
              <div className="flex-1">
                <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 block">
                  User ID
                </label>
                <div className="relative">
                  <User
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"
                  />
                  <input
                    value={userIdFilter}
                    onChange={(e) => setUserIdFilter(e.target.value)}
                    placeholder="Partial or full ID"
                    className="w-full bg-white/[0.03] border border-white/10 text-white text-xs px-3 py-1.5 pl-7 placeholder:text-gray-600 focus:outline-none focus:border-red-500/40 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Action (credits only) */}
            {source === "credits" && (
              <div className="flex-1">
                <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 block">
                  Action
                </label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 text-white text-xs px-3 py-1.5 focus:outline-none focus:border-red-500/40 transition-colors"
                >
                  <option value="">All actions</option>
                  {CREDIT_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Limit */}
            <div className="w-20">
              <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-1 block">
                Limit
              </label>
              <select
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                className="w-full bg-white/[0.03] border border-white/10 text-white text-xs px-3 py-1.5 focus:outline-none focus:border-red-500/40 transition-colors"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>

            {/* Clear */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <X size={10} />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Stats ─── */}
      {source === "credits" && creditTxns.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="border border-white/10 p-3">
            <p className="text-[10px] text-gray-500 mb-0.5">Transactions</p>
            <p className="text-lg font-bold">{creditTxns.length}</p>
          </div>
          <div className="border border-white/10 p-3">
            <p className="text-[10px] text-gray-500 mb-0.5">Purchased</p>
            <p className="text-lg font-bold text-green-400">
              +{totalPurchased.toLocaleString()}
            </p>
          </div>
          <div className="border border-white/10 p-3">
            <p className="text-[10px] text-gray-500 mb-0.5">Spent</p>
            <p className="text-lg font-bold text-red-400">
              -{totalDeducted.toLocaleString()}
            </p>
          </div>
          <div className="border border-white/10 p-3">
            <p className="text-[10px] text-gray-500 mb-0.5">Net</p>
            <p
              className={`text-lg font-bold ${
                totalPurchased - totalDeducted >= 0
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {totalPurchased - totalDeducted >= 0 ? "+" : ""}
              {(totalPurchased - totalDeducted).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {source === "webhooks" && webhookLogs.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="border border-white/10 p-3">
            <p className="text-[10px] text-gray-500 mb-0.5">Total Events</p>
            <p className="text-lg font-bold">{webhookLogs.length}</p>
          </div>
          <div className="border border-white/10 p-3">
            <p className="text-[10px] text-gray-500 mb-0.5">Successful</p>
            <p className="text-lg font-bold text-green-400">
              {successWebhooks}
            </p>
          </div>
          <div className="border border-white/10 p-3">
            <p className="text-[10px] text-gray-500 mb-0.5">Failed</p>
            <p className="text-lg font-bold text-red-400">{failedWebhooks}</p>
          </div>
        </div>
      )}

      {/* ─── Table ─── */}
      {loading ? (
        <div className="border border-white/10 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <AssetsTableSkeleton key={i} />
          ))}
        </div>
      ) : source === "credits" ? (
        <div className="border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[36px_1fr_70px_70px_1fr_130px] gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            <span></span>
            <span>User</span>
            <span>Type</span>
            <span>Amount</span>
            <span>Description</span>
            <span>Time</span>
          </div>

          {pagedTxns.length === 0 ? (
            <div className="p-10 text-center text-gray-600 text-xs">
              No transactions match your filters
            </div>
          ) : (
            pagedTxns.map((txn) => (
              <div
                key={txn.id}
                className="grid grid-cols-[36px_1fr_70px_70px_1fr_130px] gap-2 px-4 py-3 border-b border-white/5 items-center hover:bg-white/[0.02] transition-colors"
              >
                <div>
                  {txn.type === "purchase" ? (
                    <CreditCard
                      size={14}
                      className="text-green-400"
                      weight="fill"
                    />
                  ) : txn.type === "deduction" ? (
                    <Lightning
                      size={14}
                      className="text-red-400"
                      weight="fill"
                    />
                  ) : (
                    <ArrowsClockwise
                      size={14}
                      className="text-blue-400"
                      weight="fill"
                    />
                  )}
                </div>
                <code className="text-[10px] text-gray-500 font-mono truncate">
                  {txn.user_id.slice(0, 16)}...
                </code>
                <span
                  className={`text-[9px] uppercase tracking-wider font-medium ${
                    txn.type === "purchase"
                      ? "text-green-400"
                      : txn.type === "deduction"
                        ? "text-red-400"
                        : "text-blue-400"
                  }`}
                >
                  {txn.type}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    txn.amount > 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {txn.amount > 0 ? "+" : ""}
                  {txn.amount}
                </span>
                <span className="text-[10px] text-gray-500 truncate">
                  {txn.description || txn.action?.replace(/_/g, " ") || "—"}
                </span>
                <span className="text-[10px] text-gray-600">
                  {new Date(txn.created_at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[36px_1fr_1fr_1fr_130px] gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-[10px] uppercase tracking-wider text-gray-500 font-medium">
            <span></span>
            <span>Event Type</span>
            <span>Event ID</span>
            <span>Details</span>
            <span>Time</span>
          </div>

          {pagedWebhooks.length === 0 ? (
            <div className="p-10 text-center text-gray-600 text-xs">
              No events match your filters
            </div>
          ) : (
            pagedWebhooks.map((log) => (
              <div
                key={log.id}
                className="grid grid-cols-[36px_1fr_1fr_1fr_130px] gap-2 px-4 py-3 border-b border-white/5 items-center hover:bg-white/[0.02] transition-colors"
              >
                <div>
                  {log.status === "success" ? (
                    <CheckCircle
                      size={14}
                      className="text-green-400"
                      weight="fill"
                    />
                  ) : (
                    <XCircle
                      size={14}
                      className="text-red-400"
                      weight="fill"
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 truncate">
                  {log.event_type.includes("completed") ? (
                    <CheckCircle
                      size={11}
                      className="text-green-500 shrink-0"
                    />
                  ) : log.event_type.includes("failed") ||
                    log.event_type.includes("deleted") ? (
                    <XCircle size={11} className="text-red-500 shrink-0" />
                  ) : (
                    <Clock size={11} className="text-blue-500 shrink-0" />
                  )}
                  <span className="text-xs text-white truncate">
                    {log.event_type}
                  </span>
                </div>
                <code className="text-[10px] text-gray-500 font-mono truncate">
                  {log.event_id.slice(0, 20)}...
                </code>
                <div className="text-[10px] truncate">
                  {log.error_message ? (
                    <span className="text-red-400">{log.error_message}</span>
                  ) : log.payload ? (
                    <span className="text-gray-500">
                      {log.payload.userId &&
                        `User: ${log.payload.userId.slice(0, 8)}... `}
                      {log.payload.packId && `Pack: ${log.payload.packId} `}
                      {log.payload.credits &&
                        `Credits: ${log.payload.credits} `}
                      {log.payload.planId && `Plan: ${log.payload.planId} `}
                      {log.payload.subscriptionId &&
                        `Sub: ${log.payload.subscriptionId.slice(0, 12)}... `}
                      {log.payload.invoiceId &&
                        `Invoice: ${log.payload.invoiceId.slice(0, 12)}... `}
                      {!log.payload.userId &&
                        !log.payload.subscriptionId &&
                        !log.payload.invoiceId &&
                        !log.payload.packId &&
                        !log.payload.planId &&
                        (log.payload.message || "—")}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>
                <span className="text-[10px] text-gray-600">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-[10px] text-gray-600">
            Showing {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, resultCount)} of {resultCount}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="px-2 py-1 text-[10px] border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
              className="p-1 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <CaretLeft size={12} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i)
              .filter(
                (i) =>
                  i === 0 ||
                  i === totalPages - 1 ||
                  Math.abs(i - page) <= 2
              )
              .reduce<(number | "dots")[]>((acc, i, idx, arr) => {
                if (idx > 0 && i - (arr[idx - 1] as number) > 1) {
                  acc.push("dots");
                }
                acc.push(i);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "dots" ? (
                  <span
                    key={`dots-${idx}`}
                    className="px-1 text-[10px] text-gray-600"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item as number)}
                    className={`w-7 h-7 text-[10px] border transition-colors cursor-pointer ${
                      page === item
                        ? "border-red-500/50 bg-red-500/10 text-white"
                        : "border-white/10 text-gray-500 hover:text-white hover:border-white/20"
                    }`}
                  >
                    {(item as number) + 1}
                  </button>
                )
              )}

            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="p-1 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <CaretRight size={12} />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-[10px] border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
