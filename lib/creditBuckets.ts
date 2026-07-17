export const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  starter: 200,
  creator: 700,
  pro: 1300,
};

export type CreditBuckets = {
  subscriptionCredits: number;
  purchasedCredits: number;
  totalBalance: number;
};

type CreditRowLike = {
  subscription_credits?: number | null;
  purchased_credits?: number | null;
  balance?: number | null;
  total_purchased?: number | null;
};

export function normalizePlanKey(planId: string | null | undefined) {
  return (planId || "").trim().toLowerCase();
}

export function getPlanMonthlyCredits(
  planId: string | null | undefined,
  fallbackCredits?: number | null,
) {
  const normalized = normalizePlanKey(planId);
  if (normalized in PLAN_MONTHLY_CREDITS) {
    return PLAN_MONTHLY_CREDITS[normalized];
  }

  return Number(fallbackCredits) > 0 ? Number(fallbackCredits) : 0;
}

export function getCreditBuckets(row: CreditRowLike | null | undefined): CreditBuckets {
  if (!row) {
    return {
      subscriptionCredits: 0,
      purchasedCredits: 0,
      totalBalance: 0,
    };
  }

  const hasExplicitBuckets =
    row.subscription_credits != null || row.purchased_credits != null;

  const subscriptionCredits = hasExplicitBuckets
    ? Math.max(0, Number(row.subscription_credits || 0))
    : 0;
  const purchasedCredits = hasExplicitBuckets
    ? Math.max(0, Number(row.purchased_credits || 0))
    : Math.max(0, Number(row.balance || 0));

  return {
    subscriptionCredits,
    purchasedCredits,
    totalBalance: subscriptionCredits + purchasedCredits,
  };
}

export function buildCreditUpdate(
  subscriptionCredits: number,
  purchasedCredits: number,
) {
  const safeSubscriptionCredits = Math.max(0, subscriptionCredits);
  const safePurchasedCredits = Math.max(0, purchasedCredits);

  return {
    subscription_credits: safeSubscriptionCredits,
    purchased_credits: safePurchasedCredits,
    balance: safeSubscriptionCredits + safePurchasedCredits,
    updated_at: new Date().toISOString(),
  };
}
