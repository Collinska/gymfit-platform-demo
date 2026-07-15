# Pre-Auth Audit

_Read-only audit of the current auth/staff state before building real authentication. No changes made._

## SUPABASE

### 1. `staff` vs `gym_staff` table structure

Two staff tables exist — overlapping and redundant:

**`staff`** (UUID PK, has password hash — looks purpose-built for auth):
| column | type |
|---|---|
| id | uuid |
| name | text |
| email | text |
| role | text |
| password_hash | text |
| is_active | boolean |
| created_at | timestamptz |
| updated_at | timestamptz |

**`gym_staff`** (integer PK, no password — looks like a legacy/alt shape):
| column | type |
|---|---|
| id | integer |
| username | varchar |
| full_name | varchar |
| email | varchar |
| role | varchar |
| is_active | boolean |
| created_at | timestamptz |

### 2. Existing rows

- **`staff`** — **1 row**: `System Admin`, email `admin@gym.local`, role `admin`, `is_active = true`. Its `password_hash` is a **placeholder** (`$2b$12$placeholderHashReplaceThisImmediately…` per earlier work) — not a usable bcrypt hash.
- **`gym_staff`** — **empty** (0 rows).

### 3. Supabase Auth enabled?

- **`auth.users` = 0 rows.** Supabase Auth is available (the `auth` schema exists) but **completely unused** — no users provisioned. Nothing currently logs in through Supabase Auth.

### 4. Staff linkage on action-logging tables

Searched all public tables for `%staff%`, `%user_id%`, `%created_by%`, `%cashier%`, `%operator%`:

| table.column | notes |
|---|---|
| `gym_checkins.staff_id` | exists, but **0 rows have it set** (always null) |
| `checkins.staff_id` | legacy `checkins` table, same |
| `leads.created_by` | text field, populated by lead creation |

- **No staff/user column on POS-action data in Supabase.** Sales and deposits are recorded in the **ERP** (`SaleHeader.UserID`, `TransactionMaster.UserID` → `UserMaster`), which is a *separate* identity system from any gym-platform staff. There is no link between an ERP `UserID` and a Supabase `staff` row.
- So today, **no gym-platform action is attributed to a staff member** (check-ins, leads aside, carry no real staff identity).

## FRONTEND

### 5. Supabase client setup

Three clients exist, two identity models in play:

- **`lib/supabase.ts`** — the **service-role** path used by all API routes:
  - `supabase` = anon client (rarely used)
  - `supabaseAdmin` = **service-role** client, `autoRefreshToken:false, persistSession:false`. **Bypasses RLS** — every current API route uses this, so there's no per-user enforcement.
- **`lib/supabase/server.ts`** — `createSupabaseServerClient()` via `@supabase/ssr` `createServerClient`, wired to Next cookies (getAll/setAll), typed `<Database>`. **SSR auth plumbing is present but unused** (no route calls it for a session).
- **`lib/supabase/browser.ts`** — `createSupabaseBrowserClient()` via `createBrowserClient`, anon key. Also unused.
- **`lib/env.ts`** — `getPublicEnv()` returns `{ supabaseUrl, supabaseAnonKey }`, throws if missing.

**Takeaway:** the `@supabase/ssr` cookie-session scaffolding is already installed and typed, but nothing reads or writes a session yet. Real auth could plug into `server.ts`/`browser.ts` directly.

### 6. `middleware.ts`

**None exists** in `frontend/`. There is no request-level session refresh or route guard. (Note: `server.ts`'s comment even says "Middleware can refresh sessions" — the intended middleware was never created.)

### 7. `app/layout.tsx` — where an auth guard would wrap

Minimal root layout — **no providers, no shell, no guard**:
```tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ background: "#f8fafc", color: "#1e293b" }}>{children}</body>
    </html>
  );
}
```
- No context providers, no `<AuthProvider>`, no session fetch.
- Each page renders its own `<Sidebar />` individually (there is no shared authenticated shell here).
- **Guard insertion points:** (a) a new `middleware.ts` for edge-level route protection (recommended primary gate), and/or (b) wrapping `children` here in a server-side session check / provider. There's also an orphaned `components/layout/app-shell.tsx` + `module-nav.tsx` (unused) that could have been the shell.

### 8. Current role model (`lib/permissions.ts`)

A **UI-only, unsecured** role system already exists (explicitly flagged temporary in its own header comment):
- **Roles:** `admin`, `manager`, `cashier`, `receptionist`
- **Permissions map:** `manage_auto_revoke → [admin, manager]`, `revoke_membership → [admin, manager]`
- `can(role, permission)` gate + `useCurrentRole()` hook
- **Current role source:** `localStorage` (`gym_current_role`), **defaults to `admin`**. Set via a temporary "Acting as" dropdown in Settings.
- ⚠️ Its own comment states this secures **nothing** — protected APIs remain directly callable; real enforcement must be re-run **server-side** per route once auth exists.

### Sidebar NAV (what to gate per role)

| Section | Item | href |
|---|---|---|
| Overview | Dashboard | `/dashboard` |
| Operations | Check-in Kiosk | `/kiosk` |
| Operations | Check-in Log | `/checkins` |
| Members | Member List | `/members` |
| Members | Gym Wrap | `/gym-wrap` |
| Members | Leads | `/leads` |
| Members | Freeze / Unfreeze | `/freeze` |
| Sales | Point of Sale | `/pos` |
| Sales | Reports | `/pos/reports` |
| Analytics | Analytics | `/analytics` |
| Analytics | Retention | `/churn` |
| Analytics | ERP Sync Log | `/sync-log` |
| System | Settings | `/settings` |

(The Sidebar renders each item via `isActive` = `pathname === href || pathname.startsWith(href)`; it has no role-awareness yet — every item shows for everyone.)

## Summary — state of play for building auth

- **No working auth anywhere:** `auth.users` empty, no middleware, no session reads, all APIs use the RLS-bypassing service-role client.
- **Two competing staff tables:** `staff` (uuid + password_hash, 1 placeholder admin) vs `gym_staff` (int, empty). **Decide on one** — `staff` is the better-shaped candidate for custom auth.
- **Two possible auth strategies already half-scaffolded:**
  1. **Supabase Auth** — `@supabase/ssr` server/browser clients + typed `Database` already exist; just needs `middleware.ts`, users provisioned, and RLS. Cleanest, offloads password/session security.
  2. **Custom `staff`-table auth** — the `staff.password_hash` column implies an intended custom login; would need bcrypt verify + session cookie + server guards built from scratch.
- **UI role plumbing is ready** (`permissions.ts`, `can()`, per-role sidebar gating) — it just needs a **real session** feeding `getCurrentRole()` and **server-side `can()` re-checks** on protected routes (Settings PATCH, membership revoke, etc.).
- **No staff attribution on actions** today — if audit trails ("who checked in / sold / deposited") matter, `gym_checkins.staff_id` and new columns would need populating from the authenticated session.
