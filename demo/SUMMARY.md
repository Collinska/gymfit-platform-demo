# GymFit Demo Environment — Summary

**Status:** Built, tested live in-browser, verified working. ✅

## What it is
A fully separate demo of GymFit — own Supabase project (`vjrwjqvycxzwxqmnilck`, eu-west-1), never touches production (`ynunbegchlyyfhdffsim`). Self-expires 7 days after seeding.

## What's inside
- **Schema + RLS** ([schema.sql](schema.sql)) — same tables/views as production, identical RLS posture (bare `ENABLE`, `security_invoker=on` on views, zero anon grants).
- **Self-expiry** — gated by Postgres's own `now()`, not any client clock. Blocks the whole app past `demo_expires_at`: erp_api returns 403, Next.js redirects to `/demo-ended`.
- **Amber banner** on every authenticated page: "DEMO ENVIRONMENT — expires in X days."
- **Demo manager login** — full access except Settings (Business Profile/Staff/RBAC), confirmed blocked both from the nav and by direct URL.
- **Seed data** ([seed.py](seed.py)) — 25 members (20 active/3 expired/2 no-membership), 8 leads, 10 days of check-ins, 15 POS sales. Idempotent, re-runnable.
- **Branding** — shows "Fitness Mania" throughout (not a separate demo brand name).

## Verified live (not just tested via API)
Logged in as the demo manager and confirmed: correct branding, working amber banner, dashboard populated with real seeded numbers, member list rendering correctly, Settings blocked at both nav and route level.

## Credentials
Printed once by `seed.py` to the console — not stored anywhere else. Re-run `seed.py` to reset the password if lost.

## Before showing a real client
1. Rename the manager email in `seed.py` (currently a placeholder).
2. Reset expiry to a fresh 7 days (SQL in [README.md](README.md)).
3. Re-run `seed.py` for fresh data.

## Full details
See [README.md](README.md) for setup, extending/resetting expiry, revoking the demo user, and the reminder to delete the demo Supabase project after the trial ends.
