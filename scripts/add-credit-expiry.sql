-- ============================================================================
-- Credit expiry: single rolling expiry, 30 days flat.
-- All of a user's credits share ONE expiry date = latest top-up + 30 days.
-- Buying credits resets the whole balance's expiry to now() + 30 days.
-- Run this in your Supabase SQL editor.
-- ============================================================================

-- 1. Add the expiry column to user_credits.
ALTER TABLE user_credits
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. Backfill existing balances: give current holders 30 days from now so we
--    don't wipe anyone the moment this ships. (Zero-balance rows stay null.)
UPDATE user_credits
SET expires_at = NOW() + INTERVAL '30 days'
WHERE balance > 0 AND expires_at IS NULL;

-- 3. Daily expiry job: zero out balances whose expiry has passed and log a
--    transaction so it shows up in the user's history. The app also treats an
--    expired balance as 0 at read time, so this is mainly data hygiene + audit.
CREATE OR REPLACE FUNCTION expire_credits()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  expired_count integer := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT user_id, balance
    FROM user_credits
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND balance > 0
  LOOP
    INSERT INTO credit_transactions (user_id, amount, type, action, description)
    VALUES (rec.user_id, rec.balance, 'expiry', 'credit_expiry',
            'Credits expired (' || rec.balance || ' credits)');

    UPDATE user_credits
    SET balance = 0, updated_at = NOW()
    WHERE user_id = rec.user_id;

    expired_count := expired_count + 1;
  END LOOP;

  RETURN expired_count;
END;
$$;

-- 4. Schedule it daily (requires the pg_cron extension; enable in Supabase
--    Dashboard → Database → Extensions). Runs every day at 00:05 UTC.
--    If pg_cron is unavailable, call expire_credits() from a daily cron/Edge
--    Function instead.
-- SELECT cron.schedule('expire-credits-daily', '5 0 * * *', 'SELECT expire_credits();');
