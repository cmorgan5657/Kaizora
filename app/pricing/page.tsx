"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Brain,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  Image,
  Loader2,
  Music,
  RefreshCw,
  Video,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_PRICING_FAQS, type PricingFaq } from "@/lib/pricingFaqs";

type AvailableCode = {
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  firstTimeOnly: boolean;
};

type ValidateResult = {
  valid: boolean;
  eligible?: boolean;
  code?: string;
  percentOff?: number | null;
  amountOff?: number | null;
  firstTimeOnly?: boolean;
  error?: string;
};

type BillingView = "month" | "year";

interface Plan {
  id: string;
  name: string;
  price: number;
  credits: number;
  description: string | null;
  features: string[];
  popular?: boolean;
  active?: boolean;
  billing_interval: BillingView;
  discount_percent: number;
}

interface ActionCost {
  id: string;
  action: string;
  credits: number;
  note: string;
  icon: string;
}

interface CreditSubscription {
  id: string;
  plan_id: string;
  plan_name: string;
  price: number | null;
  credits: number;
  billing_interval: BillingView;
  discount_percent: number;
  status: string;
  stripe_subscription_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Brain,
  RefreshCw,
  Zap,
  Video,
  Music,
  Image,
  BookOpen,
};

function discountLabel(
  percentOff: number | null | undefined,
  amountOff: number | null | undefined,
): string {
  if (percentOff) return `${percentOff}% off`;
  if (amountOff) return `$${(amountOff / 100).toFixed(2)} off`;
  return "";
}

function FaqItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/5">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 md:py-4 text-left cursor-pointer group"
      >
        <span
          className={`text-xs md:text-sm font-medium transition-colors ${
            isOpen ? "text-white" : "text-gray-300 group-hover:text-white"
          }`}
        >
          {question}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          isOpen ? "max-h-40 pb-3 md:pb-4" : "max-h-0"
        }`}
      >
        <p className="text-[10px] md:text-sm text-gray-500 font-light leading-relaxed">
          {answer}
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  currentSubscription,
  appliedCoupon,
  loading,
  onSelectPlan,
}: {
  plan: Plan;
  currentSubscription: CreditSubscription | null;
  appliedCoupon: {
    code: string;
    percentOff: number | null;
    amountOff: number | null;
  } | null;
  loading: boolean;
  onSelectPlan: (plan: Plan) => void;
}) {
  const discountedPrice = appliedCoupon
    ? appliedCoupon.percentOff
      ? plan.price * (1 - appliedCoupon.percentOff / 100)
      : appliedCoupon.amountOff
        ? Math.max(0, plan.price - appliedCoupon.amountOff / 100)
        : plan.price
    : plan.price;
  const isAnnual = plan.billing_interval === "year";
  const isCurrent = currentSubscription?.plan_id === plan.id;
  const currentPlanPrice = currentSubscription?.price ?? null;
  const currentPlanCredits = currentSubscription?.credits ?? null;
  const isHigherTier = currentSubscription
    ? currentPlanPrice !== null
      ? plan.price > currentPlanPrice
      : currentPlanCredits !== null
        ? plan.credits > currentPlanCredits
        : false
    : false;
  const isLowerTier = currentSubscription
    ? currentPlanPrice !== null
      ? plan.price < currentPlanPrice
      : currentPlanCredits !== null
        ? plan.credits < currentPlanCredits
        : false
    : false;
  const annualMonthlyEquivalent = isAnnual ? plan.price / 12 : null;
  const annualOriginalPrice =
    isAnnual && plan.discount_percent > 0 && plan.discount_percent < 100
      ? plan.price / (1 - plan.discount_percent / 100)
      : plan.price;
  const annualSavings = Math.max(0, annualOriginalPrice - plan.price);
  const originalPrice = isAnnual && plan.discount_percent > 0
    ? annualOriginalPrice
    : plan.price;

  const buttonDisabled = loading || isCurrent;
  const isPlanChangeAction = !!currentSubscription && !isCurrent;
  const buttonLabel = loading
    ? "Redirecting..."
    : isCurrent
      ? "Current Plan"
      : currentSubscription
        ? isHigherTier
          ? `Upgrade to ${plan.name}`
          : isLowerTier
            ? `Downgrade to ${plan.name}`
            : `Change to ${plan.name}`
        : `Subscribe to ${plan.name}`;

  return (
    <div
      className={`relative flex flex-col border p-5 md:p-6 transition-all duration-300 ${
        plan.popular
          ? "border-red-500/60 bg-red-500/[0.03]"
          : "border-white/10 hover:border-white/20"
      }`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[9px] md:text-[10px] px-2.5 py-1 bg-black text-red-400 uppercase tracking-wider font-medium border border-red-500/30">
            Most creators choose this
          </span>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base md:text-lg font-semibold text-white">
            {plan.name}
          </h3>
          {isAnnual && plan.discount_percent > 0 && (
            <span className="text-[10px] md:text-xs text-gray-400">
              Save {plan.discount_percent}%
            </span>
          )}
          {isCurrent && (
            <span className="text-[9px] md:text-[10px] px-2 py-1 bg-white/5 text-gray-300 uppercase tracking-wider font-medium border border-white/10">
              Current Plan
            </span>
          )}
        </div>
        <p className="mt-1 text-[10px] md:text-xs text-gray-500">
          {plan.description}
        </p>
      </div>

      <div className="mb-1 flex items-end gap-2">
        <span className="text-3xl md:text-4xl font-bold text-white">
          ${discountedPrice.toFixed(2)}
        </span>
        <span className="text-xs md:text-sm text-gray-500 mb-1">
          /{isAnnual ? "year" : "month"}
        </span>
        {(appliedCoupon || (isAnnual && plan.discount_percent > 0)) && (
          <span className="text-sm md:text-base font-medium text-gray-500 line-through mb-1">
            ${originalPrice.toFixed(2)}
          </span>
        )}
      </div>

      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs md:text-sm font-semibold text-red-400 bg-red-500/10 px-2 py-0.5">
          {plan.credits.toLocaleString()} credits
        </span>
      </div>

      {isAnnual && (
        <div className="mb-4 text-[10px] md:text-xs text-gray-500">
          ${annualMonthlyEquivalent?.toFixed(2)}/mo
          {annualSavings > 0 && (
            <span className="ml-2">Save ${annualSavings.toFixed(2)}/year</span>
          )}
        </div>
      )}

      <ul className="mb-6 flex-1 space-y-2.5">
        {plan.features.map((feature, idx) => (
          <li
            key={idx}
            className="flex items-start gap-2 text-[11px] md:text-sm text-gray-300"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {appliedCoupon && (
          <p className="mb-1.5 text-center text-[10px] text-emerald-400">
            {appliedCoupon.code} ·{" "}
            {discountLabel(appliedCoupon.percentOff, appliedCoupon.amountOff)} applied
          </p>
        )}
        <button
          onClick={() => onSelectPlan(plan)}
          disabled={buttonDisabled}
          className={`w-full py-2.5 text-xs md:text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            plan.popular
              ? "bg-red-600 hover:bg-red-500 text-white"
              : isPlanChangeAction
                ? "border border-white/10 text-gray-400 hover:border-red-500 hover:bg-red-600 hover:text-white"
              : "border border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Redirecting...
            </>
          ) : (
            buttonLabel
          )}
        </button>
      </div>
    </div>
  );
}

function PricingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [billingView, setBillingView] = useState<BillingView>("month");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [faqs, setFaqs] = useState<PricingFaq[]>(DEFAULT_PRICING_FAQS);
  const [monthlyPlans, setMonthlyPlans] = useState<Plan[]>([]);
  const [annualPlans, setAnnualPlans] = useState<Plan[]>([]);
  const [actionCosts, setActionCosts] = useState<ActionCost[]>([]);
  const [currentSubscription, setCurrentSubscription] =
    useState<CreditSubscription | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [availableCodes, setAvailableCodes] = useState<AvailableCode[]>([]);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    percentOff: number | null;
    amountOff: number | null;
  } | null>(null);

  const visiblePlans =
    billingView === "year" ? annualPlans : monthlyPlans;

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  };

  const fetchPricing = async () => {
    try {
      const [plansRes, costsRes] = await Promise.all([
        fetch("/api/admin/plans"),
        fetch("/api/admin/pricing"),
      ]);
      const plansData = await plansRes.json();
      const costsData = await costsRes.json();

      const activePlans = (plansData.plans || []).filter(
        (p: Plan) => p.active !== false,
      );
      setMonthlyPlans(
        activePlans.filter((p: Plan) => p.billing_interval === "month"),
      );
      setAnnualPlans(
        activePlans.filter((p: Plan) => p.billing_interval === "year"),
      );
      setActionCosts(costsData.costs || []);
    } catch {
      // silent
    } finally {
      setPageLoading(false);
    }
  };

  const fetchFaqs = async () => {
    try {
      const res = await fetch("/api/admin/pricing-faqs");
      const data = await res.json();
      setFaqs(data.faqs || DEFAULT_PRICING_FAQS);
    } catch {
      setFaqs(DEFAULT_PRICING_FAQS);
    }
  };

  const fetchCurrentSubscription = async () => {
    const token = await getAccessToken();
    if (!token) {
      setCurrentSubscription(null);
      return;
    }

    try {
      const res = await fetch("/api/credits/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCurrentSubscription(data.subscription || null);
    } catch {
      setCurrentSubscription(null);
    }
  };

  useEffect(() => {
    fetchPricing();
    fetchCurrentSubscription();
    fetchFaqs();

    (async () => {
      const token = await getAccessToken();
      const r = await fetch("/api/credits/discounts", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const d = await r.json();
      setAvailableCodes(d.codes || []);
    })().catch(() => {});

    const plansSub = supabase
      .channel("pricing-plans")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_plans" },
        () => fetchPricing(),
      )
      .subscribe();

    const costsSub = supabase
      .channel("pricing-costs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_action_costs" },
        () => fetchPricing(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(plansSub);
      supabase.removeChannel(costsSub);
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("sub_success") === "true") {
      setToast({
        type: "success",
        message: "Subscription started successfully.",
      });
      fetchCurrentSubscription();
      router.replace("/pricing");
    } else if (searchParams.get("sub_cancelled") === "true") {
      setToast({
        type: "error",
        message: "Checkout cancelled. No charge was made.",
      });
      router.replace("/pricing");
    } else if (searchParams.get("credit_success") === "true") {
      setToast({
        type: "success",
        message: "Credits purchased successfully! Your balance has been updated.",
      });
      router.replace("/pricing");
    } else if (searchParams.get("credit_cancelled") === "true") {
      setToast({
        type: "error",
        message: "Payment cancelled. No charge was made.",
      });
      router.replace("/pricing");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const applyCoupon = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || couponChecking) return;
    setCouponChecking(true);
    setCouponError(null);

    let res: ValidateResult;
    try {
      const token = await getAccessToken();
      const r = await fetch("/api/credits/validate-coupon", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code }),
      });
      res = await r.json();
    } catch {
      res = { valid: false, error: "Could not validate code" };
    }
    setCouponChecking(false);

    if (!res.valid) {
      setAppliedCoupon(null);
      setCouponError(res.error || "Invalid code");
    } else if (res.eligible === false) {
      setAppliedCoupon(null);
      setCouponError("Not eligible - first purchase only");
    } else {
      setAppliedCoupon({
        code,
        percentOff: res.percentOff ?? null,
        amountOff: res.amountOff ?? null,
      });
      setCouponError(null);
    }
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError(null);
  };

  const handleSubscribe = async (planId: string) => {
    const token = await getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setLoadingPlan(planId);
    try {
      const res = await fetch("/api/credits/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId,
          couponCode: appliedCoupon?.code,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Something went wrong",
      });
      setLoadingPlan(null);
    }
  };

  const handlePlanSelection = (plan: Plan) => {
    if (currentSubscription && currentSubscription.plan_id !== plan.id) {
      router.push("/credits");
      return;
    }

    void handleSubscribe(plan.id);
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 border text-sm font-medium shadow-lg backdrop-blur-sm transition-all duration-500 ${
            toast.type === "success"
              ? "bg-green-500/15 border-green-500/30 text-green-400"
              : "bg-red-500/15 border-red-500/30 text-red-400"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className="ml-2 hover:opacity-70 transition-opacity cursor-pointer"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 md:px-6 pt-8 md:pt-16 pb-8 md:pb-20">
        <div className="mb-6 md:mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="text-center md:text-left">
            <h1 className="text-xl md:text-3xl font-bold">
              Power your creative pipeline
            </h1>
            <p className="mt-2 text-[11px] md:text-sm text-gray-500">
              Credits scale with you — upgrade, downgrade, or cancel anytime.
            </p>
          </div>

          <div className="flex justify-center md:justify-end">
            <div className="relative inline-grid grid-cols-2 border border-white/10 p-0.5 bg-white/[0.02]">
              <span
                aria-hidden="true"
                className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-red-600 transition-all duration-300 ease-out ${
                  billingView === "month" ? "left-0.5" : "left-[calc(50%+1px)]"
                }`}
              />
              <button
                onClick={() => setBillingView("month")}
                className={`relative z-10 px-3 py-1.5 text-[11px] md:text-xs transition-colors duration-300 cursor-pointer ${
                  billingView === "month"
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingView("year")}
                className={`relative z-10 px-3 py-1.5 text-[11px] md:text-xs transition-colors duration-300 cursor-pointer ${
                  billingView === "year"
                    ? "text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Annual
              </button>
            </div>
          </div>
        </div>

        {currentSubscription && (
          <div className="mb-6 md:mb-8 border border-white/10 p-4 text-center">
            <p className="text-xs md:text-sm text-white">
              Current plan: <span className="font-semibold">{currentSubscription.plan_name}</span>
            </p>
            {currentSubscription.current_period_end && (
              <p className="mt-1 text-[10px] md:text-xs text-gray-500">
                {currentSubscription.cancel_at_period_end ? "Access ends" : "Renews"} on{" "}
                {new Date(currentSubscription.current_period_end).toLocaleDateString()}
              </p>
            )}
            <button
              onClick={() => router.push("/credits")}
              className="mt-3 px-4 py-2 text-xs border border-white/10 text-gray-300 hover:text-white hover:border-white/20 transition-colors cursor-pointer"
            >
              Manage in Credits
            </button>
          </div>
        )}

        <div className="grid gap-3 md:gap-6 md:grid-cols-3">
          {visiblePlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentSubscription={currentSubscription}
              appliedCoupon={appliedCoupon}
              loading={loadingPlan === plan.id}
              onSelectPlan={handlePlanSelection}
            />
          ))}
        </div>

        {visiblePlans.length === 0 && (
          <div className="border border-white/10 p-8 text-center text-sm text-gray-500">
            No {billingView === "year" ? "annual" : "monthly"} plans are active yet.
          </div>
        )}

        <div className="mt-5 md:mt-6 flex flex-col items-center text-center">
          {appliedCoupon ? (
            <div className="inline-flex items-center gap-2 px-3 py-2 border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono">{appliedCoupon.code}</span>
              <span>
                · {discountLabel(appliedCoupon.percentOff, appliedCoupon.amountOff)} applied
              </span>
              <button
                onClick={clearCoupon}
                className="ml-1 text-emerald-400/70 hover:text-emerald-300 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : !couponOpen ? (
            <button
              onClick={() => setCouponOpen(true)}
              className="text-xs text-gray-400 hover:text-white underline underline-offset-2 cursor-pointer"
            >
              Have a discount code?
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm space-y-2"
            >
              <div className="flex justify-center gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && applyCoupon(couponInput)}
                  placeholder="Enter code"
                  className="w-44 bg-white/[0.03] border border-white/10 px-3 py-2 text-xs text-white font-mono uppercase placeholder:normal-case focus:outline-none focus:border-red-500/50"
                />
                <button
                  onClick={() => applyCoupon(couponInput)}
                  disabled={couponChecking}
                  className="px-4 py-2 text-xs bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50"
                >
                  {couponChecking ? "..." : "Apply"}
                </button>
              </div>
              {couponError && (
                <p className="flex items-center justify-center gap-1 text-[11px] text-amber-400">
                  <XCircle className="h-3 w-3" />
                  {couponError}
                </p>
              )}
              {availableCodes.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {availableCodes.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => {
                        setCouponInput(c.code);
                        applyCoupon(c.code);
                      }}
                      className="px-2 py-0.5 text-[10px] font-mono border border-white/15 text-gray-300 hover:border-red-500/40 hover:text-white transition-colors cursor-pointer"
                    >
                      {c.code} · {discountLabel(c.percentOff, c.amountOff)}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>

        <div className="mt-12 md:mt-20">
          <h2 className="text-base md:text-xl font-semibold text-center mb-1 md:mb-2">
            What do credits cost?
          </h2>

          <div className="border border-white/10 overflow-hidden">
            {actionCosts.map((item, idx) => {
              const Icon = ICON_MAP[item.icon] || Zap;
              return (
                <div
                  key={item.id || idx}
                  className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-b border-white/5"
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-red-500" />
                    <div>
                      <p className="text-[10px] md:text-sm font-medium">
                        {item.note}
                      </p>
                      <p className="text-[8px] md:text-xs text-gray-600">
                        {item.action.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className="text-[9px] md:text-xs px-1.5 md:px-2 py-0.5 bg-white/5 text-gray-300 font-semibold">
                      {item.credits} credits
                    </span>
                  </div>
                </div>
              );
            })}

            {[
              {
                icon: BookOpen,
                label: "Upload & Save Assets",
                note: "Store content in your vault",
              },
            ].map((item, idx, arr) => {
              const Icon = item.icon;
              return (
                <div
                  key={`free-${idx}`}
                  className={`flex items-center justify-between px-3 md:px-6 py-3 md:py-4 ${
                    idx !== arr.length - 1 ? "border-b border-white/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <Icon className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-red-500" />
                    <div>
                      <p className="text-[10px] md:text-sm font-medium">
                        {item.label}
                      </p>
                      <p className="text-[8px] md:text-xs text-gray-600">
                        {item.note}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className="text-[9px] md:text-xs px-1.5 md:px-2 py-0.5 bg-red-500/15 text-red-400 font-semibold">
                      Free
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 md:mt-10 border border-white/10 p-4 md:p-6 text-center">
          <h2 className="text-sm md:text-lg font-semibold mb-1 md:mb-2">
            Marketplace Fees
          </h2>
          <p className="text-[10px] md:text-sm text-gray-500 leading-relaxed">
            Platform takes a percentage of completed sales. No publishing fees.
            No upfront selling costs.
          </p>
          <p className="mt-2 md:mt-3 text-[10px] md:text-sm font-medium text-red-400">
            KAIZORA only makes money when creators do.
          </p>
        </div>

        <div className="mt-6 md:mt-10">
          <h2 className="text-base md:text-xl font-semibold text-center mb-4 md:mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-0">
            {faqs.map((faq, idx) => (
              <FaqItem
                key={faq.id}
                question={faq.question}
                answer={faq.answer}
                isOpen={openFaq === idx}
                onToggle={() => setOpenFaq(openFaq === idx ? null : idx)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingPageInner />
    </Suspense>
  );
}
