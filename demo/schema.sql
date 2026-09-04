-- GymFit DEMO environment schema — for the SEPARATE demo Supabase project
-- (vjrwjqvycxzwxqmnilck), never for production (ynunbegchlyyfhdffsim).
--
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
-- VIEW/FUNCTION, ON CONFLICT-friendly seed data lives in seed.py, not here).
--
-- Schema fidelity notes (read before assuming 1:1 parity with production):
--   * Table shapes below were reconstructed from this session's own prior
--     read-only diagnostic work against production (already completed for
--     unrelated, approved reasons) plus project_snapshot/v_member_status.sql
--     — NOT from a fresh connection to production, per the instruction not
--     to touch/connect to it for this task.
--   * v_member_status is copied verbatim from project_snapshot/v_member_status.sql
--     — that file IS production's real view definition, so this one is faithful.
--   * The other five views (v_member_full, v_currently_inside,
--     v_daily_attendance, v_expiring_soon, v_monthly_activations) are NOT
--     referenced anywhere in the current app code (verified via full-repo
--     grep) — they appear to be legacy/unused in production today. Their
--     exact production SQL was never captured anywhere in this repo, and it
--     was not pulled here since that would require connecting to production.
--     They are recreated below as best-effort, clearly-labeled equivalents
--     built on the CURRENT gym_* tables (not the dead legacy members/
--     memberships/membership_plans/checkins tables) so they at least return
--     sensible data in the demo. If production's real definitions differ,
--     swap these out — they are not load-bearing for any page in this app.
--   * `sales` is a DEMO-ONLY table with no production equivalent — real POS
--     sales live in the ERP (SQL Server), which the demo project has no
--     access to. It exists purely so seed.py has somewhere to put demo POS
--     sale records without touching FusionERP/FR8RootDB.

-- ── Core tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gym_members (
  id                    serial PRIMARY KEY,
  erp_customer_id       text UNIQUE,
  erp_account_id        integer,
  first_name            text,
  last_name             text,
  mobile                text,
  email                 text,
  card_id               text,
  card_expiry           date,
  photo_url             text,
  is_active             boolean DEFAULT true,
  face_enrolled         boolean DEFAULT false,
  contract_status       text DEFAULT 'not_generated',
  contract_generated_at timestamptz,
  signed_contract_url   text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gym_memberships (
  id                serial PRIMARY KEY,
  member_id         integer NOT NULL REFERENCES gym_members(id),
  erp_sale_serial   varchar(20) UNIQUE,
  erp_product_id    text,
  plan_name         text,
  duration_days     integer,
  sale_amount       numeric,
  sale_date         date,
  membership_start  date,
  membership_end    date,
  status            text,
  frozen_at         timestamptz,
  frozen_days_used  integer DEFAULT 0,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gym_checkins (
  id            serial PRIMARY KEY,
  member_id     integer NOT NULL REFERENCES gym_members(id),
  membership_id integer,
  checkin_at    timestamptz DEFAULT now(),
  checkout_at   timestamptz,
  method        text,
  match_score   numeric,
  staff_id      integer,
  location_id   smallint,
  notes         text
);

CREATE TABLE IF NOT EXISTS gym_freezes (
  id            serial PRIMARY KEY,
  member_id     integer NOT NULL REFERENCES gym_members(id),
  membership_id integer,
  freeze_start  date,
  freeze_end    date,
  reason        text,
  approved_by   text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id                   serial PRIMARY KEY,
  first_name           text NOT NULL,
  last_name            text,
  mobile               text,
  email                text,
  source               text,
  status               text DEFAULT 'new',
  notes                text,
  follow_up_date       date,
  converted_member_id  integer,
  created_by           text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role     text NOT NULL,
  module   text NOT NULL,
  allowed  boolean DEFAULT false,
  PRIMARY KEY (role, module)
);

CREATE TABLE IF NOT EXISTS staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     uuid,
  name        text,
  email       text,
  role        text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Key/value business settings — matches production's platform_settings
-- convention exactly (jsonb value per key), rather than bolting typed columns
-- onto what production treats as a flexible settings store.
CREATE TABLE IF NOT EXISTS platform_settings (
  key         text PRIMARY KEY,
  value       jsonb,
  description text,
  updated_at  timestamptz DEFAULT now()
);

-- Discovered missing during DEMO_MODE testing of erp_api/routers/wrap.py
-- (its "vs gym average" section queries this and previously errored with
-- UndefinedTable) — a real gap in this schema file, not a DEMO_MODE bug.
CREATE TABLE IF NOT EXISTS monthly_stats (
  month                 text PRIMARY KEY,   -- 'YYYY-MM'
  avg_visits            numeric,
  median_visits         numeric,
  total_active_members  integer,
  total_checkins        integer,
  percentile_data       jsonb,
  computed_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_log (
  id               serial PRIMARY KEY,
  sync_at          timestamptz DEFAULT now(),
  erp_sale_serial  text,
  erp_customer_id  text,
  erp_product_id   text,
  action           text,
  status           text,
  message          text,
  raw_data         jsonb
);

-- DEMO-ONLY — no production equivalent (see header note).
CREATE TABLE IF NOT EXISTS sales (
  id              serial PRIMARY KEY,
  member_id       integer REFERENCES gym_members(id),
  item_name       text NOT NULL,
  category        text NOT NULL,           -- 'membership' | 'retail'
  amount          numeric NOT NULL,
  payment_method  text NOT NULL,           -- 'Cash' | 'M-Pesa' | 'Card'
  staff_name      text,
  sold_at         timestamptz DEFAULT now()
);

-- DEMO-ONLY — no production equivalent. Real POS reads ERP's ProductMaster/
-- RestMenuChild/Stock; the demo has no ERP access, so this stands in for all
-- three (see erp_api/demo_mode.py's list_products/stock_levels/create_sale).
-- product_id is a stable natural key (mirrors real ERP product codes), so
-- seed.py upserts on it (ON CONFLICT) rather than delete-and-reinsert.
CREATE TABLE IF NOT EXISTS demo_products (
  product_id      text PRIMARY KEY,
  menu_id         integer NOT NULL,        -- 1=Memberships 2=POS Items 3=Rentals
  menu_name       text NOT NULL,
  display_name    text NOT NULL,
  product_name    text NOT NULL,
  rate            numeric(10,2) NOT NULL DEFAULT 0,
  mrp             numeric(10,2) NOT NULL DEFAULT 0,
  tax_id          integer NOT NULL DEFAULT 0,
  tax_value       numeric(5,2) NOT NULL DEFAULT 0,
  tax_name        text NOT NULL DEFAULT '',
  include_in_rate boolean NOT NULL DEFAULT true,
  ask_price       boolean NOT NULL DEFAULT false,
  is_stock_item   boolean NOT NULL DEFAULT false,   -- true = physical good (ItemType 164 equivalent)
  stock_qty       numeric(10,2),                    -- NULL for non-stock (service/membership) items
  updated_at      timestamptz DEFAULT now()
);

-- ── Views ────────────────────────────────────────────────────────────────────

-- Faithful copy of production's real definition (project_snapshot/v_member_status.sql).
CREATE OR REPLACE VIEW v_member_status AS
SELECT
  m.id,
  m.erp_customer_id,
  m.first_name,
  m.last_name,
  m.mobile,
  m.card_id,
  m.photo_url,
  m.face_enrolled,
  ms.id                AS membership_id,
  ms.plan_name,
  ms.membership_start,
  ms.membership_end,
  ms.status            AS membership_status,
  ms.frozen_at,
  ms.frozen_days_used,
  CASE
    WHEN ms.id IS NULL                     THEN 'no_membership'
    WHEN ms.status = 'frozen'              THEN 'frozen'
    WHEN ms.membership_end >= CURRENT_DATE THEN 'active'
    ELSE                                        'expired'
  END                  AS display_status,
  (ms.membership_end - CURRENT_DATE)::int AS days_remaining
FROM gym_members m
LEFT JOIN LATERAL (
  SELECT *
  FROM gym_memberships
  WHERE member_id = m.id
  ORDER BY membership_end DESC
  LIMIT 1
) ms ON true;

-- Best-effort reconstruction — see header note. Built on gym_* tables (not
-- the dead legacy members/memberships/membership_plans/checkins tables) so it
-- actually returns data in the demo. Superset of v_member_status.
CREATE OR REPLACE VIEW v_member_full AS
SELECT
  s.*,
  (s.first_name || ' ' || COALESCE(s.last_name, '')) AS full_name,
  m.email,
  m.is_active,
  false AS is_blocked,
  (SELECT count(*) FROM gym_checkins c WHERE c.member_id = s.id
     AND (c.notes IS NULL OR c.notes NOT LIKE '%Access denied%')) AS visit_count,
  s.membership_start AS start_date,
  s.membership_end   AS end_date,
  (s.display_status = 'frozen') AS is_frozen,
  (SELECT max(c.checkin_at) FROM gym_checkins c WHERE c.member_id = s.id) AS last_checkin
FROM v_member_status s
JOIN gym_members m ON m.id = s.id;

CREATE OR REPLACE VIEW v_currently_inside AS
SELECT c.id AS checkin_id, m.id AS member_id, m.first_name, m.last_name, c.checkin_at
FROM gym_checkins c
JOIN gym_members m ON m.id = c.member_id
WHERE c.checkin_at::date = CURRENT_DATE
  AND c.checkout_at IS NULL
  AND (c.notes IS NULL OR c.notes NOT LIKE '%Access denied%')
ORDER BY c.checkin_at DESC;

CREATE OR REPLACE VIEW v_daily_attendance AS
SELECT
  checkin_at::date AS attendance_date,
  count(*) FILTER (WHERE notes IS NULL OR notes NOT LIKE '%Access denied%') AS successful_checkins,
  count(*) FILTER (WHERE notes LIKE '%Access denied%') AS denied_checkins
FROM gym_checkins
GROUP BY checkin_at::date
ORDER BY attendance_date DESC;

CREATE OR REPLACE VIEW v_expiring_soon AS
SELECT *
FROM v_member_status
WHERE display_status = 'active'
  AND membership_end <= CURRENT_DATE + interval '14 days'
ORDER BY membership_end ASC;

CREATE OR REPLACE VIEW v_monthly_activations AS
SELECT
  to_char(sale_date, 'YYYY-MM') AS month,
  count(*) AS activations,
  sum(sale_amount) AS revenue
FROM gym_memberships
WHERE sale_date IS NOT NULL
GROUP BY to_char(sale_date, 'YYYY-MM')
ORDER BY month DESC;

-- ── Demo expiry check (server-side, Postgres now() is the source of truth) ──
-- Called via RPC from the public /api/demo/status route (service-key-backed,
-- since platform_settings has zero anon grants — same posture as production)
-- so Next.js middleware (Edge runtime, anon-keyed client only) can decide
-- whether to block the app without ever trusting a client/server wall clock.
CREATE OR REPLACE FUNCTION demo_status_check()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'is_demo', COALESCE((SELECT value FROM platform_settings WHERE key = 'is_demo')::boolean, false),
    'demo_expires_at', (SELECT value FROM platform_settings WHERE key = 'demo_expires_at'),
    'expired', COALESCE(
      (SELECT (value)::text::timestamptz < now() FROM platform_settings WHERE key = 'demo_expires_at'),
      false
    )
  );
$$;

GRANT EXECUTE ON FUNCTION demo_status_check() TO anon, authenticated, service_role;

-- ── RLS — same posture as production ────────────────────────────────────────
-- Bare ENABLE, no policies: the app always connects as service_role (which
-- bypasses RLS), so a policy-less "deny all" for anon/authenticated is
-- correct and matches production's supabase/migrations/*_enable_rls.sql.

ALTER TABLE gym_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_checkins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_freezes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff            ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales            ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_stats    ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_products    ENABLE ROW LEVEL SECURITY;

-- Views: REVOKE anon/authenticated SELECT + security_invoker=on, matching
-- production's supabase/migrations/20260715075323_secure_definer_views.sql.
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_member_status', 'v_member_full', 'v_currently_inside',
    'v_daily_attendance', 'v_expiring_soon', 'v_monthly_activations'
  ]
  LOOP
    EXECUTE format('REVOKE SELECT ON %I FROM anon, authenticated', v);
    EXECUTE format('ALTER VIEW %I SET (security_invoker = on)', v);
  END LOOP;
END $$;
