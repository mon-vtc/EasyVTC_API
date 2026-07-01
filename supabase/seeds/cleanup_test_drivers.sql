-- ══════════════════════════════════════════════════════════════════════════════
-- CLEANUP — Suppression des chauffeurs de test (vehicle_type filter)
-- Sprint 3 — EazyVTC
--
-- Usage : psql $DATABASE_URL -f supabase/seeds/cleanup_test_drivers.sql
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- La suppression de public.users déclenche ON DELETE CASCADE vers public.drivers,
-- qui lui-même déclenche ON DELETE CASCADE vers public.vehicles.

DELETE FROM public.users
WHERE id IN (
  'd1aa0001-0000-0000-0000-000000000001',
  'd1aa0001-0000-0000-0000-000000000002',
  'd1aa0001-0000-0000-0000-000000000003',
  'd1aa0001-0000-0000-0000-000000000004',
  'd1aa0001-0000-0000-0000-000000000005',
  'd1aa0001-0000-0000-0000-000000000006',
  'd1aa0001-0000-0000-0000-000000000007',
  'd1aa0001-0000-0000-0000-000000000008'
);

DELETE FROM auth.users
WHERE id IN (
  'd1aa0001-0000-0000-0000-000000000001',
  'd1aa0001-0000-0000-0000-000000000002',
  'd1aa0001-0000-0000-0000-000000000003',
  'd1aa0001-0000-0000-0000-000000000004',
  'd1aa0001-0000-0000-0000-000000000005',
  'd1aa0001-0000-0000-0000-000000000006',
  'd1aa0001-0000-0000-0000-000000000007',
  'd1aa0001-0000-0000-0000-000000000008'
);

COMMIT;
