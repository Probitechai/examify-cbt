-- ═══════════════════════════════════════════════════════════════════════════
-- 016 — Settlement ledger and platform revenue
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
--  • schools.platform_fee_percent — Probitechai's share of each online payment
--    (default 0.4%), set per school by Super Admin.
--  • platform_collections — one row per successful Paystack collection (school
--    fees and acceptance fees): amount, Paystack's fee, Probitechai's share,
--    and whether Paystack paid the school directly or the money came to
--    Probitechai and is owed to the school.
--  • school_payouts — transfers Probitechai makes to a school. Append-only;
--    a mistaken payout is voided with a reason, never deleted or edited.
-- Collections are recorded from this migration onward (earlier payments were
-- in test mode).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- Subscriptions record the Paystack mode too, so test payments stay out of revenue
DO $do$ BEGIN
  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS paystack_mode text;
  END IF;
END $do$;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS platform_fee_percent numeric(5,2) NOT NULL DEFAULT 0.40;
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_platform_fee_range;
ALTER TABLE schools ADD CONSTRAINT schools_platform_fee_range CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 10);

CREATE TABLE IF NOT EXISTS platform_collections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id),
  source          text NOT NULL CHECK (source IN ('school_fee', 'admission_fee')),
  reference       text NOT NULL UNIQUE,              -- Paystack reference
  fee_payment_id  uuid REFERENCES fee_payments(id),  -- school fees only
  routed_via      text NOT NULL CHECK (routed_via IN ('direct', 'probitechai')),
  paystack_mode   text NOT NULL CHECK (paystack_mode IN ('live', 'test', 'unset')),
  amount          numeric(14,2) NOT NULL CHECK (amount >= 0),   -- what the parent paid
  paystack_fee    numeric(14,2) NOT NULL DEFAULT 0,             -- Paystack's charge
  fee_estimated   boolean NOT NULL DEFAULT false,               -- true if Paystack didn't report it
  platform_fee    numeric(14,2) NOT NULL DEFAULT 0,             -- Probitechai's share
  platform_rate   numeric(5,2) NOT NULL,                        -- % applied
  school_share    numeric(14,2) NOT NULL,                       -- amount - paystack_fee - platform_fee
  collected_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collections_school ON platform_collections (school_id, collected_at);

CREATE TABLE IF NOT EXISTS school_payouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES schools(id),
  amount       numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on      date NOT NULL,
  bank_reference text NOT NULL CHECK (length(trim(bank_reference)) >= 3),
  note         text,
  recorded_by  uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  voided_at    timestamptz,
  voided_by    uuid,
  void_reason  text,
  CHECK (voided_at IS NULL OR length(trim(coalesce(void_reason, ''))) >= 5)
);
CREATE INDEX IF NOT EXISTS idx_payouts_school ON school_payouts (school_id, paid_on);

-- Payouts can't be deleted, and only the void fields can change (once)
CREATE OR REPLACE FUNCTION school_payouts_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payouts cannot be deleted; void them instead';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'This payout is already voided';
  END IF;
  IF NEW.school_id <> OLD.school_id OR NEW.amount <> OLD.amount OR NEW.paid_on <> OLD.paid_on
     OR NEW.bank_reference <> OLD.bank_reference OR NEW.recorded_by <> OLD.recorded_by
     OR NEW.created_at <> OLD.created_at OR coalesce(NEW.note, '') <> coalesce(OLD.note, '') THEN
    RAISE EXCEPTION 'Payouts cannot be edited; void and record again';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_school_payouts_guard ON school_payouts;
CREATE TRIGGER trg_school_payouts_guard BEFORE UPDATE OR DELETE ON school_payouts
  FOR EACH ROW EXECUTE FUNCTION school_payouts_guard();

-- Collections are facts from Paystack: never edited or deleted
CREATE OR REPLACE FUNCTION platform_collections_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'Collection records cannot be changed or deleted';
END $fn$;
DROP TRIGGER IF EXISTS trg_platform_collections_guard ON platform_collections;
CREATE TRIGGER trg_platform_collections_guard BEFORE UPDATE OR DELETE ON platform_collections
  FOR EACH ROW EXECUTE FUNCTION platform_collections_guard();

ALTER TABLE platform_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_collections ON platform_collections;
CREATE POLICY tenant_isolation_collections ON platform_collections
  USING (school_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE school_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_payouts ON school_payouts;
CREATE POLICY tenant_isolation_payouts ON school_payouts
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

COMMIT;
