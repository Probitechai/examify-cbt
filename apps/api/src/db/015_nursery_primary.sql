-- ═══════════════════════════════════════════════════════════════════════════
-- 015 — Nursery and Primary sections
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
-- Each school chooses the sections it runs. Existing schools stay
-- Secondary-only, so nothing changes for them until a section is added.
-- class_level_rank() orders classes Creche → SS3 in lists and reports.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE schools ADD COLUMN IF NOT EXISTS sections text[] NOT NULL DEFAULT '{secondary}';

ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_sections_valid;
ALTER TABLE schools ADD CONSTRAINT schools_sections_valid
  CHECK (cardinality(sections) > 0 AND sections <@ ARRAY['nursery','primary','secondary']::text[]);

CREATE OR REPLACE FUNCTION class_level_rank(level text) RETURNS int
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE level
    WHEN 'Creche' THEN 1 WHEN 'Pre-Nursery' THEN 2 WHEN 'Nursery 1' THEN 3 WHEN 'Nursery 2' THEN 4
    WHEN 'Primary 1' THEN 11 WHEN 'Primary 2' THEN 12 WHEN 'Primary 3' THEN 13
    WHEN 'Primary 4' THEN 14 WHEN 'Primary 5' THEN 15 WHEN 'Primary 6' THEN 16
    WHEN 'JSS1' THEN 21 WHEN 'JSS2' THEN 22 WHEN 'JSS3' THEN 23
    WHEN 'SS1' THEN 31 WHEN 'SS2' THEN 32 WHEN 'SS3' THEN 33
    ELSE 99 END
$fn$;

SELECT name, sections FROM schools ORDER BY name;
