# erp_api DEMO_MODE — Summary

**Status:** Implemented, tested live against the demo Supabase project, verified. ✅

## What it does
`DEMO_MODE=true` (env var, default `false` — zero effect on production) makes every erp_api endpoint that would otherwise dial the real ERP (FusionERP/FR8RootDB) read/write **only Supabase** instead, using the demo project's seeded data. No code path in erp_api depends on the separate `sync_worker` process — confirmed via full-repo grep, so nothing extra needed disabling there.

## Audit finding
Nearly the *entire* service touches ERP synchronously and inline with a request — not just POS sales. Full list in [DEMO_MODE_AUDIT.md](../DEMO_MODE_AUDIT.md)-style detail is in the conversation; short version below.

## (a) Writes — real Supabase behavior, not stubs
| Endpoint | Demo behavior |
|---|---|
| `POST /erp/members` | Synthetic numeric `customer_id`, `account_id` reserved via the table's real sequence (no race condition) |
| `POST /erp/deposits` | Inserts into demo `sales` (`category='deposit'`) |
| `POST /erp/sales` | Inserts into demo `sales` (`category='membership'` or `'retail'`, derived from the item's catalog menu — see "Product catalog" below) |

A member's "wallet balance" = `deposits − (membership+retail purchases)`, computed live from `sales`. Tested end-to-end: deposit and sale both moved a real seeded member's balance correctly.

## (b) Reads — Supabase-backed where data exists
**Backed by real Supabase queries** (all tested, all returned correct data): member search, member balance, contract member-identity lookup, Gym Wrap (identity + purchases), `revenue-summary` (powers the Analytics dashboard), `sales-by-invoice`, `sales-by-product`, `day-audit`, `staff-performance`.

**Empty/zero — no Supabase-table equivalent exists**, so this fails cleanly instead of hanging on a placeholder ERP host: report `filters` (product-group/department dropdowns — no group/department concept in the demo schema).

**Update:** `list_products`, `stock-levels`, and `product/{id}/stock` are now Supabase-backed too — see "Product catalog" below. The POS grid has real items to sell in the demo.

## Product catalog (`demo_products`)
A new `demo_products` table (`demo/schema.sql`) stands in for ERP's ProductMaster/RestMenuChild/Stock, seeded by `demo/seed.py`'s `seed_products()`: 10 memberships (Day Pass through Annual, plus a Personal Training session), 10 stocked POS retail items (drinks, supplements, gear — two deliberately at low/zero stock to exercise the amber and out-of-stock badges), and the 5 fixed Rental IDs (`000I`–`000M`) the frontend already matches on. `product_id` is a stable key, so re-seeding upserts and resets stock levels/prices rather than duplicating rows.

`erp_api/demo_mode.py` now has `list_products()`, `stock_levels()`, and `product_stock()` (Supabase-backed, shaped identically to the real endpoints), and `create_sale()` mirrors the real ERP's stock behavior: it 400s with the same `{"error": "Out of stock", "items": [...]}` shape when a stocked item has none left (`enforce_stock_check`), and deducts `stock_qty` on a successful sale — matching the real ERP's `Sale_Trigger`. Sale rows now log the catalog's real display name and derive `category` (`membership` vs `retail`) from the item's menu, instead of the previous placeholder behavior.

All of this was tested live end-to-end against the demo project (catalog listing, stock levels, out-of-stock block, successful sale + stock deduction, membership sale) using the same backup-swap-test-restore procedure as before; test sales rows and the one stock deduction were cleaned up afterward, and `sync_worker/.env` was verified pointing at production again before finishing.

## Bugs found and fixed along the way
1. A real indexing bug in the balance-lookup helper (caught immediately via live testing, fixed, retested).
2. `monthly_stats` table was missing from the original demo schema entirely (unrelated to DEMO_MODE — just never created) — added it, Gym Wrap's "vs gym average" no longer 500s.

## Contracts Storage bucket — fixed
The demo project now has a public `contracts` bucket (15MB limit, `application/pdf`/`image/jpeg`/`image/png`), matching what `routers/contracts.py`'s `_storage_upload()` expects. Verified with a real upload → public fetch → delete round-trip.

## Safety
All testing ran against `.env.demo` only, verified production-free before every connection. Test data was cleaned up afterward (verified a test member's balance returned to its original seeded value). Production env files were backed up, swapped for testing, and restored — verified pointing at production again before finishing.
