"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AssetsTableSkeleton from "@/app/components/AssetsTableSkeleton";
import AdminPagination from "@/app/components/AdminPagination";
import { usePagination } from "@/app/hooks/usePagination";
import {
  MagnifyingGlass,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowsClockwise,
  Lightning,
  FunnelSimple,
  User,
  CurrencyDollar,
} from "phosphor-react";

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

type MarketplaceTransaction = {
  id: string;
  buyer_id: string;
  creator_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  status: string;
  created_at: string;
};

type UserProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

const PAGE_SIZE = 15;

type Tab = "credits" | "marketplace";

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("credits");
  const [loading, setLoading] = useState(true);

  // Credits
  const [creditTx, setCreditTx] = useState<CreditTransaction[]>([]);
  const [filteredCreditTx, setFilteredCreditTx] = useState<
    CreditTransaction[]
  >([]);

  // Marketplace
  const [marketplaceTx, setMarketplaceTx] = useState<MarketplaceTransaction[]>(
    [],
  );
  const [filteredMarketplaceTx, setFilteredMarketplaceTx] = useState<
    MarketplaceTransaction[]
  >([]);

  // Users map
  const [usersMap, setUsersMap] = useState<Record<string, UserProfile>>({});

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortNewest, setSortNewest] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Credit transactions
      const { data: creditData } = await supabase
        .from("credit_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      setCreditTx(creditData || []);
      setFilteredCreditTx(creditData || []);

      // Marketplace transactions
      const { data: marketData } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      setMarketplaceTx(marketData || []);
      setFilteredMarketplaceTx(marketData || []);

      // Fetch user profiles for all user IDs
      const allUserIds = new Set<string>();
      (creditData || []).forEach((t) => allUserIds.add(t.user_id));
      (marketData || []).forEach((t) => {
        allUserIds.add(t.buyer_id);
        allUserIds.add(t.creator_id);
      });

      if (allUserIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", Array.from(allUserIds));

        const map: Record<string, UserProfile> = {};
        (profiles || []).forEach((p) => {
          map[p.id] = p;
        });
        setUsersMap(map);
      }
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filter credits
  useEffect(() => {
    let filtered = [...creditTx];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.user_id.toLowerCase().includes(term) ||
          t.description?.toLowerCase().includes(term) ||
          t.action?.toLowerCase().includes(term) ||
          t.type.toLowerCase().includes(term) ||
          t.stripe_session_id?.toLowerCase().includes(term) ||
          usersMap[t.user_id]?.display_name?.toLowerCase().includes(term),
      );
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }

    if (dateFrom) {
      filtered = filtered.filter((t) => t.created_at >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(
        (t) => t.created_at <= dateTo + "T23:59:59.999Z",
      );
    }

    filtered.sort((a, b) => {
      const diff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortNewest ? diff : -diff;
    });

    setFilteredCreditTx(filtered);
  }, [searchTerm, typeFilter, dateFrom, dateTo, sortNewest, creditTx]);

  // Filter marketplace
  useEffect(() => {
    let filtered = [...marketplaceTx];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.buyer_id.toLowerCase().includes(term) ||
          t.creator_id.toLowerCase().includes(term) ||
          t.status.toLowerCase().includes(term) ||
          usersMap[t.buyer_id]?.display_name?.toLowerCase().includes(term) ||
          usersMap[t.creator_id]?.display_name?.toLowerCase().includes(term),
      );
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((t) => t.status === typeFilter);
    }

    if (dateFrom) {
      filtered = filtered.filter((t) => t.created_at >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(
        (t) => t.created_at <= dateTo + "T23:59:59.999Z",
      );
    }

    filtered.sort((a, b) => {
      const diff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortNewest ? diff : -diff;
    });

    setFilteredMarketplaceTx(filtered);
  }, [searchTerm, typeFilter, dateFrom, dateTo, sortNewest, marketplaceTx]);

  const currentData =
    activeTab === "credits" ? filteredCreditTx : filteredMarketplaceTx;
  const {
    currentPage,
    setCurrentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedItems,
  } = usePagination<CreditTransaction | MarketplaceTransaction>(currentData, {
    pageSize: PAGE_SIZE,
    resetKeys: [
      activeTab,
      searchTerm,
      typeFilter,
      dateFrom,
      dateTo,
      sortNewest,
      currentData.length,
    ],
  });

  // Stats
  const totalCreditsPurchased = creditTx
    .filter((t) => t.type === "purchase")
    .reduce((s, t) => s + t.amount, 0);
  const totalCreditsSpent = creditTx
    .filter((t) => t.type === "deduction")
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalMarketplaceRevenue =
    marketplaceTx.reduce((s, t) => s + t.amount_cents, 0) / 100;
  const totalPlatformFees =
    marketplaceTx.reduce((s, t) => s + t.platform_fee_cents, 0) / 100;


  function getUserName(userId: string) {
    return usersMap[userId]?.display_name || userId.slice(0, 8) + "...";
  }

  function exportToCSV() {
    if (activeTab === "credits") {
      const headers = [
        "ID",
        "User",
        "Type",
        "Amount",
        "Action",
        "Description",
        "Stripe Session",
        "Date",
      ];
      const rows = filteredCreditTx.map((t) => [
        t.id,
        getUserName(t.user_id),
        t.type,
        t.amount,
        t.action || "",
        t.description || "",
        t.stripe_session_id || "",
        t.created_at,
      ]);
      downloadCSV(headers, rows, "credit_transactions");
    } else {
      const headers = [
        "ID",
        "Buyer",
        "Creator",
        "Amount",
        "Platform Fee",
        "Status",
        "Date",
      ];
      const rows = filteredMarketplaceTx.map((t) => [
        t.id,
        getUserName(t.buyer_id),
        getUserName(t.creator_id),
        (t.amount_cents / 100).toFixed(2),
        (t.platform_fee_cents / 100).toFixed(2),
        t.status,
        t.created_at,
      ]);
      downloadCSV(headers, rows, "marketplace_transactions");
    }
  }

  function downloadCSV(headers: string[], rows: any[][], filename: string) {
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }
  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-light mb-6">Transactions</h1>
        <div className="border border-white/10 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <AssetsTableSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light mb-1">Transactions</h1>
          <p className="text-sm text-gray-400">
            Full record of all platform transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm cursor-pointer"
          >
            <ArrowsClockwise size={16} weight="bold" />
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm cursor-pointer"
          >
            <Download size={16} weight="duotone" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] text-gray-500 mb-1">Credits Purchased</p>
          <p className="text-lg font-semibold text-green-400">
            {totalCreditsPurchased.toLocaleString()}
          </p>
        </div>
        <div className="border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] text-gray-500 mb-1">Credits Spent</p>
          <p className="text-lg font-semibold text-red-400">
            {totalCreditsSpent.toLocaleString()}
          </p>
        </div>
        <div className="border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] text-gray-500 mb-1">Marketplace Revenue</p>
          <p className="text-lg font-semibold text-white">
            ${totalMarketplaceRevenue.toFixed(2)}
          </p>
        </div>
        <div className="border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] text-gray-500 mb-1">Platform Fees (all)</p>
          <p className="text-lg font-semibold text-yellow-400">
            ${totalPlatformFees.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 mb-4 border-b border-white/10">
        <button
          onClick={() => {
            setActiveTab("credits");
            setTypeFilter("all");
            setSearchTerm("");
            setCurrentPage(1);
          }}
          className={`px-4 py-2.5 text-sm transition-all cursor-pointer ${
            activeTab === "credits"
              ? "text-white border-b-2 border-red-500"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <Lightning size={16} weight="fill" />
            Credit Transactions ({creditTx.length})
          </div>
        </button>
        <button
          onClick={() => {
            setActiveTab("marketplace");
            setTypeFilter("all");
            setSearchTerm("");
            setCurrentPage(1);
          }}
          className={`px-4 py-2.5 text-sm transition-all cursor-pointer ${
            activeTab === "marketplace"
              ? "text-white border-b-2 border-red-500"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <CurrencyDollar size={16} weight="bold" />
            Marketplace Sales ({marketplaceTx.length})
          </div>
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={18}
            weight="duotone"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder={
              activeTab === "credits"
                ? "Search by user, description, action, stripe session..."
                : "Search by buyer, creator, status..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-white/20"
          />
        </div>

        {/* Type filter dropdown */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 text-sm text-gray-300 focus:outline-none cursor-pointer"
        >
          <option value="all">All Types</option>
          {activeTab === "credits" ? (
            <>
              <option value="purchase">Purchases</option>
              <option value="deduction">Deductions</option>
            </>
          ) : (
            <>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </>
          )}
        </select>

        <button
          onClick={() => setSortNewest(!sortNewest)}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-all cursor-pointer"
        >
          {sortNewest ? (
            <ArrowDown size={14} weight="bold" />
          ) : (
            <ArrowUp size={14} weight="bold" />
          )}
          {sortNewest ? "Newest" : "Oldest"}
        </button>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 border text-sm transition-all cursor-pointer ${
            showFilters
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
          }`}
        >
          <FunnelSimple size={14} weight="bold" />
          Filters
        </button>
      </div>

      {/* Expandable Filters */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-4 p-3 border border-white/10 bg-white/[0.02]">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1.5 bg-white/5 border border-white/10 text-xs text-gray-300 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1.5 bg-white/5 border border-white/10 text-xs text-gray-300 focus:outline-none"
            />
          </div>
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setTypeFilter("all");
              setSearchTerm("");
            }}
            className="mt-4 px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 sticky top-0">
            {activeTab === "credits" ? (
              <tr className="text-left text-gray-400">
                <th className="p-3">User</th>
                <th className="p-3">Type</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Description</th>
                <th className="p-3">Stripe Session</th>
                <th className="p-3">Date</th>
              </tr>
            ) : (
              <tr className="text-left text-gray-400">
                <th className="p-3">Buyer</th>
                <th className="p-3">Creator</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Platform Fee</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
              </tr>
            )}
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">
                  No transactions found
                </td>
              </tr>
            ) : activeTab === "credits" ? (
              (paginatedItems as (CreditTransaction | MarketplaceTransaction)[]).map((tx) => {
                const creditTx = tx as CreditTransaction;
                return (
                <tr
                  key={creditTx.id}
                  className="border-t border-white/10 hover:bg-white/5 transition-colors"
                >
                  {/* User */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {usersMap[creditTx.user_id]?.avatar_url ? (
                        <img
                          src={usersMap[creditTx.user_id].avatar_url!}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                          <User size={12} className="text-gray-500" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs">
                          {usersMap[creditTx.user_id]?.display_name || "—"}
                        </p>
                        <p className="text-[10px] text-gray-600 font-mono">
                          {creditTx.user_id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 text-xs ${
                        creditTx.type === "purchase"
                          ? "bg-green-500/20 text-green-400"
                          : creditTx.type === "deduction"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-white/10 text-gray-400"
                      }`}
                    >
                      {creditTx.type}
                    </span>
                  </td>

                  {/* Amount */}
                  <td className="p-3">
                    <span
                      className={`text-sm font-semibold ${
                        creditTx.type === "purchase"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {creditTx.type === "deduction" ? "−" : "+"}
                      {Math.abs(creditTx.amount).toLocaleString()}
                    </span>
                  </td>

                  {/* Description */}
                  <td className="p-3 max-w-xs">
                    <p className="text-xs text-gray-400 truncate">
                      {creditTx.description || creditTx.action || "—"}
                    </p>
                  </td>

                  {/* Stripe Session */}
                  <td className="p-3">
                    {creditTx.stripe_session_id ? (
                      <span className="text-[10px] text-gray-600 font-mono">
                        {creditTx.stripe_session_id.slice(0, 20)}...
                      </span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>

                  {/* Date */}
                  <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(creditTx.created_at).toLocaleDateString()}{" "}
                    <span className="text-gray-700">
                      {new Date(creditTx.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>
                </tr>
              )})
            ) : (
              (paginatedItems as (CreditTransaction | MarketplaceTransaction)[]).map((tx) => {
                const marketplaceTransaction = tx as MarketplaceTransaction;
                return (
                <tr
                  key={marketplaceTransaction.id}
                  className="border-t border-white/10 hover:bg-white/5 transition-colors"
                >
                  {/* Buyer */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {usersMap[marketplaceTransaction.buyer_id]?.avatar_url ? (
                        <img
                          src={usersMap[marketplaceTransaction.buyer_id].avatar_url!}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                          <User size={12} className="text-gray-500" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs">
                          {usersMap[marketplaceTransaction.buyer_id]?.display_name || "—"}
                        </p>
                        <p className="text-[10px] text-gray-600 font-mono">
                          {marketplaceTransaction.buyer_id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Creator */}
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {usersMap[marketplaceTransaction.creator_id]?.avatar_url ? (
                        <img
                          src={usersMap[marketplaceTransaction.creator_id].avatar_url!}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                          <User size={12} className="text-gray-500" />
                        </div>
                      )}
                      <div>
                        <p className="text-xs">
                          {usersMap[marketplaceTransaction.creator_id]?.display_name || "—"}
                        </p>
                        <p className="text-[10px] text-gray-600 font-mono">
                          {marketplaceTransaction.creator_id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Amount */}
                  <td className="p-3 text-sm font-semibold text-white">
                    ${(marketplaceTransaction.amount_cents / 100).toFixed(2)}
                  </td>

                  {/* Platform Fee */}
                  <td className="p-3 text-sm text-yellow-400">
                    ${(marketplaceTransaction.platform_fee_cents / 100).toFixed(2)}
                  </td>

                  {/* Status */}
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 text-xs ${
                        marketplaceTransaction.status === "paid"
                          ? "bg-green-500/20 text-green-400"
                          : marketplaceTransaction.status === "pending"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {marketplaceTransaction.status}
                    </span>
                  </td>

                  {/* Date */}
                  <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(marketplaceTransaction.created_at).toLocaleDateString()}{" "}
                    <span className="text-gray-700">
                      {new Date(marketplaceTransaction.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
      <AdminPagination
        currentPage={currentPage}
        totalItems={totalItems}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        className="mt-4"
      />
    </div>
  );
}
