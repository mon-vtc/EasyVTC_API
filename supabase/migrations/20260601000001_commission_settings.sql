-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : Commission Settings + Commissions
-- Sprint 6 — EasyVTC
--
-- Tables créées :
--   public.commission_settings  → paramétrage des taux par zone/type véhicule
--   public.commissions          → enregistrement de la commission par course terminée
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Table commission_settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_settings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT        NOT NULL,
  zone         zone_type   NOT NULL,
  -- NULL = s'applique à tous les types de véhicule pour cette zone
  vehicle_type TEXT        DEFAULT NULL,
  -- 'percentage' : rate_value = pourcentage (ex: 15.00 → 15 %)
  -- 'flat'       : rate_value = montant fixe en devise de la zone (EUR/XOF)
  rate_type    TEXT        NOT NULL CHECK (rate_type IN ('percentage', 'flat')),
  rate_value   NUMERIC(10, 2) NOT NULL CHECK (rate_value >= 0),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contrainte : un seul taux actif par (zone, vehicle_type) — NULL traité comme valeur unique
CREATE UNIQUE INDEX idx_commission_settings_unique_active
  ON public.commission_settings (zone, COALESCE(vehicle_type, '__ALL__'))
  WHERE is_active = true;

CREATE INDEX idx_commission_settings_zone     ON public.commission_settings(zone);
CREATE INDEX idx_commission_settings_active   ON public.commission_settings(is_active);

CREATE TRIGGER set_updated_at_commission_settings
  BEFORE UPDATE ON public.commission_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Table commissions ─────────────────────────────────────────────────────────
-- Enregistre la commission calculée pour chaque course terminée.
-- Immuable après création (snapshot des taux au moment de la clôture).
CREATE TABLE IF NOT EXISTS public.commissions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id         UUID        NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE RESTRICT,
  driver_id              UUID        NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  -- Référence au paramétrage utilisé (peut être NULL si aucun taux configuré)
  commission_setting_id  UUID        REFERENCES public.commission_settings(id) ON DELETE SET NULL,
  zone                   zone_type   NOT NULL,
  rate_type              TEXT        NOT NULL CHECK (rate_type IN ('percentage', 'flat', 'none')),
  rate_value             NUMERIC(10, 2) NOT NULL DEFAULT 0,
  -- Montants snapshot
  gross_amount           NUMERIC(10, 2) NOT NULL,   -- ce que le client a payé
  commission_amount      NUMERIC(10, 2) NOT NULL,   -- part de la plateforme
  driver_net_amount      NUMERIC(10, 2) NOT NULL,   -- ce que le chauffeur perçoit
  currency               TEXT        NOT NULL DEFAULT 'EUR',
  calculated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_driver_id      ON public.commissions(driver_id);
CREATE INDEX idx_commissions_reservation_id ON public.commissions(reservation_id);
CREATE INDEX idx_commissions_zone           ON public.commissions(zone);
CREATE INDEX idx_commissions_calculated_at  ON public.commissions(calculated_at DESC);

-- ── Données initiales — taux de base (désactivés, à activer via l'admin) ──────
INSERT INTO public.commission_settings (label, zone, vehicle_type, rate_type, rate_value, is_active)
VALUES
  ('Commission standard France',            'france',  NULL,        'percentage', 15.00, false),
  ('Commission standard Sénégal',           'senegal', NULL,        'percentage', 12.00, false),
  ('Commission berline France (premium)',    'france',  'berline',   'percentage', 18.00, false),
  ('Commission van France (premium)',        'france',  'van',       'percentage', 18.00, false),
  ('Commission berline Sénégal (premium)',   'senegal', 'berline',   'percentage', 14.00, false),
  ('Commission fixe standard France',       'france',  NULL,        'flat',        5.00, false),
  ('Commission fixe standard Sénégal',      'senegal', NULL,        'flat',     2500.00, false);
