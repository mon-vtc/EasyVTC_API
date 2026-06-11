-- Sprint 6 — Nom et description des codes promo
-- Permettent d'afficher un titre lisible et une description sur l'écran client "Codes promo"
-- (ex : titre "Bienvenue", description "20% de réduction sur votre première course")

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS name        TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.promo_codes.name        IS 'Titre affiché sur la carte promo côté client (ex : "Bienvenue"). Optionnel.';
COMMENT ON COLUMN public.promo_codes.description IS 'Description courte affichée sous le titre (ex : "20% sur votre première course"). Optionnel.';
