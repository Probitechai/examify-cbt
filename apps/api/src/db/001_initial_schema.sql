-- ============================================================
-- Examify — Multi-tenant CBT Platform
-- Migration: 001_initial_schema.sql
--
-- TENANT STRATEGY: shared database, row-level isolation.
-- Every tenant-scoped table carries school_id (FK → schools).
-- PostgreSQL RLS enforces isolation at the DB level as a
-- safety net on top of application-level filtering.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'school_admin', 'teacher', 'student', 'parent');
CREATE TYPE subscription_tier AS ENUM ('starter', 'growth', 'premium', 'enterprise');
CREATE TYPE exam_status AS ENUM ('draft', 'scheduled', 'active', 'completed', 'cancelled');
CREATE TYPE session_status AS ENUM ('not_started', 'in_progress', 'submitted', 'timed_out');
CREATE TYPE question_type AS ENUM ('mcq', 'true_false', 'short_answer');

-- ============================================================
-- ANCHOR TABLE: schools
-- One row per tenant. All other tenant tables FK here.
-- ============================================================

CREATE TABLE schools (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  subdomain         text NOT NULL UNIQUE,          -- e.g. "greensprings" → greensprings.examify.ng
  address           text,
  phone             text,
  email             text,
  logo_url          text,
  subscription_tier subscription_tier NOT NULL DEFAULT 'starter',
  max_students      integer NOT NULL DEFAULT 200,  -- enforced on student creation
  is_active         boolean NOT NULL DEFAULT true, -- flip false to lock out on non-payment
  trial_ends_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- USERS
-- Covers all roles. role + school_id determines access scope.
-- parent_of is a self-referential array for parent→student links.
-- ============================================================

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  role          user_role NOT NULL,
  email         text NOT NULL,
  phone         text,
  full_name     text NOT NULL,
  password_hash text NOT NULL,
  -- student-specific
  admission_no  text,
  class_level   text,                              -- e.g. "SS1", "SS2", "SS3"
  class_arm     text,                              -- e.g. "A", "B", "Science"
  -- parent-specific
  parent_of     uuid[],                            -- array of student user IDs
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, email),
  UNIQUE (school_id, admission_no)
);

-- ============================================================
-- QUESTION BANK
-- Teachers create questions scoped to their school.
-- options stored as JSONB: [{ "key": "A", "text": "..." }, ...]
-- ============================================================

CREATE TABLE questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_by     uuid NOT NULL REFERENCES users(id),
  type           question_type NOT NULL DEFAULT 'mcq',
  subject        text NOT NULL,
  class_level    text NOT NULL,
  topic          text,
  question_text  text NOT NULL,
  image_url      text,                             -- optional image attachment
  options        jsonb,                            -- null for short_answer
  correct_answer text NOT NULL,                    -- "A" for MCQ, "True"/"False", or text
  explanation    text,                             -- shown after exam (optional)
  marks          numeric NOT NULL DEFAULT 1,
  difficulty     text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- EXAMS
-- An exam is a configured assessment event.
-- question_ids is an ordered array drawn from questions table.
-- ============================================================

CREATE TABLE exams (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES users(id),
  title            text NOT NULL,
  subject          text NOT NULL,
  class_level      text NOT NULL,
  class_arms       text[],                         -- null = all arms, or ["A", "Science"]
  instructions     text,
  duration_minutes integer NOT NULL DEFAULT 60,
  total_marks      numeric NOT NULL DEFAULT 100,
  pass_mark        numeric NOT NULL DEFAULT 50,
  question_ids     uuid[] NOT NULL,                -- ordered list; shuffled per-student at session start
  scheduled_at     timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,           -- scheduled_at + buffer; server enforces this hard stop
  status           exam_status NOT NULL DEFAULT 'draft',
  -- integrity settings
  randomise_questions boolean NOT NULL DEFAULT true,
  randomise_options   boolean NOT NULL DEFAULT true,
  show_result_after   boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- EXAM SESSIONS
-- One row per student per exam. Tracks the live session state.
-- answers: { "question_id": "A", ... } — stored incrementally.
-- question_order: the shuffled order served to this student.
-- ============================================================

CREATE TABLE exam_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id         uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES users(id),
  status          session_status NOT NULL DEFAULT 'not_started',
  question_order  uuid[],                          -- shuffled for this student at session start
  answers         jsonb NOT NULL DEFAULT '{}',     -- saved incrementally; synced from offline queue
  score           numeric,                         -- computed on submission
  percentage      numeric,                         -- score / total_marks * 100
  passed          boolean,
  started_at      timestamptz,
  submitted_at    timestamptz,
  server_deadline timestamptz,                     -- started_at + duration; hard cut-off enforced server-side
  tab_switches    integer NOT NULL DEFAULT 0,      -- anti-cheat: count of tab/window switches
  ip_address      inet,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id)                     -- one session per student per exam
);

-- ============================================================
-- TIMETABLE (Phase 2 — scaffold now, use later)
-- ============================================================

CREATE TABLE timetable_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exam_id     uuid REFERENCES exams(id),
  title       text NOT NULL,
  subject     text,
  class_level text,
  class_arm   text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  venue       text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SUBSCRIPTIONS / BILLING LOG
-- Track payment events from Paystack webhooks.
-- ============================================================

CREATE TABLE billing_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id),
  event_type    text NOT NULL,                     -- "payment.success", "subscription.renewed", etc.
  amount_kobo   integer,                           -- Paystack works in kobo (100 kobo = ₦1)
  reference     text UNIQUE,                       -- Paystack transaction reference
  payload       jsonb,                             -- full webhook payload for audit
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES — all hot queries filter by school_id first
-- ============================================================

CREATE INDEX idx_users_school        ON users(school_id);
CREATE INDEX idx_users_school_role   ON users(school_id, role);
CREATE INDEX idx_questions_school    ON questions(school_id, subject, class_level);
CREATE INDEX idx_exams_school        ON exams(school_id, status, scheduled_at);
CREATE INDEX idx_sessions_school     ON exam_sessions(school_id, exam_id);
CREATE INDEX idx_sessions_student    ON exam_sessions(student_id, status);
CREATE INDEX idx_timetable_school    ON timetable_entries(school_id, starts_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- Safety net: DB refuses queries that lack the tenant filter,
-- even if application code forgets to add WHERE school_id = ?
-- ============================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events    ENABLE ROW LEVEL SECURITY;

-- The app sets this at the start of every request:
-- SET LOCAL app.tenant_id = '<school_uuid>';

CREATE POLICY tenant_isolation_users ON users
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_questions ON questions
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_exams ON exams
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_sessions ON exam_sessions
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_timetable ON timetable_entries
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_billing ON billing_events
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

-- Super admin bypass: service role (used by your admin dashboard) skips RLS
-- This is handled by Supabase's service_role key automatically.

-- ============================================================
-- UPDATED_AT TRIGGER
-- Auto-update updated_at on every row change
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schools_updated_at        BEFORE UPDATE ON schools        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at          BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_questions_updated_at      BEFORE UPDATE ON questions      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_exams_updated_at          BEFORE UPDATE ON exams          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sessions_updated_at       BEFORE UPDATE ON exam_sessions  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
