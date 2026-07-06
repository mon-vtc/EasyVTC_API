-- ══════════════════════════════════════════════════════════════════════════════
-- SEED — Comptes de démonstration EasyVTC
--
-- Crée 4 comptes : admin, client, chauffeur, gestionnaire
--
-- Identifiants :
--   admin@easyvtc.com    / Admin1234!
--   client@easyvtc.com   / Client1234!
--   driver@easyvtc.com   / Driver1234!
--   manager@easyvtc.com  / Manager1234!
--
-- Usage :
--   psql $DATABASE_URL -f supabase/seeds/seed_demo_accounts.sql
--
-- Le trigger handle_new_user crée automatiquement les entrées public.users
-- et public.drivers à partir de raw_user_meta_data.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── UUIDs fixes (idempotence) ─────────────────────────────────────────────────
-- admin   : aa000000-0000-0000-0000-000000000001
-- client  : cc000000-0000-0000-0000-000000000001
-- driver  : dd000000-0000-0000-0000-000000000001
-- manager : ee000000-0000-0000-0000-000000000001

-- ── Nettoyage préventif ───────────────────────────────────────────────────────
-- La cascade ON DELETE supprime automatiquement :
--   public.users → public.drivers → public.vehicles, driver_documents
--   public.manager_permissions

DELETE FROM auth.users
WHERE id IN (
  'aa000000-0000-0000-0000-000000000001',
  'cc000000-0000-0000-0000-000000000001',
  'dd000000-0000-0000-0000-000000000001',
  'ee000000-0000-0000-0000-000000000001'
);

-- ── 1. auth.users ─────────────────────────────────────────────────────────────
-- Le trigger on_auth_user_created lit raw_user_meta_data pour créer public.users
-- et public.drivers (si role = 'driver').

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  -- Admin
  ('aa000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'admin@easyvtc.com',
   crypt('Admin1234!', gen_salt('bf', 10)),
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"admin","first_name":"Super","last_name":"Admin","rgpd_consent":true}',
   now(), now()),

  -- Client
  ('cc000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'client@easyvtc.com',
   crypt('Client1234!', gen_salt('bf', 10)),
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"client","first_name":"Marie","last_name":"Dupont","rgpd_consent":true}',
   now(), now()),

  -- Chauffeur
  ('dd000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'driver@easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"driver","first_name":"Ibrahima","last_name":"Diallo","rgpd_consent":true}',
   now(), now()),

  -- Gestionnaire
  ('ee000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated',
   'manager@easyvtc.com',
   crypt('Manager1234!', gen_salt('bf', 10)),
   now(),
   '{"provider":"email","providers":["email"]}',
   '{"role":"manager","first_name":"Aissatou","last_name":"Ndiaye","rgpd_consent":true}',
   now(), now());

-- ── 2. Compléter public.users ─────────────────────────────────────────────────
-- Le trigger a déjà créé les lignes ; on ajoute phone, status et champs manager.

UPDATE public.users
SET phone = '+33600000100', status = 'active'
WHERE id = 'aa000000-0000-0000-0000-000000000001';

UPDATE public.users
SET phone = '+33600000101', status = 'active'
WHERE id = 'cc000000-0000-0000-0000-000000000001';

UPDATE public.users
SET phone = '+33600000102', status = 'active'
WHERE id = 'dd000000-0000-0000-0000-000000000001';

UPDATE public.users
SET
  phone          = '+33600000103',
  status         = 'active',
  coverage_zone  = 'Île-de-France',
  priority_level = 2
WHERE id = 'ee000000-0000-0000-0000-000000000001';

-- ── 3. Profil public.drivers ──────────────────────────────────────────────────
-- Le trigger a créé la ligne avec les valeurs par défaut ; on la complète.

UPDATE public.drivers
SET
  status       = 'active',
  vehicle_type = 'berline',
  siret        = '12345678901234',
  tva_rate     = 10.00,
  is_online    = true,
  zone         = 'france'
WHERE user_id = 'dd000000-0000-0000-0000-000000000001';

-- ── 4. Véhicule du chauffeur ──────────────────────────────────────────────────

INSERT INTO public.vehicles (driver_id, plate_number, brand, model, year, color, type, is_active)
SELECT
  d.id,
  'EZ-100-VTC',
  'Mercedes',
  'Classe E',
  2023,
  'noir',
  'berline',
  true
FROM public.drivers d
WHERE d.user_id = 'dd000000-0000-0000-0000-000000000001';

-- ── 5. Permissions du gestionnaire ───────────────────────────────────────────

DELETE FROM public.manager_permissions
WHERE manager_id = 'ee000000-0000-0000-0000-000000000001';

INSERT INTO public.manager_permissions (manager_id, permission, granted_by)
SELECT
  'ee000000-0000-0000-0000-000000000001',
  perm,
  'aa000000-0000-0000-0000-000000000001'
FROM unnest(ARRAY[
  'view_reservations',
  'assign_reservation',
  'cancel_reservation',
  'view_drivers',
  'view_clients',
  'view_orders',
  'view_invoices',
  'view_documents'
]::text[]) AS perm;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (décommenter pour contrôler)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- SELECT u.email, u.role, u.first_name, u.last_name, u.phone, u.status
-- FROM public.users u
-- WHERE u.id IN (
--   'aa000000-0000-0000-0000-000000000001',
--   'cc000000-0000-0000-0000-000000000001',
--   'dd000000-0000-0000-0000-000000000001',
--   'ee000000-0000-0000-0000-000000000001'
-- )
-- ORDER BY u.role;
--
-- SELECT d.status, d.vehicle_type, d.is_online, d.zone, v.brand, v.model, v.plate_number
-- FROM public.drivers d
-- JOIN public.users u ON u.id = d.user_id
-- LEFT JOIN public.vehicles v ON v.driver_id = d.id AND v.is_active = true
-- WHERE u.id = 'dd000000-0000-0000-0000-000000000001';
--
-- SELECT permission FROM public.manager_permissions
-- WHERE manager_id = 'ee000000-0000-0000-0000-000000000001';
