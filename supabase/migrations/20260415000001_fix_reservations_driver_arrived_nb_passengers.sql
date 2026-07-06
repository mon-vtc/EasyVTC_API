-- ══════════════════════════════════════════════════════════════════════════════
-- Migration : ajout du statut driver_arrived + colonne nb_passengers
-- Sprint 3 — EasyVTC
--
-- Contexte :
--   1. Le statut `driver_arrived` existait uniquement en UI mobile (côté client),
--      sans jamais changer le status en base. L'admin voyait toujours `assigned`
--      alors que le chauffeur était déjà sur place. On l'officialise en DB.
--
--   2. Le champ `nb_passengers` était collecté dans le formulaire mobile
--      (étape 2) mais absent de la table, causant une perte silencieuse de donnée.
--      On ajoute la colonne avec une contrainte de range réaliste.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Ajouter la valeur driver_arrived à l'enum reservation_status
--    (positionnée entre assigned et in_progress)
alter type public.reservation_status add value if not exists 'driver_arrived' after 'assigned';

-- 2. Ajouter nb_passengers à la table reservations
alter table public.reservations
  add column if not exists nb_passengers smallint not null default 1;

alter table public.reservations
  add constraint reservations_nb_passengers_check
  check (nb_passengers >= 1 and nb_passengers <= 20);

comment on column public.reservations.nb_passengers is
  'Nombre de passagers déclaré par le client à la réservation (min 1, max 20).';
