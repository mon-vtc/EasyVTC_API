-- Ajout de la colonne discount_amount sur la table invoices
-- Stocke le montant TTC de la remise appliquée (code promo) au moment de la génération
-- null si aucun code promo n'a été utilisé sur la réservation correspondante

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2);
