# RLS Readiness — STEP 3 Evidence Report

Supabase ref `ynunbegchlyyfhdffsim` · schema `public` · pooler `aws-1-ap-northeast-2.pooler.supabase.com:5432`
**No DDL executed. Migration withheld pending approval.**

---

## 1. FULL RLS INVENTORY — every table in `public`

Raw result of the Step-2 `pg_class` query, all 19 tables (nothing filtered):

| relname | rls_enabled | policy_count |
|---|---|---|
| checkins | **true** | 2 |
| erp_sync_log | **true** | 2 |
| face_vectors | **true** | 1 |
| freeze_requests | **true** | 2 |
| gym_checkins | **true** | 1 |
| gym_freezes | **true** | 1 |
| gym_members | **true** | 1 |
| gym_memberships | **true** | 1 |
| leads | **true** | 1 |
| members | **true** | 2 |
| membership_plans | **true** | 2 |
| memberships | **true** | 2 |
| monthly_stats | **true** | 1 |
| **period_duration_map** | **false** | **0** |
| **platform_settings** | **false** | **0** |
| role_permissions | **true** | 1 |
| staff | **true** | 4 |
| sync_log | **true** | 1 |
| **sync_state** | **false** | **0** |

**16 of 19 already have RLS enabled with ≥1 policy.** Exactly **3** are disabled: `period_duration_map`, `platform_settings`, `sync_state`. The audit examined all 19; only these three are in scope.

---

## 2. THE THREE TABLES — A/B/C/D classification with grep evidence

Client legend: **service** = `supabaseAdmin` (SERVICE_ROLE, bypasses RLS) or `postgres`-owner psycopg2 (bypasses RLS); **anon** = browser anon client (subject to RLS). All `app/api/**` files are **server** route handlers (no `'use client'`).

### 2.1 `platform_settings` — Category **A** (service/owner-only)

| Evidence (grep hit) | Client | Runtime |
|---|---|---|
| `erp_api/business_settings.py:60` `SELECT key, value FROM platform_settings …` | postgres direct | Python server |
| `erp_api/email_service.py:36` `SELECT key, value FROM platform_settings` | postgres direct | Python server |
| `sync_worker/sync_worker.py:342` `SELECT value FROM platform_settings …` | postgres direct | Python server |
| `frontend/app/api/settings/route.ts:9,36` `.from('platform_settings')` | supabaseAdmin (service) | server |
| `frontend/app/api/branding/route.ts:10` `.from("platform_settings")` | supabaseAdmin (service) | server |
| `frontend/app/api/branding/logo/route.ts:45,63` `.from("platform_settings")` | supabaseAdmin (service) | server |
| `frontend/app/api/churn/route.ts:37` `supabaseAdmin.from('platform_settings')…` | supabaseAdmin (service) | server |
| `frontend/app/api/public/leads/route.ts:119` `.from("platform_settings")` | supabaseAdmin (service) | server |
| `frontend/scripts/migrate_settings.mjs:13` `admin.from('platform_settings').upsert(…)` | SERVICE_ROLE | Node CLI |

**No anon/browser reference exists.** Every accessor bypasses RLS → enabling RLS bare denies only roles that never touch it. **Breakage: none** — all 9 call sites use service/owner.

### 2.2 `period_duration_map` — Category **A** (unreferenced)

| Evidence | Client | Runtime |
|---|---|---|
| *(grep across `*.ts,*.tsx,*.py,*.mjs` excl. venv/node_modules/.next → **0 matches**)* | — | — |
| `pg_depend` view/rule dependency check → **0 objects** | — | — |

Referenced by no code and no view. Owned by `postgres`. **Breakage: none** — nothing reads or writes it.

### 2.3 `sync_state` — Category **A** (sync_worker only, postgres-direct)

| Evidence (grep hit) | Client | Runtime |
|---|---|---|
| `sync_worker/api.py:34` `SELECT key, value, updated_at FROM sync_state …` | postgres direct | Python server |
| `sync_worker/api.py:79,85` `INSERT INTO sync_state …` | postgres direct | Python server |
| `sync_worker/sync_worker.py:158` `SELECT value FROM sync_state …` | postgres direct | Python server |
| `sync_worker/sync_worker.py:181,582,665` `INSERT INTO sync_state …` | postgres direct | Python server |

Only the sync worker touches it, as the `postgres` owner. **Breakage: none** — owner role bypasses RLS.

**All three are Category A. None are B, C, or D. No anon INSERT/SELECT policy is required anywhere.**

---

## 3. STEP 1 — Key-usage table + explicit answers

### 3.1 Full client-construction table

| File | Key | Runtime | Purpose |
|---|---|---|---|
| `frontend/lib/supabase.ts` | SERVICE_ROLE (`supabaseAdmin`) + ANON (`supabase`) | Server only | Admin + anon clients |
| `frontend/lib/supabase/server.ts` | ANON | Server (SSR cookies) | Session client |
| `frontend/lib/supabase/browser.ts` | ANON | **Browser** (`'use client'`) | Session client |
| `frontend/lib/env.ts` | ANON only (provider) | Isomorphic | Returns `NEXT_PUBLIC_` pair; never service key |
| `frontend/middleware.ts` | ANON | Edge/server | Session refresh |
| `frontend/components/dashboard/Sidebar.tsx` | ANON | Browser | `auth.signOut()` |
| `frontend/app/login/page.tsx` | ANON | Browser | `auth.signIn` |
| `frontend/hooks/use-realtime-channel.ts` | ANON | Browser | Realtime — **dead code (imported nowhere)** |
| `frontend/lib/auth.ts` | ANON (server client) + SERVICE_ROLE (`supabaseAdmin`) | Server only | Auth helpers |
| `frontend/lib/permissions-server.ts` | SERVICE_ROLE | Server only | Permission checks |
| `frontend/scripts/migrate_settings.mjs` | SERVICE_ROLE (hardcoded fallback) | Node CLI (not bundled) | One-off migration |
| `erp_api/routers/staff.py` | SERVICE_KEY + postgres direct | Python server | Auth admin |
| `erp_api/seed_admin.py` | SERVICE_ROLE + postgres direct | Python CLI | Seed admin |
| `erp_api/business_settings.py`, `email_service.py`, `wrap*.py`, `print_receipt.py` | postgres direct | Python server | Reads settings |
| `sync_worker/config.py`, `api.py`, `sync_worker.py` | postgres direct (`SUPABASE_DB_USER=postgres`) | Python server | Sync engine |

### 3.2a — Does the service role key reach any `'use client'` file / `NEXT_PUBLIC_` var / browser path?

**NO.** Proof:

```
$ grep -rniE "NEXT_PUBLIC_.*SERVICE|SERVICE.*NEXT_PUBLIC" (frontend, *.ts/tsx/mjs)
NONE

$ grep -rln "SUPABASE_SERVICE_ROLE_KEY" (frontend)
./lib/supabase.ts
./scripts/migrate_settings.mjs

$ # of all files referencing SUPABASE_SERVICE_ROLE_KEY or supabaseAdmin,
$ # any with 'use client' in first 3 lines?
(none)
```

- `lib/supabase.ts` reads `process.env.SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix → never exposed to the browser bundle) and has no `'use client'`.
- `scripts/migrate_settings.mjs` is a standalone Node script, never imported by the app/bundler.
- No client component imports `supabaseAdmin`.

> 🔶 **HIGH (repo-hygiene, not a browser leak):** `frontend/scripts/migrate_settings.mjs:8` hardcodes a **real `service_role` JWT** as a `|| '…'` fallback. It is **not** git-tracked and **not** in history, but `scripts/` is **not** gitignored. Recommend: remove the inline fallback, **rotate that key**, add an ignore rule.

### 3.2b — Is any real key committed in `.env*` git history?

**NO.** Proof:

```
$ git ls-files -- .env* **/.env* **/.env
(empty — none tracked)

$ git log --all --oneline -- .env* **/.env* **/.env
(empty — none in history)
```

> 🔶 **HIGH (latent):** on-disk `erp_api/.env` and `sync_worker/.env` hold real secrets and are **not gitignored** (no root `.gitignore` env rule; only `frontend/.gitignore` covers `frontend/.env*`). Clean today, but unprotected. Recommend root `.gitignore`: `**/.env`, `**/.env.local`.

---

## 4. Is `leads` (the `/join` form table) one of the three?

**NO.** `leads` already has **RLS enabled with 1 policy** (see §1) and is **not** in the disabled set.

Even so, the write path is confirmed **service-role, server-side** — so it would be Category **A**, not D, regardless:

```
frontend/app/api/public/leads/route.ts:94
    const { error } = await supabaseAdmin.from("leads").insert({ ...base, created_by: "website" });
frontend/app/api/public/leads/route.ts:96
    const retry = await supabaseAdmin.from("leads").insert(base);
```

The unauthenticated `/join` page (`app/join/page.tsx`) does **not** touch Supabase directly — it `POST`s JSON to the server route `/api/public/leads`, which inserts using **`supabaseAdmin` (SERVICE_ROLE)**. All other `leads` access (`app/api/leads/route.ts`, `app/api/leads/[id]/route.ts`) is likewise `supabaseAdmin` on server routes. **There is no browser anon insert into `leads`.**

**Conclusion:** `/join` is *not* a bare-RLS hazard. No Category-D anon INSERT policy is needed; `leads` is out of scope (already enabled) and its policy will not be modified.

---

## Scope for the (pending) migration
Enable RLS, zero policies, on the three Category-A tables only — `platform_settings`, `period_duration_map`, `sync_state`. The 16 already-enabled tables and their existing policies will not be touched. No `USING (true)`, no non-IMMUTABLE casts. Predicted route breakage: **none** (evidence per table in §2).

**STOP — awaiting approval before emitting the migration.**
