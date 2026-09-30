-- ═══════════════════════════════════════════════════════════════════════════
-- 017 — A school's plan is always Basic, Standard, Premium or Enterprise
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
--  • The plan column was first created as a fixed list holding the old launch
--    plan names. It becomes plain text limited to the four current plans.
--  • A school whose plan is blank or not one of the four becomes Basic; the
--    old middle plan ('growth') becomes Standard.
--  • The plan can never be blank again: new schools default to Basic, and
--    the database refuses any other value.
-- The last statement lists how many schools are on each plan.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Any column still using the old fixed list becomes plain text
DO $do$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'USER-DEFINED' AND udt_name = 'subscription_tier'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', c.table_name, c.column_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE text USING %I::text', c.table_name, c.column_name, c.column_name);
  END LOOP;
END $do$;

-- The old list is no longer used anywhere
DROP TYPE IF EXISTS subscription_tier;

-- 2. Every school gets a valid plan
UPDATE schools SET subscription_tier = 'standard' WHERE subscription_tier = 'growth';
UPDATE schools SET subscription_tier = 'basic'
WHERE subscription_tier IS NULL OR subscription_tier NOT IN ('basic', 'standard', 'premium', 'enterprise');

-- 3. ...and keeps one
ALTER TABLE schools ALTER COLUMN subscription_tier SET DEFAULT 'basic';
ALTER TABLE schools ALTER COLUMN subscription_tier SET NOT NULL;
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_subscription_tier_valid;
ALTER TABLE schools ADD CONSTRAINT schools_subscription_tier_valid
  CHECK (subscription_tier IN ('basic', 'standard', 'premium', 'enterprise'));

COMMIT;

SELECT subscription_tier AS plan, COUNT(*) AS schools FROM schools GROUP BY 1 ORDER BY 1;
