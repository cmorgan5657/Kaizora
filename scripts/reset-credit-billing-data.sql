begin;

-- Credit purchase / usage history
delete from public.credit_transactions;

-- Current credit balances and expiry state
delete from public.user_credits;

-- Recurring credit subscription state
delete from public.user_credit_subscriptions;

-- Optional credit automation state
delete from public.auto_topup_settings;
delete from public.balance_notification_settings;

-- Webhook history used during billing tests
delete from public.webhook_logs
where event_type in (
  'checkout.session.completed',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'test.manual'
);

commit;

-- Notes:
-- 1. This keeps catalog/config tables like credit_packs, credit_plans,
--    credit_action_costs, and discounts intact.
-- 2. This does not cancel live Stripe subscriptions or delete Stripe customers.
--    It only resets database state.
