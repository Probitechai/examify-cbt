-- ═══════════════════════════════════════════════════════════════════════════
-- 013 — Repair jsonb values that older code saved as JSON *strings*
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
--  • result_configs.grade_boundaries — stored as a string, so report cards
--    found no grade band and graded every subject F / Fail. The boundaries
--    are repaired and results the bug forced to F / Fail are re-graded.
--  • questions.options — stored as a string for questions added one at a time.
--  • exam_sessions.answers — CBT autosaves turned the answers into a list of
--    snapshots, so a resumed exam showed no saved answers. Merged back into
--    one { questionId: answer } object (later snapshots win).
--
-- Everything is one statement (no temp tables), so it is all-or-nothing even
-- when the editor runs statements on separate connections. The second
-- statement is a check: every "still_broken" count should be 0.
-- ═══════════════════════════════════════════════════════════════════════════

WITH
-- ── 1. Grade boundaries ────────────────────────────────────────────────────
cfg AS (
  SELECT school_id,
         CASE WHEN jsonb_typeof(grade_boundaries) = 'string'
              THEN (grade_boundaries #>> '{}')::jsonb ELSE grade_boundaries END AS gb
  FROM result_configs
),
fix_cfg AS (
  UPDATE result_configs rc SET grade_boundaries = cfg.gb
  FROM cfg
  WHERE rc.school_id = cfg.school_id AND jsonb_typeof(rc.grade_boundaries) = 'string'
  RETURNING 1
),
-- Results showing F / Fail whose score falls in a different band of the
-- school's boundaries. Scores are not touched; only grade and remark change.
calc AS (
  SELECT sr.id, b.value->>'grade' AS grade, b.value->>'remark' AS remark
  FROM student_results sr
  JOIN cfg ON cfg.school_id = sr.school_id AND jsonb_typeof(cfg.gb) = 'array'
  CROSS JOIN LATERAL (
    SELECT e.value
    FROM jsonb_array_elements(cfg.gb) WITH ORDINALITY AS e(value, ord)
    WHERE COALESCE(sr.ca_score, 0) + COALESCE(sr.exam_score, 0) >= (e.value->>'min')::numeric
      AND COALESCE(sr.ca_score, 0) + COALESCE(sr.exam_score, 0) <= (e.value->>'max')::numeric
    ORDER BY e.ord LIMIT 1
  ) b
  WHERE sr.grade = 'F' AND sr.remark = 'Fail'
    AND (b.value->>'grade' IS DISTINCT FROM 'F' OR b.value->>'remark' IS DISTINCT FROM 'Fail')
),
fix_results AS (
  UPDATE student_results sr SET grade = calc.grade, remark = calc.remark
  FROM calc WHERE sr.id = calc.id
  RETURNING 1
),
-- ── 2. Question options ────────────────────────────────────────────────────
fix_options AS (
  UPDATE questions SET options = (options #>> '{}')::jsonb
  WHERE jsonb_typeof(options) = 'string'
  RETURNING 1
),
-- ── 3. CBT answers ─────────────────────────────────────────────────────────
fix_answers_str AS (
  UPDATE exam_sessions SET answers = (answers #>> '{}')::jsonb
  WHERE jsonb_typeof(answers) = 'string'
  RETURNING 1
),
snaps AS (
  SELECT s.id, e.ord,
         CASE WHEN jsonb_typeof(e.value) = 'string' THEN (e.value #>> '{}')::jsonb ELSE e.value END AS snap
  FROM exam_sessions s
  CROSS JOIN LATERAL jsonb_array_elements(s.answers) WITH ORDINALITY AS e(value, ord)
  WHERE jsonb_typeof(s.answers) = 'array'
),
latest AS (
  SELECT DISTINCT ON (sn.id, kv.key) sn.id, kv.key, kv.value
  FROM snaps sn CROSS JOIN LATERAL jsonb_each(sn.snap) kv
  WHERE jsonb_typeof(sn.snap) = 'object'
  ORDER BY sn.id, kv.key, sn.ord DESC
),
merged AS (
  SELECT s.id, COALESCE(jsonb_object_agg(l.key, l.value) FILTER (WHERE l.key IS NOT NULL), '{}'::jsonb) AS answers
  FROM exam_sessions s LEFT JOIN latest l ON l.id = s.id
  WHERE jsonb_typeof(s.answers) = 'array'
  GROUP BY s.id
),
fix_answers_arr AS (
  UPDATE exam_sessions s SET answers = m.answers FROM merged m WHERE s.id = m.id
  RETURNING 1
)
SELECT 'grade_boundaries repaired (schools)' AS item, (SELECT COUNT(*) FROM fix_cfg)::int AS n
UNION ALL SELECT 'student results re-graded',        (SELECT COUNT(*) FROM fix_results)::int
UNION ALL SELECT 'question options repaired',        (SELECT COUNT(*) FROM fix_options)::int
UNION ALL SELECT 'exam answers repaired (string)',   (SELECT COUNT(*) FROM fix_answers_str)::int
UNION ALL SELECT 'exam answers merged (snapshots)',  (SELECT COUNT(*) FROM fix_answers_arr)::int;

-- ── Check ──────────────────────────────────────────────────────────────────
SELECT 'still_broken: grade_boundaries' AS item, COUNT(*)::int AS n FROM result_configs WHERE jsonb_typeof(grade_boundaries) <> 'array'
UNION ALL SELECT 'still_broken: question options', COUNT(*)::int FROM questions WHERE options IS NOT NULL AND jsonb_typeof(options) <> 'array'
UNION ALL SELECT 'still_broken: exam answers', COUNT(*)::int FROM exam_sessions WHERE jsonb_typeof(answers) <> 'object'
UNION ALL SELECT 'results still F but score in a pass band', COUNT(*)::int
  FROM student_results sr JOIN result_configs rc ON rc.school_id = sr.school_id
  WHERE sr.grade = 'F' AND jsonb_typeof(rc.grade_boundaries) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(rc.grade_boundaries) e
                WHERE e->>'grade' <> 'F'
                  AND COALESCE(sr.ca_score, 0) + COALESCE(sr.exam_score, 0) BETWEEN (e->>'min')::numeric AND (e->>'max')::numeric);
