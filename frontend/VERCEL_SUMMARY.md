# Vercel deployment scaffold — Summary

**Status:** Config/docs only — nothing deployed. ✅

## What was done
Scaffolded the frontend's Vercel deployment for the GymFit **demo** environment (separate from production `ynunbegchlyyfhdffsim`), mirroring the earlier Railway scaffold for `erp_api`. Two new files, no code changes.

## 1) Vercel project config
No `vercel.json` needed — `next.config.js` has no custom build settings and there's no monorepo build tool. The one required setting: **Root Directory → `frontend`** in the Vercel dashboard (repo also contains `erp_api/`, `sync_worker/`, `demo/`).

## 2) Env var audit — nothing hardcoded, two soft spots flagged
Checked every place the app reads Supabase/erp_api config (`lib/env.ts`, `lib/supabase.ts`, `lib/erp-client.ts`, `middleware.ts`, all `app/api/**/route.ts`). No literal URL/key anywhere in source. Flagged, not changed (fixing would touch production behavior too):
- `lib/supabase.ts` uses `!` non-null assertions for the Supabase vars instead of `lib/env.ts`'s explicit throw — still fails if unset, just with a less clear error.
- **`ERP_API_URL`** is read independently in **27 files** (`lib/erp-client.ts` + 26 API routes), each defaulting to `http://localhost:8000` if unset. Dead on Vercel — so an unset `ERP_API_URL` breaks every ERP-backed page with an opaque connection error instead of a clear "missing env var" message. Must be set.
- `.env.example` (checked into the repo) is stale — lists 2 of the 4 real vars. Not fixed here (out of scope for a demo-only deploy).

## 3) Env var template
[`.env.demo.vercel.example`](.env.demo.vercel.example) — the real 4-var list (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ERP_API_URL`), sourced from `.env.demo` + the Railway erp_api URL.

## 4) CORS ↔ Railway
`erp_api`'s `FRONTEND_URL` needs an **exact** origin match to whatever domain Vercel assigns. Necessarily sequential: deploy Vercel first, copy the domain, then set `FRONTEND_URL` in Railway and redeploy `erp_api`.

## 5) Demo banner / expiry
Traced `DemoBanner.tsx` → `middleware.ts` → `/api/demo/status` → `demo_status_check()` RPC. Zero Vercel-specific config anywhere — works identically to local dev.

## Manual steps
Full 7-step dashboard checklist (New Project → Root Directory → env vars → deploy → copy domain → update Railway's `FRONTEND_URL` → verify) is in [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md).

## Safety
Did not touch `.env.local` (production frontend env). Made zero network calls to the production Supabase project or production `erp_api` — this task was static code reading only.
