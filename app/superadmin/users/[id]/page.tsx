"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AssetsTableSkeleton from "@/app/components/AssetsTableSkeleton";

import {
  User,
  XCircle,
  Lightning,
  Clock,
  ArrowUp,
  ArrowDown,
  CurrencyDollar,
  CaretLeft,
  CaretRight,
} from "phosphor-react";
import Chart from "chart.js/auto";

type UserData = {
  id: string;
  email: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
};

type UserCredits = {
  balance: number;
  total_purchased: number;
  total_spent: number;
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
  pack_price_dollars?: number;
};

type Asset = {
  id: string;
  title: string | null;
  content_type: string;
  price_cents: number | null;
  is_public: boolean;
  views_count: number | null;
  created_at: string;
};

type Transaction = {
  id: string;
  buyer_id: string;
  creator_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  status: string;
  created_at: string;
};

type PurchasedAsset = {
  id: string;
  buyer_id: string;
  seller_id: string;
  asset_id: string;
  purchase_price: number;
  purchased_at: string;
  asset?: {
    title: string;
    content_type: string;
  };
};

type PurchasedLicense = {
  id: string;
  license_number: string;
  buyer_id: string;
  purchase_price: number;
  certificate_url: string | null;
  purchased_at: string;
  asset?: {
    title: string;
  };
  license_type?: {
    name: string;
  };
};

type CartItem = {
  id: string;
  title: string;
  price_cents: number;
  created_at: string;
};

const CREDIT_TX_PAGE_SIZE = 15;

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [creditTxPage, setCreditTxPage] = useState(1);
  const [creditTxFilter, setCreditTxFilter] = useState<"all" | "purchase" | "deduction">("all");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [purchasedAssets, setPurchasedAssets] = useState<PurchasedAsset[]>([]);
  const [purchasedLicenses, setPurchasedLicenses] = useState<
    PurchasedLicense[]
  >([]);
  const [salesAsCreator, setSalesAsCreator] = useState<Transaction[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const revenueChartRef = useRef<HTMLCanvasElement>(null);
  const spendingChartRef = useRef<HTMLCanvasElement>(null);
  const statusChartRef = useRef<HTMLCanvasElement>(null);

  const revenueChartInstance = useRef<Chart | null>(null);
  const spendingChartInstance = useRef<Chart | null>(null);
  const statusChartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    loadUserData();
  }, [userId]);

  useEffect(() => {
    if (!loading && user) {
      createCharts();
    }

    return () => {
      revenueChartInstance.current?.destroy();
      spendingChartInstance.current?.destroy();
      statusChartInstance.current?.destroy();
    };
  }, [loading, transactions, salesAsCreator]);

  async function loadUserData() {
    try {
      const { data: userData, error: userError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (userError) throw userError;
      setUser(userData);

      const { data: assetsData, error: assetsError } = await supabase
        .from("assets")
        .select(
          "id, title, content_type, price_cents, is_public, views_count, created_at",
        )
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });

      if (assetsError) throw assetsError;
      setAssets(assetsData || []);

      const { data: creditsData } = await supabase
        .from("user_credits")
        .select("balance, total_purchased, total_spent")
        .eq("user_id", userId)
        .single();

      if (creditsData) {
        setCredits(creditsData);
      }

      // Credit transactions
      const { data: creditTxData } = await supabase
        .from("credit_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      // Fetch credit packs to map amounts to prices
      const { data: creditPacks } = await supabase
        .from("credit_packs")
        .select("credits, price");

      const packPriceMap: Record<number, number> = {};
      (creditPacks || []).forEach((p: any) => {
        packPriceMap[p.credits] = p.price; // price is in dollars
      });

      const enrichedTx = (creditTxData || []).map((tx: any) => ({
        ...tx,
        pack_price_dollars: tx.type === "purchase" ? packPriceMap[tx.amount] || null : null,
      }));

      setCreditTransactions(enrichedTx);

      const { data: buyerTxData } = await supabase
        .from("transactions")
        .select("*")
        .eq("buyer_id", userId)
        .order("created_at", { ascending: false });

      setTransactions(buyerTxData || []);

      const { data: sellerTxData } = await supabase
        .from("transactions")
        .select("*")
        .eq("creator_id", userId)
        .order("created_at", { ascending: false });

      setSalesAsCreator(sellerTxData || []);

      const { data: purchasesData } = await supabase
        .from("purchased_assets")
        .select("*, asset:assets(title, content_type)")
        .eq("buyer_id", userId)
        .order("purchased_at", { ascending: false });

      setPurchasedAssets(purchasesData || []);

      const { data: licensesData } = await supabase
        .from("purchased_licenses")
        .select("*, license_type:license_types(name), asset:assets(title)")
        .eq("buyer_id", userId)
        .order("purchased_at", { ascending: false });

      setPurchasedLicenses(licensesData || []);

      const { data: cartData } = await supabase
        .from("cart")
        .select("*")
        .eq("user_id", userId);

      setCartItems(cartData || []);
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  }

  function createCharts() {
    // Revenue Over Time Chart
    if (revenueChartRef.current) {
      revenueChartInstance.current?.destroy();

      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return d.toISOString().split("T")[0];
      });

      const revenueByDay = last30Days.map((day) => {
        return (
          salesAsCreator
            .filter(
              (tx) => tx.created_at.startsWith(day) && tx.status === "paid",
            )
            .reduce((sum, tx) => sum + tx.amount_cents, 0) / 100
        );
      });

      revenueChartInstance.current = new Chart(revenueChartRef.current, {
        type: "line",
        data: {
          labels: last30Days.map((d) =>
            new Date(d).toLocaleDateString("en", {
              month: "short",
              day: "numeric",
            }),
          ),
          datasets: [
            {
              label: "Revenue",
              data: revenueByDay,
              borderColor: "rgb(34, 197, 94)",
              backgroundColor: "rgba(34, 197, 94, 0.1)",
              tension: 0.4,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: "#9ca3af" },
              grid: { color: "rgba(255, 255, 255, 0.1)" },
            },
            x: {
              ticks: { color: "#9ca3af", maxRotation: 45, minRotation: 45 },
              grid: { display: false },
            },
          },
        },
      });
    }

    // Spending Over Time Chart
    if (spendingChartRef.current) {
      spendingChartInstance.current?.destroy();

      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return d.toISOString().split("T")[0];
      });

      const spendingByDay = last30Days.map((day) => {
        return (
          transactions
            .filter(
              (tx) => tx.created_at.startsWith(day) && tx.status === "paid",
            )
            .reduce((sum, tx) => sum + tx.amount_cents, 0) / 100
        );
      });

      spendingChartInstance.current = new Chart(spendingChartRef.current, {
        type: "line",
        data: {
          labels: last30Days.map((d) =>
            new Date(d).toLocaleDateString("en", {
              month: "short",
              day: "numeric",
            }),
          ),
          datasets: [
            {
              label: "Spending",
              data: spendingByDay,
              borderColor: "rgb(59, 130, 246)",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              tension: 0.4,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: "#9ca3af" },
              grid: { color: "rgba(255, 255, 255, 0.1)" },
            },
            x: {
              ticks: { color: "#9ca3af", maxRotation: 45, minRotation: 45 },
              grid: { display: false },
            },
          },
        },
      });
    }

    // Transaction Status Breakdown
    if (statusChartRef.current) {
      statusChartInstance.current?.destroy();

      const allTx = [...transactions, ...salesAsCreator];
      const statusCounts = {
        paid: allTx.filter((tx) => tx.status === "paid").length,
        pending: allTx.filter((tx) => tx.status === "pending").length,
        failed: allTx.filter((tx) => tx.status === "failed").length,
      };

      statusChartInstance.current = new Chart(statusChartRef.current, {
        type: "doughnut",
        data: {
          labels: ["Paid", "Pending", "Failed"],
          datasets: [
            {
              data: [
                statusCounts.paid,
                statusCounts.pending,
                statusCounts.failed,
              ],
              backgroundColor: [
                "rgba(34, 197, 94, 0.8)",
                "rgba(234, 179, 8, 0.8)",
                "rgba(239, 68, 68, 0.8)",
              ],
              borderColor: [
                "rgb(34, 197, 94)",
                "rgb(234, 179, 8)",
                "rgb(239, 68, 68)",
              ],
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#9ca3af", padding: 15 },
            },
          },
        },
      });
    }
  }

  // Credit transaction filtering & pagination
  const filteredCreditTx = creditTxFilter === "all"
    ? creditTransactions
    : creditTransactions.filter((tx) => tx.type === creditTxFilter);

  const creditTxTotalPages = Math.ceil(filteredCreditTx.length / CREDIT_TX_PAGE_SIZE);
  const paginatedCreditTx = filteredCreditTx.slice(
    (creditTxPage - 1) * CREDIT_TX_PAGE_SIZE,
    creditTxPage * CREDIT_TX_PAGE_SIZE
  );

  // Credit stats
  const totalPaidForCredits = creditTransactions
    .filter((tx) => tx.type === "purchase" && tx.pack_price_dollars)
    .reduce((sum, tx) => sum + (tx.pack_price_dollars || 0), 0); // already in dollars

  const purchaseTxCount = creditTransactions.filter((tx) => tx.type === "purchase").length;
  const deductionTxCount = creditTransactions.filter((tx) => tx.type === "deduction").length;

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-light mb-6">Profiles</h1>
        <div className="border border-white/10 rounded-lg overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <AssetsTableSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-6rem)]">
        <div className="text-center">
          <XCircle
            size={48}
            className="text-gray-600 mx-auto mb-3"
            weight="duotone"
          />
          <p className="text-sm text-gray-400 mb-3">User not found</p>
          <button
            onClick={() => router.push("/superadmin/users")}
            className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  const totalSpent = transactions.reduce((sum, tx) => sum + tx.amount_cents, 0);
  const totalEarned = salesAsCreator.reduce(
    (sum, tx) => sum + tx.amount_cents,
    0,
  );
  const totalFees = salesAsCreator.reduce(
    (sum, tx) => sum + tx.platform_fee_cents,
    0,
  );
  const purchaseCount = purchasedAssets.length;
  const salesCount = salesAsCreator.length;
  const cartValue = cartItems.reduce((sum, item) => sum + item.price_cents, 0);

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      time: d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
    };
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/superadmin/users")}
          className="p-1.5 hover:bg-white/10 transition-colors cursor-pointer text-gray-400 border border-white/10"
        >
          <CaretLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-light truncate">
            {user.display_name || user.email}
          </h1>
          <p className="text-xs text-gray-500 truncate">{user.email}</p>
        </div>
        <span
          className={`px-2 py-0.5 text-xs ${user.role === "superadmin" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/5 text-gray-400 border border-white/10"}`}
        >
          {user.role === "superadmin" ? "Admin" : "User"}
        </span>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-600 mb-1">Total Spent</p>
          <p className="text-2xl font-light">
            ${(totalSpent / 100).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500">{purchaseCount} purchases</p>
        </div>

        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-600 mb-1">Total Earned</p>
          <p className="text-2xl font-light">
            ${(totalEarned / 100).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500">{salesCount} sales</p>
        </div>

        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-600 mb-1">Platform Fees</p>
          <p className="text-2xl font-light">${(totalFees / 100).toFixed(2)}</p>
          <p className="text-xs text-gray-500">From sales</p>
        </div>

        <div className="border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-600 mb-1">Cart Value</p>
          <p className="text-2xl font-light">${(cartValue / 100).toFixed(2)}</p>
          <p className="text-xs text-gray-500">{cartItems.length} items</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-light mb-3">Revenue (Last 30 Days)</h3>
          <div className="h-48">
            <canvas ref={revenueChartRef}></canvas>
          </div>
        </div>

        <div className="border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-light mb-3">Spending (Last 30 Days)</h3>
          <div className="h-48">
            <canvas ref={spendingChartRef}></canvas>
          </div>
        </div>

        <div className="border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-light mb-3">Transaction Status</h3>
          <div className="h-48">
            <canvas ref={statusChartRef}></canvas>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile */}
        <div className="border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-gray-500" />
            <h2 className="text-sm font-light">Profile</h2>
          </div>

          <div className="flex gap-3 mb-3">
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name || "User"}
                className="w-12 h-12 rounded-full border border-white/10 object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0">
                <User size={24} className="text-gray-500" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div>
                <p className="text-xs text-gray-600">Name</p>
                <p className="text-xs truncate">{user.display_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Joined</p>
                <p className="text-xs">
                  {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {user.bio && (
            <div className="mb-2">
              <p className="text-xs text-gray-600 mb-0.5">Bio</p>
              <p className="text-xs text-gray-400 line-clamp-2">{user.bio}</p>
            </div>
          )}

          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-gray-600 mb-0.5">ID</p>
            <p className="text-xs text-gray-700 font-mono break-all">
              {user.id}
            </p>
          </div>
        </div>

        {/* Credits Overview */}
        <div className="border border-white/10 bg-white/5 p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Lightning size={16} className="text-red-500" weight="fill" />
            <h2 className="text-sm font-light">Credits Overview</h2>
          </div>

          {credits ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-600 mb-1">Current Balance</p>
                <p className={`text-2xl font-semibold ${credits.balance > 0 ? "text-white" : "text-gray-600"}`}>
                  {credits.balance.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Total Purchased</p>
                <p className="text-2xl font-light text-green-400">
                  {credits.total_purchased.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Total Spent</p>
                <p className="text-2xl font-light text-red-400">
                  {credits.total_spent.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-1">Total Paid</p>
                <p className="text-2xl font-light text-blue-400">
                  ${totalPaidForCredits.toFixed(2)}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Lightning
                size={32}
                className="text-gray-700 mx-auto mb-2"
                weight="duotone"
              />
              <p className="text-xs text-gray-500">No credits data</p>
            </div>
          )}
        </div>

        {/* Credit Statements - Full Width */}
        <div className="border border-white/10 bg-white/5 p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CurrencyDollar size={16} className="text-gray-500" />
              <h2 className="text-sm font-light">
                Credit Statements ({filteredCreditTx.length})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Type filter tabs */}
              {(["all", "purchase", "deduction"] as const).map((type) => {
                const count =
                  type === "all"
                    ? creditTransactions.length
                    : type === "purchase"
                      ? purchaseTxCount
                      : deductionTxCount;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setCreditTxFilter(type);
                      setCreditTxPage(1);
                    }}
                    className={`px-3 py-1 text-xs transition-all cursor-pointer ${
                      creditTxFilter === type
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-gray-500 hover:text-white hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1)}
                    {count > 0 && (
                      <span className="ml-1 text-gray-600">({count})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredCreditTx.length === 0 ? (
            <div className="text-center py-8">
              <Lightning
                size={32}
                className="text-gray-700 mx-auto mb-2"
                weight="duotone"
              />
              <p className="text-xs text-gray-500">
                {creditTxFilter === "all"
                  ? "No credit transactions yet"
                  : `No ${creditTxFilter} transactions`}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-500 border-b border-white/10">
                    <tr>
                      <th className="p-2.5 text-left">Date & Time</th>
                      <th className="p-2.5 text-left">Type</th>
                      <th className="p-2.5 text-left">Credits</th>
                      <th className="p-2.5 text-left">Amount Paid</th>
                      <th className="p-2.5 text-left">Description</th>
                      <th className="p-2.5 text-left">Stripe Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCreditTx.map((tx) => {
                      const dt = formatDateTime(tx.created_at);
                      const typeBadge =
                        tx.type === "purchase"
                          ? "bg-green-500/10 text-green-400 border-green-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20";

                      return (
                        <tr
                          key={tx.id}
                          className="border-t border-white/10 hover:bg-white/[0.03] transition-colors"
                        >
                          {/* Date & Time */}
                          <td className="p-2.5">
                            <div className="flex items-start gap-2">
                              <Clock
                                size={14}
                                className="text-gray-600 mt-0.5 shrink-0"
                                weight="duotone"
                              />
                              <div>
                                <div className="text-gray-300">{dt.date}</div>
                                <div className="text-gray-600">{dt.time}</div>
                              </div>
                            </div>
                          </td>

                          {/* Type */}
                          <td className="p-2.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs border ${typeBadge}`}
                            >
                              {tx.type === "purchase" ? (
                                <ArrowDown size={10} weight="bold" />
                              ) : (
                                <ArrowUp size={10} weight="bold" />
                              )}
                              {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                            </span>
                          </td>

                          {/* Credits */}
                          <td className="p-2.5">
                            <div className="flex items-center gap-1">
                              <Lightning
                                size={12}
                                className="text-red-500"
                                weight="fill"
                              />
                              <span
                                className={`font-semibold ${
                                  tx.type === "purchase"
                                    ? "text-green-400"
                                    : "text-red-400"
                                }`}
                              >
                                {tx.type === "purchase" ? "+" : "-"}
                                {Math.abs(tx.amount).toLocaleString()}
                              </span>
                            </div>
                          </td>

                          {/* Amount Paid */}
                          <td className="p-2.5">
                            {tx.pack_price_dollars ? (
                              <span className="text-gray-300 font-medium">
                                ${tx.pack_price_dollars.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>

                          {/* Description */}
                          <td className="p-2.5 max-w-[200px]">
                            <span className="text-gray-400 truncate block">
                              {tx.description || tx.action || "—"}
                            </span>
                          </td>

                          {/* Stripe Session */}
                          <td className="p-2.5">
                            {tx.stripe_session_id ? (
                              <span className="text-gray-600 font-mono text-[10px] block truncate max-w-[140px]" title={tx.stripe_session_id}>
                                {tx.stripe_session_id}
                              </span>
                            ) : (
                              <span className="text-gray-700">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {creditTxTotalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                  <div className="text-xs text-gray-500">
                    Showing {(creditTxPage - 1) * CREDIT_TX_PAGE_SIZE + 1}–
                    {Math.min(creditTxPage * CREDIT_TX_PAGE_SIZE, filteredCreditTx.length)} of{" "}
                    {filteredCreditTx.length}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCreditTxPage((p) => Math.max(1, p - 1))}
                      disabled={creditTxPage === 1}
                      className="p-1.5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <CaretLeft size={14} />
                    </button>
                    <span className="text-xs text-gray-400 px-2">
                      {creditTxPage} / {creditTxTotalPages}
                    </span>
                    <button
                      onClick={() => setCreditTxPage((p) => Math.min(creditTxTotalPages, p + 1))}
                      disabled={creditTxPage === creditTxTotalPages}
                      className="p-1.5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      <CaretRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Assets Table */}
        <div className="border border-white/10 bg-white/5 p-4 lg:col-span-3">
          <h2 className="text-sm font-light mb-3">
            User Assets ({assets.length})
          </h2>

          {assets.length === 0 ? (
            <p className="text-xs text-gray-500">No assets uploaded</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-white/10">
                  <tr>
                    <th className="p-2 text-left">Title</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Price</th>
                    <th className="p-2 text-left">Public</th>
                    <th className="p-2 text-left">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <tr key={asset.id} className="border-t border-white/10">
                      <td className="p-2">{asset.title || "—"}</td>
                      <td className="p-2">{asset.content_type}</td>
                      <td className="p-2">
                        ${((asset.price_cents || 0) / 100).toFixed(2)}
                      </td>
                      <td className="p-2">{asset.is_public ? "Yes" : "No"}</td>
                      <td className="p-2">{asset.views_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Transactions */}
        <div className="border border-white/10 bg-white/5 p-4 lg:col-span-3">
          <h2 className="text-sm font-light mb-3">Recent Transactions</h2>

          {transactions.length === 0 && salesAsCreator.length === 0 ? (
            <p className="text-xs text-gray-500">No transactions yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-white/10">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Amount</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...transactions
                      .slice(0, 5)
                      .map((tx) => ({ ...tx, type: "Purchase" })),
                    ...salesAsCreator
                      .slice(0, 5)
                      .map((tx) => ({ ...tx, type: "Sale" })),
                  ]
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime(),
                    )
                    .slice(0, 10)
                    .map((tx) => (
                      <tr key={tx.id} className="border-t border-white/10">
                        <td className="p-2">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-0.5 text-xs ${tx.type === "Sale" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"}`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-2">
                          ${(tx.amount_cents / 100).toFixed(2)}
                        </td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-0.5 text-xs ${tx.status === "paid" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}
                          >
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Purchased Licenses */}
        <div className="border border-white/10 bg-white/5 p-4 lg:col-span-3">
          <h2 className="text-sm font-light mb-3">
            Purchased Licenses ({purchasedLicenses.length})
          </h2>

          {purchasedLicenses.length === 0 ? (
            <p className="text-xs text-gray-500">No licenses purchased</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-white/10">
                  <tr>
                    <th className="p-2 text-left">License #</th>
                    <th className="p-2 text-left">Asset</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Price</th>
                    <th className="p-2 text-left">Certificate</th>
                  </tr>
                </thead>
                <tbody>
                  {purchasedLicenses.slice(0, 10).map((license) => (
                    <tr key={license.id} className="border-t border-white/10">
                      <td className="p-2 font-mono text-xs">
                        {license.license_number}
                      </td>
                      <td className="p-2">{license.asset?.title || "—"}</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs">
                          {license.license_type?.name || "—"}
                        </span>
                      </td>
                      <td className="p-2">
                        ${(license.purchase_price / 100).toFixed(2)}
                      </td>
                      <td className="p-2">
                        {license.certificate_url ? (
                          <a
                            href={license.certificate_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline"
                          >
                            Download
                          </a>
                        ) : (
                          <span className="text-gray-600">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cart Items */}
        {cartItems.length > 0 && (
          <div className="border border-white/10 bg-white/5 p-4 lg:col-span-3">
            <h2 className="text-sm font-light mb-3">
              Current Cart ({cartItems.length} items - $
              {(cartValue / 100).toFixed(2)})
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500 border-b border-white/10">
                  <tr>
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-left">Price</th>
                    <th className="p-2 text-left">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item) => (
                    <tr key={item.id} className="border-t border-white/10">
                      <td className="p-2">{item.title}</td>
                      <td className="p-2">
                        ${(item.price_cents / 100).toFixed(2)}
                      </td>
                      <td className="p-2">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
