"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Users,
  CurrencyDollar,
  TrendUp,
  TrendDown,
  CheckCircle,
  Warning,
  ArrowRight,
  Image as ImageIcon,
  VideoCamera,
  MusicNote,
  FileText,
  Lightning,
  ArrowsClockwise,
  Brain,
  Storefront,
  ShoppingCart,
  X,
} from "phosphor-react";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DashboardStats {
  totalUsers: number;
  totalCreditsPurchased: number;
  totalCreditsSpent: number;
  creditRevenue: number;
  totalAssets: number;
  usersWithCredits: number;
  totalPublicAssets: number;
  totalSales: number;
}

interface KPICard {
  key: string;
  title: string;
  description: string;
  icon: any;
  format: "number" | "currency" | "percent";
  current: number;
  previous: number;
  change: number;
  breakdown?: { label: string; icon: any; current: number; previous: number; color: string }[];
}

export default function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);

  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalCreditsPurchased: 0,
    totalCreditsSpent: 0,
    creditRevenue: 0,
    totalAssets: 0,
    usersWithCredits: 0,
    totalPublicAssets: 0,
    totalSales: 0,
  });

  const [kpis, setKpis] = useState<KPICard[]>([]);
  const [revenueChartData, setRevenueChartData] = useState<any[]>([]);
  const [creditSpendByAction, setCreditSpendByAction] = useState<any[]>([]);

  const stripeConfigured = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    // ── Parallel data fetch ──
    const [
      { count: userCount },
      { data: creditsData },
      { data: purchaseTransactions },
      { data: creditPacks },
      { count: assetCount },
      { count: publicAssetCount },
      { count: salesCount },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).neq("role", "superadmin"),
      supabase.from("user_credits").select("balance, total_purchased, total_spent"),
      supabase.from("credit_transactions").select("amount, created_at, type, action").order("created_at", { ascending: false }).limit(2000),
      supabase.from("credit_packs").select("credits, price"),
      supabase.from("assets").select("*", { count: "exact", head: true }),
      supabase.from("assets").select("*", { count: "exact", head: true }).eq("is_public", true),
      supabase.from("purchased_assets").select("*", { count: "exact", head: true }),
    ]);

    const totalCreditsPurchased = creditsData?.reduce((s, c: any) => s + (c.total_purchased || 0), 0) || 0;
    const totalCreditsSpent = creditsData?.reduce((s, c: any) => s + (c.total_spent || 0), 0) || 0;
    const usersWithCredits = creditsData?.filter((c: any) => (c.balance || 0) > 0).length || 0;

    // Credit revenue from pack pricing
    const packPriceMap: Record<number, number> = {};
    (creditPacks || []).forEach((p: any) => { packPriceMap[p.credits] = p.price; });
    const creditRevenue = (purchaseTransactions || [])
      .filter((t: any) => t.type === "purchase")
      .reduce((s, tx: any) => s + (packPriceMap[tx.amount] || 0), 0);

    // Revenue chart (last 6 months)
    const monthlyRevenue: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyRevenue[d.toLocaleString("default", { month: "short" })] = 0;
    }
    (purchaseTransactions || [])
      .filter((t: any) => t.type === "purchase")
      .forEach((tx: any) => {
        const key = new Date(tx.created_at).toLocaleString("default", { month: "short" });
        if (monthlyRevenue[key] !== undefined) {
          monthlyRevenue[key] += packPriceMap[tx.amount] || 0;
        }
      });
    setRevenueChartData(Object.entries(monthlyRevenue).map(([month, revenue]) => ({ month, revenue })));

    // Credit spend by action type (for pie chart)
    const actionSpend: Record<string, number> = {};
    (purchaseTransactions || [])
      .filter((t: any) => t.type === "deduction" && t.action)
      .forEach((tx: any) => {
        actionSpend[tx.action] = (actionSpend[tx.action] || 0) + Math.abs(tx.amount);
      });
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
    setCreditSpendByAction(
      Object.entries(actionSpend)
        .map(([action, value]) => ({
          name: ACTION_LABELS[action] || action,
          value,
          color: ACTION_COLORS[action] || "#666",
        }))
        .sort((a, b) => b.value - a.value)
    );

    setStats({
      totalUsers: userCount || 0,
      totalCreditsPurchased,
      totalCreditsSpent,
      creditRevenue,
      totalAssets: assetCount || 0,
      usersWithCredits,
      totalPublicAssets: publicAssetCount || 0,
      totalSales: salesCount || 0,
    });

    // ── KPIs (30-day vs previous 30-day) ──
    await loadKPIs(purchaseTransactions || []);
    setLoading(false);
  }

  async function loadKPIs(allTransactions: any[]) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
    const currentStart = thirtyDaysAgo.toISOString();
    const previousStart = sixtyDaysAgo.toISOString();
    const previousEnd = thirtyDaysAgo.toISOString();

    const calcChange = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);
    const countByType = (a: any[] | null, t: string) => a?.filter((x) => x.content_type === t).length || 0;

    // Parallel KPI queries
    const [
      { count: currentSignups },
      { count: previousSignups },
      { count: currentCreators },
      { count: previousCreators },
      { data: currentAssets },
      { data: previousAssets },
      { data: currentActiveUsers },
      { data: previousActiveUsers },
      { count: currentDecisionSent },
      { count: previousDecisionSent },
      { data: currentPublicAssets },
      { data: previousPublicAssets },
      { data: currentPurchases },
      { data: previousPurchases },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", currentStart).neq("role", "superadmin"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", previousStart).lt("created_at", previousEnd).neq("role", "superadmin"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", currentStart).eq("community_role", "creator"),
      supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", previousStart).lt("created_at", previousEnd).eq("community_role", "creator"),
      supabase.from("assets").select("content_type").gte("created_at", currentStart),
      supabase.from("assets").select("content_type").gte("created_at", previousStart).lt("created_at", previousEnd),
      supabase.from("assets").select("owner_id").gte("created_at", currentStart),
      supabase.from("assets").select("owner_id").gte("created_at", previousStart).lt("created_at", previousEnd),
      supabase.from("assets").select("*", { count: "exact", head: true }).gte("last_agent_run_at", currentStart).not("last_agent_run_at", "is", null),
      supabase.from("assets").select("*", { count: "exact", head: true }).gte("last_agent_run_at", previousStart).lt("last_agent_run_at", previousEnd).not("last_agent_run_at", "is", null),
      supabase.from("assets").select("id").eq("is_public", true).gte("created_at", currentStart),
      supabase.from("assets").select("id").eq("is_public", true).gte("created_at", previousStart).lt("created_at", previousEnd),
      supabase.from("transactions").select("amount_cents").eq("status", "paid").gte("created_at", currentStart),
      supabase.from("transactions").select("amount_cents").eq("status", "paid").gte("created_at", previousStart).lt("created_at", previousEnd),
    ]);

    const uniqueOwners = (a: any[] | null) => new Set(a?.map((x) => x.owner_id) || []).size;
    const sumPurchases = (a: any[] | null) => (a?.reduce((s, p) => s + (p.amount_cents || 0), 0) || 0) / 100;

    // Credit transactions for 30d periods
    const currentCredPurchased = allTransactions.filter((t) => t.type === "purchase" && t.created_at >= currentStart).reduce((s, t) => s + t.amount, 0);
    const prevCredPurchased = allTransactions.filter((t) => t.type === "purchase" && t.created_at >= previousStart && t.created_at < previousEnd).reduce((s, t) => s + t.amount, 0);
    const currentCredSpent = allTransactions.filter((t) => t.type === "deduction" && t.created_at >= currentStart).reduce((s, t) => s + Math.abs(t.amount), 0);
    const prevCredSpent = allTransactions.filter((t) => t.type === "deduction" && t.created_at >= previousStart && t.created_at < previousEnd).reduce((s, t) => s + Math.abs(t.amount), 0);

    // Credit spend breakdown by action for current period
    const actionBreakdown = (period: "current" | "previous") => {
      const start = period === "current" ? currentStart : previousStart;
      const end = period === "current" ? undefined : previousEnd;
      const filtered = allTransactions.filter((t) => {
        if (t.type !== "deduction") return false;
        if (t.created_at < start) return false;
        if (end && t.created_at >= end) return false;
        return true;
      });
      const map: Record<string, number> = {};
      filtered.forEach((t) => {
        const key = t.action || "other";
        map[key] = (map[key] || 0) + Math.abs(t.amount);
      });
      return map;
    };

    const currentActionSpend = actionBreakdown("current");
    const prevActionSpend = actionBreakdown("previous");

    const ACTION_ICONS: Record<string, any> = {
      decision_layer_image: ImageIcon,
      decision_layer_video: VideoCamera,
      decision_layer_text: FileText,
      decision_layer_audio: MusicNote,
      remix_image: ImageIcon,
      remix_video: VideoCamera,
      remix_video_5s: VideoCamera,
      remix_video_10s: VideoCamera,
      remix_audio: MusicNote,
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
    };

    const allActions = [...new Set([...Object.keys(currentActionSpend), ...Object.keys(prevActionSpend)])].filter((a) => a !== "other");
    const creditsSpentBreakdown = allActions.map((a) => ({
      label: ACTION_LABELS[a] || a,
      icon: ACTION_ICONS[a] || Lightning,
      current: currentActionSpend[a] || 0,
      previous: prevActionSpend[a] || 0,
      color: ACTION_COLORS[a] || "#666",
    }));

    const contentTypeBreakdown = [
      { label: "Image", icon: ImageIcon, current: countByType(currentAssets, "image"), previous: countByType(previousAssets, "image"), color: "#3b82f6" },
      { label: "Video", icon: VideoCamera, current: countByType(currentAssets, "video"), previous: countByType(previousAssets, "video"), color: "#f97316" },
      { label: "Audio", icon: MusicNote, current: countByType(currentAssets, "audio"), previous: countByType(previousAssets, "audio"), color: "#22c55e" },
      { label: "Text", icon: FileText, current: countByType(currentAssets, "text") + countByType(currentAssets, "prompt"), previous: countByType(previousAssets, "text") + countByType(previousAssets, "prompt"), color: "#eab308" },
    ];

    const cSignups = currentSignups || 0;
    const pSignups = previousSignups || 0;
    const cCreators = currentCreators || 0;
    const pCreators = previousCreators || 0;
    const cActive = uniqueOwners(currentActiveUsers);
    const pActive = uniqueOwners(previousActiveUsers);
    const cDL = currentDecisionSent || 0;
    const pDL = previousDecisionSent || 0;
    const cPublished = currentPublicAssets?.length || 0;
    const pPublished = previousPublicAssets?.length || 0;
    const cGMV = sumPurchases(currentPurchases);
    const pGMV = sumPurchases(previousPurchases);

    setKpis([
      {
        key: "newSignups", title: "New Signups", description: "New user registrations (last 30 days vs previous 30 days).",
        icon: Users, format: "number", current: cSignups, previous: pSignups, change: calcChange(cSignups, pSignups),
      },
      {
        key: "creatorSignups", title: "Creator Signups", description: "Users who registered as individual creators.",
        icon: Users, format: "number", current: cCreators, previous: pCreators, change: calcChange(cCreators, pCreators),
      },
      {
        key: "activatedUsers", title: "Activated Users", description: "Users who uploaded at least one asset.",
        icon: CheckCircle, format: "number", current: cActive, previous: pActive, change: calcChange(cActive, pActive),
      },
      {
        key: "creditsPurchased", title: "Credits Purchased", description: "Total credits bought by users.",
        icon: Lightning, format: "number", current: currentCredPurchased, previous: prevCredPurchased, change: calcChange(currentCredPurchased, prevCredPurchased),
      },
      {
        key: "creditsSpent", title: "Credits Spent", description: "Total credits used across all actions.",
        icon: Lightning, format: "number", current: currentCredSpent, previous: prevCredSpent, change: calcChange(currentCredSpent, prevCredSpent),
        breakdown: creditsSpentBreakdown,
      },
      {
        key: "assetsUploaded", title: "Assets Uploaded", description: "Total assets uploaded by content type.",
        icon: Storefront, format: "number", current: currentAssets?.length || 0, previous: previousAssets?.length || 0,
        change: calcChange(currentAssets?.length || 0, previousAssets?.length || 0),
        breakdown: contentTypeBreakdown,
      },
      {
        key: "sentToDecisionLayer", title: "Decision Layer Runs", description: "Assets processed by the Decision Layer AI.",
        icon: Brain, format: "number", current: cDL, previous: pDL, change: calcChange(cDL, pDL),
      },
      {
        key: "assetsPublished", title: "Assets Published", description: "New public assets in the marketplace.",
        icon: Storefront, format: "number", current: cPublished, previous: pPublished, change: calcChange(cPublished, pPublished),
      },
      {
        key: "gmv", title: "GMV", description: "Gross Merchandise Value — total marketplace sales.",
        icon: CurrencyDollar, format: "currency", current: cGMV, previous: pGMV, change: calcChange(cGMV, pGMV),
      },
    ]);
  }

  // Chart data
  const userDistributionData = [
    { name: "With Credits", value: stats.usersWithCredits },
    { name: "Without Credits", value: Math.max(0, stats.totalUsers - stats.usersWithCredits) },
  ];
  const COLORS = ["#ef4444", "#6b7280"];

  const selectedKPIData = kpis.find((k) => k.key === selectedKPI);

  // ── Skeleton ──
  const StatCardSkeleton = () => (
    <div className="border border-white/10 p-6 bg-white/5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="w-6 h-6 bg-white/10 rounded" />
        <div className="w-16 h-3 bg-white/10 rounded" />
      </div>
      <div className="w-20 h-8 bg-white/10 rounded mb-2" />
      <div className="w-24 h-3 bg-white/10 rounded" />
    </div>
  );

  const ChartSkeleton = ({ height = 250 }: { height?: number }) => (
    <div className="border border-white/10 p-6 bg-white/5 animate-pulse">
      <div className="w-32 h-4 bg-white/10 rounded mb-4" />
      <div className="flex items-end gap-2 justify-center" style={{ height }}>
        {[40, 60, 45, 80, 55, 70].map((h, i) => (
          <div key={i} className="w-8 bg-white/10 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="relative">
        <div className="mb-6">
          <div className="w-48 h-7 bg-white/10 rounded mb-2 animate-pulse" />
          <div className="w-32 h-4 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <ChartSkeleton /><ChartSkeleton />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div key={i} className="border border-white/10 p-5 bg-white/5 animate-pulse h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light mb-1">Admin Control Center</h1>
          <p className="text-sm text-gray-500">KAIZORA Mission Control</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadData(); }}
          className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm cursor-pointer"
        >
          <ArrowsClockwise size={16} weight="bold" />
          Refresh
        </button>
      </div>

      {/* Stripe Status */}
      <div
        className={`border p-4 mb-6 flex items-start gap-3 ${
          stripeConfigured
            ? "border-green-500/30 bg-green-500/10"
            : "border-yellow-500/30 bg-yellow-500/10"
        }`}
      >
        {stripeConfigured ? (
          <>
            <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" weight="fill" />
            <div className="flex-1">
              <div className="text-sm font-light text-green-400 mb-1">Stripe Connected</div>
              <div className="text-xs text-gray-400">Payment system is configured and ready</div>
            </div>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30 transition-colors"
            >
              Open Stripe
            </a>
          </>
        ) : (
          <>
            <Warning size={20} className="text-yellow-400 shrink-0 mt-0.5" weight="fill" />
            <div className="flex-1">
              <div className="text-sm font-light text-yellow-400 mb-1">Stripe Not Configured</div>
              <div className="text-xs text-gray-400">Add your Stripe API keys to .env.local to enable payments</div>
            </div>
          </>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="border border-white/10 p-6 bg-white/5">
          <div className="flex items-center justify-between mb-3">
            <Users size={24} className="text-gray-500" weight="duotone" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Users</span>
          </div>
          <div className="text-3xl font-light mb-1">{stats.totalUsers.toLocaleString()}</div>
          <div className="text-xs text-gray-600">{stats.usersWithCredits} with active credits</div>
        </div>

        <div className="border border-red-500/30 p-6 bg-red-500/10">
          <div className="flex items-center justify-between mb-3">
            <CurrencyDollar size={24} className="text-red-400" weight="duotone" />
            <span className="text-xs text-red-400 uppercase tracking-wider">Revenue</span>
          </div>
          <div className="text-3xl font-light text-red-400 mb-1">
            ${stats.creditRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-gray-600">From credit purchases</div>
        </div>

        <div className="border border-green-500/30 p-6 bg-green-500/10">
          <div className="flex items-center justify-between mb-3">
            <Lightning size={24} className="text-green-400" weight="fill" />
            <span className="text-xs text-green-400 uppercase tracking-wider">Credits</span>
          </div>
          <div className="text-3xl font-light text-green-400 mb-1">
            {stats.totalCreditsPurchased.toLocaleString()}
          </div>
          <div className="text-xs text-gray-600">{stats.totalCreditsSpent.toLocaleString()} spent</div>
        </div>

        <div className="border border-white/10 p-6 bg-white/5">
          <div className="flex items-center justify-between mb-3">
            <Storefront size={24} className="text-gray-500" weight="duotone" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Assets</span>
          </div>
          <div className="text-3xl font-light mb-1">{stats.totalAssets.toLocaleString()}</div>
          <div className="text-xs text-gray-600">
            {stats.totalPublicAssets.toLocaleString()} public &middot; {stats.totalSales.toLocaleString()} sales
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Revenue Trend */}
        <div className="border border-white/10 p-6 bg-white/5">
          <h2 className="text-sm font-light mb-4 text-gray-400 uppercase tracking-wider">
            Credit Revenue (Last 6 Months)
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={revenueChartData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: "12px" }} />
              <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "4px", fontSize: "12px" }}
                formatter={(value: any) => (value !== undefined ? `$${value.toFixed(2)}` : "$0")}
              />
              <Area type="monotone" dataKey="revenue" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Credit Spend by Action (Pie) */}
        <div className="border border-white/10 p-6 bg-white/5">
          <h2 className="text-sm font-light mb-4 text-gray-400 uppercase tracking-wider">
            Credit Spend by Action
          </h2>
          {creditSpendByAction.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={creditSpendByAction}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  dataKey="value"
                >
                  {creditSpendByAction.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "4px", fontSize: "12px" }}
                  formatter={(value: any) => `${value} credits`}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-600 text-sm">
              No credit deductions yet
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <a href="/superadmin/users" className="border border-white/10 p-4 hover:bg-white/5 transition-colors text-center">
          <Users size={20} className="text-gray-500 mx-auto mb-2" weight="duotone" />
          <div className="text-sm font-light mb-1">View Users</div>
          <div className="text-xs text-gray-600">Manage users & credits</div>
        </a>
        <a href="/superadmin/transactions" className="border border-white/10 p-4 hover:bg-white/5 transition-colors text-center">
          <ArrowsClockwise size={20} className="text-gray-500 mx-auto mb-2" weight="duotone" />
          <div className="text-sm font-light mb-1">Transactions</div>
          <div className="text-xs text-gray-600">Credits & marketplace</div>
        </a>
        <a href="/superadmin/credits-usage" className="border border-white/10 p-4 hover:bg-white/5 transition-colors text-center">
          <Lightning size={20} className="text-gray-500 mx-auto mb-2" weight="duotone" />
          <div className="text-sm font-light mb-1">Credits Usage</div>
          <div className="text-xs text-gray-600">Detailed usage analytics</div>
        </a>
        <a href="/superadmin/marketplace" className="border border-white/10 p-4 hover:bg-white/5 transition-colors text-center">
          <ShoppingCart size={20} className="text-gray-500 mx-auto mb-2" weight="duotone" />
          <div className="text-sm font-light mb-1">Marketplace</div>
          <div className="text-xs text-gray-600">Browse all assets</div>
        </a>
      </div>

      {/* KPIs Section */}
      <div className="mb-4">
        <h2 className="text-lg font-light mb-1">Key Performance Indicators</h2>
        <p className="text-xs text-gray-500">
          Last 30 days vs previous 30 days. Cards with &quot;View details&quot; have a breakdown.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => {
          const isPositive = kpi.change >= 0;
          const displayValue =
            kpi.format === "currency"
              ? `$${kpi.current.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
              : kpi.current.toLocaleString();

          return (
            <div
              key={kpi.key}
              className="border border-white/10 p-5 bg-white/5 hover:bg-white/[0.07] transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 uppercase tracking-wider">{kpi.title}</span>
                <kpi.icon size={18} className="text-gray-600" weight="duotone" />
              </div>

              <div className="flex items-end justify-between mb-3">
                <div className="text-3xl font-light">{displayValue}</div>
                <div
                  className={`flex items-center gap-1 text-xs ${
                    isPositive ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {isPositive ? <TrendUp size={14} weight="bold" /> : <TrendDown size={14} weight="bold" />}
                  {isPositive ? "+" : ""}{kpi.change.toFixed(1)}%
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  prev:{" "}
                  {kpi.format === "currency"
                    ? `$${kpi.previous.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : kpi.previous.toLocaleString()}
                </span>
                {kpi.breakdown && kpi.breakdown.length > 0 ? (
                  <button
                    onClick={() => setSelectedKPI(kpi.key)}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    View details
                    <ArrowRight size={12} />
                  </button>
                ) : (
                  <span className="text-[10px] text-gray-700">30d period</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Panel Overlay */}
      {selectedKPI && selectedKPIData && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelectedKPI(null)} />
          <div className="fixed right-0 top-0 h-full w-[400px] bg-black border-l border-white/10 z-50 overflow-y-auto">
            <div className="sticky top-0 bg-black border-b border-white/10 p-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-light">{selectedKPIData.title}</h2>
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs">Last 30 Days</span>
                </div>
                <button onClick={() => setSelectedKPI(null)} className="p-1 hover:bg-white/10 transition-colors cursor-pointer">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              <p className="text-xs text-gray-500">{selectedKPIData.description}</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Current vs Previous */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-white/10 p-4 bg-white/5">
                  <div className="text-xs text-gray-500 mb-2">Current Period</div>
                  <div className="text-2xl font-light">
                    {selectedKPIData.format === "currency"
                      ? `$${selectedKPIData.current.toLocaleString()}`
                      : selectedKPIData.current.toLocaleString()}
                  </div>
                </div>
                <div className="border border-white/10 p-4 bg-white/5">
                  <div className="text-xs text-gray-500 mb-2">Previous Period</div>
                  <div className="text-2xl font-light">
                    {selectedKPIData.format === "currency"
                      ? `$${selectedKPIData.previous.toLocaleString()}`
                      : selectedKPIData.previous.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Change indicator */}
              <div
                className={`p-4 flex items-center gap-3 ${
                  selectedKPIData.change >= 0
                    ? "bg-green-500/10 border border-green-500/30"
                    : "bg-red-500/10 border border-red-500/30"
                }`}
              >
                {selectedKPIData.change >= 0 ? (
                  <TrendUp size={20} className="text-green-400" weight="bold" />
                ) : (
                  <TrendDown size={20} className="text-red-400" weight="bold" />
                )}
                <span className={`text-sm ${selectedKPIData.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {selectedKPIData.change >= 0 ? "+" : ""}{selectedKPIData.change.toFixed(1)}% vs previous period
                </span>
              </div>

              {/* Breakdown table */}
              {selectedKPIData.breakdown && selectedKPIData.breakdown.length > 0 && (
                <div>
                  <h3 className="text-sm font-light text-gray-400 mb-3">Breakdown</h3>
                  <div className="border border-white/10">
                    <div className="grid grid-cols-4 gap-2 p-3 border-b border-white/10 bg-white/5 text-xs text-gray-500">
                      <div>Type</div>
                      <div className="text-right">Current</div>
                      <div className="text-right">Previous</div>
                      <div className="text-right">Change</div>
                    </div>
                    {selectedKPIData.breakdown.map((item) => {
                      const Icon = item.icon;
                      const change = item.previous === 0 ? (item.current > 0 ? 100 : 0) : ((item.current - item.previous) / item.previous) * 100;
                      return (
                        <div key={item.label} className="grid grid-cols-4 gap-2 p-3 border-b border-white/10 last:border-b-0 text-sm">
                          <div className="flex items-center gap-2">
                            <Icon size={14} style={{ color: item.color }} />
                            <span className="text-xs">{item.label}</span>
                          </div>
                          <div className="text-right">{item.current.toLocaleString()}</div>
                          <div className="text-right text-gray-500">{item.previous.toLocaleString()}</div>
                          <div className={`text-right ${change >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
