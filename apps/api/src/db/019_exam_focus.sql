-- ═══════════════════════════════════════════════════════════════════════════
-- 019 — Record when a student leaves the CBT exam screen
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
--  • exam_sessions.tab_switches — how many times the student left the exam
--    screen (another tab, another app, or minimised). The column existed but
--    was never filled in.
--  • exam_sessions.time_away_seconds — total time spent away.
--  • exam_focus_events — each time away: when they left, when they came back.
--    Times come from the server clock, not the student's device.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS tab_switches integer NOT NULL DEFAULT 0;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS time_away_seconds integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS exam_focus_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  session_id    uuid NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  left_at       timestamptz NOT NULL DEFAULT now(),
  returned_at   timestamptz,
  seconds_away  integer CHECK (seconds_away IS NULL OR seconds_away >= 0)
);
CREATE INDEX IF NOT EXISTS idx_exam_focus_events_session ON exam_focus_events (session_id, left_at);

ALTER TABLE exam_focus_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_exam_focus ON exam_focus_events;
CREATE POLICY tenant_isolation_exam_focus ON exam_focus_events
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

COMMIT;
