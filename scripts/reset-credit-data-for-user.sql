begin;

-- Replace this with the account you want to reset.
with target_user as (
  select id
  from auth.users
  where email = 'test@example.com'
)
delete from public.credit_transactions
where user_id in (select id from target_user);

with target_user as (
  select id
  from auth.users
  where email = 'test@example.com'
)
delete from public.user_credit_subscriptions
where user_id in (select id from target_user);

with target_user as (
  select id
  from auth.users
  where email = 'test@example.com'
)
delete from public.user_credits
where user_id in (select id from target_user);

with target_user as (
  select id
  from auth.users
  where email = 'test@example.com'
)
delete from public.auto_topup_settings
where user_id in (select id from target_user);

with target_user as (
  select id
  from auth.users
  where email = 'test@example.com'
)
delete from public.balance_notification_settings
where user_id in (select id from target_user);

commit;

-- This resets the numbers shown on /credits for one account:
-- - Current balance
-- - Purchased
-- - Spent
-- It does not touch plan definitions or other users.
