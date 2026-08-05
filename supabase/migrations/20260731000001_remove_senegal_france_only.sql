-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : Plateforme limitée à la France — suppression de la dimension pays
-- Sprint 7 — EasyVTC
--
-- EasyVTC ne cible plus que la France. Cette migration retire tout ce qui
-- encodait un choix de pays/zone (France vs Sénégal) ou une devise alternative
-- (XOF), qui n'avait plus aucune signification fonctionnelle depuis que le
-- code applicatif ne travaille plus qu'en France / EUR.
--
--   1. Suppression des données Sénégal restantes (commission_settings)
--   2. Suppression de la colonne vehicle_types.base_price_senegal
--   3. Suppression des colonnes zone/country (drivers, pricing_grids,
--      pricing_flat_rates, reservations, commission_settings, commissions)
--   4. Suppression des colonnes currency devenues inutiles (toujours 'EUR')
--   5. Suppression de la table pricing_rules (obsolète, non utilisée par le code)
--   6. Suppression du type enum public.zone_type
--   7. Adaptation des index dépendants
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Purge des données Sénégal restantes ────────────────────────────────────

DELETE FROM public.commission_settings WHERE zone = 'senegal';

-- ── 2. vehicle_types — suppression de base_price_senegal ──────────────────────

ALTER TABLE public.vehicle_types DROP COLUMN IF EXISTS base_price_senegal;

-- ── 3. Suppression de la table pricing_rules (legacy, jamais lue par l'API) ───

DROP TABLE IF EXISTS public.pricing_rules;

-- ── 4. drivers — suppression de la colonne zone ────────────────────────────────
-- N'a jamais servi qu'à déterminer le pays (fuseau horaire figé sur Europe/Paris
-- désormais en dur côté service).

ALTER TABLE public.drivers DROP COLUMN IF EXISTS zone;

-- ── 5. pricing_grids — suppression de country et currency ─────────────────────

DROP INDEX IF EXISTS idx_pricing_grids_country_active;
ALTER TABLE public.pricing_grids DROP COLUMN IF EXISTS country;
ALTER TABLE public.pricing_grids DROP COLUMN IF EXISTS currency;
CREATE INDEX IF NOT EXISTS idx_pricing_grids_active ON public.pricing_grids (is_active);

-- ── 6. pricing_flat_rates — suppression de country et currency ────────────────

DROP INDEX IF EXISTS idx_pricing_flat_rates_country_active;
ALTER TABLE public.pricing_flat_rates DROP COLUMN IF EXISTS country;
ALTER TABLE public.pricing_flat_rates DROP COLUMN IF EXISTS currency;
CREATE INDEX IF NOT EXISTS idx_pricing_flat_rates_active ON public.pricing_flat_rates (is_active);

-- ── 7. reservations — suppression de country ───────────────────────────────────

DROP INDEX IF EXISTS idx_reservations_country;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS country;

-- ── 8. commission_settings — suppression de zone ────────────────────────────────
-- L'unicité portait sur (zone, vehicle_type) ; une seule zone restante ⇒
-- l'unicité doit maintenant porter uniquement sur vehicle_type.

DROP INDEX IF EXISTS idx_commission_settings_unique_active;
DROP INDEX IF EXISTS idx_commission_settings_zone;
ALTER TABLE public.commission_settings DROP COLUMN IF EXISTS zone;
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_settings_unique_active
  ON public.commission_settings (COALESCE(vehicle_type, '__ALL__'))
  WHERE is_active = true;

-- ── 9. commissions — suppression de zone et currency ────────────────────────────

DROP INDEX IF EXISTS idx_commissions_zone;
ALTER TABLE public.commissions DROP COLUMN IF EXISTS zone;
ALTER TABLE public.commissions DROP COLUMN IF EXISTS currency;

-- ── 10. Suppression du type enum public.zone_type ───────────────────────────────
-- Plus aucune colonne ne le référence à ce stade.

DROP TYPE IF EXISTS public.zone_type;
