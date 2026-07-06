-- ══════════════════════════════════════════════════════════════════════════════
-- SEED — Chauffeurs de test pour valider le filtre vehicle_type
-- Sprint 3 — EasyVTC
--
-- Mot de passe de tous les comptes : Driver1234!
--
-- Usage     : psql $DATABASE_URL -f supabase/seeds/test_drivers.sql
-- Nettoyage : psql $DATABASE_URL -f supabase/seeds/cleanup_test_drivers.sql
--
-- Scénarios couverts :
--
--    RETOURNÉS par l'API (status=active + is_online=true)
--   ─────────────────────────────────────────────────────
--   #1  Mamadou Diallo    standard   Toyota Yaris       AB-001-FR
--   #2  Fatou Sow         standard   Renault Clio       AB-002-FR
--   #3  Pierre Martin     berline    Mercedes Classe E  AB-003-FR
--   #4  Sophie Dubois     berline    BMW Série 5        AB-004-FR
--   #5  Ahmed Traoré      van        Mercedes V-Class   AB-005-FR
--   #6  Claire Bernard    van        Volkswagen T7      AB-006-FR
--
--    EXCLUS par l'API — cas limites
--   ─────────────────────────────────────────────────────
--   #7  Luc Moreau        standard   Peugeot 308        AB-007-FR  ← is_online=false
--   #8  Nina Petit        berline    Audi A6            AB-008-FR  ← status=suspended
--
-- Résultats attendus selon vehicle_type passé en query param :
--   ?vehicle_type=standard  → #1, #2       (2 chauffeurs)
--   ?vehicle_type=berline   → #3, #4       (2 chauffeurs)
--   ?vehicle_type=van       → #5, #6       (2 chauffeurs)
--   (aucun filtre)          → #1…#6        (6 chauffeurs)
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Nettoyage préventif (idempotence) ────────────────────────────────────────
-- Les véhicules et drivers sont supprimés en cascade via ON DELETE CASCADE.

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

-- ── 1. auth.users ─────────────────────────────────────────────────────────────

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
  -- #1 Mamadou Diallo — standard, online
  ('d1aa0001-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver.standard1@test.easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- #2 Fatou Sow — standard, online
  ('d1aa0001-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver.standard2@test.easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- #3 Pierre Martin — berline, online
  ('d1aa0001-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver.berline1@test.easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- #4 Sophie Dubois — berline, online
  ('d1aa0001-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver.berline2@test.easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- #5 Ahmed Traoré — van, online
  ('d1aa0001-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver.van1@test.easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- #6 Claire Bernard — van, online
  ('d1aa0001-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver.van2@test.easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- #7 Luc Moreau — standard, OFFLINE 
  ('d1aa0001-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver.offline@test.easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),

  -- #8 Nina Petit — berline, SUSPENDU 
  ('d1aa0001-0000-0000-0000-000000000008',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'driver.suspended@test.easyvtc.com',
   crypt('Driver1234!', gen_salt('bf', 10)),
   now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- ── 2. public.users ───────────────────────────────────────────────────────────

INSERT INTO public.users (id, email, phone, role, first_name, last_name, status, rgpd_consent, rgpd_consent_at)
VALUES
  ('d1aa0001-0000-0000-0000-000000000001', 'driver.standard1@test.easyvtc.com', '+33600000001', 'driver', 'Mamadou', 'Diallo',  'active', true, now()),
  ('d1aa0001-0000-0000-0000-000000000002', 'driver.standard2@test.easyvtc.com', '+33600000002', 'driver', 'Fatou',   'Sow',     'active', true, now()),
  ('d1aa0001-0000-0000-0000-000000000003', 'driver.berline1@test.easyvtc.com',  '+33600000003', 'driver', 'Pierre',  'Martin',  'active', true, now()),
  ('d1aa0001-0000-0000-0000-000000000004', 'driver.berline2@test.easyvtc.com',  '+33600000004', 'driver', 'Sophie',  'Dubois',  'active', true, now()),
  ('d1aa0001-0000-0000-0000-000000000005', 'driver.van1@test.easyvtc.com',      '+33600000005', 'driver', 'Ahmed',   'Traoré',  'active', true, now()),
  ('d1aa0001-0000-0000-0000-000000000006', 'driver.van2@test.easyvtc.com',      '+33600000006', 'driver', 'Claire',  'Bernard', 'active', true, now()),
  ('d1aa0001-0000-0000-0000-000000000007', 'driver.offline@test.easyvtc.com',   '+33600000007', 'driver', 'Luc',     'Moreau',  'active', true, now()),
  ('d1aa0001-0000-0000-0000-000000000008', 'driver.suspended@test.easyvtc.com', '+33600000008', 'driver', 'Nina',    'Petit',   'active', true, now());

-- ── 3. public.drivers ────────────────────────────────────────────────────────

INSERT INTO public.drivers (id, user_id, status, vehicle_type, is_online, zone, tva_rate)
VALUES
  --  Éligibles : active + is_online
  ('e2bb0001-0000-0000-0000-000000000001', 'd1aa0001-0000-0000-0000-000000000001', 'active',    'standard', true,  'france', 10.00),
  ('e2bb0001-0000-0000-0000-000000000002', 'd1aa0001-0000-0000-0000-000000000002', 'active',    'standard', true,  'france', 10.00),
  ('e2bb0001-0000-0000-0000-000000000003', 'd1aa0001-0000-0000-0000-000000000003', 'active',    'berline',  true,  'france', 10.00),
  ('e2bb0001-0000-0000-0000-000000000004', 'd1aa0001-0000-0000-0000-000000000004', 'active',    'berline',  true,  'france', 10.00),
  ('e2bb0001-0000-0000-0000-000000000005', 'd1aa0001-0000-0000-0000-000000000005', 'active',    'van',      true,  'france', 10.00),
  ('e2bb0001-0000-0000-0000-000000000006', 'd1aa0001-0000-0000-0000-000000000006', 'active',    'van',      true,  'france', 10.00),
  --  Exclus
  ('e2bb0001-0000-0000-0000-000000000007', 'd1aa0001-0000-0000-0000-000000000007', 'active',    'standard', false, 'france', 10.00), -- offline
  ('e2bb0001-0000-0000-0000-000000000008', 'd1aa0001-0000-0000-0000-000000000008', 'suspended', 'berline',  true,  'france', 10.00)  -- suspendu
ON CONFLICT (user_id) DO NOTHING;

-- ── 4. public.vehicles ────────────────────────────────────────────────────────

INSERT INTO public.vehicles (driver_id, plate_number, brand, model, year, color, type, is_active)
VALUES
  ('e2bb0001-0000-0000-0000-000000000001', 'AB-001-FR', 'Toyota',      'Yaris',       2022, 'blanc',  'standard', true),
  ('e2bb0001-0000-0000-0000-000000000002', 'AB-002-FR', 'Renault',     'Clio',        2021, 'gris',   'standard', true),
  ('e2bb0001-0000-0000-0000-000000000003', 'AB-003-FR', 'Mercedes',    'Classe E',    2023, 'noir',   'berline',  true),
  ('e2bb0001-0000-0000-0000-000000000004', 'AB-004-FR', 'BMW',         'Série 5',     2022, 'blanc',  'berline',  true),
  ('e2bb0001-0000-0000-0000-000000000005', 'AB-005-FR', 'Mercedes',    'V-Class',     2023, 'noir',   'van',      true),
  ('e2bb0001-0000-0000-0000-000000000006', 'AB-006-FR', 'Volkswagen',  'Transporter', 2021, 'argent', 'van',      true),
  ('e2bb0001-0000-0000-0000-000000000007', 'AB-007-FR', 'Peugeot',     '308',         2020, 'rouge',  'standard', true),
  ('e2bb0001-0000-0000-0000-000000000008', 'AB-008-FR', 'Audi',        'A6',          2022, 'gris',   'berline',  true);

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- Exécuter après le seed pour confirmer les données insérées :
-- ══════════════════════════════════════════════════════════════════════════════
--
-- SELECT
--   u.first_name || ' ' || u.last_name AS nom,
--   d.vehicle_type,
--   d.is_online,
--   d.status,
--   v.brand || ' ' || v.model AS vehicule,
--   v.plate_number
-- FROM public.drivers d
-- JOIN public.users u ON u.id = d.user_id
-- LEFT JOIN public.vehicles v ON v.driver_id = d.id AND v.is_active = true
-- WHERE d.user_id LIKE 'd1aa0001%'
-- ORDER BY d.vehicle_type, d.is_online DESC;
--
-- Exemple de résultat attendu (à décommenter au besoin) :
-- ─────────────────────────────────────────────────────────────────────────────
-- Mamadou Diallo   | standard | true  | active    | Toyota Yaris       | AB-001-FR
-- Fatou Sow        | standard | true  | active    | Renault Clio       | AB-002-FR

