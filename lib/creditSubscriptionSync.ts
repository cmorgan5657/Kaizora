import { supabaseAdmin } from "@/lib/supabaseServer";
import {
  buildCreditUpdate,
  getCreditBuckets,
  getPlanMonthlyCredits,
} from "@/lib/creditBuckets";

type CreditSubscriptionRow = {
  user_id: string;
  plan_id: string;
  stripe_subscription_id: string;
  status: string;
  billing_interval: "month" | "year";
  credits_per_cycle: number | null;
  current_period_end: string | null;
  cancel_at_period_end?: boolean | null;
  pending_plan_id?: string | null;
  pending_change_effective_date?: string | null;
};

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function subtractYear(date: Date): Date {
  const prev = new Date(date);
  prev.setUTCFullYear(prev.getUTCFullYear() - 1);
  return prev;
}

function getAnnualWindow(
  periodEndIso: string | null,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  if (!periodEndIso) return null;

  const periodEnd = new Date(periodEndIso);
  if (Number.isNaN(periodEnd.getTime()) || now >= periodEnd) {
    return null;
  }

  let start = subtractYear(periodEnd);
  let end = addMonths(start, 1);

  while (end <= now && end < periodEnd) {
    start = end;
    end = addMonths(start, 1);
  }

  if (end > periodEnd) {
    end = periodEnd;
  }

  return { start, end };
}

async function loadSubscriptionByUserId(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_credit_subscriptions")
    .select(
      "user_id, plan_id, stripe_subscription_id, status, billing_interval, credits_per_cycle, current_period_end, cancel_at_period_end, pending_plan_id, pending_change_effective_date",
    )
    .eq("user_id", userId)
    .in("status", ["active", "past_due", "trialing", "unpaid", "canceled"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as CreditSubscriptionRow | null;
}

async function syncAnnualCreditsForRow(subscription: CreditSubscriptionRow) {
  if (subscription.billing_interval !== "year") {
    return { synced: false, reason: "not_annual" as const };
  }

  const periodEndMs = subscription.current_period_end
    ? new Date(subscription.current_period_end).getTime()
    : null;
  const hasFutureAccess = periodEndMs ? periodEndMs > Date.now() : false;

  if (
    subscription.status === "canceled" &&
    !hasFutureAccess
  ) {
    return { synced: false, reason: "inactive" as const };
  }

  const creditsPerCycle = subscription.credits_per_cycle ?? 0;
  if (creditsPerCycle <= 0) {
    return { synced: false, reason: "no_credits" as const };
  }

  const window = getAnnualWindow(subscription.current_period_end);
  if (!window) {
    return { synced: false, reason: "no_window" as const };
  }

  const marker = `subcycle:${subscription.stripe_subscription_id}:${window.start.toISOString().slice(0, 10)}`;
  const { data: existingTx } = await supabaseAdmin
    .from("credit_transactions")
    .select("id")
    .eq("stripe_session_id", marker)
    .maybeSingle();

  if (existingTx) {
    return { synced: false, reason: "already_current" as const };
  }

  const { data: creditsRow } = await supabaseAdmin
    .from("user_credits")
    .select(
      "balance, total_purchased, total_spent, subscription_credits, purchased_credits",
    )
    .eq("user_id", subscription.user_id)
    .maybeSingle();

  const buckets = getCreditBuckets(creditsRow);
  if (creditsRow) {
    await supabaseAdmin
      .from("user_credits")
      .update({
        ...buildCreditUpdate(creditsPerCycle, buckets.purchasedCredits),
      })
      .eq("user_id", subscription.user_id);
  } else {
    await supabaseAdmin.from("user_credits").insert({
      user_id: subscription.user_id,
      ...buildCreditUpdate(creditsPerCycle, 0),
      total_purchased: 0,
      total_spent: 0,
    });
  }

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: subscription.user_id,
    amount: creditsPerCycle,
    type: "purchase",
    action: "subscription_monthly_refresh",
    description: `Refreshed monthly credits for ${subscription.plan_id} annual subscription`,
    stripe_session_id: marker,
  });

  return {
    synced: true,
    reason: "refreshed" as const,
    expiresAt: window.end.toISOString(),
    credits: creditsPerCycle,
  };
}

export async function applyPendingPlanChangeIfDue(
  subscription: CreditSubscriptionRow,
  now: Date = new Date(),
) {
  if (
    !subscription.pending_plan_id ||
    !subscription.pending_change_effective_date
  ) {
    return { applied: false, effectivePlanId: subscription.plan_id };
  }

  const effectiveDate = new Date(subscription.pending_change_effective_date);
  if (Number.isNaN(effectiveDate.getTime()) || effectiveDate > now) {
    return { applied: false, effectivePlanId: subscription.plan_id };
  }

  const nextCredits = getPlanMonthlyCredits(
    subscription.pending_plan_id,
    subscription.credits_per_cycle,
  );
  const { data: creditsRow } = await supabaseAdmin
    .from("user_credits")
    .select("subscription_credits, purchased_credits, balance")
    .eq("user_id", subscription.user_id)
    .maybeSingle();

  const buckets = getCreditBuckets(creditsRow);

  await supabaseAdmin
    .from("user_credits")
    .update(buildCreditUpdate(nextCredits, buckets.purchasedCredits))
    .eq("user_id", subscription.user_id);

  await supabaseAdmin
    .from("user_credit_subscriptions")
    .update({
      plan_id: subscription.pending_plan_id,
      credits_per_cycle: nextCredits,
      pending_plan_id: null,
      pending_change_effective_date: null,
      updated_at: now.toISOString(),
    })
    .eq("stripe_subscription_id", subscription.stripe_subscription_id);

  return { applied: true, effectivePlanId: subscription.pending_plan_id };
}

export async function syncAnnualSubscriptionCreditsByUserId(userId: string) {
  const subscription = await loadSubscriptionByUserId(userId);
  if (!subscription) {
    return { synced: false, reason: "no_subscription" as const };
  }

  return syncAnnualCreditsForRow(subscription);
}

export async function syncAnnualSubscriptionCreditsForRow(
  subscription: CreditSubscriptionRow,
) {
  return syncAnnualCreditsForRow(subscription);
}
