# Navigation Audit — Sidebar vs Actual Routes

_Read-only audit. No files changed._

## 1. Sidebar nav links (`components/dashboard/Sidebar.tsx`)

The nav is data-driven from the `NAV` array. Every link and href:

| Section | Label | href | Type |
|---|---|---|---|
| Overview | Dashboard | `/dashboard` | link |
| Operations | Check-in Kiosk | `/kiosk` | link |
| Operations | Check-in Log | `/checkins` | link |
| Members | Member List | `/members` | link |
| Members | Leads | `/leads` | link |
| Members | Freeze / Unfreeze | `/freeze` | link |
| Sales | Point of Sale | `/pos` | link |
| Sales | Reports → Sales Register | `/pos/reports/sales-register` | child link |
| Sales | Reports → Day Audit | `/pos/reports/day-audit` | child link |
| Analytics | Analytics | `/analytics` | link |
| Analytics | Retention | `/churn` | link |
| Analytics | ERP Sync Log | `/sync-log` | link |
| System | Settings | `/settings` | link |

Note: **"Reports"** is a non-clickable parent label (`children`, no `href`) — it only expands to the two child links. The Reports **hub** page itself (`/pos/reports`) is not linked.

## 2. Actual page routes (every folder with a `page.tsx` under `app/`)

| URL path | Notes |
|---|---|
| `/` | Placeholder — renders literally `root-ok` |
| `/dashboard` | Main dashboard |
| `/kiosk` | Check-in kiosk |
| `/checkins` | Check-in log |
| `/members` | Member list |
| `/members/[id]` | Member detail (dynamic) |
| `/members/new` | New member form |
| `/leads` | Leads pipeline |
| `/freeze` | Freeze / unfreeze |
| `/pos` | Point of Sale |
| `/pos/reports` | **Reports hub** (card links to the two sub-reports) |
| `/pos/reports/sales-register` | Sales register report |
| `/pos/reports/day-audit` | Day audit report |
| `/analytics` | Analytics |
| `/churn` | Retention & win-back |
| `/sync-log` | ERP sync log |
| `/reports` | **Legacy** standalone reports page (Sidebar + StatsCards + ExpiringSoonTable) |
| `/settings` | Settings |

**18 routes total** (16 unique top-level + 2 dynamic/nested member routes).

## 3. Pages NOT linked in the sidebar

| Unlinked route | Reachable how? | Assessment |
|---|---|---|
| `/` | Direct URL only | Placeholder (`root-ok`) — should **redirect to `/dashboard`**, not be a dead stub |
| `/reports` | **Nothing links to it** | **Orphaned/legacy** — superseded by `/analytics` + `/pos/reports`. Dead page. |
| `/pos/reports` | Only the "← Reports" back-link on the Sales Register page | Hub is **orphaned from the sidebar** — the sidebar jumps straight to the two children, so the hub is only reachable by accident |
| `/members/[id]` | Clicking a member row | Expected (dynamic detail) — fine |
| `/members/new` | "New Member" button + lead conversion | Intentional, but arguably deserves a nav/quick-action link |

**Genuinely problematic:** `/reports` (fully orphaned legacy) and `/pos/reports` (hub unreachable from nav).

## 4. Sidebar scrollbar — overflow/height settings

⚠️ **Important:** the live `Sidebar.tsx` component uses **Tailwind utility classes**, NOT the `.sidebar` / `.side-nav` classes in `globals.css`. Those globals classes are **dead code** for this component.

**What actually causes the scrollbar** — the `<aside>` in `Sidebar.tsx`:
```
flex flex-col h-screen sticky top-0 w-[220px] shrink-0 overflow-y-auto ...
```
- `h-screen` (fixed 100vh) + `overflow-y-auto` → a scrollbar appears whenever nav content exceeds viewport height (e.g. shorter screens, or after adding Leads/Retention items).

**The dead globals rules (not applied to this component):**
```css
.sidebar   { position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 20px 12px 0; }
.side-nav  { display: grid; gap: 20px; flex: 1; }
.app-frame { grid-template-columns: 256px minmax(0,1fr); }   /* note: 256px, but the aside is w-[220px] — mismatch */
@media (max-width:900px) { .sidebar { position: relative; height: auto; } }
```
- There's also a **width mismatch**: `.app-frame` reserves `256px` for column 1, but the actual `<aside>` is `w-[220px]` → a 36px gap of `--warm-bg`/page bg shows between sidebar and content.

**Fix direction:** to remove the scrollbar, the nav region (not the whole aside) should scroll, or the footer should be pinned — e.g. keep `h-screen` on the aside, make only the `<nav>` `flex-1 overflow-y-auto`, and keep brand/footer fixed. The current setup scrolls the entire aside including brand + footer.

## 5. Sub-page back navigation (`/pos/reports/*`)

| Page | Back nav? |
|---|---|
| `/pos/reports` (hub) | N/A — it's the hub; cards link **down** to children. No link back to `/pos` or dashboard. |
| `/pos/reports/sales-register` | ✅ Has **"← Reports"** link → `/pos/reports` (line 519) |
| `/pos/reports/day-audit` | ❌ **No back navigation** — only a title, date filter, and Refresh. Relies entirely on the sidebar or browser back. |

**Inconsistency:** Sales Register has a back link; Day Audit does not. Neither links back to `/pos`.

## Summary of navigation problems to fix

1. **`/reports`** is fully orphaned legacy — decide to link it, delete it, or redirect it.
2. **`/pos/reports` hub** is unreachable from the sidebar (only its children are linked); the hub only appears via a back-link.
3. **`/pos/reports/day-audit`** has no back navigation (Sales Register does — inconsistent).
4. **`/` root** is a `root-ok` stub — should redirect to `/dashboard`.
5. **Sidebar scrollbar**: whole aside scrolls (`h-screen` + `overflow-y-auto`); should scroll only the nav and pin brand/footer. Dead `.sidebar`/`.side-nav` globals rules can be removed.
6. **Width mismatch**: `.app-frame` column is `256px` but the aside is `w-[220px]` → 36px gap.
7. `/members/new` has no sidebar/quick-action entry (minor).
