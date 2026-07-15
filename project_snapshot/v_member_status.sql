-- Drop and recreate v_member_status
--
-- Root cause fixed:
--   Old view filtered WHERE membership_end >= CURRENT_DATE, so all 2021
--   memberships were excluded and every member showed as no_membership.
--
-- Fix:
--   LATERAL join picks the single most recent membership per member
--   (by membership_end DESC) regardless of date. display_status is then
--   computed from the actual date vs today, not from the stale status column.
--   frozen takes priority because the sync worker never updates status.

DROP VIEW IF EXISTS v_member_status;

CREATE VIEW v_member_status AS
SELECT
  m.id,
  m.erp_customer_id,
  m.first_name,
  m.last_name,
  m.mobile,
  m.card_id,
  m.photo_url,
  m.face_enrolled,
  ms.id                AS membership_id,
  ms.plan_name,
  ms.membership_start,
  ms.membership_end,
  ms.status            AS membership_status,
  ms.frozen_at,
  ms.frozen_days_used,
  CASE
    WHEN ms.id IS NULL                     THEN 'no_membership'
    WHEN ms.status = 'frozen'              THEN 'frozen'
    WHEN ms.membership_end >= CURRENT_DATE THEN 'active'
    ELSE                                        'expired'
  END                  AS display_status,
  (ms.membership_end - CURRENT_DATE)::int AS days_remaining
FROM public.gym_members m
LEFT JOIN LATERAL (
  SELECT *
  FROM public.gym_memberships
  WHERE member_id = m.id
  ORDER BY membership_end DESC
  LIMIT 1
) ms ON true;
