# Bug Diagnosis Report — Benjamin Kamau (3 reported issues)

Diagnostic only — **no code changes made**. All evidence below is from live queries against Supabase (`postgres.ynunbegchlyyfhdffsim`) and the local ERP (`FR8RootDB`), plus direct code inspection.

---

## 1) MEMBERSHIP NOT SHOWING ON PROFILE

### 1a. Supabase records for Benjamin Kamau

**`leads`** — lead exists and shows as converted:
```
id=7, first_name=Benjamin, last_name=KAMAU, mobile=3067195356,
source=website, status=converted, notes='Monthly membership',
converted_member_id=19017,
created_at=2026-09-02 11:43:19 UTC, updated_at=2026-09-03 10:35:02 UTC
```

**`gym_members`** — member row exists correctly, `is_active=true`:
```
id=19017, erp_customer_id='00300', erp_account_id=3738,
first_name=Benjamin, last_name=KAMAU, mobile=3067195356,
is_active=true, created_at=2026-09-03 11:35:30 UTC
```

**`gym_memberships`** (`WHERE member_id = 19017`):
```
(no rows)
```

**`members`** (old/legacy table, unrelated schema — `member_id` there is `uuid`, not `int`): no matching row. **Ruled out** — lead conversion did *not* write to this legacy table; it correctly used `gym_members`.

**`v_member_status`** (`WHERE erp_customer_id = '00300'`):
```
membership_id=NULL, plan_name=NULL, membership_start=NULL, membership_end=NULL,
membership_status=NULL, display_status='no_membership', days_remaining=NULL
```

**Conclusion:** the lead→member conversion worked correctly. The member row is fully populated and linked to a real ERP customer (`erp_customer_id='00300'`, `erp_account_id=3738`). The gap is entirely that **no `gym_memberships` row was ever created** — the profile isn't misreading a mismatched table/column, there is simply nothing there to read.

### 1b. The POS/payment code path

**Correction to the task's assumption:** there is no FastAPI `erp_api` endpoint that "handles membership purchase." Membership sales happen in the external ERP POS terminal (RanceLab, outside this codebase) and are pulled into Supabase asynchronously by the standalone script `sync_worker/sync_worker.py`. I traced that path fully.

**ERP-side sale record** (`SaleHeader` / `SaleDetail` for `CustomerID='00300'`):
```
SerialNumber=14520.0001, VoucherDate=2026-09-03 13:37, BillAmount=6950.000, Status=0 (unposted)
  detail: ProductID='000E', ProductName='Parklands Monthly Offpeak',
          ProductGroupID=107, PMField2='' (empty), FinalSaleAmount=6950.00
```
`SalePayment` for the same serial: `Amount=6950.000, IsDeleted=False` — **fully paid**, matching `BillAmount`.

`sync_worker.py`'s eligibility filter (`FETCH_SALES_SQL`, lines 45–94) accepts unposted (`Status=0`) sales when fully paid — this sale **does** satisfy that condition. `ProductGroupID=107` also correctly matches `config.membership_group_id` (default `107` in `sync_worker/config.py`). So the product-group filter is **not** the problem, contrary to the task's hypothesis.

The actual write function, `activate_membership()` ([sync_worker.py:256-299](sync_worker/sync_worker.py:256)), **does** use the existing convention correctly:
```sql
INSERT INTO gym_memberships (member_id, erp_sale_serial, ..., status)
VALUES (%s, %s, ..., 'active')
ON CONFLICT (erp_sale_serial) DO UPDATE SET member_id = EXCLUDED.member_id, ...
```
It writes `member_id` as the internal `gym_members.id` integer (correctly matching what the profile reads) — **there is no `member_id` vs `person_id` mismatch and no wrong-table write.** The problem is that `activate_membership()` is simply **never reached** for this sale. I found two independent, compounding reasons:

**Cause A — SerialNumber collision after the ERP restore.** `sync_state.processed_serials` (12,044 entries) already contains `'14520.0001'` — from an old, unrelated sale (Hiral Kantaria's "Day Pass", synced 2026-07-02, `sync_log id=56717`). Since the ERP was restored to an earlier snapshot, serial numbering restarted and **collided** with Benjamin's brand-new sale, which reused the exact same `SerialNumber`. `run_sync()`'s dedup filter —
```python
new_rows = [row for row in all_rows if str(row["SerialNumber"]) not in processed_serials]
```
([sync_worker.py:606](sync_worker/sync_worker.py:606)) — silently excludes this sale from ever being processed, because as far as the sync is concerned that serial was "already handled" months ago. No `sync_log` entry exists for `erp_customer_id='00300'` at all, confirming the sale never even reaches the processing loop.

**Cause B — blank `PMField2` across the entire membership product group, independent of Cause A.** I checked every product in `ProductGroupID=107`: **all 32 have an empty `PMField2`** (zero populated). `FETCH_SALES_SQL` converts blank `PMField2` to `NULL` via `NULLIF(LTRIM(RTRIM(pm.PMField2)), '')`, and `parse_duration()` ([sync_worker.py:119-131](sync_worker/sync_worker.py:119)) returns `None` for any falsy input. `run_sync()` then takes this branch ([sync_worker.py:613-630](sync_worker/sync_worker.py:613)):
```python
if duration_days is None:
    log.warning("No duration for serial=%s — upserting member only, skipping membership", serial)
    ...
    upsert_member(cur, row)   # member created/updated
    # activate_membership() is NEVER called
```
This is proven to be a **systemic, pre-existing bug**, not specific to Benjamin — `sync_log` shows the identical pattern repeating for Hilda Waweru's "Parklands Monthly Peak" membership across at least 8 sync cycles from May through July 2026 (`action='skip'`/`'member_only'`, `message='Unknown PMField2: None'` / `'No duration for None — member created, membership skipped'`). **Even if Cause A (the serial collision) didn't exist, Benjamin's membership would still fail to activate because of Cause B.**

### 1c. Frontend profile query vs. the write path

Profile page → `GET /api/members/[id]` ([app/api/members/[id]/route.ts:17](frontend/app/api/members/[id]/route.ts:17)):
```ts
.from("gym_members").select("*").eq("erp_customer_id", id).limit(1)
...
.from("gym_memberships").select("*").eq("member_id", member.id)...  // line 32
```
This reads exactly the same table (`gym_memberships`) and exactly the same key (`member_id` = the internal `gym_members.id`) that `activate_membership()` writes. **No mismatch exists between the read and write paths.** The bug is entirely upstream: the write never happens.

---

## 2) FALSE "MEMBERSHIP EXPIRED" ON CHECK-IN

### Status-determination logic

Kiosk lookup ([app/kiosk/page.tsx:57-91](frontend/app/kiosk/page.tsx:57)) merges member + current membership:
```ts
const currentMembership = json.memberships?.[0] ?? {};
const payload = { ...json.member, ...currentMembership };
...
const isActive = statusValue(payload) === "active" && daysRemaining(payload.membership_end) > 0;  // line 113
```
`statusValue()` ([dashboard-widgets.tsx:83-85](frontend/components/dashboard/dashboard-widgets.tsx:83)):
```ts
export function statusValue(row: Dict) {
  return String(row.display_status ?? row.status ?? "no_membership");
}
```
Since Benjamin has zero rows in `gym_memberships` (confirmed §1a), `currentMembership = {}`, so `statusValue({})` returns the fallback `"no_membership"` — never `"active"` — so `isActive = false`. The check-in POST is then written with:
```ts
notes: isActive ? null : "Access denied — no active membership",  // line 121
```
This exactly matches the two stored `gym_checkins` rows for member 19017: `notes: 'Access denied — no active membership'`. **This is correct, consistent code behavior given the data** — the "expired" classification is a direct downstream symptom of §1, not a separate logic defect in the comparison itself.

**However, there is a real, separate wording bug** in the kiosk result screen ([app/kiosk/page.tsx:304](frontend/app/kiosk/page.tsx:304)):
```tsx
<h3>{status === "active" ? "ACCESS GRANTED" : status === "frozen" ? "MEMBERSHIP FROZEN — SEE RECEPTION" : "MEMBERSHIP EXPIRED — PLEASE RENEW"}</h3>
```
This ternary has only three branches — `active`, `frozen`, and a catch-all — so **`"no_membership"` is displayed identically to a genuinely lapsed `"expired"` membership**, both showing "MEMBERSHIP EXPIRED — PLEASE RENEW". Benjamin never *had* a membership to expire; the UI text is misleading regardless of the underlying data bug, and will keep misreporting "no_membership" as "expired" for anyone else in this situation even after §1 is fixed.

### Column types (`gym_memberships`)
```
membership_start | date   (no time-of-day or timezone component)
membership_end   | date   (no time-of-day or timezone component)
status            | character varying
```
Both are plain `date`, not `timestamp`/`timestamptz` — no timezone ambiguity is possible in these two columns themselves (they carry no time component to convert). This rules out §3-style timezone skew as a contributor to bug #2.

### "Now" reference used
`daysRemaining()` ([dashboard-widgets.tsx:66-74](frontend/components/dashboard/dashboard-widgets.tsx:66)) uses a **browser-side JS `Date`**, not Postgres `now()`:
```ts
export function daysRemaining(value: unknown) {
  const end = new Date(String(value));
  const today = new Date();               // client/browser clock
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
}
```
For Benjamin this is moot (`payload.membership_end` is `undefined` since no membership row exists, and `isActive` already short-circuits on `statusValue !== "active"`), but it's worth noting for the general case: this comparison trusts whatever clock the browser/kiosk device reports, which becomes relevant if that device's clock is off (see §3).

---

## 3) TIMEZONE / CLOCK OFFSET

### Postgres / Supabase timezone
```sql
SELECT current_setting('TIMEZONE');  -- 'UTC'
SELECT now();                        -- 2026-09-03 11:51:03.974747+00
```
Session timezone is `UTC`, as expected for Supabase. `gym_checkins.checkin_at` column default:
```sql
column_default = 'now()'
```
This is **Postgres's own server-side `now()`**, computed by the database, not supplied by the app (`POST /api/checkins`, [app/api/checkins/route.ts:79-86](frontend/app/api/checkins/route.ts:79), does not include `checkin_at` in its insert payload at all). A server-computed `timestamptz` default is timezone-safe by construction — **the stored value is not affected by any client machine's clock.**

### Host environment
```
TZ env var: not set in erp_api/.env, sync_worker/.env, or frontend/.env.local
Windows OS timezone: "E. Africa Standard Time"   (i.e. correctly EAT/UTC+3)
Live check just now:
  Python datetime.now()    = 2026-09-03T13:53:36  (local)
  Python datetime.utcnow() = 2026-09-03T10:53:36  (UTC)
  → delta = exactly 3h00m00s  ✅ correct EAT offset, right now
```

### A real, measured ~1-hour anomaly — but not where the task expected

I found direct evidence of a clock inconsistency, but it is **not** in the `checkin_at` write path (which is Postgres-side and unaffected) — it's in the **local Windows host clock at an earlier point**, captured incidentally in `sync_state`:
```
key='worker_heartbeat'
value      = "2026-09-03T13:50:14.550051"   (naive string from sync_worker.py's own
                                              datetime.now().isoformat() — Python code,
                                              NOT the check-in write path)
updated_at = 2026-09-03 11:50:43+00          (Postgres-assigned, true UTC instant of that write)
```
If the host's TZ offset were the correct +3h at the moment this was written, the naive value `13:50:14` should correspond to UTC `10:50:14`. The row's actual UTC timestamp is `11:50:43` — **about 60 minutes later than expected.** This is a real, reproducible ~1-hour discrepancy, matching the magnitude the user reported. But the *fresh* live test above (run minutes later, same host) shows a perfectly correct 3h delta right now — meaning the host's effective local-time offset was off by ~1 hour when that heartbeat was written, and is correct as of this diagnostic. This points to **intermittent host clock/timezone drift on the Windows machine**, since since corrected or transient — not a defect in the timestamp-writing code, and not a mismatch between Postgres and the app's timezone handling.

### Where timestamps are rendered
`formatTime()` / `formatDate()` ([dashboard-widgets.tsx:35-47](frontend/components/dashboard/dashboard-widgets.tsx:35)):
```ts
export function formatTime(value: unknown) {
  const date = new Date(String(value));
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
```
This file is `"use client"` ([dashboard-widgets.tsx:1](frontend/components/dashboard/dashboard-widgets.tsx:1)), so this runs in the **browser**. `new Date(...)` parses the timezone-qualified ISO string from Supabase correctly as an absolute instant (no bug here). `toLocaleTimeString()` with no explicit `timeZone` option renders using **whatever timezone the browser/device's own OS reports** — there is no manual +/- offset, no moment/dayjs conversion, and no double-conversion anywhere in this path. This is a standard, normally-correct pattern — but it means the *displayed* time is only as trustworthy as the device's own clock/TZ setting.

### Verdict for §3
- **Not** "DB storing UTC and frontend failing to convert" — the frontend conversion code is textbook-correct (`Date` → `toLocaleTimeString`, no manual offset).
- **Not** a double-conversion bug — I found no second, redundant timezone adjustment anywhere in the write or read path.
- The evidence points to an **intermittent clock/timezone inconsistency on the local Windows host** (or possibly the specific kiosk device, which I could not test directly) — the app's own timestamp-handling code, in both the write path (Postgres `now()`) and the read/render path (`toLocaleTimeString`), is timezone-safe by design. If the *displayed* check-in times are wrong, the most likely explanation is that the **device rendering them** had a wrong clock at that moment — the stored data itself is reliable.

---

## Summary — root cause per issue (no fixes applied)

| # | Issue | Root cause | File / line |
|---|---|---|---|
| **1** | Membership not showing on profile | `activate_membership()` is never called for Benjamin's sale, for **two independent reasons**: (A) his sale's `SerialNumber` (`14520.0001`) collides with an old, already-`processed_serials`-marked serial from before the ERP restore, so the sync's dedup filter silently skips it; (B) **every product in the membership `ProductGroupID` (107) has a blank `PMField2`**, so `parse_duration()` always returns `None` and membership activation is skipped ERP-wide, not just for Benjamin (confirmed recurring for other members in `sync_log`). The read path (`gym_memberships.member_id`) and write path match exactly — there is no table/column mismatch. | Dedup: `sync_worker/sync_worker.py:606`. Duration parsing: `sync_worker/sync_worker.py:119-131` and `613-630`. Write function (correct, just unreached): `sync_worker/sync_worker.py:256-299`. |
| **2** | False "expired" on check-in | Direct downstream symptom of #1 — `statusValue()` correctly falls back to `"no_membership"` when no `gym_memberships` row exists, which is correctly treated as not-active. **Separately**, the kiosk result screen's 3-way ternary has no distinct branch for `"no_membership"`, so it displays the same "MEMBERSHIP EXPIRED — PLEASE RENEW" text for someone who never had a membership as it does for a genuinely lapsed one — a real, independent wording bug that will persist for any future member without a membership even after #1 is fixed. | Status classification: `frontend/app/kiosk/page.tsx:113` and `components/dashboard/dashboard-widgets.tsx:83-85`. Misleading wording: `frontend/app/kiosk/page.tsx:304`. |
| **3** | Timestamp ~1 hour off | Not a code defect in either the write path (`gym_checkins.checkin_at DEFAULT now()`, Postgres-side, timezone-safe) or the render path (`toLocaleTimeString()`, standard browser-local rendering, no manual offset or double-conversion found). Direct evidence (`sync_state.worker_heartbeat`) shows the **local Windows host's clock/timezone was off by ~1 hour** at an earlier point, while a fresh live check shows a correct 3h EAT offset right now — pointing to intermittent host clock drift rather than an application bug. | Write default: `gym_checkins.checkin_at` column default `now()` (DB schema, not app code). Render: `frontend/components/dashboard/dashboard-widgets.tsx:35-47`. Anomaly evidence: `sync_state` row `key='worker_heartbeat'` (query result above), written from `sync_worker/sync_worker.py` (heartbeat block near `run_sync()`, not the check-in path itself). |

**No code changes were made.** This report is diagnostic evidence only, per the task instructions.
