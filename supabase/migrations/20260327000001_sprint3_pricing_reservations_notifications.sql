-- ============================================================================
-- Migration Sprint 3 — EasyVTC
-- Date: 2026-03-27
-- Description:
--   1. Tables pricing_grids et pricing_flat_rates (absentes du schéma initial)
--   2. Champs supplémentaires sur reservations (country, pricing_type,
--      flat_rate_id, price_breakdown)
--   3. Champs supplémentaires sur notifications (read_at, data)
--   4. Nouveau type de notification : reservation_cancelled
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. TABLES PRICING (manquantes dans init_easyvtc_core)
-- ══════════════════════════════════════════════════════════════════════════════

-- Grilles tarifaires : formule base + km + min, une seule active par pays
CREATE TABLE IF NOT EXISTS public.pricing_grids (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  country       public.zone_type NOT NULL,
  base_price    numeric(10,2) NOT NULL CHECK (base_price > 0),
  price_per_km  numeric(10,4) NOT NULL CHECK (price_per_km > 0),
  price_per_min numeric(10,4) NOT NULL CHECK (price_per_min > 0),
  minimum_price numeric(10,2) NOT NULL CHECK (minimum_price > 0),
  currency      text          NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR', 'XOF')),
  is_active     boolean       NOT NULL DEFAULT true,
  created_by    uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

-- Forfaits itinéraires : prix fixe pour un trajet prédéfini
CREATE TABLE IF NOT EXISTS public.pricing_flat_rates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country           public.zone_type NOT NULL,
  label             text        NOT NULL,
  origin_label      text        NOT NULL,
  destination_label text        NOT NULL,
  price             numeric(10,2) NOT NULL CHECK (price > 0),
  currency          text        NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR', 'XOF')),
  is_active         boolean     NOT NULL DEFAULT true,
  created_by        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Triggers updated_at
DROP TRIGGER IF EXISTS trg_pricing_grids_updated_at ON public.pricing_grids;
CREATE TRIGGER trg_pricing_grids_updated_at
  BEFORE UPDATE ON public.pricing_grids
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pricing_flat_rates_updated_at ON public.pricing_flat_rates;
CREATE TRIGGER trg_pricing_flat_rates_updated_at
  BEFORE UPDATE ON public.pricing_flat_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index pour les requêtes les plus fréquentes
CREATE INDEX IF NOT EXISTS idx_pricing_grids_country_active
  ON public.pricing_grids (country, is_active);

CREATE INDEX IF NOT EXISTS idx_pricing_flat_rates_country_active
  ON public.pricing_flat_rates (country, is_active);

-- RLS (les requêtes serveur passent par service_role — bypass automatique)
ALTER TABLE public.pricing_grids      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_flat_rates ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CHAMPS SUPPLÉMENTAIRES — TABLE RESERVATIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- Pays de la course (détermine quelle grille tarifaire appliquer)
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS country public.zone_type NOT NULL DEFAULT 'france';

-- Type de tarification utilisé lors de la création
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS pricing_type public.pricing_type;

-- Forfait itinéraire utilisé (si pricing_type = 'flat_rate')
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS flat_rate_id uuid REFERENCES public.pricing_flat_rates(id) ON DELETE SET NULL;

-- Détail interne du calcul (jamais affiché côté client ni sur les documents)
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS price_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Horodatage arrivée chauffeur au point de pickup
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS driver_arrived_at timestamptz;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. CHAMPS SUPPLÉMENTAIRES — TABLE NOTIFICATIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- Horodatage de lecture (null = non lu)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Données contextuelles (ex: { "reservation_id": "...", "driver_name": "..." })
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS data jsonb;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. NOUVEAU TYPE DE NOTIFICATION
-- ══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'reservation_cancelled';
EXCEPTION WHEN others THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. INDEX SUPPLÉMENTAIRES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_country
  ON public.reservations (country);

COMMENT ON COLUMN public.reservations.price_breakdown IS
  'Détail interne du calcul tarifaire. Ne jamais exposer sur les documents client.';

COMMENT ON COLUMN public.notifications.data IS
  'Payload JSON envoyé avec la notification push (ex: reservation_id, driver_name).';
