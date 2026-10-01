-- ═══════════════════════════════════════════════════════════════════════════
-- 020 — Fill-in-the-blank and essay questions, and essay marking
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
--  • questions.type becomes plain text limited to: mcq, true_false,
--    short_answer, fill_blank, essay (it was a fixed list of the first three).
--  • Questions the old form saved as "short answer" with the answer 'ESSAY'
--    are turned into essay questions.
--  • exam_sessions gets what essay marking needs:
--      marking_status  'complete', or 'pending' while essays await a teacher
--      auto_score      marks from automatically marked questions
--      manual_marks    the teacher's marks and comments per essay question
--      marked_by / marked_at
-- The last statement lists how many questions there are of each type.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Any column still using the old fixed list becomes plain text
DO $do$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'USER-DEFINED' AND udt_name = 'question_type'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', c.table_name, c.column_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE text USING %I::text', c.table_name, c.column_name, c.column_name);
  END LOOP;
END $do$;
DROP TYPE IF EXISTS question_type;

ALTER TABLE questions ALTER COLUMN type SET DEFAULT 'mcq';
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_valid;
ALTER TABLE questions ADD CONSTRAINT questions_type_valid
  CHECK (type IN ('mcq', 'true_false', 'short_answer', 'fill_blank', 'essay'));

-- 2. Essays saved by the old form
UPDATE questions SET type = 'essay', correct_answer = ''
WHERE type = 'short_answer' AND upper(trim(correct_answer)) = 'ESSAY';

-- 3. Essay marking on exam sessions
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS marking_status text NOT NULL DEFAULT 'complete';
ALTER TABLE exam_sessions DROP CONSTRAINT IF EXISTS exam_sessions_marking_status_valid;
ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_marking_status_valid CHECK (marking_status IN ('complete', 'pending'));
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS auto_score numeric;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS manual_marks jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS marked_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS marked_at timestamptz;

COMMIT;

SELECT type, COUNT(*) AS questions FROM questions GROUP BY 1 ORDER BY 1;
