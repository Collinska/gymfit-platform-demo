# Deploying erp_api to Render — DEMO environment

Config-only. Nothing here was deployed by Claude — these are the manual
steps to do in the Render dashboard yourself.

## Why Render, and why Docker

This replaces an earlier Railway scaffold (`RAILWAY_DEPLOY.md`, kept for
reference) — Railway's dashboard repeatedly failed to apply its own staged
Builder/Root-Directory/Config-Path settings reliably through several
attempts, burning real time against a $5 trial budget. Render's Blueprint
file (`render.yaml`, repo root) is a committed, reviewable alternative to
clicking through a dashboard — the monorepo scoping and build config are in
git, not dashboard state.

The service builds from a **Dockerfile** (`erp_api/Dockerfile`), not
Render's native Python buildpack — `pyodbc` needs the unixODBC runtime
library (`libodbc.so.2`) just to *import*, not only to connect, and Render's
native runtime has no supported way to apt-get install that. Docker sidesteps
the question entirely.

## Before you start

Have `.env.demo` (repo root) open — you'll copy real values from it into
Render's dashboard by hand. **Never paste `ynunbegchlyyfhdffsim` (production)
credentials anywhere in this deployment.**

## Manual steps (Render dashboard)

1. **New → Blueprint** — Render dashboard → New → Blueprint, connect the
   `Collinska/gymfit-platform-demo` GitHub repo. Render reads `render.yaml`
   at the repo root automatically and proposes the `gymfit-erp-api-demo`
   service from it.
2. **Confirm the plan** — Blueprint creation shows a preview of what it's
   about to create (`gymfit-erp-api-demo`, Docker, region `oregon`, plan
   `free`). Approve it.
3. **Fill in the env vars** — Render prompts for every `sync: false` var in
   `render.yaml` during Blueprint creation:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_HOST`,
     `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD` — copy from `.env.demo`
   - `FRONTEND_URL` — leave blank for now (see step 6); Render will let you
     create the service without it, or you can set a temporary placeholder
     and fix it later
   - `SUPABASE_DB_PORT` / `SUPABASE_DB_NAME` / `DEMO_MODE` already have
     values baked into `render.yaml` — nothing to fill in for those
4. **Deploy** — Render builds the Docker image (watch for the `apt-get
   install unixodbc unixodbc-dev` step in the build log — if that's missing,
   something's off with the Dockerfile being picked up) and starts the
   container.
5. **Verify** — once live, hit `https://<your-service>.onrender.com/health`
   → should return `{"status":"ok"}` immediately (no DB touched).
6. **Copy the Render service URL** — you'll need it as `ERP_API_URL` in the
   Vercel frontend's own env vars (see `frontend/VERCEL_DEPLOY.md`).
7. **After the Vercel frontend is deployed:** come back to this service's
   Environment tab in Render, set the real `FRONTEND_URL`, save — Render
   auto-redeploys on env var changes, so CORS picks it up without a manual
   rebuild.

## What NOT to do

- Don't add a second Render service for `sync_worker` — the demo database is
  static/pre-seeded; nothing should ever attempt to sync against
  FusionERP/FR8RootDB from this deployment.
- Don't set `PORT` yourself — Render injects it, and the Dockerfile's `CMD`
  already reads `$PORT`.
- Don't set `ENV_MODE`/`ERP_HOST`/`ERP_USER`/`ERP_PASSWORD`/`ERP_DATABASE` —
  unlike the earlier Railway scaffold, these are no longer required even as
  placeholders (see the note at the bottom of `render.yaml` for why).

## A real gotcha already hit once — noted here so it isn't repeated

`dockerfilePath` and `dockerContext` are relative to `rootDir` once
`rootDir` is set, **not** to the repo root — confirmed against
[render.com/docs/monorepo-support](https://render.com/docs/monorepo-support)
("Root-relative settings"). The first version of `render.yaml` had them
repo-root-relative (`./erp_api/Dockerfile`), which Render then resolved as
`rootDir` + that path = `erp_api/erp_api/Dockerfile` — a doubled path that
failed the very first deploy with `no such file or directory`. Fixed now
(`./Dockerfile` / `.`, both relative to `erp_api/`) — if you ever add
another root-relative field (`buildCommand`, `startCommand`,
`preDeployCommand`, `staticPublishPath`), remember it needs the same
treatment.

## If something else in `render.yaml` gets rejected

The rest of the Blueprint schema (`runtime: docker`, `rootDir`,
`healthCheckPath`, `envVars` with `sync: false`) was verified against
Render's own docs when this was written. If the dashboard's Blueprint
preview errors on a specific key, check
[render.com/docs/blueprint-spec](https://render.com/docs/blueprint-spec) for
the current name and fix `render.yaml` directly (it's a normal file in this
repo) rather than falling back to manually clicking through service
settings — that manual-dashboard-state approach is exactly what didn't work
reliably on Railway.
