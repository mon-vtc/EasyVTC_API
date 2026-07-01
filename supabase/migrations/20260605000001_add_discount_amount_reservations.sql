-- Ajout de la colonne discount_amount sur la table reservations
-- Stocke le montant de la remise appliquée via code promo (null si aucun promo)

alter table public.reservations
  add column if not exists discount_amount numeric(10,2);
