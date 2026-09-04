# GymFit — Demo Environment

A self-expiring, fully separate demo of GymFit for client walkthroughs. Runs
on its **own** Supabase project — never production (`ynunbegchlyyfhdffsim`).

## Project details

- **Demo Supabase project ref:** `vjrwjqvycxzwxqmnilck`
- **Region:** eu-west-1 (production is ap-northeast-2 — deliberately different infra)
- Connection details live in `../.env.demo` (git-ignored — never commit it)

## What's in this directory

| File | Purpose |
|---|---|
| `schema.sql` | Full table/view/RLS setup for the demo project. Idempotent — safe to re-run (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE VIEW/FUNCTION`). |
| `seed.py` | Idempotent seed: demo manager login, 25 members, 8 leads, 10 days of check-ins, 15 POS sales. Refuses to run without a valid, non-production `.env.demo`. |

## First-time setup

```bash
cd demo
python seed.py
```

This applies nothing by itself — run `schema.sql` against the demo project
first (via the Supabase SQL editor, or `psql`/psycopg2 with `.env.demo`'s
credentials), *then* `seed.py`. `seed.py` prints the demo manager's login
email + a freshly generated password at the end — **save it immediately**,
it is never written to disk or logged anywhere. Re-running `seed.py` resets
the password and prints a new one.

## Deploying it (important — read before you go looking for a toggle)

This demo reuses the *same* `erp_api` and `frontend` codebases as
production — there is no "demo mode" flag baked into a single running
instance. Instead, run **separate deployments** of both, each with its own
`.env` copied from `.env.demo`'s Supabase credentials (not the production
`.env`/`.env.local`). The self-expiry check
([erp_api/demo_guard.py](../erp_api/demo_guard.py),
[frontend/middleware.ts](../frontend/middleware.ts)) is a no-op wherever no
`is_demo` row exists in that deployment's own database — so it's silent on
production, and enforced automatically on the demo deployment, purely based
on which Supabase project that instance's `.env` points at.

## How self-expiry works

- `platform_settings` holds two keys: `is_demo` (`true`) and
  `demo_expires_at` (a `timestamptz`, seeded to `now() + 7 days` at seed
  time).
- Expiry is decided by **Postgres's own `now()`** via the
  `demo_status_check()` SQL function — never a client or server wall clock
  (the app has a separate, real host-clock-drift issue elsewhere; nothing
  here trusts a local timestamp for something that gates access).
- Once expired: `erp_api` returns 403 on every route except `/health`;
  Next.js middleware rewrites every page (except `/demo-ended` and `/api/*`)
  to a "Demo period has ended — contact Fitness Mania" page.
- A dismissible-but-reappearing amber banner ("DEMO ENVIRONMENT — expires in
  X days") shows on every authenticated page while still active
  ([frontend/components/DemoBanner.tsx](../frontend/components/DemoBanner.tsx)).

## Extending or resetting the 7-day expiry

Run against the demo project (never production):

```sql
UPDATE platform_settings
SET value = to_jsonb((now() + interval '7 days')::timestamptz), updated_at = now()
WHERE key = 'demo_expires_at';
```

Change the interval for a longer/shorter extension. Takes effect within
~60 seconds (both the API and middleware cache the check for that long).

## Revoking the demo user early

```sql
-- Blocks login immediately without deleting the account (matches how
-- staff deactivation works elsewhere in this app).
UPDATE staff SET is_active = false WHERE email = 'demo@fitnessmania.co';
```

Then ban the Supabase Auth user itself via the dashboard (Authentication →
Users → find the demo email → Ban user), or via the Auth Admin API with a
long `ban_duration` (same pattern as `erp_api/routers/staff.py`).

## After the trial ends

**Delete the demo Supabase project** (Settings → General → Delete project)
rather than leaving it running indefinitely — it holds no real customer
data, but it's still a live, billable, internet-reachable instance with an
active login. Don't rely on `demo_expires_at` alone to retire it; that only
gates the *app*, not the database itself, which stays queryable directly
via its connection string until the project is actually deleted.

## Demo manager login

Email is fixed at `demo@fitnessmania.co` — the whole demo is branded as
Fitness Mania itself, not a separate reseller identity. To change it, edit
the `email = ...` line in `seed_demo_manager()` and re-run `seed.py`.
