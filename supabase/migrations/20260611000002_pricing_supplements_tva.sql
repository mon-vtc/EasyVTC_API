-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : Suppléments aéroport/nuit + TVA sur tarifs + TVA sur commissions
-- Sprint 7 — EazyVTC
--
-- Colonnes ajoutées :
--   pricing_grids        → tva_rate, airport_supplement, night_supplement_rate,
--                          night_start, night_end
--   commission_settings  → tva_rate
--   commissions          → commission_tva_amount, commission_ttc_amount
-- ══════════════════════════════════════════════════════════════════════════════

-- ── pricing_grids ─────────────────────────────────────────────────────────────
ALTER TABLE public.pricing_grids
  ADD COLUMN IF NOT EXISTS tva_rate              NUMERIC(5,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS airport_supplement    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_supplement_rate NUMERIC(5,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_start           TIME          NOT NULL DEFAULT '19:00:00',
  ADD COLUMN IF NOT EXISTS night_end             TIME          NOT NULL DEFAULT '07:00:00';

COMMENT ON COLUMN public.pricing_grids.tva_rate
  IS 'Taux TVA appliqué sur le tarif de la course (ex: 0.1 = 10 %). 0 = pas de TVA.';
COMMENT ON COLUMN public.pricing_grids.airport_supplement
  IS 'Supplément fixe (en devise locale) ajouté pour les trajets aéroport.';
COMMENT ON COLUMN public.pricing_grids.night_supplement_rate
  IS 'Taux supplément nocturne (ex: 0.15 = +15 % sur le montant HT). 0 = désactivé.';
COMMENT ON COLUMN public.pricing_grids.night_start
  IS 'Heure de début de la plage nocturne (ex: 19:00:00). Comparée en UTC.';
COMMENT ON COLUMN public.pricing_grids.night_end
  IS 'Heure de fin de la plage nocturne (ex: 07:00:00). Peut être < night_start (minuit franchi).';

-- ── commission_settings ───────────────────────────────────────────────────────
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS tva_rate NUMERIC(5,4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.commission_settings.tva_rate
  IS 'Taux TVA sur la commission plateforme (ex: 0.20 = 20 %). 0 = pas de TVA.';

-- ── commissions ───────────────────────────────────────────────────────────────
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS commission_tva_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_ttc_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.commissions.commission_tva_amount
  IS 'TVA sur la commission (snapshot au moment de la clôture). 0 si tva_rate = 0.';
COMMENT ON COLUMN public.commissions.commission_ttc_amount
  IS 'Commission TTC = commission_amount + commission_tva_amount.';
