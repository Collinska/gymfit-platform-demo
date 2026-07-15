# Dashboard Redesign — Read-Only Audit

_Read-only audit of the current dashboard, styling, and config before a redesign. No files were changed._

## 1. `app/dashboard/page.tsx`

Trivial wrapper (8 lines):

```tsx
"use client";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
export default function DashboardPage() {
  return <DashboardClient />;
}
```

All logic lives in `DashboardClient`.

## 2. Dashboard-specific components (`components/dashboard/`)

Three files:

- **`dashboard-client.tsx`** — the actual dashboard. `"use client"`. Imports `Link`, React hooks, `Sidebar`, and widgets from `dashboard-widgets`. State: `stats`, `checkins`, `expiringSoon`, `recentlyExpired`, `expiringTab`, `loading`, `error`, `now`, `mounted`. One `useEffect` runs a 1s clock; another fetches the 3 endpoints in parallel. Renders: `app-frame` → `Sidebar` + `dashboard-page` → topbar, `live-status` bar, `StatsCards`, a 2-col `dashboard-grid` (`WeeklyCheckinsChart` + `PlanMixList`), an **⚠ ALERTS** card, a **Recent Check-ins** table, and a tabbed **Membership Reminders** card (expiring-soon / recently-expired) with CSV export. Local helpers: `fmtDate`, `triggerCsv`.
- **`dashboard-widgets.tsx`** — shared widget/util library (see below).
- **`Sidebar.tsx`** — nav shell (uses `.sidebar`, `.nav-item` CSS classes; lucide icons).

**Key styling note:** the dashboard is a **hybrid** — the older shell (StatsCards, grid, tables, live-status, alerts) uses **custom CSS classes** from `globals.css`; the newer Membership Reminders card uses **Tailwind utility classes** inline. A redesign must reconcile these two systems.

### `dashboard-widgets.tsx` exports

- **Types:** `Dict`, `StatsResponse`, `emptyStats`
- **Utils:** `fetchJson` (always `cache:"no-store"`), `formatDate`, `formatTime`, `initials`, `avatarColorClass`, `daysRemaining`, `memberName`, `statusValue`, `methodIcon`, `calculateDuration`
- **Components:** `LoadingBlock`, `ErrorBox`, `Avatar` (sm/lg, photo or initials), `StatCard`, `StatsCards`, `DayLabel`, `WeeklyCheckinsChart` (CSS-bar chart, **not recharts**), `PlanMixList` (progress bars), `ExpiringSoonTable`

## 3. API endpoints the dashboard calls

Three, all via `fetchJson` (no-store):

- `GET /api/stats`
- `GET /api/checkins?period=today&limit=8`
- `GET /api/members/expiring`

## 4. recharts installed?

**Yes** — `package.json`: `"recharts": "^3.9.1"`.

- The **dashboard does not use it** (its charts are hand-rolled CSS bars). recharts is only used on `/analytics`.
- Other relevant deps: `lucide-react ^0.468.0`, `qrcode.react ^4.2.0`, `tailwind-merge 2.5.5`, `next 14.2.29`, `react 18.2.0`, `tailwindcss 3.4.17`.

## 5. `tailwind.config.ts` — theme extensions

- **colors** (all `hsl(var(--…))`): `border, background, foreground, muted, panel, primary, danger, success, warning`
  - ⚠️ Several of these CSS vars are **not defined** in globals (missing: `--background`, `--primary`, `--danger`, `--success`, `--warning`), so those Tailwind color tokens resolve to invalid values.
- **borderRadius:** `xl: 12px`, `2xl: 16px`, `3xl: 24px`
- **fontFamily.sans:** `-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", sans-serif`
- **boxShadow:** `subtle`, `ios`, `ios-md`, `ios-lg`
- **plugins:** none

## 6. `styles/globals.css` (note: at `styles/`, not `app/`)

Tailwind directives + a large custom-class system.

**Base:**
- **CSS vars** (`:root`): `--accent #0d9488`, `--accent-hover #0f766e`, `--accent-light #f0fdfa`, `--bg #f8fafc`, `--foreground #1e293b`, `--muted #64748b`, `--border #e2e8f0`, `--panel #fff`
- **body:** bg `#f2f2f7`, text `#1c1c1e`, Apple system font stack, antialiased

**Custom classes (by group):**
- **iOS primitives:** `.ios-card`, `.ios-section`, `.ios-input` (+`:focus`), `.ios-btn-primary`, `.ios-btn-secondary`, `.ios-badge-{green,amber,red,gray}`
- **Shell:** `.app-frame` (256px grid), `.sidebar` + `.brand`/`.side-nav`/`.nav-section`/`.nav-item`(+`.active`)/`.sidebar-footer`, `.dashboard-page`, `.topbar`/`.eyebrow`/`.topbar-right`, `.content`
- **Grids:** `.stats-grid` (4-col), `.dashboard-grid` (1.15fr/0.85fr)
- **Cards:** `.card`, `.stat-card` (+`.red/.amber/.blue` tones, teal top-border), `.card-head`, `.stat-label/value/sub`
- **Badges:** `.badge` (+`.active/.frozen/.expired/.no_membership/.error/.skipped/.ok`) — **no `.returned`** here (that badge was added inline in the member page, not globals)
- **Buttons:** `.btn`, `.btn-accent`, `.btn-sm`
- **Feedback:** `.loading`, `.spinner` (+`@keyframes spin`), `.info-box.{blue,red}`, `.toast.{success,error}`, `.alert-list`/`.alert-row.{amber,blue}`
- **Charts:** `.bar-chart`(+`.compact`)/`.bar-col`/`.bar-track`/`.bar`, `.progress-list`/`.progress-row`/`.progress-track`/`.progress-fill`
- **Tables:** `.table-wrap` (+ th/td), `.member-cell`/`.member-name`/`.member-id`, `.avatar` (+`.avatar-0..4`, `.avatar-lg`)
- **Forms:** `.filter-bar`, `.filter-select`, `.form-grid`, `.button-row`, `.member-card`, `.autocomplete`
- **Live status:** `.live-status`, `.sync-dot.{active,error}`
- **Member detail:** `.member-detail-grid`, `.profile-card`, `.pill`, `.info-list`, `.divider`, `.tabs`
- **Typography utils:** `.font-head`, `.mono`, `.muted`, `.accent`, `.page-title`, `.empty-state`, `.danger-text`, `.method-icon.{face,barcode,manual}`
- **Kiosk (dark theme):** `.kiosk-*` block
- **Responsive:** `@media (max-width:900px)` collapses the sidebar/grids to 1 column

## Things worth flagging for the redesign

1. **Two parallel styling systems** — legacy custom CSS classes (dashboard shell) vs Tailwind utilities (analytics/leads/churn/reminders). The dashboard mixes both.
2. **recharts is available but unused on the dashboard** — its charts are CSS bars. Easy win to unify with `/analytics`.
3. **Broken Tailwind color tokens** — `tailwind.config.ts` references `--background/--primary/--danger/--success/--warning` CSS vars that don't exist in globals, so `bg-primary` etc. won't work. Worth fixing during redesign.
4. **globals.css lives in `styles/`**, not `app/` — confirm `app/layout.tsx` imports `@/styles/globals.css`.
