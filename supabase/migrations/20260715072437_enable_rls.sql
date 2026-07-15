-- Enable Row Level Security on the three public tables the Supabase Security
-- Advisor flagged as rls_disabled_in_public.
--
-- These three tables are service/owner-only:
--   * platform_settings   — read/written exclusively via supabaseAdmin (service
--                           role) in server routes and via the postgres-owner
--                           psycopg2 connection in erp_api / sync_worker.
--   * period_duration_map — referenced by no application code and no view/rule.
--   * sync_state          — read/written only by sync_worker over the postgres
--                           owner connection.
--
-- The absence of policies is DELIBERATE, not an oversight: the service_role key
-- and the postgres table-owner both bypass RLS, so every legitimate accessor
-- keeps working. No anon/authenticated role touches these tables directly, so a
-- policy-less "deny all" for those roles is exactly the intended posture.
--
-- HARD CONSTRAINT: bare ENABLE only. Do NOT add FORCE ROW LEVEL SECURITY — the
-- erp_api and sync_worker paths connect AS the table owner (postgres) and rely
-- on the owner RLS-bypass; FORCE would subject the owner to (nonexistent)
-- policies and break sync + settings reads.
--
-- Plain ENABLE ROW LEVEL SECURITY is idempotent, so no guard is required.

ALTER TABLE public.platform_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_duration_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state          ENABLE ROW LEVEL SECURITY;
