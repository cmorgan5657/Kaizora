-- Top Up packs → tier-based duration + visibility
-- Run once in the Supabase SQL editor.

-- Each pack has a tier that sets BOTH its credit validity and who sees it:
--   'month' → credits valid 30 days,  shown to monthly + annual subscribers
--   'year'  → credits valid 365 days, shown to annual subscribers only
alter table credit_packs add column if not exists tier text;

-- Keep existing packs as monthly (30-day) by default.
update credit_packs set tier = 'month' where tier is null;

-- (Optional cleanup if you ran the earlier boolean version.)
alter table credit_packs drop column if exists available_monthly;
alter table credit_packs drop column if exists available_annual;
