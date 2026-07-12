"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  CurrencyDollar,
  TrendUp,
  Package,
  ArrowSquareOut,
  CircleNotch,
  Calendar,
  ArrowUp,
  ArrowDown,
  DownloadSimple,
  Funnel,
  X,
  MagnifyingGlass,
  Coins,
} from "phosphor-react";
import ReactECharts from "echarts-for-react";

// Skeleton Component
const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-white/10 rounded ${className}`}></div>
);

export default function EarningsPage() {
  const TOP_ASSETS_PAGE_SIZE = 5;
  const ROYALTIES_PAGE_SIZE = 10;
  const TRANSACTIONS_PAGE_SIZE = 10;
  const [earnings, setEarnings] = useState<any[]>([]);
  const [royalties, setRoyalties] = useState<any[]>([]);
  const [royaltyPercent, setRoyaltyPercent] = useState(3);
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalSales: 0,
    thisMonth: 0,
    totalRoyalties: 0,
    royaltyThisMonth: 0,
    royaltyPending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [stripeDashboardUrl, setStripeDashboardUrl] = useState<string | null>(
    null
  );
  const [revenueChartData, setRevenueChartData] = useState<any>(null);
  const [salesChartData, setSalesChartData] = useState<any>(null);
  const [assetChartData, setAssetChartData] = useState<any>(null);
  const [topAssets, setTopAssets] = useState<any[]>([]);
  const [growthRate, setGrowthRate] = useState(0);
  const [topAssetsVisibleCount, setTopAssetsVisibleCount] = useState(
    TOP_ASSETS_PAGE_SIZE
  );
  const [royaltiesVisibleCount, setRoyaltiesVisibleCount] = useState(
    ROYALTIES_PAGE_SIZE
  );
  const [transactionsVisibleCount, setTransactionsVisibleCount] = useState(
    TRANSACTIONS_PAGE_SIZE
  );

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    dateRange: "all", // all, 7d, 30d, 90d
    minAmount: "",
    maxAmount: "",
    buyer: "",
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: session } = await supabase.auth.getSession();

        if (!session.session) {
          setLoading(false);
          return;
        }

        const earningsRes = await fetch("/api/seller/earnings", {
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        });
        const earningsData = await earningsRes.json();

        if (!earningsRes.ok) {
          console.error("Earnings fetch failed:", earningsData);
        }

        const transactions = earningsData.transactions || [];
        setEarnings(transactions);
        setRoyalties(earningsData.royalties || []);
        if (typeof earningsData.royaltyPercent === "number") {
          setRoyaltyPercent(earningsData.royaltyPercent);
        }
        setStats(
          earningsData.stats || {
            totalEarnings: 0,
            totalSales: 0,
            thisMonth: 0,
            totalRoyalties: 0,
            royaltyThisMonth: 0,
            royaltyPending: 0,
          }
        );

        processChartData(transactions);
        processTopAssets(transactions);
        calculateGrowthRate(transactions);

        const stripeRes = await fetch("/api/stripe/create-login-link", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        });
        const stripeData = await stripeRes.json();
        if (stripeData.url) {
          setStripeDashboardUrl(stripeData.url);
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Smart filtering logic
  const filteredEarnings = useMemo(() => {
    return earnings.filter((sale) => {
      // Search filter (asset name or buyer)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesAsset = sale.asset_title
          ?.toLowerCase()
          .includes(searchLower);
        const matchesBuyer = (sale.buyer_name || sale.buyer_email)
          ?.toLowerCase()
          .includes(searchLower);
        if (!matchesAsset && !matchesBuyer) return false;
      }

      // Buyer filter
      if (filters.buyer) {
        const buyerLower = filters.buyer.toLowerCase();
        const matchesBuyer = (sale.buyer_name || sale.buyer_email)
          ?.toLowerCase()
          .includes(buyerLower);
        if (!matchesBuyer) return false;
      }

      // Date range filter
      if (filters.dateRange !== "all") {
        const saleDate = new Date(sale.purchased_at);
        const now = new Date();
        const daysAgo = parseInt(filters.dateRange);
        const cutoffDate = new Date(
          now.getTime() - daysAgo * 24 * 60 * 60 * 1000
        );
        if (saleDate < cutoffDate) return false;
      }

      // Amount range filter
      const amount = sale.purchase_price / 100;
      if (filters.minAmount && amount < parseFloat(filters.minAmount))
        return false;
      if (filters.maxAmount && amount > parseFloat(filters.maxAmount))
        return false;

      return true;
    });
  }, [earnings, filters]);

  // Calculate filtered stats
  const filteredStats = useMemo(() => {
    const total = filteredEarnings.reduce(
      (sum, sale) => sum + sale.purchase_price,
      0
    );
    return {
      totalEarnings: total,
      totalSales: filteredEarnings.length,
      avgOrder:
        filteredEarnings.length > 0 ? total / filteredEarnings.length / 100 : 0,
    };
  }, [filteredEarnings]);

  useEffect(() => {
    setTopAssetsVisibleCount(TOP_ASSETS_PAGE_SIZE);
  }, [topAssets]);

  useEffect(() => {
    setRoyaltiesVisibleCount(ROYALTIES_PAGE_SIZE);
  }, [royalties]);

  useEffect(() => {
    setTransactionsVisibleCount(TRANSACTIONS_PAGE_SIZE);
  }, [filteredEarnings]);

  const processChartData = (transactions: any[]) => {
    const dailyData = new Map();

    transactions.forEach((sale) => {
      const date = new Date(sale.purchased_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      if (dailyData.has(date)) {
        const existing = dailyData.get(date);
        dailyData.set(date, {
          date,
          earnings: existing.earnings + sale.purchase_price / 100,
          sales: existing.sales + 1,
        });
      } else {
        dailyData.set(date, {
          date,
          earnings: sale.purchase_price / 100,
          sales: 1,
        });
      }
    });

    const chartArray = Array.from(dailyData.values()).reverse();
    const labels = chartArray.map((d) => d.date);

    // Revenue Over Time — smooth line with gradient area fill
    setRevenueChartData({
      grid: { left: 44, right: 16, top: 16, bottom: 28 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(0,0,0,0.9)",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        textStyle: { color: "#fff", fontSize: 11 },
        valueFormatter: (v: number) => `$${Number(v).toFixed(2)}`,
      },
      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: false,
        axisLabel: { color: "#9ca3af", fontSize: 10 },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#9ca3af", fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
      },
      series: [
        {
          name: "Revenue",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          data: chartArray.map((d) => d.earnings),
          lineStyle: { color: "#10b981", width: 2 },
          itemStyle: { color: "#10b981", borderColor: "#fff", borderWidth: 1 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(16,185,129,0.35)" },
                { offset: 1, color: "rgba(16,185,129,0)" },
              ],
            },
          },
        },
      ],
      animationDuration: 900,
      animationEasing: "cubicOut",
    });

    // Sales Volume — bars with staggered entrance
    setSalesChartData({
      grid: { left: 36, right: 16, top: 16, bottom: 28 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(0,0,0,0.9)",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        textStyle: { color: "#fff", fontSize: 11 },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: "#9ca3af", fontSize: 10 },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: "#9ca3af", fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
      },
      series: [
        {
          name: "Sales",
          type: "bar",
          data: chartArray.map((d) => d.sales),
          barMaxWidth: 28,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#60a5fa" },
                { offset: 1, color: "#3b82f6" },
              ],
            },
          },
          animationDelay: (idx: number) => idx * 50,
        },
      ],
      animationDuration: 800,
      animationEasing: "elasticOut",
    });
  };

  const processTopAssets = (transactions: any[]) => {
    const assetMap = new Map();

    transactions.forEach((sale) => {
      const title = sale.asset_title;
      if (assetMap.has(title)) {
        const existing = assetMap.get(title);
        assetMap.set(title, {
          name: title,
          sales: existing.sales + 1,
          revenue: existing.revenue + sale.purchase_price / 100,
        });
      } else {
        assetMap.set(title, {
          name: title,
          sales: 1,
          revenue: sale.purchase_price / 100,
        });
      }
    });

    const sorted = Array.from(assetMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    setTopAssets(sorted);

    const palette = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

    // Top Assets — animated donut
    setAssetChartData({
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(0,0,0,0.9)",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        textStyle: { color: "#fff", fontSize: 11 },
        formatter: (p: any) => `${p.name}: $${Number(p.value).toFixed(2)}`,
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        right: 4,
        top: "center",
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: "#9ca3af", fontSize: 10 },
      },
      series: [
        {
          name: "Top Assets",
          type: "pie",
          radius: ["45%", "72%"],
          center: ["32%", "50%"],
          avoidLabelOverlap: true,
          label: { show: false },
          itemStyle: { borderColor: "#0a0a0a", borderWidth: 2 },
          data: sorted.map((a, i) => ({
            name: a.name,
            value: a.revenue,
            itemStyle: { color: palette[i % palette.length] },
          })),
        },
      ],
      animationType: "scale",
      animationEasing: "cubicOut",
      animationDuration: 800,
    });
  };

  const calculateGrowthRate = (transactions: any[]) => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const lastMonthEarnings = transactions
      .filter((t) => {
        const d = new Date(t.purchased_at);
        return d >= lastMonth && d < now;
      })
      .reduce((sum, t) => sum + t.purchase_price, 0);

    const prevMonthEarnings = transactions
      .filter((t) => {
        const d = new Date(t.purchased_at);
        return d >= twoMonthsAgo && d < lastMonth;
      })
      .reduce((sum, t) => sum + t.purchase_price, 0);

    if (prevMonthEarnings === 0) {
      setGrowthRate(lastMonthEarnings > 0 ? 100 : 0);
    } else {
      const growth =
        ((lastMonthEarnings - prevMonthEarnings) / prevMonthEarnings) * 100;
      setGrowthRate(growth);
    }
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      dateRange: "all",
      minAmount: "",
      maxAmount: "",
      buyer: "",
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.dateRange !== "all" ||
    filters.minAmount ||
    filters.maxAmount ||
    filters.buyer;

  const echartStyle = { height: "100%", width: "100%" };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>

          {/* Stats Skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white/5 border border-white/10 p-4">
                <Skeleton className="h-5 w-5 mb-2" />
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>

          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 bg-white/5 border border-white/10 p-4">
              <Skeleton className="h-4 w-32 mb-3" />
              <Skeleton className="h-48 w-full" />
            </div>
            <div className="bg-white/5 border border-white/10 p-4">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>

          {/* Table Skeleton */}
          <div className="bg-white/5 border border-white/10 p-4">
            <Skeleton className="h-4 w-32 mb-3" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const avgOrderValue =
    stats.totalSales > 0 ? stats.totalEarnings / stats.totalSales / 100 : 0;

  return (
    <div className="min-h-screen bg-black text-white p-2 md:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-3 md:space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-3xl font-light bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              Earnings
            </h1>
            <p className="text-gray-400 text-xs mt-1">
              Sales performance overview
            </p>
          </div>

          <div className="flex items-center gap-2">
            {stripeDashboardUrl && (
              <a
                href={stripeDashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 bg-white text-black hover:bg-gray-200 text-[10px] md:text-xs transition-colors"
              >
                <CurrencyDollar className="w-3.5 h-3.5" weight="bold" />
                Stripe
                <ArrowSquareOut className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white/5 border border-white/10 p-3 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <CurrencyDollar
                className="w-5 h-5 text-green-500"
                weight="bold"
              />
              <div
                className={`flex items-center gap-0.5 text-xs ${
                  growthRate >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {growthRate >= 0 ? (
                  <ArrowUp className="w-3 h-3" />
                ) : (
                  <ArrowDown className="w-3 h-3" />
                )}
                {Math.abs(growthRate).toFixed(1)}%
              </div>
            </div>
            <div className="text-[10px] md:text-xs text-gray-400">Total Earnings</div>
            <div className="text-lg md:text-2xl font-light mt-1">
              ${(stats.totalEarnings / 100).toFixed(2)}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 md:p-4">
            <Package className="w-5 h-5 text-blue-500 mb-2" weight="bold" />
            <div className="text-[10px] md:text-xs text-gray-400">Total Sales</div>
            <div className="text-lg md:text-2xl font-light mt-1">{stats.totalSales}</div>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 md:p-4">
            <TrendUp className="w-5 h-5 text-purple-500 mb-2" weight="bold" />
            <div className="text-[10px] md:text-xs text-gray-400">This Month</div>
            <div className="text-lg md:text-2xl font-light mt-1">
              ${(stats.thisMonth / 100).toFixed(2)}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 md:p-4">
            <Calendar className="w-5 h-5 text-orange-500 mb-2" weight="bold" />
            <div className="text-[10px] md:text-xs text-gray-400">Avg Order</div>
            <div className="text-lg md:text-2xl font-light mt-1">
              ${avgOrderValue.toFixed(2)}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <Coins className="w-5 h-5 text-amber-400" weight="bold" />
              {stats.royaltyPending > 0 && (
                <span className="text-[10px] text-amber-400">
                  ${(stats.royaltyPending / 100).toFixed(2)} pending
                </span>
              )}
            </div>
            <div className="text-[10px] md:text-xs text-gray-400">
              Royalty Income
            </div>
            <div className="text-lg md:text-2xl font-light mt-1">
              ${(stats.totalRoyalties / 100).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-white/5 border border-white/10 p-3 md:p-4">
            <div className="mb-3">
              <h2 className="text-xs md:text-sm font-light">Revenue Over Time</h2>
            </div>
            <div className="h-36 md:h-48">
              {revenueChartData && (
                <ReactECharts
                  option={revenueChartData}
                  style={echartStyle}
                  notMerge
                  opts={{ renderer: "svg" }}
                />
              )}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 md:p-4">
            <div className="mb-3">
              <h2 className="text-xs md:text-sm font-light">Top Assets</h2>
            </div>
            <div className="h-36 md:h-48">
              {assetChartData && (
                <ReactECharts
                  option={assetChartData}
                  style={echartStyle}
                  notMerge
                  opts={{ renderer: "svg" }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Sales Bar Chart */}
        <div className="bg-white/5 border border-white/10 p-3 md:p-4">
          <div className="mb-3">
            <h2 className="text-xs md:text-sm font-light">Sales Volume</h2>
          </div>
          <div className="h-36 md:h-48">
            {salesChartData && (
              <ReactECharts
                option={salesChartData}
                style={echartStyle}
                notMerge
                opts={{ renderer: "svg" }}
              />
            )}
          </div>
        </div>

        {/* Top Performing Assets Table */}
        <div className="bg-white/5 border border-white/10">
          <div className="p-3 md:p-4 border-b border-white/10">
            <h2 className="text-xs md:text-sm font-light">Top Performing Assets</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10 bg-white/5">
                <tr className="text-left text-[10px] md:text-xs text-gray-400">
                  <th className="p-2 md:p-3">Asset</th>
                  <th className="p-2 md:p-3">Sales</th>
                  <th className="p-2 md:p-3">Revenue</th>
                  <th className="p-2 md:p-3">Avg</th>
                </tr>
              </thead>
              <tbody>
                {topAssets.slice(0, topAssetsVisibleCount).map((asset, index) => (
                  <tr
                    key={index}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="p-2 md:p-3 text-[10px] md:text-xs">{asset.name}</td>
                    <td className="p-2 md:p-3 text-[10px] md:text-xs">{asset.sales}</td>
                    <td className="p-2 md:p-3 text-[10px] md:text-xs">${asset.revenue.toFixed(2)}</td>
                    <td className="p-2 md:p-3 text-[10px] md:text-xs">
                      ${(asset.revenue / asset.sales).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {topAssetsVisibleCount < topAssets.length && (
            <div className="p-3 md:p-4 border-t border-white/10 flex justify-center">
              <button
                onClick={() =>
                  setTopAssetsVisibleCount((count) => count + TOP_ASSETS_PAGE_SIZE)
                }
                className="px-4 py-2 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-green-500/40 hover:bg-white/5 transition-all"
              >
                Load more
              </button>
            </div>
          )}
        </div>

        {/* Royalty Earnings */}
        <div className="bg-white/5 border border-white/10">
          <div className="p-3 md:p-4 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" weight="bold" />
              <h2 className="text-xs md:text-sm font-light">Royalty Earnings</h2>
            </div>
            <span className="text-[9px] md:text-xs text-gray-500 text-right">
              {royaltyPercent}% of every downstream resale of your Commercial
              assets
            </span>
          </div>

          {royalties.length === 0 ? (
            <div className="p-6 md:p-8 text-center">
              <Coins
                className="w-10 h-10 text-gray-600 mx-auto mb-2"
                weight="duotone"
              />
              <p className="text-gray-400 text-sm">No royalty earnings yet</p>
              <p className="text-xs text-gray-600 mt-1">
                You earn {royaltyPercent}% when someone resells an asset you
                originally created
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-white/10 bg-white/5">
                  <tr className="text-left text-[10px] md:text-xs text-gray-400">
                    <th className="p-2 md:p-3">Date</th>
                    <th className="p-2 md:p-3">Asset</th>
                    <th className="p-2 md:p-3">Resold By</th>
                    <th className="p-2 md:p-3">Sale Price</th>
                    <th className="p-2 md:p-3">Your Royalty</th>
                    <th className="p-2 md:p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {royalties.slice(0, royaltiesVisibleCount).map((r, index) => (
                    <tr
                      key={r.id}
                      className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                        index % 2 === 0 ? "bg-black/20" : ""
                      }`}
                    >
                      <td className="p-2 md:p-3 text-[10px] md:text-xs">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="p-2 md:p-3 text-[10px] md:text-xs">
                        {r.asset_title}
                      </td>
                      <td className="p-2 md:p-3 text-[10px] md:text-xs text-gray-400">
                        {r.seller_name}
                      </td>
                      <td className="p-2 md:p-3 text-[10px] md:text-xs text-gray-400">
                        ${(r.sale_price_cents / 100).toFixed(2)}
                      </td>
                      <td className="p-2 md:p-3 text-[10px] md:text-xs text-amber-400">
                        ${(r.royalty_cents / 100).toFixed(2)}
                      </td>
                      <td className="p-2 md:p-3">
                        {r.status === "paid" ? (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] md:text-xs rounded border border-green-500/30">
                            Paid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] md:text-xs rounded border border-amber-500/30">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {royaltiesVisibleCount < royalties.length && (
              <div className="p-3 md:p-4 border-t border-white/10 flex justify-center">
                <button
                  onClick={() =>
                    setRoyaltiesVisibleCount(
                      (count) => count + ROYALTIES_PAGE_SIZE
                    )
                  }
                  className="px-4 py-2 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-amber-500/40 hover:bg-white/5 transition-all"
                >
                  Load more
                </button>
              </div>
            )}
            </>
          )}
        </div>

        {/* Transaction History */}
        <div className="bg-white/5 border border-white/10">
          <div className="p-3 md:p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xs md:text-sm font-light">Recent Transactions</h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-2 py-1 border border-white/10 text-xs transition-colors ${
                showFilters || hasActiveFilters
                  ? "bg-white/10"
                  : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <Funnel className="w-3.5 h-3.5" />
              Filter
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
              )}
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="p-3 md:p-4 border-b border-white/10 bg-white/5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
                {/* Search */}
                <div className="relative">
                  <MagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search asset or buyer..."
                    value={filters.search}
                    onChange={(e) =>
                      setFilters({ ...filters, search: e.target.value })
                    }
                    className="w-full bg-black/50 border border-white/10 text-[10px] md:text-xs px-8 py-1.5 md:py-2 focus:outline-none focus:border-white/20"
                  />
                </div>

                {/* Date Range */}
                <select
                  value={filters.dateRange}
                  onChange={(e) =>
                    setFilters({ ...filters, dateRange: e.target.value })
                  }
                  className="w-full bg-black/50 border border-white/10 text-[10px] md:text-xs px-2 md:px-3 py-1.5 md:py-2 focus:outline-none focus:border-white/20"
                >
                  <option value="all">All Time</option>
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                </select>

                {/* Min Amount */}
                <input
                  type="number"
                  placeholder="Min Amount ($)"
                  value={filters.minAmount}
                  onChange={(e) =>
                    setFilters({ ...filters, minAmount: e.target.value })
                  }
                  className="w-full bg-black/50 border border-white/10 text-[10px] md:text-xs px-2 md:px-3 py-1.5 md:py-2 focus:outline-none focus:border-white/20"
                />

                {/* Max Amount */}
                <input
                  type="number"
                  placeholder="Max Amount ($)"
                  value={filters.maxAmount}
                  onChange={(e) =>
                    setFilters({ ...filters, maxAmount: e.target.value })
                  }
                  className="w-full bg-black/50 border border-white/10 text-[10px] md:text-xs px-2 md:px-3 py-1.5 md:py-2 focus:outline-none focus:border-white/20"
                />
              </div>

              {/* Filter Actions */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  Showing {filteredEarnings.length} of {earnings.length}{" "}
                  transactions
                  {hasActiveFilters && (
                    <span className="ml-2">
                      (${filteredStats.totalEarnings / 100} total)
                    </span>
                  )}
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}

          {filteredEarnings.length === 0 ? (
            <div className="p-6 md:p-8 text-center">
              <Package
                className="w-10 h-10 text-gray-600 mx-auto mb-2"
                weight="duotone"
              />
              <p className="text-gray-400 text-sm">
                {earnings.length === 0
                  ? "No sales yet"
                  : "No transactions match your filters"}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {earnings.length === 0
                  ? "Start selling to see transactions"
                  : "Try adjusting your filters"}
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-white/10 bg-white/5">
                  <tr className="text-left text-[10px] md:text-xs text-gray-400">
                    <th className="p-2 md:p-3">Date</th>
                    <th className="p-2 md:p-3">Asset</th>
                    <th className="p-2 md:p-3">Buyer</th>
                    <th className="p-2 md:p-3">Amount</th>
                    <th className="p-2 md:p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEarnings
                    .slice(0, transactionsVisibleCount)
                    .map((sale, index) => (
                    <tr
                      key={sale.id}
                      className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                        index % 2 === 0 ? "bg-black/20" : ""
                      }`}
                    >
                      <td className="p-2 md:p-3 text-[10px] md:text-xs">
                        {new Date(sale.purchased_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </td>
                      <td className="p-2 md:p-3 text-[10px] md:text-xs">{sale.asset_title}</td>
                      <td className="p-2 md:p-3 text-[10px] md:text-xs text-gray-400">
                        {sale.buyer_name || sale.buyer_email}
                      </td>
                      <td className="p-2 md:p-3 text-[10px] md:text-xs">
                        ${(sale.purchase_price / 100).toFixed(2)}
                      </td>
                      <td className="p-2 md:p-3">
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] md:text-xs rounded border border-green-500/30">
                          Paid
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactionsVisibleCount < filteredEarnings.length && (
              <div className="p-3 md:p-4 border-t border-white/10 flex justify-center">
                <button
                  onClick={() =>
                    setTransactionsVisibleCount(
                      (count) => count + TRANSACTIONS_PAGE_SIZE
                    )
                  }
                  className="px-4 py-2 border border-white/10 text-xs text-gray-300 hover:text-white hover:border-green-500/40 hover:bg-white/5 transition-all"
                >
                  Load more
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
