-- Split credits into two buckets:
-- 1. subscription_credits: resets each billing cycle
-- 2. purchased_credits: never expires, survives plan changes
--
-- Also add pending downgrade fields on subscriptions.

alter table public.user_credits
  add column if not exists subscription_credits integer not null default 0,
  add column if not exists purchased_credits integer not null default 0;

-- Preserve existing balances conservatively by treating legacy balances as
-- purchased credits during migration. This avoids accidental loss.
update public.user_credits
set
  purchased_credits = greatest(coalesce(balance, 0), coalesce(purchased_credits, 0)),
  subscription_credits = coalesce(subscription_credits, 0),
  balance = greatest(coalesce(balance, 0), coalesce(purchased_credits, 0))
where purchased_credits = 0
  and subscription_credits = 0
  and coalesce(balance, 0) > 0;

alter table public.user_credit_subscriptions
  add column if not exists pending_plan_id text,
  add column if not exists pending_change_effective_date timestamptz;
