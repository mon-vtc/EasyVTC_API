-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : autorise un prix par minute à 0
--
-- Besoin métier : le gestionnaire veut pouvoir tarifer au kilomètre seulement.
-- La contrainte d'origine exigeait price_per_min > 0 ("Données invalides" à
-- l'enregistrement de la grille avec 0).
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.pricing_grids
  drop constraint if exists pricing_grids_price_per_min_check;

alter table public.pricing_grids
  add constraint pricing_grids_price_per_min_check check (price_per_min >= 0);
