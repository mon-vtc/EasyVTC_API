-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : Gestion dynamique des types de véhicule
-- Sprint 3 — EazyVTC
--
-- 1. Création de la table vehicle_types (remplace l'enum PostgreSQL statique)
-- 2. Seed des 3 types existants
-- 3. Migration des colonnes vers TEXT :
--    vehicles.type, drivers.vehicle_type, reservations.vehicle_type,
--    pricing_rules.vehicle_type  ← corrigé : oubli initial
-- 4. Suppression de l'ancien type enum public.vehicle_type
--
-- La migration est idempotente (IF NOT EXISTS, ON CONFLICT, checks DO $$).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Table vehicle_types ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicle_types (
  id                  UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  code                TEXT          NOT NULL UNIQUE,
  label               TEXT          NOT NULL,
  description         TEXT,
  capacity            INTEGER       NOT NULL CHECK (capacity > 0),
  icon                TEXT,
  base_price_france   NUMERIC(10,2) NOT NULL CHECK (base_price_france >= 0),
  base_price_senegal  NUMERIC(10,0) NOT NULL CHECK (base_price_senegal >= 0),
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  sort_order          INTEGER       NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_vehicle_types ON public.vehicle_types;
CREATE TRIGGER set_updated_at_vehicle_types
  BEFORE UPDATE ON public.vehicle_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Seed des 3 types existants ─────────────────────────────────────────────

INSERT INTO public.vehicle_types (code, label, description, capacity, icon, base_price_france, base_price_senegal, sort_order)
VALUES
  ('standard', 'Économique',  '1-3 passagers • Compacte',  3, 'car-outline',       12.50, 3000, 1),
  ('berline',  'Confort',     '1-4 passagers • Berline',   4, 'car-sport-outline', 18.00, 5000, 2),
  ('van',      'Van',         '1-7 passagers • Familial',  7, 'bus-outline',       35.00, 9000, 3)
ON CONFLICT (code) DO NOTHING;

-- ── 3. Migration enum → TEXT (idempotent) ─────────────────────────────────────
-- Chaque ALTER est protégé : ne s'exécute que si la colonne est encore un enum.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vehicles'
      AND column_name = 'type' AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.vehicles ALTER COLUMN type TYPE TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'drivers'
      AND column_name = 'vehicle_type' AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.drivers ALTER COLUMN vehicle_type TYPE TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations'
      AND column_name = 'vehicle_type' AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.reservations ALTER COLUMN vehicle_type TYPE TEXT;
  END IF;
END $$;

-- Colonne oubliée dans la version initiale — pricing_rules.vehicle_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pricing_rules'
      AND column_name = 'vehicle_type' AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.pricing_rules ALTER COLUMN vehicle_type TYPE TEXT;
  END IF;
END $$;

-- ── 4. Suppression de l'ancien type enum ─────────────────────────────────────
-- CASCADE au cas où une dépendance résiduelle existerait encore.

DROP TYPE IF EXISTS public.vehicle_type CASCADE;
