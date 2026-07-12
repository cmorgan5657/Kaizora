"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  CurrencyDollar,
  Eye,
  Package,
  Circle,
  Bell,
  FileText,
  Image,
  VideoCamera,
  MusicNotes,
  Code,
  Lightbulb,
  File,
  ArrowUp,
  CaretRight,
} from "phosphor-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
interface EarningsData {
  date: string;
  amount: number;
}

interface ViewsData {
  date: string;
  views: number;
}

interface ContentDistribution {
  type: string;
  count: number;
}

interface TopContent {
  id: string;
  title: string;
  thumbnail: string | null;
  content_type: string | null;
  views: number;
  purchases: number;
  conversion: number;
  revenue: number;
}

interface Asset {
  id: string;
  title: string;
  content_type: string;
  created_at: string;
  is_public: boolean;
  price_cents: number;
  purchases_count: number;
  agent_mode: string;
}

interface AgentDecision {
  id: string;
  agent_type: string;
  created_at: string;
  review_action: string | null;
  explanation: string;
}

interface Notification {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
}

interface Transaction {
  id: string;
  amount_cents: number;
  platform_fee_cents: number;
  status: string;
  created_at: string;
  currency: string;
  asset_id: string;
}
export default function CreatorDashboardPage() {
  const TOP_CONTENT_PAGE_SIZE = 5;
  const ANALYTICS_TRANSACTIONS_PAGE_SIZE = 15;
  const REPORTS_PAGE_SIZE = 10;
  const PAYMENTS_TRANSACTIONS_PAGE_SIZE = 15;
  const NOTIFICATIONS_PAGE_SIZE = 10;
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalViews: 0,
    totalAssets: 0,
    pendingReviews: 0,
    totalTransactions: 0,
    totalPublic: 0,
    reports: 0,
    remixes: 0,
    notifications: 0,
  });
  const [earningsData, setEarningsData] = useState<EarningsData[]>([]);
  const [viewsData, setViewsData] = useState<ViewsData[]>([]);
  const [contentDistribution, setContentDistribution] = useState<
    ContentDistribution[]
  >([]);
  const [topContent, setTopContent] = useState<TopContent[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [agentDecisions, setAgentDecisions] = useState<AgentDecision[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payoutAccount, setPayoutAccount] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [editType, setEditType] = useState<"asset" | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [topContentVisibleCount, setTopContentVisibleCount] = useState(
    TOP_CONTENT_PAGE_SIZE
  );
  const [
    analyticsTransactionsVisibleCount,
    setAnalyticsTransactionsVisibleCount,
  ] = useState(ANALYTICS_TRANSACTIONS_PAGE_SIZE);
  const [reportsVisibleCount, setReportsVisibleCount] = useState(
    REPORTS_PAGE_SIZE
  );
  const [
    paymentsTransactionsVisibleCount,
    setPaymentsTransactionsVisibleCount,
  ] = useState(PAYMENTS_TRANSACTIONS_PAGE_SIZE);
  const [notificationsVisibleCount, setNotificationsVisibleCount] = useState(
    NOTIFICATIONS_PAGE_SIZE
  );
  useEffect(() => {
    async function fetchDashboardData() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const [
        { data: transactionsData },
        { data: events },
        { data: assetsData },

        { data: agentDecisionsData },
        { data: notificationsData },
        { data: reportsData },
        { data: remixData },
        { data: payoutData },
      ] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("creator_id", userData.user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("events")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("assets")
          .select("*, asset_metadata (*)")
          .eq("owner_id", userData.user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("agent_decisions")
          .select(
            `
    *,
    assets!inner (
      owner_id
    )
  `,
          )
          .eq("assets.owner_id", userData.user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("reports")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("remix_relations").select("*"),
        supabase
          .from("profiles")
          .select(
            "stripe_account_id, stripe_onboarding_status, stripe_connected_at",
          )
          .eq("id", userData.user.id)
          .single(),
      ]);

      const totalEarnings =
        transactionsData
          ?.filter((t) => t.status === "paid")
          .reduce(
            (sum, t) => sum + (t.amount_cents - t.platform_fee_cents),
            0,
          ) || 0;
      const totalViews = events?.filter((e) => e.type === "view").length || 0;
      const pendingReviews =
        agentDecisionsData?.filter((d) => !d.review_action).length || 0;
      const unreadNotifications =
        notificationsData?.filter((n) => !n.read).length || 0;

      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        return date.toISOString().split("T")[0];
      });

      const earningsByDate = last30Days.map((date) => ({
        date: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        amount:
          (transactionsData
            ?.filter(
              (t) => t.created_at.startsWith(date) && t.status === "paid",
            )
            .reduce(
              (sum, t) => sum + (t.amount_cents - t.platform_fee_cents),
              0,
            ) || 0) / 100,
      }));

      const viewsByDate = last30Days.map((date) => ({
        date: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        views:
          events?.filter(
            (e) => e.type === "view" && e.created_at.startsWith(date),
          ).length || 0,
      }));

      const distribution = assetsData?.reduce((acc, asset) => {
        acc[asset.content_type] = (acc[asset.content_type] || 0) + 1;
        return acc;
      }, {});

      const contentDist = Object.entries(distribution || {}).map(
        ([type, count]) => ({ type, count: count as number }),
      );

      const topPerforming =
        assetsData
          ?.map((asset: any) => {
            const views = asset.views_count || 0;
            const purchases = asset.purchases_count || 0;
            return {
              id: asset.id,
              title: asset.title || "Untitled",
              thumbnail: asset.thumbnail_path || asset.storage_path || null,
              content_type: asset.content_type || null,
              views,
              purchases,
              conversion: views > 0 ? (purchases / views) * 100 : 0,
              revenue:
                transactionsData
                  ?.filter((t) => t.asset_id === asset.id && t.status === "paid")
                  .reduce(
                    (sum, t) => sum + (t.amount_cents - t.platform_fee_cents),
                    0,
                  ) || 0,
            };
          })
          .filter((a: any) => a.revenue > 0 || a.views > 0 || a.purchases > 0)
          .sort((a: any, b: any) => b.revenue - a.revenue || b.views - a.views)
          .slice(0, 5) || [];

      setStats({
        totalEarnings: totalEarnings / 100,
        totalViews,
        totalAssets: assetsData?.length || 0,
        pendingReviews,
        totalTransactions:
          transactionsData?.filter((t) => t.status === "paid").length || 0,
        totalPublic: assetsData?.filter((a: any) => a.is_public).length || 0,
        reports: reportsData?.length || 0,
        remixes: remixData?.length || 0,
        notifications: unreadNotifications,
      });

      setEarningsData(earningsByDate);
      setViewsData(viewsByDate);
      setContentDistribution(contentDist);
      setTopContent(topPerforming);
      setAssets(assetsData || []);

      setAgentDecisions(agentDecisionsData || []);
      setNotifications(notificationsData || []);
      setTransactions(transactionsData || []);
      setPayoutAccount(payoutData || null);
      setReports(reportsData || []);
      setLoading(false);
    }

    fetchDashboardData();
  }, []);
  useEffect(() => {
    setTopContentVisibleCount(TOP_CONTENT_PAGE_SIZE);
  }, [topContent]);

  useEffect(() => {
    setAnalyticsTransactionsVisibleCount(ANALYTICS_TRANSACTIONS_PAGE_SIZE);
    setPaymentsTransactionsVisibleCount(PAYMENTS_TRANSACTIONS_PAGE_SIZE);
  }, [transactions]);

  useEffect(() => {
    setReportsVisibleCount(REPORTS_PAGE_SIZE);
  }, [reports]);

  useEffect(() => {
    setNotificationsVisibleCount(NOTIFICATIONS_PAGE_SIZE);
  }, [notifications]);
  //
  const openEditPanel = (type: "asset", item: any) => {
    setEditType(type);
    setEditingItem({ ...item });
    setEditPanelOpen(true);
  };

  const closeEditPanel = () => {
    setEditPanelOpen(false);
    setEditType(null);
    setEditingItem(null);
    setSaving(false);
  };

  const handleSave = async () => {
    if (!editingItem || !editType) return;

    setSaving(true);
    try {
      if (editType === "asset") {
        const { error } = await supabase
          .from("assets")
          .update({
            title: editingItem.title,
            description: editingItem.description,
            content_type: editingItem.content_type,
            price_cents: editingItem.price_cents,
            is_public: editingItem.is_public,
            agent_mode: editingItem.agent_mode,
          })
          .eq("id", editingItem.id);

        if (!error) {
          setAssets(
            assets.map((a) => (a.id === editingItem.id ? editingItem : a)),
          );
        }
      }
      closeEditPanel();
    } catch (error) {
      console.error("Error saving:", error);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setEditingItem({ ...editingItem, [field]: value });
  };

  const panelClass =
    "rounded-[28px] border border-[#5b1426] bg-[linear-gradient(135deg,_#17111a,_#0d1018)] shadow-[0_0_0_1px_rgba(255,44,92,0.02),0_12px_38px_rgba(0,0,0,0.22)]";
  const softPanelClass =
    "rounded-[24px] border border-white/10 bg-white/[0.03] shadow-[0_10px_30px_rgba(0,0,0,0.16)]";
  const statCardClass =
    "rounded-[24px] border border-[#4c1523] bg-[linear-gradient(135deg,_rgba(36,12,20,0.96),_rgba(14,17,27,0.96))] p-4 md:p-6 transition-all duration-300 hover:border-[#8f1b36] hover:-translate-y-0.5";
  const headerPanelClass =
    "rounded-[32px] border border-[#5b1426] bg-[radial-gradient(circle_at_top_left,_rgba(255,44,92,0.12),_transparent_28%),linear-gradient(135deg,_#17111a,_#0d1018)] shadow-[0_0_0_1px_rgba(255,44,92,0.02),0_18px_48px_rgba(0,0,0,0.28)]";
  //
  const getContentIcon = (type: string) => {
    const icons = {
      image: <Image className="w-4 h-4" weight="light" />,
      video: <VideoCamera className="w-4 h-4" weight="light" />,
      audio: <MusicNotes className="w-4 h-4" weight="light" />,
      code: <Code className="w-4 h-4" weight="light" />,
      prompt: <Lightbulb className="w-4 h-4" weight="light" />,
      text: <FileText className="w-4 h-4" weight="light" />,
    };
    return (
      icons[type as keyof typeof icons] || (
        <File className="w-4 h-4" weight="light" />
      )
    );
  };

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-x-hidden bg-[#070b13] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-red-500/8 blur-[140px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-8">
          {/* Header Skeleton */}
          <div className={`${headerPanelClass} mb-4 p-5 md:mb-8 md:p-8`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Skeleton className="mb-3 h-8 w-48 bg-white/10 md:h-10 md:w-64" />
                <Skeleton className="h-4 w-64 bg-white/10 md:w-96" />
              </div>
              <Skeleton className="h-10 w-28 bg-white/10 md:h-12 md:w-36" />
            </div>
          </div>

          {/* Tabs Skeleton */}
          <div className="mb-4 flex gap-3 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-2 md:mb-8">
            {[...Array(5)].map((_, i) => (
              <Skeleton
                key={i}
                className="h-10 w-24 flex-shrink-0 rounded-full bg-white/10"
              />
            ))}
          </div>

          {/* Stats Cards Skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={statCardClass}>
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <Skeleton className="h-3 w-16 md:w-24 bg-white/10" />
                  <Skeleton className="h-4 w-4 md:h-5 md:w-5 bg-white/10 rounded-full" />
                </div>
                <Skeleton className="h-6 md:h-8 w-24 md:w-32 bg-white/10 mb-1" />
                <Skeleton className="h-3 w-16 md:w-20 bg-white/10" />
              </div>
            ))}
          </div>

          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mb-4 md:mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`${softPanelClass} p-3 md:p-6`}>
                <div className="mb-3 md:mb-6">
                  <Skeleton className="h-4 w-24 md:w-32 bg-white/10 mb-1" />
                  <Skeleton className="h-3 w-32 md:w-48 bg-white/10" />
                </div>
                <Skeleton className="h-[180px] w-full bg-white/10" />
              </div>
            ))}
          </div>

          {/* Top Content Skeleton */}
          <div className={softPanelClass}>
            <div className="p-6 border-b border-white/10">
              <Skeleton className="h-4 w-48 bg-white/10 mb-1" />
              <Skeleton className="h-3 w-32 bg-white/10" />
            </div>
            <div className="divide-y divide-white/10">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-3 w-8 bg-white/10" />
                        <Skeleton className="h-4 w-64 bg-white/10" />
                      </div>
                      <div className="flex gap-8">
                        <Skeleton className="h-3 w-16 bg-white/10" />
                        <Skeleton className="h-3 w-16 bg-white/10" />
                        <Skeleton className="h-3 w-20 bg-white/10" />
                      </div>
                    </div>
                    <Skeleton className="h-4 w-4 bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#070b13] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[460px] w-[760px] -translate-x-1/2 rounded-full bg-red-500/8 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-8">
        <div className={`${headerPanelClass} mb-4 p-5 md:mb-8 md:p-8`}>
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ff4a6e]/80">
                Marketplace Commerce OS
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-5xl">
                Creator Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55 md:text-lg">
                Track revenue, publish assets, review AI activity, and manage
                your creator operation from one place.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:min-w-[260px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Earnings
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  ${stats.totalEarnings.toFixed(2)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Public Assets
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {stats.totalPublic}
                </p>
              </div>
            </div>
          </div>

          {stats.notifications > 0 && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#8f1b36] bg-[#ff2a57]/10 px-4 py-2">
              <Bell className="w-4 h-4 text-[#ff6685]" weight="light" />
              <span className="text-xs md:text-sm text-white/85">
                {stats.notifications} unread notifications
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-2 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-2 md:mb-8">
          {["overview", "analytics", "payments"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2.5 text-xs md:px-5 md:text-sm font-medium transition-all cursor-pointer relative whitespace-nowrap ${
                activeTab === tab
                  ? "bg-white text-black shadow-sm"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1).replace("-", " ")}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-8">
              <div className={statCardClass}>
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500">
                    Total Earnings
                  </p>
                  <CurrencyDollar
                    className="w-4 h-4 md:w-5 md:h-5 text-gray-600"
                    weight="light"
                  />
                </div>
                <p className="text-lg md:text-2xl font-light mb-1">
                  ${stats.totalEarnings.toFixed(2)}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  {stats.totalTransactions} paid
                </p>
              </div>

              <div className={statCardClass}>
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500">
                    Total Views
                  </p>
                  <Eye
                    className="w-4 h-4 md:w-5 md:h-5 text-gray-600"
                    weight="light"
                  />
                </div>
                <p className="text-lg md:text-2xl font-light mb-1">
                  {stats.totalViews.toLocaleString()}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  {stats.totalPublic} public
                </p>
              </div>

              <div className={statCardClass}>
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500">
                    Assets
                  </p>
                  <Package
                    className="w-4 h-4 md:w-5 md:h-5 text-gray-600"
                    weight="light"
                  />
                </div>
                <p className="text-lg md:text-2xl font-light mb-1">
                  {stats.totalAssets}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  {stats.remixes} remixes
                </p>
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mb-4 md:mb-8">
              <div className={`${softPanelClass} p-3 md:p-6`}>
                <div className="mb-3 md:mb-6">
                  <h3 className="text-xs md:text-sm font-light mb-1">
                    Revenue
                  </h3>
                  <p className="text-xs text-gray-500">Last 30 days</p>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={earningsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis
                      dataKey="date"
                      stroke="#666"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#666"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#000",
                        border: "1px solid #ffffff20",
                        borderRadius: 0,
                      }}
                      labelStyle={{ color: "#999", fontSize: 11 }}
                      itemStyle={{ color: "#fff", fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={`${softPanelClass} p-3 md:p-6`}>
                <div className="mb-3 md:mb-6">
                  <h3 className="text-xs md:text-sm font-light mb-1">Views</h3>
                  <p className="text-xs text-gray-500">Daily content views</p>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={viewsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis
                      dataKey="date"
                      stroke="#666"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#666"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#000",
                        border: "1px solid #ffffff20",
                        borderRadius: 0,
                      }}
                      labelStyle={{ color: "#999", fontSize: 11 }}
                      itemStyle={{ color: "#fff", fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={`${softPanelClass} p-3 md:p-6`}>
                <div className="mb-3 md:mb-6">
                  <h3 className="text-xs md:text-sm font-light mb-1">
                    Content Types
                  </h3>
                  <p className="text-xs text-gray-500">Asset distribution</p>
                </div>
                {contentDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={contentDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis
                        dataKey="type"
                        stroke="#666"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#666"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#000",
                          border: "1px solid #ffffff20",
                          borderRadius: 0,
                        }}
                        labelStyle={{ color: "#999", fontSize: 11 }}
                        itemStyle={{ color: "#fff", fontSize: 11 }}
                      />
                      <Bar dataKey="count" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[180px] text-gray-500">
                    <p className="text-sm">No content yet</p>
                  </div>
                )}
              </div>

              <div className={`${softPanelClass} p-3 md:p-6`}>
                <div className="mb-3 md:mb-6">
                  <h3 className="text-xs md:text-sm font-light mb-1">
                    Key Metrics
                  </h3>
                  <p className="text-xs text-gray-500">
                    Performance indicators
                  </p>
                </div>
                <div className="space-y-6">
                  {[
                    {
                      label: "Avg. Revenue per Sale",
                      value: `$${
                        stats.totalTransactions > 0
                          ? (
                              stats.totalEarnings / stats.totalTransactions
                            ).toFixed(2)
                          : "0.00"
                      }`,
                      width: 45,
                      color: "bg-red-500",
                    },
                    {
                      label: "Conversion Rate",
                      value: `${
                        stats.totalViews > 0
                          ? (
                              (stats.totalTransactions / stats.totalViews) *
                              100
                            ).toFixed(1)
                          : "0.0"
                      }%`,
                      width: 28,
                      color: "bg-blue-500",
                    },
                    {
                      label: "Public Assets",
                      value: assets.filter((a) => a.is_public).length,
                      width: 72,
                      color: "bg-green-500",
                    },
                    {
                      label: "Reports",
                      value: stats.reports,
                      width: stats.reports > 0 ? 15 : 0,
                      color: "bg-yellow-500",
                    },
                  ].map((metric, i) => (
                    <div key={i}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-500">
                          {metric.label}
                        </span>
                        <span className="text-sm font-light">
                          {metric.value}
                        </span>
                      </div>
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${metric.color} transition-all duration-500`}
                          style={{ width: `${metric.width}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={softPanelClass}>
              <div className="p-3 md:p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xs md:text-sm font-light mb-1">
                    Top Performing Content
                  </h3>
                  <p className="text-[10px] md:text-xs text-gray-500">
                    Ranked by revenue · views · sales
                  </p>
                </div>
                {topContent.length > 0 && (
                  <p className="text-[10px] md:text-xs text-gray-500">
                    Total: <span className="text-white">${(topContent.reduce((s, c) => s + c.revenue, 0) / 100).toFixed(2)}</span>
                  </p>
                )}
              </div>
              {topContent.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {topContent
                    .slice(0, topContentVisibleCount)
                    .map((content, idx) => {
                    const topRevenue = topContent[0].revenue || 1;
                    const pct = Math.max(4, (content.revenue / topRevenue) * 100);
                    const medal = ["🥇", "🥈", "🥉"][idx] || null;
                    const thumbUrl = content.thumbnail
                      ? content.thumbnail.startsWith("http")
                        ? content.thumbnail
                        : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${content.thumbnail}`
                      : null;
                    return (
                      <div
                        key={content.id}
                        className="p-3 md:p-5 hover:bg-white/[0.03] transition-all cursor-pointer group"
                        onClick={() => (window.location.href = `/asset/${content.id}`)}
                      >
                        <div className="flex items-center gap-3 md:gap-4">
                          {/* Rank / Medal */}
                          <div className="flex flex-col items-center w-7 md:w-8 flex-shrink-0">
                            {medal ? (
                              <span className="text-base md:text-lg leading-none">{medal}</span>
                            ) : (
                              <span className="text-[11px] md:text-xs text-gray-600 font-mono">#{idx + 1}</span>
                            )}
                          </div>

                          {/* Thumbnail */}
                          {thumbUrl ? (
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-md overflow-hidden bg-white/5 flex-shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-md bg-white/5 flex-shrink-0 flex items-center justify-center text-[9px] text-gray-600 uppercase">
                              {content.content_type?.slice(0, 3) || "—"}
                            </div>
                          )}

                          {/* Title + metrics + bar */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-xs md:text-sm font-light text-gray-200 group-hover:text-white truncate">
                                {content.title}
                              </p>
                              <p className="text-sm md:text-base font-medium text-white tabular-nums whitespace-nowrap">
                                ${(content.revenue / 100).toFixed(2)}
                              </p>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                              <div className="flex gap-3 md:gap-4 text-[10px] md:text-[11px] text-gray-500 tabular-nums">
                                <span>{content.views.toLocaleString()} views</span>
                                <span>{content.purchases} sales</span>
                                {content.conversion > 0 && (
                                  <span className={content.conversion >= 2 ? "text-emerald-400/80" : "text-gray-500"}>
                                    {content.conversion.toFixed(1)}% conv
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Revenue bar */}
                            <div className="mt-2 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-gray-500">
                  <p className="text-sm">No content with activity yet</p>
                  <p className="text-[11px] text-gray-600 mt-1">Top earners will appear here once you have views or sales</p>
                </div>
              )}
              {topContentVisibleCount < topContent.length && (
                <div className="p-3 md:p-5 border-t border-white/10 flex justify-center">
                  <button
                    onClick={() =>
                      setTopContentVisibleCount(
                        (count) => count + TOP_CONTENT_PAGE_SIZE
                      )
                    }
                    className="px-4 py-2 border border-white/10 text-xs md:text-sm text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div className="space-y-3 md:space-y-6">
            <div className="grid grid-cols-3 gap-2 md:gap-6">
              <div className={statCardClass}>
                <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500 mb-2 md:mb-3">
                  Total Events
                </p>
                <p className="text-lg md:text-3xl font-light mb-1 md:mb-2">
                  {stats.totalViews + stats.totalTransactions}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  All interactions
                </p>
              </div>
              <div className={statCardClass}>
                <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500 mb-2 md:mb-3">
                  Remixes
                </p>
                <p className="text-lg md:text-3xl font-light mb-1 md:mb-2">
                  {stats.remixes}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  Derivatives
                </p>
              </div>
              <div className={statCardClass}>
                <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500 mb-2 md:mb-3">
                  Reports
                </p>
                <p className="text-lg md:text-3xl font-light mb-1 md:mb-2">
                  {stats.reports}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  Content flags
                </p>
              </div>
            </div>

            <div className={softPanelClass}>
              <div className="p-3 md:p-6 border-b border-white/10">
                <h3 className="text-xs md:text-sm font-light mb-1">
                  Recent Transactions ({transactions.length})
                </h3>
                <p className="text-[10px] md:text-xs text-gray-500">
                  Payment history
                </p>
              </div>
              {transactions.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {transactions
                    .slice(0, analyticsTransactionsVisibleCount)
                    .map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 md:p-6 hover:bg-white/5 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 md:gap-4">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              tx.status === "paid"
                                ? "bg-green-500"
                                : tx.status === "pending"
                                  ? "bg-yellow-500"
                                  : tx.status === "failed"
                                    ? "bg-red-500"
                                    : "bg-gray-500"
                            }`}
                          />
                          <div>
                            <p className="text-xs md:text-sm font-light mb-1">
                              $
                              {(
                                (tx.amount_cents - tx.platform_fee_cents) /
                                100
                              ).toFixed(2)}
                            </p>
                            <p className="text-[10px] md:text-xs text-gray-500">
                              {tx.status} • {tx.currency.toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] md:text-xs text-gray-600">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-gray-500">
                  <p className="text-sm">No transactions yet</p>
                </div>
              )}
              {analyticsTransactionsVisibleCount < transactions.length && (
                <div className="p-3 md:p-5 border-t border-white/10 flex justify-center">
                  <button
                    onClick={() =>
                      setAnalyticsTransactionsVisibleCount(
                        (count) => count + ANALYTICS_TRANSACTIONS_PAGE_SIZE
                      )
                    }
                    className="px-4 py-2 border border-white/10 text-xs md:text-sm text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>

            {reports.length > 0 && (
              <div className={softPanelClass}>
                <div className="p-3 md:p-6 border-b border-white/10">
                  <h3 className="text-xs md:text-sm font-light mb-1">
                    Reports ({reports.length})
                  </h3>
                  <p className="text-[10px] md:text-xs text-gray-500">
                    Content flagged by users
                  </p>
                </div>
                <div className="divide-y divide-white/10">
                  {reports.slice(0, reportsVisibleCount).map((report) => (
                    <div
                      key={report.id}
                      className="p-3 md:p-6 hover:bg-white/5 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs md:text-sm font-light mb-1 truncate">
                            {report.reason || "No reason provided"}
                          </p>
                          <p className="text-[10px] md:text-xs text-gray-500">
                            {report.status}
                          </p>
                        </div>
                        <span className="text-[10px] md:text-xs text-gray-600 flex-shrink-0">
                          {new Date(report.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {reportsVisibleCount < reports.length && (
                  <div className="p-3 md:p-5 border-t border-white/10 flex justify-center">
                    <button
                      onClick={() =>
                        setReportsVisibleCount(
                          (count) => count + REPORTS_PAGE_SIZE
                        )
                      }
                      className="px-4 py-2 border border-white/10 text-xs md:text-sm text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <div className="space-y-3 md:space-y-6">
            <div className="grid grid-cols-3 gap-2 md:gap-6">
              <div className={statCardClass}>
                <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500 mb-2 md:mb-3">
                  Total Revenue
                </p>
                <p className="text-lg md:text-3xl font-light mb-1 md:mb-2">
                  ${stats.totalEarnings.toFixed(2)}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">All time</p>
              </div>
              <div className={statCardClass}>
                <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500 mb-2 md:mb-3">
                  Payout
                </p>
                <p className="text-lg md:text-2xl font-light mb-1 md:mb-2">
                  {payoutAccount?.stripe_onboarding_status === "completed"
                    ? "Connected"
                    : payoutAccount?.stripe_account_id
                      ? "Pending"
                      : "Not Setup"}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">
                  {payoutAccount?.stripe_onboarding_status === "completed"
                    ? "Stripe Express"
                    : payoutAccount?.stripe_account_id
                      ? "Complete onboarding"
                      : "N/A"}
                </p>
              </div>
              <div className={statCardClass}>
                <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-500 mb-2 md:mb-3">
                  Transactions
                </p>
                <p className="text-lg md:text-3xl font-light mb-1 md:mb-2">
                  {stats.totalTransactions}
                </p>
                <p className="text-[10px] md:text-xs text-gray-600">Paid</p>
              </div>
            </div>

            <div className={softPanelClass}>
              <div className="p-3 md:p-6 border-b border-white/10">
                <h3 className="text-xs md:text-sm font-light mb-1">
                  Payment History
                </h3>
                <p className="text-[10px] md:text-xs text-gray-500">
                  All transactions
                </p>
              </div>
              {transactions.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {transactions
                    .slice(0, paymentsTransactionsVisibleCount)
                    .map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 md:p-6 hover:bg-white/5 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                          <div
                            className={`w-8 h-8 md:w-10 md:h-10 flex items-center justify-center flex-shrink-0 ${
                              tx.status === "paid"
                                ? "bg-green-500/20"
                                : tx.status === "pending"
                                  ? "bg-yellow-500/20"
                                  : tx.status === "failed"
                                    ? "bg-red-500/20"
                                    : "bg-gray-500/20"
                            } transition-all`}
                          >
                            <CurrencyDollar
                              className={`w-4 h-4 md:w-5 md:h-5 ${
                                tx.status === "paid"
                                  ? "text-green-500"
                                  : tx.status === "pending"
                                    ? "text-yellow-500"
                                    : tx.status === "failed"
                                      ? "text-red-500"
                                      : "text-gray-500"
                              }`}
                              weight="light"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 md:gap-3 mb-1">
                              <p className="text-xs md:text-sm font-light group-hover:text-white transition-colors">
                                $
                                {(
                                  (tx.amount_cents - tx.platform_fee_cents) /
                                  100
                                ).toFixed(2)}
                              </p>
                              <span className="text-[10px] md:text-xs text-gray-600 hidden md:inline">
                                (Fee: $
                                {(tx.platform_fee_cents / 100).toFixed(2)})
                              </span>
                            </div>
                            <div className="flex gap-3 md:gap-6 text-[10px] md:text-xs text-gray-500">
                              <span>{tx.status}</span>
                              <span>{tx.currency.toUpperCase()}</span>
                              <span>
                                {new Date(tx.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <CaretRight
                          className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors"
                          weight="light"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 md:p-12 text-center text-gray-500">
                  <p className="text-xs md:text-sm">No transactions yet</p>
                </div>
              )}
              {paymentsTransactionsVisibleCount < transactions.length && (
                <div className="p-3 md:p-5 border-t border-white/10 flex justify-center">
                  <button
                    onClick={() =>
                      setPaymentsTransactionsVisibleCount(
                        (count) => count + PAYMENTS_TRANSACTIONS_PAGE_SIZE
                      )
                    }
                    className="px-4 py-2 border border-white/10 text-xs md:text-sm text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className={softPanelClass}>
                <div className="p-3 md:p-6 border-b border-white/10">
                  <h3 className="text-xs md:text-sm font-light mb-1">
                    Notifications ({notifications.length})
                  </h3>
                  <p className="text-[10px] md:text-xs text-gray-500">
                    Payment alerts
                  </p>
                </div>
                <div className="divide-y divide-white/10">
                  {notifications
                    .slice(0, notificationsVisibleCount)
                    .map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 md:p-6 hover:bg-white/5 transition-all cursor-pointer group ${
                        !notif.read ? "bg-white/[0.03]" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2 md:gap-4 flex-1 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full mt-1.5 md:mt-2 flex-shrink-0 ${
                              !notif.read ? "bg-blue-500" : "bg-gray-600"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs md:text-sm font-light mb-1 group-hover:text-white transition-colors truncate">
                              {notif.type}
                            </p>
                            <p className="text-[10px] md:text-xs text-gray-600">
                              {new Date(notif.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <CaretRight
                          className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors"
                          weight="light"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {notificationsVisibleCount < notifications.length && (
                  <div className="p-3 md:p-5 border-t border-white/10 flex justify-center">
                    <button
                      onClick={() =>
                        setNotificationsVisibleCount(
                          (count) => count + NOTIFICATIONS_PAGE_SIZE
                        )
                      }
                      className="px-4 py-2 border border-white/10 text-xs md:text-sm text-gray-300 hover:text-white hover:border-red-500/40 hover:bg-white/5 transition-all"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Edit Side Panel */}
        {editPanelOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={closeEditPanel}
            />

            {/* Side Panel */}
            <div
              className="fixed right-0 top-0 h-full w-[500px] bg-[linear-gradient(180deg,_#0f131b,_#090c13)] border-l border-[#5b1426] z-50 overflow-y-auto shadow-[-20px_0_40px_rgba(0,0,0,0.35)]"
              data-lenis-prevent
            >
              {/* Header */}
              <div className="sticky top-0 border-b border-white/10 bg-[#0d1018]/95 p-6 backdrop-blur-sm">
                <h2 className="text-xl font-light mb-1">Edit Asset</h2>
                <p className="text-xs text-gray-500">
                  Update your asset information
                </p>
              </div>

              {/* Form */}
              <div className="p-6 space-y-6">
                {editType === "asset" && editingItem && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">
                        Title
                      </label>
                      <input
                        type="text"
                        value={editingItem.title || ""}
                        onChange={(e) => updateField("title", e.target.value)}
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">
                        Description
                      </label>
                      <textarea
                        value={editingItem.description || ""}
                        onChange={(e) =>
                          updateField("description", e.target.value)
                        }
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">
                        Content Type
                      </label>
                      <select
                        value={editingItem.content_type}
                        onChange={(e) =>
                          updateField("content_type", e.target.value)
                        }
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                      >
                        <option value="text">Text</option>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="audio">Audio</option>
                        <option value="code">Code</option>
                        <option value="prompt">Prompt</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">
                        Price (USD)
                      </label>
                      <input
                        type="number"
                        value={(editingItem.price_cents || 0) / 100}
                        onChange={(e) =>
                          updateField(
                            "price_cents",
                            Math.round(parseFloat(e.target.value) * 100),
                          )
                        }
                        step="0.01"
                        min="0"
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-2 block">
                        Agent Mode
                      </label>
                      <select
                        value={editingItem.agent_mode}
                        onChange={(e) =>
                          updateField("agent_mode", e.target.value)
                        }
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                      >
                        <option value="AUTO">Auto</option>
                        <option value="SUGGEST">Suggest</option>
                        <option value="OFF">Off</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={editingItem.is_public}
                        onChange={(e) =>
                          updateField("is_public", e.target.checked)
                        }
                        className="w-4 h-4"
                      />
                      <label className="text-sm">Make Public</label>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 flex gap-3 border-t border-white/10 bg-[#0d1018]/95 p-6 backdrop-blur-sm">
                <button
                  onClick={closeEditPanel}
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm border border-white/10 hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[#e61f4c] to-[#98112d] px-4 py-2 text-sm text-white transition-all disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
