-- 021: Platform admins belong to no school
--
-- Platform (super) admin accounts used to be stored under a school, so
-- removing that school removed them too. From now on a super_admin has no
-- school (school_id is NULL); every other account still must have one.
-- Safe to run more than once. Works with the code before and after this change.

ALTER TABLE users ALTER COLUMN school_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_school_required') THEN
    ALTER TABLE users ADD CONSTRAINT users_school_required
      CHECK (school_id IS NOT NULL OR role = 'super_admin');
  END IF;
END $$;

-- Any platform admin still sitting under a school is moved out of it
UPDATE users SET school_id = NULL WHERE role = 'super_admin' AND school_id IS NOT NULL;
