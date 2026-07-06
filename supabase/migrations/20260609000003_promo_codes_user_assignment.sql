-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION : Assignation de codes promo par utilisateur
-- Sprint 6 — EasyVTC
--
-- Objectif : permettre à l'admin de générer des codes promo uniques par utilisateur
-- à partir d'un radical (base lisible humainement).
-- Un code sans assigned_user_id reste un code public utilisable par tous.
-- ══════════════════════════════════════════════════════════════════════════════

-- Ajout des deux colonnes
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS code_radical     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Index unique : un seul code assigné par (radical, utilisateur)
-- Garantit qu'un admin ne peut pas assigner deux fois le même radical au même user
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_radical_user
  ON public.promo_codes(code_radical, assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

-- Index partiel sur assigned_user_id pour les requêtes de liste par utilisateur
CREATE INDEX IF NOT EXISTS idx_promo_codes_assigned_user
  ON public.promo_codes(assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

COMMENT ON COLUMN public.promo_codes.code_radical IS
  'Radical lisible défini par l''admin (ex: NOEL2026). Le code final = radical + "-" + suffixe aléatoire.';

COMMENT ON COLUMN public.promo_codes.assigned_user_id IS
  'Si renseigné, le code est réservé exclusivement à cet utilisateur. NULL = code public.';
