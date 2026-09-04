# Deploying erp_api to Railway — DEMO environment

Config-only. Nothing here was deployed by Claude — these are the manual
steps to do in the Railway dashboard yourself.

## Before you start

Have `.env.demo` (repo root) open — you'll copy real values from it into
Railway's dashboard by hand. **Never paste `ynunbegchlyyfhdffsim` (production)
credentials anywhere in this deployment.**

## Manual steps (Railway dashboard)

1. **Create a new Railway project** — dashboard → New Project.
2. **Connect the repo** — "Deploy from GitHub repo", select this repo.
3. **Set the service root** — in the new service's Settings → set **Root
   Directory** to `erp_api` (this is a monorepo; Railway needs to know only
   this subfolder is the service, so it picks up `erp_api/railway.json`,
   `erp_api/nixpacks.toml`, and `erp_api/requirements.txt` correctly).
4. **Set environment variables** — Settings → Variables → paste each var
   from [`.env.demo.railway.example`](.env.demo.railway.example), with real
   values copied from `.env.demo`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (from `.env.demo`)
   - `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_NAME`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD` (from `.env.demo`)
   - `ENV_MODE=live`, `ERP_HOST=unused-demo-placeholder`, `ERP_PORT=6161`, `ERP_USER=unused`, `ERP_PASSWORD=unused`, `ERP_DATABASE=FR8RootDB` — placeholders; the demo never actually reaches a real ERP, but these must be non-empty (see the comment in the example file for why)
   - `FRONTEND_URL` — fill this in **after** the Vercel frontend is deployed and you have its real domain; redeploy this service once it's set
   - Do **not** set `PORT` — Railway injects it automatically
5. **Deploy** — Railway auto-builds on connect; watch the build log for the
   `unixodbc-dev` install step (from `nixpacks.toml`) before the `pip
   install` step — if that's missing, the build will fail on `pyodbc`.
6. **Verify** — once deployed, hit `https://<your-service>.up.railway.app/health`
   → should return `{"status":"ok"}` immediately (no DB touched).
7. **Copy the Railway service URL** — you'll need it as `ERP_API_URL` in the
   Vercel frontend's own env vars (separate deployment, not covered here).
8. **After the Vercel frontend is deployed:** come back to step 4, set the
   real `FRONTEND_URL`, and redeploy this service so CORS allows it.

## What NOT to do

- Don't add a second Railway service for `sync_worker` (port 8001) — the
  demo database is static/pre-seeded; nothing should ever attempt to sync
  against FusionERP/FR8RootDB from this deployment. See the confirmation
  below for why none of erp_api's code needs it running anyway.
- Don't set `PORT` manually — Railway provides it, and the start command
  already reads `$PORT`.
