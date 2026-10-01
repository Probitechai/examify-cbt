-- ═══════════════════════════════════════════════════════════════════════════
-- 018 — Exam timetable (Standard plan)
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
--  • exam_timetables — one per school per term: a title, general instructions
--    printed at the top, and whether it has been published to students and
--    parents.
--  • exam_timetable_entries — each sitting: date, start and end time, class
--    (and arm, blank = all arms), subject, paper, paper or CBT, venue and
--    invigilator. A CBT sitting can be linked to the CBT exam it runs.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS exam_timetables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  term_id       uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  title         text NOT NULL DEFAULT 'Examination Timetable',
  instructions  text,
  published_at  timestamptz,
  published_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, term_id)
);

CREATE TABLE IF NOT EXISTS exam_timetable_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  timetable_id    uuid NOT NULL REFERENCES exam_timetables(id) ON DELETE CASCADE,
  exam_date       date NOT NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  class_level     text NOT NULL,
  class_arm       text NOT NULL DEFAULT '',          -- '' = every arm of the class
  subject         text NOT NULL CHECK (length(trim(subject)) > 0),
  paper           text,                              -- e.g. 'Paper 1 (Objective)'
  mode            text NOT NULL CHECK (mode IN ('paper', 'cbt')),
  exam_id         uuid REFERENCES exams(id) ON DELETE SET NULL,   -- the CBT exam this sitting runs
  venue           text,
  invigilator_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  notes           text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  CHECK (exam_id IS NULL OR mode = 'cbt')
);
CREATE INDEX IF NOT EXISTS idx_exam_tt_entries_day ON exam_timetable_entries (timetable_id, exam_date, start_time);
CREATE INDEX IF NOT EXISTS idx_exam_tt_entries_invig ON exam_timetable_entries (school_id, invigilator_id, exam_date);
-- A CBT exam appears once per arm
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_tt_entries_exam ON exam_timetable_entries (exam_id, class_arm) WHERE exam_id IS NOT NULL;

ALTER TABLE exam_timetables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_exam_tt ON exam_timetables;
CREATE POLICY tenant_isolation_exam_tt ON exam_timetables
  USING (school_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE exam_timetable_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_exam_tt_entries ON exam_timetable_entries;
CREATE POLICY tenant_isolation_exam_tt_entries ON exam_timetable_entries
  USING (school_id = current_setting('app.tenant_id', true)::uuid);

COMMIT;
