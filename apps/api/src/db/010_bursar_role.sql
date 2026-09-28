-- ═══════════════════════════════════════════════════════════════════════════
-- 010 — Bursar role, append-only fee records, waivers, reversals, audit log
-- Run in the Supabase SQL editor in THREE separate runs:
--   PART A (checks)  → read-only, run first and review the output
--   PART B (enum)    → run on its own
--   PART C (main)    → one transaction
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PART A — READ-ONLY CHECKS (change nothing)
-- ───────────────────────────────────────────────────────────────────────────
-- a) Does the DB user bypass RLS?
-- SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
--
-- b) fee_payments columns
-- SELECT column_name, data_type, udt_name, column_default, is_nullable
-- FROM information_schema.columns WHERE table_name = 'fee_payments' ORDER BY ordinal_position;
--
-- c) Constraints on fee_payments and FKs pointing at fee_structures
-- SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'fee_payments'::regclass OR confrelid = 'fee_structures'::regclass;
--
-- d) Status / method values in use
-- SELECT status, payment_method, COUNT(*) FROM fee_payments GROUP BY 1, 2 ORDER BY 1, 2;
--
-- e) Duplicate receipt numbers already issued
-- SELECT school_id, receipt_number, COUNT(*) FROM fee_payments
-- WHERE receipt_number <> 'PENDING' GROUP BY 1, 2 HAVING COUNT(*) > 1;


-- ───────────────────────────────────────────────────────────────────────────
-- PART B — ADD THE ROLE (run on its own; a new enum value can't be used in
-- the same transaction that adds it)
-- ───────────────────────────────────────────────────────────────────────────
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'bursar';


-- ───────────────────────────────────────────────────────────────────────────
-- PART C — MAIN MIGRATION
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

-- 1. Payment status + methods ─────────────────────────────────────────────
-- Production already has status NOT NULL DEFAULT 'success' (checked 2026-09-28);
-- these are no-ops there and kept for fresh environments.
UPDATE fee_payments SET status = 'success' WHERE status IS NULL;
ALTER TABLE fee_payments ALTER COLUMN status SET DEFAULT 'success';
ALTER TABLE fee_payments ALTER COLUMN status SET NOT NULL;

-- Allow POS as a manual payment method
ALTER TABLE fee_payments DROP CONSTRAINT IF EXISTS fee_payments_payment_method_check;
ALTER TABLE fee_payments ADD CONSTRAINT fee_payments_payment_method_check
  CHECK (payment_method IN ('cash','bank_transfer','pos','card','cheque','paystack'));

-- 2. Atomic receipt numbers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_counters (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year      int  NOT NULL,
  last_no   int  NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, year)
);

-- Seed from the highest number already issued so new receipts never collide
INSERT INTO receipt_counters (school_id, year, last_no)
SELECT school_id,
       split_part(receipt_number, '-', 3)::int,
       MAX(split_part(receipt_number, '-', 2)::int)
FROM fee_payments
WHERE receipt_number ~ '^RCP-[0-9]+-[0-9]{4}$'
GROUP BY school_id, split_part(receipt_number, '-', 3)::int
ON CONFLICT (school_id, year)
DO UPDATE SET last_no = GREATEST(receipt_counters.last_no, EXCLUDED.last_no);

-- No duplicate receipts exist in production (checked 2026-09-28), so enforce for all rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_receipt
  ON fee_payments (school_id, receipt_number)
  WHERE receipt_number IS NOT NULL AND receipt_number <> 'PENDING';

-- 3. Proprietor-controlled approval threshold ──────────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS finance_approval_threshold numeric(12,2) NOT NULL DEFAULT 50000;

-- 4. Reversals (payments are never edited or deleted) ──────────────────────
CREATE TABLE IF NOT EXISTS fee_reversals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id),
  payment_id    uuid NOT NULL REFERENCES fee_payments(id),
  reason        text NOT NULL CHECK (length(trim(reason)) >= 10),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by  uuid NOT NULL REFERENCES users(id),
  decided_by    uuid REFERENCES users(id),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reversal_active
  ON fee_reversals (payment_id) WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS idx_reversals_school_status ON fee_reversals (school_id, status);

-- 5. Discounts, scholarships, waivers ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_waivers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES schools(id),
  student_id       uuid NOT NULL REFERENCES users(id),
  term_id          uuid NOT NULL REFERENCES terms(id),
  fee_structure_id uuid REFERENCES fee_structures(id),   -- NULL = against the whole term bill
  kind             text NOT NULL CHECK (kind IN ('discount','sibling','scholarship','staff_child','waiver')),
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  reason           text NOT NULL CHECK (length(trim(reason)) >= 5),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by     uuid NOT NULL REFERENCES users(id),
  decided_by       uuid REFERENCES users(id),
  decided_at       timestamptz,
  decision_note    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
CREATE INDEX IF NOT EXISTS idx_waivers_student_term ON fee_waivers (school_id, student_id, term_id, status);

-- 6. Proprietor's time-limited emergency grants to an Admin ─────────────────
CREATE TABLE IF NOT EXISTS finance_access_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id),
  granted_to  uuid NOT NULL REFERENCES users(id),
  granted_by  uuid NOT NULL REFERENCES users(id),
  reason      text NOT NULL CHECK (length(trim(reason)) >= 10),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '72 hours')
);
CREATE INDEX IF NOT EXISTS idx_grants_active ON finance_access_grants (school_id, granted_to, expires_at);

-- 7. Append-only audit log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_audit_log (
  id          bigserial PRIMARY KEY,
  school_id   uuid NOT NULL REFERENCES schools(id),
  actor_id    uuid REFERENCES users(id),          -- NULL = system (Paystack webhook)
  actor_role  text NOT NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  before_data jsonb,
  after_data  jsonb,
  reason      text,
  via_grant   boolean NOT NULL DEFAULT false,
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fee_audit_school_time ON fee_audit_log (school_id, created_at DESC);

-- 8. "What actually counts as paid" — used by every balance query ──────────
CREATE OR REPLACE VIEW fee_payments_effective WITH (security_invoker = true) AS
SELECT fp.*
FROM fee_payments fp
WHERE fp.status = 'success'
  AND NOT EXISTS (
    SELECT 1 FROM fee_reversals r WHERE r.payment_id = fp.id AND r.status = 'approved'
  );

-- 9. Immutability triggers (fire even for the postgres superuser) ──────────
CREATE OR REPLACE FUNCTION fee_payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fee_payments rows cannot be deleted; record a reversal instead';
  END IF;
  -- The only permitted edit: a pending Paystack row being settled
  IF OLD.status = 'pending' AND NEW.status IN ('success','failed')
     AND NEW.student_id = OLD.student_id
     AND NEW.fee_structure_id = OLD.fee_structure_id
     AND NEW.school_id = OLD.school_id THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'fee_payments rows are immutable once settled (payment %)', OLD.id;
END $$;
DROP TRIGGER IF EXISTS trg_fee_payments_guard ON fee_payments;
CREATE TRIGGER trg_fee_payments_guard BEFORE UPDATE OR DELETE ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION fee_payments_guard();

CREATE OR REPLACE FUNCTION fee_structures_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM fee_payments WHERE fee_structure_id = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Fee structure % has payments and cannot be deleted', OLD.id;
    END IF;
    IF NEW.amount <> OLD.amount OR NEW.term_id <> OLD.term_id OR NEW.class_level <> OLD.class_level THEN
      RAISE EXCEPTION 'Fee structure % has payments; create a new item instead of editing it', OLD.id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fee_structures_guard ON fee_structures;
CREATE TRIGGER trg_fee_structures_guard BEFORE UPDATE OR DELETE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION fee_structures_guard();

-- Waivers and reversals: only a pending row may change
CREATE OR REPLACE FUNCTION fee_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME;
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION '% row % is already decided', TG_TABLE_NAME, OLD.id;
  END IF;
  IF NEW.requested_by <> OLD.requested_by OR NEW.school_id <> OLD.school_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Only decision fields may change on %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fee_reversals_guard ON fee_reversals;
CREATE TRIGGER trg_fee_reversals_guard BEFORE UPDATE OR DELETE ON fee_reversals
  FOR EACH ROW EXECUTE FUNCTION fee_decision_guard();
DROP TRIGGER IF EXISTS trg_fee_waivers_guard ON fee_waivers;
CREATE TRIGGER trg_fee_waivers_guard BEFORE UPDATE OR DELETE ON fee_waivers
  FOR EACH ROW EXECUTE FUNCTION fee_decision_guard();

CREATE OR REPLACE FUNCTION fee_waivers_amount_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount <> OLD.amount OR NEW.student_id <> OLD.student_id OR NEW.term_id <> OLD.term_id
     OR NEW.fee_structure_id IS DISTINCT FROM OLD.fee_structure_id THEN
    RAISE EXCEPTION 'Waiver amount/target cannot be edited; cancel and re-request';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fee_waivers_amount_guard ON fee_waivers;
CREATE TRIGGER trg_fee_waivers_amount_guard BEFORE UPDATE ON fee_waivers
  FOR EACH ROW EXECUTE FUNCTION fee_waivers_amount_guard();

CREATE OR REPLACE FUNCTION fee_reversals_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_id <> OLD.payment_id OR NEW.reason <> OLD.reason THEN
    RAISE EXCEPTION 'Reversal target/reason cannot be edited';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fee_reversals_target_guard ON fee_reversals;
CREATE TRIGGER trg_fee_reversals_target_guard BEFORE UPDATE ON fee_reversals
  FOR EACH ROW EXECUTE FUNCTION fee_reversals_target_guard();

CREATE OR REPLACE FUNCTION finance_grants_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Grants cannot be deleted; revoke instead'; END IF;
  IF OLD.revoked_at IS NOT NULL
     OR NEW.granted_to <> OLD.granted_to OR NEW.granted_by <> OLD.granted_by
     OR NEW.expires_at <> OLD.expires_at OR NEW.reason <> OLD.reason THEN
    RAISE EXCEPTION 'Only revoked_at may be set on a grant, once';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_finance_grants_guard ON finance_access_grants;
CREATE TRIGGER trg_finance_grants_guard BEFORE UPDATE OR DELETE ON finance_access_grants
  FOR EACH ROW EXECUTE FUNCTION finance_grants_guard();

CREATE OR REPLACE FUNCTION fee_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fee_audit_log is append-only';
END $$;
DROP TRIGGER IF EXISTS trg_fee_audit_guard ON fee_audit_log;
CREATE TRIGGER trg_fee_audit_guard BEFORE UPDATE OR DELETE ON fee_audit_log
  FOR EACH ROW EXECUTE FUNCTION fee_audit_guard();

-- 10. Tenant isolation on the new tables (same pattern as 001) ─────────────
ALTER TABLE receipt_counters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_reversals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_waivers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_audit_log         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_receipt_counters ON receipt_counters;
CREATE POLICY tenant_isolation_receipt_counters ON receipt_counters
  USING (school_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation_fee_reversals ON fee_reversals;
CREATE POLICY tenant_isolation_fee_reversals ON fee_reversals
  USING (school_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation_fee_waivers ON fee_waivers;
CREATE POLICY tenant_isolation_fee_waivers ON fee_waivers
  USING (school_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation_finance_grants ON finance_access_grants;
CREATE POLICY tenant_isolation_finance_grants ON finance_access_grants
  USING (school_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation_fee_audit ON fee_audit_log;
CREATE POLICY tenant_isolation_fee_audit ON fee_audit_log
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

COMMIT;
