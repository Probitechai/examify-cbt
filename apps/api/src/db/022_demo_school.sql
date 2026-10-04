-- 022: The demo school
--
-- 1. schools.is_demo marks the school used to show Examify to prospects.
--    Super Admin figures and revenue leave it out, it never takes real money,
--    and no email or SMS goes to its made-up accounts.
-- 2. The money records (payments, fee items, waivers, reversals, the audit log...)
--    can never be deleted. The one exception: the demo-school reset script may
--    clear the DEMO school's records, and only while it runs (it switches on
--    examify.demo_reset for its own transaction). Real schools are unaffected.
--
-- Safe to run more than once. Run it before deploying the code that uses it.

ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- True only inside the reset script, and only for a school marked as the demo
CREATE OR REPLACE FUNCTION public.demo_reset_allowed(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('examify.demo_reset', true), '') = 'on'
     AND EXISTS (SELECT 1 FROM public.schools WHERE id = p_school AND is_demo)
$$;

CREATE OR REPLACE FUNCTION public.fee_payments_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.demo_reset_allowed(OLD.school_id) THEN RETURN OLD; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.fee_structures_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.demo_reset_allowed(OLD.school_id) THEN RETURN OLD; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.fee_audit_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.demo_reset_allowed(OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'fee_audit_log is append-only';
END $function$;

CREATE OR REPLACE FUNCTION public.fee_decision_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.demo_reset_allowed(OLD.school_id) THEN RETURN OLD; END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.fee_enrollment_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF public.demo_reset_allowed(OLD.school_id) THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM fee_payments_effective
             WHERE fee_structure_id = OLD.fee_structure_id AND student_id = OLD.student_id) THEN
    RAISE EXCEPTION 'Student % has payments against fee item %; reverse them first', OLD.student_id, OLD.fee_structure_id;
  END IF;
  RETURN OLD;
END $function$;

CREATE OR REPLACE FUNCTION public.finance_grants_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.demo_reset_allowed(OLD.school_id) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Grants cannot be deleted; revoke instead'; END IF;
  IF OLD.revoked_at IS NOT NULL
     OR NEW.granted_to <> OLD.granted_to OR NEW.granted_by <> OLD.granted_by
     OR NEW.expires_at <> OLD.expires_at OR NEW.reason <> OLD.reason THEN
    RAISE EXCEPTION 'Only revoked_at may be set on a grant, once';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.platform_collections_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.demo_reset_allowed(OLD.school_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Collection records cannot be changed or deleted';
END $function$;

CREATE OR REPLACE FUNCTION public.school_payouts_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND public.demo_reset_allowed(OLD.school_id) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payouts cannot be deleted; void them instead';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'This payout is already voided';
  END IF;
  IF NEW.school_id <> OLD.school_id OR NEW.amount <> OLD.amount OR NEW.paid_on <> OLD.paid_on
     OR NEW.bank_reference <> OLD.bank_reference OR NEW.recorded_by <> OLD.recorded_by
     OR NEW.created_at <> OLD.created_at OR coalesce(NEW.note, '') <> coalesce(OLD.note, '') THEN
    RAISE EXCEPTION 'Payouts cannot be edited; void and record again';
  END IF;
  RETURN NEW;
END $function$;
