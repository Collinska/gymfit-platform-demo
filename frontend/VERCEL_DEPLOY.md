# Deploying the frontend to Vercel — DEMO environment

Config-only. Nothing here was deployed by Claude — these are the manual
steps to do in the Vercel dashboard yourself.

## 1) Vercel project config

**No `vercel.json` needed.** `next.config.js` has no custom build/output
settings (just `poweredByHeader`/`reactStrictMode`), and there's no
monorepo build tool (no Turborepo/Nx, no root `package.json` workspaces) —
Vercel's zero-config Next.js detection handles the build entirely on its
own once Root Directory is set correctly. If custom headers/redirects/
rewrites are ever needed later, add `vercel.json` then — don't add one
speculatively now.

The one thing that **does** need setting, because this is a monorepo
(`frontend/`, `erp_api/`, `sync_worker/`, `demo/` all in one repo):

> **Project Settings → General → Root Directory → `frontend`**

Without this, Vercel will try to build from the repo root and fail (no
`package.json` there).

## 2) Env vars — code audit

Checked every place the frontend reads Supabase/erp_api config
(`lib/env.ts`, `lib/supabase.ts`, `lib/erp-client.ts`, `middleware.ts`,
every `app/api/**/route.ts`) against `.env.local` (the real, current env
file) and `.env.example` (checked in, but stale — see below).

**Nothing is hardcoded.** All four vars are read via `process.env.*`
everywhere; no literal Supabase URL, anon key, or erp_api URL appears
anywhere in `frontend/` source.

**Fail-loud vs. silent-default, by var:**
| Var | Behavior if unset | Verdict |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (via `lib/env.ts`'s `getPublicEnv()`) | Throws `Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")` | ✅ fails loud |
| Same two, via `lib/supabase.ts` (`createClient(...)` with `!` non-null assertions) | No throw at import time; `createClient` gets `undefined` cast as `string`, so the first Supabase call fails with a Supabase-client error rather than the clear message above | ⚠ fails, but not loudly — see note below |
| `SUPABASE_SERVICE_ROLE_KEY` | Same `!`-assertion pattern in `lib/supabase.ts` | ⚠ same as above |
| `ERP_API_URL` — read independently in **27 files** (`lib/erp-client.ts` + 26 `app/api/**/route.ts`, each with its own `const ERP_BASE = process.env.ERP_API_URL ?? 'http://localhost:8000'`) | **Silently defaults to `http://localhost:8000`** | ⚠ silent default — flagged below |

**Flagged, not changed** (you said confirm/flag only, not fix — and fixing
the `ERP_API_URL` fallback would touch 27 files' worth of behavior,
including production's, for a demo-only concern):
- None of these defaults point at the *demo* project by accident — the
  `NEXT_PUBLIC_SUPABASE_*` path fails (just with a less clear error than
  `lib/env.ts`'s), and `ERP_API_URL`'s `localhost:8000` fallback is useless
  on Vercel (nothing listens there), so it fails too — just as a generic
  fetch/connection error on every ERP-backed page instead of one clear
  message pointing at the missing env var.
- **Practical consequence for this deploy:** if `ERP_API_URL` is left unset
  in Vercel, every POS/reports/wrap/staff/contract page will fail with an
  opaque connection error instead of refusing to boot — so treat setting it
  as non-optional (see the checklist below), not "will fail loudly if I
  forget it."

## 3) Env var template

[`.env.demo.vercel.example`](.env.demo.vercel.example) lists all 4 vars the
app actually needs, sourced from `.env.demo` (repo root, the demo Supabase
project — vjrwjqvycxzwxqmnilck) plus the Railway erp_api URL. This is the
real, current list — `.env.example` (checked into the repo) only lists 2 of
the 4 and is stale; not fixed here since it's out of scope for a demo-only
deploy, but worth a follow-up cleanup separately.

## 4) CORS — Railway ↔ Vercel

`erp_api`'s CORS `allow_origins` includes `FRONTEND_URL` (see
`erp_api/main.py` and `erp_api/RAILWAY_DEPLOY.md` step 4). That env var must
**exactly** match whatever domain Vercel assigns this project (e.g.
`https://gymfit-demo.vercel.app`) — scheme and host, no trailing slash. You
won't know that domain until after the first Vercel deploy, so this is
necessarily a two-step, do-it-yourself sequence (see the manual checklist
below): deploy to Vercel first, copy the domain, **then** go set/update
`FRONTEND_URL` in Railway and redeploy `erp_api` — until that redeploy
happens, ERP-backed requests from the Vercel frontend will fail CORS.

## 5) Demo banner / expiry — no Vercel-specific config

Traced the full chain:
- `components/DemoBanner.tsx` → `fetch("/api/demo/status")` (relative —
  works identically on any host)
- `middleware.ts`'s `isDemoExpired()` → `fetch(`${request.nextUrl.origin}/api/demo/status`)`
  (uses the request's own origin — works identically on any host)
- `app/api/demo/status/route.ts` → `supabaseAdmin.rpc("demo_status_check")`
  — driven purely by `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`

**Zero Vercel-specific env vars or assumptions anywhere in this chain.** As
long as the two Supabase vars above are set correctly for the demo project,
the banner and expiry gate work identically to local dev. Nothing to add,
nothing broken by moving to Vercel.

## Manual steps (Vercel dashboard)

1. **New Project** → Import the repo from GitHub.
2. **Root Directory** → set to `frontend` (see §1 above — required, this is
   a monorepo).
3. **Environment Variables** → paste each var from
   [`.env.demo.vercel.example`](.env.demo.vercel.example), with real values:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` — copied from `.env.demo` (repo root)
   - `ERP_API_URL` — the Railway erp_api service's public URL (see
     `erp_api/RAILWAY_DEPLOY.md` step 6) — **do not leave this unset** (§2)
4. **Deploy.**
5. **Copy the resulting domain** (e.g. `https://gymfit-demo.vercel.app`,
   or whatever Vercel assigns/you alias it to).
6. **Go back to Railway** → the `erp_api` service's Variables → set
   `FRONTEND_URL` to that exact domain → redeploy `erp_api` (see
   `erp_api/RAILWAY_DEPLOY.md` step 8 — this is the same step, from the
   other side).
7. **Verify**: open the deployed frontend, confirm the amber demo banner
   appears, log in with the demo manager account (`demo/seed.py`'s output),
   and confirm a POS/reports page that calls `erp_api` loads without a CORS
   or connection error (that's the signal `FRONTEND_URL` round-trip in step
   6 actually worked).

## Confirmation

This task **did not** touch `.env.local` (the real production frontend env
file), and made **zero** network calls to the production Supabase project
or production `erp_api` — everything above was static code reading
(`Read`/`Grep`) plus two new files (`.env.demo.vercel.example`, this
checklist). No deploy was performed.
