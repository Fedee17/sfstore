-- Explicit grant for the stored cash price rule (202611260001). Production already has it through Supabase default
-- privileges (verified 26/11/2026: service_role EXECUTE = true), so this is a no-op there; explicit-grant
-- environments (staging rebuild, CI synthetic checkout) need it stated. Idempotent.
grant execute on function public.commercial_cash_unit_price(numeric, numeric, timestamptz) to service_role;
