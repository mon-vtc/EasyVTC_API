-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION : Sécurité avancée des codes promo
-- Sprint 6 — EasyVTC
--
-- Ajouts :
--   max_uses_per_user  → limite le nombre de fois qu'un même client peut utiliser
--                        un code public (sans affecter les codes assignés qui ont
--                        déjà max_uses=1 par défaut).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS max_uses_per_user INT
    CHECK (max_uses_per_user IS NULL OR max_uses_per_user >= 1);

COMMENT ON COLUMN public.promo_codes.max_uses_per_user IS
  'Nombre maximum d''utilisations par utilisateur distinct. NULL = illimité par utilisateur. '
  'S''applique aux codes publics ; les codes assignés (assigned_user_id) ont max_uses=1 par défaut.';
