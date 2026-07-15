-- Secure the 6 SECURITY DEFINER views flagged by the Supabase Security Advisor.
--
-- Problem: each view runs as its owner (postgres) because security_invoker is
-- off, so it BYPASSES the RLS on its base tables; and SELECT is granted to the
-- public `anon` role. Net effect: anyone holding NEXT_PUBLIC_SUPABASE_ANON_KEY
-- can read the underlying data via PostgREST. Verified live: v_member_status
-- returned all 1,842 members (names, mobiles, photo_url, card_id) to `anon`.
--
-- Fix (both parts, applied together):
--   1. REVOKE SELECT FROM anon, authenticated  -> immediate stop of the leak.
--   2. ALTER VIEW ... SET (security_invoker = on) -> durable fix: the view now
--      honors the CALLER's RLS, so even if a future blanket GRANT re-adds anon
--      SELECT, the base-table RLS still filters the rows. Also clears the
--      "Security Definer View" advisor error.
--
-- Safe for the app: every reader of these views is a service-key server route
-- (supabaseAdmin / service_role, which has BYPASSRLS and retains its grant).
-- The browser anon client never selects them. All 6 are plain VIEWs (no
-- materialized views), so security_invoker applies to each.
--
-- No USING(true), no policy, no data change. Wrapped in one transaction so a
-- mid-way failure rolls back cleanly (no half-revoked / half-flipped state).

BEGIN;

-- v_member_full
REVOKE SELECT ON public.v_member_full         FROM anon, authenticated;
ALTER VIEW      public.v_member_full          SET (security_invoker = on);

-- v_member_status
REVOKE SELECT ON public.v_member_status       FROM anon, authenticated;
ALTER VIEW      public.v_member_status        SET (security_invoker = on);

-- v_currently_inside
REVOKE SELECT ON public.v_currently_inside    FROM anon, authenticated;
ALTER VIEW      public.v_currently_inside     SET (security_invoker = on);

-- v_daily_attendance
REVOKE SELECT ON public.v_daily_attendance    FROM anon, authenticated;
ALTER VIEW      public.v_daily_attendance     SET (security_invoker = on);

-- v_expiring_soon
REVOKE SELECT ON public.v_expiring_soon       FROM anon, authenticated;
ALTER VIEW      public.v_expiring_soon        SET (security_invoker = on);

-- v_monthly_activations
REVOKE SELECT ON public.v_monthly_activations FROM anon, authenticated;
ALTER VIEW      public.v_monthly_activations  SET (security_invoker = on);

-- Verification: confirm NO SELECT grant remains for anon/authenticated on any of
-- the 6 views. This catches a grant that comes from a source a direct REVOKE
-- would not clear (e.g. default privileges or role membership). If any remain,
-- RAISE aborts the transaction and the whole migration rolls back — nothing is
-- half-applied, and the leftover grant's source must be investigated.
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(format('%s -> %s', table_name, grantee), ', ')
    INTO leftover
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND privilege_type = 'SELECT'
    AND grantee IN ('anon', 'authenticated')
    AND table_name IN (
      'v_member_full', 'v_member_status', 'v_currently_inside',
      'v_daily_attendance', 'v_expiring_soon', 'v_monthly_activations'
    );

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION
      'anon/authenticated still hold SELECT after REVOKE (source is not a direct grant): %',
      leftover;
  END IF;

  RAISE NOTICE 'OK: anon and authenticated have zero SELECT on all 6 views.';
END $$;

COMMIT;

-- Expected output on success:
--   NOTICE:  OK: anon and authenticated have zero SELECT on all 6 views.
--   COMMIT
-- On failure the transaction aborts with the ERROR listing the leftover grants
-- and nothing is applied.
