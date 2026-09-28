-- ═══════════════════════════════════════════════════════════════════════════
-- 012 — Opt-in optional fee items + JAMB mock exams
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
-- BEHAVIOUR CHANGE: optional fee items (is_mandatory = false) are no longer
-- billed to every student in the class — only to students enrolled in them.
-- Students who have already paid something towards an optional item are
-- enrolled automatically below, so nobody's existing payments are orphaned.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1. Who takes which optional item ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_optional_enrollments (
  school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fee_structure_id uuid NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fee_structure_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_fee_opt_enrol_student ON fee_optional_enrollments (school_id, student_id);

-- Backfill: anyone who has already paid towards an optional item is enrolled in it
INSERT INTO fee_optional_enrollments (school_id, fee_structure_id, student_id)
SELECT DISTINCT fp.school_id, fp.fee_structure_id, fp.student_id
FROM fee_payments_effective fp
JOIN fee_structures fs ON fs.id = fp.fee_structure_id
WHERE fs.is_mandatory = false
ON CONFLICT DO NOTHING;

-- A student can't be taken off an item they have paid towards
CREATE OR REPLACE FUNCTION fee_enrollment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM fee_payments_effective
             WHERE fee_structure_id = OLD.fee_structure_id AND student_id = OLD.student_id) THEN
    RAISE EXCEPTION 'Student % has payments against fee item %; reverse them first', OLD.student_id, OLD.fee_structure_id;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_fee_enrollment_guard ON fee_optional_enrollments;
CREATE TRIGGER trg_fee_enrollment_guard BEFORE DELETE ON fee_optional_enrollments
  FOR EACH ROW EXECUTE FUNCTION fee_enrollment_guard();

-- ── 2. One definition of "what a student is billed" ────────────────────────
-- Mandatory items of the student's class, plus optional items they're enrolled in.
-- Every balance, report and Paystack check uses this view.
CREATE OR REPLACE VIEW student_fee_bill WITH (security_invoker = true) AS
SELECT u.school_id, u.id AS student_id, u.class_level, u.class_arm, u.is_active,
       fs.id AS fee_structure_id, fs.term_id, fs.name, fs.amount, fs.is_mandatory
FROM users u
JOIN fee_structures fs ON fs.school_id = u.school_id AND fs.class_level = u.class_level
WHERE u.role = 'student'
  AND (fs.is_mandatory
       OR EXISTS (SELECT 1 FROM fee_optional_enrollments e
                  WHERE e.fee_structure_id = fs.id AND e.student_id = u.id));

-- ── 3. JAMB mock exams ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jamb_mock_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode             text NOT NULL CHECK (mode IN ('full','short')),
  subjects         uuid[] NOT NULL,
  question_ids     jsonb NOT NULL,          -- { "<subjectId>": ["<questionId>", ...] }
  answers          jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ends_at          timestamptz NOT NULL,
  submitted_at     timestamptz,
  correct          int,
  total            int,
  score_by_subject jsonb,                   -- [{ subjectId, name, correct, total, score }]
  utme_score       int,                     -- out of 400
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- At most one unfinished mock per student
CREATE UNIQUE INDEX IF NOT EXISTS uq_jamb_mock_open ON jamb_mock_attempts (school_id, student_id) WHERE submitted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jamb_mock_student ON jamb_mock_attempts (school_id, student_id, created_at DESC);

-- ── 4. Tenant isolation ────────────────────────────────────────────────────
ALTER TABLE fee_optional_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE jamb_mock_attempts       ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_fee_opt_enrol ON fee_optional_enrollments;
CREATE POLICY tenant_isolation_fee_opt_enrol ON fee_optional_enrollments
  USING (school_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation_jamb_mock ON jamb_mock_attempts;
CREATE POLICY tenant_isolation_jamb_mock ON jamb_mock_attempts
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

COMMIT;
