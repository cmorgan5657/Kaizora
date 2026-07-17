"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Zap,
  TrendingUp,
  Calendar,
  Loader2,
  Info,
  Lightbulb,
  Check,
  CreditCard,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { syncSubscriptionCredits } from "@/lib/syncSubscriptionCredits";
import LegacyCreditsNotice from "@/app/components/LegacyCreditsNotice";
import { getCreditBuckets } from "@/lib/creditBuckets";

interface CreditPack {
  id: string;
  name: string;
  price: number;
  credits: number;
  description: string;
  popular?: boolean;
  active?: boolean;
  tier?: "month" | "year";
}

interface CreditSubscription {
  id: string;
  plan_id: string;
  plan_name: string;
  price: number | null;
  credits: number;
  billing_interval: "month" | "year";
  discount_percent: number;
  status: string;
  stripe_subscription_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

type Tab = "topup" | "auto" | "notifications";

function CreditsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get("tab") as Tab) || "topup";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [subscriptionBalance, setSubscriptionBalance] = useState(0);
  const [purchasedBalance, setPurchasedBalance] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalPurchased, setTotalPurchased] = useState(0);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [selectedPack, setSelectedPack] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFulfilling, setIsFulfilling] = useState(false);
  const [subscription, setSubscription] = useState<CreditSubscription | null>(
    null,
  );
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionCanceling, setSubscriptionCanceling] = useState(false);

  const [autoTopup, setAutoTopup] = useState({
    is_enabled: false,
    topup_amount: 20,
    threshold: 10,
    pack_id: "" as string,
  });
  const [autoTopupSaving, setAutoTopupSaving] = useState(false);
  const [autoTopupSaved, setAutoTopupSaved] = useState(false);

  // Card state
  const [hasCard, setHasCard] = useState(false);
  const [cardInfo, setCardInfo] = useState<{
    brand: string;
    last4: string;
    exp_month?: number;
    exp_year?: number;
  } | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [removingCard, setRemovingCard] = useState(false);

  const [notificationThreshold, setNotificationThreshold] = useState(0);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationSaved, setNotificationSaved] = useState(false);

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  };

  const fetchPacks = async () => {
    try {
      const res = await fetch("/api/admin/pricing");
      const data = await res.json();
      const activePacks = (data.packs || []).filter(
        (p: CreditPack) => p.active !== false,
      );
      setPacks(activePacks);
      if (!selectedPack && activePacks.length > 0) {
        const popular = activePacks.find((p: CreditPack) => p.popular);
        setSelectedPack(popular?.id || activePacks[0].id);
      }
    } catch {
      // silent
    }
  };

  const checkCard = async () => {
    setCardLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setHasCard(false);
        setCardInfo(null);
        return;
      }

      const res = await fetch("/api/credits/check-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setHasCard(data.hasCard);
      if (data.card) setCardInfo(data.card);
    } catch {
      // silent
    } finally {
      setCardLoading(false);
    }
  };

  const fetchSubscription = async (userId: string) => {
    setSubscriptionLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setSubscription(null);
        return;
      }

      const res = await fetch("/api/credits/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubscription(data.subscription || null);
    } catch {
      setSubscription(null);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  // Load user + packs
  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      if (!data.user) {
        setSubscriptionLoading(false);
        return;
      }
      fetchCreditData(data.user.id);
      fetchSubscription(data.user.id);
      fetchAutoTopupSettings(data.user.id);
      fetchNotificationSettings(data.user.id);
      checkCard();
    }
    loadUser();
    fetchPacks();

    // Check if returning from card save
    if (searchParams.get("card_saved") === "true") {
      setActiveTab("auto");
      router.replace("/credits?tab=auto", { scroll: false });
    }

    const creditsChannel = supabase
      .channel("credits-page-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits" },
        () => {
          supabase.auth.getUser().then(({ data }) => {
            if (data.user) fetchCreditData(data.user.id);
          });
        },
      )
      .subscribe();

    const packsChannel = supabase
      .channel("credits-packs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_packs" },
        () => fetchPacks(),
      )
      .subscribe();

    const handleCreditsUpdated = () => {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) fetchCreditData(data.user.id);
      });
    };
    window.addEventListener("credits-updated", handleCreditsUpdated);

    return () => {
      creditsChannel.unsubscribe();
      packsChannel.unsubscribe();
      window.removeEventListener("credits-updated", handleCreditsUpdated);
    };
  }, []);

  // Handle Stripe return
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (sessionId && user) {
      fulfillCredits(sessionId);
    }
  }, [searchParams, user]);

  const fetchCreditData = async (userId: string) => {
    await syncSubscriptionCredits();

    const { data } = await supabase
      .from("user_credits")
      .select(
        "balance, total_spent, total_purchased, subscription_credits, purchased_credits",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      const buckets = getCreditBuckets(data);
      setBalance(buckets.totalBalance);
      setSubscriptionBalance(buckets.subscriptionCredits);
      setPurchasedBalance(buckets.purchasedCredits);
      setTotalSpent(data.total_spent ?? 0);
      setTotalPurchased(data.total_purchased ?? 0);
    } else {
      setBalance(0);
      setSubscriptionBalance(0);
      setPurchasedBalance(0);
    }
  };

  const fetchAutoTopupSettings = async (userId: string) => {
    const { data } = await supabase
      .from("auto_topup_settings" as any)
      .select("is_enabled, topup_amount, threshold, pack_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      setAutoTopup(data as any);
    }
  };

  const handleToggleAutoTopup = async () => {
    const newEnabled = !autoTopup.is_enabled;
    await handleSaveAutoTopup(newEnabled);
  };

  const handleSaveAutoTopup = async (enabled: boolean) => {
    if (!user) return;
    setAutoTopupSaving(true);
    setAutoTopupSaved(false);
    try {
      const { data: existing } = await supabase
        .from("auto_topup_settings" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const payload = {
        is_enabled: enabled,
        topup_amount: autoTopup.topup_amount,
        threshold: autoTopup.threshold,
        pack_id: autoTopup.pack_id || null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await (supabase.from("auto_topup_settings" as any) as any)
          .update(payload)
          .eq("user_id", user.id);
      } else {
        await (supabase.from("auto_topup_settings" as any) as any).insert({
          user_id: user.id,
          ...payload,
        });
      }

      setAutoTopup((prev) => ({ ...prev, is_enabled: enabled }));
      setAutoTopupSaved(true);
      setTimeout(() => setAutoTopupSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setAutoTopupSaving(false);
    }
  };

  const handleSaveAutoTopupSettings = async () => {
    await handleSaveAutoTopup(autoTopup.is_enabled);
  };

  const handleSaveCard = async () => {
    if (!user) return;
    setSavingCard(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/credits/save-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setSavingCard(false);
    }
  };

  const handleRemoveCard = async () => {
    if (!user) return;
    setRemovingCard(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Unauthorized");

      await fetch("/api/credits/remove-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      setHasCard(false);
      setCardInfo(null);
    } catch {
      // silent
    } finally {
      setRemovingCard(false);
    }
  };

  const fulfillCredits = async (sessionId: string) => {
    setIsFulfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "fulfill-credits",
        { body: { sessionId } },
      );
      if (error) throw error;
      window.dispatchEvent(new CustomEvent("credits-updated"));
      if (user) fetchCreditData(user.id);
      router.replace("/credits");
    } catch (err) {
      console.error("Fulfillment error:", err);
    } finally {
      setIsFulfilling(false);
    }
  };

  const handleBuy = async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    const pack = packs.find((p) => p.id === selectedPack);
    if (!pack) return;

    setIsLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/credits/buy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          packId: pack.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error(err.message || "Failed to start checkout");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotificationSettings = async (userId: string) => {
    const { data } = await supabase
      .from("balance_notification_settings" as any)
      .select("threshold, is_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      setNotificationThreshold((data as any).threshold ?? 0);
      setNotificationEnabled((data as any).is_enabled ?? false);
    }
  };

  const handleSaveNotification = async () => {
    if (!user) return;
    setNotificationSaving(true);
    setNotificationSaved(false);
    try {
      const { data: existing } = await supabase
        .from("balance_notification_settings" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const payload = {
        threshold: notificationThreshold,
        is_enabled: notificationEnabled,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await (supabase.from("balance_notification_settings" as any) as any)
          .update(payload)
          .eq("user_id", user.id);
      } else {
        await (supabase.from("balance_notification_settings" as any) as any).insert({
          user_id: user.id,
          ...payload,
        });
      }

      setNotificationSaved(true);
      setTimeout(() => setNotificationSaved(false), 3000);

      // If balance is already below threshold, send email immediately
      if (notificationEnabled && notificationThreshold > 0 && balance !== null && balance <= notificationThreshold) {
        try {
          await fetch("/api/notifications/low-balance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              balance,
              threshold: notificationThreshold,
            }),
          });
        } catch {
          // silent
        }
      }
    } catch {
      // silent
    } finally {
      setNotificationSaving(false);
    }
  };

  const handleCancelSubscription = async (immediate = false) => {
    if (!user || !subscription?.stripe_subscription_id || subscriptionCanceling)
      return;
    if (
      !confirm(
        immediate
          ? "Cancel immediately? You'll lose access to this plan right away — no refund."
          : "Cancel this subscription at the end of the current billing period?",
      )
    ) {
      return;
    }

    setSubscriptionCanceling(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/credits/subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscriptionId: subscription.stripe_subscription_id,
          immediate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");
      await fetchSubscription(user.id);
    } catch (err) {
      console.error("Subscription cancel error:", err);
    } finally {
      setSubscriptionCanceling(false);
    }
  };

  // Top-ups require an active subscription. Monthly packs (30-day credits) show
  // to everyone with a sub; annual packs (365-day credits) show to annual subs
  // only. The subscription API only returns subs that still have access.
  const hasActiveSub = !!subscription;
  const subTier: "month" | "year" =
    subscription?.billing_interval === "year" ? "year" : "month";
  const visiblePacks = hasActiveSub
    ? packs.filter((p) =>
        subTier === "year" ? true : (p.tier || "month") === "month",
      )
    : [];

  const selected = visiblePacks.find((p) => p.id === selectedPack);
  const autoTopupPack = visiblePacks.find((p) => p.id === autoTopup.pack_id);

  // If the visible (tier-filtered) packs change, make sure the selected pack
  // is still one of them — otherwise pick the popular/first one.
  const visiblePackIds = visiblePacks.map((p) => p.id).join(",");
  useEffect(() => {
    if (!hasActiveSub || visiblePacks.length === 0) return;
    if (!visiblePacks.some((p) => p.id === selectedPack)) {
      const popular = visiblePacks.find((p) => p.popular);
      setSelectedPack(popular?.id || visiblePacks[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePackIds, hasActiveSub]);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "topup", label: "Top Up", icon: Zap },
    { id: "auto", label: "Auto Top-up", icon: CreditCard },
    { id: "notifications", label: "Alerts", icon: Bell },
  ];

  return (
    <div className="bg-black text-white">
      <div className="w-full px-3 md:px-6 pb-4 md:pb-6">
        <LegacyCreditsNotice />

        {/* Header */}
        <div className="mb-4 md:mb-5">
          <h1 className="text-lg md:text-xl font-bold">Credits</h1>
          <p className="text-gray-500 text-[10px] md:text-xs mt-0.5">
            Top up, manage auto-recharge, and set balance alerts
          </p>
        </div>

        {/* Fulfilling banner */}
        {isFulfilling && (
          <div className="mb-4 md:mb-6 flex items-center gap-2 text-red-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs md:text-sm font-medium">
              Processing your purchase…
            </span>
          </div>
        )}

        {/* Balance Summary — always visible */}
        {subscriptionLoading ? (
          <div className="mb-4 md:mb-5 border border-white/10 p-3 md:p-4 flex items-center gap-2 text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-[10px] md:text-xs">
              Loading subscription…
            </span>
          </div>
        ) : subscription ? (
          <div className="mb-4 md:mb-5 border border-white/10 p-3 md:p-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm md:text-base font-semibold">
                    {subscription.plan_name}
                  </h2>
                  <span
                    className={`text-[8px] md:text-[10px] px-1.5 py-0.5 uppercase tracking-wider font-medium ${
                      subscription.status === "active"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : subscription.status === "past_due"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-white/5 text-gray-400"
                    }`}
                  >
                    {subscription.cancel_at_period_end
                      ? "Cancels at period end"
                      : subscription.status.replace("_", " ")}
                  </span>
                  {subscription.billing_interval === "year" &&
                    subscription.discount_percent > 0 && (
                      <span className="text-[8px] md:text-[10px] px-1.5 py-0.5 bg-red-500/15 text-red-400 uppercase tracking-wider font-medium">
                        Save {subscription.discount_percent}%
                      </span>
                    )}
                </div>
                <p className="text-[10px] md:text-xs text-gray-500 mt-1">
                  {subscription.price !== null
                    ? `$${subscription.price}/${subscription.billing_interval === "year" ? "year" : "month"}`
                    : `Billed ${subscription.billing_interval === "year" ? "yearly" : "monthly"}`}
                  {" · "}
                  {subscription.credits.toLocaleString()} credits per month
                </p>
                {subscription.current_period_end && (
                  <p className="text-[10px] md:text-xs text-gray-400 mt-1">
                    {subscription.cancel_at_period_end ? "Access ends" : "Renews"}{" "}
                    on{" "}
                    {new Date(
                      subscription.current_period_end,
                    ).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => user && fetchSubscription(user.id)}
                  className="px-3 py-1.5 text-[10px] md:text-xs border border-white/10 text-gray-400 hover:border-white/20 hover:text-white transition-all cursor-pointer"
                >
                  Refresh
                </button>
                <button
                  onClick={() => handleCancelSubscription(false)}
                  disabled={
                    subscriptionCanceling || subscription.cancel_at_period_end
                  }
                  className="px-3 py-1.5 text-[10px] md:text-xs border border-red-500/20 text-red-400/80 hover:border-red-500/40 hover:text-red-400 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {subscriptionCanceling ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Canceling…
                    </span>
                  ) : subscription.cancel_at_period_end ? (
                    "Cancellation Scheduled"
                  ) : (
                    "Cancel at Period End"
                  )}
                </button>
                <button
                  onClick={() => handleCancelSubscription(true)}
                  disabled={subscriptionCanceling}
                  className="px-3 py-1.5 text-[10px] md:text-xs bg-red-600/90 hover:bg-red-600 text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel Now
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4 md:mb-5">
          <div className="border border-white/10 p-3 md:p-4">
            <p className="text-[9px] md:text-[11px] text-gray-500 mb-0.5">
              Current balance
            </p>
            <p className="text-lg md:text-2xl font-bold">
              {balance?.toLocaleString() ?? "—"}
            </p>
            <p className="text-[8px] md:text-[10px] text-gray-600">credits</p>
            <p className="text-[8px] md:text-[10px] text-gray-500 mt-0.5">
              Sub {subscriptionBalance.toLocaleString()} · Top-up{" "}
              {purchasedBalance.toLocaleString()}
            </p>
          </div>
          <div className="border border-white/10 p-3 md:p-4">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="h-2.5 w-2.5 text-gray-500" />
              <p className="text-[9px] md:text-[11px] text-gray-500">
                Purchased Balance
              </p>
            </div>
            <p className="text-lg md:text-2xl font-bold">
              {purchasedBalance.toLocaleString()}
            </p>
            <p className="text-[8px] md:text-[10px] text-gray-600">credits</p>
            <p className="text-[8px] md:text-[10px] text-gray-500 mt-0.5">
              Lifetime bought: {totalPurchased.toLocaleString()}
            </p>
          </div>
          <div className="border border-white/10 p-3 md:p-4">
            <div className="flex items-center gap-1 mb-0.5">
              <Calendar className="h-2.5 w-2.5 text-gray-500" />
              <p className="text-[9px] md:text-[11px] text-gray-500">
                Spent
              </p>
            </div>
            <p className="text-lg md:text-2xl font-bold">
              {totalSpent.toLocaleString()}
            </p>
            <p className="text-[8px] md:text-[10px] text-gray-600">credits</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-4 md:mb-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                router.replace(`/credits?tab=${tab.id}`, { scroll: false });
              }}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-2 text-[10px] md:text-xs font-medium transition-all duration-300 cursor-pointer border-b-2 -mb-[1px] ${
                activeTab === tab.id
                  ? "border-red-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}

        {/* ==================== TOP UP TAB ==================== */}
        {activeTab === "topup" && !hasActiveSub && (
          <div className="border border-white/10 p-6 md:p-8 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10">
              <Zap className="h-5 w-5 text-red-400" />
            </div>
            <h2 className="text-sm md:text-base font-semibold">
              Subscribe to unlock top-ups
            </h2>
            <p className="mt-1.5 text-[11px] md:text-xs text-gray-400 max-w-md mx-auto">
              One-time credit packs are available to active subscribers only.
              Subscribe to a monthly or annual plan to buy top-ups whenever you
              need extra credits.
            </p>
            <button
              onClick={() => router.push("/pricing")}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-[10px] md:text-xs font-medium transition-colors cursor-pointer"
            >
              <Zap className="h-3 w-3" /> View plans
            </button>
          </div>
        )}

        {activeTab === "topup" && hasActiveSub && (
          <div className="border border-white/10 p-3 md:p-4">
            <h2 className="text-xs md:text-sm font-semibold mb-1">
              Select a Credit Pack
            </h2>
            <p className="text-[10px] text-gray-500 mb-3">
              {subTier === "year"
                ? "Monthly packs give 30-day credits; annual packs give 365-day credits."
                : "Credits from these packs are valid for 30 days."}
            </p>
            {visiblePacks.length === 0 ? (
              <div className="p-4 bg-white/[0.02] border border-white/5 text-[11px] text-gray-400">
                No top-up packs are available for your plan yet. Please check back
                soon.
              </div>
            ) : (
            <>
            <div className="space-y-1.5">
              {visiblePacks.map((pack) => (
                <label
                  key={pack.id}
                  onClick={() => setSelectedPack(pack.id)}
                  className={`flex items-center justify-between p-2.5 md:p-3 border cursor-pointer transition-all duration-300 ${
                    selectedPack === pack.id
                      ? "border-red-500/60 bg-red-500/5"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 md:w-3.5 md:h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selectedPack === pack.id
                          ? "border-red-500"
                          : "border-white/20"
                      }`}
                    >
                      {selectedPack === pack.id && (
                        <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-red-500" />
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-xs md:text-sm">
                        ${pack.price}
                      </span>
                      <span className="text-gray-400 ml-1.5 text-[10px] md:text-xs">
                        {pack.credits} credits
                      </span>
                      <span
                        className={`ml-1.5 text-[8px] md:text-[9px] px-1 py-0.5 uppercase tracking-wider font-medium ${
                          (pack.tier || "month") === "year"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-blue-500/20 text-blue-300"
                        }`}
                      >
                        {(pack.tier || "month") === "year" ? "365 days" : "30 days"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {pack.popular && (
                      <span className="text-[7px] md:text-[9px] px-1 py-0.5 bg-red-500/20 text-red-400 uppercase tracking-wider font-medium">
                        Popular
                      </span>
                    )}
                    <span className="text-[8px] md:text-[10px] text-gray-600 hidden sm:inline">
                      {pack.description}
                    </span>
                  </div>
                </label>
              ))}
            </div>

            <button
              onClick={handleBuy}
              disabled={isLoading}
              className="mt-3 flex items-center gap-1.5 px-4 py-1.5 md:py-2 bg-red-600 hover:bg-red-500 text-white text-[10px] md:text-xs font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Quick Buy ${selected?.price}.00
            </button>

            {/* Info */}
            <div className="flex items-start gap-1.5 p-2 bg-white/[0.02] border border-white/5 mt-3">
              <Info className="h-3 w-3 text-gray-500 mt-0.5 shrink-0" />
              <p className="text-[9px] md:text-[10px] text-gray-500 leading-relaxed">
                Credits are valid for 30 days, or until your subscription expiry
                if that&apos;s later — a top-up never shortens your existing expiry.
                Payments are securely processed via Stripe, and your card is saved
                for future purchases and auto top-ups.
              </p>
            </div>
            </>
            )}
          </div>
        )}

        {/* ==================== AUTO TOP-UP TAB ==================== */}
        {activeTab === "auto" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Left (2/3): Auto Top-up Settings */}
            <div className="lg:col-span-2 border border-white/10 p-3 md:p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs md:text-sm font-semibold">Auto Top-up</h2>
                  <span
                    className={`text-[7px] md:text-[9px] px-1 py-0.5 uppercase tracking-wider font-medium ${
                      autoTopup.is_enabled
                        ? "bg-red-500/20 text-red-400"
                        : "bg-white/5 text-gray-500"
                    }`}
                  >
                    {autoTopup.is_enabled ? "Active" : "Inactive"}
                  </span>
                </div>
                {/* Toggle Switch */}
                <button
                  onClick={handleToggleAutoTopup}
                  disabled={autoTopupSaving}
                  className="relative cursor-pointer disabled:opacity-50"
                >
                  <div
                    className={`w-8 h-[18px] rounded-full transition-colors duration-300 ${
                      autoTopup.is_enabled ? "bg-red-500" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all duration-300 ${
                        autoTopup.is_enabled ? "left-[17px]" : "left-[3px]"
                      }`}
                    />
                  </div>
                </button>
              </div>

              {/* Threshold */}
              <div className="space-y-1 mb-3">
                <label className="text-[9px] md:text-[10px] text-gray-400 font-medium">
                  When credits balance falls below
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={autoTopup.threshold}
                    onChange={(e) =>
                      setAutoTopup((prev) => ({
                        ...prev,
                        threshold: Math.max(
                          1,
                          Math.min(1000, parseInt(e.target.value) || 1),
                        ),
                      }))
                    }
                    className="w-full bg-white/[0.03] border border-white/10 text-white text-[10px] md:text-xs px-2.5 py-1.5 focus:outline-none focus:border-red-500/50 transition-colors"
                  />
                  <span className="text-[9px] md:text-[10px] text-gray-500">
                    credits
                  </span>
                </div>
              </div>

              {/* Recharge Pack Selector */}
              <div className="space-y-1 mb-3">
                <label className="text-[9px] md:text-[10px] text-gray-400 font-medium">
                  Recharge with
                </label>
                <select
                  value={autoTopup.pack_id || ""}
                  onChange={(e) =>
                    setAutoTopup((prev) => ({
                      ...prev,
                      pack_id: e.target.value,
                    }))
                  }
                  className="w-full bg-white/[0.03] border border-white/10 text-white text-[10px] md:text-xs px-2.5 py-1.5 focus:outline-none focus:border-red-500/50 transition-colors appearance-none cursor-pointer"
                >
                  <option value="" className="bg-black text-gray-500">
                    Select a credit pack
                  </option>
                  {visiblePacks.map((pack) => (
                    <option key={pack.id} value={pack.id} className="bg-black text-white">
                      {pack.credits} credits — ${pack.price}
                    </option>
                  ))}
                </select>
              </div>

              {/* Summary */}
              <div className="p-2 bg-white/[0.02] border border-white/5 mb-3">
                <p className="text-[9px] md:text-[10px] text-gray-400">
                  Triggers when balance reaches{" "}
                  <span className="font-semibold text-white">
                    {autoTopup.threshold} credits
                  </span>
                  {autoTopupPack && (
                    <>
                      {" "}— recharges{" "}
                      <span className="font-semibold text-white">
                        {autoTopupPack.credits} credits (${autoTopupPack.price})
                      </span>
                    </>
                  )}
                </p>
              </div>

              {/* Save Settings Button */}
              <button
                onClick={handleSaveAutoTopupSettings}
                disabled={autoTopupSaving}
                className="w-full py-1.5 md:py-2 text-[10px] md:text-xs font-medium transition-all duration-300 cursor-pointer disabled:opacity-50 border border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
              >
                {autoTopupSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin inline mr-1.5" />
                ) : autoTopupSaved ? (
                  <>
                    <Check className="h-3 w-3 inline mr-1.5 text-green-400" />
                    <span className="text-green-400">Saved</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3 inline mr-1.5" />
                    Save Settings
                  </>
                )}
              </button>
            </div>

            {/* Right (1/3): Payment Method + How it works */}
            <div className="space-y-3">
              {/* Payment Method */}
              <div className="border border-white/10 p-3 md:p-4">
                <h2 className="text-xs md:text-sm font-semibold mb-2.5">Payment Method</h2>
                {cardLoading ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-[10px]">Checking saved card...</span>
                  </div>
                ) : hasCard && cardInfo ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                      <div>
                        <p className="text-[10px] md:text-xs font-medium">
                          {cardInfo.brand.charAt(0).toUpperCase() + cardInfo.brand.slice(1)} •••• {cardInfo.last4}
                        </p>
                        {cardInfo.exp_month && cardInfo.exp_year && (
                          <p className="text-[8px] md:text-[9px] text-gray-500">
                            Expires {String(cardInfo.exp_month).padStart(2, "0")}/{cardInfo.exp_year}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveCard}
                        disabled={savingCard}
                        className="px-2 py-1 text-[9px] md:text-[10px] border border-white/10 text-gray-400 hover:border-white/20 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                      >
                        {savingCard ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Change Card"}
                      </button>
                      <button
                        onClick={handleRemoveCard}
                        disabled={removingCard}
                        className="px-2 py-1 text-[9px] md:text-[10px] border border-red-500/20 text-red-400/70 hover:border-red-500/40 hover:text-red-400 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {removingCard ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Remove Card"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[9px] md:text-[10px] text-gray-500 mb-2">
                      No payment method saved. Add a card to enable auto top-up.
                    </p>
                    <button
                      onClick={handleSaveCard}
                      disabled={savingCard}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] md:text-xs font-medium transition-all duration-300 cursor-pointer disabled:opacity-50"
                    >
                      {savingCard ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CreditCard className="h-3 w-3" />
                      )}
                      Add Payment Method
                    </button>
                  </div>
                )}
              </div>

              {/* How it works */}
              <div className="border border-white/10 p-3 md:p-4">
                <h2 className="text-xs md:text-sm font-semibold mb-2.5">How Auto Top-up Works</h2>
                <div className="space-y-2">
                  {[
                    { step: "1", text: "Set a credit balance threshold (e.g. 100 credits)" },
                    { step: "2", text: "Choose which credit pack to auto-recharge with" },
                    { step: "3", text: "Save a payment method (card, Google Pay, or Apple Pay)" },
                    { step: "4", text: "When your balance drops below the threshold, we auto-charge your saved card and add credits instantly" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-2">
                      <span className="w-4 h-4 shrink-0 flex items-center justify-center bg-red-500/10 text-red-400 text-[9px] font-bold rounded-full">
                        {item.step}
                      </span>
                      <p className="text-[9px] md:text-[10px] text-gray-400 leading-relaxed">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Warning if no card */}
                {!hasCard && !cardLoading && (
                  <div className="flex items-start gap-1.5 p-2 bg-yellow-500/5 border border-yellow-500/20 mt-3">
                    <Info className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                    <p className="text-[9px] md:text-[10px] text-yellow-500/80 leading-relaxed">
                      Auto top-up requires a saved payment method. Add a card or buy credits once to save your card automatically.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== NOTIFICATIONS TAB ==================== */}
        {activeTab === "notifications" && (
          <div className="border border-white/10 p-3 md:p-4">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-3.5 w-3.5 text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[10px] md:text-xs">
                      Low credits balance notification
                    </p>
                    <p className="text-[9px] md:text-[10px] text-gray-500 mt-0.5">
                      Auto email alert when credits fall below your set limit.
                    </p>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={async () => {
                      const newVal = !notificationEnabled;
                      setNotificationEnabled(newVal);
                      if (user) {
                        const { data: existing } = await supabase
                          .from("balance_notification_settings" as any)
                          .select("id")
                          .eq("user_id", user.id)
                          .maybeSingle();
                        const payload = { is_enabled: newVal, threshold: notificationThreshold, updated_at: new Date().toISOString() };
                        if (existing) {
                          await (supabase.from("balance_notification_settings" as any) as any).update(payload).eq("user_id", user.id);
                        } else {
                          await (supabase.from("balance_notification_settings" as any) as any).insert({ user_id: user.id, ...payload });
                        }
                      }
                    }}
                    className="relative cursor-pointer shrink-0 ml-2"
                  >
                    <div
                      className={`w-8 h-[18px] rounded-full transition-colors duration-300 ${
                        notificationEnabled ? "bg-red-500" : "bg-white/10"
                      }`}
                    >
                      <div
                        className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all duration-300 ${
                          notificationEnabled ? "left-[17px]" : "left-[3px]"
                        }`}
                      />
                    </div>
                  </button>
                </div>

                {notificationEnabled && (
                  <div className="mt-2.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[9px] md:text-[10px] text-gray-400 font-medium">
                        Alert when below
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={notificationThreshold}
                        onChange={(e) =>
                          setNotificationThreshold(
                            Math.max(0, parseInt(e.target.value) || 0),
                          )
                        }
                        className="w-16 bg-white/[0.03] border border-white/10 text-white text-[10px] px-2 py-1 focus:outline-none focus:border-red-500/50 transition-colors"
                      />
                      <span className="text-[9px] md:text-[10px] text-gray-500">
                        credits
                      </span>
                      <button
                        disabled={notificationSaving || notificationThreshold <= 0}
                        onClick={handleSaveNotification}
                        className="px-2 py-1 text-[9px] md:text-[10px] border border-white/10 text-gray-400 hover:border-white/20 hover:text-white transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                      >
                        {notificationSaving ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : notificationSaved ? (
                          <>
                            <Check className="h-2.5 w-2.5 text-green-400" />
                            <span className="text-green-400">Saved</span>
                          </>
                        ) : (
                          "Save"
                        )}
                      </button>
                    </div>
                    {notificationSaved && (
                      <p className="text-[8px] md:text-[9px] text-green-400/70 mt-1">
                        You'll receive an email when your balance drops below {notificationThreshold} credits.
                      </p>
                    )}
                  </div>
                )}

                {/* Info */}
                <div className="flex items-start gap-1.5 p-2 bg-white/[0.02] border border-white/5 mt-3">
                  <Info className="h-3 w-3 text-gray-500 mt-0.5 shrink-0" />
                  <p className="text-[9px] md:text-[10px] text-gray-500 leading-relaxed">
                    You'll get one email per 24 hours when your balance is below the threshold. We won't spam you.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function CreditsPage() {
  return (
    <Suspense>
      <CreditsPageInner />
    </Suspense>
  );
}
