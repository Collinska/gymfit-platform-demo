# System Architecture

## Source of Truth

FusionERP8 remains authoritative for:

* members
* financial records
* memberships

---

# Sync Architecture

FusionERP8
→ Python Sync Worker
→ Supabase

The sync worker:

* syncs membership data
* syncs customer records
* prevents duplicate imports
* logs synchronization events

---

# Operational Platform

Next.js Platform
→ Supabase API Layer

Modules:

* dashboard
* reports
* kiosk
* attendance

---

# Kiosk Architecture

Kiosk flow:

1. Scan QR
2. Fetch member
3. Validate status
4. Log attendance
5. Grant or deny access

The kiosk must remain responsive even if ERP is unavailable.

---

# Reporting Architecture

Reports should use:

* attendance events
* aggregated views
* operational metrics

Avoid direct ERP queries for reporting.
