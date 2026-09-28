-- ═══════════════════════════════════════════════════════════════════════════
-- 011 — JAMB Prep: server-side grading of AI questions, cached study notes,
--        per-student daily AI usage
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- AI-generated practice questions are stored so the server can mark answers
-- (the browser no longer tells the server its own score)
CREATE TABLE IF NOT EXISTS jamb_ai_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id     uuid NOT NULL REFERENCES jamb_subjects(id),
  topic_id       uuid REFERENCES jamb_topics(id),
  question       text NOT NULL,
  option_a       text NOT NULL,
  option_b       text NOT NULL,
  option_c       text NOT NULL,
  option_d       text NOT NULL,
  correct_option text NOT NULL CHECK (correct_option IN ('a','b','c','d')),
  explanation    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jamb_ai_q_student ON jamb_ai_questions (school_id, student_id, created_at DESC);

-- Study notes are generated once per topic and shared by every school
CREATE TABLE IF NOT EXISTS jamb_topic_notes (
  topic_id   uuid PRIMARY KEY REFERENCES jamb_topics(id) ON DELETE CASCADE,
  content    text NOT NULL,
  model      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per AI call, for the per-student daily limit
CREATE TABLE IF NOT EXISTS jamb_ai_usage (
  id         bigserial PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('quiz','summary')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jamb_ai_usage_day ON jamb_ai_usage (school_id, student_id, created_at);

-- Tenant isolation (same pattern as 001); notes are global, so RLS on with no
-- policy = not readable through Supabase's public API, only through Examify
ALTER TABLE jamb_ai_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jamb_ai_usage     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jamb_topic_notes  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_jamb_ai_questions ON jamb_ai_questions;
CREATE POLICY tenant_isolation_jamb_ai_questions ON jamb_ai_questions
  USING (school_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS tenant_isolation_jamb_ai_usage ON jamb_ai_usage;
CREATE POLICY tenant_isolation_jamb_ai_usage ON jamb_ai_usage
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

COMMIT;
