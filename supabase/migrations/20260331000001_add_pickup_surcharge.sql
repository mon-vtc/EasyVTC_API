-- ============================================================================
-- Migration — EasyVTC
-- Date: 2026-03-31
-- Description:
--   Ajout de la colonne pickup_surcharge sur pricing_flat_rates.
--   Permet de configurer une surcharge par passager supplémentaire sur les
--   forfaits itinéraires (ex: Massy → Orly +10€ par pick-up additionnel).
-- ============================================================================

ALTER TABLE public.pricing_flat_rates
  ADD COLUMN IF NOT EXISTS pickup_surcharge numeric(10,2) NOT NULL DEFAULT 0
    CHECK (pickup_surcharge >= 0);

COMMENT ON COLUMN public.pricing_flat_rates.pickup_surcharge IS
  'Surcharge par passager supplémentaire (pick-up). 0 = pas de surcharge. Ex: 10.00 pour +10€/passager supp.';
