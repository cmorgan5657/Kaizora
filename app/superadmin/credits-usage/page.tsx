"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminPagination from "@/app/components/AdminPagination";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  ToolboxComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  Lightning,
  MagnifyingGlass,
  FunnelSimple,
  ArrowDown,
  ArrowUp,
  ArrowsClockwise,
  Download,
  User,
  ImageSquare,
  VideoCamera,
  MusicNote,
  FileText,
  Waves,
  TrendUp,
  TrendDown,
  Calendar,
  ChartLine,
} from "phosphor-react";

// Register ECharts components
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  ToolboxComponent,
  CanvasRenderer,
]);

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

type UserProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type ActionCost = {
  id: string;
  action: string;
  credits: number;
  note: string;
  icon: string;
  sort_order: number;
};

const PAGE_SIZE = 15;

const ACTION_COLORS: Record<string, string> = {
  decision_layer_image: "#ef4444",
  decision_layer_video: "#f97316",
  decision_layer_text: "#eab308",
  decision_layer_audio: "#22c55e",
  remix_image: "#3b82f6",
  remix_video: "#8b5cf6",
  remix_video_5s: "#8b5cf6",
  remix_video_10s: "#a855f7",
  remix_audio: "#ec4899",
  purchase: "#10b981",
};

const ACTION_LABELS: Record<string, string> = {
  decision_layer_image: "DL Image",
  decision_layer_video: "DL Video",
  decision_layer_text: "DL Text",
  decision_layer_audio: "DL Audio",
  remix_image: "Remix Image",
  remix_video: "Remix Video",
  remix_video_5s: "Remix Video 5s",
  remix_video_10s: "Remix Video 10s",
  remix_audio: "Remix Audio",
};

function getActionIcon(action: string | null) {
  switch (action) {
    case "decision_layer_image":
    case "remix_image":
      return ImageSquare;
    case "decision_layer_video":
    case "remix_video":
    case "remix_video_5s":
    case "remix_video_10s":
      return VideoCamera;
    case "decision_layer_audio":
    case "remix_audio":
      return MusicNote;
    case "decision_layer_text":
      return FileText;
    default:
      return Lightning;
  }
}

export default function CreditsUsagePage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserProfile>>({});
  const [actionCosts, setActionCosts] = useState<ActionCost[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortNewest, setSortNewest] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Date range for charts
  const [chartRange, setChartRange] = useState<"7d" | "30d" | "90d" | "all">(
    "30d",
  );

  useEffect(() => {
    loadData();

    // Realtime: credit transactions
    const txChannel = supabase
      .channel("admin-credit-tx-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "credit_transactions" },
        (payload) => {
          const newTx = payload.new as CreditTransaction;
          setTransactions((prev) => [newTx, ...prev]);
          // Fetch user profile if missing
          if (!usersMap[newTx.user_id]) {
            supabase
              .from("profiles")
              .select("id, display_name, avatar_url")
              .eq("id", newTx.user_id)
              .single()
              .then(({ data }) => {
                if (data) {
                  setUsersMap((prev) => ({ ...prev, [data.id]: data }));
                }
              });
          }
        },
      )
      .subscribe();

    // Realtime: action costs changes
    const costsChannel = supabase
      .channel("admin-action-costs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_action_costs" },
        () => fetchActionCosts(),
      )
      .subscribe();

    return () => {
      txChannel.unsubscribe();
      costsChannel.unsubscribe();
    };
  }, []);

  async function fetchActionCosts() {
    const { data } = await supabase
      .from("credit_action_costs")
      .select("*")
      .order("sort_order", { ascending: true });
    if (data) setActionCosts(data);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [txResult, costsResult] = await Promise.all([
        supabase
          .from("credit_transactions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("credit_action_costs")
          .select("*")
          .order("sort_order", { ascending: true }),
      ]);

      const txData = txResult.data || [];
      setTransactions(txData);
      if (costsResult.data) setActionCosts(costsResult.data);

      // Fetch user profiles
      const allUserIds = new Set<string>();
      txData.forEach((t) => allUserIds.add(t.user_id));

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
      console.error("Error loading credits usage:", error);
    } finally {
      setLoading(false);
    }
  }

  // ── Computed data ──

  const deductions = useMemo(
    () => transactions.filter((t) => t.type === "deduction"),
    [transactions],
  );
  const purchases = useMemo(
    () => transactions.filter((t) => t.type === "purchase"),
    [transactions],
  );

  // Stats
  const totalCreditsSpent = useMemo(
    () => deductions.reduce((s, t) => s + Math.abs(t.amount), 0),
    [deductions],
  );
  const totalCreditsPurchased = useMemo(
    () => purchases.reduce((s, t) => s + t.amount, 0),
    [purchases],
  );
  const totalDeductions = deductions.length;
  const uniqueUsers = useMemo(
    () => new Set(deductions.map((t) => t.user_id)).size,
    [deductions],
  );

  // Per-action breakdown
  const actionBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    deductions.forEach((t) => {
      const key = t.action || "unknown";
      if (!map[key]) map[key] = { count: 0, total: 0 };
      map[key].count += 1;
      map[key].total += Math.abs(t.amount);
    });
    return map;
  }, [deductions]);

  // Chart date filtering
  const chartCutoff = useMemo(() => {
    const now = new Date();
    if (chartRange === "7d")
      return new Date(now.getTime() - 7 * 86400000).toISOString();
    if (chartRange === "30d")
      return new Date(now.getTime() - 30 * 86400000).toISOString();
    if (chartRange === "90d")
      return new Date(now.getTime() - 90 * 86400000).toISOString();
    return "2000-01-01T00:00:00Z";
  }, [chartRange]);

  const chartDeductions = useMemo(
    () => deductions.filter((t) => t.created_at >= chartCutoff),
    [deductions, chartCutoff],
  );

  // ── Chart options ──

  // 1. Daily usage trend (line chart)
  const dailyTrendOption = useMemo(() => {
    const dailyMap: Record<string, Record<string, number>> = {};
    chartDeductions.forEach((t) => {
      const day = t.created_at.slice(0, 10);
      const action = t.action || "unknown";
      if (!dailyMap[day]) dailyMap[day] = {};
      dailyMap[day][action] = (dailyMap[day][action] || 0) + Math.abs(t.amount);
    });

    const days = Object.keys(dailyMap).sort();
    const actions = Object.keys(ACTION_LABELS);

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(0,0,0,0.85)",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#fff", fontSize: 11 },
      },
      legend: {
        data: actions.map((a) => ACTION_LABELS[a]),
        textStyle: { color: "#666", fontSize: 10 },
        bottom: 0,
        type: "scroll",
      },
      grid: { left: 40, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: "category",
        data: days,
        axisLabel: {
          color: "#555",
          fontSize: 9,
          formatter: (v: string) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          },
        },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#555", fontSize: 9 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
      },
      series: actions.map((action) => ({
        name: ACTION_LABELS[action],
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.08 },
        itemStyle: { color: ACTION_COLORS[action] },
        data: days.map((day) => dailyMap[day]?.[action] || 0),
        stack: "Total",
      })),
    };
  }, [chartDeductions]);

  // 2. Action distribution (pie chart)
  const pieOption = useMemo(() => {
    const data = Object.entries(actionBreakdown)
      .filter(([key]) => key !== "unknown")
      .map(([key, val]) => ({
        name: ACTION_LABELS[key] || key,
        value: val.total,
        itemStyle: { color: ACTION_COLORS[key] || "#666" },
      }))
      .sort((a, b) => b.value - a.value);

    return {
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(0,0,0,0.85)",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#fff", fontSize: 11 },
        formatter: "{b}: {c} credits ({d}%)",
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "72%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderColor: "#000", borderWidth: 2 },
          label: {
            show: true,
            color: "#999",
            fontSize: 10,
            formatter: "{b}\n{d}%",
          },
          labelLine: { lineStyle: { color: "rgba(255,255,255,0.15)" } },
          emphasis: {
            label: { show: true, fontSize: 12, fontWeight: "bold" },
          },
          data,
        },
      ],
    };
  }, [actionBreakdown]);

  // 3. Top users bar chart
  const topUsersOption = useMemo(() => {
    const userSpend: Record<string, number> = {};
    chartDeductions.forEach((t) => {
      userSpend[t.user_id] = (userSpend[t.user_id] || 0) + Math.abs(t.amount);
    });

    const sorted = Object.entries(userSpend)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    const names = sorted.map(
      ([uid]) =>
        usersMap[uid]?.display_name || uid.slice(0, 8) + "...",
    );
    const values = sorted.map(([, v]) => v);

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(0,0,0,0.85)",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#fff", fontSize: 11 },
      },
      grid: { left: 100, right: 20, top: 10, bottom: 20 },
      xAxis: {
        type: "value",
        axisLabel: { color: "#555", fontSize: 9 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
      },
      yAxis: {
        type: "category",
        data: names.reverse(),
        axisLabel: {
          color: "#999",
          fontSize: 9,
          width: 80,
          overflow: "truncate",
        },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
      },
      series: [
        {
          type: "bar",
          data: values.reverse(),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: "#ef4444" },
              { offset: 1, color: "#f97316" },
            ]),
            borderRadius: [0, 3, 3, 0],
          },
          barWidth: 16,
        },
      ],
    };
  }, [chartDeductions, usersMap]);

  // 4. Hourly heatmap (bar chart by hour)
  const hourlyOption = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourCounts = new Array(24).fill(0);
    chartDeductions.forEach((t) => {
      const h = new Date(t.created_at).getHours();
      hourCounts[h] += Math.abs(t.amount);
    });

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(0,0,0,0.85)",
        borderColor: "rgba(255,255,255,0.1)",
        textStyle: { color: "#fff", fontSize: 11 },
        formatter: (params: any) => {
          const p = params[0];
          return `${p.name}:00 — ${p.value} credits`;
        },
      },
      grid: { left: 40, right: 20, top: 10, bottom: 30 },
      xAxis: {
        type: "category",
        data: hours.map((h) => String(h).padStart(2, "0")),
        axisLabel: { color: "#555", fontSize: 9 },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#555", fontSize: 9 },
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
      },
      series: [
        {
          type: "bar",
          data: hourCounts,
          itemStyle: {
            color: (params: any) => {
              const max = Math.max(...hourCounts, 1);
              const ratio = params.value / max;
              return `rgba(239, 68, 68, ${0.2 + ratio * 0.8})`;
            },
            borderRadius: [3, 3, 0, 0],
          },
          barWidth: "60%",
        },
      ],
    };
  }, [chartDeductions]);

  // ── Filtered table data ──

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    if (typeFilter !== "all") {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }

    if (actionFilter !== "all") {
      filtered = filtered.filter((t) => t.action === actionFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.user_id.toLowerCase().includes(term) ||
          t.description?.toLowerCase().includes(term) ||
          t.action?.toLowerCase().includes(term) ||
          usersMap[t.user_id]?.display_name?.toLowerCase().includes(term),
      );
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

    return filtered;
  }, [
    transactions,
    typeFilter,
    actionFilter,
    searchTerm,
    dateFrom,
    dateTo,
    sortNewest,
    usersMap,
  ]);

  const totalPages = Math.ceil(filteredTransactions.length / PAGE_SIZE);
  const paginatedData = filteredTransactions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, actionFilter, searchTerm, dateFrom, dateTo, sortNewest]);

  function getUserName(userId: string) {
    return usersMap[userId]?.display_name || userId.slice(0, 8) + "...";
  }

  function exportToCSV() {
    const headers = [
      "ID",
      "User",
      "Type",
      "Amount",
      "Action",
      "Description",
      "Date",
    ];
    const rows = filteredTransactions.map((t) => [
      t.id,
      getUserName(t.user_id),
      t.type,
      t.amount,
      t.action || "",
      t.description || "",
      t.created_at,
    ]);

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
    a.download = `credits_usage_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-light mb-6">Credits Usage</h1>
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="border border-white/10 bg-white/5 p-4 animate-pulse"
            >
              <div className="h-3 w-20 bg-white/10 rounded mb-3" />
              <div className="h-6 w-16 bg-white/10 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="border border-white/10 bg-white/5 p-4 h-64 animate-pulse"
            />
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
          <h1 className="text-2xl font-light mb-1">Credits Usage</h1>
          <p className="text-sm text-gray-400">
            Track every credit deduction across the platform in realtime
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendDown size={14} className="text-red-400" />
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              Credits Spent
            </p>
          </div>
          <p className="text-2xl font-bold text-red-400">
            {totalCreditsSpent.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">
            across {totalDeductions} deductions
          </p>
        </div>
        <div className="border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendUp size={14} className="text-green-400" />
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              Credits Purchased
            </p>
          </div>
          <p className="text-2xl font-bold text-green-400">
            {totalCreditsPurchased.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">
            {purchases.length} purchases
          </p>
        </div>
        <div className="border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightning size={14} className="text-yellow-400" />
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              Net Balance
            </p>
          </div>
          <p className="text-2xl font-bold text-white">
            {(totalCreditsPurchased - totalCreditsSpent).toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">
            platform-wide remaining
          </p>
        </div>
        <div className="border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <User size={14} className="text-blue-400" />
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              Active Users
            </p>
          </div>
          <p className="text-2xl font-bold text-blue-400">{uniqueUsers}</p>
          <p className="text-[10px] text-gray-600 mt-1">
            users with deductions
          </p>
        </div>
      </div>

      {/* Action Breakdown Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        {actionCosts.map((ac) => {
          const data = actionBreakdown[ac.action];
          const Icon = getActionIcon(ac.action);
          return (
            <div
              key={ac.id}
              className="border border-white/10 bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-all"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon
                  size={12}
                  weight="duotone"
                  style={{ color: ACTION_COLORS[ac.action] || "#666" }}
                />
                <p className="text-[9px] text-gray-500 uppercase tracking-wider truncate">
                  {ACTION_LABELS[ac.action] || ac.action}
                </p>
              </div>
              <p className="text-lg font-bold" style={{ color: ACTION_COLORS[ac.action] || "#fff" }}>
                {data?.count || 0}
              </p>
              <p className="text-[9px] text-gray-600">
                {data?.total || 0} credits
              </p>
            </div>
          );
        })}
      </div>

      {/* Chart Range Selector */}
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={14} className="text-gray-500" />
        <span className="text-xs text-gray-500">Chart range:</span>
        {(["7d", "30d", "90d", "all"] as const).map((range) => (
          <button
            key={range}
            onClick={() => setChartRange(range)}
            className={`px-3 py-1 text-xs transition-all cursor-pointer ${
              chartRange === range
                ? "bg-red-500/20 border border-red-500/30 text-red-400"
                : "bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10"
            }`}
          >
            {range === "all" ? "All Time" : range}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Daily Usage Trend */}
        <div className="border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <ChartLine size={16} className="text-red-400" />
            <h3 className="text-sm font-medium">Daily Usage Trend</h3>
          </div>
          <ReactEChartsCore
            echarts={echarts}
            option={dailyTrendOption}
            style={{ height: 280 }}
            opts={{ renderer: "canvas" }}
            theme="dark"
          />
        </div>

        {/* Action Distribution */}
        <div className="border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Waves size={16} className="text-red-400" />
            <h3 className="text-sm font-medium">Credits by Action Type</h3>
          </div>
          <ReactEChartsCore
            echarts={echarts}
            option={pieOption}
            style={{ height: 280 }}
            opts={{ renderer: "canvas" }}
            theme="dark"
          />
        </div>

        {/* Top Users */}
        <div className="border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-red-400" />
            <h3 className="text-sm font-medium">Top Users by Spend</h3>
          </div>
          <ReactEChartsCore
            echarts={echarts}
            option={topUsersOption}
            style={{ height: 280 }}
            opts={{ renderer: "canvas" }}
            theme="dark"
          />
        </div>

        {/* Hourly Distribution */}
        <div className="border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={16} className="text-red-400" />
            <h3 className="text-sm font-medium">Usage by Hour of Day</h3>
          </div>
          <ReactEChartsCore
            echarts={echarts}
            option={hourlyOption}
            style={{ height: 280 }}
            opts={{ renderer: "canvas" }}
            theme="dark"
          />
        </div>
      </div>

      {/* Transaction Log Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Transaction Log</h2>
        <p className="text-xs text-gray-500">
          {filteredTransactions.length} total records
        </p>
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
            placeholder="Search by user, action, description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-white/20"
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 text-sm text-gray-300 focus:outline-none cursor-pointer"
        >
          <option value="all">All Types</option>
          <option value="deduction">Deductions</option>
          <option value="purchase">Purchases</option>
        </select>

        {/* Action filter */}
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 text-sm text-gray-300 focus:outline-none cursor-pointer"
        >
          <option value="all">All Actions</option>
          {actionCosts.map((ac) => (
            <option key={ac.id} value={ac.action}>
              {ac.note}
            </option>
          ))}
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

      {/* Expandable date filters */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-4 p-3 border border-white/10 bg-white/[0.02]">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">From</label>
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
              setActionFilter("all");
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
            <tr className="text-left text-gray-400">
              <th className="p-3">User</th>
              <th className="p-3">Type</th>
              <th className="p-3">Action</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Description</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">
                  No transactions found
                </td>
              </tr>
            ) : (
              paginatedData.map((tx) => {
                const Icon = getActionIcon(tx.action);
                return (
                  <tr
                    key={tx.id}
                    className="border-t border-white/10 hover:bg-white/5 transition-colors"
                  >
                    {/* User */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {usersMap[tx.user_id]?.avatar_url ? (
                          <img
                            src={usersMap[tx.user_id].avatar_url!}
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
                            {usersMap[tx.user_id]?.display_name || "—"}
                          </p>
                          <p className="text-[10px] text-gray-600 font-mono">
                            {tx.user_id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 text-xs ${
                          tx.type === "purchase"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="p-3">
                      {tx.action ? (
                        <div className="flex items-center gap-1.5">
                          <Icon
                            size={14}
                            weight="duotone"
                            style={{
                              color: ACTION_COLORS[tx.action] || "#666",
                            }}
                          />
                          <span
                            className="text-xs font-medium"
                            style={{
                              color: ACTION_COLORS[tx.action] || "#999",
                            }}
                          >
                            {ACTION_LABELS[tx.action] || tx.action}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="p-3">
                      <span
                        className={`text-sm font-semibold ${
                          tx.type === "purchase"
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {tx.type === "deduction" ? "-" : "+"}
                        {Math.abs(tx.amount).toLocaleString()}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="p-3 max-w-xs">
                      <p className="text-xs text-gray-400 truncate">
                        {tx.description || "—"}
                      </p>
                    </td>

                    {/* Date */}
                    <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(tx.created_at).toLocaleDateString()}{" "}
                      <span className="text-gray-700">
                        {new Date(tx.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <AdminPagination
        currentPage={currentPage}
        totalItems={filteredTransactions.length}
        totalPages={Math.max(1, totalPages)}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
        className="mt-4"
      />

      {/* Action Costs Reference */}
      <div className="mt-8 border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-sm font-medium mb-3 text-gray-300">
          Current Action Costs
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {actionCosts.map((ac) => (
            <div
              key={ac.id}
              className="flex items-center justify-between p-2 border border-white/5"
            >
              <span className="text-[10px] text-gray-400 truncate mr-2">
                {ac.note.replace("Decision Layer", "DL").replace("Remix", "RX")}
              </span>
              <span
                className="text-xs font-bold shrink-0"
                style={{ color: ACTION_COLORS[ac.action] || "#fff" }}
              >
                {ac.credits}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
