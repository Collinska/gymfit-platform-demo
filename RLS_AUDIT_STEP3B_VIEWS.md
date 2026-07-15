# Security-Definer View Audit — STEP 3B Evidence Report

Supabase ref `ynunbegchlyyfhdffsim` · schema `public` · pooler `aws-1-ap-northeast-2.pooler.supabase.com:5432`
Scope: the 6 views flagged `Security Definer View` by the Security Advisor.
**No DDL executed or emitted. Awaiting review; REVOKE and invoker-flip may be approved separately.**

Context: RLS was enabled on `platform_settings`, `period_duration_map`, `sync_state` (STEP 3A migration `20260715072437_enable_rls.sql`, applied). These views are a **separate, pre-existing** exposure: they run as owner (RLS-bypassing) and grant SELECT to the public `anon` role. Live test: **`v_member_status` returns all 1,842 members (names, mobiles, photo_url, card_id) to the `anon` role.**

---

## 1. INVENTORY

| View | Kind | security_invoker | Owner | Base relations it SELECTs from |
|---|---|---|---|---|
| `v_member_full` | VIEW | **unset** (=off) | postgres | `checkins`, `members`, `membership_plans`, `memberships` |
| `v_member_status` | VIEW | **unset** (=off) | postgres | `gym_members`, `gym_memberships` |
| `v_currently_inside` | VIEW | **unset** (=off) | postgres | `checkins`, `members`, `membership_plans`, `memberships` |
| `v_daily_attendance` | VIEW | **unset** (=off) | postgres | `checkins` |
| `v_expiring_soon` | VIEW | **unset** (=off) | postgres | `members`, `membership_plans`, `memberships` |
| `v_monthly_activations` | VIEW | **unset** (=off) | postgres | `membership_plans`, `memberships` |

**All 6 are plain VIEWs — none are MATERIALIZED VIEWs.** `security_invoker` applies to every one; no matview requires separate handling.

### Grantees (SELECT) — `information_schema.role_table_grants`

Every view grants SELECT to the same four roles, **including `anon`**:

| View | Grantees with SELECT |
|---|---|
| `v_member_full` | **anon**, authenticated, postgres, service_role |
| `v_member_status` | **anon**, authenticated, postgres, service_role |
| `v_currently_inside` | **anon**, authenticated, postgres, service_role |
| `v_daily_attendance` | **anon**, authenticated, postgres, service_role |
| `v_expiring_soon` | **anon**, authenticated, postgres, service_role |
| `v_monthly_activations` | **anon**, authenticated, postgres, service_role |

`anon` = the public `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Because `security_invoker` is off, each view executes as owner `postgres` and **bypasses the RLS on the base tables**, so the anon grant is a direct read path to the underlying data via PostgREST.

**Live exposure proof (SET ROLE anon):**

| View | Rows visible to `anon` right now |
|---|---|
| `v_member_status` | **1842 — LEAKS** (full roster) |
| `v_member_full` | 0 *(view logic returns 0 now; same PII columns — structurally exposed)* |
| `v_currently_inside` | 0 *(nobody currently inside)* |
| `v_daily_attendance` | 0 *(no attendance today yet)* |
| `v_expiring_soon` | 0 *(none in window)* |
| `v_monthly_activations` | 0 *(none this period)* |

The five 0-row results are because each view's own WHERE-logic returns nothing at this instant — **not** because anon is blocked. `v_member_status` proves the grant is live.

---

## 2. READ-PATH EVIDENCE

Grep across `*.ts,*.tsx,*.py,*.mjs` (excl. `.venv`, `node_modules`, `.next`, audit `.md`s).

### `v_member_status` — 6 call sites, all service-key server routes

| file:line | client | runtime |
|---|---|---|
| `frontend/app/api/analytics/route.ts:24` `.from('v_member_status')` | supabaseAdmin (service_role) | server (no `'use client'`) |
| `frontend/app/api/churn/route.ts:40,51` `supabaseAdmin.from('v_member_status')` | supabaseAdmin (service_role) | server |
| `frontend/app/api/gym-wrap/members/route.ts:34` `fetchAll("v_member_status", …)` → `supabaseAdmin.from(table)` (line 15) | supabaseAdmin (service_role) | server |
| `frontend/app/api/members/expiring/route.ts:13,21` `supabaseAdmin.from('v_member_status')` | supabaseAdmin (service_role) | server |
| `frontend/app/api/members/route.ts:76` `supabaseAdmin.from("v_member_status")` | supabaseAdmin (service_role) | server |
| `frontend/app/api/stats/route.ts:48,49,52,77,79` `supabaseAdmin.from("v_member_status")` | supabaseAdmin (service_role) | server |

`use client` count in all 6 files = **0**. The `fetchAll` helper in gym-wrap resolves to `supabaseAdmin.from(table)` (line 15), so it is service-key too.

### `v_member_full`, `v_currently_inside`, `v_daily_attendance`, `v_expiring_soon`, `v_monthly_activations`

**No code references at all** (0 matches across the codebase). These views are not read by any server route, script, or client — the app does not use them.

### Browser-anon reader check
```
$ grep -rl createSupabaseServerClient app | xargs grep -l v_member_status
NONE  (no anon-session/server-anon reader of v_member_status)
```
The browser anon client (`createSupabaseBrowserClient`) is used only for `auth.signIn/signOut` (Sidebar, login) and the **dead** `use-realtime-channel.ts`. It never selects any of these 6 views. **Claim confirmed: every dashboard read of these views is a service-key server route; the browser anon client never selects them.**

---

## 3. RLS-FILTER RISK (post-`security_invoker=on`)

Flipping `security_invoker=on` moves each view onto the **caller's** RLS. Any reader that is *not* service_role would then get its rows RLS-filtered.

| View | Readers | All service-key? | Risk after flip |
|---|---|---|---|
| `v_member_status` | 6 sites, all `supabaseAdmin` (service_role) | ✅ yes | **None** — service_role has `BYPASSRLS`; returns full rows as today |
| `v_member_full` | none | ✅ (vacuously) | None |
| `v_currently_inside` | none | ✅ | None |
| `v_daily_attendance` | none | ✅ | None |
| `v_expiring_soon` | none | ✅ | None |
| `v_monthly_activations` | none | ✅ | None |

**No view is read by a non-service path** — no `authenticated`/anon-session reader exists for any of the six. Therefore the invoker-flip does not RLS-filter any live reader.

**No evidence is weaker for any view** — `v_member_status` has the *strongest* evidence (6 explicit service-key sites); the other five have *no* readers to break. So there is **no need to split** REVOKE from the invoker-flip on evidentiary grounds. (You may still choose to stage them for operational caution — REVOKE first to stop the leak immediately, invoker-flip second to clear the advisor — but the evidence supports doing both together.)

---

## 4. PROPOSED MIGRATION — WITHHELD (not applied, not emitted as a runnable file)

For each of the 6 plain views (no matviews present):

```sql
-- v_member_full
REVOKE SELECT ON public.v_member_full        FROM anon, authenticated;
ALTER VIEW      public.v_member_full        SET (security_invoker = on);

-- v_member_status
REVOKE SELECT ON public.v_member_status      FROM anon, authenticated;
ALTER VIEW      public.v_member_status      SET (security_invoker = on);

-- v_currently_inside
REVOKE SELECT ON public.v_currently_inside   FROM anon, authenticated;
ALTER VIEW      public.v_currently_inside   SET (security_invoker = on);

-- v_daily_attendance
REVOKE SELECT ON public.v_daily_attendance   FROM anon, authenticated;
ALTER VIEW      public.v_daily_attendance   SET (security_invoker = on);

-- v_expiring_soon
REVOKE SELECT ON public.v_expiring_soon      FROM anon, authenticated;
ALTER VIEW      public.v_expiring_soon      SET (security_invoker = on);

-- v_monthly_activations
REVOKE SELECT ON public.v_monthly_activations FROM anon, authenticated;
ALTER VIEW      public.v_monthly_activations SET (security_invoker = on);
```

- `security_invoker = on` (not `true`).
- `REVOKE` stops the anon/authenticated read path immediately; the invoker-flip clears the "Security Definer View" advisor error and makes each view honor the caller's RLS.
- No `USING (true)`, no policy, no data change. Service-key server routes are unaffected (service_role retains its grant and bypasses RLS).

**Splitting option (if you prefer to stage):** the two statements are independent and can be approved/applied separately per the evidence in §3 — REVOKE all six now, apply the invoker-flip after. Neither ordering breaks a live reader.

---

**STOP — report only. No DDL emitted or applied. Awaiting your approval (and your call on whether to split REVOKE from the invoker-flip).**
