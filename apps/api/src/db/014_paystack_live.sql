-- ═══════════════════════════════════════════════════════════════════════════
-- 014 — Paystack go-live
-- Run in the Supabase SQL editor as ONE run. Safe to re-run.
--
-- Bank subaccounts created with the TEST key don't exist on live Paystack.
-- Each school's subaccount now records the mode it was created in; the API
-- ignores a subaccount from the other mode and asks the school to enter its
-- bank details again. Until then, that school's online payments go to the
-- Probitechai account as they did before direct payment was set up.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE schools ADD COLUMN IF NOT EXISTS paystack_subaccount_mode text;
UPDATE schools SET paystack_subaccount_mode = 'test'
WHERE paystack_subaccount_code IS NOT NULL AND paystack_subaccount_mode IS NULL;
